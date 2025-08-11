#!/usr/bin/env node

/**
 * @name            Web-IDE-Bridge / Tests / Server
 * @tagline         Standalone test runner for Web-IDE-Bridge server
 * @description     Bypasses Jest environment issues by running server tests directly
 * @file            tests/run-server-tests.js
 * @version         1.1.5
 * @release         2025-08-11
 * @repository      https://github.com/peterthoeny/web-ide-bridge
 * @author          Peter Thoeny, https://twiki.org & https://github.com/peterthoeny/
 * @copyright       2025 Peter Thoeny, https://twiki.org & https://github.com/peterthoeny/
 * @license         GPL v3, see LICENSE file
 * @genai           99%, Cursor 1.2, Claude Sonnet 4
 */

const { spawn } = require('child_process');
const path = require('path');

// Test configuration
const testConfig = {
  server: {
    port: 0, // Use random port
    host: 'localhost',
    websocketEndpoint: '/web-ide-bridge/ws',
    heartbeatInterval: 1000,
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
    origin: ['http://localhost:3000'],
    credentials: true
  },
  session: {
    secret: 'test-secret',
    name: 'test-session',
    cookie: { maxAge: 60000, secure: false, httpOnly: true, sameSite: 'lax' },
    resave: false,
    saveUninitialized: false,
    rolling: true
  },
  security: {
    rateLimiting: { enabled: false },
    helmet: { enabled: false }
  },
  logging: {
    level: 'error',
    enableAccessLog: false
  },
  cleanup: {
    sessionCleanupInterval: 1000,
    maxSessionAge: 5000,
    enablePeriodicCleanup: true
  },
  debug: false,
  environment: 'test'
};

class ServerTestRunner {
  constructor() {
    this.testResults = [];
    this.passed = 0;
    this.failed = 0;
  }

  async runTest(testName, testFunction) {
    console.log(`\n🧪 Running: ${testName}`);
    try {
      await testFunction();
      console.log(`✅ PASS: ${testName}`);
      this.passed++;
      this.testResults.push({ name: testName, status: 'PASS' });
    } catch (error) {
      console.log(`❌ FAIL: ${testName}`);
      console.error(`   Error: ${error.message}`);
      this.failed++;
      this.testResults.push({ name: testName, status: 'FAIL', error: error.message });
    }
  }

  async runAllTests() {
    console.log('🚀 Starting Standalone Server Tests\n');
    console.log('=' .repeat(50));

    // Test 1: Server Creation
    await this.runTest('Server Creation', async () => {
      const WebIdeBridgeServer = require('../server/web-ide-bridge-server');
      const server = new WebIdeBridgeServer(testConfig);
      if (!server) throw new Error('Server creation failed');
    });

    // Test 2: Server Startup
    await this.runTest('Server Startup', async () => {
      const WebIdeBridgeServer = require('../server/web-ide-bridge-server');
      const server = new WebIdeBridgeServer(testConfig);
      await server.start();
      const port = server.server.address().port;
      if (!port) throw new Error('Server did not get a port');
      await server.shutdown();
    });

    // Test 3: Health Endpoint
    await this.runTest('Health Endpoint', async () => {
      const WebIdeBridgeServer = require('../server/web-ide-bridge-server');
      const server = new WebIdeBridgeServer(testConfig);
      await server.start();
      const port = server.server.address().port;
      
      const response = await fetch(`http://localhost:${port}/web-ide-bridge/health`);
      if (!response.ok) throw new Error(`Health endpoint returned ${response.status}`);
      
      const data = await response.json();
      if (data.status !== 'healthy') throw new Error(`Expected 'healthy', got '${data.status}'`);
      
      await server.shutdown();
    });

    // Test 4: Status Endpoint
    await this.runTest('Status Endpoint', async () => {
      const WebIdeBridgeServer = require('../server/web-ide-bridge-server');
      const server = new WebIdeBridgeServer(testConfig);
      await server.start();
      const port = server.server.address().port;
      
      const response = await fetch(`http://localhost:${port}/web-ide-bridge/status`, {
        headers: { 'Accept': 'application/json' }
      });
      if (!response.ok) throw new Error(`Status endpoint returned ${response.status}`);
      
      const data = await response.json();
      if (!data.active) throw new Error('Status endpoint should show active=true');
      
      await server.shutdown();
    });

    // Test 5: WebSocket Connection
    await this.runTest('WebSocket Connection', async () => {
      const WebIdeBridgeServer = require('../server/web-ide-bridge-server');
      const WebSocket = require('ws');
      
      const server = new WebIdeBridgeServer(testConfig);
      await server.start();
      const port = server.server.address().port;
      
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${port}/web-ide-bridge/ws`);
        
        ws.on('open', () => {
          ws.close();
          resolve();
        });
        
        ws.on('error', (error) => {
          reject(new Error(`WebSocket connection failed: ${error.message}`));
        });
        
        setTimeout(() => {
          reject(new Error('WebSocket connection timeout'));
        }, 5000);
      }).finally(() => server.shutdown());
    });

    // Test 6: Configuration Loading
    await this.runTest('Configuration Loading', async () => {
      const WebIdeBridgeServer = require('../server/web-ide-bridge-server');
      const server = new WebIdeBridgeServer(testConfig);
      
      if (!server.config) throw new Error('Configuration not loaded');
      if (server.config.server.port !== 0) throw new Error('Test config not applied');
      
      await server.start();
      await server.shutdown();
    });

    // Test 7: Graceful Shutdown
    await this.runTest('Graceful Shutdown', async () => {
      const WebIdeBridgeServer = require('../server/web-ide-bridge-server');
      const server = new WebIdeBridgeServer(testConfig);
      await server.start();
      
      const startTime = Date.now();
      await server.shutdown();
      const shutdownTime = Date.now() - startTime;
      
      if (shutdownTime > 10000) throw new Error(`Shutdown took too long: ${shutdownTime}ms`);
    });

    this.printSummary();
  }

  printSummary() {
    console.log('\n' + '=' .repeat(50));
    console.log('📊 Test Summary');
    console.log('=' .repeat(50));
    console.log(`✅ Passed: ${this.passed}`);
    console.log(`❌ Failed: ${this.failed}`);
    console.log(`📈 Total: ${this.passed + this.failed}`);
    
    if (this.failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.testResults
        .filter(result => result.status === 'FAIL')
        .forEach(result => {
          console.log(`   - ${result.name}: ${result.error}`);
        });
    }
    
    console.log('\n' + '=' .repeat(50));
    
    if (this.failed === 0) {
      console.log('🎉 All tests passed!');
      process.exit(0);
    } else {
      console.log('💥 Some tests failed');
      process.exit(1);
    }
  }
}

// Run tests
if (require.main === module) {
  const runner = new ServerTestRunner();
  runner.runAllTests().catch(error => {
    console.error('Test runner error:', error);
    process.exit(1);
  });
}

module.exports = ServerTestRunner; 