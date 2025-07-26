import {
  generateUUID,
  validateServerUrl,
  debounce,
  throttle,
  deepClone,
  escapeHtml,
  parseFileType,
  formatFileSize,
  getLanguageName,
  isWebSocketSupported,
  getBrowserInfo,
  LocalStorage,
  delay,
  retry,
  isValidUUID,
  safeJsonParse,
  safeJsonStringify,
  createCancellablePromise
} from '../../browser/src/utils.js';

describe('Browser Utils', () => {
  describe('generateUUID', () => {
    test('should generate valid UUID v4 format', () => {
      const uuid = generateUUID();
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    test('should generate unique UUIDs', () => {
      const uuids = new Set();
      for (let i = 0; i < 100; i++) {
        uuids.add(generateUUID());
      }
      expect(uuids.size).toBe(100);
    });
  });

  describe('validateServerUrl', () => {
    test('should validate correct WebSocket URLs', () => {
      expect(validateServerUrl('ws://localhost:8071/web-ide-bridge/ws')).toBe(true);
      expect(validateServerUrl('wss://example.com/ws')).toBe(true);
      expect(validateServerUrl('ws://127.0.0.1:3000')).toBe(true);
    });

    test('should reject invalid URLs', () => {
      expect(validateServerUrl('http://localhost:8071')).toBe(false);
      expect(validateServerUrl('https://example.com')).toBe(false);
      expect(validateServerUrl('ftp://example.com')).toBe(false);
      expect(validateServerUrl('')).toBe(false);
      expect(validateServerUrl(null)).toBe(false);
      expect(validateServerUrl(undefined)).toBe(false);
      expect(validateServerUrl(123)).toBe(false);
    });

    test('should reject malformed URLs', () => {
      expect(validateServerUrl('not-a-url')).toBe(false);
      expect(validateServerUrl('ws://')).toBe(false);
    });
  });

  describe('debounce', () => {
    test('should debounce function calls', async () => {
      let callCount = 0;
      const debouncedFn = debounce(() => {
        callCount++;
      }, 100);

      // Call multiple times quickly
      debouncedFn();
      debouncedFn();
      debouncedFn();

      expect(callCount).toBe(0);

      // Wait for debounce delay
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(callCount).toBe(1);
    });

    test('should handle immediate execution', async () => {
      let callCount = 0;
      const debouncedFn = debounce(() => {
        callCount++;
      }, 100, true);

      // First call should execute immediately
      debouncedFn();
      expect(callCount).toBe(1);

      // Subsequent calls should be debounced
      debouncedFn();
      debouncedFn();
      expect(callCount).toBe(1);

      await new Promise(resolve => setTimeout(resolve, 150));
      expect(callCount).toBe(2);
    });
  });

  describe('throttle', () => {
    test('should throttle function calls', async () => {
      let callCount = 0;
      const throttledFn = throttle(() => {
        callCount++;
      }, 100);

      // Call multiple times quickly
      throttledFn();
      throttledFn();
      throttledFn();

      expect(callCount).toBe(1);

      // Wait and call again
      await new Promise(resolve => setTimeout(resolve, 150));
      throttledFn();
      expect(callCount).toBe(2);
    });
  });

  describe('deepClone', () => {
    test('should clone primitive values', () => {
      expect(deepClone(42)).toBe(42);
      expect(deepClone('test')).toBe('test');
      expect(deepClone(true)).toBe(true);
      expect(deepClone(null)).toBe(null);
    });

    test('should clone arrays', () => {
      const original = [1, 2, { a: 3 }];
      const cloned = deepClone(original);
      
      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned[2]).not.toBe(original[2]);
    });

    test('should clone objects', () => {
      const original = { a: 1, b: { c: 2 } };
      const cloned = deepClone(original);
      
      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned.b).not.toBe(original.b);
    });

    test('should clone dates', () => {
      const original = new Date();
      const cloned = deepClone(original);
      
      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
    });
  });

  describe('escapeHtml', () => {
    test('should escape HTML entities', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
      expect(escapeHtml('& < > " \'')).toBe('&amp; &lt; &gt; &quot; &#39;');
      expect(escapeHtml('normal text')).toBe('normal text');
    });
  });

  describe('parseFileType', () => {
    test('should parse file extensions', () => {
      expect(parseFileType('script.js')).toBe('js');
      expect(parseFileType('style.css')).toBe('css');
      expect(parseFileType('index.html')).toBe('html');
      expect(parseFileType('data.json')).toBe('json');
      expect(parseFileType('README.md')).toBe('md');
    });

    test('should handle files without extensions', () => {
      expect(parseFileType('Dockerfile')).toBe('txt');
      expect(parseFileType('Makefile')).toBe('txt');
      expect(parseFileType('noextension')).toBe('txt');
    });

    test('should handle edge cases', () => {
      expect(parseFileType('')).toBe('txt');
      expect(parseFileType(null)).toBe('txt');
      expect(parseFileType(undefined)).toBe('txt');
    });
  });

  describe('formatFileSize', () => {
    test('should format bytes correctly', () => {
      expect(formatFileSize(1024)).toBe('1.0 KB');
      expect(formatFileSize(1048576)).toBe('1.0 MB');
      expect(formatFileSize(1073741824)).toBe('1.0 GB');
      expect(formatFileSize(500)).toBe('500 B');
    });

    test('should handle zero and negative values', () => {
      expect(formatFileSize(0)).toBe('0 B');
      expect(formatFileSize(-100)).toBe('0 B');
    });
  });

  describe('getLanguageName', () => {
    test('should return correct language names', () => {
      expect(getLanguageName('js')).toBe('JavaScript');
      expect(getLanguageName('css')).toBe('CSS');
      expect(getLanguageName('html')).toBe('HTML');
      expect(getLanguageName('json')).toBe('JSON');
      expect(getLanguageName('py')).toBe('Python');
    });

    test('should handle unknown file types', () => {
      expect(getLanguageName('xyz')).toBe('Text');
      expect(getLanguageName('')).toBe('Text');
    });
  });

  describe('isWebSocketSupported', () => {
    test('should detect WebSocket support', () => {
      // In jsdom environment, WebSocket should be available
      expect(isWebSocketSupported()).toBe(true);
    });
  });

  describe('getBrowserInfo', () => {
    test('should return browser information', () => {
      const info = getBrowserInfo();
      expect(info).toHaveProperty('userAgent');
      expect(info).toHaveProperty('language');
      expect(info).toHaveProperty('platform');
      expect(info).toHaveProperty('cookieEnabled');
      expect(info).toHaveProperty('webSocketSupported');
    });
  });

  describe('LocalStorage', () => {
    let storage;

    beforeEach(() => {
      storage = new LocalStorage('test-prefix');
      // Clear any existing data
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('test-prefix')) {
          localStorage.removeItem(key);
        }
      });
    });

    test('should set and get values', () => {
      storage.set('key1', 'value1');
      expect(storage.get('key1')).toBe('value1');
    });

    test('should return default value for missing keys', () => {
      expect(storage.get('missing', 'default')).toBe('default');
      expect(storage.get('missing')).toBe(null);
    });

    test('should remove values', () => {
      storage.set('key1', 'value1');
      storage.remove('key1');
      expect(storage.get('key1')).toBe(null);
    });

    test('should clear all values', () => {
      storage.set('key1', 'value1');
      storage.set('key2', 'value2');
      storage.clear();
      expect(storage.get('key1')).toBe(null);
      expect(storage.get('key2')).toBe(null);
    });
  });

  describe('delay', () => {
    test('should delay execution', async () => {
      const start = Date.now();
      await delay(100);
      const end = Date.now();
      expect(end - start).toBeGreaterThanOrEqual(90);
    });
  });

  describe('retry', () => {
    test('should retry failed operations', async () => {
      let attempts = 0;
      const failingFn = () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'success';
      };

      const result = await retry(failingFn, { maxAttempts: 3, delay: 10 });
      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    test('should throw after max attempts', async () => {
      const alwaysFailingFn = () => {
        throw new Error('Always fails');
      };

      await expect(retry(alwaysFailingFn, { maxAttempts: 2, delay: 10 }))
        .rejects.toThrow('Always fails');
    });
  });

  describe('isValidUUID', () => {
    test('should validate correct UUIDs', () => {
      expect(isValidUUID('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
      expect(isValidUUID('00000000-0000-4000-8000-000000000000')).toBe(true);
    });

    test('should reject invalid UUIDs', () => {
      expect(isValidUUID('not-a-uuid')).toBe(false);
      expect(isValidUUID('123e4567-e89b-12d3-a456')).toBe(false);
      expect(isValidUUID('')).toBe(false);
      expect(isValidUUID(null)).toBe(false);
    });
  });

  describe('safeJsonParse', () => {
    test('should parse valid JSON', () => {
      expect(safeJsonParse('{"key": "value"}')).toEqual({ key: 'value' });
      expect(safeJsonParse('[1, 2, 3]')).toEqual([1, 2, 3]);
    });

    test('should return default value for invalid JSON', () => {
      expect(safeJsonParse('invalid json')).toBe(null);
      expect(safeJsonParse('invalid json', 'default')).toBe('default');
    });
  });

  describe('safeJsonStringify', () => {
    test('should stringify valid objects', () => {
      expect(safeJsonStringify({ key: 'value' })).toBe('{"key":"value"}');
      expect(safeJsonStringify([1, 2, 3])).toBe('[1,2,3]');
    });

    test('should return default value for circular references', () => {
      const obj = { a: 1 };
      obj.self = obj;
      expect(safeJsonStringify(obj)).toBe('{}');
      expect(safeJsonStringify(obj, 'default')).toBe('default');
    });
  });

  describe('createCancellablePromise', () => {
    test('should create cancellable promise', async () => {
      const promise = new Promise(resolve => setTimeout(() => resolve('success'), 100));
      const cancellable = createCancellablePromise(promise);
      
      const result = await cancellable.promise;
      expect(result).toBe('success');
    });

    test('should allow cancellation', async () => {
      const promise = new Promise(resolve => setTimeout(() => resolve('success'), 100));
      const cancellable = createCancellablePromise(promise);
      
      cancellable.cancel();
      
      await expect(cancellable.promise).rejects.toThrow('Promise was cancelled');
    });
  });
}); 