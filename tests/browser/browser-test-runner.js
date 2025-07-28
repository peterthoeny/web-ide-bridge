/**
 * Browser Test Runner
 * Simple test runner for browser library tests without Jest dependency
 */

// Mock DOM environment for Node.js
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost'
});

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.location = dom.window.location;

// Mock MutationObserver
global.MutationObserver = class MutationObserver {
  constructor(callback) {
    this.callback = callback;
  }
  observe() {}
  disconnect() {}
};

// Mock WebSocket
class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0; // CONNECTING
    this.onopen = null;
    this.onclose = null;
    this.onerror = null;
    this.onmessage = null;
    this.sentMessages = [];
  }

  send(data) {
    this.sentMessages.push(JSON.parse(data));
  }

  close(code = 1000, reason = '') {
    this.readyState = 3; // CLOSED
    if (this.onclose) {
      this.onclose({ code, reason });
    }
  }

  // Helper methods for testing
  simulateOpen() {
    this.readyState = 1; // OPEN
    if (this.onopen) {
      this.onopen();
    }
  }

  simulateMessage(data) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) });
    }
  }

  simulateError(error) {
    if (this.onerror) {
      this.onerror(error);
    }
  }

  simulateClose(code = 1000, reason = '') {
    this.readyState = 3; // CLOSED
    if (this.onclose) {
      this.onclose({ code, reason });
    }
  }
}

global.WebSocket = MockWebSocket;

// Simple test framework
class TestRunner {
  constructor() {
    this.tests = [];
    this.currentTest = null;
    this.passed = 0;
    this.failed = 0;
    this.errors = [];
  }

  describe(name, fn) {
    console.log(`\n🧪 ${name}`);
    fn();
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  expect(value) {
    return {
      toBe: (expected) => {
        if (value !== expected) {
          throw new Error(`Expected ${value} to be ${expected}`);
        }
      },
      toEqual: (expected) => {
        if (JSON.stringify(value) !== JSON.stringify(expected)) {
          throw new Error(`Expected ${JSON.stringify(value)} to equal ${JSON.stringify(expected)}`);
        }
      },
      toContain: (expected) => {
        if (!String(value).includes(expected)) {
          throw new Error(`Expected ${value} to contain ${expected}`);
        }
      },
      toBeDefined: () => {
        if (value === undefined || value === null) {
          throw new Error(`Expected value to be defined, but got ${value}`);
        }
      },
      toThrow: (expected) => {
        try {
          value();
          throw new Error('Expected function to throw');
        } catch (error) {
          if (expected && !error.message.includes(expected)) {
            throw new Error(`Expected error to contain "${expected}" but got "${error.message}"`);
          }
        }
      }
    };
  }

  beforeEach(fn) {
    this.beforeEachFn = fn;
  }

  afterEach(fn) {
    this.afterEachFn = fn;
  }

  async run() {
    console.log('🚀 Starting Browser Tests\n');
    
    for (const test of this.tests) {
      try {
        if (this.beforeEachFn) {
          this.beforeEachFn();
        }
        
        await test.fn();
        console.log(`  ✅ ${test.name}`);
        this.passed++;
      } catch (error) {
        console.log(`  ❌ ${test.name}`);
        console.log(`     Error: ${error.message}`);
        this.failed++;
        this.errors.push({ test: test.name, error: error.message });
      } finally {
        if (this.afterEachFn) {
          this.afterEachFn();
        }
      }
    }

    console.log('\n==================================================');
    console.log('📊 Browser Test Summary');
    console.log('==================================================');
    console.log(`✅ Passed: ${this.passed}`);
    console.log(`❌ Failed: ${this.failed}`);
    console.log(`📈 Total: ${this.passed + this.failed}`);
    
    if (this.errors.length > 0) {
      console.log('\n❌ Errors:');
      this.errors.forEach(({ test, error }) => {
        console.log(`  ${test}: ${error}`);
      });
    }

    if (this.failed === 0) {
      console.log('\n🎉 All browser tests passed!');
    } else {
      console.log('\n💥 Some browser tests failed!');
      process.exit(1);
    }
  }
}

// Create global test functions
const runner = new TestRunner();
global.describe = runner.describe.bind(runner);
global.test = runner.test.bind(runner);
global.expect = runner.expect.bind(runner);
global.beforeEach = runner.beforeEach.bind(runner);
global.afterEach = runner.afterEach.bind(runner);

// Load and run tests
async function runTests() {
  try {
    // Load the browser library
    const WebIdeBridge = require('../../browser/web-ide-bridge.js');
    global.WebIdeBridge = WebIdeBridge;

    // Run the tests
    await runner.run();
  } catch (error) {
    console.error('❌ Test runner error:', error.message);
    process.exit(1);
  }
}

// Export for use in test files
module.exports = { runTests, TestRunner }; 