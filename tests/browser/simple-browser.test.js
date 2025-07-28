/**
 * Simple Browser Tests
 * Tests for Web-IDE-Bridge browser library using our custom test runner
 */

// Load the test runner
require('./browser-test-runner.js');

describe('WebIdeBridge Browser Library', () => {
  let client;
  let mockWs;

  beforeEach(() => {
    // Reset WebSocket mock
    global.WebSocket.prototype.sentMessages = [];
    client = new WebIdeBridge('test-user', {
      serverUrl: 'ws://localhost:8071/web-ide-bridge/ws',
      debug: false // Disable debug for cleaner test output
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
      expect(() => new WebIdeBridge()).toThrow('userId is required');
      expect(() => new WebIdeBridge(null)).toThrow('userId is required');
      expect(() => new WebIdeBridge(123)).toThrow('userId is required');
    });

    test('should throw error for invalid server URL', () => {
      expect(() => new WebIdeBridge('test-user', {
        serverUrl: 'http://localhost:8071'
      })).toThrow('Invalid server URL format');
    });
  });

  describe('Message Handling', () => {
    test('should handle code updates with flattened payload', () => {
      let receivedSnippetId = null;
      let receivedCode = null;

      client.onCodeUpdate((snippetId, code) => {
        receivedSnippetId = snippetId;
        receivedCode = code;
      });

      // Mock _sendMessage to avoid WebSocket connection requirement
      const originalSendMessage = client._sendMessage;
      client._sendMessage = () => {}; // No-op mock

      // Simulate code update with flattened payload
      client._handleCodeUpdate({
        snippetId: 'test-snippet',
        code: 'updated code'
      });

      expect(receivedSnippetId).toBe('test-snippet');
      expect(receivedCode).toBe('updated code');

      // Restore original method
      client._sendMessage = originalSendMessage;
    });

    test('should handle error messages with flattened payload', () => {
      let receivedError = null;

      client.onError((error) => {
        receivedError = error;
      });

      // Simulate error message with flattened payload
      client._handleServerError({
        message: 'Test error message'
      });

      expect(receivedError).toBe('Test error message');
    });
  });

  describe('Status Management', () => {
    test('should handle status updates', () => {
      let statusReceived = null;

      client.onStatusChange((status) => {
        statusReceived = status;
      });

      // Simulate status update
      client._handleStatusUpdate({
        desktopConnected: true
      });

      expect(statusReceived).toBeDefined();
      expect(statusReceived.desktopConnected).toBe(true);
    });
  });
});

// Run the tests
const { runTests } = require('./browser-test-runner.js');
runTests(); 