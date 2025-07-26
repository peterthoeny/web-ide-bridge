import { UIManager } from '../../browser/src/ui.js';

// Mock WebIdeBridge for testing
class MockWebIdeBridge {
  constructor() {
    this.connected = false;
  }

  editCodeSnippet(textareaId, code, fileType) {
    return Promise.resolve({ success: true, textareaId, code, fileType });
  }

  isConnected() {
    return this.connected;
  }
}

describe('UI Manager', () => {
  let uiManager;
  let mockBridge;
  let container;

  beforeEach(() => {
    // Set up DOM container
    container = document.createElement('div');
    container.id = 'test-container';
    document.body.appendChild(container);

    mockBridge = new MockWebIdeBridge();
    uiManager = new UIManager(mockBridge);
  });

  afterEach(() => {
    // Clean up
    uiManager.removeAllButtons();
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  describe('autoInjectButtons', () => {
    test('should inject buttons for existing textareas', () => {
      // Create test textareas
      const textarea1 = document.createElement('textarea');
      textarea1.id = 'test1';
      textarea1.setAttribute('data-language', 'js');
      container.appendChild(textarea1);

      const textarea2 = document.createElement('textarea');
      textarea2.id = 'test2';
      textarea2.setAttribute('data-language', 'css');
      container.appendChild(textarea2);

      const result = uiManager.autoInjectButtons();

      // Check that buttons were injected
      const buttons = container.querySelectorAll('.web-ide-bridge-btn');
      expect(buttons.length).toBe(2);

      // Check button properties
      expect(buttons[0].textContent).toBe('Edit in IDE ↗');
      expect(buttons[1].textContent).toBe('Edit in IDE ↗');

      // Test refresh functionality
      result.refresh();
      expect(container.querySelectorAll('.web-ide-bridge-btn').length).toBe(2);

      // Test destroy functionality
      result.destroy();
      expect(container.querySelectorAll('.web-ide-bridge-btn').length).toBe(0);
    });

    test('should handle custom selectors', () => {
      // Create elements with custom selector
      const textarea = document.createElement('textarea');
      textarea.className = 'custom-textarea';
      container.appendChild(textarea);

      uiManager.autoInjectButtons({ selector: '.custom-textarea' });

      const buttons = container.querySelectorAll('.web-ide-bridge-btn');
      expect(buttons.length).toBe(1);
    });

    test('should exclude elements with exclude selector', () => {
      const textarea1 = document.createElement('textarea');
      textarea1.id = 'include';
      container.appendChild(textarea1);

      const textarea2 = document.createElement('textarea');
      textarea2.id = 'exclude';
      textarea2.className = 'web-ide-bridge-exclude';
      container.appendChild(textarea2);

      uiManager.autoInjectButtons();

      const buttons = container.querySelectorAll('.web-ide-bridge-btn');
      expect(buttons.length).toBe(1);
    });

    test('should only include elements with include selector', () => {
      const textarea1 = document.createElement('textarea');
      textarea1.id = 'include';
      textarea1.className = 'include-only';
      container.appendChild(textarea1);

      const textarea2 = document.createElement('textarea');
      textarea2.id = 'exclude';
      container.appendChild(textarea2);

      uiManager.autoInjectButtons({ includeOnlySelector: '.include-only' });

      const buttons = container.querySelectorAll('.web-ide-bridge-btn');
      expect(buttons.length).toBe(1);
    });
  });

  describe('injectButton', () => {
    test('should inject button for specific textarea', () => {
      const textarea = document.createElement('textarea');
      textarea.id = 'test-textarea';
      container.appendChild(textarea);

      const button = uiManager.injectButton(textarea, {
        buttonText: 'Custom Button',
        fileType: 'js'
      });

      expect(button).toBeDefined();
      expect(button.textContent).toBe('Custom Button');
      expect(button.className).toContain('web-ide-bridge-btn');
    });

    test('should generate ID for textarea without ID', () => {
      const textarea = document.createElement('textarea');
      container.appendChild(textarea);

      const button = uiManager.injectButton(textarea);
      
      expect(textarea.id).toMatch(/^web-ide-bridge-textarea-/);
      expect(button).toBeDefined();
    });

    test('should throw error for non-textarea elements', () => {
      const div = document.createElement('div');
      container.appendChild(div);

      expect(() => {
        uiManager.injectButton(div);
      }).toThrow('Element must be a textarea');
    });

    test('should handle different button positions', () => {
      const textarea = document.createElement('textarea');
      textarea.id = 'test';
      container.appendChild(textarea);

      // Test 'after' position (default)
      const buttonAfter = uiManager.injectButton(textarea, { position: 'after' });
      expect(textarea.nextSibling).toBe(buttonAfter);

      // Test 'before' position
      const textarea2 = document.createElement('textarea');
      textarea2.id = 'test2';
      container.appendChild(textarea2);
      const buttonBefore = uiManager.injectButton(textarea2, { position: 'before' });
      expect(textarea2.previousSibling).toBe(buttonBefore);
    });
  });

  describe('removeAllButtons', () => {
    test('should remove all injected buttons', () => {
      const textarea1 = document.createElement('textarea');
      textarea1.id = 'test1';
      container.appendChild(textarea1);

      const textarea2 = document.createElement('textarea');
      textarea2.id = 'test2';
      container.appendChild(textarea2);

      uiManager.injectButton(textarea1);
      uiManager.injectButton(textarea2);

      expect(container.querySelectorAll('.web-ide-bridge-btn').length).toBe(2);

      uiManager.removeAllButtons();

      expect(container.querySelectorAll('.web-ide-bridge-btn').length).toBe(0);
    });

    test('should clean up observers and styles', () => {
      const textarea = document.createElement('textarea');
      textarea.id = 'test';
      container.appendChild(textarea);

      uiManager.autoInjectButtons({ watchForChanges: true });
      uiManager.injectButton(textarea);

      // Check that styles were added
      expect(document.querySelector('style[data-web-ide-bridge]')).toBeDefined();

      uiManager.removeAllButtons();

      // Check that styles were removed
      expect(document.querySelector('style[data-web-ide-bridge]')).toBeNull();
    });
  });

  describe('removeButton', () => {
    test('should remove button for specific textarea', () => {
      const textarea = document.createElement('textarea');
      textarea.id = 'test';
      container.appendChild(textarea);

      uiManager.injectButton(textarea);
      expect(container.querySelectorAll('.web-ide-bridge-btn').length).toBe(1);

      uiManager.removeButton(textarea);
      expect(container.querySelectorAll('.web-ide-bridge-btn').length).toBe(0);
    });

    test('should handle textarea without button', () => {
      const textarea = document.createElement('textarea');
      textarea.id = 'test';
      container.appendChild(textarea);

      // Should not throw error
      expect(() => {
        uiManager.removeButton(textarea);
      }).not.toThrow();
    });
  });

  describe('updateButtonStates', () => {
    test('should update button states based on connection status', () => {
      const textarea = document.createElement('textarea');
      textarea.id = 'test';
      container.appendChild(textarea);

      const button = uiManager.injectButton(textarea);

      // Test disconnected state
      mockBridge.connected = false;
      uiManager.updateButtonStates(false);
      expect(button.disabled).toBe(true);
      expect(button.title).toContain('disconnected');

      // Test connected state
      mockBridge.connected = true;
      uiManager.updateButtonStates(true);
      expect(button.disabled).toBe(false);
      expect(button.title).toContain('connected');
    });
  });

  describe('DOM watching', () => {
    test('should watch for new textareas when enabled', async () => {
      uiManager.autoInjectButtons({ watchForChanges: true });

      // Initially no textareas
      expect(container.querySelectorAll('.web-ide-bridge-btn').length).toBe(0);

      // Add textarea dynamically
      const textarea = document.createElement('textarea');
      textarea.id = 'dynamic';
      container.appendChild(textarea);

      // Wait for mutation observer to trigger
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(container.querySelectorAll('.web-ide-bridge-btn').length).toBe(1);
    });

    test('should not watch for changes when disabled', async () => {
      uiManager.autoInjectButtons({ watchForChanges: false });

      const textarea = document.createElement('textarea');
      textarea.id = 'dynamic';
      container.appendChild(textarea);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(container.querySelectorAll('.web-ide-bridge-btn').length).toBe(0);
    });
  });

  describe('Button click handling', () => {
    test('should call editCodeSnippet when button is clicked', async () => {
      const textarea = document.createElement('textarea');
      textarea.id = 'test';
      textarea.value = 'console.log("test");';
      container.appendChild(textarea);

      const button = uiManager.injectButton(textarea, { fileType: 'js' });

      // Mock the editCodeSnippet method
      const mockEdit = jest.fn().mockResolvedValue({ success: true });
      mockBridge.editCodeSnippet = mockEdit;

      // Simulate button click
      button.click();

      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockEdit).toHaveBeenCalledWith('test', 'console.log("test");', 'js');
    });

    test('should handle button click when disconnected', async () => {
      const textarea = document.createElement('textarea');
      textarea.id = 'test';
      container.appendChild(textarea);

      const button = uiManager.injectButton(textarea);

      // Set disconnected state
      mockBridge.connected = false;
      uiManager.updateButtonStates(false);

      const mockEdit = jest.fn();
      mockBridge.editCodeSnippet = mockEdit;

      // Button should be disabled and not trigger edit
      button.click();

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockEdit).not.toHaveBeenCalled();
    });
  });

  describe('Style injection', () => {
    test('should inject modern styles by default', () => {
      const textarea = document.createElement('textarea');
      textarea.id = 'test';
      container.appendChild(textarea);

      uiManager.injectButton(textarea, { style: 'modern' });

      const styleElement = document.querySelector('style[data-web-ide-bridge]');
      expect(styleElement).toBeDefined();
      expect(styleElement.textContent).toContain('web-ide-bridge-btn');
    });

    test('should inject minimal styles when specified', () => {
      const textarea = document.createElement('textarea');
      textarea.id = 'test';
      container.appendChild(textarea);

      uiManager.injectButton(textarea, { style: 'minimal' });

      const styleElement = document.querySelector('style[data-web-ide-bridge]');
      expect(styleElement).toBeDefined();
      expect(styleElement.textContent).toContain('web-ide-bridge-btn');
    });

    test('should not inject styles for custom style option', () => {
      const textarea = document.createElement('textarea');
      textarea.id = 'test';
      container.appendChild(textarea);

      uiManager.injectButton(textarea, { style: 'custom' });

      const styleElement = document.querySelector('style[data-web-ide-bridge]');
      expect(styleElement).toBeNull();
    });
  });

  describe('File type detection', () => {
    test('should use data-language attribute for file type', () => {
      const textarea = document.createElement('textarea');
      textarea.id = 'test';
      textarea.setAttribute('data-language', 'python');
      container.appendChild(textarea);

      const button = uiManager.injectButton(textarea);
      
      // Simulate click to check file type
      const mockEdit = jest.fn();
      mockBridge.editCodeSnippet = mockEdit;
      
      button.click();
      
      expect(mockEdit).toHaveBeenCalledWith('test', '', 'python');
    });

    test('should use default file type when not specified', () => {
      const textarea = document.createElement('textarea');
      textarea.id = 'test';
      container.appendChild(textarea);

      const button = uiManager.injectButton(textarea);
      
      const mockEdit = jest.fn();
      mockBridge.editCodeSnippet = mockEdit;
      
      button.click();
      
      expect(mockEdit).toHaveBeenCalledWith('test', '', 'txt');
    });
  });
}); 