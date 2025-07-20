# Web-IDE-Bridge v0.1.3 (work in progress)

**Bridge the gap between web applications and desktop IDEs**

Web-IDE-Bridge allows developers to edit code snippets from web application textareas directly in their preferred desktop IDE, with automatic synchronization back to the browser.

## Problem

Modern web applications often include code editing capabilities through textarea elements, but these lack the rich feature set that developers expect from desktop IDEs:

- Syntax highlighting
- Code completion and IntelliSense
- Advanced find/replace
- Multi-cursor editing
- Plugin ecosystem
- Keyboard shortcuts and customizations

## Solution

Web-IDE-Bridge provides a seamless bridge that allows you to:

1. **Click an "Edit in IDE ↗" button** next to any textarea in a web application
2. **Automatically launch** your preferred IDE with the code snippet
3. **Edit with full IDE features** including syntax highlighting, completion, etc.
4. **Save in your IDE** and see changes instantly synchronized back to the web application

## Project Structure

```
Web-IDE-Bridge/
├── README.md                           # Getting started guide
├── LICENSE                             # GPL v3 license file
├── .gitignore                          # Git ignore patterns
├── developer_context.md                # Technical implementation guide
├── browser/                            # Browser-side tier
│   ├── demo.html                       # Demo page with textarea forms
│   └── web-ide-bridge.js               # Web-IDE-Bridge client library
├── desktop/                            # Desktop tier (Windows, macOS)
│   ├── README.md                       # Points to repository root README
│   ├── web-ide-bridge.conf             # Desktop app configuration
│   ├── web-ide-bridge.js               # JavaScript frontend (Tauri)
│   ├── web-ide-bridge.rs               # Rust backend (Tauri)
│   ├── Cargo.toml                      # Rust dependencies
│   ├── tauri.conf.json                 # Tauri configuration
│   ├── package.json                    # Node.js dependencies
│   ├── package-lock.json               # Locked dependencies
│   └── src-tauri/                      # Tauri Rust source
│       ├── Cargo.toml                  # Rust project config
│       ├── build.rs                    # Build script
│       └── src/
│           └── main.rs                 # Main Rust application
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

1. **web-ide-bridge JavaScript Library** - Integrates into web applications to provide "Edit in IDE ↗" buttons
2. **web-ide-bridge-server** - Node.js WebSocket server that routes messages between browser and desktop
3. **Web-IDE-Bridge Desktop App** - Cross-platform application that manages IDE integration

## Quick Start

### Prerequisites

- **Node.js** (v14+ recommended)
- **npm**
- **Rust** (for desktop application)

### 1. Set Up the Project

```bash
# Install the complete Web-IDE-Bridge project
npm install -g web-ide-bridge
# This pulls the entire project structure including server, browser library, and desktop app
```

### 2. Start the Server

```bash
# Run the WebSocket relay server
web-ide-bridge-server --port 8071
```

### 3. Install Desktop Application

Download and install the Web-IDE-Bridge desktop application for your platform:
- **Windows**: `Web-IDE-Bridge-Setup.exe`
- **macOS**: `Web-IDE-Bridge.dmg`

Configure your preferred IDE and WebSocket server URL on first launch.

### 4. Integrate into Web Application

```html
<!-- Include the JavaScript library -->
<script src="/path/to/web-ide-bridge/web-ide-bridge.min.js"></script>

<script>
// Initialize Web-IDE-Bridge
const webIdeBridge = new WebIdeBridge('your-user-id');

// Connect to server
await webIdeBridge.connect();

// Add external editor capability to textareas
webIdeBridge.onCodeUpdate((id, updatedCode) => {
    // Update textarea when code returns from IDE
    document.getElementById(id).value = updatedCode;
});

// Add event listeners to "Edit in IDE ↗" buttons
document.querySelectorAll('.edit-in-ide-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
        const textareaId = e.target.dataset.textareaId;
        const textarea = document.getElementById(textareaId);
        const fileType = e.target.dataset.fileType || 'txt';
        
        await webIdeBridge.editCodeSnippet(textareaId, textarea.value, fileType);
    });
});
</script>
```

### 5. Usage Workflow

1. **Start Desktop App** - Launch and keep Web-IDE-Bridge running in the background
2. **Open Web Application** - Navigate to your web app with integrated Web-IDE-Bridge
3. **Click "Edit in IDE ↗"** - Button appears next to textareas when connection is active
4. **Edit in IDE** - Your preferred IDE opens with the code snippet
5. **Save Changes** - IDE saves are automatically synchronized back to the web application

## Features

### Visual Indicators

- **Active Connection**: Textareas show a subtle yellow background when Web-IDE-Bridge is connected
- **Desktop Status**: Desktop app shows green status when browser connection is active
- **Real-time Sync**: Changes appear in the browser immediately after IDE save

### Multiple Edit Sessions

- Edit the same textarea multiple times by clicking "Edit in IDE ↗" again
- Save multiple times in your IDE - each save updates the web application
- Handle multiple textareas simultaneously with proper routing

### File Type Support

Specify file extensions for proper syntax highlighting:
- JavaScript (`.js`)
- CSS (`.css`) 
- HTML (`.html`)
- Python (`.py`)
- And any other file type your IDE supports

## Supported IDEs

Web-IDE-Bridge works with any IDE that can be launched from the command line:

- **Visual Studio Code** (`code`)
- **Sublime Text** (`subl`)
- **Atom** (`atom`)
- **Vim/Neovim** (`vim`/`nvim`)
- **Emacs** (`emacs`)
- **IntelliJ IDEA** (`idea`)
- **And many more...**

## Configuration

### Server Configuration

Copy `web-ide-bridge-server.conf` to `/etc`, and change options as needed.

The web-ide-bridge-server supports these options:

```javascript
{
  port: 8071,
  websocketEndpoint: '/web-ide-bridge/ws',
  heartbeatInterval: 30000,
  cors: {
    origin: ['http://localhost:3000', 'https://webapp.example.com'],
    credentials: true
  },
  session: {
    secret: 'your-session-secret',
    cookie: { maxAge: 24 * 60 * 60 * 1000 },
    resave: false,
    saveUninitialized: false
  },
  debug: false
}
```

#### Running with npm

```bash
# Development
npm start

# Production - use a process manager like pm2
npm install -g pm2
pm2 start web-ide-bridge-server --name web-ide-bridge
pm2 startup  # Enable auto-start on boot
pm2 save     # Save current process list
```

#### Reverse Proxy Configuration

**Purpose**: The web-ide-bridge-server should be accessible under the same port and URI as your web application.

**Important Notes**:
- WebSocket endpoint may change from `ws://` to `wss://` in production
- Endpoints are consistent on both sides of the reverse proxy for simplicity

**Example nginx configuration**:

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

#### Docker Deployment (Optional)

In case you use Docker, you can run web-ide-bridge-server in a container:

```bash
# Build image
docker build -t web-ide-bridge-server .

# Run container
docker run -d \
  --name web-ide-bridge \
  -p 8071:8071 \
  -v /etc/web-ide-bridge-server.conf:/app/config.conf \
  web-ide-bridge-server
```

**Example docker-compose.yml**:

```yaml
version: '3.8'
services:
  web-ide-bridge-server:
    image: web-ide-bridge-server
    container_name: web-ide-bridge
    ports:
      - "8071:8071"
    volumes:
      - /etc/web-ide-bridge-server.conf:/app/config.conf
    restart: unless-stopped
    environment:
      - NODE_ENV=production
```

### Desktop App Configuration

Configure through the desktop application settings:
- **WebSocket URL**: 
  - Development: `ws://localhost:8071/web-ide-bridge/ws`
  - Production: `wss://webapp.example.com/web-ide-bridge/ws`
- **Preferred IDE**: Command to launch your IDE
- **User ID**: Identifier for routing (defaults to OS username)
- **Debug Mode**: Enable verbose logging

#### Building the Desktop Application

The desktop application is built using **Tauri** for lightweight, high-performance native apps with much smaller bundle sizes and lower resource usage compared to traditional applications.

**macOS Build Instructions**:

```bash
cd web-ide-bridge-desktop
npm install

# Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs/ | sh

# Install Tauri CLI
cargo install tauri-cli
npm install -g @tauri-apps/cli

npm run tauri build
```

**Windows Build Instructions**:

```bash
cd web-ide-bridge-desktop
npm install

# Install Rust if not already installed
# Download from https://rustup.rs/ or use winget
winget install Rust.Rustup

npm run tauri build
```

**Why Tauri**:
- **Size**: 90% smaller app bundles (~10MB vs ~100MB)
- **Memory**: 50-80% less RAM usage  
- **Security**: Better sandboxing and security model
- **Performance**: Native WebView performance
- **System Integration**: Better OS integration

## Monitoring

### Server Status Page

**Development**: Visit `http://localhost:8071/web-ide-bridge/status` to see:
**Production**: Visit `https://webapp.example.com/web-ide-bridge/status` to see:

- Server active status
- Active browser connections
- Active desktop connections  
- Current edit sessions
- Connected users

### Debug Information

**Development**: Visit `http://localhost:8071/web-ide-bridge/debug` for detailed JSON information
**Production**: Visit `https://webapp.example.com/web-ide-bridge/debug` for detailed JSON information

Shows all active connections and sessions for troubleshooting.

## Security Considerations

- Web-IDE-Bridge creates temporary files in your system's temp directory
- Files are cleaned up periodically based on age
- WebSocket connections use session-based routing to ensure code snippets reach the correct user
- No code is stored permanently on the server

## Troubleshooting

### Connection Issues

1. **Check server is running**: Visit the status page
2. **Verify WebSocket URL**: Ensure desktop app points to correct server
3. **Check firewall settings**: WebSocket port must be accessible
4. **Browser console**: Look for WebSocket connection errors

### IDE Launch Issues

1. **Verify IDE command**: Test launching your IDE from command line
2. **Check PATH**: Ensure IDE executable is in system PATH
3. **File permissions**: Verify Web-IDE-Bridge can write to temp directory

### Sync Issues

1. **Check file saves**: Ensure you're actually saving the file in your IDE
2. **File monitoring**: Some IDEs use atomic writes that may not trigger file watchers
3. **Debug mode**: Enable debug logging in both server and desktop app

## Contributing

Web-IDE-Bridge is open source and welcomes contributions:

- **Issues**: Report bugs and request features
- **Pull Requests**: Submit improvements and fixes
- **Documentation**: Help improve setup and usage guides

## License

GPL v3 License - see LICENSE file for details.
