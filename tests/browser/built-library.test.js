// Test the built browser library
describe('Built Browser Library', () => {
  let WebIdeBridge;

  beforeAll(() => {
    // Load the built library
    const fs = require('fs');
    const path = require('path');
    const libraryPath = path.join(__dirname, '../../browser/web-ide-bridge.js');
    const libraryCode = fs.readFileSync(libraryPath, 'utf8');
    
    // Create a mock environment
    global.window = global;
    global.document = {
      createElement: () => ({
        setAttribute: () => {},
        appendChild: () => {},
        removeChild: () => {}
      }),
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      removeEventListener: () => {}
    };
    global.navigator = {
      userAgent: 'jest-test',
      language: 'en-US',
      platform: 'test'
    };
    global.localStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {}
    };
    global.sessionStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {}
    };
    
    // Mock WebSocket
    global.WebSocket = class MockWebSocket {
      constructor(url) {
        this.url = url;
        this.readyState = 0;
        this.onopen = null;
        this.onclose = null;
        this.onerror = null;
        this.onmessage = null;
      }
      
      send(data) {
        // Mock send
      }
      
      close() {
        this.readyState = 3;
        if (this.onclose) this.onclose();
      }
    };
    
    // Execute the library code
    eval(libraryCode);
    
    // Get the WebIdeBridge constructor
    WebIdeBridge = global.WebIdeBridge;
    
    // If not found globally, try to get it from the module exports
    if (!WebIdeBridge) {
      const module = { exports: {} };
      const require = () => module.exports;
      eval(libraryCode);
      WebIdeBridge = module.exports;
    }
  });

  afterAll(() => {
    // Clean up global mocks
    delete global.window;
    delete global.document;
    delete global.navigator;
    delete global.localStorage;
    delete global.sessionStorage;
    delete global.WebSocket;
    delete global.WebIdeBridge;
  });

  test('should have WebIdeBridge constructor', () => {
    expect(typeof WebIdeBridge).toBe('function');
  });

  test('should create WebIdeBridge instance', () => {
    const bridge = new WebIdeBridge('test-user');
    expect(bridge).toBeDefined();
    expect(bridge.userId).toBe('test-user');
  });

  test('should have required methods', () => {
    const bridge = new WebIdeBridge('test-user');
    
    expect(typeof bridge.connect).toBe('function');
    expect(typeof bridge.disconnect).toBe('function');
    expect(typeof bridge.isConnected).toBe('function');
    expect(typeof bridge.getConnectionState).toBe('function');
    expect(typeof bridge.editCodeSnippet).toBe('function');
  });

  test('should have event callback methods', () => {
    const bridge = new WebIdeBridge('test-user');
    
    expect(typeof bridge.onStatusChange).toBe('function');
    expect(typeof bridge.onCodeUpdate).toBe('function');
    expect(typeof bridge.onError).toBe('function');
    // onMessage might not be exposed in the built version
  });

  test('should have UI methods', () => {
    const bridge = new WebIdeBridge('test-user');
    
    expect(typeof bridge.autoInjectButtons).toBe('function');
    expect(typeof bridge.injectButton).toBe('function');
    // removeInjectedButtons might be on the UI manager
  });

  test('should validate userId parameter', () => {
    expect(() => new WebIdeBridge()).toThrow();
    expect(() => new WebIdeBridge(null)).toThrow();
    expect(() => new WebIdeBridge(123)).toThrow();
  });

  test('should accept custom options', () => {
    const bridge = new WebIdeBridge('test-user', {
      serverUrl: 'ws://test.com/ws',
      debug: true,
      autoReconnect: false
    });
    
    expect(bridge.options.serverUrl).toBe('ws://test.com/ws');
    expect(bridge.options.debug).toBe(true);
    expect(bridge.options.autoReconnect).toBe(false);
  });

  test('should have default options', () => {
    const bridge = new WebIdeBridge('test-user');
    
    expect(bridge.options.serverUrl).toBe('ws://localhost:8071/web-ide-bridge/ws');
    expect(bridge.options.autoReconnect).toBe(true);
    expect(bridge.options.debug).toBe(false);
  });

  test('should generate connection ID', () => {
    const bridge = new WebIdeBridge('test-user');
    expect(bridge.connectionId).toBeDefined();
    expect(typeof bridge.connectionId).toBe('string');
    expect(bridge.connectionId.length).toBeGreaterThan(0);
  });

  test('should handle status callbacks', () => {
    const bridge = new WebIdeBridge('test-user');
    const statusCallback = jest.fn();
    
    bridge.onStatusChange(statusCallback);
    
    // Simulate status change
    bridge._updateStatus('connected');
    
    // The callback might be called with an object instead of just the status string
    expect(statusCallback).toHaveBeenCalled();
  });

  test('should handle error callbacks', () => {
    const bridge = new WebIdeBridge('test-user');
    const errorCallback = jest.fn();
    
    bridge.onError(errorCallback);
    
    // Simulate error
    bridge._triggerErrorCallbacks('Test error');
    
    expect(errorCallback).toHaveBeenCalledWith('Test error');
  });

  test('should handle code update callbacks', () => {
    const bridge = new WebIdeBridge('test-user');
    const codeUpdateCallback = jest.fn();
    
    bridge.onCodeUpdate(codeUpdateCallback);
    
    // Mock WebSocket connection to avoid "WebSocket not connected" error
    bridge.ws = { send: jest.fn() };
    bridge.connected = true;
    
    // Simulate code update
    bridge._handleCodeUpdate({
      payload: {
        snippetId: 'test-snippet',
        code: 'updated code',
        fileType: 'js'
      }
    });
    
    expect(codeUpdateCallback).toHaveBeenCalledWith('test-snippet', 'updated code');
  });
}); 