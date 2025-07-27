#!/usr/bin/env node

const express = require('express');
const WebSocket = require('ws');
const session = require('express-session');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { VERSION } = require('./version.js');

/**
 * Web-IDE-Bridge Server
 * WebSocket relay server that bridges web applications with desktop IDEs
 */
class WebIdeBridgeServer {
  constructor(config = null) {
    this.config = config || this.loadConfiguration();
    this.validateConfiguration(this.config);

    this.app = express();
    this.server = null;
    this.wss = null;
    this.wsOptions = null;

    // Connection tracking
    this.browserConnections = new Map(); // connectionId -> {ws, userId, sessionInfo}
    this.desktopConnections = new Map(); // connectionId -> {ws, userId}
    this.userSessions = new Map();       // userId -> {browserId, desktopId}
    this.activeSessions = new Map();     // sessionId -> {userId, snippetId, browserConnectionId}

    // Rate limiting store
    this.rateLimitStore = new Map();

    // Activity log
    this.activityLog = [];
    this.maxActivityLogEntries = 100;

    // Cleanup intervals
    this.cleanupInterval = null;
    this.heartbeatInterval = null;

    // Shutdown state tracking
    this.isShuttingDown = false;

    // Process event handlers (store references for cleanup)
    this.processHandlers = {
      uncaughtException: null,
      unhandledRejection: null,
      SIGTERM: null,
      SIGINT: null
    };

    // Metrics
    this.metrics = {
      totalConnections: 0,
      activeConnections: { browser: 0, desktop: 0 },
      totalSessions: 0,
      messagesProcessed: 0,
      errors: 0,
      startTime: Date.now()
    };

    this.setupCleanupScheduler();
  }

  /**
   * Load configuration from file or environment variables
   */
  loadConfiguration() {
    // Default configuration paths in order of preference
    const configPaths = [
      process.env.WEB_IDE_BRIDGE_CONFIG,
      '/etc/web-ide-bridge-server.conf',
      path.join(__dirname, 'web-ide-bridge-server.conf')
    ].filter(Boolean); // Remove undefined values

    let fileConfig = null;
    let configSource = 'defaults';

    // Try to load from configuration files
    for (const configPath of configPaths) {
      try {
        if (fs.existsSync(configPath)) {
          console.log(`Loading configuration from: ${configPath}`);
          const configData = fs.readFileSync(configPath, 'utf8');
          fileConfig = JSON.parse(configData);
          configSource = configPath;
          break;
        }
      } catch (error) {
        console.error(`Error loading config from ${configPath}: ${error.message}`);
        // Continue to next config path
      }
    }

    // If no config file found, check if we should bail out
    if (!fileConfig && process.env.NODE_ENV === 'production') {
      console.error('No configuration file found in production environment!');
      console.error('Checked paths:', configPaths);
      console.error('Please create a configuration file or set WEB_IDE_BRIDGE_CONFIG environment variable');
      process.exit(1);
    }

    // Default configuration
    const defaultConfig = {
      server: {
        port: parseInt(process.env.WEB_IDE_BRIDGE_PORT) || 8071,
        host: '0.0.0.0',
        websocketEndpoint: '/web-ide-bridge/ws',
        heartbeatInterval: 30000,
        maxConnections: 1000,
        connectionTimeout: 300000
      },
      endpoints: {
        health: '/web-ide-bridge/health',
        status: '/web-ide-bridge/status',
        debug: '/web-ide-bridge/debug',
        websocket: '/web-ide-bridge/ws'
      },
      cors: {
        origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000', 'https://webapp.example.com'],
        credentials: true,
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization']
      },
      session: {
        secret: process.env.WEB_IDE_BRIDGE_SECRET || 'web-ide-bridge-secret',
        name: 'web-ide-bridge-session',
        cookie: {
          maxAge: 24 * 60 * 60 * 1000,
          secure: process.env.NODE_ENV === 'production',
          httpOnly: true,
          sameSite: 'lax'
        },
        resave: false,
        saveUninitialized: false,
        rolling: true
      },
      security: {
        rateLimiting: {
          enabled: process.env.NODE_ENV === 'production',
          windowMs: 15 * 60 * 1000, // 15 minutes
          maxRequests: 100,
          maxWebSocketConnections: 10
        },
        helmet: {
          enabled: process.env.NODE_ENV === 'production',
          contentSecurityPolicy: false
        }
      },
      logging: {
        level: 'info',
        format: 'combined',
        enableAccessLog: process.env.NODE_ENV !== 'test'
      },
      cleanup: {
        sessionCleanupInterval: 5 * 60 * 1000, // 5 minutes
        maxSessionAge: 24 * 60 * 60 * 1000,    // 24 hours
        enablePeriodicCleanup: true
      },
      debug: process.env.DEBUG === 'true',
      environment: process.env.NODE_ENV || 'development'
    };

    const finalConfig = fileConfig ? this.mergeConfig(defaultConfig, fileConfig) : defaultConfig;

    console.log(`Configuration loaded from: ${configSource}`);
    if (finalConfig.debug) {
      console.log('Final configuration:', JSON.stringify(finalConfig, null, 2));
    }

    return finalConfig;
  }

  /**
   * Deep merge configuration objects
   */
  mergeConfig(defaultConfig, fileConfig) {
    const merged = { ...defaultConfig };

    for (const [key, value] of Object.entries(fileConfig)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        merged[key] = { ...merged[key], ...value };
      } else {
        merged[key] = value;
      }
    }

    return merged;
  }

  /**
   * Validate configuration object
   */
  validateConfiguration(config) {
    // Server validation
    if (config.server.port < 0 || config.server.port > 65535) {
      throw new Error('Server port must be between 0 and 65535');
    }

    if (config.server.heartbeatInterval < 1000) {
      throw new Error('Heartbeat interval must be at least 1000ms');
    }

    if (!config.server.websocketEndpoint.startsWith('/')) {
      throw new Error('WebSocket endpoint must start with /');
    }

    if (config.server.maxConnections < 1) {
      throw new Error('Max connections must be at least 1');
    }

    if (config.server.connectionTimeout < 1000) {
      throw new Error('Connection timeout must be at least 1000ms');
    }

    // Session validation
    if (config.environment === 'production') {
      if (config.session.secret === 'web-ide-bridge-secret' || 
          config.session.secret === 'change-this-in-production-use-env-var') {
        throw new Error('Session secret must be changed in production');
      }

      if (!config.session.cookie.secure) {
        console.warn('Warning: Session cookies should be secure in production');
      }
    }

    if (config.session.cookie.maxAge < 60000) {
      throw new Error('Session cookie maxAge must be at least 1 minute');
    }

    // CORS validation
    if (!Array.isArray(config.cors.origin)) {
      throw new Error('CORS origin must be an array');
    }

    // Rate limiting validation
    if (config.security.rateLimiting.enabled) {
      if (config.security.rateLimiting.windowMs < 1000) {
        throw new Error('Rate limiting window must be at least 1000ms');
      }

      if (config.security.rateLimiting.maxRequests < 1) {
        throw new Error('Rate limiting max requests must be at least 1');
      }
    }

    return true;
  }

  /**
   * Enhanced message validation
   */
  validateMessage(message) {
    if (!message || typeof message !== 'object') {
      return { valid: false, error: 'Message must be an object' };
    }

    if (!message.type || typeof message.type !== 'string') {
      return { valid: false, error: 'Message must have a string type field' };
    }

    if (!message.connectionId || typeof message.connectionId !== 'string') {
      return { valid: false, error: 'Message must have a string connectionId field' };
    }

    // Validate message type
    const validTypes = ['browser_connect', 'desktop_connect', 'edit_request', 'code_update', 'ping', 'connection_init', 'info'];
    if (!validTypes.includes(message.type)) {
      return { valid: false, error: `Unknown message type: ${message.type}` };
    }

    // Type-specific validation
    switch (message.type) {
      case 'browser_connect':
      case 'desktop_connect':
        if (!message.userId || typeof message.userId !== 'string') {
          return { valid: false, error: `${message.type} requires userId field` };
        }
        if (message.userId.length > 255) {
          return { valid: false, error: 'userId must be 255 characters or less' };
        }
        break;

      case 'edit_request':
        if (!message.userId || !message.snippetId || !message.code) {
          return { valid: false, error: 'edit_request requires userId, snippetId, and code' };
        }
        if (message.code.length > 10 * 1024 * 1024) { // 10MB limit
          return { valid: false, error: 'Code payload too large (max 10MB)' };
        }
        break;

      case 'code_update':
        if (!message.userId || !message.snippetId || !message.code) {
          return { valid: false, error: 'code_update requires userId, snippetId, and code' };
        }
        break;
    }

    return { valid: true };
  }

  /**
   * Enhanced rate limiting with sliding window
   */
  checkRateLimit(clientIP) {
    if (!this.config.security.rateLimiting.enabled) {
      return true;
    }

    const key = `ratelimit_${clientIP}`;
    const now = Date.now();
    const windowMs = this.config.security.rateLimiting.windowMs;
    const maxRequests = this.config.security.rateLimiting.maxRequests;

    let record = this.rateLimitStore.get(key);

    if (!record) {
      record = { requests: [], resetTime: now + windowMs };
      this.rateLimitStore.set(key, record);
    }

    // Remove old requests outside the window
    record.requests = record.requests.filter(timestamp => now - timestamp < windowMs);

    // Add current request
    record.requests.push(now);

    // Update reset time
    record.resetTime = now + windowMs;

    return record.requests.length <= maxRequests;
  }

  /**
   * Initialize and start the server
   */
  async start() {
    try {
      this.setupExpress();
      this.setupWebSocket();
      this.setupRoutes();
      this.setupErrorHandling();

      // Create server but don't log immediately (for testing)
      await new Promise((resolve, reject) => {
        this.server = this.app.listen(this.config.server.port, this.config.server.host, (error) => {
          if (error) {
            reject(error);
            return;
          }

          // Only log if not in test environment
          if (process.env.NODE_ENV !== 'test') {
            console.log(`Web-IDE-Bridge server v${VERSION} running on ${this.config.server.host}:${this.config.server.port}`);
            console.log(`WebSocket endpoint: ${this.wsOptions.path}`);
            console.log(`Environment: ${this.config.environment}`);
            console.log(`Debug mode: ${this.config.debug ? 'enabled' : 'disabled'}`);

            // Add to activity log
            this.addActivityLogEntry(`Server started on ${this.config.server.host}:${this.config.server.port}`, 'success');
            this.addActivityLogEntry(`WebSocket endpoint: ${this.wsOptions.path}`, 'info');
            this.addActivityLogEntry(`Environment: ${this.config.environment}`, 'info');
          }

          resolve();
        });
      });

      // Create WebSocket server after HTTP server is created
      this.wss = new WebSocket.Server({
        server: this.server,
        ...this.wsOptions
      });

      this.setupWebSocketHandlers();
      this.setupGracefulShutdown();

    } catch (error) {
      console.error('Failed to start server:', error);
      throw error;
    }
  }

  /**
   * Set up Express application with middleware
   */
  setupExpress() {
    // Security middleware
    if (this.config.security.helmet?.enabled !== false) {
      this.app.use(helmet({
        contentSecurityPolicy: this.config.security.helmet?.contentSecurityPolicy !== false
      }));
    }

    // Compression
    this.app.use(compression());

    // CORS
    this.app.use(cors(this.config.cors));

    // Logging
    if (this.config.logging.enableAccessLog) {
      this.app.use(morgan(this.config.logging.format || 'combined'));
    }

    // Session management
    this.app.use(session(this.config.session));

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  }

  /**
   * Set up WebSocket server options
   */
  setupWebSocket() {
    // WebSocket server will be created after HTTP server is started
    this.wsOptions = {
      path: this.config.endpoints?.websocket || this.config.server.websocketEndpoint,
      maxPayload: 10 * 1024 * 1024, // 10MB max payload
      clientTracking: true
    };
  }

  /**
   * Set up WebSocket event handlers
   */
  setupWebSocketHandlers() {
    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    this.wss.on('error', (error) => {
      console.error('WebSocket server error:', error);
      this.metrics.errors++;
    });

    // Heartbeat mechanism
    if (this.config.server.heartbeatInterval > 0) {
      this.setupHeartbeat();
    }

    // Connection limit check
    this.wss.on('connection', (ws) => {
      if (this.wss.clients.size > this.config.server.maxConnections) {
        ws.close(1008, 'Server at capacity');
        return;
      }
    });
  }

  /**
   * Handle connection initialization from client
   */
  handleConnectionInit(ws, message) {
    const { connectionId } = message;

    if (!connectionId || typeof connectionId !== 'string') {
      this.sendError(ws, 'Connection init requires connectionId');
      return;
    }

    // Set the connectionId provided by the client
    ws.connectionId = connectionId;

    if (this.config.debug) {
      console.log(`Connection initialized with client connectionId: ${connectionId} from ${ws.clientIP}`);
    }

    // Send acknowledgment
    this.sendMessage(ws, {
      type: 'connection_ack',
      connectionId: connectionId,
      timestamp: Date.now()
    });
  }

  /**
   * Handle new WebSocket connections
   */
  handleConnection(ws, req) {
    // Don't assign connectionId yet - wait for client to send it
    const clientIP = req.socket.remoteAddress;

    this.metrics.totalConnections++;

    if (this.config.debug) {
      console.log(`New WebSocket connection from ${clientIP} (waiting for connectionId)`);
    }

    // Set up connection properties (but no connectionId yet)
    ws.isAlive = true;
    ws.connectedAt = Date.now();
    ws.clientIP = clientIP;

    // Rate limiting per IP
    if (this.config.security.rateLimiting?.enabled) {
      if (!this.checkRateLimit(clientIP)) {
        ws.close(1008, 'Rate limit exceeded');
        return;
      }
    }

    // Connection timeout
    const connectionTimeout = setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN && !ws.connectionId) {
        ws.close(1000, 'Connection timeout - no connectionId received');
      }
    }, this.config.server.connectionTimeout);

    // Message handling
    ws.on('message', (data) => {
      try {
        // Clear timeout once we receive a message
        clearTimeout(connectionTimeout);

        const message = JSON.parse(data);

        // Validate message before processing
        const validation = this.validateMessage(message);
        if (!validation.valid) {
          this.sendError(ws, validation.error);
          return;
        }

        // Inline message routing logic
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
          case 'ping':
            this.handlePing(ws, message);
            break;
          case 'connection_init':
            this.handleConnectionInit(ws, message);
            break;
          case 'info':
            this.handleInfoMessage(ws, message);
            break;
          default:
            this.sendError(ws, `Unknown message type: ${message.type}`);
        }
        this.metrics.messagesProcessed++;
      } catch (error) {
        this.handleError(ws, 'Invalid JSON message', error);
      }
    });

    // Connection close handling
    ws.on('close', (code, reason) => {
      clearTimeout(connectionTimeout);
      this.handleDisconnection(ws, code, reason);
    });

    // Error handling
    ws.on('error', (error) => {
      clearTimeout(connectionTimeout);
      this.handleError(ws, 'WebSocket error', error);
    });

    // Heartbeat
    ws.on('pong', () => {
      ws.isAlive = true;
    });
  }

  /**
   * Handle browser client connection
   */
  handleBrowserConnect(ws, message) {
    const { userId, connectionId } = message;
    ws.connectionId = connectionId;

    if (!userId) {
      this.sendError(ws, 'Browser connection requires userId');
      return;
    }

    // Store browser connection
    this.browserConnections.set(ws.connectionId, {
      ws,
      userId,
      connectedAt: Date.now(),
      lastActivity: Date.now()
    });

    // Update user session
    const userSession = this.userSessions.get(userId) || {};
    userSession.browserId = ws.connectionId;
    this.userSessions.set(userId, userSession);

    this.metrics.activeConnections.browser = this.browserConnections.size;

    // Send acknowledgment
    this.sendMessage(ws, {
      type: 'connection_ack',
      connectionId: ws.connectionId,
      status: 'connected',
      role: 'browser'
    });

    this.sendDesktopStatusToBrowser(userId);
    this.sendBrowserStatusToDesktop(userId);

    // Add to activity log
    this.addActivityLogEntry(`Browser connected: ${userId} (${ws.connectionId})`, 'success');

    if (this.config.debug) {
      console.log(`Browser connected: userId=${userId}, connectionId=${ws.connectionId}`);
    }
  }

  /**
   * Handle desktop client connection
   */
  handleDesktopConnect(ws, message) {
    const { userId, connectionId } = message;
    ws.connectionId = connectionId;

    if (!userId) {
      this.sendError(ws, 'Desktop connection requires userId');
      return;
    }

    // Store desktop connection
    this.desktopConnections.set(ws.connectionId, {
      ws,
      userId,
      connectedAt: Date.now(),
      lastActivity: Date.now()
    });

    // Update user session
    const userSession = this.userSessions.get(userId) || {};
    userSession.desktopId = ws.connectionId;
    this.userSessions.set(userId, userSession);

    this.metrics.activeConnections.desktop = this.desktopConnections.size;

    // Send acknowledgment
    this.sendMessage(ws, {
      type: 'connection_ack',
      connectionId: ws.connectionId,
      status: 'connected',
      role: 'desktop'
    });

    this.sendBrowserStatusToDesktop(userId);
    this.sendDesktopStatusToBrowser(userId);

    // Add to activity log
    this.addActivityLogEntry(`Desktop connected: ${userId} (${ws.connectionId})`, 'success');

    if (this.config.debug) {
      console.log(`Desktop connected: userId=${userId}, connectionId=${ws.connectionId}`);
    }
  }

  /**
   * Handle edit request from browser
   */
  handleEditRequest(ws, message) {
    const { userId, snippetId, code, fileType } = message;

    if (!userId || !snippetId || !code) {
      this.sendError(ws, 'Edit request requires userId, snippetId, and code');
      return;
    }

    // Find user's desktop connection
    const userSession = this.userSessions.get(userId);
    if (!userSession || !userSession.desktopId) {
      this.sendError(ws, 'No desktop connection found for user');
      return;
    }

    const desktopConn = this.desktopConnections.get(userSession.desktopId);
    if (!desktopConn) {
      this.sendError(ws, 'Desktop connection no longer active');
      return;
    }

    // Store session mapping using snippetId as the key
    const sessionKey = userId + ':' + snippetId;
    this.activeSessions.set(sessionKey, {
      userId,
      snippetId: snippetId,
      browserConnectionId: ws.connectionId, // always update to latest browser connection
      desktopConnectionId: userSession.desktopId, // always update to latest desktop connection
      createdAt: Date.now(),
      lastActivity: Date.now()
    });
    this.metrics.totalSessions++;

    // Forward to desktop
    this.sendMessage(desktopConn.ws, {
      type: 'edit_request',
      userId,
      snippetId,
      code,
      fileType
    });

    // Add to activity log
    this.addActivityLogEntry(`Edit request: ${userId} → ${snippetId}`, 'info');

    if (this.config.debug) {
      console.log(`Edit request: userId=${userId}, snippetId=${snippetId}`);
    }
  }

  /**
   * Handle code update from desktop
   */
  handleCodeUpdate(ws, message) {
    const { userId, snippetId, code, fileType } = message;

    if (!userId || !snippetId || !code) {
      this.sendError(ws, 'code_update requires userId, snippetId, and code');
      return;
    }

    const sessionKey = userId + ':' + snippetId;
    if (this.config.debug) {
      console.log(`Looking for session with key: ${sessionKey}`);
      console.log(`Available sessions:`, Array.from(this.activeSessions.keys()));
    }
    const session = this.activeSessions.get(sessionKey);
    if (!session) {
      // Try to notify the desktop if possible
      // Find the desktop connection for this user (if any)
      const userSession = this.userSessions.get(userId);
      if (userSession && userSession.desktopId) {
        const desktopConn = this.desktopConnections.get(userSession.desktopId);
        if (desktopConn) {
          this.sendMessage(desktopConn.ws, {
            type: 'info',
            payload: {
              snippetId: snippetId,
              message: 'Error: Code update could not be delivered. Make sure the web application is ready and in edit mode.'
            }
          });
        }
      }
      this.sendError(ws, 'Session not found or expired');
      return;
    }

    // Update session activity
    session.lastActivity = Date.now();

    // Always get the latest browser connection for this userId:snippetId
    const userSession = this.userSessions.get(userId);
    let browserConn = null;
    if (userSession && userSession.browserId) {
      browserConn = this.browserConnections.get(userSession.browserId);
    }
    if (!browserConn) {
      // Send info message to desktop
      const desktopConn = this.desktopConnections.get(session.desktopConnectionId);
      if (desktopConn) {
        this.sendMessage(desktopConn.ws, {
          type: 'info',
          payload: {
            snippetId: session.snippetId,
            message: 'Error: Code update could not be delivered. Make sure the web application is ready and in edit mode.'
          }
        });
      }
      // Do not treat as error, just return
      return;
    }

    // Forward to browser
    this.sendMessage(browserConn.ws, {
      type: 'code_update',
      snippetId: session.snippetId,
      code: code
    });

    // Add to activity log
    this.addActivityLogEntry(`Code update: ${userId} ← ${session.snippetId}`, 'info');

    if (this.config.debug) {
      console.log(`Code update: userId=${userId}, snippetId=${session.snippetId}`);
    }
  }

  /**
   * Handle ping message
   */
  handlePing(ws, message) {
    this.sendMessage(ws, {
      type: 'pong',
      payload: message.payload || {},
      timestamp: Date.now()
    });
  }

  /**
   * Handle info message from browser
   */
  handleInfoMessage(ws, message) {
    const { userId, payload } = message;
    if (!userId || !payload || !payload.snippetId || !payload.message) return;
    // Find user's desktop connection
    const userSession = this.userSessions.get(userId);
    if (!userSession || !userSession.desktopId) return;
    const desktopConn = this.desktopConnections.get(userSession.desktopId);
    if (!desktopConn) return;
    // Forward info message to desktop
    this.sendMessage(desktopConn.ws, {
      type: 'info',
      payload: {
        snippetId: payload.snippetId,
        message: payload.message
      }
    });
  }

  /**
   * Handle WebSocket disconnection
   */
  handleDisconnection(ws, code, reason) {
    if (this.config.debug) {
      console.log(`WebSocket disconnected: ${ws.connectionId}, code=${code}, reason=${reason}`);
    }

    // Remove from browser connections
    if (this.browserConnections.has(ws.connectionId)) {
      const browserConn = this.browserConnections.get(ws.connectionId);
      this.browserConnections.delete(ws.connectionId);

      // Update user session
      const userSession = this.userSessions.get(browserConn.userId);
      if (userSession && userSession.browserId === ws.connectionId) {
        delete userSession.browserId;
        if (Object.keys(userSession).length === 0) {
          this.userSessions.delete(browserConn.userId);
        }
      }
      this.sendBrowserStatusToDesktop(browserConn.userId);

      // Add to activity log
      this.addActivityLogEntry(`Browser disconnected: ${browserConn.userId} (${ws.connectionId})`, 'warning');
    }

    // Remove from desktop connections
    if (this.desktopConnections.has(ws.connectionId)) {
      const desktopConn = this.desktopConnections.get(ws.connectionId);
      this.desktopConnections.delete(ws.connectionId);

      // Update user session
      const userSession = this.userSessions.get(desktopConn.userId);
      if (userSession && userSession.desktopId === ws.connectionId) {
        delete userSession.desktopId;
        if (Object.keys(userSession).length === 0) {
          this.userSessions.delete(desktopConn.userId);
        }
      }
      this.sendDesktopStatusToBrowser(desktopConn.userId);

      // Add to activity log
      this.addActivityLogEntry(`Desktop disconnected: ${desktopConn.userId} (${ws.connectionId})`, 'warning');
    }

    // Clean up active sessions associated with this connection
    // In handleDisconnection, remove the code that deletes activeSessions for the disconnected connection.
    // (Comment out or delete this block:)
    // for (const [sessionId, session] of this.activeSessions.entries()) {
    //   if (session.browserConnectionId === ws.connectionId || 
    //       session.desktopConnectionId === ws.connectionId) {
    //     this.activeSessions.delete(sessionId);
    //   }
    // }

    // Update metrics
    this.metrics.activeConnections.browser = this.browserConnections.size;
    this.metrics.activeConnections.desktop = this.desktopConnections.size;
  }

  /**
   * Send message to WebSocket client
   */
  sendMessage(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('Error sending message:', error);
      }
    }
  }

  /**
   * Send error message to client
   */
  sendError(ws, message, code = 'ERROR') {
    this.metrics.errors++;

    if (this.config.debug) {
      console.error(`Error: ${message} (connection: ${ws.connectionId})`);
    }

    // Add to activity log
    this.addActivityLogEntry(`Error: ${message} (${ws.connectionId})`, 'error');

    this.sendMessage(ws, {
      type: 'error',
      payload: { message, code }
    });
  }

  /**
   * Handle errors
   */
  handleError(ws, context, error) {
    this.metrics.errors++;
    console.error(`${context} (connection: ${ws.connectionId}):`, error);

    this.sendError(ws, `${context}: ${error.message}`);
  }

  /**
   * Generate HTML status page
   */
  generateStatusPage() {
    const uptime = process.uptime();
    const uptimeFormatted = this.formatUptime(uptime);
    const memoryUsage = process.memoryUsage();

    const connectionStatus = this.browserConnections.size > 0 || this.desktopConnections.size > 0 
      ? 'active' 
      : 'waiting';

    const statusColor = connectionStatus === 'active' ? '#10b981' : '#f59e0b';

    // Get activity log entries
    const activityLogEntries = this.getActivityLogEntries(15);

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Web-IDE-Bridge Server Status</title>
    <link rel="icon" type="image/x-icon" href="/web-ide-bridge/assets/favicon.ico">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #333;
        }

        .container {
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
            padding: 2rem;
            max-width: 1200px;
            width: 90%;
            margin: 2rem;
        }

        .header {
            text-align: center;
            margin-bottom: 2rem;
            border-bottom: 2px solid #f3f4f6;
            padding-bottom: 1.5rem;
        }

        .title-row {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 1rem;
            margin-bottom: 0.5rem;
        }

        .header-icon {
            width: 24px;
            height: 24px;
        }

        .title {
            font-size: 2rem;
            font-weight: 700;
            color: #1f2937;
        }

        .version {
            color: #6b7280;
            font-size: 0.875rem;
            font-weight: 500;
        }

        .subtitle {
            color: #6b7280;
            font-size: 1rem;
            margin-bottom: 1rem;
        }

        .status-badge {
            display: inline-block;
            padding: 0.5rem 1rem;
            border-radius: 50px;
            color: white;
            font-weight: 600;
            font-size: 0.875rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-top: 1rem;
            background-color: ${statusColor};
        }

        .grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 1.5rem;
            margin-bottom: 2rem;
        }

        .card {
            background: #f9fafb;
            border-radius: 12px;
            padding: 1.5rem;
            border: 1px solid #e5e7eb;
        }

        .card-title {
            font-size: 1.125rem;
            font-weight: 600;
            color: #374151;
            margin-bottom: 1rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .card-content {
            space-y: 0.75rem;
        }

        .metric {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.5rem 0;
            border-bottom: 1px solid #e5e7eb;
        }

        .metric:last-child {
            border-bottom: none;
        }

        .metric-label {
            color: #6b7280;
            font-size: 0.875rem;
        }

        .metric-value {
            font-weight: 600;
            color: #1f2937;
        }

        .metric-value.number {
            font-family: 'Monaco', 'Menlo', monospace;
            background: #e5e7eb;
            padding: 0.25rem 0.5rem;
            border-radius: 6px;
            font-size: 0.875rem;
        }

        .activity-log {
            grid-column: 1 / -1;
            max-height: 400px;
            overflow-y: auto;
        }

        .activity-log .card-content {
            max-height: 300px;
            overflow-y: auto;
        }

        .log-entry {
            display: flex;
            align-items: flex-start;
            gap: 0.75rem;
            padding: 0.15rem 0.5rem;
            border-radius: 8px;
            margin-bottom: 0.25rem;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 0.875rem;
            line-height: 1.4;
        }

        .log-entry:last-child {
            margin-bottom: 0;
        }

        .log-entry.info {
            background: #eff6ff;
            border-left: 4px solid #3b82f6;
        }

        .log-entry.success {
            background: #f0fdf4;
            border-left: 4px solid #10b981;
        }

        .log-entry.warning {
            background: #fffbeb;
            border-left: 4px solid #f59e0b;
        }

        .log-entry.error {
            background: #fef2f2;
            border-left: 4px solid #ef4444;
        }

        .log-time {
            color: #6b7280;
            font-size: 0.75rem;
            white-space: nowrap;
            min-width: 60px;
        }

        .log-message {
            flex: 1;
            word-break: break-word;
        }

        .footer {
            text-align: center;
            margin-top: 2rem;
            padding-top: 1.5rem;
            border-top: 1px solid #e5e7eb;
            color: #6b7280;
            font-size: 0.875rem;
        }

        .footer a {
            color: #4f46e5;
            text-decoration: none;
            margin: 0 1rem;
        }

        .footer a:hover {
            text-decoration: underline;
        }

        @media (max-width: 640px) {
            .container {
                margin: 1rem;
                padding: 1.5rem;
            }

            .title {
                font-size: 1.5rem;
            }

            .grid {
                grid-template-columns: 1fr;
            }

            .header {
                flex-direction: column;
                gap: 1rem;
            }

            .header-content {
                text-align: center;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="title-row">
                <img src="/web-ide-bridge/assets/web-ide-bridge-24.png" alt="Web-IDE-Bridge" class="header-icon">
                <h1 class="title">Web-IDE-Bridge Server</h1>
                <div class="version">v${VERSION}</div>
            </div>
            <p class="subtitle">WebSocket relay server for seamless IDE integration</p>
            <div class="status-badge">${connectionStatus}</div>
        </div>

        <div class="grid">
            <div class="card">
                <h2 class="card-title">🔗 Connections</h2>
                <div class="card-content">
                    <div class="metric">
                        <span class="metric-label">Browser Clients</span>
                        <span class="metric-value number">${this.browserConnections.size}</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Desktop Clients</span>
                        <span class="metric-value number">${this.desktopConnections.size}</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Total Connected</span>
                        <span class="metric-value number">${this.browserConnections.size + this.desktopConnections.size}</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Total Since Start</span>
                        <span class="metric-value number">${this.metrics.totalConnections}</span>
                    </div>
                </div>
            </div>

            <div class="card">
                <h2 class="card-title">📝 Sessions</h2>
                <div class="card-content">
                    <div class="metric">
                        <span class="metric-label">Active Users</span>
                        <span class="metric-value number">${this.userSessions.size}</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Active Edit Sessions</span>
                        <span class="metric-value number">${this.activeSessions.size}</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Total Sessions</span>
                        <span class="metric-value number">${this.metrics.totalSessions}</span>
                    </div>
                </div>
            </div>

            <div class="card">
                <h2 class="card-title">📊 Performance</h2>
                <div class="card-content">
                    <div class="metric">
                        <span class="metric-label">Uptime</span>
                        <span class="metric-value">${uptimeFormatted}</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Messages Processed</span>
                        <span class="metric-value number">${this.metrics.messagesProcessed}</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Memory Used</span>
                        <span class="metric-value">${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Errors</span>
                        <span class="metric-value number">${this.metrics.errors}</span>
                    </div>
                </div>
            </div>

            <div class="card">
                <h2 class="card-title">⚙️ Configuration</h2>
                <div class="card-content">
                    <div class="metric">
                        <span class="metric-label">Environment</span>
                        <span class="metric-value">${this.config.environment}</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">WebSocket Path</span>
                        <span class="metric-value">${this.wsOptions.path}</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Max Connections</span>
                        <span class="metric-value number">${this.config.server.maxConnections}</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Debug Mode</span>
                        <span class="metric-value">${this.config.debug ? '✅ Enabled' : '❌ Disabled'}</span>
                    </div>
                </div>
            </div>

            <div class="card activity-log">
                <h2 class="card-title">📋 Activity Log</h2>
                <div class="card-content">
                    ${activityLogEntries.length > 0 ? 
                        activityLogEntries.map(entry => `
                            <div class="log-entry ${entry.type}">
                                <span class="log-time">${entry.time}</span>
                                <span class="log-message">${entry.message}</span>
                            </div>
                        `).join('') : 
                        '<div class="log-entry info"><span class="log-message">No activity yet</span></div>'
                    }
                </div>
            </div>
        </div>

        <div class="footer">
            <p>
                <a href="${this.config.endpoints?.health || '/web-ide-bridge/health'}">Health Check</a>
                ${this.config.debug ? `<a href="${this.config.endpoints?.debug || '/web-ide-bridge/debug'}">Debug Info</a>` : ''}
                <a href="https://github.com/peterthoeny/web-ide-bridge">GitHub</a>
            </p>
            <p style="margin-top: 0.5rem;">
                Server started: ${new Date(this.metrics.startTime).toLocaleString()}
            </p>
        </div>
    </div>

    <script>
        // Auto-refresh every 30 seconds
        setTimeout(() => {
            window.location.reload();
        }, 30000);
    </script>
</body>
</html>`;
  }

  /**
   * Format uptime in human-readable format
   */
  formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }

  /**
   * Set up HTTP routes
   */
  setupRoutes() {
    // Serve static assets
    this.app.use('/web-ide-bridge/assets', express.static(path.join(__dirname, 'assets')));

    // Redirect root to status page
    this.app.get('/', (req, res) => {
      res.redirect(this.config.endpoints?.status || '/web-ide-bridge/status');
    });

    // Health check (JSON endpoint for monitoring)
    this.app.get(this.config.endpoints?.health || '/web-ide-bridge/health', (req, res) => {
      res.json({
        status: 'healthy',
        version: VERSION,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      });
    });

    // Status page (HTML for browsers, JSON for API calls)
    this.app.get(this.config.endpoints?.status || '/web-ide-bridge/status', (req, res) => {
      const acceptsJson = req.headers.accept && req.headers.accept.includes('application/json');
      const userAgent = req.headers['user-agent'] || '';
      const isApiCall = acceptsJson || userAgent.includes('node-fetch') || userAgent.includes('curl');

      if (isApiCall) {
        // Return JSON for API calls and tests
        res.json({
          active: true,
          version: VERSION,
          uptime: process.uptime(),
          connections: {
            browser: this.browserConnections.size,
            desktop: this.desktopConnections.size,
            total: this.browserConnections.size + this.desktopConnections.size
          },
          sessions: {
            users: this.userSessions.size,
            active: this.activeSessions.size,
            total: this.metrics.totalSessions
          },
          metrics: {
            totalConnections: this.metrics.totalConnections,
            messagesProcessed: this.metrics.messagesProcessed,
            errors: this.metrics.errors,
            startTime: new Date(this.metrics.startTime).toISOString()
          }
        });
      } else {
        // Return HTML for browser requests
        res.setHeader('Content-Type', 'text/html');
        res.send(this.generateStatusPage());
      }
    });

    // Debug endpoint (JSON - available in debug mode OR test environment)
    if (this.config.debug || process.env.NODE_ENV === 'test') {
      this.app.get(this.config.endpoints?.debug || '/web-ide-bridge/debug', (req, res) => {
        res.json({
          browserConnections: Array.from(this.browserConnections.entries()).map(([id, conn]) => ({
            connectionId: id,
            userId: conn.userId,
            connectedAt: new Date(conn.connectedAt).toISOString(),
            lastActivity: new Date(conn.lastActivity).toISOString()
          })),
          desktopConnections: Array.from(this.desktopConnections.entries()).map(([id, conn]) => ({
            connectionId: id,
            userId: conn.userId,
            connectedAt: new Date(conn.connectedAt).toISOString(),
            lastActivity: new Date(conn.lastActivity).toISOString()
          })),
          userSessions: Array.from(this.userSessions.entries()),
          activeSessions: Array.from(this.activeSessions.entries()).map(([id, session]) => ({
            sessionId: id,
            userId: session.userId,
            snippetId: session.snippetId,
            browserConnectionId: session.browserConnectionId,
            desktopConnectionId: session.desktopConnectionId,
            createdAt: new Date(session.createdAt).toISOString(),
            lastActivity: new Date(session.lastActivity).toISOString()
          })),
          activityLog: this.getActivityLogEntries(50),
          config: this.config,
          process: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            version: process.version,
            platform: process.platform
          }
        });
      });
    }

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: 'The requested endpoint does not exist'
      });
    });
  }

  /**
   * Set up error handling
   */
  setupErrorHandling() {
    this.app.use((error, req, res, next) => {
      console.error('Express error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: this.config.debug ? error.message : 'An unexpected error occurred'
      });
    });
  }

  /**
   * Set up heartbeat mechanism
   */
  setupHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (!ws.isAlive) {
          ws.terminate();
          return;
        }

        ws.isAlive = false;
        ws.ping();
      });
    }, this.config.server.heartbeatInterval);
  }

  /**
   * Set up periodic cleanup with rate limit store cleanup
   */
  setupCleanupScheduler() {
    if (!this.config.cleanup.enablePeriodicCleanup) {
      return;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
      this.cleanupRateLimitStore();
    }, this.config.cleanup.sessionCleanupInterval);
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions() {
    const now = Date.now();
    const maxAge = this.config.cleanup.maxSessionAge;
    let cleanedCount = 0;

    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (session && typeof session === 'object' && session.lastActivity && now - session.lastActivity > maxAge) {
        this.activeSessions.delete(sessionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0 && this.config.debug) {
      console.log(`Cleaned up ${cleanedCount} expired sessions`);
      this.addActivityLogEntry(`Cleaned up ${cleanedCount} expired sessions`, 'info');
    }
  }

  /**
   * Clean up expired rate limit entries
   */
  cleanupRateLimitStore() {
    if (!this.rateLimitStore) {
      return;
    }

    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, record] of this.rateLimitStore.entries()) {
      if (record.resetTime && now > record.resetTime) {
        this.rateLimitStore.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0 && this.config.debug) {
      console.log(`Cleaned up ${cleanedCount} expired rate limit entries`);
      this.addActivityLogEntry(`Cleaned up ${cleanedCount} expired rate limit entries`, 'info');
    }
  }

  /**
   * Set up graceful shutdown
   */
  setupGracefulShutdown() {
    // Only set up process handlers if not in test environment
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    // Remove existing handlers first to prevent duplicates
    this.removeProcessHandlers();

    const shutdown = (signal) => {
      console.log(`Received ${signal}, shutting down gracefully...`);
      this.shutdown();
    };

    // Set up new handlers and store references
    this.processHandlers.SIGTERM = () => shutdown('SIGTERM');
    this.processHandlers.SIGINT = () => shutdown('SIGINT');
    this.processHandlers.uncaughtException = (error) => {
      console.error('Uncaught Exception:', error);
      this.shutdown();
    };
    this.processHandlers.unhandledRejection = (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      this.shutdown();
    };

    // Register handlers
    process.on('SIGTERM', this.processHandlers.SIGTERM);
    process.on('SIGINT', this.processHandlers.SIGINT);
    process.on('uncaughtException', this.processHandlers.uncaughtException);
    process.on('unhandledRejection', this.processHandlers.unhandledRejection);
  }

  /**
   * Remove process event handlers
   */
  removeProcessHandlers() {
    if (this.processHandlers.SIGTERM) {
      process.removeListener('SIGTERM', this.processHandlers.SIGTERM);
    }
    if (this.processHandlers.SIGINT) {
      process.removeListener('SIGINT', this.processHandlers.SIGINT);
    }
    if (this.processHandlers.uncaughtException) {
      process.removeListener('uncaughtException', this.processHandlers.uncaughtException);
    }
    if (this.processHandlers.unhandledRejection) {
      process.removeListener('unhandledRejection', this.processHandlers.unhandledRejection);
    }
  }

  /**
   * Shutdown server gracefully
   */
  async shutdown() {
    if (this.isShuttingDown) {
      console.log('Server is already in the process of shutting down.');
      return;
    }

    this.isShuttingDown = true;
    try {
      console.log('Starting server shutdown...');
      this.addActivityLogEntry('Server shutdown initiated', 'warning');

      // Clear all intervals first
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        this.cleanupInterval = null;
        console.log('Cleared cleanup interval');
      }

      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
        console.log('Cleared heartbeat interval');
      }

      // Close all WebSocket connections with proper cleanup
      if (this.wss && this.wss.clients) {
        console.log(`Closing ${this.wss.clients.size} WebSocket connections...`);
        this.addActivityLogEntry(`Closing ${this.wss.clients.size} WebSocket connections`, 'info');
        const closePromises = [];

        this.wss.clients.forEach((ws) => {
          if (ws.readyState === 1) { // WebSocket.OPEN
            closePromises.push(new Promise((resolve) => {
              ws.once('close', resolve);
              ws.close(1001, 'Server shutting down');
              // Force close after timeout
              setTimeout(() => {
                if (ws.readyState !== 3) { // Not CLOSED
                  ws.terminate();
                }
                resolve();
              }, 1000);
            }));
          }
        });

        await Promise.all(closePromises);
        console.log('All WebSocket connections closed');
        this.addActivityLogEntry('All WebSocket connections closed', 'info');
      }

      // Close WebSocket server
      if (this.wss) {
        try {
          await new Promise((resolve, reject) => {
            this.wss.close((error) => {
              if (error) {
                console.error('Error closing WebSocket server:', error);
                reject(error);
              } else {
                console.log('WebSocket server closed');
                resolve();
              }
            });
          });
        } catch (error) {
          console.log('WebSocket server already closed or error during close:', error.message);
        }
        this.wss = null;
      }

      // Close HTTP server
      if (this.server) {
        try {
          await new Promise((resolve, reject) => {
            this.server.close((error) => {
              if (error) {
                console.error('Error closing HTTP server:', error);
                reject(error);
              } else {
                console.log('HTTP server closed');
                resolve();
              }
            });
          });
        } catch (error) {
          console.log('HTTP server already closed or error during close:', error.message);
        }
        this.server = null;
      }

      // Clear all data structures
      if (this.browserConnections) {
        this.browserConnections.clear();
      }
      if (this.desktopConnections) {
        this.desktopConnections.clear();
      }
      if (this.userSessions) {
        this.userSessions.clear();
      }
      if (this.activeSessions) {
        this.activeSessions.clear();
      }
      if (this.rateLimitStore) {
        this.rateLimitStore.clear();
      }

      // Remove process handlers
      this.removeProcessHandlers();

      console.log('Server shutdown complete');
      this.addActivityLogEntry('Server shutdown complete', 'success');

      // Give a moment for everything to settle
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (error) {
      console.error('Error during shutdown:', error);
      this.addActivityLogEntry(`Shutdown error: ${error.message}`, 'error');
      // Don't re-throw the error to prevent uncaught exception
    }
  }

  sendDesktopStatusToBrowser(userId) {
    const userSession = this.userSessions.get(userId);
    if (!userSession || !userSession.browserId) return;
    const browserConn = this.browserConnections.get(userSession.browserId);
    if (!browserConn) return;
    const desktopConnected = !!(userSession && userSession.desktopId && this.desktopConnections.has(userSession.desktopId));
    this.sendMessage(browserConn.ws, {
      type: 'status_update',
      desktopConnected
    });
  }
  sendBrowserStatusToDesktop(userId) {
    const userSession = this.userSessions.get(userId);
    if (!userSession || !userSession.desktopId) return;
    const desktopConn = this.desktopConnections.get(userSession.desktopId);
    if (!desktopConn) return;
    const browserConnected = !!(userSession && userSession.browserId && this.browserConnections.has(userSession.browserId));
    this.sendMessage(desktopConn.ws, {
      type: 'status_update',
      browserConnected
    });
  }

  /**
   * Add entry to activity log
   */
  addActivityLogEntry(message, type = 'info') {
    const entry = {
      timestamp: new Date().toISOString(),
      message,
      type // 'info', 'success', 'warning', 'error'
    };

    this.activityLog.unshift(entry); // Add to beginning

    // Keep only the latest entries
    if (this.activityLog.length > this.maxActivityLogEntries) {
      this.activityLog = this.activityLog.slice(0, this.maxActivityLogEntries);
    }
  }

  /**
   * Get formatted activity log entries
   */
  getActivityLogEntries(limit = 20) {
    return this.activityLog.slice(0, limit).map(entry => ({
      ...entry,
      time: new Date(entry.timestamp).toLocaleTimeString(),
      date: new Date(entry.timestamp).toLocaleDateString()
    }));
  }

  /**
   * Clear activity log
   */
  clearActivityLog() {
    this.activityLog = [];
  }
}

/**
 * CLI handling
 */
function main() {
  const args = process.argv.slice(2);

  // Simple argument parsing
  let port = null;
  let configPath = null;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--port':
      case '-p':
        port = parseInt(args[++i]);
        break;
      case '--config':
      case '-c':
        configPath = args[++i];
        break;
      case '--help':
      case '-h':
        console.log(`
Web-IDE-Bridge Server v${VERSION}

Usage: web-ide-bridge-server [options]

Options:
  -p, --port <port>      Port to listen on (default: 8071)
  -c, --config <path>    Path to configuration file
  -h, --help             Show this help message

Environment Variables:
  WEB_IDE_BRIDGE_PORT    Override port number
  WEB_IDE_BRIDGE_CONFIG  Path to configuration file
  WEB_IDE_BRIDGE_SECRET  Session secret (production)
  NODE_ENV               Environment (development/production)
  DEBUG                  Enable debug logging

Configuration Files (checked in order):
  1. $WEB_IDE_BRIDGE_CONFIG (if set)
  2. /etc/web-ide-bridge-server.conf
  3. ./web-ide-bridge-server.conf

Examples:
  web-ide-bridge-server
  web-ide-bridge-server --port 3000
  web-ide-bridge-server --config /path/to/config.conf
  DEBUG=true web-ide-bridge-server
        `);
        process.exit(0);
        break;
      default:
        console.error(`Unknown option: ${args[i]}`);
        process.exit(1);
    }
  }

  // Set environment variables from CLI args
  if (port) {
    process.env.WEB_IDE_BRIDGE_PORT = port.toString();
  }

  if (configPath) {
    process.env.WEB_IDE_BRIDGE_CONFIG = configPath;
  }

  // Create and start server
  const server = new WebIdeBridgeServer();
  server.start().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

// Start server if this file is run directly
if (require.main === module) {
  main();
}

module.exports = WebIdeBridgeServer;
