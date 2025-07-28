const WebIdeBridgeServer = require('../../server/web-ide-bridge-server');
const { establishUserConnections, simulateEditWorkflow } = require('../utils/websocket-utils');

describe('End-to-End Workflow Tests', () => {
  let server;
  let serverPort;

  beforeAll(async () => {
    server = new WebIdeBridgeServer();
    server.config = global.testUtils.createTestConfig();
    await server.start();
    serverPort = server.server.address().port;
    await global.testUtils.waitForServer(serverPort);
  });

  afterAll(async () => {
    if (server && server.server) {
      await new Promise((resolve) => {
        server.server.close(resolve);
      });
    }
  });

  describe('Complete Edit Workflow', () => {
    test('should handle complete browser-to-desktop-to-browser flow', async () => {
      const { user, browserClient, desktopClient, cleanup } = 
        await establishUserConnections(serverPort);

      const originalCode = `function calculateSum(a, b) {
  return a + b;
}`;

      const updatedCode = `function calculateSum(a, b) {
  // Added validation
  if (typeof a !== 'number' || typeof b !== 'number') {
    throw new Error('Arguments must be numbers');
  }
  return a + b;
}`;

      const workflow = await simulateEditWorkflow(browserClient, desktopClient, {
        sessionId: `edit-session-${user.userId}`,
        snippetId: 'main-editor',
        originalCode,
        updatedCode,
        fileType: 'js',
        userId: user.userId
      });

      // Verify the complete workflow
      expect(workflow.editRequest.payload.code).toBe(originalCode);
      expect(workflow.editRequest.payload.fileType).toBe('js');
      expect(workflow.codeUpdate.payload.code).toBe(updatedCode);
      expect(workflow.codeUpdate.payload.snippetId).toBe('main-editor');

      await cleanup();
    });

    test('should handle multiple files being edited simultaneously', async () => {
      const { user, browserClient, desktopClient, cleanup } = 
        await establishUserConnections(serverPort);

      // Start editing multiple files
      const workflows = await Promise.all([
        simulateEditWorkflow(browserClient, desktopClient, {
          sessionId: global.testUtils.generateId('js-session'),
          snippetId: 'js-editor',
          originalCode: 'console.log("js");',
          updatedCode: 'console.log("updated js");',
          fileType: 'js',
          userId: user.userId
        }),
        simulateEditWorkflow(browserClient, desktopClient, {
          sessionId: global.testUtils.generateId('css-session'),
          snippetId: 'css-editor', 
          originalCode: '.container { width: 100%; }',
          updatedCode: '.container { width: 100%; max-width: 1200px; }',
          fileType: 'css',
          userId: user.userId
        }),
        simulateEditWorkflow(browserClient, desktopClient, {
          sessionId: global.testUtils.generateId('html-session'),
          snippetId: 'html-editor',
          originalCode: '<div>Hello</div>',
          updatedCode: '<div class="greeting">Hello World</div>',
          fileType: 'html', 
          userId: user.userId
        })
      ]);

      // Verify all workflows completed correctly
      expect(workflows).toHaveLength(3);
      workflows.forEach((workflow, index) => {
        expect(workflow.editRequest).toBeDefined();
        expect(workflow.codeUpdate).toBeDefined();
      });

      // Verify server tracked all sessions
      expect(server.activeSessions.size).toBe(3);

      await cleanup();
    });
  });

  describe('Multi-User Scenarios', () => {
    test('should handle multiple users editing simultaneously', async () => {
      // Set up two users
      const user1 = await establishUserConnections(serverPort, 'developer-1');
      const user2 = await establishUserConnections(serverPort, 'developer-2');

      // Both users start editing
      const [workflow1, workflow2] = await Promise.all([
        simulateEditWorkflow(user1.browserClient, user1.desktopClient, {
          sessionId: global.testUtils.generateId('user1-session'),
          snippetId: 'user1-editor',
          originalCode: 'const user1Code = "original";',
          updatedCode: 'const user1Code = "updated by user 1";',
          fileType: 'js',
          userId: user1.user.userId
        }),
        simulateEditWorkflow(user2.browserClient, user2.desktopClient, {
          sessionId: global.testUtils.generateId('user2-session'),
          snippetId: 'user2-editor',
          originalCode: 'const user2Code = "original";',
          updatedCode: 'const user2Code = "updated by user 2";',
          fileType: 'js',
          userId: user2.user.userId
        })
      ]);

      // Verify isolation - each user should only see their own updates
      expect(workflow1.codeUpdate.payload.code).toContain('user 1');
      expect(workflow2.codeUpdate.payload.code).toContain('user 2');

      // Verify server state
      expect(server.userSessions.size).toBe(2);
      expect(server.activeSessions.size).toBe(2);

      await user1.cleanup();
      await user2.cleanup();
    });

    test('should handle user disconnection and reconnection', async () => {
      const { user, browserClient, desktopClient, cleanup } = 
        await establishUserConnections(serverPort);

      // Start an edit session
      browserClient.send(global.testUtils.createMessage('edit_request', {
        snippetId: 'reconnect-test',
        code: 'const original = "code";',
        fileType: 'js'
      }, {
        sessionId: global.testUtils.generateId('reconnect-session'),
        userId: user.userId
      }));

      await desktopClient.waitForMessage(msg => msg.type === 'edit_request');
      expect(server.activeSessions.size).toBe(1);

      // Disconnect desktop
      await desktopClient.close();
      await global.testUtils.waitFor(() => server.desktopConnections.size === 0);

      // Browser should get error when trying new edit request
      browserClient.send(global.testUtils.createMessage('edit_request', {
        snippetId: 'after-disconnect',
        code: 'const afterDisconnect = true;',
        fileType: 'js'
      }, {
        sessionId: global.testUtils.generateId('after-disconnect'),
        userId: user.userId
      }));

      const error = await browserClient.waitForMessage(msg => msg.type === 'error');
      expect(error.message).toContain('No desktop connection found');

      await cleanup();
    });
  });

  describe('Performance and Stress Testing', () => {
    test('should handle rapid edit operations', async () => {
      const { user, browserClient, desktopClient, cleanup } = 
        await establishUserConnections(serverPort);

      const sessionId = global.testUtils.generateId('rapid-session');
      const snippetId = 'rapid-editor';

      // Start edit session
      browserClient.send(global.testUtils.createMessage('edit_request', {
        snippetId,
        code: 'let counter = 0;',
        fileType: 'js'
      }, {
        sessionId,
        userId: user.userId
      }));

      await desktopClient.waitForMessage(msg => msg.type === 'edit_request');

      // Send rapid updates
      const updateCount = 20;
      const updates = [];

      for (let i = 0; i < updateCount; i++) {
        const code = `let counter = ${i}; // Update ${i}`;
        updates.push(code);
        
        desktopClient.send(global.testUtils.createMessage('code_update', {
          code
        }, {
          sessionId
        }));
      }

      // Verify all updates are received in order
      for (let i = 0; i < updateCount; i++) {
        const update = await browserClient.waitForMessage(msg => 
          msg.type === 'code_update' && 
          msg.payload.code === updates[i]
        );
        expect(update.payload.snippetId).toBe(snippetId);
      }

      await cleanup();
    });

    test('should handle large code snippets', async () => {
      const { user, browserClient, desktopClient, cleanup } = 
        await establishUserConnections(serverPort);

      // Generate large code snippet (10KB)
      const largeCode = 'const data = {\n' + 
        Array.from({ length: 200 }, (_, i) => 
          `  item${i}: "This is a long string with item number ${i} and some additional text to make it longer",`
        ).join('\n') + '\n};';

      const workflow = await simulateEditWorkflow(browserClient, desktopClient, {
        sessionId: global.testUtils.generateId('large-session'),
        snippetId: 'large-editor',
        originalCode: 'const small = "code";',
        updatedCode: largeCode,
        fileType: 'js',
        userId: user.userId
      });

      expect(workflow.codeUpdate.payload.code).toBe(largeCode);
      expect(workflow.codeUpdate.payload.code.length).toBeGreaterThan(10000);

      await cleanup();
    });
  });

  describe('Error Recovery', () => {
    test('should gracefully handle malformed messages', async () => {
      const { user, browserClient, cleanup } = 
        await establishUserConnections(serverPort);

      // Send malformed message
      browserClient.send({ invalid: 'message', missing: 'required fields' });

      const error = await browserClient.waitForMessage(msg => msg.type === 'error');
      expect(error.message).toContain('missing type');

      await cleanup();
    });

    test('should handle session cleanup after connection loss', async () => {
      const { user, browserClient, desktopClient, cleanup } = 
        await establishUserConnections(serverPort);

      // Start edit session
      const sessionId = global.testUtils.generateId('cleanup-session');
      browserClient.send(global.testUtils.createMessage('edit_request', {
        snippetId: 'cleanup-editor',
        code: 'const cleanup = true;',
        fileType: 'js'
      }, {
        sessionId,
        userId: user.userId
      }));

      await desktopClient.waitForMessage(msg => msg.type === 'edit_request');
      expect(server.activeSessions.has(sessionId)).toBe(true);

      // Abruptly close browser connection
      await browserClient.close();

      // Wait for cleanup
      await global.testUtils.waitFor(() => !server.activeSessions.has(sessionId));
      expect(server.activeSessions.has(sessionId)).toBe(false);

      await desktopClient.close();
    });
  });
});
