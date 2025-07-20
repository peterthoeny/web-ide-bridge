# WebDevSync v0.1.1 (work in progress)

**Bridge the gap between web applications and desktop IDEs**

WebDevSync allows developers to edit code snippets from web application textareas directly in their preferred desktop IDE, with automatic synchronization back to the browser.

## Problem

Modern web applications often include code editing capabilities through textarea elements, but these lack the rich feature set that developers expect from desktop IDEs:

- Syntax highlighting
- Code completion and IntelliSense
- Advanced find/replace
- Multi-cursor editing
- Plugin ecosystem
- Keyboard shortcuts and customizations

## Solution

WebDevSync provides a seamless bridge that allows you to:

1. **Click an "External Editor" button** next to any textarea in a web application
2. **Automatically launch** your preferred IDE with the code snippet
3. **Edit with full IDE features** including syntax highlighting, completion, etc.
4. **Save in your IDE** and see changes instantly synchronized back to the web application

## Architecture

WebDevSync consists of three components working together:

```
┌─────────────┐    WebSocket    ┌──────────────┐    WebSocket    ┌─────────────┐
│   Browser   │ ◄─────────────► │    Server    │ ◄─────────────► │   Desktop   │
│  (Web App)  │                 │   (Relay)    │                 │     App     │
└─────────────┘                 └──────────────┘                 └─────────────┘
```

### Components

1. **web-dev-sync JavaScript Library** - Integrates into web applications to provide "External Editor" buttons
2. **web-dev-sync-server** - Node.js WebSocket server that routes messages between browser and desktop
3. **WebDevSync Desktop App** - Cross-platform application that manages IDE integration

## Quick Start

### Prerequisites

- **Node.js** (v14+ recommended)
- **npm**
- **Rust** (for desktop application)

### 1. Set Up the Server

```bash
# Install and run the WebSocket relay server
npm install -g web-dev-sync-server
web-dev-sync-server --port 8071
```

### 2. Install Desktop Application

Download and install the WebDevSync desktop application for your platform:
- **Windows**: `WebDevSync-Setup.exe`
- **macOS**: `WebDevSync.dmg`

Configure your preferred IDE and WebSocket server URL on first launch.

### 3. Integrate into Web Application

```html
<!-- Include the JavaScript library -->
<script src="/path/to/web-dev-sync/web-dev-sync.min.js"></script>

<script>
// Initialize WebDevSync
const webDevSync = new WebDevSync('your-user-id');

// Connect to server
await webDevSync.connect();

// Add external editor capability to textareas
webDevSync.onCodeUpdate((id, updatedCode) => {
    // Update textarea when code returns from IDE
    document.getElementById(id).value = updatedCode;
});

// Add event listeners to "External Editor" buttons
document.querySelectorAll('.external-editor-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
        const textareaId = e.target.dataset.textareaId;
        const textarea = document.getElementById(textareaId);
        const fileType = e.target.dataset.fileType || 'txt';
        
        await webDevSync.editCodeSnippet(textareaId, textarea.value, fileType);
    });
});
</script>
```

### 4. Usage Workflow

1. **Start Desktop App** - Launch and keep WebDevSync running in the background
2. **Open Web Application** - Navigate to your web app with integrated WebDevSync
3. **Click "External Editor"** - Button appears next to textareas when connection is active
4. **Edit in IDE** - Your preferred IDE opens with the code snippet
5. **Save Changes** - IDE saves are automatically synchronized back to the web application

## Features

### Visual Indicators

- **Active Connection**: Textareas show a subtle yellow background when WebDevSync is connected
- **Desktop Status**: Desktop app shows green status when browser connection is active
- **Real-time Sync**: Changes appear in the browser immediately after IDE save

### Multiple Edit Sessions

- Edit the same textarea multiple times by clicking "External Editor" again
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

WebDevSync works with any IDE that can be launched from the command line:

- **Visual Studio Code** (`code`)
- **Sublime Text** (`subl`)
- **Atom** (`atom`)
- **Vim/Neovim** (`vim`/`nvim`)
- **Emacs** (`emacs`)
- **IntelliJ IDEA** (`idea`)
- **And many more...**

## Configuration

### Server Configuration

Copy `web-dev-sync-server.conf` to `/etc`, and change options as needed.

The web-dev-sync-server supports these options:

```javascript
{
  port: 8071,
  websocketEndpoint: '/web-dev-sync/ws',
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
pm2 start web-dev-sync-server --name webdevsync
pm2 startup  # Enable auto-start on boot
pm2 save     # Save current process list
```

#### Reverse Proxy Configuration

**Purpose**: The web-dev-sync-server should be accessible under the same port and URI as your web application.

**Important Notes**:
- WebSocket endpoint may change from `ws://` to `wss://` in production
- Endpoints are consistent on both sides of the reverse proxy for simplicity

**Example nginx configuration**:

```nginx
# Status and debug endpoints
location /web-dev-sync/ {
    proxy_pass http://localhost:8071/web-dev-sync/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# WebSocket endpoint
location /web-dev-sync/ws {
    proxy_pass http://localhost:8071/web-dev-sync/ws;
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

In case you use Docker, you can run web-dev-sync-server in a container:

```bash
# Build image
docker build -t webdevsync-server .

# Run container
docker run -d \
  --name webdevsync \
  -p 8071:8071 \
  -v /etc/web-dev-sync-server.conf:/app/config.conf \
  webdevsync-server
```

**Example docker-compose.yml**:

```yaml
version: '3.8'
services:
  webdevsync-server:
    image: webdevsync-server
    container_name: webdevsync
    ports:
      - "8071:8071"
    volumes:
      - /etc/web-dev-sync-server.conf:/app/config.conf
    restart: unless-stopped
    environment:
      - NODE_ENV=production
```

### Desktop App Configuration

Configure through the desktop application settings:
- **WebSocket URL**: 
  - Development: `ws://localhost:8071/web-dev-sync/ws`
  - Production: `wss://webapp.example.com/web-dev-sync/ws`
- **Preferred IDE**: Command to launch your IDE
- **User ID**: Identifier for routing (defaults to OS username)
- **Debug Mode**: Enable verbose logging

#### Building the Desktop Application

The desktop application is built using **Tauri** for lightweight, high-performance native apps with much smaller bundle sizes and lower resource usage compared to traditional Electron applications.

**macOS Build Instructions**:

```bash
cd webdevsync-desktop
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
cd webdevsync-desktop
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

**Development**: Visit `http://localhost:8071/web-dev-sync/status` to see:
**Production**: Visit `https://webapp.example.com/web-dev-sync/status` to see:

- Server active status
- Active browser connections
- Active desktop connections  
- Current edit sessions
- Connected users

### Debug Information

**Development**: Visit `http://localhost:8071/web-dev-sync/debug` for detailed JSON information
**Production**: Visit `https://webapp.example.com/web-dev-sync/debug` for detailed JSON information

Shows all active connections and sessions for troubleshooting.

## Security Considerations

- WebDevSync creates temporary files in your system's temp directory
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
3. **File permissions**: Verify WebDevSync can write to temp directory

### Sync Issues

1. **Check file saves**: Ensure you're actually saving the file in your IDE
2. **File monitoring**: Some IDEs use atomic writes that may not trigger file watchers
3. **Debug mode**: Enable debug logging in both server and desktop app

## Contributing

WebDevSync is open source and welcomes contributions:

- **Issues**: Report bugs and request features
- **Pull Requests**: Submit improvements and fixes
- **Documentation**: Help improve setup and usage guides

## License

GPL v3 License - see LICENSE file for details.
