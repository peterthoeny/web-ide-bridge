/**
 * @name            Web-IDE-Bridge / Tests / Server
 * @tagline         Simple import test
 * @description     Simple test to verify WebSocket import works
 * @file            tests/server/simple-import.test.js
 * @version         1.1.6
 * @release         2025-08-23
 * @repository      https://github.com/peterthoeny/web-ide-bridge
 * @author          Peter Thoeny, https://twiki.org & https://github.com/peterthoeny/
 * @copyright       2025 Peter Thoeny, https://twiki.org & https://github.com/peterthoeny/
 * @license         GPL v3, see LICENSE file
 * @genai           99%, Cursor 1.2, Claude Sonnet 4
 */

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
