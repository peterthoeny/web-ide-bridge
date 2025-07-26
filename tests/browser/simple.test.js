// Simple test to verify Jest is working for browser tests
describe('Browser Tests - Basic Setup', () => {
  test('should have jsdom environment', () => {
    expect(typeof window).toBe('object');
    expect(typeof document).toBe('object');
    expect(typeof navigator).toBe('object');
  });

  test('should be able to create DOM elements', () => {
    const div = document.createElement('div');
    div.id = 'test';
    div.textContent = 'Hello World';
    document.body.appendChild(div);
    
    expect(document.getElementById('test')).toBe(div);
    expect(div.textContent).toBe('Hello World');
    
    document.body.removeChild(div);
  });

  test('should support modern JavaScript features', () => {
    // Test ES6+ features
    const obj = { a: 1, b: 2 };
    const { a, b } = obj;
    expect(a).toBe(1);
    expect(b).toBe(2);
    
    // Test arrow functions
    const add = (x, y) => x + y;
    expect(add(2, 3)).toBe(5);
    
    // Test async/await
    const asyncTest = async () => {
      return Promise.resolve('success');
    };
    
    return asyncTest().then(result => {
      expect(result).toBe('success');
    });
  });
}); 