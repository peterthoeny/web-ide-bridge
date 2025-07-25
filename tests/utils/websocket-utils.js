const WebSocket = require('ws');

/**
 * Enhanced WebSocket testing client with better error handling and debugging
 */
class WebSocketTestClient {
  constructor(url, options = {}) {
    this.url = url;
    this.options = options;
    this.ws = null;
    this.messages = [];
    this.errors = [];
    this.connected = false;
    this.connectionId = global.testUtils.generateId('ws-client');
    this.debugMode = process.env.DEBUG_TESTS === 'true';
    this.messageHandlers = new Map(); // For custom message handlers
    this.eventListeners = new Map(); // For event listeners
  }

  async connect(timeout = 5000) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`WebSocket connection timeout after ${timeout}ms`));
      }, timeout);

      this.ws = new WebSocket(this.url, this.options);
      
      this.ws.on('open', () => {
        clearTimeout(timeoutId);
        this.connected = true;
        
        // Set the connectionId from the websocket properties if available
        // Otherwise use our generated one
        if (!this.connectionId) {
          this.connectionId = global.testUtils?.generateId('ws-client') || `ws-${Date.now()}-${Math.random()}`;
        }
        
        if (this.debugMode) {
          console.log(`WebSocket connected: ${this.connectionId} -> ${this.url}`);
        }
        
        this._emitEvent('connected');
        resolve();
      });
      
      this.ws.on('error', (error) => {
        clearTimeout(timeoutId);
        this.errors.push({
          error,
          timestamp: Date.now(),
          context: 'connection'
        });
        
        if (this.debugMode) {
          console.error(`WebSocket error: ${this.connectionId}:`, error);
        }
        
        this._emitEvent('error', error);
        reject(error);
      });
      
      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          message._receivedAt = Date.now();
          message._clientId = this.connectionId;
          
          // Handle connection initialization from server
          if (message.type === 'connection_init' && message.connectionId) {
            this.connectionId = message.connectionId;
            if (this.debugMode) {
              console.log(`Connection ID updated from server: ${this.connectionId}`);
            }
          }
          
          this.messages.push(message);
          
          // Update our connectionId if server sends one in connection_ack
          if (message.type === 'connection_ack' && message.connectionId) {
            this.connectionId = message.connectionId;
          }
          
          if (this.debugMode) {
            console.log(`WebSocket message received: ${this.connectionId}:`, message);
          }
          
          this._emitEvent('message', message);
          this._handleMessage(message);
        } catch (error) {
          const errorMessage = { 
            error: 'Invalid JSON', 
            data: data.toString(),
            _receivedAt: Date.now(),
            _clientId: this.connectionId
          };
          this.messages.push(errorMessage);
          this.errors.push({
            error,
            data: data.toString(),
            timestamp: Date.now(),
            context: 'json_parse'
          });
          
          if (this.debugMode) {
            console.error(`WebSocket JSON parse error: ${this.connectionId}:`, error);
          }
          
          this._emitEvent('parseError', error, data);
        }
      });
      
      this.ws.on('close', (code, reason) => {
        this.connected = false;
        
        if (this.debugMode) {
          console.log(`WebSocket closed: ${this.connectionId}, code=${code}, reason=${reason}`);
        }
        
        this._emitEvent('disconnected', { code, reason });
      });

      this.ws.on('ping', (data) => {
        if (this.debugMode) {
          console.log(`WebSocket ping received: ${this.connectionId}`);
        }
        this._emitEvent('ping', data);
      });

      this.ws.on('pong', (data) => {
        if (this.debugMode) {
          console.log(`WebSocket pong received: ${this.connectionId}`);
        }
        this._emitEvent('pong', data);
      });
    });
  }

  send(message) {
    if (!this.connected || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error(`WebSocket not connected or not ready (state: ${this.ws ? this.ws.readyState : 'null'})`);
    }
    
    // Auto-inject connectionId if not present
    if (message && typeof message === 'object' && !message.connectionId) {
      message.connectionId = this.connectionId;
    }
    
    const messageStr = JSON.stringify(message);
    
    if (this.debugMode) {
      console.log(`WebSocket sending: ${this.connectionId}:`, message);
    }
    
    try {
      this.ws.send(messageStr);
      this._emitEvent('messageSent', message);
    } catch (error) {
      this.errors.push({
        error,
        message,
        timestamp: Date.now(),
        context: 'send'
      });
      throw error;
    }
  }

  async waitForMessage(predicate, timeout = 5000) {
    const start = Date.now();
    
    while (Date.now() - start < timeout) {
      const message = this.messages.find(predicate);
      if (message) {
        return message;
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    // Enhanced error message with current state
    const messageTypes = this.messages.map(m => m.type || 'unknown').join(', ');
    const errorDetails = {
      timeout,
      messageCount: this.messages.length,
      messageTypes,
      lastMessages: this.messages.slice(-3),
      connectionState: this.getConnectionState()
    };
    
    throw new Error(
      `Timeout waiting for message after ${timeout}ms. ` +
      `Received ${this.messages.length} messages with types: [${messageTypes}]. ` +
      `Connection state: ${this.connected ? 'connected' : 'disconnected'}`
    );
  }

  async waitForMessages(predicate, count, timeout = 5000) {
    const start = Date.now();
    const foundMessages = [];
    
    while (Date.now() - start < timeout && foundMessages.length < count) {
      const newMessages = this.messages.filter(predicate).slice(foundMessages.length);
      foundMessages.push(...newMessages);
      
      if (foundMessages.length >= count) {
        return foundMessages;
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    throw new Error(
      `Timeout waiting for ${count} messages, only received ${foundMessages.length}. ` +
      `Connection state: ${this.getConnectionState()}`
    );
  }

  // Enhanced waiting methods
  async waitForConnection(timeout = 5000) {
    if (this.connected) return true;
    
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Connection timeout after ${timeout}ms`));
      }, timeout);

      const handler = () => {
        clearTimeout(timeoutId);
        resolve(true);
      };

      this.once('connected', handler);
    });
  }

  async waitForDisconnection(timeout = 5000) {
    if (!this.connected) return true;
    
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Disconnection timeout after ${timeout}ms`));
      }, timeout);

      const handler = () => {
        clearTimeout(timeoutId);
        resolve(true);
      };

      this.once('disconnected', handler);
    });
  }

  // Event handling methods
  on(event, handler) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(handler);
    return this;
  }

  once(event, handler) {
    const wrappedHandler = (...args) => {
      this.off(event, wrappedHandler);
      handler(...args);
    };
    this.on(event, wrappedHandler);
    return this;
  }

  off(event, handler) {
    const handlers = this.eventListeners.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
    return this;
  }

  _emitEvent(event, ...args) {
    const handlers = this.eventListeners.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(...args);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  _handleMessage(message) {
    // Call any registered message handlers
    this.messageHandlers.forEach((handler, predicate) => {
      try {
        if (typeof predicate === 'function' ? predicate(message) : predicate === message.type) {
          handler(message);
        }
      } catch (error) {
        console.error('Error in message handler:', error);
      }
    });
  }

  // Message handling registration
  onMessage(predicate, handler) {
    this.messageHandlers.set(predicate, handler);
    return this;
  }

  offMessage(predicate) {
    this.messageHandlers.delete(predicate);
    return this;
  }

  // Enhanced query methods
  getLastMessage() {
    return this.messages[this.messages.length - 1];
  }

  getMessages(type = null) {
    if (type === null) {
      return [...this.messages];
    }
    return this.messages.filter(msg => msg.type === type);
  }

  getMessageCount(type = null) {
    return this.getMessages(type).length;
  }

  getMessagesSince(timestamp) {
    return this.messages.filter(msg => msg._receivedAt >= timestamp);
  }

  getMessagesInRange(startTime, endTime) {
    return this.messages.filter(msg => 
      msg._receivedAt >= startTime && msg._receivedAt <= endTime
    );
  }

  clearMessages() {
    this.messages = [];
    this.errors = [];
    return this;
  }

  hasMessage(predicate) {
    return this.messages.some(predicate);
  }

  hasError(predicate = null) {
    if (!predicate) return this.errors.length > 0;
    return this.errors.some(predicate);
  }

  getErrors(context = null) {
    if (!context) return [...this.errors];
    return this.errors.filter(err => err.context === context);
  }

  // Connection state methods
  getConnectionState() {
    if (!this.ws) return 'UNINITIALIZED';
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'CONNECTING';
      case WebSocket.OPEN: return 'OPEN';
      case WebSocket.CLOSING: return 'CLOSING';
      case WebSocket.CLOSED: return 'CLOSED';
      default: return 'UNKNOWN';
    }
  }

  isReady() {
    return this.connected && this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  async close(timeout = 1000) {
    if (this.ws && this.connected) {
      return new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
          // Force close if normal close doesn't work
          if (this.ws) {
            this.ws.terminate();
          }
          resolve();
        }, timeout);
        
        this.ws.on('close', () => {
          clearTimeout(timeoutId);
          resolve();
        });
        
        this.ws.close();
        this.connected = false;
      });
    }
  }

  // Utility methods
  ping(data = null) {
    if (this.isReady()) {
      this.ws.ping(data);
    } else {
      throw new Error('Cannot ping: WebSocket not ready');
    }
  }

  getConnectionInfo() {
    return {
      connectionId: this.connectionId,
      url: this.url,
      connected: this.connected,
      state: this.getConnectionState(),
      messageCount: this.messages.length,
      errorCount: this.errors.length,
      uptime: this.ws ? Date.now() - (this.ws._connectedAt || 0) : 0
    };
  }

  getStats() {
    const messageTypes = {};
    this.messages.forEach(msg => {
      const type = msg.type || 'unknown';
      messageTypes[type] = (messageTypes[type] || 0) + 1;
    });

    const errorContexts = {};
    this.errors.forEach(err => {
      errorContexts[err.context] = (errorContexts[err.context] || 0) + 1;
    });

    return {
      totalMessages: this.messages.length,
      messageTypes,
      totalErrors: this.errors.length,
      errorContexts,
      connectionInfo: this.getConnectionInfo()
    };
  }
}

/**
 * Create multiple test clients for multi-user scenarios
 */
function createTestClients(serverPort, count = 2, userPrefix = 'user') {
  const clients = [];
  
  for (let i = 0; i < count; i++) {
    const client = createTestClient(serverPort);
    client.userId = `${userPrefix}-${i + 1}`;
    client.userIndex = i;
    clients.push(client);
  }
  
  return clients;
}

/**
 * Create a test WebSocket client
 */
function createTestClient(serverPort, endpoint = '/web-ide-bridge/ws') {
  const url = `ws://localhost:${serverPort}${endpoint}`;
  return new WebSocketTestClient(url);
}

/**
 * Wait for WebSocket server to be ready
 */
async function waitForWebSocketServer(port, timeout = 5000) {
  const start = Date.now();
  
  while (Date.now() - start < timeout) {
    try {
      const client = createTestClient(port);
      await client.connect(1000); // Short timeout for individual attempts
      await client.close();
      return true;
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  throw new Error(`WebSocket server not ready on port ${port} within ${timeout}ms`);
}

/**
 * Enhanced helper to establish browser and desktop connections for a user
 */
async function establishUserConnections(serverPort, userId = null, options = {}) {
  const {
    timeout = 5000,
    skipAuth = false,
    customEndpoint = '/web-ide-bridge/ws'
  } = options;

  const user = global.testUtils.createTestUser(userId);
  
  const browserClient = createTestClient(serverPort, customEndpoint);
  const desktopClient = createTestClient(serverPort, customEndpoint);
  
  await browserClient.connect(timeout);
  await desktopClient.connect(timeout);
  
  if (!skipAuth) {
    // Connect browser
    browserClient.send(global.testUtils.createMessage('browser_connect', {}, {
      connectionId: browserClient.connectionId,
      userId: user.userId
    }));
    await browserClient.waitForMessage(msg => msg.type === 'connection_ack', timeout);
    
    // Connect desktop
    desktopClient.send(global.testUtils.createMessage('desktop_connect', {}, {
      connectionId: desktopClient.connectionId,
      userId: user.userId
    }));
    await desktopClient.waitForMessage(msg => msg.type === 'connection_ack', timeout);
  }
    
  return {
    user,
    browserClient,
    desktopClient,
    async cleanup() {
      // Close connections with proper timeout and error handling
      const closePromises = [];
      
      if (browserClient && browserClient.connected) {
        closePromises.push(browserClient.close(1000).catch(err => {
          // Ignore close errors
        }));
      }
      
      if (desktopClient && desktopClient.connected) {
        closePromises.push(desktopClient.close(1000).catch(err => {
          // Ignore close errors  
        }));
      }
      
      // Wait for all connections to close
      await Promise.allSettled(closePromises);
      
      // Additional wait for server-side cleanup processing
      await new Promise(resolve => setTimeout(resolve, 150));
    },
    async reconnectBrowser() {
      await browserClient.close();
      const newBrowserClient = createTestClient(serverPort, customEndpoint);
      await newBrowserClient.connect(timeout);
      
              if (!skipAuth) {
        newBrowserClient.send(global.testUtils.createMessage('browser_connect', {}, {
          connectionId: newBrowserClient.connectionId,
          userId: user.userId
        }));
        await newBrowserClient.waitForMessage(msg => msg.type === 'connection_ack', timeout);
      }
      
      return newBrowserClient;
    },
    async reconnectDesktop() {
      await desktopClient.close();
      const newDesktopClient = createTestClient(serverPort, customEndpoint);
      await newDesktopClient.connect(timeout);
      
      if (!skipAuth) {
        newDesktopClient.send(global.testUtils.createMessage('desktop_connect', {}, {
          connectionId: newDesktopClient.connectionId,
          userId: user.userId
        }));
        await newDesktopClient.waitForMessage(msg => msg.type === 'connection_ack', timeout);
      }
      
      return newDesktopClient;
    }
  };
}

/**
 * Enhanced simulate complete edit workflow with more options
 */
async function simulateEditWorkflow(browserClient, desktopClient, options = {}) {
  const {
    sessionId = global.testUtils.generateId('session'),
    snippetId = 'textarea-test',
    originalCode = 'console.log("hello");',
    updatedCode = 'console.log("hello world");',
    fileType = 'js',
    userId = 'test-user',
    timeout = 10000,
    expectErrors = false
  } = options;
  
  const workflow = {
    sessionId,
    snippetId,
    originalCode,
    updatedCode,
    startTime: Date.now()
  };
  
  try {
    // Step 1: Browser sends edit request
    browserClient.send({
      type: 'edit_request',
      userId,
      sessionId,
      payload: {
        snippetId,
        code: originalCode,
        fileType
      }
    });
    
    workflow.editRequestSent = Date.now();
    
    // Step 2: Desktop receives edit request
    const editRequest = await desktopClient.waitForMessage(msg => 
      msg.type === 'edit_request' && msg.sessionId === sessionId,
      timeout
    );
    
    workflow.editRequest = editRequest;
    workflow.editRequestReceived = Date.now();
    
    // Step 3: Desktop sends code update
    desktopClient.send({
      type: 'code_update',
      sessionId,
      payload: {
        code: updatedCode
      }
    });
    
    workflow.codeUpdateSent = Date.now();
    
    // Step 4: Browser receives code update
    const codeUpdate = await browserClient.waitForMessage(msg =>
      msg.type === 'code_update' && msg.payload.snippetId === snippetId,
      timeout
    );
    
    workflow.codeUpdate = codeUpdate;
    workflow.codeUpdateReceived = Date.now();
    workflow.totalDuration = workflow.codeUpdateReceived - workflow.startTime;
    workflow.success = true;
    
  } catch (error) {
    workflow.error = error;
    workflow.success = false;
    
    if (!expectErrors) {
      throw error;
    }
  }
  
  return workflow;
}

/**
 * Create multiple users with established connections
 */
async function createMultipleUsers(serverPort, userCount = 2, options = {}) {
  const users = [];
  
  for (let i = 0; i < userCount; i++) {
    const userId = `multi-user-${i + 1}`;
    const userConnections = await establishUserConnections(serverPort, userId, {
      ...options,
      timeout: 15000 // Increased timeout for multiple users
    });
    users.push(userConnections);
  }
  
  return {
    users,
    async cleanup() {
      await Promise.all(users.map(user => user.cleanup()));
    }
  };
}

/**
 * Create a test client and automatically handle connection_init
 */
async function createConnectedTestClient(serverPort, endpoint = '/web-ide-bridge/ws', timeout = 10000) {
  const client = createTestClient(serverPort, endpoint);
  await client.connect(timeout);
  await client.waitForMessage(msg => msg.type === 'connection_init', timeout);
  return client;
}

/**
 * Simulate concurrent edit operations
 */
async function simulateConcurrentEdits(users, editCount = 3, options = {}) {
  const {
    baseSnippetId = 'textarea',
    baseCode = 'console.log("edit");',
    fileType = 'js',
    timeout = 10000
  } = options;
  
  const workflows = [];
  
  for (let userIndex = 0; userIndex < users.length; userIndex++) {
    const user = users[userIndex];
    
    for (let editIndex = 0; editIndex < editCount; editIndex++) {
      const workflowPromise = simulateEditWorkflow(
        user.browserClient,
        user.desktopClient,
        {
          sessionId: global.testUtils.generateId(`user${userIndex}-edit${editIndex}`),
          snippetId: `${baseSnippetId}-${userIndex}-${editIndex}`,
          originalCode: `${baseCode} // User ${userIndex}, Edit ${editIndex}`,
          updatedCode: `${baseCode} // Updated by User ${userIndex}, Edit ${editIndex}`,
          fileType,
          userId: user.user.userId,
          timeout
        }
      );
      
      workflows.push(workflowPromise);
    }
  }
  
  return Promise.all(workflows);
}

/**
 * Test connection resilience
 */
async function testConnectionResilience(serverPort, options = {}) {
  const {
    disconnectCount = 5,
    reconnectDelay = 100,
    messageCount = 10,
    timeout = 5000
  } = options;
  
  const results = {
    totalDisconnects: 0,
    successfulReconnects: 0,
    failedReconnects: 0,
    messagesLost: 0,
    errors: []
  };
  
  const { user, browserClient, desktopClient, cleanup } = 
    await establishUserConnections(serverPort);
  
  try {
    for (let i = 0; i < disconnectCount; i++) {
      // Send some messages before disconnect
      const messagesBefore = browserClient.getMessageCount();
      
      for (let j = 0; j < messageCount; j++) {
        browserClient.send(global.testUtils.createMessage('ping', { sequence: j }));
      }
      
      // Disconnect
      await browserClient.close();
      results.totalDisconnects++;
      
      // Wait before reconnecting
      await global.testUtils.sleep(reconnectDelay);
      
      // Reconnect
      try {
        const newBrowserClient = createTestClient(serverPort);
        await newBrowserClient.connect(timeout);
        
        newBrowserClient.send(global.testUtils.createMessage('browser_connect', {}, {
          connectionId: newBrowserClient.connectionId,
          userId: user.userId
        }));
        
        await newBrowserClient.waitForMessage(msg => msg.type === 'connection_ack', timeout);
        results.successfulReconnects++;
        
        // Replace old client
        Object.assign(browserClient, newBrowserClient);
        
      } catch (error) {
        results.failedReconnects++;
        results.errors.push({
          type: 'reconnect_failed',
          attempt: i + 1,
          error: error.message
        });
      }
    }
    
  } finally {
    await cleanup();
  }
  
  return results;
}

/**
 * Performance testing helper
 */
async function measurePerformance(operation, iterations = 100) {
  const results = {
    iterations,
    totalTime: 0,
    averageTime: 0,
    minTime: Infinity,
    maxTime: 0,
    successCount: 0,
    errorCount: 0,
    errors: []
  };
  
  const startTime = Date.now();
  
  for (let i = 0; i < iterations; i++) {
    const operationStart = Date.now();
    
    try {
      await operation(i);
      const operationTime = Date.now() - operationStart;
      
      results.minTime = Math.min(results.minTime, operationTime);
      results.maxTime = Math.max(results.maxTime, operationTime);
      results.successCount++;
      
    } catch (error) {
      results.errorCount++;
      results.errors.push({
        iteration: i,
        error: error.message,
        time: Date.now() - operationStart
      });
    }
  }
  
  results.totalTime = Date.now() - startTime;
  results.averageTime = results.totalTime / iterations;
  
  if (results.minTime === Infinity) {
    results.minTime = 0;
  }
  
  return results;
}

/**
 * Message sequence validator
 */
class MessageSequenceValidator {
  constructor() {
    this.expectedSequences = [];
    this.actualMessages = [];
    this.violations = [];
  }
  
  expectSequence(description, predicate) {
    this.expectedSequences.push({ description, predicate });
    return this;
  }
  
  recordMessage(message) {
    this.actualMessages.push({
      message,
      timestamp: Date.now(),
      index: this.actualMessages.length
    });
    return this;
  }
  
  validate() {
    const results = {
      valid: true,
      violations: [],
      expectedCount: this.expectedSequences.length,
      actualCount: this.actualMessages.length
    };
    
    for (let i = 0; i < this.expectedSequences.length; i++) {
      const expected = this.expectedSequences[i];
      const actual = this.actualMessages[i];
      
      if (!actual) {
        results.violations.push({
          type: 'missing_message',
          expected: expected.description,
          position: i
        });
        results.valid = false;
        continue;
      }
      
      if (!expected.predicate(actual.message)) {
        results.violations.push({
          type: 'sequence_violation',
          expected: expected.description,
          actual: actual.message,
          position: i
        });
        results.valid = false;
      }
    }
    
    return results;
  }
  
  reset() {
    this.expectedSequences = [];
    this.actualMessages = [];
    this.violations = [];
    return this;
  }
}

/**
 * Create a message sequence validator
 */
function createMessageValidator() {
  return new MessageSequenceValidator();
}

/**
 * Load testing helper
 */
async function performLoadTest(serverPort, options = {}) {
  const {
    connectionCount = 50,
    messagesPerConnection = 10,
    connectionDelay = 10,
    messageDelay = 50,
    timeout = 30000
  } = options;
  
  const results = {
    startTime: Date.now(),
    connectionCount,
    messagesPerConnection,
    totalConnections: 0,
    successfulConnections: 0,
    failedConnections: 0,
    totalMessages: 0,
    successfulMessages: 0,
    failedMessages: 0,
    errors: [],
    performance: {
      connectionTime: 0,
      messageTime: 0,
      totalTime: 0
    }
  };
  
  const clients = [];
  
  try {
    // Phase 1: Establish connections
    const connectionStart = Date.now();
    
    for (let i = 0; i < connectionCount; i++) {
      try {
        const client = createTestClient(serverPort);
        await client.connect(timeout);
        clients.push(client);
        results.successfulConnections++;
        
        if (connectionDelay > 0) {
          await global.testUtils.sleep(connectionDelay);
        }
        
      } catch (error) {
        results.failedConnections++;
        results.errors.push({
          type: 'connection_failed',
          client: i,
          error: error.message
        });
      }
      
      results.totalConnections++;
    }
    
    results.performance.connectionTime = Date.now() - connectionStart;
    
    // Phase 2: Send messages
    const messageStart = Date.now();
    const messagePromises = [];
    
    for (let clientIndex = 0; clientIndex < clients.length; clientIndex++) {
      const client = clients[clientIndex];
      
      for (let msgIndex = 0; msgIndex < messagesPerConnection; msgIndex++) {
        const messagePromise = (async () => {
          try {
            await global.testUtils.sleep(msgIndex * messageDelay);
            
            client.send(global.testUtils.createMessage('ping', {
              client: clientIndex,
              message: msgIndex,
              timestamp: Date.now()
            }));
            
            await client.waitForMessage(msg => 
              msg.type === 'pong' && 
              msg.payload.client === clientIndex && 
              msg.payload.message === msgIndex,
              timeout
            );
            
            results.successfulMessages++;
            
          } catch (error) {
            results.failedMessages++;
            results.errors.push({
              type: 'message_failed',
              client: clientIndex,
              message: msgIndex,
              error: error.message
            });
          }
          
          results.totalMessages++;
        })();
        
        messagePromises.push(messagePromise);
      }
    }
    
    await Promise.all(messagePromises);
    results.performance.messageTime = Date.now() - messageStart;
    
  } finally {
    // Cleanup
    await Promise.all(clients.map(client => client.close()));
    results.performance.totalTime = Date.now() - results.startTime;
  }
  
  return results;
}

module.exports = {
  WebSocketTestClient,
  createTestClient,
  createTestClients,
  createConnectedTestClient,
  waitForWebSocketServer,
  establishUserConnections,
  simulateEditWorkflow,
  createMultipleUsers,
  simulateConcurrentEdits,
  testConnectionResilience,
  measurePerformance,
  createMessageValidator,
  MessageSequenceValidator,
  performLoadTest
};
