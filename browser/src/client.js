import { generateUUID, validateServerUrl, debounce } from './utils.js';
import { UIManager } from './ui.js';

/**
 * Web-IDE-Bridge Client Library
 * Provides seamless integration between web applications and desktop IDEs
 */
class WebIdeBridge {
  constructor(userId, options = {}) {
    // Validate required parameters
    if (!userId || typeof userId !== 'string') {
      throw new Error('userId is required and must be a string');
    }

    // Configuration
    this.userId = userId;
    this.connectionId = options.connectionId || generateUUID(); // Allow custom connectionId
    this.options = {
      serverUrl: 'ws://localhost:8071/web-ide-bridge/ws',
      autoReconnect: true,
      reconnectInterval: 5000,
      maxReconnectAttempts: 10,
      heartbeatInterval: 30000,
      connectionTimeout: 10000,
      debug: false,
      ...options
    };

    // Validate server URL
    if (!validateServerUrl(this.options.serverUrl)) {
      throw new Error('Invalid server URL format');
    }

    // Connection state
    this.ws = null;
    this.connected = false;
    this.connecting = false;
    this.reconnectAttempts = 0;
    this.reconnectTimeout = null;
    this.heartbeatTimeout = null;
    this.connectionTimeout = null;

    // Event handlers
    this.statusCallbacks = [];
    this.codeUpdateCallbacks = [];
    this.errorCallbacks = [];
    this.messageCallbacks = [];

    // UI Manager for auto-injection features
    this.uiManager = new UIManager(this);

    // Debounced methods
    this.debouncedReconnect = debounce(this._attemptReconnect.bind(this), 1000);

    this._log('WebIdeBridge initialized', { userId, connectionId: this.connectionId });
  }

  /**
   * Handle connection acknowledgment from server
   */
  _handleConnectionAck(message) {
    this._log('Connection acknowledged by server');

    // Now send browser connection message
    const connectMessage = {
      type: 'browser_connect',
      connectionId: this.connectionId,
      userId: this.userId,
      timestamp: Date.now()
    };

    this._sendMessage(connectMessage);
    this._startHeartbeat();
  }

  /**
   * Connect to the Web-IDE-Bridge server
   */
  async connect() {
    if (this.connected || this.connecting) {
      this._log('Already connected or connecting');
      return;
    }

    this.connecting = true;
    this._updateStatus('connecting');

    try {
      await this._establishConnection();
      this.reconnectAttempts = 0;
      this._log('Successfully connected to server');
    } catch (error) {
      this.connecting = false;
      this._handleConnectionError(error);
      throw error;
    }
  }

  /**
   * Disconnect from the server
   */
  disconnect() {
    this._log('Disconnecting from server');

    // Clear all timeouts
    this._clearTimeouts();

    // Disable auto-reconnect
    this.options.autoReconnect = false;

    // Close WebSocket connection
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.connected = false;
    this.connecting = false;
    this._updateStatus('disconnected');
  }

  /**
   * Check if connected to server
   */
  isConnected() {
    return this.connected;
  }

  /**
   * Get current connection status
   */
  getConnectionState() {
    if (this.connected) return 'connected';
    if (this.connecting) return 'connecting';
    return 'disconnected';
  }

  /**
   * Send code snippet to IDE for editing
   */
  async editCodeSnippet(textareaId, code, fileType = 'txt') {
    if (!this.connected) {
      throw new Error('Not connected to server');
    }

    if (!textareaId || typeof textareaId !== 'string') {
      throw new Error('textareaId is required and must be a string');
    }

    if (typeof code !== 'string') {
      throw new Error('code must be a string');
    }

    const sessionId = generateUUID();

    const message = {
      type: 'edit_request',
      connectionId: this.connectionId,
      userId: this.userId,
      sessionId,
      payload: {
        textareaId,
        code,
        fileType: fileType || 'txt',
        timestamp: Date.now()
      }
    };

    this._log('Sending edit request', { textareaId, fileType, sessionId });
    this._sendMessage(message);

    return sessionId;
  }

  /**
   * Register callback for status changes
   */
  onStatusChange(callback) {
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }
    this.statusCallbacks.push(callback);

    // Immediately call with current status
    callback(this.getConnectionState());
  }

  /**
   * Register callback for code updates from IDE
   */
  onCodeUpdate(callback) {
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }
    this.codeUpdateCallbacks.push(callback);
  }

  /**
   * Register callback for errors
   */
  onError(callback) {
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }
    this.errorCallbacks.push(callback);
  }

  /**
   * Register callback for all messages (debugging)
   */
  onMessage(callback) {
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }
    this.messageCallbacks.push(callback);
  }

  /**
   * Auto-inject "Edit in IDE" buttons for textareas
   */
  autoInjectButtons(options = {}) {
    return this.uiManager.autoInjectButtons(options);
  }

  /**
   * Manually inject button for specific textarea
   */
  injectButton(textareaElement, options = {}) {
    return this.uiManager.injectButton(textareaElement, options);
  }

  /**
   * Remove all injected buttons
   */
  removeInjectedButtons() {
    this.uiManager.removeAllButtons();
  }

  // Private methods

  /**
   * Establish WebSocket connection
   */
  async _establishConnection() {
    return new Promise((resolve, reject) => {
      try {
        this._log('Establishing WebSocket connection', { url: this.options.serverUrl });

        this.ws = new WebSocket(this.options.serverUrl);

        // Set connection timeout
        this.connectionTimeout = setTimeout(() => {
          if (this.ws.readyState !== WebSocket.OPEN) {
            this.ws.close();
            reject(new Error('Connection timeout'));
          }
        }, this.options.connectionTimeout);

        this.ws.onopen = () => {
          clearTimeout(this.connectionTimeout);
          this._log('WebSocket connection opened');
          this._handleConnectionOpen();
          resolve();
        };

        this.ws.onmessage = (event) => {
          this._handleMessage(event);
        };

        this.ws.onclose = (event) => {
          this._handleConnectionClose(event);
        };

        this.ws.onerror = (error) => {
          clearTimeout(this.connectionTimeout);
          this._log('WebSocket error', error);
          reject(new Error('WebSocket connection failed'));
        };

      } catch (error) {
        clearTimeout(this.connectionTimeout);
        reject(error);
      }
    });
  }

  /**
   * Handle successful connection
   */
  _handleConnectionOpen() {
    this.connected = true;
    this.connecting = false;

    // Send browser connection message with our connectionId
    const connectMessage = {
      type: 'browser_connect',
      connectionId: this.connectionId,
      userId: this.userId,
      timestamp: Date.now()
    };

    this._sendMessage(connectMessage);
    this._updateStatus('connected');
    this._startHeartbeat();
  }

  /**
   * Handle connection close
   */
  _handleConnectionClose(event) {
    this._log('WebSocket connection closed', { code: event.code, reason: event.reason });

    this.connected = false;
    this.connecting = false;
    this._clearTimeouts();
    this._updateStatus('disconnected');

    // Attempt reconnection if enabled
    if (this.options.autoReconnect && event.code !== 1000) {
      this._scheduleReconnect();
    }
  }

  /**
   * Handle connection errors
   */
  _handleConnectionError(error) {
    this._log('Connection error', error);
    this._triggerErrorCallbacks(error.message || 'Connection failed');

    if (this.options.autoReconnect) {
      this._scheduleReconnect();
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  _handleMessage(event) {
    try {
      const message = JSON.parse(event.data);
      this._log('Received message', message);

      // Trigger message callbacks
      this.messageCallbacks.forEach(callback => {
        try {
          callback(message);
        } catch (error) {
          this._log('Error in message callback', error);
        }
      });

      // Handle specific message types
      switch (message.type) {
        case 'connection_ack':
          this._log('Connection acknowledged by server');
          break;

        case 'code_update':
          this._handleCodeUpdate(message);
          break;

        case 'pong':
          this._log('Received pong from server');
          break;

        case 'error':
          this._handleServerError(message);
          break;

        default:
          this._log('Unknown message type', message.type);
      }

    } catch (error) {
      this._log('Error parsing message', error);
      this._log('Raw message data', event.data);
      this._triggerErrorCallbacks('Failed to parse server message: ' + error.message);
    }
  }

  /**
   * Handle code update from IDE
   */
  _handleCodeUpdate(message) {
    if (!message.payload || !message.payload.textareaId) {
      this._log('Invalid code update message', message);
      return;
    }

    const { textareaId, code } = message.payload;
    this._log('Received code update', { textareaId, codeLength: code.length });

    // Trigger code update callbacks
    this.codeUpdateCallbacks.forEach(callback => {
      try {
        callback(textareaId, code);
      } catch (error) {
        this._log('Error in code update callback', error);
      }
    });
  }

  /**
   * Handle server error messages
   */
  _handleServerError(message) {
    const errorMsg = message.payload?.message || 'Unknown server error';
    this._log('Server error', errorMsg);
    this._triggerErrorCallbacks(errorMsg);
  }

  /**
   * Send message to server
   */
  _sendMessage(message) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    try {
      this.ws.send(JSON.stringify(message));
      this._log('Sent message', message);
    } catch (error) {
      this._log('Error sending message', error);
      throw new Error('Failed to send message to server');
    }
  }

  /**
   * Start heartbeat mechanism
   */
  _startHeartbeat() {
    this._clearHeartbeat();

    if (this.options.heartbeatInterval > 0) {
      this.heartbeatTimeout = setTimeout(() => {
        if (this.connected) {
          try {
            this._sendMessage({
              type: 'ping',
              connectionId: this.connectionId,
              timestamp: Date.now()
            });
            this._startHeartbeat(); // Schedule next heartbeat
          } catch (error) {
            this._log('Heartbeat failed', error);
          }
        }
      }, this.options.heartbeatInterval);
    }
  }

  /**
   * Clear heartbeat timeout
   */
  _clearHeartbeat() {
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  /**
   * Schedule reconnection attempt
   */
  _scheduleReconnect() {
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      this._log('Max reconnect attempts reached');
      this._triggerErrorCallbacks('Max reconnection attempts exceeded');
      return;
    }

    const delay = Math.min(
      this.options.reconnectInterval * Math.pow(2, this.reconnectAttempts),
      30000 // Max 30 seconds
    );

    this._log(`Scheduling reconnect attempt ${this.reconnectAttempts + 1} in ${delay}ms`);

    this.reconnectTimeout = setTimeout(() => {
      this.debouncedReconnect();
    }, delay);
  }

  /**
   * Attempt to reconnect
   */
  async _attemptReconnect() {
    if (this.connected || this.connecting) {
      return;
    }

    this.reconnectAttempts++;
    this._log(`Reconnect attempt ${this.reconnectAttempts}`);

    try {
      await this.connect();
    } catch (error) {
      this._log('Reconnect failed', error);
      if (this.reconnectAttempts < this.options.maxReconnectAttempts) {
        this._scheduleReconnect();
      }
    }
  }

  /**
   * Clear all timeouts
   */
  _clearTimeouts() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }

    this._clearHeartbeat();
  }

  /**
   * Update connection status and trigger callbacks
   */
  _updateStatus(status) {
    this._log('Status changed to', status);

    this.statusCallbacks.forEach(callback => {
      try {
        callback(status);
      } catch (error) {
        this._log('Error in status callback', error);
      }
    });
  }

  /**
   * Trigger error callbacks
   */
  _triggerErrorCallbacks(error) {
    this.errorCallbacks.forEach(callback => {
      try {
        callback(error);
      } catch (error) {
        this._log('Error in error callback', error);
      }
    });
  }

  /**
   * Internal logging
   */
  _log(message, data = null) {
    if (this.options.debug) {
      const logMessage = `[WebIdeBridge] ${message}`;
      if (data) {
        console.log(logMessage, data);
      } else {
        console.log(logMessage);
      }
    }
  }
}

export default WebIdeBridge;
