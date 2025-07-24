# Web-IDE-Bridge Developer Context v0.1.3 (work in progress)

**Technical implementation guide and architecture documentation**

## System Architecture

Web-IDE-Bridge implements a three-tier architecture using WebSocket communication for real-time bidirectional messaging between browser, server, and desktop components.

### Component Overview

```
┌─────────────────────────┐
│     Browser Client      │
│  (web-ide-bridge lib)   │
│  - WebSocket client     │
│  - UUID generation      │
│  - DOM integration      │
└──────────┬──────────────┘
           │ WebSocket
           │
┌──────────▼──────────────┐
│    WebSocket Server     │
│ (web-ide-bridge-server) │
│  - Connection routing   │
│  - Session management   │
│  - Message relay        │
└──────────┬──────────────┘
           │ WebSocket
           │
┌──────────▼──────────────┐
│   Desktop Client App    │
│    (Web-IDE-Bridge)     │
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

## Component Implementation

### 1. web-ide-bridge JavaScript Library

**Core Class Interface:**
```javascript
class WebIdeBridge {
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
}
```

### 2. web-ide-bridge-server

**Technology Stack:**
- **Node.js** with Express.js framework
- **ws** library for WebSocket server implementation  
- **express-session** for session management
- **cors** for cross-origin support

**Configuration Management:**
```javascript
const defaultConfig = {
  port: 8071,
  websocketEndpoint: '/web-ide-bridge/ws',
  heartbeatInterval: 30000,
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000', 'https://webapp.example.com'],
    credentials: true
  },
  session: {
    secret: process.env.SESSION_SECRET || 'web-ide-bridge-secret',
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

### 3. Web-IDE-Bridge Desktop Application

**Technology Stack:**
- **Go** for backend file system operations, process management, and cross-platform desktop UI (using Fyne)
- **JavaScript/TypeScript** for frontend WebSocket connectivity (browser)

## Development Workflow

### Development Setup

1. **Server Development:**
```bash
cd web-ide-bridge-server
npm install
npm run dev  # Starts with nodemon for auto-reload
```

2. **Browser Library Development:**
```bash
cd web-ide-bridge-lib
npm install
npm run build  # Build for distribution
npm run dev    # Development with live reload
```

3. **Desktop App Development (Go/Fyne):**
```bash
cd desktop
go run main.go  # Run the desktop app in development mode
# or build a binary:
go build -o web-ide-bridge main.go
```

### Build and Deployment

**Server Deployment:**
```bash
# Production build
npm run build
npm run start

# Using PM2 for production
npm install -g pm2
pm2 start web-ide-bridge-server --name web-ide-bridge
pm2 startup
pm2 save
```

**Desktop App Distribution (Go/Fyne):**
```bash
# Build for your platform (from desktop/ directory)
go build -o web-ide-bridge main.go
# The resulting binary can be distributed for Windows, macOS, or Linux
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
- Clean up temp files periodically based on age
- Validate file extensions
- Use secure temp file naming to prevent conflicts

## Performance Optimization

### Server Optimization
- Single Node.js instance for simplicity (no Redis clustering)
- Connection pooling and reuse
- Message batching for high-frequency updates
- Memory-efficient session storage with periodic cleanup
- Graceful handling of connection drops with exponential backoff
- Implement WebSocket heartbeat/ping-pong for connection health

### Desktop App Optimization
- Native file system watchers for better performance
- Rust-based file operations for speed
- Minimal memory footprint with native WebView
- Async file operations to prevent UI blocking
- Efficient binary serialization for large code snippets

### Browser Library Optimization
- Debounce frequent edit requests (prevent spam clicking)
- Minimize DOM manipulations with efficient selectors
- Efficient event handling with event delegation
- Memory leak prevention with proper cleanup
- Connection state management with automatic reconnection

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
      this.retryCount = 0;
      this.reconnecting = false;
      this.onConnectionRestored?.();
    } catch (error) {
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        const delay = Math.min(
          this.baseDelay * Math.pow(2, this.retryCount - 1),
          this.maxDelay
        );
        
        setTimeout(() => {
          this.reconnecting = false;
          this.connectWithRetry();
        }, delay);
      } else {
        this.reconnecting = false;
        throw new Error('Max reconnection attempts exceeded');
      }
    }
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

  cleanupExpiredFiles() {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    
    const tempDir = os.tmpdir();
    const now = Date.now();

    try {
      const files = fs.readdirSync(tempDir);
      files.forEach(file => {
        if (file.startsWith('web-ide-bridge-')) {
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
}
```

## Load Balancing and High Availability

For simple deployments, Web-IDE-Bridge uses a single Node.js instance approach:

```javascript
// Simple single-instance server
class WebIdeBridgeServer {
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
    console.log(`Web-IDE-Bridge server running on port ${this.config.port}`);
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

## Monitoring and Metrics

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
    console.log('Web-IDE-Bridge Metrics:', JSON.stringify(this.metrics, null, 2));
    
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

## Production Deployment

### Nginx Configuration
```nginx
server {
    listen 443 ssl;
    server_name webapp.example.com;

    # SSL configuration
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # Web-IDE-Bridge status and debug endpoints
    location /web-ide-bridge/ {
        proxy_pass http://web-ide-bridge-backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Web-IDE-Bridge WebSocket endpoint
    location /web-ide-bridge/ws {
        proxy_pass http://web-ide-bridge-backend;
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

# Backend configuration
upstream web-ide-bridge-backend {
    # Production: Single app server
    server app-123.us-west.example.com:8071 max_fails=1 fail_timeout=30s;
}
```

### Docker Deployment (Optional)
```bash
# In case you use Docker:
docker build -t web-ide-bridge-server .
docker run -d \
  --name web-ide-bridge \
  -p 8071:8071 \
  -v /etc/web-ide-bridge-server.conf:/app/config.conf \
  web-ide-bridge-server
```

## Conclusion

This technical specification provides comprehensive implementation guidance for building a robust, scalable Web-IDE-Bridge system that can handle hundreds of concurrent users while maintaining responsive real-time synchronization between web browsers and desktop IDEs.

The architecture emphasizes simplicity and reliability with a single-instance server approach, native desktop performance through Go , and comprehensive error handling and recovery mechanisms.
