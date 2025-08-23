/**
 * @name            Web-IDE-Bridge / Tests / Server
 * @tagline         Server-specific test setup
 * @description     Setup for Web-IDE-Bridge server tests
 * @file            tests/server/setup-server.js
 * @version         1.1.6
 * @release         2025-08-23
 * @repository      https://github.com/peterthoeny/web-ide-bridge
 * @author          Peter Thoeny, https://twiki.org & https://github.com/peterthoeny/
 * @copyright       2025 Peter Thoeny, https://twiki.org & https://github.com/peterthoeny/
 * @license         GPL v3, see LICENSE file
 * @genai           99%, Cursor 1.2, Claude Sonnet 4
 */

// Server-specific test setup
process.env.NODE_ENV = 'test';
process.env.WEB_IDE_BRIDGE_PORT = '0';
process.env.WEB_IDE_BRIDGE_SECRET = 'test-secret-key-for-testing';

// Optimize for WebSocket testing
process.env.UV_THREADPOOL_SIZE = '4';

// Increase event emitter limits for WebSocket connections
require('events').EventEmitter.defaultMaxListeners = 20;

// Set WebSocket-specific timeouts
global.WEBSOCKET_TIMEOUT = 10000;
global.SERVER_STARTUP_TIMEOUT = 5000;
global.SERVER_SHUTDOWN_TIMEOUT = 5000;

// Add WebSocket test utilities
global.createTestServer = async (configOverrides = {}) => {
  const WebIdeBridgeServer = require('../../server/web-ide-bridge-server');
  const testConfig = global.testUtils.createTestConfig(configOverrides);
  const server = new WebIdeBridgeServer(testConfig);
  
  // Add to global cleanup
  global.testServers.add(server);
  
  return server;
};

// Add WebSocket connection helper
global.waitForWebSocketReady = async (client, timeout = 5000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (client.connected && client.ws.readyState === 1) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(`WebSocket not ready after ${timeout}ms`);
};

// Add message waiting helper with better error handling
global.waitForMessageWithRetry = async (client, predicate, timeout = 10000, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await client.waitForMessage(predicate, timeout);
    } catch (error) {
      if (i === retries - 1) throw error;
      // Wait a bit before retrying
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
};
