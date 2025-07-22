const { createTestClient } = require('../utils/websocket-utils');

describe('Basic Server Functionality', () => {
  let server;
  let serverPort;

  beforeEach(async () => {
    server = await global.testUtils.createTestServer();
    await server.start();
    serverPort = server.server.address().port;
    await global.testUtils.waitForServer(serverPort);
  });

  afterEach(async () => {
    await global.testUtils.cleanupTestServer(server);
  });

  describe('WebSocket Connection', () => {
    test('should establish WebSocket connection', async () => {
      const client = createTestClient(serverPort);
      await client.connect();
      
      expect(client.connected).toBe(true);
      expect(client.connectionId).toBeDefined();
      
      await client.close();
    });

    test('should handle browser connection', async () => {
      const client = createTestClient(serverPort);
      await client.connect();
      
      // Wait for connection_init from server
      await client.waitForMessage(msg => msg.type === 'connection_init', 3000);
      
      const connectMessage = {
        type: 'browser_connect',
        userId: 'test-user'
      };
      
      client.send(connectMessage);
      
      // Check for error first to debug
      const messages = await Promise.race([
        client.waitForMessage(msg => msg.type === 'connection_ack', 5000),
        client.waitForMessage(msg => msg.type === 'error', 5000).then(error => {
          console.log('Received error:', error.payload.message);
          throw new Error(`Expected connection_ack but got error: ${error.payload.message}`);
        })
      ]);
      
      expect(messages.status).toBe('connected');
      expect(messages.role).toBe('browser');
      
      await client.close();
    });

    test('should handle ping/pong', async () => {
      const client = createTestClient(serverPort);
      await client.connect();
      
      // Wait for connection_init from server
      await client.waitForMessage(msg => msg.type === 'connection_init', 3000);
      
      const pingMessage = {
        type: 'ping',
        payload: { test: 'data' }
      };
      
      client.send(pingMessage);
      
      // Check for error first to debug
      const response = await Promise.race([
        client.waitForMessage(msg => msg.type === 'pong', 5000),
        client.waitForMessage(msg => msg.type === 'error', 5000).then(error => {
          console.log('Received error:', error.payload.message);
          throw new Error(`Expected pong but got error: ${error.payload.message}`);
        })
      ]);
      
      expect(response.payload.test).toBe('data');
      expect(response.timestamp).toBeDefined();
      
      await client.close();
    });
  });

  describe('HTTP Endpoints', () => {
    test('should respond to health endpoint', async () => {
      const response = await fetch(`http://localhost:${serverPort}/web-ide-bridge/health`);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.status).toBe('healthy');
      expect(data.version).toBe('0.1.3');
    });

    test('should respond to status endpoint with JSON for API calls', async () => {
      const response = await fetch(`http://localhost:${serverPort}/web-ide-bridge/status`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'node-fetch'
        }
      });
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.active).toBe(true);
      expect(data.version).toBe('0.1.3');
      expect(data.connections).toBeDefined();
      expect(data.sessions).toBeDefined();
      expect(data.metrics).toBeDefined();
    });

    test('should respond to debug endpoint in test environment', async () => {
      const response = await fetch(`http://localhost:${serverPort}/web-ide-bridge/debug`);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data).toHaveProperty('browserConnections');
      expect(data).toHaveProperty('desktopConnections');
      expect(data).toHaveProperty('userSessions');
      expect(data).toHaveProperty('activeSessions');
      expect(data).toHaveProperty('config');
    });
  });

  describe('Message Validation', () => {
    test('should reject invalid message format', async () => {
      const client = createTestClient(serverPort);
      await client.connect();
      
      // Send invalid message
      client.ws.send('not json');
      
      const error = await client.waitForMessage(msg => msg.type === 'error');
      expect(error.payload.message).toContain('Invalid JSON');
      
      await client.close();
    });

    test('should reject message without type', async () => {
      const client = createTestClient(serverPort);
      await client.connect();
      
      const invalidMessage = {
        userId: 'test-user'
        // Missing type and connectionId will be auto-added
      };
      
      client.send(invalidMessage);
      
      const error = await client.waitForMessage(msg => msg.type === 'error');
      expect(error.payload.message).toContain('Message must have a string type field');
      
      await client.close();
    });
  });

  describe('Debug Connection Issues', () => {
    test('should debug browser connection errors', async () => {
      const client = createTestClient(serverPort);
      await client.connect();
      
      // Log the connectionId being used
      console.log('Client connectionId:', client.connectionId);
      
      const connectMessage = {
        type: 'browser_connect',
        connectionId: client.connectionId, // Explicitly set
        userId: 'debug-user'
      };
      
      client.send(connectMessage);
      
      // Wait for any response and log it
      const response = await client.waitForMessage(msg => true, 3000);
      console.log('First response:', response);
      
      if (response.type === 'error') {
        console.log('Error details:', response.payload);
        
        // Try to understand what connectionId the server expects
        console.log('Server expected connectionId vs client connectionId');
        
        // Get all error messages for context
        const allMessages = client.getMessages();
        console.log('All messages received:', allMessages);
      }
      
      await client.close();
    });
  });
});
