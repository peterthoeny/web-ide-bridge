/**
 * @name            Web-IDE-Bridge / Browser
 * @tagline         Browser library for seamless IDE integration
 * @description     This is the source with full debugging support, use web-ide-bridge.min.js for production
 * @file            browser/web-ide-bridge.js
 * @version         1.1.5
 * @release         2025-08-11
 * @repository      https://github.com/peterthoeny/web-ide-bridge
 * @author          Peter Thoeny, https://twiki.org & https://github.com/peterthoeny/
 * @copyright       2025 Peter Thoeny, https://twiki.org & https://github.com/peterthoeny/
 * @license         GPL v3, see LICENSE file
 * @genai           99%, Cursor 1.2, Claude Sonnet 4
 */

(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.WebIdeBridge = factory());
})(this, (function () { 'use strict';

  /**
   * Generate a UUID v4
   */
  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Validate WebSocket server URL
   */
  function validateServerUrl(url) {
    if (!url || typeof url !== 'string') {
      return false;
    }

    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'ws:' || urlObj.protocol === 'wss:';
    } catch {
      return false;
    }
  }

  /**
   * Debounce function calls
   */
  function debounce(func, wait, immediate = false) {
    let timeout;

    return function executedFunction(...args) {
      const later = () => {
        timeout = null;
        if (!immediate) func.apply(this, args);
      };

      const callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);

      if (callNow) func.apply(this, args);
    };
  }

  /**
   * UI Manager for Web-IDE-Bridge
   * Handles automatic button injection and UI interactions
   */
  class UIManager {
    constructor(webIdeBridge) {
      this.webIdeBridge = webIdeBridge;
      this.injectedButtons = new Map();
      this.observers = [];
      this.styles = null;
      this.initialized = false;
    }

    autoInjectButtons(options = {}) {
      const defaultOptions = {
        selector: 'textarea',
        buttonText: 'Edit in IDE ↗',
        buttonClass: 'web-ide-bridge-btn',
        position: 'after',
        fileTypeAttribute: 'data-language',
        defaultFileType: 'txt',
        excludeSelector: '.web-ide-bridge-exclude',
        includeOnlySelector: null,
        watchForChanges: true,
        style: 'modern'
      };

      const config = { ...defaultOptions, ...options };

      this._initializeStyles(config.style);
      this._injectButtonsForSelector(config);

      if (config.watchForChanges) {
        this._watchForDOMChanges(config);
      }

      return {
        refresh: () => this._injectButtonsForSelector(config),
        destroy: () => this.removeAllButtons()
      };
    }

    injectButton(textareaElement, options = {}) {
      if (!textareaElement || textareaElement.tagName !== 'TEXTAREA') {
        throw new Error('Element must be a textarea');
      }

      const defaultOptions = {
        buttonText: 'Edit in IDE ↗',
        buttonClass: 'web-ide-bridge-btn',
        position: 'after',
        fileType: 'txt',
        style: 'modern'
      };

      const config = { ...defaultOptions, ...options };

      this._initializeStyles(config.style);

      if (!textareaElement.id) {
        textareaElement.id = 'web-ide-bridge-textarea-' + generateUUID();
      }

      return this._createAndInjectButton(textareaElement, config);
    }

    removeAllButtons() {
      this.injectedButtons.forEach(button => {
        if (button.parentNode) {
          button.parentNode.removeChild(button);
        }
      });
      this.injectedButtons.clear();

      this.observers.forEach(observer => observer.disconnect());
      this.observers = [];

      if (this.styles && this.styles.parentNode) {
        this.styles.parentNode.removeChild(this.styles);
        this.styles = null;
      }
    }

    updateButtonStates(connected) {
      this.injectedButtons.forEach(button => {
        button.disabled = !connected;
        // Always show the original text, do not change to 'Connect to Server First'
        button.textContent = button.dataset.originalText;
      });
    }

    _initializeStyles(style) {
      if (this.styles || this.initialized) return;

      const styleElement = document.createElement('style');
      styleElement.id = 'web-ide-bridge-styles';

      let css = '';

      switch (style) {
        case 'modern':
          css = this._getModernButtonStyles();
          break;
        case 'minimal':
          css = this._getMinimalButtonStyles();
          break;
        default:
          css = this._getModernButtonStyles();
      }

      styleElement.textContent = css;
      document.head.appendChild(styleElement);
      this.styles = styleElement;
      this.initialized = true;
    }

    _getModernButtonStyles() {
      return `
        .web-ide-bridge-btn {
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          font-weight: 600;
          font-size: 0.875rem;
          cursor: pointer;
          transition: all 0.3s ease;
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          margin: 0.5rem 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          text-decoration: none;
          outline: none;
        }

        .web-ide-bridge-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
        }

        .web-ide-bridge-btn:active:not(:disabled) {
          transform: translateY(0);
        }

        .web-ide-bridge-btn:disabled {
          background: #9ca3af;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }

        .web-ide-bridge-btn:focus {
          box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.3);
        }

        .web-ide-bridge-container {
          display: flex;
          gap: 0.75rem;
          align-items: center;
          margin-top: 0.5rem;
          flex-wrap: wrap;
        }

        .web-ide-bridge-file-type {
          padding: 0.5rem;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 0.875rem;
          background: white;
          color: #374151;
        }
      `;
    }

    _getMinimalButtonStyles() {
      return `
        .web-ide-bridge-btn {
          background: #4f46e5;
          color: white;
          border: 1px solid #4f46e5;
          padding: 0.5rem 1rem;
          border-radius: 4px;
          font-size: 0.875rem;
          cursor: pointer;
          transition: background-color 0.2s ease;
          font-family: inherit;
          outline: none;
        }

        .web-ide-bridge-btn:hover:not(:disabled) {
          background: #4338ca;
        }

        .web-ide-bridge-btn:disabled {
          background: #9ca3af;
          border-color: #9ca3af;
          cursor: not-allowed;
        }

        .web-ide-bridge-btn:focus {
          box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.5);
        }

        .web-ide-bridge-container {
          margin-top: 0.5rem;
        }

        .web-ide-bridge-file-type {
          margin-left: 0.5rem;
          padding: 0.25rem 0.5rem;
          border: 1px solid #ccc;
          border-radius: 3px;
          font-size: 0.8rem;
        }
      `;
    }

    _injectButtonsForSelector(config) {
      let elements = document.querySelectorAll(config.selector);

      elements = Array.from(elements).filter(element => {
        if (config.excludeSelector && element.matches(config.excludeSelector)) {
          return false;
        }
        if (config.includeOnlySelector && !element.matches(config.includeOnlySelector)) {
          return false;
        }
        return true;
      });

      elements.forEach(textarea => {
        if (!textarea.id) {
          textarea.id = 'web-ide-bridge-textarea-' + generateUUID();
        }

        if (this.injectedButtons.has(textarea.id)) {
          return;
        }

        const fileType = textarea.getAttribute(config.fileTypeAttribute) || config.defaultFileType;

        this._createAndInjectButton(textarea, {
          ...config,
          fileType
        });
      });
    }

    _createAndInjectButton(textarea, config) {
      // Only add a single [Edit in IDE] button below each textarea, no type selector
      const container = document.createElement('div');
      container.className = 'web-ide-bridge-container';

      const button = document.createElement('button');
      button.className = config.buttonClass;
      button.textContent = config.buttonText;
      button.dataset.textareaId = textarea.id;
      button.dataset.fileType = config.fileType;
      button.dataset.originalText = config.buttonText;
      button.disabled = !this.webIdeBridge.isConnected();

      button.addEventListener('click', async () => {
        if (!this.webIdeBridge.isConnected()) {
          alert('Please connect to Web-IDE-Bridge server first to edit code in your IDE');
          return;
        }
        try {
          const code = textarea.value;
          const fileType = button.dataset.fileType;
          await this.webIdeBridge.editCodeSnippet(textarea.id, code, fileType);
        } catch (error) {
          console.error('Failed to send code to IDE:', error);
          alert(`Failed to send code to IDE: ${error.message}. Please check your connection and try again.`);
        }
      });

      container.appendChild(button);

      switch (config.position) {
        case 'before':
          textarea.parentNode.insertBefore(container, textarea);
          break;
        case 'after':
          textarea.parentNode.insertBefore(container, textarea.nextSibling);
          break;
        case 'append':
          textarea.parentNode.appendChild(container);
          break;
        default:
          textarea.parentNode.insertBefore(container, textarea.nextSibling);
      }

      this.injectedButtons.set(textarea.id, button);

      this.webIdeBridge.onStatusChange((status) => {
        this.updateButtonStates(status.serverConnected);
      });

      return button;
    }

    _watchForDOMChanges(config) {
      const observer = new MutationObserver((mutations) => {
        let shouldRefresh = false;

        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.matches && node.matches(config.selector)) {
                  shouldRefresh = true;
                } else if (node.querySelector && node.querySelector(config.selector)) {
                  shouldRefresh = true;
                }
              }
            });
          }
        });

        if (shouldRefresh) {
          setTimeout(() => {
            this._injectButtonsForSelector(config);
          }, 100);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      this.observers.push(observer);
    }
  }

  /**
   * Web-IDE-Bridge Client Library
   * Provides seamless integration between web applications and desktop IDEs
   */
  class WebIdeBridge {
    constructor(userId, options = {}) {
      if (!userId || typeof userId !== 'string') {
        throw new Error('userId is required and must be a string');
      }

      this.userId = userId;
      this.connectionId = options.connectionId || generateUUID();
      this.options = {
        serverUrl: 'ws://localhost:8071/web-ide-bridge/ws',
        autoReconnect: true,
        reconnectInterval: 5000,
        maxReconnectAttempts: 10,
        heartbeatInterval: 30000,
        connectionTimeout: 10000,
        debug: false,
        addButtons: true, // new option
        ...options
      };

      if (!validateServerUrl(this.options.serverUrl)) {
        throw new Error('Invalid server URL format');
      }

      this.ws = null;
      this.connected = false;
      this.connecting = false;
      this.reconnectAttempts = 0;
      this.reconnectTimeout = null;
      this.heartbeatTimeout = null;
      this.connectionTimeout = null;
      this.desktopConnected = false;

      this.statusCallbacks = [];
      this.codeUpdateCallbacks = [];
      this.errorCallbacks = [];
      this.messageCallbacks = [];

      this.uiManager = new UIManager(this);
      if (this.options.addButtons) {
        this.uiManager.autoInjectButtons();
      }
      this.debouncedReconnect = debounce(this._attemptReconnect.bind(this), 1000);

      this._log('Web-IDE-Bridge initialized for user', { userId, connectionId: this.connectionId });
    }

    async connect() {
      if (this.connected || this.connecting) {
        this._log('Already connected to server or connection in progress');
        return;
      }

      this.connecting = true;
      this._updateStatus();

      try {
        await this._establishConnection();
        this.reconnectAttempts = 0;
        this._log('Successfully connected to Web-IDE-Bridge server');
      } catch (error) {
        this.connecting = false;
        this._handleConnectionError(error);
        throw error;
      }
    }

    disconnect() {
      this._log('Disconnecting from Web-IDE-Bridge server');

      this._clearTimeouts();
      this.options.autoReconnect = false;

      if (this.ws) {
        this.ws.close(1000, 'Client disconnect');
        this.ws = null;
      }

      this.connected = false;
      this.connecting = false;
      this._updateStatus();
    }

    isConnected() {
      return this.connected;
    }

    getConnectionState() {
      if (this.connected) return 'connected';
      if (this.connecting) return 'connecting';
      return 'disconnected';
    }

    async editCodeSnippet(snippetId, code, fileType = 'txt') {
      if (!this.connected) {
        throw new Error('Not connected to server');
      }

      if (!snippetId || typeof snippetId !== 'string') {
        throw new Error('snippetId is required and must be a string');
      }

      if (typeof code !== 'string') {
        throw new Error('code must be a string');
      }

      const message = {
        type: 'edit_request',
        connectionId: this.connectionId,
        userId: this.userId,
        snippetId,
        code,
        fileType: fileType || 'txt',
        timestamp: Date.now()
      };

      this._log('Sending code snippet to IDE for editing', { snippetId, fileType });
      this._sendMessage(message);

      return snippetId;
    }

    onStatusChange(callback) {
      if (typeof callback !== 'function') {
        throw new Error('Callback must be a function');
      }
      this.statusCallbacks.push(callback);
      callback({
        serverConnected: this.connected,
        desktopConnected: this.desktopConnected
      });
    }

    onCodeUpdate(callback) {
      if (typeof callback !== 'function') {
        throw new Error('Callback must be a function');
      }
      this.codeUpdateCallbacks.push(callback);
    }

    onError(callback) {
      if (typeof callback !== 'function') {
        throw new Error('Callback must be a function');
      }
      this.errorCallbacks.push(callback);
    }

    onMessage(callback) {
      if (typeof callback !== 'function') {
        throw new Error('Callback must be a function');
      }
      this.messageCallbacks.push(callback);
    }

    autoInjectButtons(options = {}) {
      return this.uiManager.autoInjectButtons(options);
    }

    injectButton(textareaElement, options = {}) {
      return this.uiManager.injectButton(textareaElement, options);
    }

    // Private methods

    async _establishConnection() {
      return new Promise((resolve, reject) => {
        try {
          this._log('Establishing connection to Web-IDE-Bridge server', { url: this.options.serverUrl });

          this.ws = new WebSocket(this.options.serverUrl);

          this.connectionTimeout = setTimeout(() => {
            if (this.ws.readyState !== WebSocket.OPEN) {
              this.ws.close();
              reject(new Error('Connection timeout'));
            }
          }, this.options.connectionTimeout);

          this.ws.onopen = () => {
            clearTimeout(this.connectionTimeout);
            this._log('Connection to Web-IDE-Bridge server opened');
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
                      this._log('Connection to Web-IDE-Bridge server failed', error);
          reject(new Error('Connection to Web-IDE-Bridge server failed'));
          };

        } catch (error) {
          clearTimeout(this.connectionTimeout);
          reject(error);
        }
      });
    }

    _handleConnectionOpen() {
      this.connected = true;
      this.connecting = false;
      this._updateStatus();
      // Send browser_connect immediately
      const connectMessage = {
        type: 'browser_connect',
        connectionId: this.connectionId,
        userId: this.userId,
        timestamp: Date.now()
      };
      this._sendMessage(connectMessage);
      this._startHeartbeat();
    }

    _handleConnectionClose(event) {
      this._log('Connection to Web-IDE-Bridge server closed', { code: event.code, reason: event.reason });

      this.connected = false;
      this.connecting = false;
      this._clearTimeouts();
      this._updateStatus();

      if (this.options.autoReconnect && event.code !== 1000) {
        this._scheduleReconnect();
      }
    }

    _handleConnectionError(error) {
      this._log('Connection to Web-IDE-Bridge server error', error);
      this._triggerErrorCallbacks(error.message || 'Connection to Web-IDE-Bridge server failed');

      if (this.options.autoReconnect) {
        this._scheduleReconnect();
      }
    }

    _handleMessage(event) {
      try {
        const message = JSON.parse(event.data);
        this._log('Received message', message);

        this.messageCallbacks.forEach(callback => {
          try {
            callback(message);
          } catch (error) {
            this._log('Error in message callback', error);
          }
        });

        switch (message.type) {
          case 'connection_init':
            this._handleConnectionInit(message);
            break;

          case 'connection_ack':
            this._log('Connection acknowledged by Web-IDE-Bridge server');
            break;

          case 'code_update':
            this._handleCodeUpdate(message);
            break;

          case 'pong':
            this._log('Received heartbeat response from Web-IDE-Bridge server');
            break;

          case 'error':
            this._handleServerError(message);
            break;

          case 'status_update':
            this._handleStatusUpdate(message);
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

    _handleConnectionInit(message) {
      if (message.connectionId) {
        this.connectionId = message.connectionId;
        this._log('Connection ID updated from Web-IDE-Bridge server', this.connectionId);
        // No need to send browser_connect here anymore
        this._startHeartbeat();
      }
    }

    _handleCodeUpdate(message) {
      // Server sends flattened format (no payload wrapper)
      if (!message.snippetId || !message.code) {
        this._log('Invalid code update message', message);
        return;
      }

      const { snippetId, code } = message;
      this._log('Received code update from IDE', { snippetId, codeLength: code.length });
      this._log('Number of code update callbacks:', this.codeUpdateCallbacks.length);

      let callbackExecuted = false;
      this.codeUpdateCallbacks.forEach(callback => {
        try {
          callbackExecuted = true;
          const result = callback(snippetId, code);
          this._log('Callback result:', { result, type: typeof result, hasContent: result?.trim() });
          if (typeof result === 'string' && result.trim()) {
            // Send info message to server
            this._log('Sending info message from callback result');
            this._sendMessage({
              type: 'info',
              connectionId: this.connectionId,
              userId: this.userId,
              snippetId: snippetId,
              message: result.trim()
            });
          }
        } catch (error) {
          this._log('Error in code update callback', error);
        }
      });

      if (!callbackExecuted) {
        this._log('No code update callbacks executed for snippet:', snippetId);
      }

      // If addButtons is true, send info message to server
      if (this.options.addButtons !== false) {
        this._log('Sending default info message (addButtons mode)');
        this._sendMessage({
          type: 'info',
          connectionId: this.connectionId,
          userId: this.userId,
          snippetId: snippetId,
          message: `Code snippet ${snippetId} has been updated in the web application`
        });
      }
    }

    _handleServerError(message) {
      const errorMsg = message.message || 'Unknown server error';
      this._log('Web-IDE-Bridge server error', errorMsg);
      this._triggerErrorCallbacks(errorMsg);
    }

    _handleStatusUpdate(message) {
      if (typeof message.desktopConnected === 'boolean') {
        this.desktopConnected = message.desktopConnected;
        this._updateStatus();
      }
    }

    _sendMessage(message) {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        throw new Error('WebSocket not connected');
      }

      try {
        this.ws.send(JSON.stringify(message));
        this._log('Sent message to Web-IDE-Bridge server', message);
      } catch (error) {
        this._log('Error sending message to Web-IDE-Bridge server', error);
        throw new Error('Failed to send message to Web-IDE-Bridge server');
      }
    }

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
              this._startHeartbeat();
            } catch (error) {
              this._log('Heartbeat to Web-IDE-Bridge server failed', error);
            }
          }
        }, this.options.heartbeatInterval);
      }
    }

    _clearHeartbeat() {
      if (this.heartbeatTimeout) {
        clearTimeout(this.heartbeatTimeout);
        this.heartbeatTimeout = null;
      }
    }

    _scheduleReconnect() {
      if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
              this._log('Maximum reconnection attempts to Web-IDE-Bridge server reached');
      this._triggerErrorCallbacks('Maximum reconnection attempts to Web-IDE-Bridge server exceeded');
        return;
      }

      const delay = Math.min(
        this.options.reconnectInterval * Math.pow(2, this.reconnectAttempts),
        30000
      );

      this._log(`Scheduling reconnection attempt ${this.reconnectAttempts + 1} to Web-IDE-Bridge server in ${delay}ms`);

      this.reconnectTimeout = setTimeout(() => {
        this.debouncedReconnect();
      }, delay);
    }

    async _attemptReconnect() {
      if (this.connected || this.connecting) {
        return;
      }

      this.reconnectAttempts++;
      this._log(`Reconnection attempt ${this.reconnectAttempts} to Web-IDE-Bridge server`);

      try {
        await this.connect();
      } catch (error) {
        this._log('Reconnection to Web-IDE-Bridge server failed', error);
        if (this.reconnectAttempts < this.options.maxReconnectAttempts) {
          this._scheduleReconnect();
        }
      }
    }

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

    _updateStatus() {
      this.statusCallbacks.forEach(callback => {
        try {
          callback({
            serverConnected: this.connected,
            desktopConnected: this.desktopConnected
          });
        } catch (error) {
          this._log('Error in status callback', error);
        }
      });
    }

    _triggerErrorCallbacks(error) {
      this.errorCallbacks.forEach(callback => {
        try {
          callback(error);
        } catch (error) {
          this._log('Error in error callback', error);
        }
      });
    }

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

  return WebIdeBridge;

}));
