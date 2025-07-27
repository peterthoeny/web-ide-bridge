import { generateUUID } from './utils.js';

/**
 * UI Manager for Web-IDE-Bridge
 * Handles automatic button injection and UI interactions
 */
export class UIManager {
  constructor(webIdeBridge) {
    this.webIdeBridge = webIdeBridge;
    this.injectedButtons = new Map(); // textareaId -> button element
    this.observers = [];
    this.styles = null;
    this.initialized = false;
    this.statusCallbackRegistered = false; // Track if we've already registered status callback
  }

  /**
   * Auto-inject "Edit in IDE" buttons for textareas
   */
  autoInjectButtons(options = {}) {
    const defaultOptions = {
      selector: 'textarea',
      buttonText: 'Edit in IDE ↗',
      buttonClass: 'web-ide-bridge-btn',
      position: 'after', // 'after', 'before', 'append'
      fileTypeAttribute: 'data-type',
      defaultFileType: 'txt',
      excludeSelector: '.web-ide-bridge-exclude',
      includeOnlySelector: null,
      watchForChanges: true,
      style: 'modern', // 'modern', 'minimal', 'custom'
      showFileTypeSelector: false // Disable file type selectors
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

    const config = { ...defaultOptions, ...options };

    this._initializeStyles(config.style);

    // Generate ID if textarea doesn't have one
    if (!textareaElement.id) {
      textareaElement.id = 'web-ide-bridge-textarea-' + generateUUID();
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
    this.injectedButtons.forEach((button, textareaId) => {
      this._updateButtonState(button, connected);
    });
  }

  /**
   * Update individual button state based on connection status
   */
  _updateButtonState(button, connected = null) {
    // Button should be enabled if server is connected, regardless of desktop connection
    // Desktop connection is only needed for roundtrip functionality
    const serverConnected = connected !== null ? connected : this.webIdeBridge.isConnected();
    button.disabled = !serverConnected;

    // Always keep the original button text
    button.textContent = button.dataset.originalText || 'Edit in IDE ↗';
    if (serverConnected) {
      button.title = '';
    } else {
      button.title = 'Web-IDE-Bridge server is not connected. Please connect first.';
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
        textarea.id = 'web-ide-bridge-textarea-' + generateUUID();
      }

      // Skip if button already exists
      if (this.injectedButtons.has(textarea.id)) {
        return;
      }

      // Additional check: look for existing buttons in the DOM
      const existingButton = textarea.parentNode.querySelector(`[data-textarea-id="${textarea.id}"]`);
      if (existingButton) {
        // Button exists in DOM but not in our tracking - add it to tracking
        this.injectedButtons.set(textarea.id, existingButton);
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

    // Register status callback only once for all buttons
    if (!this.statusCallbackRegistered) {
      this.webIdeBridge.onStatusChange((status) => {
        this.updateButtonStates(status.serverConnected);
      });
      this.statusCallbackRegistered = true;
    }

    return button;
  }

  /**
   * Watch for DOM changes to auto-inject buttons for new textareas
   */
  _watchForDOMChanges(config) {
    const observer = new MutationObserver((mutations) => {
      let shouldRefresh = false;

      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          // Check if any added nodes contain textareas
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
