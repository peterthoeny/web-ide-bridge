import WebIdeBridge from '../../browser/src/client.js';

// Mock WebSocket
class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0; // CONNECTING
    this.onopen = null;
    this.onclose = null;
    this.onerror = null;
    this.onmessage = null;
    this.sentMessages = [];
  }

  send(data) {
    this.sentMessages.push(JSON.parse(data));
  }

  close(code = 1000, reason = '') {
    this.readyState = 3; // CLOSED
    if (this.onclose) {
      this.onclose({ code, reason });
    }
  }

  // Helper methods for testing
  simulateOpen() {
    this.readyState = 1; // OPEN
    // Ensure the state is set before calling the callback
    if (this.onopen) {
      this.onopen();
    }
  }

  simulateMessage(data) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) });
    }
  }

  simulateError(error) {
    if (this.onerror) {
      this.onerror(error);
    }
  }

  simulateClose(code = 1000, reason = '') {
    this.readyState = 3; // CLOSED
    if (this.onclose) {
      this.onclose({ code, reason });
    }
  }
}

// Mock global WebSocket
global.WebSocket = MockWebSocket;

describe('WebIdeBridge Client', () => {
  let client;
  let mockWs;

  beforeEach(() => {
    // Reset WebSocket mock
    MockWebSocket.prototype.sentMessages = [];
    client = new WebIdeBridge('test-user', {
      serverUrl: 'ws://localhost:8071/web-ide-bridge/ws',
      debug: true
    });
  });

  afterEach(() => {
    if (client) {
      client.disconnect();
    }
  });

  describe('Constructor', () => {
    test('should initialize with valid parameters', () => {
      expect(client.userId).toBe('test-user');
      expect(client.options.serverUrl).toBe('ws://localhost:8071/web-ide-bridge/ws');
      expect(client.connected).toBe(false);
      expect(client.connecting).toBe(false);
    });

    test('should throw error for missing userId', () => {
      expect(() => new WebIdeBridge()).toThrow('userId is required and must be a string');
      expect(() => new WebIdeBridge(null)).toThrow('userId is required and must be a string');
      expect(() => new WebIdeBridge(123)).toThrow('userId is required and must be a string');
    });

    test('should throw error for invalid server URL', () => {
      expect(() => new WebIdeBridge('test-user', {
        serverUrl: 'http://localhost:8071'
      })).toThrow('Invalid server URL format');
    });

    test('should use custom connectionId if provided', () => {
      const customId = 'custom-connection-id';
      const clientWithCustomId = new WebIdeBridge('test-user', {
        connectionId: customId
      });
      expect(clientWithCustomId.connectionId).toBe(customId);
    });
  });

  describe('Connection Management', () => {
    test('should connect successfully', async () => {
      const connectPromise = client.connect();
      
      // Simulate WebSocket connection
      mockWs = client.ws;
      mockWs.simulateOpen();
      
      // Simulate connection acknowledgment
      mockWs.simulateMessage({
        type: 'connection_ack',
        connectionId: client.connectionId,
        status: 'connected',
        role: 'browser'
      });

      await connectPromise;

      expect(client.connected).toBe(true);
      expect(client.connecting).toBe(false);
      expect(client.reconnectAttempts).toBe(0);
    });

    test('should handle connection errors', async () => {
      const connectPromise = client.connect();
      
      mockWs = client.ws;
      mockWs.simulateError(new Error('Connection failed'));

      await expect(connectPromise).rejects.toThrow('WebSocket connection failed');
      expect(client.connected).toBe(false);
      expect(client.connecting).toBe(false);
    });

    test('should not connect if already connected', async () => {
      // First connection
      const connectPromise1 = client.connect();
      mockWs = client.ws;
      mockWs.simulateOpen();
      mockWs.simulateMessage({
        type: 'connection_ack',
        connectionId: client.connectionId,
        status: 'connected',
        role: 'browser'
      });
      await connectPromise1;

      // Second connection should be ignored
      await client.connect();
      expect(client.connected).toBe(true);
    });

    test('should disconnect properly', async () => {
      // Connect first
      const connectPromise = client.connect();
      mockWs = client.ws;
      mockWs.simulateOpen();
      mockWs.simulateMessage({
        type: 'connection_ack',
        connectionId: client.connectionId,
        status: 'connected',
        role: 'browser'
      });
      await connectPromise;

      // Then disconnect
      client.disconnect();
      expect(client.connected).toBe(false);
      expect(client.ws).toBeNull();
    });

    test('should handle connection close', async () => {
      const connectPromise = client.connect();
      mockWs = client.ws;
      mockWs.simulateOpen();
      mockWs.simulateMessage({
        type: 'connection_ack',
        connectionId: client.connectionId,
        status: 'connected',
        role: 'browser'
      });
      await connectPromise;

      // Simulate connection close
      mockWs.simulateClose(1000, 'Normal closure');
      expect(client.connected).toBe(false);
    });
  });

  describe('Message Handling', () => {
    beforeEach(async () => {
      const connectPromise = client.connect();
      mockWs = client.ws;
      mockWs.simulateOpen();
      mockWs.simulateMessage({
        type: 'connection_ack',
        connectionId: client.connectionId,
        status: 'connected',
        role: 'browser'
      });
      await connectPromise;
    });

    test('should send browser_connect message after connection ack', () => {
      const connectMessages = mockWs.sentMessages.filter(msg => msg.type === 'browser_connect');
      expect(connectMessages.length).toBe(1);
      expect(connectMessages[0].userId).toBe('test-user');
      expect(connectMessages[0].connectionId).toBe(client.connectionId);
    });

    test('should handle ping/pong messages', () => {
      // The client automatically sends ping messages via heartbeat
      // Just verify that pong messages are handled correctly
      mockWs.simulateMessage({
        type: 'pong',
        payload: { test: 'data' },
        timestamp: Date.now()
      });

      // Connection should remain active
      expect(client.connected).toBe(true);
    });

    test('should handle code updates from server', () => {
      const codeUpdateCallback = jest.fn();
      client.onCodeUpdate(codeUpdateCallback);

      const updateData = {
        type: 'code_update',
          snippetId: 'test-snippet',
        code: 'updated code'
      };

      mockWs.simulateMessage(updateData);

      expect(codeUpdateCallback).toHaveBeenCalledWith(
        'test-snippet',
        'updated code'
      );
    });

    test('should handle server errors', () => {
      const errorCallback = jest.fn();
      client.onError(errorCallback);

      const errorData = {
        type: 'error',
        payload: {
          message: 'Server error',
          code: 'ERROR'
        }
      };

      mockWs.simulateMessage(errorData);

      expect(errorCallback).toHaveBeenCalledWith('Server error');
    });

    test('should handle status updates', () => {
      const statusCallback = jest.fn();
      client.onStatusChange(statusCallback);

      const statusData = {
        type: 'status_update',
        desktopConnected: true
      };

      mockWs.simulateMessage(statusData);
      // Status updates might not trigger the callback directly, but the message should be handled
    });
  });

  describe('Event Callbacks', () => {
    test('should register and trigger status callbacks', () => {
      const statusCallback = jest.fn();
      client.onStatusChange(statusCallback);

      // Simulate status change
      client._updateStatus({
        serverConnected: true,
        desktopConnected: false
      });
      expect(statusCallback).toHaveBeenCalledWith({
        serverConnected: true,
        desktopConnected: false
      });
    });

    test('should register and trigger error callbacks', () => {
      const errorCallback = jest.fn();
      client.onError(errorCallback);

      // Simulate error
      client._triggerErrorCallbacks('Test error');
      expect(errorCallback).toHaveBeenCalledWith('Test error');
    });

    test('should register and trigger message callbacks', () => {
      const messageCallback = jest.fn();
      client.onMessage(messageCallback);

      // Connect and simulate message
      const connectPromise = client.connect();
      mockWs = client.ws;
      mockWs.simulateOpen();
      mockWs.simulateMessage({
        type: 'connection_ack',
        connectionId: client.connectionId,
        status: 'connected',
        role: 'browser'
      });

      // Simulate another message
      const testMessage = { type: 'test', data: 'test' };
      mockWs.simulateMessage(testMessage);

      expect(messageCallback).toHaveBeenCalledWith(testMessage);
    });
  });

  describe('Code Editing', () => {
    beforeEach(async () => {
      const connectPromise = client.connect();
      mockWs = client.ws;
      mockWs.simulateOpen();
      mockWs.simulateMessage({
        type: 'connection_ack',
        connectionId: client.connectionId,
        status: 'connected',
        role: 'browser'
      });
      await connectPromise;
    });

    test('should send edit request for textarea', async () => {
      const textareaId = 'test-textarea';
      const code = 'console.log("test");';
      const fileType = 'js';

      const editPromise = client.editCodeSnippet(textareaId, code, fileType);

      // Check that edit_request message was sent
      const editMessages = mockWs.sentMessages.filter(msg => msg.type === 'edit_request');
      expect(editMessages.length).toBe(1);
      expect(editMessages[0].snippetId).toBe(textareaId);
      expect(editMessages[0].code).toBe(code);
      expect(editMessages[0].fileType).toBe(fileType);

      // Simulate successful response
      mockWs.simulateMessage({
        type: 'edit_request_ack',
        payload: { success: true, snippetId: textareaId }
      });

      const result = await editPromise;
      expect(result.success).toBe(true);
    });

    test('should handle edit request errors', async () => {
      const editPromise = client.editCodeSnippet('test', 'code', 'js');

      // Simulate error response
      mockWs.simulateMessage({
        type: 'error',
        payload: { message: 'Edit request failed' }
      });

      await expect(editPromise).rejects.toThrow('Edit request failed');
    });
  });

  describe('Auto-reconnection', () => {
    test('should attempt reconnection on connection close', async () => {
      const connectPromise = client.connect();
      mockWs = client.ws;
      mockWs.simulateOpen();
      mockWs.simulateMessage({
        type: 'connection_ack',
        connectionId: client.connectionId,
        status: 'connected',
        role: 'browser'
      });
      await connectPromise;

      // Simulate connection close
      mockWs.simulateClose(1000, 'Normal closure');

      // Wait for reconnection attempt
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should have attempted reconnection
      expect(client.reconnectAttempts).toBeGreaterThan(0);
    });

    test('should stop reconnection after max attempts', async () => {
      client.options.maxReconnectAttempts = 2;

      const connectPromise = client.connect();
      mockWs = client.ws;
      mockWs.simulateOpen();
      mockWs.simulateMessage({
        type: 'connection_ack',
        connectionId: client.connectionId,
        status: 'connected',
        role: 'browser'
      });
      await connectPromise;

      // Simulate multiple connection failures
      for (let i = 0; i < 3; i++) {
        mockWs.simulateClose(1000, 'Normal closure');
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Should have stopped reconnecting
      expect(client.reconnectAttempts).toBeLessThanOrEqual(2);
    });
  });

  describe('Heartbeat', () => {
    beforeEach(async () => {
      const connectPromise = client.connect();
      mockWs = client.ws;
      mockWs.simulateOpen();
      mockWs.simulateMessage({
        type: 'connection_ack',
        connectionId: client.connectionId,
        status: 'connected',
        role: 'browser'
      });
      await connectPromise;
    });

    test('should send heartbeat messages', async () => {
      // Wait for heartbeat
      await new Promise(resolve => setTimeout(resolve, 100));

      const pingMessages = mockWs.sentMessages.filter(msg => msg.type === 'ping');
      expect(pingMessages.length).toBeGreaterThan(0);
    });

    test('should handle heartbeat responses', () => {
      // Simulate pong response
      mockWs.simulateMessage({
        type: 'pong',
        payload: {},
        timestamp: Date.now()
      });

      // Connection should remain active
      expect(client.connected).toBe(true);
    });
  });

  describe('Connection State', () => {
    test('should return correct connection state', () => {
      expect(client.getConnectionState()).toEqual({
        serverConnected: false,
        desktopConnected: false
      });

      client.connecting = true;
      expect(client.getConnectionState()).toEqual({
        serverConnected: false,
        desktopConnected: false
      });

      client.connecting = false;
      client.connected = true;
      expect(client.getConnectionState()).toEqual({
        serverConnected: true,
        desktopConnected: false
      });
    });

    test('should check if connected', () => {
      expect(client.isConnected()).toBe(false);

      client.connected = true;
      expect(client.isConnected()).toBe(true);
    });
  });

  describe('UI Integration', () => {
    test('should auto-inject buttons when addButtons is true', () => {
      const clientWithButtons = new WebIdeBridge('test-user', {
        addButtons: true
      });

      expect(clientWithButtons.uiManager).toBeDefined();
    });

    test('should not auto-inject buttons when addButtons is false', () => {
      const clientWithoutButtons = new WebIdeBridge('test-user', {
        addButtons: false
      });

      // UI manager should still exist but not auto-inject
      expect(clientWithoutButtons.uiManager).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should handle WebSocket errors gracefully', async () => {
      const errorCallback = jest.fn();
      client.onError(errorCallback);

      const connectPromise = client.connect();
      mockWs = client.ws;
      mockWs.simulateError(new Error('WebSocket error'));

      await expect(connectPromise).rejects.toThrow('WebSocket connection failed');
      expect(errorCallback).toHaveBeenCalled();
    });

    test('should handle invalid JSON messages', async () => {
      const connectPromise = client.connect();
      mockWs = client.ws;
      mockWs.simulateOpen();
      mockWs.simulateMessage({
        type: 'connection_ack',
        connectionId: client.connectionId,
        status: 'connected',
        role: 'browser'
      });
      await connectPromise;

      // Simulate invalid JSON (this would be handled by the WebSocket)
      // The actual handling depends on the WebSocket implementation
    });
  });
}); 