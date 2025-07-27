const WebIdeBridgeServer = require('../../server/web-ide-bridge-server');
const { createTestClient, waitForWebSocketServer } = require('../utils/websocket-utils');

describe('Server Edge Cases and Error Handling', () => {
  let server;
  let serverPort;

  beforeEach(async () => {
    server = await global.testUtils.createTestServer();
    await server.start();
    serverPort = server.server.address().port;
    await waitForWebSocketServer(serverPort);
  });

  afterEach(async () => {
    await global.testUtils.cleanupTestServer(server);
  });

  describe('Configuration Validation', () => {
    test('should reject invalid port numbers', async () => {
      let testServer;
      try {
        expect(() => {
          testServer = new WebIdeBridgeServer();
          testServer.validateConfiguration({
            ...global.testUtils.createTestConfig(),
            server: { ...global.testUtils.createTestConfig().server, port: -1 }
          });
        }).toThrow('Server port must be between 0 and 65535');
      } finally {
        if (testServer && testServer.cleanupInterval) {
          clearInterval(testServer.cleanupInterval);
        }
      }
    });

    test('should reject port numbers above 65535', async () => {
      let testServer;
      try {
        expect(() => {
          testServer = new WebIdeBridgeServer();
          testServer.validateConfiguration({
            ...global.testUtils.createTestConfig(),
            server: { ...global.testUtils.createTestConfig().server, port: 70000 }
          });
        }).toThrow('Server port must be between 0 and 65535');
      } finally {
        if (testServer && testServer.cleanupInterval) {
          clearInterval(testServer.cleanupInterval);
        }
      }
    });

    test('should reject invalid heartbeat interval', async () => {
      let testServer;
      try {
        expect(() => {
          testServer = new WebIdeBridgeServer();
          testServer.validateConfiguration({
            ...global.testUtils.createTestConfig(),
            server: { ...global.testUtils.createTestConfig().server, heartbeatInterval: 500 }
          });
        }).toThrow('Heartbeat interval must be at least 1000ms');
      } finally {
        if (testServer && testServer.cleanupInterval) {
          clearInterval(testServer.cleanupInterval);
        }
      }
    });

    test('should reject production config with default secret', async () => {
      let testServer;
      try {
        expect(() => {
          testServer = new WebIdeBridgeServer();
          testServer.validateConfiguration({
            ...global.testUtils.createTestConfig(),
            environment: 'production',
            session: { 
              ...global.testUtils.createTestConfig().session, 
              secret: 'web-ide-bridge-secret' 
            }
          });
        }).toThrow('Session secret must be changed in production');
      } finally {
        if (testServer && testServer.cleanupInterval) {
          clearInterval(testServer.cleanupInterval);
        }
      }
    });

    test('should reject invalid WebSocket endpoint', async () => {
      let testServer;
      try {
        expect(() => {
          testServer = new WebIdeBridgeServer();
          testServer.validateConfiguration({
            ...global.testUtils.createTestConfig(),
            server: { 
              ...global.testUtils.createTestConfig().server, 
              websocketEndpoint: 'invalid-endpoint' 
            }
          });
        }).toThrow('WebSocket endpoint must start with /');
      } finally {
        if (testServer && testServer.cleanupInterval) {
          clearInterval(testServer.cleanupInterval);
        }
      }
    });

    test('should reject invalid connection timeout', async () => {
      let testServer;
      try {
        expect(() => {
          testServer = new WebIdeBridgeServer();
          testServer.validateConfiguration({
            ...global.testUtils.createTestConfig(),
            server: { 
              ...global.testUtils.createTestConfig().server, 
              connectionTimeout: 500 
            }
          });
        }).toThrow('Connection timeout must be at least 1000ms');
      } finally {
        if (testServer && testServer.cleanupInterval) {
          clearInterval(testServer.cleanupInterval);
        }
      }
    });

    test('should reject invalid max connections', async () => {
      let testServer;
      try {
        expect(() => {
          testServer = new WebIdeBridgeServer();
          testServer.validateConfiguration({
            ...global.testUtils.createTestConfig(),
            server: { 
              ...global.testUtils.createTestConfig().server, 
              maxConnections: 0 
            }
          });
        }).toThrow('Max connections must be at least 1');
      } finally {
        if (testServer && testServer.cleanupInterval) {
          clearInterval(testServer.cleanupInterval);
        }
      }
    });

    test('should reject invalid session cookie maxAge', async () => {
      let testServer;
      try {
        expect(() => {
          testServer = new WebIdeBridgeServer();
          testServer.validateConfiguration({
            ...global.testUtils.createTestConfig(),
            session: { 
              ...global.testUtils.createTestConfig().session, 
              cookie: { maxAge: 30000 } // Less than 1 minute
            }
          });
        }).toThrow('Session cookie maxAge must be at least 1 minute');
      } finally {
        if (testServer && testServer.cleanupInterval) {
          clearInterval(testServer.cleanupInterval);
        }
      }
    });

    test('should reject non-array CORS origin', async () => {
      let testServer;
      try {
        expect(() => {
          testServer = new WebIdeBridgeServer();
          testServer.validateConfiguration({
            ...global.testUtils.createTestConfig(),
            cors: { 
              ...global.testUtils.createTestConfig().cors, 
              origin: 'http://localhost:3000' // String instead of array
            }
          });
        }).toThrow('CORS origin must be an array');
      } finally {
        if (testServer && testServer.cleanupInterval) {
          clearInterval(testServer.cleanupInterval);
        }
      }
    });

    test('should reject invalid rate limiting window', async () => {
      let testServer;
      try {
        expect(() => {
          testServer = new WebIdeBridgeServer();
          testServer.validateConfiguration({
            ...global.testUtils.createTestConfig(),
            security: {
              rateLimiting: {
                enabled: true,
                windowMs: 500, // Less than 1000ms
                maxRequests: 100
              }
            }
          });
        }).toThrow('Rate limiting window must be at least 1000ms');
      } finally {
        if (testServer && testServer.cleanupInterval) {
          clearInterval(testServer.cleanupInterval);
        }
      }
    });

    test('should reject invalid rate limiting max requests', async () => {
      let testServer;
      try {
        expect(() => {
          testServer = new WebIdeBridgeServer();
          testServer.validateConfiguration({
            ...global.testUtils.createTestConfig(),
            security: {
              rateLimiting: {
                enabled: true,
                windowMs: 60000,
                maxRequests: 0 // Invalid
              }
            }
          });
        }).toThrow('Rate limiting max requests must be at least 1');
      } finally {
        if (testServer && testServer.cleanupInterval) {
          clearInterval(testServer.cleanupInterval);
        }
      }
    });
  });

  describe('Message Validation', () => {
    test('should reject non-object messages', async () => {
      const client = createTestClient(serverPort);
      await client.connect();

      // Send string instead of object
      client.ws.send('not an object');

      const error = await client.waitForMessage(msg => msg.type === 'error');
      expect(error.payload.message).toContain('Invalid JSON');

      await client.close();
    });

    test('should reject messages without type field', async () => {
      const client = createTestClient(serverPort);
      await client.connect();

      // Send object without type
      client.send({
        connectionId: client.connectionId,
        userId: 'test-user'
      });

      const error = await client.waitForMessage(msg => msg.type === 'error');
      expect(error.payload.message).toContain('Message must have a string type field');

      await client.close();
    });

    test('should reject messages with non-string type', async () => {
      const client = createTestClient(serverPort);
      await client.connect();

      // Send message with numeric type
      client.send({
        type: 123,
        connectionId: client.connectionId,
        userId: 'test-user'
      });

      const error = await client.waitForMessage(msg => msg.type === 'error');
      expect(error.payload.message).toContain('Message must have a string type field');

      await client.close();
    });

    test('should reject messages with mismatched connectionId', async () => {
      const client = createTestClient(serverPort);
      await client.connect();

      // Send message with wrong connectionId
      const message = global.testUtils.createMessage('browser_connect', {}, {
        connectionId: 'wrong-connection-id',
        userId: 'test-user'
      });

      client.send(message);

      const error = await client.waitForMessage(msg => msg.type === 'error');
      expect(error.payload.message).toContain('Invalid connectionId');

      await client.close();
    });

    test('should reject messages without connectionId', async () => {
      const client = createTestClient(serverPort);
      await client.connect();

      // Wait for connection_init to get the real connectionId
      await client.waitForMessage(msg => msg.type === 'connection_init');

      // Send message with raw WebSocket to bypass client's auto-add connectionId
      client.ws.send(JSON.stringify({
        type: 'browser_connect',
        userId: 'test-user'
        // No connectionId field
      }));

      const error = await client.waitForMessage(msg => msg.type === 'error');
      expect(error.payload.message).toContain('Message must have a string connectionId field');

      await client.close();
    });

    test('should reject unknown message types', async () => {
      const client = createTestClient(serverPort);
      await client.connect();

      const message = global.testUtils.createMessage('unknown_type', {}, {
        connectionId: client.connectionId,
        userId: 'test-user'
      });

      client.send(message);

      const error = await client.waitForMessage(msg => msg.type === 'error');
      expect(error.payload.message).toContain('Unknown message type: unknown_type');

      await client.close();
    });

    test('should reject browser_connect without userId', async () => {
      const client = createTestClient(serverPort);
      await client.connect();
    
      // Wait for connection_init to establish proper connectionId
      await client.waitForMessage(msg => msg.type === 'connection_init');
    
      // Send browser_connect without userId using raw WebSocket
      client.ws.send(JSON.stringify({
        type: 'browser_connect',
        connectionId: client.connectionId
        // Missing userId
      }));
    
      const error = await client.waitForMessage(msg => msg.type === 'error');
      expect(error.payload.message).toContain('browser_connect requires userId field');
    
      await client.close();
    });

    test('should reject userId longer than 255 characters', async () => {
      const client = createTestClient(serverPort);
      await client.connect();

      const longUserId = 'x'.repeat(256);
      const message = global.testUtils.createMessage('browser_connect', {}, {
        connectionId: client.connectionId,
        userId: longUserId
      });

      client.send(message);

      const error = await client.waitForMessage(msg => msg.type === 'error');
      expect(error.payload.message).toContain('userId must be 255 characters or less');

      await client.close();
    });

    test('should reject edit_request with missing fields', async () => {
      const client = createTestClient(serverPort);
      await client.connect();
    
      // Wait for connection_init and connect as browser first
      await client.waitForMessage(msg => msg.type === 'connection_init');
      
      client.send(global.testUtils.createMessage('browser_connect', {}, {
        connectionId: client.connectionId,
        userId: 'test-user'
      }));
      await client.waitForMessage(msg => msg.type === 'connection_ack');
    
      // Send edit_request with missing sessionId using raw WebSocket
      client.ws.send(JSON.stringify({
        type: 'edit_request',
        connectionId: client.connectionId,
        userId: 'test-user',
        payload: {
          snippetId: 'test',
          code: 'console.log("test");'
        }
        // Missing sessionId
      }));
    
      const error = await client.waitForMessage(msg => msg.type === 'error');
      // Server validates message structure first, then business logic
      expect(error.payload.message).toContain('edit_request requires userId, sessionId, and payload');
    
      await client.close();
    });

    test('should reject edit_request with missing payload fields', async () => {
      const client = createTestClient(serverPort);
      await client.connect();

      // Missing snippetId in payload
      const message = global.testUtils.createMessage('edit_request', {
        code: 'console.log("test");'
        // Missing snippetId
      }, {
        connectionId: client.connectionId,
        userId: 'test-user',
        sessionId: 'test-session'
      });

      client.send(message);

      const error = await client.waitForMessage(msg => msg.type === 'error');
      expect(error.payload.message).toContain('edit_request payload requires snippetId and code');

      await client.close();
    });

    test('should reject edit_request with oversized payload', async () => {
      const client = createTestClient(serverPort);
      await client.connect();

      // Wait for connection_init and connect as browser
      await client.waitForMessage(msg => msg.type === 'connection_init');
      
      client.send(global.testUtils.createMessage('browser_connect', {}, {
        connectionId: client.connectionId,
        userId: 'test-user'
      }));
      await client.waitForMessage(msg => msg.type === 'connection_ack');

      // Create payload larger than 10MB
      const largeCode = 'x'.repeat(11 * 1024 * 1024);
      const message = global.testUtils.createMessage('edit_request', {
        snippetId: 'test',
        code: largeCode
      }, {
        connectionId: client.connectionId,
        userId: 'test-user',
        sessionId: 'test-session'
      });

      try {
        client.send(message);
        
        // Either get an error message or connection drops
        try {
          const error = await client.waitForMessage(msg => msg.type === 'error', 2000);
          expect(error.payload.message).toContain('Code payload too large');
        } catch (timeoutError) {
          // Connection might have been dropped due to oversized payload
          expect(client.connected).toBe(false);
        }
      } catch (sendError) {
        // Send might fail due to oversized payload
        expect(sendError.message).toContain('payload');
      }

      await client.close();
    });

    test('should reject code_update without sessionId', async () => {
      const client = createTestClient(serverPort);
      await client.connect();
    
      // Wait for connection_init and connect as desktop
      await client.waitForMessage(msg => msg.type === 'connection_init');
      
      client.send(global.testUtils.createMessage('desktop_connect', {}, {
        connectionId: client.connectionId,
        userId: 'test-user'
      }));
      await client.waitForMessage(msg => msg.type === 'connection_ack');
    
      // Send code_update without sessionId using raw WebSocket
      client.ws.send(JSON.stringify({
        type: 'code_update',
        connectionId: client.connectionId,
        payload: {
          code: 'updated code'
        }
        // Missing sessionId
      }));
    
      const error = await client.waitForMessage(msg => msg.type === 'error');
      // Server validates message structure first
      expect(error.payload.message).toContain('code_update requires sessionId and payload');
    
      await client.close();
    });

    test('should handle null or undefined messages', async () => {
      const client = createTestClient(serverPort);
      await client.connect();

      // Send null
      client.ws.send('null');

      const error = await client.waitForMessage(msg => msg.type === 'error');
      expect(error.payload.message).toContain('Message must be an object');

      await client.close();
    });
  });

  describe('Session Edge Cases', () => {
    test('should handle session with missing browser connection', async () => {
      const desktopClient = createTestClient(serverPort);
      await desktopClient.connect();

      // Connect desktop only
      desktopClient.send(global.testUtils.createMessage('desktop_connect', {}, {
        connectionId: desktopClient.connectionId,
        userId: 'orphan-user'
      }));

      await desktopClient.waitForMessage(msg => msg.type === 'connection_ack');

      // Try to send code update without active session
      desktopClient.send(global.testUtils.createMessage('code_update', {
        code: 'updated code'
      }, {
        connectionId: desktopClient.connectionId,
        sessionId: 'non-existent-session'
      }));

      const error = await desktopClient.waitForMessage(msg => msg.type === 'error');
      expect(error.payload.message).toContain('Session not found');

      await desktopClient.close();
    });

    test('should handle edit request with missing desktop connection', async () => {
      const browserClient = createTestClient(serverPort);
      await browserClient.connect();

      // Connect browser only (no desktop)
      browserClient.send(global.testUtils.createMessage('browser_connect', {}, {
        connectionId: browserClient.connectionId,
        userId: 'no-desktop-user'
      }));

      await browserClient.waitForMessage(msg => msg.type === 'connection_ack');

      // Try to send edit request without desktop
      browserClient.send(global.testUtils.createMessage('edit_request', {
        snippetId: 'test-snippet',
        code: 'test code',
        fileType: 'js'
      }, {
        connectionId: browserClient.connectionId,
        userId: 'no-desktop-user',
        sessionId: 'test-session'
      }));

      const error = await browserClient.waitForMessage(msg => msg.type === 'error');
      expect(error.payload.message).toContain('No desktop connection found');

      await browserClient.close();
    });

    test('should handle duplicate session IDs', async () => {
      const browserClient = createTestClient(serverPort);
      const desktopClient = createTestClient(serverPort);

      await browserClient.connect();
      await desktopClient.connect();

      // Connect both clients
      browserClient.send(global.testUtils.createMessage('browser_connect', {}, {
        connectionId: browserClient.connectionId,
        userId: 'duplicate-session-user'
      }));
      await browserClient.waitForMessage(msg => msg.type === 'connection_ack');

      desktopClient.send(global.testUtils.createMessage('desktop_connect', {}, {
        connectionId: desktopClient.connectionId,
        userId: 'duplicate-session-user'
      }));
      await desktopClient.waitForMessage(msg => msg.type === 'connection_ack');

      const sessionId = 'duplicate-session-id';

      // Send first edit request
      browserClient.send(global.testUtils.createMessage('edit_request', {
        snippetId: 'snippet-1',
        code: 'first code',
        fileType: 'js'
      }, {
        connectionId: browserClient.connectionId,
        userId: 'duplicate-session-user',
        sessionId
      }));

      await desktopClient.waitForMessage(msg => msg.type === 'edit_request');

      // Send second edit request with same session ID (should overwrite)
      browserClient.send(global.testUtils.createMessage('edit_request', {
        snippetId: 'snippet-2',
        code: 'second code',
        fileType: 'js'
      }, {
        connectionId: browserClient.connectionId,
        userId: 'duplicate-session-user',
        sessionId
      }));

      await desktopClient.waitForMessage(msg => 
        msg.type === 'edit_request' && msg.payload.snippetId === 'snippet-2'
      );

      // Should have overwritten the session
      const session = server.activeSessions.get(sessionId);
      expect(session.snippetId).toBe('snippet-2');

      await browserClient.close();
      await desktopClient.close();
    });

    test('should handle code update for disconnected browser', async () => {
      const browserClient = createTestClient(serverPort);
      const desktopClient = createTestClient(serverPort);

      await browserClient.connect();
      await desktopClient.connect();

      // Setup connection and session
      const userId = 'disconnect-test-user';
      const sessionId = 'disconnect-test-session';

      // Wait for connection_init for both
      await browserClient.waitForMessage(msg => msg.type === 'connection_init');
      await desktopClient.waitForMessage(msg => msg.type === 'connection_init');

      browserClient.send(global.testUtils.createMessage('browser_connect', {}, {
        connectionId: browserClient.connectionId,
        userId
      }));
      await browserClient.waitForMessage(msg => msg.type === 'connection_ack');

      desktopClient.send(global.testUtils.createMessage('desktop_connect', {}, {
        connectionId: desktopClient.connectionId,
        userId
      }));
      await desktopClient.waitForMessage(msg => msg.type === 'connection_ack');

      // Start edit session
      browserClient.send(global.testUtils.createMessage('edit_request', {
        snippetId: 'test-snippet',
        code: 'test code',
        fileType: 'js'
      }, {
        connectionId: browserClient.connectionId,
        userId,
        sessionId
      }));

      await desktopClient.waitForMessage(msg => msg.type === 'edit_request');

      // Disconnect browser - this will clean up the session
      await browserClient.close();
      
      // Wait for server to process disconnection
      await global.testUtils.sleep(100);

      // Desktop tries to send code update - session should be gone
      desktopClient.send(global.testUtils.createMessage('code_update', {
        code: 'updated code'
      }, {
        connectionId: desktopClient.connectionId,
        sessionId
      }));

      const error = await desktopClient.waitForMessage(msg => msg.type === 'error');
      // The session gets cleaned up when browser disconnects
      expect(error.payload.message).toContain('Session not found');

      await desktopClient.close();
    });
  });

  describe('Performance Edge Cases', () => {
    test('should handle empty messages', async () => {
      const client = createTestClient(serverPort);
      await client.connect();

      // Send empty object
      client.send({});

      const error = await client.waitForMessage(msg => msg.type === 'error');
      expect(error.payload.message).toContain('Message must have a string type field');

      await client.close();
    });

    test('should handle messages with extra fields', async () => {
      const client = createTestClient(serverPort);
      await client.connect();
    
      // Wait for connection_init first
      await client.waitForMessage(msg => msg.type === 'connection_init');
    
      // Send message with extra fields
      const message = global.testUtils.createMessage('browser_connect', {
        extraField: 'should be ignored',
        anotherExtra: { nested: 'data' }
      }, {
        connectionId: client.connectionId,
        userId: 'test-user',
        unexpectedField: 'also ignored'
      });
    
      client.send(message);
    
      // Should still work despite extra fields
      const ack = await client.waitForMessage(msg => msg.type === 'connection_ack');
      expect(ack.status).toBe('connected');
    
      await client.close();
    });

    test('should handle very long user IDs', async () => {
      const client = createTestClient(serverPort);
      await client.connect();

      const longUserId = 'user-' + 'x'.repeat(200); // Within 255 limit

      const message = global.testUtils.createMessage('browser_connect', {}, {
        connectionId: client.connectionId,
        userId: longUserId
      });

      client.send(message);

      const ack = await client.waitForMessage(msg => msg.type === 'connection_ack');
      expect(ack.status).toBe('connected');

      // Verify user session was created
      expect(server.userSessions.has(longUserId)).toBe(true);

      await client.close();
    });

    test('should handle special characters in user IDs', async () => {
      const client = createTestClient(serverPort);
      await client.connect();

      const specialUserId = 'user-with-特殊字符-and-émojis-🚀-and-spaces and symbols!@#$%';

      const message = global.testUtils.createMessage('browser_connect', {}, {
        connectionId: client.connectionId,
        userId: specialUserId
      });

      client.send(message);

      const ack = await client.waitForMessage(msg => msg.type === 'connection_ack');
      expect(ack.status).toBe('connected');

      expect(server.userSessions.has(specialUserId)).toBe(true);

      await client.close();
    });

    test('should handle very large messages within limits', async () => {
      const client = createTestClient(serverPort);
      await client.connect();

      // Create large payload (1MB, within 10MB limit)
      const largePayload = 'x'.repeat(1024 * 1024);
      
      const message = global.testUtils.createMessage('browser_connect', {
        largeData: largePayload
      }, {
        connectionId: client.connectionId,
        userId: 'test-user'
      });

      client.send(message);

      // Should handle large message without errors
      const ack = await client.waitForMessage(msg => msg.type === 'connection_ack');
      expect(ack.status).toBe('connected');

      await client.close();
    });

    test('should handle connection drops during message processing', async () => {
      const client = createTestClient(serverPort);
      await client.connect();

      // Start connection process
      const connectMessage = global.testUtils.createMessage('browser_connect', {}, {
        connectionId: client.connectionId,
        userId: 'test-user'
      });

      client.send(connectMessage);

      // Immediately close connection
      client.ws.close();

      // Server should handle this gracefully without crashing
      await global.testUtils.sleep(100);

      expect(server.browserConnections.size).toBe(0);
    });
  });

  describe('Cleanup Edge Cases', () => {
    test('should handle cleanup when rateLimitStore is undefined', () => {
      // Ensure rateLimitStore is undefined
      server.rateLimitStore = undefined;

      // Should not throw error
      expect(() => {
        server.cleanupRateLimitStore();
      }).not.toThrow();
    });

    test('should handle session cleanup with corrupted session data', () => {
      // Add corrupted session data
      server.activeSessions.set('corrupted-session', {
        // Missing lastActivity field
        userId: 'test-user',
        snippetId: 'test-snippet'
      });

      // Should handle gracefully
      expect(() => {
        server.cleanupExpiredSessions();
      }).not.toThrow();
    });

    test('should clean up rate limit store correctly', async () => {
      server.rateLimitStore = new Map();
      
      // Add expired entries
      const expiredTime = Date.now() - 10000;
      server.rateLimitStore.set('expired1', { requests: [expiredTime], resetTime: expiredTime });
      server.rateLimitStore.set('expired2', { requests: [expiredTime], resetTime: expiredTime });
      
      // Add current entry
      const futureTime = Date.now() + 10000;
      server.rateLimitStore.set('current', { requests: [Date.now()], resetTime: futureTime });

      expect(server.rateLimitStore.size).toBe(3);

      // Run cleanup
      server.cleanupRateLimitStore();

      // Should only have current entry
      expect(server.rateLimitStore.size).toBe(1);
      expect(server.rateLimitStore.has('current')).toBe(true);
    });
  });

  describe('Connection Limits and Timeouts', () => {
    test('should handle connection timeout for unauthenticated connections', async () => {
      // Set very short timeout for test
      const testServer = new WebIdeBridgeServer();
      testServer.config = {
        ...global.testUtils.createTestConfig(),
        server: {
          ...global.testUtils.createTestConfig().server,
          connectionTimeout: 100 // 100ms timeout
        }
      };

      await testServer.start();
      const testPort = testServer.server.address().port;

      const client = createTestClient(testPort);
      await client.connect();

      // Don't send any authentication message
      // Wait for timeout
      await global.testUtils.sleep(200);

      expect(client.connected).toBe(false);

      await testServer.shutdown();
    });

    test('should handle enhanced rate limiting', async () => {
      // Enable rate limiting for this test
      server.config.security.rateLimiting.enabled = true;
      server.config.security.rateLimiting.maxRequests = 2;
      server.config.security.rateLimiting.windowMs = 1000;

      const clientIP = '127.0.0.1';

      // First request should pass
      expect(server.checkRateLimit(clientIP)).toBe(true);
      
      // Second request should pass
      expect(server.checkRateLimit(clientIP)).toBe(true);
      
      // Third request should be rate limited
      expect(server.checkRateLimit(clientIP)).toBe(false);

      // Wait for window to reset
      await global.testUtils.sleep(1100);
      
      // Should work again after window reset
      expect(server.checkRateLimit(clientIP)).toBe(true);
    });

    test('should handle rate limiting with sliding window', async () => {
      server.config.security.rateLimiting.enabled = true;
      server.config.security.rateLimiting.maxRequests = 3;
      server.config.security.rateLimiting.windowMs = 2000;

      const clientIP = '192.168.1.1';

      // Make 3 requests quickly - should all pass
      expect(server.checkRateLimit(clientIP)).toBe(true);
      expect(server.checkRateLimit(clientIP)).toBe(true);
      expect(server.checkRateLimit(clientIP)).toBe(true);
      
      // 4th request should be blocked
      expect(server.checkRateLimit(clientIP)).toBe(false);

      // Wait half the window time
      await global.testUtils.sleep(1000);
      
      // Should still be blocked (sliding window)
      expect(server.checkRateLimit(clientIP)).toBe(false);

      // Wait for full window to pass
      await global.testUtils.sleep(1500);
      
      // Should work again
      expect(server.checkRateLimit(clientIP)).toBe(true);
    });
  });

  describe('Memory and Resource Management', () => {
    test('should handle connection drops during message processing', async () => {
      const clients = [];
      
      // Create multiple connections
      for (let i = 0; i < 5; i++) {
        const client = createTestClient(serverPort);
        await client.connect();
        clients.push(client);
      }

      // Authenticate some clients
      for (let i = 0; i < 3; i++) {
        clients[i].send(global.testUtils.createMessage('browser_connect', {}, {
          connectionId: clients[i].connectionId,
          userId: `user-${i}`
        }));
        await clients[i].waitForMessage(msg => msg.type === 'connection_ack');
      }

      expect(server.browserConnections.size).toBe(3);

      // Abruptly close all connections
      for (const client of clients) {
        client.ws.terminate(); // Force close without proper handshake
      }

      // Give server time to detect disconnections
      await global.testUtils.sleep(200);

      // Server should have cleaned up all connections
      expect(server.browserConnections.size).toBe(0);
      expect(server.desktopConnections.size).toBe(0);
    });

    test('should handle WebSocket server errors gracefully', async () => {
      // Simulate WebSocket server error
      const originalErrorCount = server.metrics.errors;
      
      server.wss.emit('error', new Error('Test WebSocket server error'));

      // Should increment error count but not crash
      expect(server.metrics.errors).toBe(originalErrorCount + 1);
      expect(server.server.listening).toBe(true);
    });

    test('should handle malformed JSON gracefully', async () => {
      const client = createTestClient(serverPort);
      await client.connect();

      // Send malformed JSON
      client.ws.send('{"invalid": json, "missing": quote}');

      const error = await client.waitForMessage(msg => msg.type === 'error');
      expect(error.payload.message).toContain('Invalid JSON');

      // Connection should still be alive
      expect(client.connected).toBe(true);

      await client.close();
    });

    test('should handle exceptions in message handlers', async () => {
      const client = createTestClient(serverPort);
      await client.connect();

      // Wait for proper connection setup
      await client.waitForMessage(msg => msg.type === 'connection_init');

      // Mock the handler to throw error
      const originalHandleBrowserConnect = server.handleBrowserConnect;
      server.handleBrowserConnect = () => {
        throw new Error('Simulated handler error');
      };

      // Send valid message that should trigger the handler
      const connectMessage = global.testUtils.createMessage('browser_connect', {}, {
        connectionId: client.connectionId,
        userId: 'test-user'
      });

      client.send(connectMessage);

      const error = await client.waitForMessage(msg => msg.type === 'error');
      expect(error.payload.message).toContain('Error processing browser_connect');

      // Restore original handler
      server.handleBrowserConnect = originalHandleBrowserConnect;

      await client.close();
    });
  });

  describe('Concurrent Operations', () => {
    test('should handle concurrent connections from same user', async () => {
      const userId = 'concurrent-user';
      
      // Create multiple connections for same user
      const client1 = createTestClient(serverPort);
      const client2 = createTestClient(serverPort);

      await client1.connect();
      await client2.connect();

      // Both connect as browser (should overwrite)
      client1.send(global.testUtils.createMessage('browser_connect', {}, {
        connectionId: client1.connectionId,
        userId
      }));

      client2.send(global.testUtils.createMessage('browser_connect', {}, {
        connectionId: client2.connectionId,
        userId
      }));

      await client1.waitForMessage(msg => msg.type === 'connection_ack');
      await client2.waitForMessage(msg => msg.type === 'connection_ack');

      // Should have both connections for user
      const userSession = server.userSessions.get(userId);
      expect(userSession.browserIds.has(client1.connectionId)).toBe(true);
      expect(userSession.browserIds.has(client2.connectionId)).toBe(true);

      await client1.close();
      await client2.close();
    });

    test('should handle rapid connect/disconnect cycles', async () => {
      const connectCount = 10;
      const clients = [];

      // Rapid connections
      for (let i = 0; i < connectCount; i++) {
        const client = createTestClient(serverPort);
        await client.connect();
        clients.push(client);
      }

      expect(clients.length).toBe(connectCount);

      // Rapid disconnections
      for (const client of clients) {
        await client.close();
      }

      // Give server time to clean up
      await global.testUtils.sleep(100);

      expect(server.browserConnections.size).toBe(0);
      expect(server.desktopConnections.size).toBe(0);
    });

    test('should handle concurrent edit sessions', async () => {
      const userId = 'concurrent-edit-user';
      const browserClient = createTestClient(serverPort);
      const desktopClient = createTestClient(serverPort);

      await browserClient.connect();
      await desktopClient.connect();

      // Connect both clients with retry logic
      browserClient.send(global.testUtils.createMessage('browser_connect', {}, {
        connectionId: browserClient.connectionId,
        userId
      }));
      await global.waitForMessageWithRetry(browserClient, msg => msg.type === 'connection_ack');

      desktopClient.send(global.testUtils.createMessage('desktop_connect', {}, {
        connectionId: desktopClient.connectionId,
        userId
      }));
      await global.waitForMessageWithRetry(desktopClient, msg => msg.type === 'connection_ack');

      // Start multiple edit sessions with better timing
      const sessionPromises = [];
      for (let i = 0; i < 3; i++) {
        const sessionId = `session-${i}`;
        const promise = (async () => {
          // Add small delay between requests to avoid overwhelming the server
          await new Promise(resolve => setTimeout(resolve, i * 50));
          
          browserClient.send(global.testUtils.createMessage('edit_request', {
            snippetId: `snippet-${i}`,
            code: `console.log("session ${i}");`,
            fileType: 'js'
          }, {
            connectionId: browserClient.connectionId,
            userId,
            sessionId
          }));

          await global.waitForMessageWithRetry(desktopClient, msg => 
            msg.type === 'edit_request' && msg.sessionId === sessionId
          );

          return sessionId;
        })();
        sessionPromises.push(promise);
      }

      const completedSessions = await Promise.all(sessionPromises);
      expect(completedSessions.length).toBe(3);
      expect(server.activeSessions.size).toBe(3);

      await browserClient.close();
      await desktopClient.close();
    });
  });

  describe('Error Recovery', () => {
    test('should maintain server stability after multiple errors', async () => {
      const client = createTestClient(serverPort);
      await client.connect();

      const errorCount = 20;
      const initialErrors = server.metrics.errors;

      // Send multiple invalid messages
      for (let i = 0; i < errorCount; i++) {
        client.send({
          type: 'invalid_type',
          connectionId: client.connectionId,
          invalidData: `error-${i}`
        });
      }

      // Wait for all error responses
      const errorMessages = await client.waitForMessages(
        msg => msg.type === 'error',
        errorCount,
        5000
      );

      expect(errorMessages.length).toBe(errorCount);
      expect(server.metrics.errors).toBe(initialErrors + errorCount);
      
      // Server should still be functional
      expect(server.server.listening).toBe(true);
      expect(client.connected).toBe(true);

      // Should still be able to connect normally
      client.send(global.testUtils.createMessage('browser_connect', {}, {
        connectionId: client.connectionId,
        userId: 'recovery-test-user'
      }));

      const ack = await client.waitForMessage(msg => msg.type === 'connection_ack');
      expect(ack.status).toBe('connected');

      await client.close();
    });

    test('should handle ping messages with payload', async () => {
      const client = createTestClient(serverPort);
      await client.connect();

      // Send ping with complex payload
      const pingPayload = {
        timestamp: Date.now(),
        sequence: 1,
        data: { nested: 'value', array: [1, 2, 3] }
      };

      client.send(global.testUtils.createMessage('ping', pingPayload, {
        connectionId: client.connectionId
      }));

      const pong = await client.waitForMessage(msg => msg.type === 'pong');
      expect(pong.payload).toEqual(pingPayload);
      expect(pong.timestamp).toBeDefined();

      await client.close();
    });

    test('should handle session cleanup on user disconnection', async () => {
      const userId = 'cleanup-test-user';
      const browserClient = createTestClient(serverPort);
      const desktopClient = createTestClient(serverPort);

      await browserClient.connect();
      await desktopClient.connect();

      // Connect both clients
      browserClient.send(global.testUtils.createMessage('browser_connect', {}, {
        connectionId: browserClient.connectionId,
        userId
      }));
      await browserClient.waitForMessage(msg => msg.type === 'connection_ack');

      desktopClient.send(global.testUtils.createMessage('desktop_connect', {}, {
        connectionId: desktopClient.connectionId,
        userId
      }));
      await desktopClient.waitForMessage(msg => msg.type === 'connection_ack');

      // Create multiple sessions
      const sessionIds = [];
      for (let i = 0; i < 3; i++) {
        const sessionId = `cleanup-session-${i}`;
        sessionIds.push(sessionId);
        
        browserClient.send(global.testUtils.createMessage('edit_request', {
          snippetId: `snippet-${i}`,
          code: `console.log("cleanup test ${i}");`,
          fileType: 'js'
        }, {
          connectionId: browserClient.connectionId,
          userId,
          sessionId
        }));

        await global.waitForMessageWithRetry(desktopClient, msg => 
          msg.type === 'edit_request' && msg.sessionId === sessionId
        );
      }

      expect(server.activeSessions.size).toBe(3);
      expect(server.userSessions.has(userId)).toBe(true);

      // Disconnect browser
      await browserClient.close();

      // Wait for cleanup
      await global.testUtils.waitFor(() => {
        return sessionIds.every(sessionId => !server.activeSessions.has(sessionId));
      });

      // All sessions should be cleaned up
      expect(server.activeSessions.size).toBe(0);
      
      // User session should be partially cleaned
      const userSession = server.userSessions.get(userId);
      expect(userSession.browserIds.size).toBe(0);
      expect(userSession.desktopId).toBeDefined(); // Desktop still connected

      await desktopClient.close();
    });
  });

  describe('Validation Edge Cases', () => {
    test('should validate configuration on startup', async () => {
      let testServer;
      try {
        expect(() => {
          testServer = new WebIdeBridgeServer();
          const config = global.testUtils.createTestConfig();
          config.server.port = -1;
          
          testServer.config = config;
          testServer.validateConfiguration(config);
        }).toThrow('Server port must be between 0 and 65535');
      } finally {
        if (testServer && testServer.cleanupInterval) {
          clearInterval(testServer.cleanupInterval);
        }
      }
    });

    test('should handle message validation edge cases', () => {
      const validation1 = server.validateMessage(null);
      expect(validation1.valid).toBe(false);
      expect(validation1.error).toContain('Message must be an object');

      const validation2 = server.validateMessage({ type: 'unknown_type', connectionId: 'test' });
      expect(validation2.valid).toBe(false);
      expect(validation2.error).toContain('Unknown message type');

      const validation3 = server.validateMessage({ 
        type: 'browser_connect', 
        connectionId: 'test',
        userId: 'x'.repeat(256)
      });
      expect(validation3.valid).toBe(false);
      expect(validation3.error).toContain('userId must be 255 characters or less');
    });

    test('should handle edge cases in config merging', () => {
      const defaultConfig = {
        a: { x: 1, y: 2 },
        b: 'default',
        c: [1, 2, 3]
      };
      
      const fileConfig = {
        a: { x: 10, z: 3 },
        b: 'override',
        c: [4, 5, 6],
        d: 'new'
      };
      
      const merged = server.mergeConfig(defaultConfig, fileConfig);
      
      expect(merged.a.x).toBe(10);
      expect(merged.a.y).toBe(2);
      expect(merged.a.z).toBe(3);
      expect(merged.b).toBe('override');
      expect(merged.c).toEqual([4, 5, 6]);
      expect(merged.d).toBe('new');
    });
  });
});
