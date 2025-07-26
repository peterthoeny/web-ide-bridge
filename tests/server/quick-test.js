const WebIdeBridgeServer = require('../../server/web-ide-bridge-server');

async function quickTest() {
  console.log('Starting quick server test...');
  
  const testConfig = {
    server: {
      port: 0, // Use random port
      host: 'localhost',
      websocketEndpoint: '/web-ide-bridge/ws',
      heartbeatInterval: 1000,
      maxConnections: 100,
      connectionTimeout: 5000
    },
    endpoints: {
      health: '/web-ide-bridge/health',
      status: '/web-ide-bridge/status',
      debug: '/web-ide-bridge/debug',
      websocket: '/web-ide-bridge/ws'
    },
    cors: {
      origin: ['http://localhost:3000'],
      credentials: true
    },
    session: {
      secret: 'test-secret',
      name: 'test-session',
      cookie: { maxAge: 60000, secure: false, httpOnly: true, sameSite: 'lax' },
      resave: false,
      saveUninitialized: false,
      rolling: true
    },
    security: {
      rateLimiting: { enabled: false },
      helmet: { enabled: false }
    },
    logging: {
      level: 'error',
      enableAccessLog: false
    },
    cleanup: {
      sessionCleanupInterval: 1000,
      maxSessionAge: 5000,
      enablePeriodicCleanup: true
    },
    debug: false,
    environment: 'test'
  };

  try {
    const server = new WebIdeBridgeServer(testConfig);
    console.log('Server created successfully');
    
    await server.start();
    console.log('Server started successfully');
    
    const port = server.server.address().port;
    console.log(`Server running on port: ${port}`);
    
    // Test health endpoint
    const response = await fetch(`http://localhost:${port}/web-ide-bridge/health`);
    const data = await response.json();
    console.log('Health endpoint response:', data);
    
    await server.shutdown();
    console.log('Server shutdown successfully');
    
    console.log('✅ Quick test passed!');
  } catch (error) {
    console.error('❌ Quick test failed:', error);
    process.exit(1);
  }
}

quickTest(); 