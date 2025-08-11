/**
 * @name            Web-IDE-Bridge / Tests / Server
 * @tagline         Performance and load testing for Web-IDE-Bridge server
 * @description     Tests for Web-IDE-Bridge server performance and load testing
 * @file            tests/server/performance.test.js
 * @version         1.1.5
 * @release         2025-08-11
 * @repository      https://github.com/peterthoeny/web-ide-bridge
 * @author          Peter Thoeny, https://twiki.org & https://github.com/peterthoeny/
 * @copyright       2025 Peter Thoeny, https://twiki.org & https://github.com/peterthoeny/
 * @license         GPL v3, see LICENSE file
 * @genai           99%, Cursor 1.2, Claude Sonnet 4
 */

const WebIdeBridgeServer = require('../../server/web-ide-bridge-server');
const { createTestClient, createTestClients, waitForWebSocketServer } = require('../utils/websocket-utils');

// Increase timeout for performance tests
jest.setTimeout(60000);

describe('Server Performance and Load Testing', () => {
  let server;
  let serverPort;

  beforeEach(async () => {
    server = new WebIdeBridgeServer();
    server.config = {
      ...global.testUtils.createTestConfig(),
      server: {
        ...global.testUtils.createTestConfig().server,
        maxConnections: 100, // Increase for load testing
        heartbeatInterval: 5000 // Faster heartbeat for tests
      }
    };
    await server.start();
    serverPort = server.server.address().port;
    await waitForWebSocketServer(serverPort);
  });

  afterEach(async () => {
    if (server && server.server) {
      await server.shutdown();
    }
  }, 30000); // Increase afterEach timeout

  describe('Connection Load Testing', () => {
    test('should handle 50 concurrent connections', async () => {
      const connectionCount = 50;
      const clients = [];

      const startTime = Date.now();

      // Create connections in parallel
      const connectionPromises = Array.from({ length: connectionCount }, async (_, i) => {
        const client = createTestClient(serverPort);
        await client.connect();
        
        // Wait for connection_init
        await client.waitForMessage(msg => msg.type === 'connection_init');
        
        // Authenticate immediately
        client.send(global.testUtils.createMessage('browser_connect', {}, {
          connectionId: client.connectionId,
          userId: `load-test-user-${i}`
        }));
        
        await client.waitForMessage(msg => msg.type === 'connection_ack');
        return client;
      });

      const connectedClients = await Promise.all(connectionPromises);
      const connectionTime = Date.now() - startTime;

      expect(connectedClients.length).toBe(connectionCount);
      expect(server.browserConnections.size).toBe(connectionCount);
      expect(connectionTime).toBeLessThan(15000); // Increased timeout

      console.log(`✓ Connected ${connectionCount} clients in ${connectionTime}ms`);

      // Cleanup
      await Promise.all(connectedClients.map(client => client.close()));
    }, 30000);

    test('should handle rapid connect/disconnect cycles', async () => {
      const cycleCount = 10; // Reduced for faster testing
      const startTime = Date.now();
    
      for (let i = 0; i < cycleCount; i++) {
        const client = createTestClient(serverPort);
        await client.connect();
        
        // Wait for connection_init and authenticate
        await client.waitForMessage(msg => msg.type === 'connection_init');
        
        client.send(global.testUtils.createMessage('browser_connect', {}, {
          connectionId: client.connectionId,
          userId: `cycle-user-${i}`
        }));
        
        await client.waitForMessage(msg => msg.type === 'connection_ack');
        await client.close();
        
        // Wait for server to process disconnection
        await global.testUtils.sleep(50);
      }
    
      const cycleTime = Date.now() - startTime;
      expect(cycleTime).toBeLessThan(20000); // Should complete within 20 seconds
      
      // Wait for final cleanup
      await global.testUtils.waitFor(() => server.browserConnections.size === 0, 2000, 50);
      
      expect(server.browserConnections.size).toBe(0); // All should be cleaned up
    
      console.log(`✓ Completed ${cycleCount} connect/disconnect cycles in ${cycleTime}ms`);
    }, 30000);
  });

  describe('Message Throughput Testing', () => {

    test('should handle high-frequency ping messages', async () => {
      const client = createTestClient(serverPort);
      await client.connect();
    
      // Wait for connection_init - ping doesn't require authentication
      await client.waitForMessage(msg => msg.type === 'connection_init');
    
      const messageCount = 50; // Reduced for faster testing
      const startTime = Date.now();
    
      // Send ping messages rapidly - use correct connectionId
      const pingPromises = Array.from({ length: messageCount }, async (_, i) => {
        client.send(global.testUtils.createMessage('ping', { sequence: i }, {
          connectionId: client.connectionId
        }));
        return client.waitForMessage(msg => 
          msg.type === 'pong' && msg.payload && msg.payload.sequence === i
        );
      });
    
      await Promise.all(pingPromises);
      const throughputTime = Date.now() - startTime;
    
      expect(throughputTime).toBeLessThan(10000); // Should complete within 10 seconds
      const messagesPerSecond = (messageCount * 1000) / throughputTime;
    
      console.log(`✓ Processed ${messageCount} ping/pong pairs in ${throughputTime}ms (${messagesPerSecond.toFixed(1)} msg/sec)`);
    
      await client.close();
    });

    test('should handle concurrent edit sessions', async () => {
      const userCount = 5; // Reduced for faster testing
      const editCount = 2; // Reduced for faster testing
      
      // Set up users with browser and desktop connections
      const users = await Promise.all(
        Array.from({ length: userCount }, async (_, i) => {
          const browserClient = createTestClient(serverPort);
          const desktopClient = createTestClient(serverPort);

          await browserClient.connect();
          await desktopClient.connect();

          // Wait for connection_init
          await browserClient.waitForMessage(msg => msg.type === 'connection_init');
          await desktopClient.waitForMessage(msg => msg.type === 'connection_init');

          const userId = `concurrent-user-${i}`;

          // Connect browser
          browserClient.send(global.testUtils.createMessage('browser_connect', {}, {
            connectionId: browserClient.connectionId,
            userId
          }));
          await browserClient.waitForMessage(msg => msg.type === 'connection_ack');

          // Connect desktop
          desktopClient.send(global.testUtils.createMessage('desktop_connect', {}, {
            connectionId: desktopClient.connectionId,
            userId
          }));
          await desktopClient.waitForMessage(msg => msg.type === 'connection_ack');

          return { userId, browserClient, desktopClient };
        })
      );

      const startTime = Date.now();

      // Each user performs multiple edit operations concurrently
      const editPromises = users.flatMap(({ userId, browserClient, desktopClient }) =>
        Array.from({ length: editCount }, async (_, editIndex) => {
          const snippetId = `snippet-${userId}-${editIndex}`;
          
          // Browser sends edit request
          browserClient.send(global.testUtils.createMessage('edit_request', {
            snippetId: snippetId,
            code: `console.log("Edit ${editIndex} by ${userId}");`,
            fileType: 'js'
          }, {
            connectionId: browserClient.connectionId,
            userId,
            snippetId
          }));

          // Desktop receives and responds
          const editRequest = await desktopClient.waitForMessage(msg => 
            msg.type === 'edit_request' && msg.snippetId === snippetId
          );

          desktopClient.send(global.testUtils.createMessage('code_update', {
            code: `console.log("Updated edit ${editIndex} by ${userId}");`
          }, {
            connectionId: desktopClient.connectionId,
            snippetId
          }));

          // Browser receives update
          const codeUpdate = await browserClient.waitForMessage(msg =>
            msg.type === 'code_update' && 
            msg.payload.snippetId === snippetId
          );

          return { editRequest, codeUpdate };
        })
      );

      const results = await Promise.all(editPromises);
      const concurrentTime = Date.now() - startTime;

      expect(results.length).toBe(userCount * editCount);
      expect(concurrentTime).toBeLessThan(15000); // Should complete within 15 seconds

      console.log(`✓ Completed ${userCount * editCount} concurrent edit operations in ${concurrentTime}ms`);

      // Cleanup
      await Promise.all(users.flatMap(({ browserClient, desktopClient }) => [
        browserClient.close(),
        desktopClient.close()
      ]));
    }, 30000);
  });

  describe('Memory and Resource Testing', () => {

    test('should handle large payloads efficiently', async () => {
      const client = createTestClient(serverPort);
      await client.connect();
    
      // Wait for connection_init - ping doesn't require authentication
      await client.waitForMessage(msg => msg.type === 'connection_init');
    
      // Test increasingly large payloads (reduced sizes for faster testing)
      const payloadSizes = [1024, 10240, 102400]; // 1KB, 10KB, 100KB
    
      for (const size of payloadSizes) {
        const largePayload = 'x'.repeat(size);
        const startTime = Date.now();
    
        client.send(global.testUtils.createMessage('ping', {
          largeData: largePayload,
          size: size
        }, {
          connectionId: client.connectionId
        }));
    
        const response = await client.waitForMessage(msg => 
          msg.type === 'pong' && msg.payload && msg.payload.size === size
        );
    
        const responseTime = Date.now() - startTime;
        expect(responseTime).toBeLessThan(2000); // Should respond within 2 seconds
        
        console.log(`✓ Handled ${size} byte payload in ${responseTime}ms`);
      }
    
      await client.close();
    });

    test('should maintain performance under sustained load', async () => {
      const client = createTestClient(serverPort);
      await client.connect();
    
      // Wait for connection_init
      await client.waitForMessage(msg => msg.type === 'connection_init');
    
      const duration = 3000; // Reduced to 3 seconds
      const interval = 100;   // Send message every 100ms
      const expectedMessages = Math.floor(duration / interval);
    
      let messagesSent = 0;
      let messagesReceived = 0;
    
      const startTime = Date.now();
    
      // Send messages at regular intervals
      const sendInterval = setInterval(() => {
        if (Date.now() - startTime >= duration) {
          clearInterval(sendInterval);
          return;
        }
    
        client.send(global.testUtils.createMessage('ping', { 
          sequence: messagesSent 
        }, {
          connectionId: client.connectionId
        }));
        messagesSent++;
      }, interval);
    
      // Count responses
      const responsePromise = new Promise((resolve) => {
        const responseHandler = (msg) => {
          if (msg.type === 'pong') {
            messagesReceived++;
            if (messagesReceived >= expectedMessages) {
              resolve();
            }
          }
        };
    
        client.messages.forEach(responseHandler);
        const originalPush = client.messages.push;
        client.messages.push = function(msg) {
          originalPush.call(this, msg);
          responseHandler(msg);
        };
      });
    
      await responsePromise;
      clearInterval(sendInterval);
    
      const actualDuration = Date.now() - startTime;
      const messagesPerSecond = (messagesReceived * 1000) / actualDuration;
    
      expect(messagesReceived).toBeGreaterThanOrEqual(expectedMessages * 0.8); // Allow 20% tolerance
      expect(messagesPerSecond).toBeGreaterThan(8); // Should handle at least 8 msg/sec
    
      console.log(`✓ Sustained ${messagesPerSecond.toFixed(1)} msg/sec over ${actualDuration}ms (${messagesReceived}/${messagesSent} messages)`);
    
      await client.close();
    }, 20000);
  });

  describe('Session Management Performance', () => {
    test('should efficiently clean up expired sessions', async () => {
      // Create many sessions
      const sessionCount = 100;
      const now = Date.now();

      // Add expired sessions
      for (let i = 0; i < sessionCount; i++) {
        server.activeSessions.set(`expired-session-${i}`, {
          userId: `user-${i}`,
          snippetId: `snippet-${i}`,
          browserConnectionId: `browser-${i}`,
          desktopConnectionId: `desktop-${i}`,
          createdAt: now - 10000,
          lastActivity: now - 6000 // Expired (maxAge is 5000ms in test config)
        });
      }

      // Add current sessions
      for (let i = 0; i < 10; i++) {
        server.activeSessions.set(`current-session-${i}`, {
          userId: `current-user-${i}`,
          snippetId: `current-snippet-${i}`,
          browserConnectionId: `current-browser-${i}`,
          desktopConnectionId: `current-desktop-${i}`,
          createdAt: now,
          lastActivity: now
        });
      }

      expect(server.activeSessions.size).toBe(sessionCount + 10);

      const cleanupStart = Date.now();
      server.cleanupExpiredSessions();
      const cleanupTime = Date.now() - cleanupStart;

      expect(server.activeSessions.size).toBe(10); // Only current sessions remain
      expect(cleanupTime).toBeLessThan(100); // Should be very fast

      console.log(`✓ Cleaned up ${sessionCount} expired sessions in ${cleanupTime}ms`);
    });

    test('should handle session lookup performance', async () => {
      // Create many active sessions
      const sessionCount = 1000;
      const sessions = [];

      for (let i = 0; i < sessionCount; i++) {
        const sessionId = `perf-session-${i}`;
        server.activeSessions.set(sessionId, {
          userId: `user-${i}`,
          snippetId: `snippet-${i}`,
          browserConnectionId: `browser-${i}`,
          desktopConnectionId: `desktop-${i}`,
          createdAt: Date.now(),
          lastActivity: Date.now()
        });
        sessions.push(sessionId);
      }

      // Test lookup performance
      const lookupCount = 100;
      const startTime = Date.now();

      for (let i = 0; i < lookupCount; i++) {
        const randomSessionId = sessions[Math.floor(Math.random() * sessions.length)];
        const session = server.activeSessions.get(randomSessionId);
        expect(session).toBeDefined();
      }

      const lookupTime = Date.now() - startTime;
      const lookupsPerMs = lookupCount / lookupTime;

      expect(lookupTime).toBeLessThan(50); // Should be very fast
      console.log(`✓ Performed ${lookupCount} session lookups in ${lookupTime}ms (${lookupsPerMs.toFixed(2)} lookups/ms)`);

      // Cleanup
      server.activeSessions.clear();
    });
  });

  describe('Error Handling Performance', () => {
    test('should handle errors without performance degradation', async () => {
      const client = createTestClient(serverPort);
      await client.connect();

      // Wait for connection_init
      await client.waitForMessage(msg => msg.type === 'connection_init');

      const errorCount = 25; // Reduced for faster testing
      const startTime = Date.now();

      // Send many invalid messages
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
        8000
      );

      const errorHandlingTime = Date.now() - startTime;
      const errorsPerSecond = (errorCount * 1000) / errorHandlingTime;

      expect(errorMessages.length).toBe(errorCount);
      expect(errorHandlingTime).toBeLessThan(5000); // Should handle errors quickly
      expect(errorsPerSecond).toBeGreaterThan(5); // Should handle at least 5 errors/sec

      console.log(`✓ Handled ${errorCount} errors in ${errorHandlingTime}ms (${errorsPerSecond.toFixed(1)} errors/sec)`);

      await client.close();
    }, 15000);
  });
});
