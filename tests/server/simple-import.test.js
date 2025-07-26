// Simple test to verify WebSocket import works
const WebSocket = require('ws');

describe('WebSocket Import Test', () => {
  test('should import WebSocket module correctly', () => {
    expect(WebSocket).toBeDefined();
    expect(typeof WebSocket).toBe('function');
    expect(WebSocket.Server).toBeDefined();
    expect(typeof WebSocket.Server).toBe('function');
  });

  test('should create WebSocket server instance', () => {
    const wss = new WebSocket.Server({ noServer: true });
    expect(wss).toBeDefined();
    expect(wss.clients).toBeDefined();
    wss.close();
  });
}); 