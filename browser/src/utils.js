/**
 * Utility functions for Web-IDE-Bridge browser library
 */

/**
 * Generate a UUID v4
 */
export function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Validate WebSocket server URL
   */
  export function validateServerUrl(url) {
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
  export function debounce(func, wait, immediate = false) {
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
  export function throttle(func, limit) {
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
  export function deepClone(obj) {
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
  export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Parse file type from filename or extension
   */
  export function parseFileType(filename) {
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
  export function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * Get language name from file type
   */
  export function getLanguageName(fileType) {
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
  export function isWebSocketSupported() {
    return typeof WebSocket !== 'undefined';
  }

  /**
   * Get browser information
   */
  export function getBrowserInfo() {
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

    return { browser, version, userAgent };
  }

  /**
   * Simple localStorage wrapper with error handling
   */
  export const storage = {
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
  export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Retry a function with exponential backoff
   */
  export async function retry(fn, options = {}) {
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
  export function isValidUUID(uuid) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  /**
   * Safe JSON parse with error handling
   */
  export function safeJsonParse(jsonString, defaultValue = null) {
    try {
      return JSON.parse(jsonString);
    } catch {
      return defaultValue;
    }
  }

  /**
   * Safe JSON stringify with error handling
   */
  export function safeJsonStringify(obj, defaultValue = '{}') {
    try {
      return JSON.stringify(obj);
    } catch {
      return defaultValue;
    }
  }

  /**
   * Create a cancellable promise
   */
  export function createCancellablePromise(promise) {
    let cancelled = false;

    const cancellablePromise = new Promise((resolve, reject) => {
      promise.then(
        value => cancelled ? reject(new Error('Promise cancelled')) : resolve(value),
        error => cancelled ? reject(new Error('Promise cancelled')) : reject(error)
      );
    });

    cancellablePromise.cancel = () => {
      cancelled = true;
    };

    return cancellablePromise;
  }
