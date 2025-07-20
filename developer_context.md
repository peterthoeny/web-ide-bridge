# WebDevSync Developer Context v0.1.1 (work in progress)

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
  port: 8071,
  websocketEndpoint: '/web-dev-sync/ws',
  heartbeatInterval: 30000,
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000', 'https://webapp.example.com'],
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

// Configuration file loading
function loadConfigFromFile() {
  try {
    const configPath = '/etc/web-dev-sync-server.conf';
    const configData = fs.readFileSync(configPath, 'utf8');
    return { ...defaultConfig, ...JSON.parse(configData) };
  } catch (error) {
    console.log('Using default configuration');
    return defaultConfig;
  }
}
```

**Status and Debug Endpoints:**
```javascript
// GET /web-dev-sync/status - Human readable status
app.get('/web-dev-sync/status', (req, res) => {
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

// GET /web-dev-sync/debug - Detailed debug information  
app.get('/web-dev-sync/debug', (req, res) => {
  res.json({
    browserConnections: Array.from(this.browserConnections.entries()),
    desktopConnections: Array.from(this.desktopConnections.entries()),
    userSessions: Array.from(this.userSessions.entries()),
    activeSessions: Array.from(this.activeSessions.entries())
  });
});

// Serve static files under /web-dev-sync prefix
app.use('/web-dev-sync', express.static('public'));
```

### 3. WebDevSync Desktop Application

**Technology Stack:**
- **Tauri** for cross-platform desktop application with native performance
- **Rust** for backend file system operations and process management
- **JavaScript/TypeScript** for frontend WebSocket connectivity
- **Native WebView** for UI rendering with minimal resource usage

**Core Desktop Architecture (Tauri Implementation):**
```javascript
// Frontend (JavaScript/TypeScript)
import { invoke } from '@tauri-apps/api/tauri';
import { WebSocketManager } from './websocket';

class WebDevSyncDesktop {
  constructor() {
    this.config = null;
    this.wsManager = new WebSocketManager();
    this.activeSessions = new Map();
  }

  async initialize() {
    this.config = await invoke('load_config');
    await this.wsManager.connect(this.config.websocketUrl);
  }

  async handleEditRequest(message) {
    const { sessionId, payload } = message;
    const { textareaId, code, fileType } = payload;

    try {
      // Call Rust backend to create temp file and launch IDE
      const tempFile = await invoke('create_temp_file', { 
        code, 
        fileType 
      });
      
      await invoke('launch_ide', { 
        filePath: tempFile,
        ideCommand: this.config.preferredIDE 
      });
      
      // Set up file watcher
      const watcherId = await invoke('watch_file', { 
        filePath: tempFile,
        sessionId 
      });

      this.activeSessions.set(sessionId, {
        filePath: tempFile,
        watcherId: watcherId
      });

    } catch (error) {
      console.error('Error handling edit request:', error);
    }
  }
}
```

**Backend (Rust) for Tauri:**
```rust
// src-tauri/src/main.rs
use tauri::command;
use std::process::Command;
use std::fs;
use std::path::Path;
use notify::{Watcher, RecursiveMode, watcher};
use std::sync::mpsc::channel;
use std::time::Duration;

#[command]
async fn create_temp_file(code: String, file_type: String) -> Result<String, String> {
    let temp_dir = std::env::temp_dir();
    let file_name = format!("webdevsync-{}.{}", 
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis(), 
        file_type
    );
    
    let file_path = temp_dir.join(file_name);
    
    fs::write(&file_path, code)
        .map_err(|e| format!("Failed to write temp file: {}", e))?;
    
    Ok(file_path.to_string_lossy().to_string())
}

#[command]
async fn launch_ide(file_path: String, ide_command: String) -> Result<(), String> {
    Command::new(&ide_command)
        .arg(&file_path)
        .spawn()
        .map_err(|e| format!("Failed to launch IDE: {}", e))?;
    
    Ok(())
}

#[command]
async fn watch_file(file_path: String, session_id: String) -> Result<String, String> {
    let (tx, rx) = channel();
    
    let mut watcher = watcher(tx, Duration::from_secs(1))
        .map_err(|e| format!("Failed to create watcher: {}", e))?;
    
    watcher.watch(&file_path, RecursiveMode::NonRecursive)
        .map_err(|e| format!("Failed to watch file: {}", e))?;
    
    // Handle file changes in a separate thread
    let file_path_clone = file_path.clone();
    let session_id_clone = session_id.clone();
    
    std::thread::spawn(move || {
        loop {
            match rx.recv() {
                Ok(event) => {
                    // Read updated file and send to frontend
                    if let Ok(updated_code) = fs::read_to_string(&file_path_clone) {
                        // Emit event to frontend
                        // Frontend will handle sending to WebSocket server
                    }
                },
                Err(e) => break,
            }
        }
    });
    
    Ok(session_id)
}

#[derive(serde::Serialize, serde::Deserialize)]
struct AppConfig {
    websocket_url: String,
    user_id: String,
    preferred_ide: String,
    debug: bool,
}

#[command]
async fn load_config() -> Result<AppConfig, String> {
    let config_path = dirs::home_dir()
        .ok_or("Failed to get home directory")?
        .join(".webdevsync")
        .join("config.json");
    
    if config_path.exists() {
        let config_str = fs::read_to_string(config_path)
            .map_err(|e| format!("Failed to read config: {}", e))?;
        
        serde_json::from_str(&config_str)
            .map_err(|e| format!("Failed to parse config: {}", e))
    } else {
        // Return default config
        Ok(AppConfig {
            websocket_url: get_default_websocket_url(),
            user_id: whoami::username(),
            preferred_ide: get_default_ide(),
            debug: false,
        })
    }
}

fn get_default_websocket_url() -> String {
    // Development default
    "ws://localhost:8071/web-dev-sync/ws".to_string()
    // Production would be: "wss://webapp.example.com/web-dev-sync/ws"
}

fn get_default_ide() -> String {
    if cfg!(target_os = "windows") {
        "code".to_string()
    } else if cfg!(target_os = "macos") {
        "code".to_string()
    } else {
        "vim".to_string()
    }
}
```

**Configuration Management:**
```javascript
// Default configuration
const defaultConfig = {
  websocketUrl: 'ws://localhost:8071/web-dev-sync/ws', // Development
  // Production: 'wss://webapp.example.com/web-dev-sync/ws'
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

# Configuration
cp web-dev-sync-server.conf.example /etc/web-dev-sync-server.conf
# Edit configuration as needed
```

2. **Browser Library Development:**
```bash
cd web-dev-sync-lib
npm install
npm run build  # Build for distribution
npm run dev    # Development with live reload
```

3. **Desktop App Development (Tauri):**
```bash
cd webdevsync-desktop
npm install

# Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs/ | sh

# Install Tauri CLI
cargo install tauri-cli
npm install -g @tauri-apps/cli

npm run tauri dev  # Development mode with hot reload
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

# Using PM2 for production
npm install -g pm2
pm2 start web-dev-sync-server --name webdevsync
pm2 startup
pm2 save

# Docker deployment (optional)
# In case you use Docker:
docker build -t webdevsync-server .
docker run -d \
  --name webdevsync \
  -p 8071:8071 \
  -v /etc/web-dev-sync-server.conf:/app/config.conf \
  webdevsync-server

# Docker Compose (optional)
version: '3.8'
services:
  webdevsync-server:
    image: webdevsync-server
    ports:
      - "8071:8071"
    volumes:
      - /etc/web-dev-sync-server.conf:/app/config.conf
    restart: unless-stopped
```

**Desktop App Distribution (Tauri):**
```bash
# Windows
npm run tauri build -- --target x86_64-pc-windows-msvc

# macOS (Intel)
npm run tauri build -- --target x86_64-apple-darwin

# macOS (Apple Silicon)
npm run tauri build -- --target aarch64-apple-darwin

# Linux
npm run tauri build -- --target x86_64-unknown-linux-gnu

# All platforms (if cross-compilation is set up)
npm run tauri build
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

**Nginx Configuration for Production:**
```nginx
server {
    listen 443 ssl;
    server_name webapp.example.com;

    # SSL configuration
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # Main application
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebDevSync status and debug endpoints
    # Maps /web-dev-sync/status to localhost:8071/web-dev-sync/status
    location /web-dev-sync/ {
        proxy_pass http://webdevsync-backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebDevSync WebSocket endpoint
    # Maps /web-dev-sync/ws to localhost:8071/web-dev-sync/ws
    location /web-dev-sync/ws {
        proxy_pass http://webdevsync-backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}

# Backend configuration for load balancing
upstream webdevsync-backend {
    # Development: Single local server
    # server localhost:8071;
    
    # Production: Single app server
    server app-123.us-west.example.com:8071 max_fails=1 fail_timeout=30s;
}
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
- Clean up temp files periodically based on age (not just session end)
- Validate file extensions
- Use secure temp file naming to prevent conflicts

### Production Security Considerations
- Use WSS (WebSocket Secure) with SSL/TLS certificates
- Implement proper CORS policies for production domains
- Use environment variables for sensitive configuration
- Regular security audits of dependencies
- Rate limiting for WebSocket connections
- Input validation and sanitization for all messages

### Session Management
- Use cryptographically secure session IDs
- Implement session timeouts
- Clean up stale sessions periodically
- Validate user permissions

## Performance Optimization

### Server Optimization
- Single Node.js instance for simplicity (no Redis clustering)
- Connection pooling and reuse
- Message batching for high-frequency updates
- Memory-efficient session storage with periodic cleanup
- Graceful handling of connection drops with exponential backoff
- Implement WebSocket heartbeat/ping-pong for connection health
- Efficient in-memory session management

### Desktop App Optimization

**Tauri Optimizations:**
- Native file system watchers for better performance
- Rust-based file operations for speed
- Minimal memory footprint with native WebView
- Async file operations to prevent UI blocking
- Efficient binary serialization for large code snippets
- Native OS integration for better resource management

### Browser Library Optimization
- Debounce frequent edit requests (prevent spam clicking)
- Minimize DOM manipulations with efficient selectors
- Efficient event handling with event delegation
- Memory leak prevention with proper cleanup
- Connection state management with automatic reconnection
- Lazy initialization of WebSocket connections

## Error Handling and Recovery

### Connection Recovery
```javascript
// Enhanced auto-reconnection logic with exponential backoff
class ConnectionManager {
  constructor(url, maxRetries = 10) {
    this.url = url;
    this.maxRetries = maxRetries;
    this.retryCount = 0;
    this.baseDelay = 1000;
    this.maxDelay = 30000;
    this.reconnecting = false;
  }

  async connectWithRetry() {
    if (this.reconnecting) return;
    this.reconnecting = true;

    try {
      await this.connect();
      this.retryCount = 0; // Reset on successful connection
      this.reconnecting = false;
      this.onConnectionRestored?.();
    } catch (error) {
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        const delay = Math.min(
          this.baseDelay * Math.pow(2, this.retryCount - 1),
          this.maxDelay
        );
        
        this.onRetryAttempt?.(this.retryCount, delay);
        setTimeout(() => {
          this.reconnecting = false;
          this.connectWithRetry();
        }, delay);
      } else {
        this.reconnecting = false;
        this.onMaxRetriesExceeded?.(error);
        throw new Error('Max reconnection attempts exceeded');
      }
    }
  }

  // Health check mechanism
  startHealthCheck(interval = 30000) {
    setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      } else if (!this.reconnecting) {
        this.connectWithRetry();
      }
    }, interval);
  }
}
```

### Session Recovery and Cleanup
```javascript
// Session management with cleanup
class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.tempFiles = new Map();
    this.cleanupInterval = 60000; // 1 minute
    this.maxSessionAge = 24 * 60 * 60 * 1000; // 24 hours
    this.maxFileAge = 2 * 60 * 60 * 1000; // 2 hours
    
    this.startCleanupScheduler();
  }

  startCleanupScheduler() {
    setInterval(() => {
      this.cleanupExpiredSessions();
      this.cleanupExpiredFiles();
    }, this.cleanupInterval);
  }

  cleanupExpiredSessions() {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.createdAt > this.maxSessionAge) {
        this.removeSession(sessionId);
      }
    }
  }

  cleanupExpiredFiles() {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    
    const tempDir = os.tmpdir();
    const now = Date.now();

    try {
      const files = fs.readdirSync(tempDir);
      files.forEach(file => {
        if (file.startsWith('webdevsync-')) {
          const filePath = path.join(tempDir, file);
          const stats = fs.statSync(filePath);
          
          if (now - stats.mtime.getTime() > this.maxFileAge) {
            fs.unlinkSync(filePath);
            console.log(`Cleaned up expired temp file: ${file}`);
          }
        }
      });
    } catch (error) {
      console.error('Error during temp file cleanup:', error);
    }
  }

  // Graceful shutdown
  async gracefulShutdown() {
    console.log('Starting graceful shutdown...');
    
    // Close all active sessions
    for (const [sessionId, session] of this.sessions.entries()) {
      await this.closeSession(sessionId);
    }
    
    // Clean up remaining temp files
    this.cleanupExpiredFiles();
    
    console.log('Graceful shutdown completed');
  }
}
```

### Error Recovery Strategies
```javascript
// Desktop app error recovery
class DesktopErrorHandler {
  constructor(app) {
    this.app = app;
    this.setupErrorHandlers();
  }

  setupErrorHandlers() {
    // Handle IDE launch failures
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      if (error.code === 'ENOENT') {
        this.handleIDENotFound();
      } else {
        this.handleGenericError(error);
      }
    });

    // Handle file system errors
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      this.handleFileSystemError(reason);
    });
  }

  handleIDENotFound() {
    // Show user-friendly error and configuration dialog
    this.app.showErrorDialog({
      title: 'IDE Not Found',
      message: 'The configured IDE could not be found. Please check your IDE configuration.',
      buttons: ['Configure IDE', 'Use Default']
    });
  }

  handleFileSystemError(error) {
    if (error.code === 'EACCES') {
      // Permission error
      this.app.showErrorDialog({
        title: 'Permission Error',
        message: 'WebDevSync does not have permission to create temporary files. Please check your system permissions.',
        buttons: ['OK']
      });
    }
  }

  handleGenericError(error) {
    // Log error for debugging
    console.error('Generic error:', error);
    
    // Show generic error dialog
    this.app.showErrorDialog({
      title: 'Unexpected Error',
      message: 'An unexpected error occurred. Please check the logs for more details.',
      buttons: ['OK', 'View Logs']
    });
  }
}
```

### Load Balancing and High Availability

For simple deployments, WebDevSync uses a single Node.js instance approach:

```javascript
// Simple single-instance server
class WebDevSyncServer {
  constructor(config) {
    this.config = config;
    this.app = express();
    this.server = null;
    this.wss = null;
    
    // In-memory storage (no Redis needed for single instance)
    this.browserConnections = new Map();
    this.desktopConnections = new Map();
    this.userSessions = new Map();
    this.activeSessions = new Map();
  }

  start() {
    this.setupExpress();
    this.setupWebSocket(); 
    this.setupRoutes();
    this.server.listen(this.config.port);
    console.log(`WebDevSync server running on port ${this.config.port}`);
  }

  // Graceful shutdown handling
  setupGracefulShutdown() {
    process.on('SIGTERM', () => {
      console.log('Received SIGTERM, shutting down gracefully...');
      this.server.close(() => {
        console.log('HTTP server closed');
        this.wss.close(() => {
          console.log('WebSocket server closed');
          process.exit(0);
        });
      });
    });
  }
}
```

**For High Availability (if needed later):**
- Use PM2 for process management and automatic restarts
- Implement health checks for monitoring
- Use nginx for load balancing if multiple instances needed
- Consider file-based session persistence for restarts

### Monitoring and Metrics
```javascript
// Application monitoring and metrics collection
class MetricsCollector {
  constructor() {
    this.metrics = {
      connections: { browser: 0, desktop: 0 },
      sessions: { active: 0, total: 0 },
      messages: { sent: 0, received: 0, errors: 0 },
      performance: { avgResponseTime: 0, memory: 0 },
      errors: { connection: 0, session: 0, file: 0 }
    };
    
    this.startMetricsCollection();
  }

  startMetricsCollection() {
    // Collect metrics every minute
    setInterval(() => {
      this.collectSystemMetrics();
      this.logMetrics();
    }, 60000);
  }

  collectSystemMetrics() {
    const process = require('process');
    this.metrics.performance.memory = process.memoryUsage().heapUsed;
  }

  logMetrics() {
    console.log('WebDevSync Metrics:', JSON.stringify(this.metrics, null, 2));
    
    // Send to monitoring service (e.g., Prometheus, DataDog)
    if (process.env.METRICS_ENDPOINT) {
      this.sendToMonitoringService(this.metrics);
    }
  }

  recordError(type, error) {
    this.metrics.errors[type] = (this.metrics.errors[type] || 0) + 1;
    console.error(`${type} error:`, error);
  }

  recordMessage(direction) {
    this.metrics.messages[direction]++;
  }
}
```

This enhanced technical specification provides comprehensive implementation guidance for building a robust, scalable WebDevSync system that can handle hundreds of concurrent users while maintaining responsive real-time synchronization between web browsers and desktop IDEs.
