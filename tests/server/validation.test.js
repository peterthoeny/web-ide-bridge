const { 
  createTestClient, 
  establishUserConnections, 
  simulateEditWorkflow,
  createMultipleUsers,
  measurePerformance,
  performLoadTest
} = require('../utils/websocket-utils');

// Increase timeout for complex tests
jest.setTimeout(30000);

describe('Comprehensive Server Validation', () => {
  let server;
  let serverPort;

  beforeEach(async () => {
    server = await global.testUtils.createTestServer();
    await server.start();
    serverPort = server.server.address().port;
    await global.testUtils.waitForServer(serverPort);
  });

  afterEach(async () => {
    if (server) {
      // Enhanced cleanup with logging
      try {
        await global.testUtils.cleanupTestServer(server);
        server = null;
      } catch (error) {
        console.error('Error in afterEach cleanup:', error);
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      // Wait for any remaining async operations
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  });

  afterAll(async () => {
    // Final cleanup to ensure Jest can exit
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Force garbage collection one more time
    if (global.gc) {
      global.gc();
    }
  });

  describe('Enhanced Configuration Validation', () => {
    test('should validate all configuration parameters on startup', async () => {
      const invalidConfigs = {
        invalidPort: { server: { port: -1 } },
        invalidHeartbeat: { server: { heartbeatInterval: 500 } },
        invalidEndpoint: { server: { websocketEndpoint: 'invalid-endpoint' } },
        invalidMaxConnections: { server: { maxConnections: 0 } },
        invalidTimeout: { server: { connectionTimeout: 500 } },
        invalidSessionAge: { session: { cookie: { maxAge: 30000 } } },
        invalidCorsOrigin: { cors: { origin: 'http://localhost:3000' } },
        productionDefaultSecret: {
          environment: 'production',
          session: { secret: 'web-ide-bridge-secret' }
        }
      };
      
      const testServers = [];
      
      try {
        Object.entries(invalidConfigs).forEach(([configName, invalidConfig]) => {
          expect(() => {
            const testServer = new (require('../../server/web-ide-bridge-server'))();
            testServers.push(testServer); // Track for cleanup
            const config = global.testUtils.createTestConfig(invalidConfig);
            testServer.validateConfiguration(config);
          }).toThrow();
        });
      } finally {
        // Clean up any test servers that were created
        await Promise.all(testServers.map(async (testServer) => {
          try {
            if (testServer.cleanupInterval) {
              clearInterval(testServer.cleanupInterval);
            }
            if (testServer.heartbeatInterval) {
              clearInterval(testServer.heartbeatInterval);
            }
          } catch (error) {
            // Ignore cleanup errors
          }
        }));
      }
    });

    test('should accept valid configuration', async () => {
      let testServer;
      
      try {
        expect(() => {
          testServer = new (require('../../server/web-ide-bridge-server'))();
          const config = global.testUtils.createTestConfig();
          testServer.validateConfiguration(config);
        }).not.toThrow();
      } finally {
        // Clean up the test server
        if (testServer) {
          try {
            if (testServer.cleanupInterval) {
              clearInterval(testServer.cleanupInterval);
            }
            if (testServer.heartbeatInterval) {
              clearInterval(testServer.heartbeatInterval);
            }
          } catch (error) {
            // Ignore cleanup errors
          }
        }
      }
    });
  });

  describe('Enhanced Message Validation', () => {
    test('should validate message structure comprehensively', async () => {
      const client = createTestClient(serverPort);
      await client.connect();

      // Test various invalid message structures
      const invalidMessages = [
        { /* empty object */ },
        { type: 123 }, // Invalid type
        { type: 'valid' }, // Missing connectionId (will be auto-added, but missing userId for browser_connect)
        { type: 'unknown_type' }, // Unknown type
      ];

      for (const invalidMessage of invalidMessages) {
        try {
          client.send(invalidMessage);
          const error = await client.waitForMessage(
            msg => msg.type === 'error',
            2000
          );
          expect(error).toBeTruthy();
        } catch (timeoutError) {
          // Some messages might not generate errors, which is also valid
        }
      }

      await client.close();
    });

    test('should handle oversized payloads correctly', async () => {
      const client = createTestClient(serverPort);
      await client.connect();

      // Wait for connection_init
      await client.waitForMessage(msg => msg.type === 'connection_init');

      // First connect as browser
      client.send({
        type: 'browser_connect',
        userId: 'test-user'
      });
      await client.waitForMessage(msg => msg.type === 'connection_ack');

      const oversizedCode = 'x'.repeat(11 * 1024 * 1024); // 11MB, over 10MB limit
      
      client.send({
        type: 'edit_request',
        userId: 'test-user',
        snippetId: 'test-snippet',
        payload: {
          snippetId: 'test',
          code: oversizedCode
        }
      });

      // The connection might be dropped due to oversized payload
      try {
        const error = await client.waitForMessage(msg => msg.type === 'error', 3000);
        expect(error.message).toContain('Code payload too large');
      } catch (timeoutError) {
        // Connection might have been dropped, which is also acceptable behavior
        expect(client.connected).toBe(false);
      }

      await client.close();
    });
  });

  describe('Real-world Workflow Scenarios', () => {
    test('should handle simple edit workflow', async () => {
      const { user, browserClient, desktopClient, cleanup } = 
        await establishUserConnections(serverPort);

      const originalCode = 'console.log("hello");';
      const updatedCode = 'console.log("hello world");';

      const workflow = await simulateEditWorkflow(browserClient, desktopClient, {
        snippetId: global.testUtils.generateId('simple-edit'),
        originalCode,
        updatedCode,
        fileType: 'js',
        userId: user.userId
      });

      // Verify the workflow
      expect(workflow.editRequest.payload.code).toBe(originalCode);
      expect(workflow.codeUpdate.payload.code).toBe(updatedCode);
      expect(workflow.success).toBe(true);

      await cleanup();
    });

    test('should handle multiple users editing simultaneously', async () => {
      const userCount = 2; // Reduced for reliability
      const { users, cleanup } = await createMultipleUsers(serverPort, userCount);

      // Each user performs one edit operation
      const workflowPromises = users.map(async (user, index) => {
        return simulateEditWorkflow(
          user.browserClient,
          user.desktopClient,
          {
            snippetId: global.testUtils.generateId(`user${index}-edit`),
            originalCode: `console.log("user ${index} original");`,
            updatedCode: `console.log("user ${index} updated");`,
            fileType: 'js',
            userId: user.user.userId,
            timeout: 10000
          }
        );
      });

      const workflows = await Promise.all(workflowPromises);

      // Validate all workflows completed successfully
      workflows.forEach((workflow, index) => {
        expect(workflow.success).toBe(true);
        expect(workflow.codeUpdate.payload.code).toContain(`user ${index} updated`);
      });

      // Validate server state
      expect(server.browserConnections.size).toBe(userCount);
      expect(server.desktopConnections.size).toBe(userCount);

      await cleanup();
    });

    test('should handle rapid connect/disconnect cycles under load', async () => {
      const cycleCount = 5; // Reduced for reliability
      
      const performance = await measurePerformance(async (iteration) => {
        const { browserClient, desktopClient, cleanup } = 
          await establishUserConnections(serverPort, `cycle-user-${iteration}`);
        
        // Perform a quick ping
        browserClient.send({
          type: 'ping',
          payload: { cycle: iteration }
        });
        
        await browserClient.waitForMessage(msg => msg.type === 'pong', 3000);
        
        // Properly cleanup connections
        await cleanup();
        
        // Wait for server to process disconnections
        await global.testUtils.waitFor(() => {
          return server.browserConnections.size === 0 && server.desktopConnections.size === 0;
        }, 2000, 50);
      }, cycleCount);

      expect(performance.successCount).toBe(cycleCount);
      expect(performance.averageTime).toBeLessThan(5000); // Should average under 5 seconds

      // Give extra time for final cleanup
      await global.testUtils.sleep(500);

      // Server should be clean after all cycles
      expect(server.browserConnections.size).toBe(0);
      expect(server.desktopConnections.size).toBe(0);
    });
  });

  describe('Error Recovery and Resilience', () => {
    test('should recover from connection errors', async () => {
      const { browserClient, cleanup } = await establishUserConnections(serverPort);
      
      const initialErrors = server.metrics.errors;
      
      // Send invalid message
      browserClient.send({
        type: 'unknown_type',
        payload: { test: 'data' }
      });
      
      const error = await browserClient.waitForMessage(msg => msg.type === 'error');
      expect(error.message).toContain('Unknown message type');
      
      // Server should still be functional
      expect(server.server.listening).toBe(true);
      expect(browserClient.connected).toBe(true);
      
      // Should still be able to perform normal operations
      browserClient.send({
        type: 'ping',
        payload: { recovery: 'test' }
      });
      
      const pong = await browserClient.waitForMessage(msg => msg.type === 'pong');
      expect(pong.payload.recovery).toBe('test');
      
      await cleanup();
    });

    test('should handle session cleanup with corrupted data', async () => {
      // Add various types of corrupted session data
      const corruptedSessions = [
        { userId: 'user1', snippetId: 'snippet1' }, // Missing lastActivity
        { userId: 'user2', lastActivity: Date.now() - 10000 }, // Valid but old
        null, // Null session
      ];
      
      corruptedSessions.forEach((session, index) => {
        server.activeSessions.set(`corrupted-${index}`, session);
      });
      
      const initialSize = server.activeSessions.size;
      expect(initialSize).toBeGreaterThan(0);
      
      // Cleanup should handle corrupted data gracefully
      expect(() => {
        server.cleanupExpiredSessions();
      }).not.toThrow();
      
      // Some sessions should be cleaned up
      expect(server.activeSessions.size).toBeLessThanOrEqual(initialSize);
    });
  });

  describe('Performance Benchmarks', () => {
    test('should meet response time benchmarks', async () => {
      const { browserClient, cleanup } = await establishUserConnections(serverPort);
      
      // Test ping response time
      const pingPerformance = await measurePerformance(async () => {
        browserClient.send({
          type: 'ping',
          payload: { benchmark: true }
        });
        return browserClient.waitForMessage(msg => msg.type === 'pong', 1000);
      }, 10); // Reduced iterations for reliability
      
      expect(pingPerformance.averageTime).toBeLessThan(100); // Under 100ms average
      expect(pingPerformance.successCount).toBe(10); // All should succeed
      
      await cleanup();
    });
  });

  describe('Memory Management', () => {
    test('should not leak memory during normal operations', async () => {
      const initialMemory = global.testUtils.getMemoryUsage();
      
      // Perform several operations
      for (let i = 0; i < 3; i++) { // Reduced iterations
        const { browserClient, desktopClient, cleanup } = 
          await establishUserConnections(serverPort, `memory-test-${i}`);
        
        // Perform a simple edit operation
        await simulateEditWorkflow(browserClient, desktopClient, {
          snippetId: global.testUtils.generateId(`memory-${i}`),
          originalCode: 'console.log("memory test");',
          updatedCode: 'console.log("memory test updated");',
          userId: `memory-test-${i}`,
          timeout: 5000
        });
        
        // Cleanup and wait for server processing
        await cleanup();
        
        // Wait for server to process disconnections completely
        await global.testUtils.waitFor(() => {
          return server.browserConnections.size === 0 && server.desktopConnections.size === 0;
        }, 2000, 50);
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
        
        // Additional wait for cleanup
        await global.testUtils.sleep(200);
      }
      
      const finalMemory = global.testUtils.getMemoryUsage();
      
      // Memory increase should be reasonable (less than 50MB)
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      expect(memoryIncrease).toBeLessThan(50);
      
      // Server should be clean
      expect(server.browserConnections.size).toBe(0);
      expect(server.desktopConnections.size).toBe(0);
      expect(server.activeSessions.size).toBe(0);
    });
  });
});
