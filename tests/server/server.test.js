// Import server from relative path (now we're in tests/server/)
const WebIdeBridgeServer = require('../../server/web-ide-bridge-server');
const { createTestClient, waitForWebSocketServer } = require('../utils/websocket-utils');

describe('WebIdeBridgeServer Core', () => {
  let server;
  let serverPort;

  beforeEach(async () => {
    server = await global.testUtils.createTestServer();
    await server.start();
    serverPort = server.server.address().port;
    
    // Wait for server to be ready
    await global.testUtils.waitForServer(serverPort);
  });

  afterEach(async () => {
    await global.testUtils.cleanupTestServer(server);
  });

  describe('Server Initialization', () => {
    test('should start server on random port', () => {
      expect(server.server.listening).toBe(true);
      expect(serverPort).toBeGreaterThan(0);
      expect(serverPort).toBeLessThan(65536);
    });

    test('should load test configuration correctly', () => {
      expect(server.config.server.port).toBe(0);
      expect(server.config.environment).toBe('test');
      expect(server.config.debug).toBe(false);
      expect(server.config.security.rateLimiting.enabled).toBe(false);
    });

    test('should initialize all connection maps', () => {
      expect(server.browserConnections).toBeInstanceOf(Map);
      expect(server.desktopConnections).toBeInstanceOf(Map);
      expect(server.userSessions).toBeInstanceOf(Map);
      expect(server.activeSessions).toBeInstanceOf(Map);
      
      // Should start empty
      expect(server.browserConnections.size).toBe(0);
      expect(server.desktopConnections.size).toBe(0);
      expect(server.userSessions.size).toBe(0);
      expect(server.activeSessions.size).toBe(0);
    });

    test('should initialize metrics correctly', () => {
      expect(server.metrics).toHaveProperty('totalConnections');
      expect(server.metrics).toHaveProperty('activeConnections');
      expect(server.metrics).toHaveProperty('totalSessions');
      expect(server.metrics).toHaveProperty('messagesProcessed');
      expect(server.metrics).toHaveProperty('errors');
      expect(server.metrics).toHaveProperty('startTime');
      
      expect(server.metrics.totalConnections).toBe(0);
      expect(server.metrics.activeConnections.browser).toBe(0);
      expect(server.metrics.activeConnections.desktop).toBe(0);
    });
  });

  describe('HTTP Endpoints', () => {
    test('should respond to health check endpoint', async () => {
      const response = await fetch(`http://localhost:${serverPort}/web-ide-bridge/health`);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.status).toBe('healthy');
      expect(data.version).toBe('1.1.1');
      expect(data.uptime).toBeGreaterThanOrEqual(0);
      expect(data.timestamp).toBeDefined();
    });

    test('should respond to status endpoint with metrics', async () => {
      // Make sure to request JSON explicitly
      const response = await fetch(`http://localhost:${serverPort}/web-ide-bridge/status`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'jest-test' // Indicates it's an API call
        }
      });
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.active).toBe(true);
      expect(data.version).toBe('1.1.1');
      expect(data.connections).toHaveProperty('browser');
      expect(data.connections).toHaveProperty('desktop');
      expect(data.connections).toHaveProperty('total');
      expect(data.sessions).toHaveProperty('users');
      expect(data.sessions).toHaveProperty('active');
      expect(data.sessions).toHaveProperty('total');
      expect(data.metrics).toHaveProperty('totalConnections');
      expect(data.metrics).toHaveProperty('messagesProcessed');
      expect(data.metrics).toHaveProperty('errors');
      expect(data.metrics).toHaveProperty('startTime');
    });

    test('should respond to debug endpoint in test mode', async () => {
      const response = await fetch(`http://localhost:${serverPort}/web-ide-bridge/debug`);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data).toHaveProperty('browserConnections');
      expect(data).toHaveProperty('desktopConnections');
      expect(data).toHaveProperty('userSessions');
      expect(data).toHaveProperty('activeSessions');
      expect(data).toHaveProperty('config');
      
      // Should be arrays initially
      expect(Array.isArray(data.browserConnections)).toBe(true);
      expect(Array.isArray(data.desktopConnections)).toBe(true);
      expect(Array.isArray(data.userSessions)).toBe(true);
      expect(Array.isArray(data.activeSessions)).toBe(true);
    });

    test('should return 404 for unknown endpoints', async () => {
      const response = await fetch(`http://localhost:${serverPort}/unknown-endpoint`);
      const data = await response.json();
      
      expect(response.status).toBe(404);
      expect(data.error).toBe('Not Found');
      expect(data.message).toContain('does not exist');
    });

    test('should handle CORS preflight requests', async () => {
      const response = await fetch(`http://localhost:${serverPort}/web-ide-bridge/health`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://localhost:3000',
          'Access-Control-Request-Method': 'GET'
        }
      });
      
      expect(response.status).toBe(204);
      expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
    });
  });

  describe('WebSocket Server Setup', () => {
    test('should accept WebSocket connections', async () => {
      const client = createTestClient(serverPort);
      await client.connect();
      
      expect(client.connected).toBe(true);
      await client.close();
    });

    test('should track new connections in metrics', async () => {
      const initialConnections = server.metrics.totalConnections;
      
      const client = createTestClient(serverPort);
      await client.connect();
      
      // Give server time to process connection
      await global.testUtils.sleep(50);
      
      expect(server.metrics.totalConnections).toBeGreaterThan(initialConnections);
      
      await client.close();
    });

    test('should handle multiple concurrent connections', async () => {
      const clients = [];
      const connectionCount = 5;
      
      // Connect multiple clients
      for (let i = 0; i < connectionCount; i++) {
        const client = createTestClient(serverPort);
        await client.connect();
        clients.push(client);
      }
      
      expect(clients.length).toBe(connectionCount);
      clients.forEach(client => {
        expect(client.connected).toBe(true);
      });
      
      // Clean up
      for (const client of clients) {
        await client.close();
      }
    });

    test('should handle WebSocket connection errors gracefully', async () => {
      // Try to connect to wrong endpoint
      const client = createTestClient(serverPort, '/wrong-endpoint');
      
      await expect(client.connect(1000)).rejects.toThrow();
    });
  });

  describe('Configuration Management', () => {
    test('should merge configurations correctly', () => {
      const defaultConfig = { 
        a: 1, 
        b: { x: 1, y: 2 },
        c: 'default'
      };
      const fileConfig = { 
        b: { x: 10, z: 3 }, 
        c: 'override',
        d: 'new'
      };
      
      const merged = server.mergeConfig(defaultConfig, fileConfig);
      
      expect(merged.a).toBe(1);          // Unchanged
      expect(merged.b.x).toBe(10);       // Overridden
      expect(merged.b.y).toBe(2);        // Preserved  
      expect(merged.b.z).toBe(3);        // Added
      expect(merged.c).toBe('override'); // Overridden
      expect(merged.d).toBe('new');      // Added
    });

    test('should handle missing configuration file gracefully', () => {
      // This should not throw even with non-existent config
      expect(() => {
        new WebIdeBridgeServer();
      }).not.toThrow();
    });

    test('should apply environment variable overrides', () => {
      // Test environment variables are already set in setup.js
      expect(process.env.NODE_ENV).toBe('test');
      expect(process.env.WEB_IDE_BRIDGE_SECRET).toBe('test-secret-key-for-testing');
    });
  });

  describe('Server Lifecycle', () => {
    test('should start and stop cleanly', async () => {
      const testServer = new WebIdeBridgeServer();
      testServer.config = global.testUtils.createTestConfig();
      
      await testServer.start();
      expect(testServer.server.listening).toBe(true);
      
      const port = testServer.server.address().port;
      expect(port).toBeGreaterThan(0);
      
      // Store listening state before shutdown
      const wasListening = testServer.server.listening;
      
      // Clean shutdown
      await testServer.shutdown();
      
      // Verify it was listening before shutdown
      expect(wasListening).toBe(true);
      
      // After shutdown, server should be null or not listening
      expect(testServer.server === null || testServer.server.listening === false).toBe(true);
    });
  });
});
