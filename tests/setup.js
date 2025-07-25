const path = require('path');
const fs = require('fs');

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.WEB_IDE_BRIDGE_PORT = '0'; // Use random port for tests
process.env.WEB_IDE_BRIDGE_SECRET = 'test-secret-key-for-testing';

// Increase timeout for WebSocket tests
jest.setTimeout(20000);

// Increase max listeners for process events during testing
process.setMaxListeners(20);

// Mock console.log in tests to reduce noise
global.originalConsoleLog = console.log;
global.originalConsoleError = console.error;
global.originalConsoleWarn = console.warn;

// Track created servers for cleanup
global.testServers = new Set();

beforeEach(() => {
  // Suppress console output in tests unless DEBUG is set
  if (!process.env.DEBUG_TESTS) {
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();
  }
});

afterEach(async () => {
  // Restore console output
  if (!process.env.DEBUG_TESTS) {
    console.log = global.originalConsoleLog;
    console.error = global.originalConsoleError;
    console.warn = global.originalConsoleWarn;
  }

  // Clean up any remaining test servers
  const serverCleanupPromises = Array.from(global.testServers).map(async (server) => {
    try {
      if (server && typeof server.shutdown === 'function') {
        await server.shutdown();
      }
    } catch (error) {
      // Ignore cleanup errors
    }
    global.testServers.delete(server);
  });

  await Promise.allSettled(serverCleanupPromises);
});

// Enhanced global test utilities
global.testUtils = {
  // Project root path
  rootPath: path.resolve(__dirname, '..'),
  
  // Component paths
  serverPath: path.resolve(__dirname, '../server'),
  browserPath: path.resolve(__dirname, '../browser'),
  desktopPath: path.resolve(__dirname, '../desktop'),

  // Create test configuration for server
  createTestConfig: (overrides = {}) => {
    const baseConfig = {
      server: {
        port: 0, // Use random port
        host: 'localhost',
        websocketEndpoint: '/web-ide-bridge/ws',
        heartbeatInterval: 1000, // Faster for tests
        maxConnections: 100,
        connectionTimeout: 5000
      },
      endpoints: {
        health: '/web-ide-bridge/health',
        status: '/web-ide-bridge/status',
        debug: '/web-ide-bridge/debug',
        websocket: '/web-ide-bridge/ws'
      },
      cors: {
        origin: ['http://localhost:3000', 'http://localhost:8080'],
        credentials: true,
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization']
      },
      session: {
        secret: 'test-secret-key',
        name: 'test-session',
        cookie: { 
          maxAge: 60000,
          secure: false,
          httpOnly: true,
          sameSite: 'lax'
        },
        resave: false,
        saveUninitialized: false,
        rolling: true
      },
      security: {
        rateLimiting: {
          enabled: false, // Disable for tests by default
          windowMs: 1000,
          maxRequests: 100,
          maxWebSocketConnections: 10
        },
        helmet: {
          enabled: false // Disable for tests
        }
      },
      logging: {
        level: 'error', // Minimal logging in tests
        enableAccessLog: false
      },
      cleanup: {
        sessionCleanupInterval: 1000, // Fast cleanup for tests
        maxSessionAge: 5000,
        enablePeriodicCleanup: true
      },
      debug: process.env.DEBUG_TESTS === 'true',
      environment: 'test'
    };

    // Deep merge overrides
    return global.testUtils.deepMerge(baseConfig, overrides);
  },

  // Create a test server with proper cleanup tracking
  createTestServer: async (configOverrides = {}) => {
    const WebIdeBridgeServer = require('../server/web-ide-bridge-server');
    const server = new WebIdeBridgeServer();
    
    // Override config for testing
    server.config = global.testUtils.createTestConfig(configOverrides);
    
    // Track server for cleanup
    global.testServers.add(server);
    
    return server;
  },

  // Clean up a test server
  cleanupTestServer: async (server) => {
    if (server && global.testServers.has(server)) {
      try {
        await server.shutdown();
      } catch (error) {
        // Ignore cleanup errors
      }
      global.testServers.delete(server);
    }
  },

  // Deep merge utility
  deepMerge: (target, source) => {
    const result = { ...target };
    
    for (const [key, value] of Object.entries(source)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        result[key] = global.testUtils.deepMerge(result[key] || {}, value);
      } else {
        result[key] = value;
      }
    }
    
    return result;
  },

  // Enhanced wait utilities
  waitFor: async (condition, timeout = 5000, interval = 100) => {
    const start = Date.now();
    let lastError = null;
    
    while (Date.now() - start < timeout) {
      try {
        const result = await condition();
        if (result) {
          return result;
        }
      } catch (error) {
        lastError = error;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    const timeoutError = new Error(`Timeout after ${timeout}ms waiting for condition`);
    if (lastError) {
      timeoutError.cause = lastError;
    }
    throw timeoutError;
  },

  // Wait for server to be ready with retry logic
  waitForServer: async (port, timeout = 5000, endpoint = '/web-ide-bridge/health') => {
    return global.testUtils.waitFor(async () => {
      try {
        const response = await fetch(`http://localhost:${port}${endpoint}`, {
          signal: AbortSignal.timeout(1000)
        });
        return response.ok;
      } catch (error) {
        return false;
      }
    }, timeout, 200);
  },

  // Enhanced message creation with validation
  createMessage: (type, payload = {}, overrides = {}) => {
    const message = {
      type,
      connectionId: `test-conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId: 'test-user',
      snippetId: `test-snippet-${Date.now()}`,
      payload,
      timestamp: Date.now(),
      ...overrides
    };

    // Validate message structure
    if (!message.type) {
      throw new Error('Message must have a type');
    }
    if (!message.connectionId) {
      throw new Error('Message must have a connectionId');
    }

    return message;
  },

  // Create test user data with enhanced fields
  createTestUser: (id = null) => {
    const userId = id || `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    return {
      userId,
      connectionId: `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      snippetId: `snippet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
      profile: {
        name: `Test User ${userId}`,
        role: 'developer',
        preferences: {
          ide: 'vscode',
          theme: 'dark'
        }
      }
    };
  },

  // Generate unique IDs with different strategies
  generateId: (prefix = 'test', strategy = 'timestamp') => {
    switch (strategy) {
      case 'timestamp':
        return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      case 'uuid':
        return `${prefix}-${Math.random().toString(36).substr(2, 9)}-${Math.random().toString(36).substr(2, 9)}-${Math.random().toString(36).substr(2, 9)}`;
      case 'sequential':
        global.testUtils._sequenceCounter = (global.testUtils._sequenceCounter || 0) + 1;
        return `${prefix}-${global.testUtils._sequenceCounter}`;
      default:
        return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
  },

  // Sleep utility for tests
  sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

  // Enhanced assertion helpers
  assertMessageStructure: (message, expectedType = null) => {
    expect(message).toBeDefined();
    expect(typeof message).toBe('object');
    expect(message).toHaveProperty('type');
    
    if (expectedType) {
      expect(message.type).toBe(expectedType);
    }
    
    // Common fields that should exist
    if (message.type !== 'error') {
      expect(message).toHaveProperty('timestamp');
    }
    
    return message;
  },

  assertConnection: (connectionInfo) => {
    expect(connectionInfo).toBeDefined();
    expect(connectionInfo).toHaveProperty('connectionId');
    expect(connectionInfo).toHaveProperty('connected');
    expect(connectionInfo.connected).toBe(true);
    
    return connectionInfo;
  },

  assertServerState: (server, expectedState = {}) => {
    expect(server).toBeDefined();
    expect(server.server.listening).toBe(true);
    
    if (expectedState.browserConnections !== undefined) {
      expect(server.browserConnections.size).toBe(expectedState.browserConnections);
    }
    
    if (expectedState.desktopConnections !== undefined) {
      expect(server.desktopConnections.size).toBe(expectedState.desktopConnections);
    }
    
    if (expectedState.activeSessions !== undefined) {
      expect(server.activeSessions.size).toBe(expectedState.activeSessions);
    }
    
    return server;
  },

  // Test data generators
  generateCodeSnippet: (language = 'javascript', complexity = 'simple') => {
    const snippets = {
      javascript: {
        simple: 'console.log("Hello, World!");',
        medium: `function greet(name) {\n  return \`Hello, \${name}!\`;\n}\n\nconsole.log(greet("World"));`,
        complex: `class Calculator {\n  constructor() {\n    this.history = [];\n  }\n\n  add(a, b) {\n    const result = a + b;\n    this.history.push({ operation: 'add', inputs: [a, b], result });\n    return result;\n  }\n\n  getHistory() {\n    return this.history;\n  }\n}`
      },
      css: {
        simple: '.container { width: 100%; }',
        medium: `.container {\n  width: 100%;\n  max-width: 1200px;\n  margin: 0 auto;\n  padding: 1rem;\n}`,
        complex: `@media (min-width: 768px) {\n  .container {\n    display: grid;\n    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));\n    gap: 2rem;\n  }\n\n  .card {\n    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);\n    border-radius: 8px;\n    padding: 2rem;\n    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);\n  }\n}`
      },
      html: {
        simple: '<div>Hello World</div>',
        medium: `<div class="container">\n  <h1>Welcome</h1>\n  <p>This is a test page.</p>\n</div>`,
        complex: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Test Page</title>\n</head>\n<body>\n  <main class="container">\n    <header>\n      <h1>Web IDE Bridge Test</h1>\n    </header>\n    <section>\n      <p>Testing code synchronization.</p>\n    </section>\n  </main>\n</body>\n</html>`
      }
    };
    
    return snippets[language]?.[complexity] || snippets.javascript.simple;
  },

  // Performance measurement utilities
  measureExecutionTime: async (fn, iterations = 1) => {
    const times = [];
    
    for (let i = 0; i < iterations; i++) {
      const start = process.hrtime.bigint();
      await fn();
      const end = process.hrtime.bigint();
      times.push(Number(end - start) / 1000000); // Convert to milliseconds
    }
    
    return {
      times,
      average: times.reduce((a, b) => a + b, 0) / times.length,
      min: Math.min(...times),
      max: Math.max(...times),
      total: times.reduce((a, b) => a + b, 0)
    };
  },

  // Memory monitoring
  getMemoryUsage: () => {
    const usage = process.memoryUsage();
    return {
      rss: Math.round(usage.rss / 1024 / 1024), // MB
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
      external: Math.round(usage.external / 1024 / 1024), // MB
      arrayBuffers: Math.round(usage.arrayBuffers / 1024 / 1024) // MB
    };
  },

  // Test environment utilities
  isCI: () => {
    return process.env.CI === 'true' || 
           process.env.CONTINUOUS_INTEGRATION === 'true' ||
           process.env.GITHUB_ACTIONS === 'true';
  },

  getTestTimeout: (baseTimeout = 5000) => {
    // Increase timeouts in CI environments
    return global.testUtils.isCI() ? baseTimeout * 2 : baseTimeout;
  },

  // Clean environment after tests
  cleanupEnvironment: () => {
    // Reset environment variables
    delete process.env.WEB_IDE_BRIDGE_CONFIG;
    delete process.env.WEB_IDE_BRIDGE_PORT;
    delete process.env.DEBUG;
    
    // Clear any global state
    if (global.testUtils._sequenceCounter) {
      delete global.testUtils._sequenceCounter;
    }
  }
};

// Cleanup after all tests
afterAll(async () => {
  // Final cleanup of any remaining servers
  const finalCleanupPromises = Array.from(global.testServers).map(async (server) => {
    try {
      if (server && typeof server.shutdown === 'function') {
        await server.shutdown();
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  await Promise.allSettled(finalCleanupPromises);
  global.testServers.clear();
  
  global.testUtils.cleanupEnvironment();
  
  // Force cleanup any remaining timers/handles
  await new Promise(resolve => setTimeout(resolve, 100));
});

// Global error handlers for tests
process.on('unhandledRejection', (reason, promise) => {
  if (process.env.DEBUG_TESTS) {
    console.error('Unhandled Rejection in tests:', reason);
  }
});

process.on('uncaughtException', (error) => {
  if (process.env.DEBUG_TESTS) {
    console.error('Uncaught Exception in tests:', error);
  }
});
