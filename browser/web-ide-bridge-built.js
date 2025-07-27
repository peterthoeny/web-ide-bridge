/**
 * Web-IDE-Bridge v1.0.2
 * Browser library for seamless IDE integration
 * 
 * This is the development build with full debugging support.
 */
var WebIdeBridge;
/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/ui.js":
/*!*******************!*\
  !*** ./src/ui.js ***!
  \*******************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   UIManager: () => (/* binding */ UIManager)
/* harmony export */ });
/* harmony import */ var _utils_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./utils.js */ "./src/utils.js");


/**
 * UI Manager for Web-IDE-Bridge
 * Handles automatic button injection and UI interactions
 */
class UIManager {
  constructor(webIdeBridge) {
    this.webIdeBridge = webIdeBridge;
    this.injectedButtons = new Map(); // textareaId -> button element
    this.observers = [];
    this.styles = null;
    this.initialized = false;
  }

  /**
   * Auto-inject "Edit in IDE" buttons for textareas
   */
  autoInjectButtons(options = {}) {
    const defaultOptions = {
      selector: 'textarea',
      buttonText: 'Edit in IDE ↗',
      buttonClass: 'web-ide-bridge-btn',
      position: 'after',
      // 'after', 'before', 'append'
      fileTypeAttribute: 'data-type',
      defaultFileType: 'txt',
      excludeSelector: '.web-ide-bridge-exclude',
      includeOnlySelector: null,
      watchForChanges: true,
      style: 'modern',
      // 'modern', 'minimal', 'custom'
      showFileTypeSelector: false // Disable file type selectors
    };
    const config = {
      ...defaultOptions,
      ...options
    };
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

  /**
   * Manually inject button for specific textarea
   */
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
    const config = {
      ...defaultOptions,
      ...options
    };
    this._initializeStyles(config.style);

    // Generate ID if textarea doesn't have one
    if (!textareaElement.id) {
      textareaElement.id = 'web-ide-bridge-textarea-' + (0,_utils_js__WEBPACK_IMPORTED_MODULE_0__.generateUUID)();
    }
    return this._createAndInjectButton(textareaElement, config);
  }

  /**
   * Remove all injected buttons
   */
  removeAllButtons() {
    this.injectedButtons.forEach(button => {
      if (button.parentNode) {
        button.parentNode.removeChild(button);
      }
    });
    this.injectedButtons.clear();

    // Stop observers
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];

    // Remove styles
    if (this.styles && this.styles.parentNode) {
      this.styles.parentNode.removeChild(this.styles);
      this.styles = null;
    }
  }

  /**
   * Remove button for specific textarea
   */
  removeButton(textareaId) {
    const button = this.injectedButtons.get(textareaId);
    if (button && button.parentNode) {
      button.parentNode.removeChild(button);
      this.injectedButtons.delete(textareaId);
    }
  }

  /**
   * Update button states based on connection status
   */
  updateButtonStates(connected) {
    this.injectedButtons.forEach(button => {
      this._updateButtonState(button);
    });
  }

  /**
   * Update individual button state based on connection status
   */
  _updateButtonState(button) {
    const isConnected = this.webIdeBridge.isConnected();
    button.disabled = !isConnected;
    if (isConnected) {
      button.textContent = button.dataset.originalText || 'Edit in IDE ↗';
      button.title = '';
    } else {
      button.textContent = 'Connect to Server First';
      button.title = 'Web-IDE-Bridge server is not connected. Please open the edit demo and connect first.';
    }
  }

  // Private methods

  /**
   * Initialize CSS styles for buttons
   */
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

  /**
   * Modern button styles matching the demo page
   */
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
    `;
  }

  /**
   * Minimal button styles
   */
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

  /**
   * Inject buttons for elements matching selector
   */
  _injectButtonsForSelector(config) {
    let elements = document.querySelectorAll(config.selector);

    // Filter by include/exclude selectors
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
        textarea.id = 'web-ide-bridge-textarea-' + (0,_utils_js__WEBPACK_IMPORTED_MODULE_0__.generateUUID)();
      }

      // Skip if button already exists
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

  /**
   * Create and inject button for textarea
   */
  _createAndInjectButton(textarea, config) {
    const container = document.createElement('div');
    container.className = 'web-ide-bridge-container';
    const button = document.createElement('button');
    button.className = config.buttonClass;
    button.textContent = config.buttonText;
    button.dataset.textareaId = textarea.id;
    button.dataset.fileType = config.fileType;
    button.dataset.originalText = config.buttonText;

    // Set initial button state based on connection
    this._updateButtonState(button);

    // Button click handler
    button.addEventListener('click', async () => {
      if (!this.webIdeBridge.isConnected()) {
        alert('Please connect to Web-IDE-Bridge server first');
        return;
      }
      try {
        const code = textarea.value;
        const fileType = button.dataset.fileType;
        await this.webIdeBridge.editCodeSnippet(textarea.id, code, fileType);
      } catch (error) {
        console.error('Failed to send code to IDE:', error);
        alert('Failed to send code to IDE: ' + error.message);
      }
    });
    container.appendChild(button);

    // Position the container
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

    // Update button state based on connection
    this.webIdeBridge.onStatusChange(status => {
      this.updateButtonStates(status.serverConnected);
    });
    return button;
  }

  /**
   * Watch for DOM changes to auto-inject buttons for new textareas
   */
  _watchForDOMChanges(config) {
    const observer = new MutationObserver(mutations => {
      let shouldRefresh = false;
      mutations.forEach(mutation => {
        if (mutation.type === 'childList') {
          // Check if any added nodes contain textareas
          mutation.addedNodes.forEach(node => {
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
        // Debounce refresh to avoid excessive calls
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

/***/ }),

/***/ "./src/utils.js":
/*!**********************!*\
  !*** ./src/utils.js ***!
  \**********************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   createCancellablePromise: () => (/* binding */ createCancellablePromise),
/* harmony export */   debounce: () => (/* binding */ debounce),
/* harmony export */   deepClone: () => (/* binding */ deepClone),
/* harmony export */   delay: () => (/* binding */ delay),
/* harmony export */   escapeHtml: () => (/* binding */ escapeHtml),
/* harmony export */   formatFileSize: () => (/* binding */ formatFileSize),
/* harmony export */   generateUUID: () => (/* binding */ generateUUID),
/* harmony export */   getBrowserInfo: () => (/* binding */ getBrowserInfo),
/* harmony export */   getLanguageName: () => (/* binding */ getLanguageName),
/* harmony export */   isValidUUID: () => (/* binding */ isValidUUID),
/* harmony export */   isWebSocketSupported: () => (/* binding */ isWebSocketSupported),
/* harmony export */   parseFileType: () => (/* binding */ parseFileType),
/* harmony export */   retry: () => (/* binding */ retry),
/* harmony export */   safeJsonParse: () => (/* binding */ safeJsonParse),
/* harmony export */   safeJsonStringify: () => (/* binding */ safeJsonStringify),
/* harmony export */   storage: () => (/* binding */ storage),
/* harmony export */   throttle: () => (/* binding */ throttle),
/* harmony export */   validateServerUrl: () => (/* binding */ validateServerUrl)
/* harmony export */ });
/**
 * Utility functions for Web-IDE-Bridge browser library
 */

/**
 * Generate a UUID v4
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : r & 0x3 | 0x8;
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
 * Throttle function calls
 */
function throttle(func, limit) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Deep clone an object
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }
  if (obj instanceof Array) {
    return obj.map(item => deepClone(item));
  }
  if (typeof obj === 'object') {
    const clonedObj = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = deepClone(obj[key]);
      }
    }
    return clonedObj;
  }
}

/**
 * Escape HTML entities
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Parse file type from filename or extension
 */
function parseFileType(filename) {
  if (!filename || typeof filename !== 'string') {
    return 'txt';
  }
  const extension = filename.split('.').pop().toLowerCase();
  const typeMap = {
    'js': 'js',
    'jsx': 'jsx',
    'ts': 'ts',
    'tsx': 'tsx',
    'css': 'css',
    'scss': 'scss',
    'sass': 'scss',
    'less': 'less',
    'html': 'html',
    'htm': 'html',
    'xml': 'xml',
    'json': 'json',
    'yaml': 'yaml',
    'yml': 'yaml',
    'py': 'py',
    'python': 'py',
    'java': 'java',
    'cpp': 'cpp',
    'cc': 'cpp',
    'cxx': 'cpp',
    'c': 'c',
    'h': 'c',
    'php': 'php',
    'rb': 'rb',
    'ruby': 'rb',
    'go': 'go',
    'rs': 'rs',
    'rust': 'rs',
    'sh': 'sh',
    'bash': 'sh',
    'zsh': 'sh',
    'sql': 'sql',
    'md': 'md',
    'markdown': 'md',
    'txt': 'txt',
    'text': 'txt'
  };
  return typeMap[extension] || 'txt';
}

/**
 * Format file size in human readable format
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Get language name from file type
 */
function getLanguageName(fileType) {
  const languageMap = {
    'js': 'JavaScript',
    'jsx': 'React JSX',
    'ts': 'TypeScript',
    'tsx': 'React TSX',
    'css': 'CSS',
    'scss': 'SCSS',
    'less': 'Less',
    'html': 'HTML',
    'xml': 'XML',
    'json': 'JSON',
    'yaml': 'YAML',
    'py': 'Python',
    'java': 'Java',
    'cpp': 'C++',
    'c': 'C',
    'php': 'PHP',
    'rb': 'Ruby',
    'go': 'Go',
    'rs': 'Rust',
    'sh': 'Shell',
    'sql': 'SQL',
    'md': 'Markdown',
    'txt': 'Plain Text'
  };
  return languageMap[fileType] || 'Unknown';
}

/**
 * Check if the current environment supports WebSockets
 */
function isWebSocketSupported() {
  return typeof WebSocket !== 'undefined';
}

/**
 * Get browser information
 */
function getBrowserInfo() {
  const userAgent = navigator.userAgent;
  let browser = 'Unknown';
  let version = 'Unknown';
  if (userAgent.indexOf('Chrome') > -1) {
    browser = 'Chrome';
    version = userAgent.match(/Chrome\/(\d+)/)?.[1] || 'Unknown';
  } else if (userAgent.indexOf('Firefox') > -1) {
    browser = 'Firefox';
    version = userAgent.match(/Firefox\/(\d+)/)?.[1] || 'Unknown';
  } else if (userAgent.indexOf('Safari') > -1) {
    browser = 'Safari';
    version = userAgent.match(/Safari\/(\d+)/)?.[1] || 'Unknown';
  } else if (userAgent.indexOf('Edge') > -1) {
    browser = 'Edge';
    version = userAgent.match(/Edge\/(\d+)/)?.[1] || 'Unknown';
  }
  return {
    browser,
    version,
    userAgent
  };
}

/**
 * Simple localStorage wrapper with error handling
 */
const storage = {
  get(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  },
  clear() {
    try {
      localStorage.clear();
      return true;
    } catch {
      return false;
    }
  }
};

/**
 * Create a promise that resolves after a delay
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
async function retry(fn, options = {}) {
  const {
    retries = 3,
    delay: baseDelay = 1000,
    factor = 2,
    maxDelay = 10000
  } = options;
  let lastError;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i === retries) {
        throw lastError;
      }
      const delayMs = Math.min(baseDelay * Math.pow(factor, i), maxDelay);
      await delay(delayMs);
    }
  }
}

/**
 * Check if a value is a valid UUID
 */
function isValidUUID(uuid) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Safe JSON parse with error handling
 */
function safeJsonParse(jsonString, defaultValue = null) {
  try {
    return JSON.parse(jsonString);
  } catch {
    return defaultValue;
  }
}

/**
 * Safe JSON stringify with error handling
 */
function safeJsonStringify(obj, defaultValue = '{}') {
  try {
    return JSON.stringify(obj);
  } catch {
    return defaultValue;
  }
}

/**
 * Create a cancellable promise
 */
function createCancellablePromise(promise) {
  let cancelled = false;
  const cancellablePromise = new Promise((resolve, reject) => {
    promise.then(value => cancelled ? reject(new Error('Promise cancelled')) : resolve(value), error => cancelled ? reject(new Error('Promise cancelled')) : reject(error));
  });
  cancellablePromise.cancel = () => {
    cancelled = true;
  };
  return cancellablePromise;
}

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry needs to be wrapped in an IIFE because it needs to be isolated against other modules in the chunk.
(() => {
/*!***********************!*\
  !*** ./src/client.js ***!
  \***********************/
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _utils_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./utils.js */ "./src/utils.js");
/* harmony import */ var _ui_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./ui.js */ "./src/ui.js");



// Version from webpack DefinePlugin
const VERSION = "1.0.2" || 0;

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
    this.connectionId = options.connectionId || (0,_utils_js__WEBPACK_IMPORTED_MODULE_0__.generateUUID)(); // Allow custom connectionId
    this.options = {
      serverUrl: 'ws://localhost:8071/web-ide-bridge/ws',
      autoReconnect: true,
      reconnectInterval: 5000,
      maxReconnectAttempts: 10,
      heartbeatInterval: 30000,
      connectionTimeout: 10000,
      debug: false,
      addButtons: true,
      ...options
    };

    // Validate server URL
    if (!(0,_utils_js__WEBPACK_IMPORTED_MODULE_0__.validateServerUrl)(this.options.serverUrl)) {
      throw new Error('Invalid server URL format');
    }

    // Connection state
    this.ws = null;
    this.connected = false;
    this.connecting = false;
    this.desktopConnected = false;
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
    this.uiManager = new _ui_js__WEBPACK_IMPORTED_MODULE_1__.UIManager(this);

    // Debounced methods
    this.debouncedReconnect = (0,_utils_js__WEBPACK_IMPORTED_MODULE_0__.debounce)(this._attemptReconnect.bind(this), 1000);
    this._log('WebIdeBridge initialized', {
      userId,
      connectionId: this.connectionId
    });
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
    this._updateStatus({
      serverConnected: false,
      desktopConnected: false
    });
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
    return {
      serverConnected: this.connected,
      desktopConnected: this.desktopConnected
    };
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
    const message = {
      type: 'edit_request',
      connectionId: this.connectionId,
      userId: this.userId,
      snippetId: textareaId,
      code,
      fileType: fileType || 'txt',
      timestamp: Date.now()
    };
    this._log('Sending edit request', {
      textareaId,
      fileType
    });
    this._sendMessage(message);
    return textareaId;
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
    const currentState = this.getConnectionState();
    this._log('onStatusChange called immediately with state', currentState);
    callback(currentState);
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
        this._log('Establishing WebSocket connection', {
          url: this.options.serverUrl
        });
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
        this.ws.onmessage = event => {
          this._handleMessage(event);
        };
        this.ws.onclose = event => {
          this._handleConnectionClose(event);
        };
        this.ws.onerror = error => {
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

    // Update status first
    this._updateStatus({
      serverConnected: true,
      desktopConnected: this.desktopConnected
    });

    // Send browser connection message with our connectionId
    const connectMessage = {
      type: 'browser_connect',
      connectionId: this.connectionId,
      userId: this.userId,
      timestamp: Date.now()
    };
    try {
      this._sendMessage(connectMessage);
      this._startHeartbeat();

      // Auto-inject buttons if enabled
      if (this.options.addButtons) {
        this.autoInjectButtons();
      }
    } catch (error) {
      this._log('Error in connection open handler', error);
    }
  }

  /**
   * Handle connection close
   */
  _handleConnectionClose(event) {
    this._log('WebSocket connection closed', {
      code: event.code,
      reason: event.reason
    });
    this.connected = false;
    this.connecting = false;
    this._clearTimeouts();
    this._updateStatus({
      serverConnected: false,
      desktopConnected: false
    });

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
        case 'status_update':
          this._handleStatusUpdate(message);
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
    if (!message.snippetId || !message.code) {
      this._log('Invalid code update message - missing snippetId or code', message);
      return;
    }
    const {
      snippetId,
      code
    } = message;
    this._log('Received code update', {
      snippetId,
      codeLength: code.length
    });

    // snippetId is the textareaId in the protocol
    const textareaId = snippetId;

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
   * Handle status updates from server
   */
  _handleStatusUpdate(message) {
    const desktopConnected = message.desktopConnected || false;
    this._log('Status update from server', {
      desktopConnected
    });
    this.desktopConnected = desktopConnected;
    this._updateStatus({
      serverConnected: this.connected,
      desktopConnected: this.desktopConnected
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
    const delay = Math.min(this.options.reconnectInterval * Math.pow(2, this.reconnectAttempts), 30000 // Max 30 seconds
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

    // Update internal state based on status
    if (typeof status === 'string') {
      // Legacy string status - update server connection
      this.connected = status === 'connected';
    } else if (typeof status === 'object') {
      // New object status - update both server and desktop
      this.connected = status.serverConnected || false;
      this.desktopConnected = status.desktopConnected || false;
    }

    // Get current state and trigger callbacks
    const currentState = this.getConnectionState();
    this._log('Triggering status callbacks with state', currentState);
    this.statusCallbacks.forEach(callback => {
      try {
        callback(currentState);
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
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (WebIdeBridge);
})();

WebIdeBridge = __webpack_exports__["default"];
/******/ })()
;
//# sourceMappingURL=web-ide-bridge-built.js.map