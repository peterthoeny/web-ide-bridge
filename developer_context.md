# WebDevSync Developer Context v0.1.0 (work in progress)

**Technical implementation guide and architecture documentation**

## System Architecture

WebDevSync implements a three-tier architecture using WebSocket communication for real-time bidirectional messaging between browser, server, and desktop components.

### Component Overview

```
┌─────────────────────────┐
│     Browser Client      │
│  (web-dev-sync lib)     │
│  - WebSocket client     │
│  - UUID generation      │
│  - DOM integration      │
└──────────┬──────────────┘
           │ WebSocket
           │
┌──────────▼──────────────┐
│    WebSocket Server     │
│  (web-dev-sync-server)  │
│  - Connection routing   │
│  - Session management   │
│  - Message relay        │
└──────────┬──────────────┘
           │ WebSocket
           │
┌──────────▼──────────────┐
│     Desktop Client      │
│  (WebDevSync desktop)   │
│  - IDE integration      │
│  - File monitoring      │
│  - Process management   │
└─────────────────────────┘
```

## Implementation Details

### Message Flow Architecture

#### Edit Request Flow
```
Browser → Server → Desktop → IDE
  │         │         │       │
  │         │         │       └─ Launch with temp file
  │         │         └─ Save code to temp file
  │         └─ Route by user session
  └─ Send code + metadata
```

#### Save Sync Flow  
```
IDE → Desktop → Server → Browser
 │       │        │        │
 │       │        │        └─ Update textarea content
 │       │        └─ Route by session ID
 │       └─ Detect file change & read
 └─ User saves file
```

### Protocol Specification

#### WebSocket Message Format

All messages use JSON format with the following structure:

```javascript
{
  "type": "message_type",
  "connectionId": "uuid-v4-string", 
  "userId": "user-identifier",
  "sessionId": "edit-session-id",
  "payload": {
    // Message-specific data
  }
}
```

#### Message Types

**Browser → Server:**
```javascript
// Connection establishment
{
  "type": "browser_connect",
  "connectionId": "browser-uuid",
  "userId": "user123"
}

// Edit request
{
  "type": "edit_request", 
  "connectionId": "browser-uuid",
  "userId": "user123",
  "sessionId": "session-uuid",
  "payload": {
    "textareaId": "code-editor-1",
    "code": "console.log('hello');",
    "fileType": "js"
  }
}
```

**Desktop → Server:**
```javascript
// Connection establishment  
{
  "type": "desktop_connect",
  "connectionId": "desktop-uuid", 
  "userId": "user123"
}

// Code update
{
  "type": "code_update",
  "connectionId": "desktop-uuid",
  "userId": "user123", 
  "sessionId": "session-uuid",
  "payload": {
    "textareaId": "code-editor-1",
    "code": "console.log('hello world!');"
  }
}
```

**Server → Browser/Desktop:**
```javascript
// Connection acknowledgment
{
  "type": "connection_ack",
  "connectionId": "client-uuid",
  "status": "connected"
}

// Error messages
{
  "type": "error",
  "connectionId": "client-uuid", 
  "payload": {
    "message": "User session not found",
    "code": "SESSION_NOT_FOUND"
  }
}
```

## Component Implementation

### 1. web-dev-sync JavaScript Library

**Core Class Interface:**
```javascript
class WebDevSync {
  constructor(userId, debug = false) {
    this.userId = userId;
    this.debug = debug;
    this.connectionId = this.generateUUID();
    this.ws = null;
    this.connected = false;
    this.statusCallbacks = [];
    this.codeUpdateCallbacks = [];
  }

  // Connection management
  async connect() { /* WebSocket connection logic */ }
  disconnect() { /* Clean disconnection */ }
  isConnected() { return this.connected; }

  // Event handling
  statusChange(callback) { /* Register status callback */ }
  onCodeUpdate(callback) { /* Register code update callback */ }

  // Core functionality
  async editCodeSnippet(id, codeSnippet, editType = 'txt') {
    /* Send edit request to server */
  }

  // Internal utilities
  generateUUID() { /* UUID v4 generation */ }
  handleMessage(event) { /* WebSocket message router */ }
  updateConnectionStatus(status) { /* Status change handler */ }
}
```

**Integration Pattern:**
```javascript
// Initialization
const webDevSync = new WebDevSync('user123', true);

// Connection handling
await webDevSync.connect();
webDevSync.statusChange((connected) => {
  // Update UI to show connection status
  document.querySelectorAll('.external-editor-btn')
    .forEach(btn => btn.disabled = !connected);
});

// Code synchronization
webDevSync.onCodeUpdate((textareaId, updatedCode) => {
  const textarea = document.getElementById(textareaId);
  if (textarea) {
    textarea.value = updatedCode;
    // Trigger change events for frameworks
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }
});

// External editor integration
document.addEventListener('click', async (e) => {
  if (e.target.classList.contains('external-editor-btn')) {
    const textareaId = e.target.dataset.textareaId;
    const textarea = document.getElementById(textareaId);
    const fileType = e.target.dataset.fileType || 'txt';
    
    await webDevSync.editCodeSnippet(textareaId, textarea.value, fileType);
  }
});
```

### 2. web-dev-sync-server

**Technology Stack:**
- **Node.js** with Express.js framework
- **ws** library for WebSocket server implementation  
- **express-session** for session management
- **cors** for cross-origin support

**Core Server Architecture:**
```javascript
const express = require('express');
const WebSocket = require('ws');
const session = require('express-session');

class WebDevSyncServer {
  constructor(config) {
    this.config = config;
    this.app = express();
    this.server = null;
    this.wss = null;
    
    // Connection tracking
    this.browserConnections = new Map(); // connectionId -> {ws, userId, sessionId}
    this.desktopConnections = new Map(); // connectionId -> {ws, userId}
    this.userSessions = new Map();       // userId -> {browserId, desktopId}
    this.activeSessions = new Map();     // sessionId -> {userId, textareaId}
  }

  start() {
    this.setupExpress();
    this.setupWebSocket(); 
    this.setupRoutes();
    this.server.listen(this.config.port);
  }

  setupWebSocket() {
    this.wss = new WebSocket.Server({ 
      server: this.server,
      path: this.config.websocketEndpoint 
    });
    
    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });
  }

  handleConnection(ws, req) {
    ws.on('message', (data) => {
      const message = JSON.parse(data);
      this.routeMessage(ws, message);
    });

    ws.on('close', () => {
      this.handleDisconnection(ws);
    });
  }

  routeMessage(ws, message) {
    switch (message.type) {
      case 'browser_connect':
        this.handleBrowserConnect(ws, message);
        break;
      case 'desktop_connect': 
        this.handleDesktopConnect(ws, message);
        break;
      case 'edit_request':
        this.handleEditRequest(ws, message);
        break;
      case 'code_update':
        this.handleCodeUpdate(ws, message);
        break;
    }
  }

  handleEditRequest(ws, message) {
    const { userId, sessionId, payload } = message;
    
    // Find desktop connection for user
    const userSession = this.userSessions.get(userId);
    if (!userSession || !userSession.desktopId) {
      this.sendError(ws, 'No desktop connection found');
      return;
    }

    const desktopConn = this.desktopConnections.get(userSession.desktopId);
    if (desktopConn) {
      // Store session info
      this.activeSessions.set(sessionId, {
        userId,
        textareaId: payload.textareaId,
        browserConnectionId: message.connectionId
      });

      // Forward to desktop
      desktopConn.ws.send(JSON.stringify({
        type: 'edit_request',
        sessionId,
        payload
      }));
    }
  }

  handleCodeUpdate(ws, message) {
    const { sessionId, payload } = message;
    
    // Find original session
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      this.sendError(ws, 'Session not found');
      return;
    }

    // Find browser connection
    const browserConn = this.browserConnections.get(session.browserConnectionId);
    if (browserConn) {
      browserConn.ws.send(JSON.stringify({
        type: 'code_update',
        payload: {
          textareaId: session.textareaId,
          code: payload.code
        }
      }));
    }
  }
}
```

**Configuration Management:**
```javascript
const defaultConfig = {
  port: 8080,
  websocketEndpoint: '/ws',
  heartbeatInterval: 30000,
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true
  },
  session: {
    secret: process.env.SESSION_SECRET || 'webdevsync-secret',
    cookie: { 
      maxAge: 24 * 60 * 60 * 1000,
      secure: process.env.NODE_ENV === 'production'
    },
    resave: false,
    saveUninitialized: false
  },
  debug: process.env.DEBUG === 'true'
};
```

**Status and Debug Endpoints:**
```javascript
// GET /status - Human readable status
app.get('/status', (req, res) => {
  res.json({
    active: true,
    uptime: process.uptime(),
    connections: {
      browser: this.browserConnections.size,
      desktop: this.desktopConnections.size
    },
    sessions: {
      users: this.userSessions.size,
      active: this.activeSessions.size
    }
  });
});

// GET /debug - Detailed debug information  
app.get('/debug', (req, res) => {
  res.json({
    browserConnections: Array.from(this.browserConnections.entries()),
    desktopConnections: Array.from(this.desktopConnections.entries()),
    userSessions: Array.from(this.userSessions.entries()),
    activeSessions: Array.from(this.activeSessions.entries())
  });
});
```

### 3. WebDevSync Desktop Application

**Technology Stack:**
- **Electron** for cross-platform desktop application
- **Node.js** for file system operations and process management
- **ws** for WebSocket client connectivity

**Core Desktop Architecture:**
```javascript
class WebDevSyncDesktop {
  constructor() {
    this.config = this.loadConfig();
    this.connectionId = this.generateUUID();
    this.ws = null;
    this.connected = false;
    this.activeSessions = new Map(); // sessionId -> {filePath, watcher}
  }

  connect() {
    this.ws = new WebSocket(this.config.websocketUrl);
    
    this.ws.on('open', () => {
      this.sendMessage({
        type: 'desktop_connect',
        connectionId: this.connectionId,
        userId: this.config.userId
      });
    });

    this.ws.on('message', (data) => {
      const message = JSON.parse(data);
      this.handleMessage(message);
    });
  }

  handleMessage(message) {
    switch (message.type) {
      case 'edit_request':
        this.handleEditRequest(message);
        break;
      case 'connection_ack':
        this.updateConnectionStatus(true);
        break;
    }
  }

  async handleEditRequest(message) {
    const { sessionId, payload } = message;
    const { textareaId, code, fileType } = payload;

    try {
      // Create temporary file
      const tempFile = await this.createTempFile(code, fileType);
      
      // Launch IDE
      await this.launchIDE(tempFile);
      
      // Set up file watcher
      const watcher = this.watchFile(tempFile, (updatedCode) => {
        this.sendCodeUpdate(sessionId, textareaId, updatedCode);
      });

      // Store session
      this.activeSessions.set(sessionId, {
        filePath: tempFile,
        watcher: watcher
      });

    } catch (error) {
      console.error('Error handling edit request:', error);
    }
  }

  async createTempFile(code, fileType) {
    const os = require('os');
    const path = require('path');
    const fs = require('fs').promises;

    const tempDir = os.tmpdir();
    const fileName = `webdevsync-${Date.now()}.${fileType}`;
    const filePath = path.join(tempDir, fileName);

    await fs.writeFile(filePath, code, 'utf8');
    return filePath;
  }

  async launchIDE(filePath) {
    const { spawn } = require('child_process');
    
    // Get IDE command from config
    const ideCommand = this.config.preferredIDE;
    
    if (!ideCommand) {
      throw new Error('No IDE configured');
    }

    // Launch IDE with file
    const process = spawn(ideCommand, [filePath], {
      detached: true,
      stdio: 'ignore'
    });

    process.unref(); // Don't wait for IDE to exit
  }

  watchFile(filePath, onUpdate) {
    const fs = require('fs');
    const path = require('path');

    let lastModified = 0;

    const watcher = fs.watchFile(filePath, { interval: 500 }, async (curr, prev) => {
      if (curr.mtime > lastModified) {
        lastModified = curr.mtime;
        
        try {
          const updatedCode = await fs.promises.readFile(filePath, 'utf8');
          onUpdate(updatedCode);
        } catch (error) {
          console.error('Error reading updated file:', error);
        }
      }
    });

    return watcher;
  }

  sendCodeUpdate(sessionId, textareaId, updatedCode) {
    this.sendMessage({
      type: 'code_update',
      connectionId: this.connectionId,
      sessionId: sessionId,
      payload: {
        textareaId: textareaId,
        code: updatedCode
      }
    });
  }
}
```

**Configuration Management:**
```javascript
// Default configuration
const defaultConfig = {
  websocketUrl: 'ws://localhost:8080/ws',
  userId: require('os').userInfo().username,
  preferredIDE: this.getDefaultIDE(),
  debug: false
};

getDefaultIDE() {
  const platform = require('os').platform();
  
  switch (platform) {
    case 'win32':
      return 'code'; // VS Code
    case 'darwin':
      return 'code'; // VS Code  
    case 'linux':
      return 'code'; // VS Code
    default:
      return 'vim';
  }
}

// Configuration persistence
saveConfig(config) {
  const configPath = path.join(os.homedir(), '.webdevsync', 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

loadConfig() {
  const configPath = path.join(os.homedir(), '.webdevsync', 'config.json');
  
  try {
    const configData = fs.readFileSync(configPath, 'utf8');
    return { ...defaultConfig, ...JSON.parse(configData) };
  } catch (error) {
    return defaultConfig;
  }
}
```

## Development Workflow

### Development Setup

1. **Server Development:**
```bash
cd web-dev-sync-server
npm install
npm run dev  # Starts with nodemon for auto-reload
```

2. **Browser Library Development:**
```bash
cd web-dev-sync-lib
npm install
npm run build  # Build for distribution
npm run dev    # Development with live reload
```

3. **Desktop App Development:**
```bash
cd webdevsync-desktop
npm install
npm run electron:dev  # Electron development mode
```

### Testing Strategy

**Unit Tests:**
- WebSocket message routing logic
- File system operations  
- Configuration management
- UUID generation and validation

**Integration Tests:**
- End-to-end edit workflow
- Connection handling under load
- Error recovery scenarios
- Cross-platform IDE integration

**Load Testing:**
- Multiple concurrent users
- WebSocket connection limits
- Memory usage under sustained load
- Session cleanup verification

### Build and Deployment

**Server Deployment:**
```bash
# Production build
npm run build
npm run start

# Docker deployment
docker build -t webdevsync-server .
docker run -p 8080:8080 webdevsync-server
```

**Desktop App Distribution:**
```bash
# Windows
npm run build:win

# macOS  
npm run build:mac

# Linux
npm run build:linux

# All platforms
npm run build:all
```

**Library Distribution:**
```bash
# Build for npm
npm run build

# Publish to npm
npm publish

# Build for CDN
npm run build:cdn
```

## Security Considerations

### WebSocket Security
- Use WSS (WebSocket Secure) in production
- Implement connection rate limiting
- Validate all incoming message formats
- Sanitize file paths and content

### File System Security  
- Restrict temp file creation to designated directories
- Implement file size limits
- Clean up temp files on session end
- Validate file extensions

### Session Management
- Use cryptographically secure session IDs
- Implement session timeouts
- Clean up stale sessions periodically
- Validate user permissions

## Performance Optimization

### Server Optimization
- Connection pooling and reuse
- Message batching for high-frequency updates
- Memory-efficient session storage
- Graceful handling of connection drops

### Desktop App Optimization
- Efficient file watching (avoid polling when possible)
- Lazy loading of IDE processes
- Temp file cleanup scheduling
- Resource usage monitoring

### Browser Library Optimization
- Debounce frequent edit requests
- Minimize DOM manipulations
- Efficient event handling
- Memory leak prevention

## Error Handling and Recovery

### Connection Recovery
```javascript
// Auto-reconnection logic
class ConnectionManager {
  constructor(url, maxRetries = 5) {
    this.url = url;
    this.maxRetries = maxRetries;
    this.retryCount = 0;
    this.backoffDelay = 1000;
  }

  async connectWithRetry() {
    try {
      await this.connect();
      this.retryCount = 0; // Reset on successful connection
    } catch (error) {
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        const delay = this.backoffDelay * Math.pow(2, this.retryCount - 1);
        setTimeout(() => this.connectWithRetry(), delay);
      } else {
        throw new Error('Max reconnection attempts exceeded');
      }
    }
  }
}
```

### Session Recovery
- Persist active sessions across server restarts
- Handle desktop app crashes gracefully  
- Recover from browser refresh/navigation
- Clean up orphaned temp files

This technical specification provides the foundation for implementing a robust, scalable WebDevSync system that can handle hundreds of concurrent users while maintaining responsive real-time synchronization between web browsers and desktop IDEs.
