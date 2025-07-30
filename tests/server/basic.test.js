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

      const connectMessage = {
        type: 'browser_connect',
        connectionId: client.connectionId,
        userId: 'test-user'
      };

      client.send(connectMessage);

      const response = await client.waitForMessage(msg => msg.type === 'connection_ack', 5000);

      expect(response.status).toBe('connected');
      expect(response.role).toBe('browser');

      await client.close();
    });

    test('should handle ping/pong', async () => {
      const client = createTestClient(serverPort);
      await client.connect();

      const pingMessage = {
        type: 'ping',
        connectionId: client.connectionId,
        payload: { test: 'data' }
      };

      client.send(pingMessage);

      const response = await client.waitForMessage(msg => msg.type === 'pong', 5000);

      expect(response.payload.test).toBe('data');
      expect(response.timestamp).toBeDefined();

      await client.close();
    });

    test('should handle get_status message', async () => {
      const client = createTestClient(serverPort);
      await client.connect();

      const statusMessage = {
        type: 'get_status',
        connectionId: client.connectionId,
        timestamp: Date.now()
      };

      client.send(statusMessage);

      const response = await client.waitForMessage(msg => msg.type === 'status', 5000);

      expect(response.type).toBe('status');
      expect(response.data).toBeDefined();
      expect(response.data.connectionStatus).toBeDefined();
      expect(response.data.connections).toBeDefined();
      expect(response.data.sessions).toBeDefined();
      expect(response.data.performance).toBeDefined();
      expect(response.data.configuration).toBeDefined();
      expect(response.data.activityLog).toBeDefined();
      expect(response.timestamp).toBeDefined();

      await client.close();
    });

    test('should handle status_connect message', async () => {
      const client = createTestClient(serverPort);
      await client.connect();

      const statusConnectMessage = {
        type: 'status_connect',
        connectionId: client.connectionId,
        timestamp: Date.now()
      };

      client.send(statusConnectMessage);

      // Should receive initial status immediately
      const response = await client.waitForMessage(msg => msg.type === 'status', 5000);

      expect(response.type).toBe('status');
      expect(response.data).toBeDefined();
      expect(response.data.connectionStatus).toBeDefined();
      expect(response.data.connections).toBeDefined();
      expect(response.data.sessions).toBeDefined();
      expect(response.data.performance).toBeDefined();
      expect(response.data.configuration).toBeDefined();
      expect(response.data.activityLog).toBeDefined();
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
      expect(data.version).toBe('1.1.3');
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
      expect(data.version).toBe('1.1.3');
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
      expect(error.message).toContain('Invalid JSON');

      await client.close();
    });

    test('should reject message without type', async () => {
      const client = createTestClient(serverPort);
      await client.connect();

      // Send a message without type field (the test client won't auto-add it)
      const invalidMessage = {
        connectionId: client.connectionId,
        userId: 'test-user'
        // Missing type field
      };

      client.ws.send(JSON.stringify(invalidMessage));

      const error = await client.waitForMessage(msg => msg.type === 'error');
      expect(error.message).toContain('Message must have a string type field');

      await client.close();
    });

    test('should reject message without connectionId', async () => {
      const client = createTestClient(serverPort);
      await client.connect();

      // Send a message without connectionId field
      const invalidMessage = {
        type: 'browser_connect',
        userId: 'test-user'
        // Missing connectionId field
      };

      client.ws.send(JSON.stringify(invalidMessage));

      const error = await client.waitForMessage(msg => msg.type === 'error');
      expect(error.message).toContain('Message must have a string connectionId field');

      await client.close();
    });
  });

  describe('Debug Connection Issues', () => {
    test('should handle browser connection with proper validation', async () => {
      const client = createTestClient(serverPort);
      await client.connect();

      const connectMessage = {
        type: 'browser_connect',
        connectionId: client.connectionId,
        userId: 'debug-user'
      };

      client.send(connectMessage);

      const response = await client.waitForMessage(msg => msg.type === 'connection_ack', 5000);
      expect(response.status).toBe('connected');
      expect(response.role).toBe('browser');

      await client.close();
    });
  });
});
