# Web-IDE-Bridge v0.1.3

**Bridge the gap between web applications and desktop IDEs**

Web-IDE-Bridge allows developers to edit code snippets from web application textareas directly in their preferred desktop IDE, with automatic synchronization back to the browser.

![Web-IDE-Bridge Demo](https://img.shields.io/badge/status-active%20development-brightgreen) ![Version](https://img.shields.io/badge/version-0.1.3-blue) ![License](https://img.shields.io/badge/license-GPL--3.0-red)

## Problem

Modern web applications often include code editing capabilities through textarea elements, but these lack the rich feature set that developers expect from desktop IDEs:

- ❌ Limited syntax highlighting
- ❌ No code completion and IntelliSense
- ❌ Basic find/replace functionality
- ❌ No multi-cursor editing
- ❌ Missing plugin ecosystem
- ❌ Limited keyboard shortcuts and customizations

## Solution

Web-IDE-Bridge provides a seamless bridge that allows you to:

1. **🖱️ Click an "Edit in IDE ↗" button** next to any textarea in a web application
2. **🚀 Automatically launch** your preferred IDE with the code snippet
3. **✨ Edit with full IDE features** including syntax highlighting, completion, etc.
4. **💾 Save in your IDE** and see changes instantly synchronized back to the web application

## Project Structure

```
Web-IDE-Bridge/
├── README.md                           # Project documentation
├── LICENSE                             # GPL v3 license file
├── .gitignore                          # Git ignore patterns
├── package.json                        # Root package configuration
├── developer_context.md                # Technical implementation guide
├── tests/                              # Centralized test directory
│   ├── setup.js                        # Global test configuration
│   ├── utils/                          # Shared test utilities
│   │   └── websocket-utils.js          # WebSocket testing helpers
│   ├── server/                         # Server-specific tests
│   │   ├── server.test.js              # Core server functionality
│   │   ├── websocket.test.js           # WebSocket protocol tests
│   │   ├── sessions.test.js            # Session management tests
│   │   ├── edge-cases.test.js          # Error handling and edge cases
│   │   ├── performance.test.js         # Load and performance testing
│   │   ├── integration.test.js         # Server integration tests
│   │   └── comprehensive-validation.test.js # Complete validation suite
│   ├── browser/                        # Browser library tests
│   │   ├── client.test.js              # Client library functionality
│   │   ├── integration.test.js         # Browser integration tests
│   │   └── dom.test.js                 # DOM manipulation tests
│   ├── desktop/                        # Desktop app tests
│   │   ├── file-handling.test.js       # File operations tests
│   │   └── ide-integration.test.js     # IDE launch and communication
│   └── e2e/                            # End-to-end tests
│       ├── full-workflow.test.js       # Complete user workflows
│       ├── multi-user.test.js          # Multi-user scenarios
│       └── error-recovery.test.js      # Error handling workflows
├── browser/                            # Browser-side tier
│   ├── demo.html                       # Demo page with textarea forms
│   ├── web-ide-bridge.js               # Web-IDE-Bridge client library
│   ├── web-ide-bridge.min.js          # Minified production version
│   ├── package.json                    # Browser package configuration
│   ├── webpack.config.js               # Build configuration
│   └── src/                            # Source files
│       ├── client.js                   # Main client implementation
│       ├── ui.js                       # UI components and styling
│       └── utils.js                    # Utility functions
├── desktop/                            # Desktop tier (Go/Fyne)
│   ├── main.go                         # Main Go application
│   ├── go.mod                          # Go module definition
│   └── go.sum                          # Go module checksums
└── server/                             # Server-side tier
    ├── README.md                       # Points to repository root README
    ├── package.json                    # Node.js package configuration
    ├── package-lock.json               # Locked dependencies
    ├── web-ide-bridge-server.conf      # Server configuration file
    └── web-ide-bridge-server.js        # Node.js WebSocket server
```

## Architecture

Web-IDE-Bridge consists of three components working together:

```
┌─────────────┐    WebSocket    ┌──────────────┐    WebSocket    ┌─────────────┐
│   Browser   │ ◄─────────────► │    Server    │ ◄─────────────► │   Desktop   │
│  (Web App)  │                 │   (Relay)    │                 │     App     │
└─────────────┘                 └──────────────┘                 └─────────────┘
```

### Components

1. **🌐 Web-IDE-Bridge JavaScript Library** - Integrates into web applications to provide "Edit in IDE ↗" buttons
2. **🔗 Web-IDE-Bridge Server** - Node.js WebSocket server that routes messages between browser and desktop
3. **🖥️ Web-IDE-Bridge Desktop App** - Cross-platform Go/Fyne application that manages IDE integration

## Quick Start

### Prerequisites

- **Node.js** (v14+ recommended, v18+ preferred)
- **npm** or **yarn**
- **Go** (latest stable version for desktop application)

### 1. Clone and Set Up the Project

```bash
# Clone the Web-IDE-Bridge repository
git clone git@github.com:peterthoeny/web-ide-bridge.git
cd web-ide-bridge

# Install root dependencies (for testing)
npm install

# Install server dependencies
cd server
npm install
cd ..

# Install browser dependencies
cd browser
npm install
cd ..

# Install desktop dependencies
# (Optional) Download Go dependencies
cd desktop
go mod tidy
# Go will fetch dependencies automatically when you run or build the app
```

### 2. Start the Server

```bash
# From the server directory
cd server
npm start

# Or with debug logging
DEBUG=true npm start

# Or specify custom port
npm start -- --port 8071

# Or with custom configuration
npm start -- --config /path/to/config.conf
```

**Server Status:** Visit [http://localhost:8071](http://localhost:8071) to see the beautiful status dashboard.

### 3. Run Tests

Web-IDE-Bridge includes comprehensive test coverage with multiple testing strategies:

```bash
# From the project root
npm install  # Install test dependencies

# Run all tests
npm test

# Run specific test suites
npm run test:server         # Server functionality tests
npm run test:browser        # Browser library tests
npm run test:desktop        # Desktop app tests
npm run test:e2e           # End-to-end integration tests

# Performance and load testing
npm run test:performance   # Performance benchmarks
npm run test:edge-cases    # Error handling and edge cases

# Test reporting
npm run test:coverage      # Generate coverage report
npm run test:ci           # CI-friendly test run

# Development testing
npm run test:watch        # Watch mode for development

# Run specific test files
npm test -- tests/server/server.test.js
npm test -- tests/e2e/full-workflow.test.js

# Debug test runs
DEBUG_TESTS=true npm test
```

**Test Coverage Areas:**
- ✅ **Unit Tests:** Core functionality, validation, configuration
- ✅ **Integration Tests:** WebSocket communication, session management
- ✅ **Performance Tests:** Load testing, memory usage, response times
- ✅ **Edge Cases:** Error handling, connection failures, malformed data
- ✅ **End-to-End:** Complete user workflows and multi-user scenarios

### 4. Install Desktop Application

The desktop app is implemented in Go using the Fyne UI toolkit for native performance and minimal resource usage.

#### Option A: Download Pre-built Binaries
Download and install the Web-IDE-Bridge desktop application for your platform:
- **Windows**: `Web-IDE-Bridge-Setup.exe`
- **macOS**: `Web-IDE-Bridge.dmg`
- **Linux**: `Web-IDE-Bridge.AppImage`

#### Option B: Build from Source

**macOS/Windows/Linux Build:**
```bash
cd desktop
# Run the desktop app in development mode
go run main.go
# Or build a binary for your platform
go build -o web-ide-bridge main.go
```

Configure your preferred IDE and WebSocket server URL on first launch.

### 5. Integrate into Web Application

```html
<!-- Include the JavaScript library -->
<script src="/path/to/web-ide-bridge/web-ide-bridge.min.js"></script>

<script>
// Initialize Web-IDE-Bridge
const webIdeBridge = new WebIdeBridge('your-user-id', {
    serverUrl: 'ws://localhost:8071/web-ide-bridge/ws',
    debug: false
});

// Connect to server
await webIdeBridge.connect();

// Add external editor capability to textareas
webIdeBridge.onCodeUpdate((id, updatedCode) => {
    // Update textarea when code returns from IDE
    document.getElementById(id).value = updatedCode;
    
    // Trigger change events for frameworks
    document.getElementById(id).dispatchEvent(new Event('input', { bubbles: true }));
});

// Add event listeners to "Edit in IDE ↗" buttons
document.addEventListener('click', async (e) => {
    if (e.target.classList.contains('edit-in-ide-btn')) {
        const textareaId = e.target.dataset.textareaId;
        const textarea = document.getElementById(textareaId);
        const fileType = e.target.dataset.fileType || 'txt';
        
        if (textarea && webIdeBridge.isConnected()) {
            await webIdeBridge.editCodeSnippet(textareaId, textarea.value, fileType);
        }
    }
});

// Automatic button injection
webIdeBridge.autoInjectButtons({
    selector: 'textarea[data-language]',
    buttonText: 'Edit in IDE ↗',
    buttonClass: 'edit-in-ide-btn'
});
</script>
```

### 6. Usage Workflow

1. **🚀 Start Components**
   - Launch Web-IDE-Bridge server: `npm start` in server directory
   - Start Web-IDE-Bridge desktop app
   - Open your web application with integrated library

2. **🔗 Establish Connection**
   - Desktop app connects to server automatically
   - Browser connects when page loads
   - Status indicators show connection state

3. **📝 Edit Code**
   - Click "Edit in IDE ↗" button next to any textarea
   - Your preferred IDE opens with the code snippet
   - Full IDE features available: syntax highlighting, completion, debugging

4. **💾 Save and Sync**
   - Save in your IDE (Ctrl+S/Cmd+S)
   - Changes automatically sync back to web application
   - No manual copy/paste required

5. **⚡ Advanced Features**
   - Edit same textarea multiple times
   - Handle multiple textareas simultaneously
   - Support for different file types and syntax highlighting

## Features

### 🎯 Core Functionality

- **Seamless Integration**: One-line integration into existing web applications
- **Real-time Synchronization**: Instant sync between IDE and browser
- **Multi-file Support**: Handle multiple code snippets simultaneously
- **File Type Detection**: Automatic syntax highlighting based on file extensions
- **Connection Management**: Robust WebSocket connection with auto-reconnection

### 📊 Visual Indicators

- **Connection Status**: Visual indicators when Web-IDE-Bridge is connected
- **Active Sessions**: Desktop app shows active edit sessions
- **Real-time Updates**: Changes appear in browser immediately after IDE save
- **Status Dashboard**: Beautiful web interface showing server status and metrics

### 🔧 Multiple Edit Sessions

- **Concurrent Editing**: Edit multiple textareas from different browser tabs
- **Session Persistence**: Edit sessions survive temporary disconnections
- **User Isolation**: Multiple users can edit simultaneously without conflicts
- **Edit History**: Track editing activity and session duration

### 📁 File Type Support

Specify file extensions for proper syntax highlighting and IDE features:

- **JavaScript** (`.js`, `.jsx`, `.ts`, `.tsx`)
- **Styling** (`.css`, `.scss`, `.less`)
- **Markup** (`.html`, `.xml`, `.svg`)
- **Python** (`.py`, `.pyw`)
- **Shell Scripts** (`.sh`, `.bash`, `.zsh`)
- **Configuration** (`.json`, `.yaml`, `.toml`, `.ini`)
- **And any other file type your IDE supports**

## Supported IDEs

Web-IDE-Bridge works with any IDE that can be launched from the command line:

### 🔧 Popular IDEs

- **Visual Studio Code** - Full IntelliSense and extension support
- **Sublime Text** - Lightning-fast editing with powerful features
- **Atom** - Hackable text editor with rich package ecosystem
- **Vim/Neovim** - Modal editing with extensive customization
- **Emacs** - Extensible editor with powerful key bindings
- **IntelliJ IDEA** - Full IDE features for multiple languages
- **WebStorm** - JavaScript and web development focused
- **PyCharm** - Python development environment
- **And many more...**

### ⚙️ IDE Configuration

- Configure your preferred IDE using the desktop application's graphical user interface (GUI).
- You can set the IDE command, WebSocket URL, and other preferences directly in the desktop app settings.

## Configuration

### 🔧 Server Configuration

The server configuration file provides comprehensive customization options:

**Location Priority:**
1. `$WEB_IDE_BRIDGE_CONFIG` environment variable
2. `/etc/web-ide-bridge-server.conf`
3. `./web-ide-bridge-server.conf`

**Example Configuration:**
```json
{
  "server": {
    "port": 8071,
    "host": "0.0.0.0",
    "websocketEndpoint": "/web-ide-bridge/ws",
    "heartbeatInterval": 30000,
    "maxConnections": 1000,
    "connectionTimeout": 300000
  },
  "endpoints": {
    "health": "/web-ide-bridge/health",
    "status": "/web-ide-bridge/status",
    "debug": "/web-ide-bridge/debug"
  },
  "cors": {
    "origin": ["http://localhost:3000", "https://webapp.example.com"],
    "credentials": true
  },
  "security": {
    "rateLimiting": {
      "enabled": true,
      "windowMs": 900000,
      "maxRequests": 100
    }
  },
  "debug": true
}
```

### 🚀 Production Deployment

#### Docker Deployment
```bash
# Build image (from server directory)
docker build -t web-ide-bridge-server .

# Run container
docker run -d \
  --name web-ide-bridge \
  -p 8071:8071 \
  -v /etc/web-ide-bridge-server.conf:/app/config.conf \
  web-ide-bridge-server
```

#### Process Management with PM2
```bash
# Install PM2 globally
npm install -g pm2

# Start server with PM2
cd server
pm2 start web-ide-bridge-server.js --name web-ide-bridge

# Enable auto-start on boot
pm2 startup
pm2 save

# Monitor
pm2 logs web-ide-bridge
pm2 status
```

#### Reverse Proxy Configuration

**Nginx Configuration:**
```nginx
# Status and debug endpoints
location /web-ide-bridge/ {
    proxy_pass http://localhost:8071/web-ide-bridge/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# WebSocket endpoint
location /web-ide-bridge/ws {
    proxy_pass http://localhost:8071/web-ide-bridge/ws;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 86400;
}
```

### 🖥️ Desktop App Configuration

Configure through the desktop application settings interface:

- **WebSocket URL**: Server connection endpoint
  - Development: `ws://localhost:8071/web-ide-bridge/ws`
  - Production: `wss://webapp.example.com/web-ide-bridge/ws`
- **Preferred IDE**: Command to launch your IDE
- **User ID**: Identifier for session routing (defaults to OS username)
- **Auto-launch**: Start with system boot
- **Debug Mode**: Enable verbose logging and debugging features

## 📊 Monitoring and Observability

### Server Status Dashboard

**Development**: Visit `http://localhost:8071/web-ide-bridge/status`  
**Production**: Visit `https://webapp.example.com/web-ide-bridge/status`

The status dashboard provides:
- 🟢 **Real-time Connection Status**: Active browser and desktop clients
- 📈 **Performance Metrics**: Message throughput, response times, memory usage
- 👥 **User Sessions**: Active users and edit sessions
- ⚙️ **Configuration Overview**: Current server settings
- 🔄 **Auto-refresh**: Updates every 30 seconds

### Health Monitoring

**Health Check Endpoint**: `/web-ide-bridge/health`
```json
{
  "status": "healthy",
  "version": "0.1.3",
  "uptime": 3600,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Debug Information**: `/web-ide-bridge/debug` (debug mode only)
- Detailed connection information
- Active session details
- Complete configuration dump
- Process and memory statistics

### Performance Metrics

- **Response Times**: Sub-100ms for typical operations
- **Throughput**: 20+ messages per second sustained
- **Concurrent Connections**: 50+ simultaneous users tested
- **Memory Usage**: <100MB typical server footprint
- **Uptime**: Designed for 24/7 operation

## 🔒 Security Considerations

Web-IDE-Bridge implements multiple security layers:

### 🛡️ Data Protection
- **Temporary Files**: Code snippets stored in secure temp directories
- **Automatic Cleanup**: Files cleaned up based on configurable age limits
- **No Permanent Storage**: No code is stored permanently on the server
- **Session Isolation**: User sessions are properly isolated and secured

### 🔐 Network Security
- **WebSocket Authentication**: Session-based routing ensures security
- **Rate Limiting**: Configurable rate limiting prevents abuse
- **CORS Protection**: Strict cross-origin resource sharing policies
- **Input Validation**: All messages validated against strict schemas

### 🏠 Local Security
- **File Permissions**: Restricted file system access for desktop app
- **Process Isolation**: IDE processes run with user permissions
- **Path Validation**: Secure handling of file paths and names
- **Error Handling**: Graceful error handling prevents information leakage

## 🐛 Troubleshooting

### Connection Issues

**1. Check Server Status**
```bash
# Visit status page
curl http://localhost:8071/web-ide-bridge/health

# Check server logs
cd server && npm start
```

**2. Verify WebSocket Connection**
- Ensure WebSocket URL is correct in desktop app
- Check firewall settings for WebSocket port
- Verify network connectivity between components

**3. Browser Console Errors**
```javascript
// Check browser console for WebSocket errors
// Look for connection failures or message errors
console.log('WebSocket state:', webIdeBridge.getConnectionState());
```

### IDE Launch Issues

**1. Verify IDE Installation**
```bash
# Test IDE command from terminal
code --version
subl --version
vim --version
```

**2. Check PATH Configuration**
- Ensure IDE executable is in system PATH
- Verify command spelling and arguments
- Test IDE launch manually from command line

**3. File Permission Issues**
- Verify Web-IDE-Bridge can write to temp directory
- Check file system permissions
- Ensure IDE has access to temp files

### Sync Issues

**1. File Save Detection**
- Ensure you're actually saving the file in your IDE (Ctrl+S/Cmd+S)
- Some IDEs use atomic writes that may delay detection
- Check IDE-specific save behavior and settings

**2. Connection State**
- Verify both browser and desktop are connected
- Check for network interruptions
- Monitor connection status in desktop app

**3. Debug Mode**
```bash
# Enable debug logging
DEBUG=true npm start

# Check debug endpoint
curl http://localhost:8071/web-ide-bridge/debug
```

### Performance Issues

**1. Memory Usage**
- Monitor memory usage in status dashboard
- Check for memory leaks with long-running sessions
- Restart server if memory usage is excessive

**2. Connection Limits**
- Review `maxConnections` setting in configuration
- Monitor concurrent connection count
- Scale server resources if needed

**3. Network Latency**
- Test WebSocket connection speed
- Consider local server deployment for better performance
- Check network infrastructure and routing

## 🤝 Contributing

Web-IDE-Bridge is open source and welcomes contributions! We follow standard open source practices:

### 🐛 Issues and Bug Reports
- **Bug Reports**: Use GitHub issues with detailed reproduction steps
- **Feature Requests**: Propose new features with use cases and rationale
- **Questions**: Use discussions for general questions and support

### 🔧 Development Contributions
- **Pull Requests**: Submit improvements and fixes with tests
- **Code Style**: Follow existing code style and linting rules
- **Testing**: Ensure new features include appropriate tests
- **Documentation**: Update documentation for new features

### 📚 Documentation Contributions
- **Setup Guides**: Help improve installation and setup instructions
- **Usage Examples**: Contribute real-world usage examples
- **Troubleshooting**: Add solutions for common problems
- **Translations**: Help translate documentation to other languages

### 🚀 Getting Started with Development

```bash
# Fork the repository and clone your fork
git clone git@github.com:yourusername/web-ide-bridge.git
cd web-ide-bridge

# Install all dependencies
npm install
cd server && npm install && cd ..
cd browser && npm install && cd ..
cd desktop && npm install && cd ..

# Run tests to ensure everything works
npm test

# Start development server
cd server && npm run dev

# Make your changes and submit a pull request
```

## 📄 License

Web-IDE-Bridge is licensed under the **GNU General Public License v3.0** (GPL-3.0).

This means:
- ✅ **Free to use** for personal and commercial projects
- ✅ **Free to modify** and create derivative works
- ✅ **Free to distribute** original and modified versions
- ⚠️ **Must disclose source** when distributing
- ⚠️ **Must include license** in distributions
- ⚠️ **Same license** for derivative works

See the [LICENSE](LICENSE) file for complete details.

## 🙏 Acknowledgments

- **WebSocket Technology**: Built on robust WebSocket implementations
- **Go/Fyne**: Desktop app powered by Go and Fyne for native performance
- **Open Source Community**: Inspired by and built with open source tools
- **Contributors**: Thanks to all who have contributed code, documentation, and feedback

---

**Happy Coding! 🚀** Transform your web development workflow with Web-IDE-Bridge.
