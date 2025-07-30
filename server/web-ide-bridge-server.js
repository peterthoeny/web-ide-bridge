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
    this.userSessions = new Map();       // userId -> {browserIds: Set, desktopId}
    this.activeSessions = new Map();     // sessionId -> {userId, snippetId, browserConnectionId}
    this.statusPageConnections = new Set(); // Track all status page WebSocket connections

    // Rate limiting store
    this.rateLimitStore = new Map();

    // Activity log
    this.activityLog = [];
    this.maxActivityLogEntries = 100;

    // Cleanup intervals
    this.cleanupInterval = null;
    this.heartbeatInterval = null;
    this.statusUpdateInterval = null; // Single interval for all status pages

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
          this._log(`Loading configuration from: ${configPath}`);
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
      normalizeLineEndings: true, // Normalize line endings to LF
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

    // Environment variable should override config file for debug setting
    if (process.env.DEBUG !== undefined) {
      finalConfig.debug = process.env.DEBUG === 'true';
    }

    this._log(`Configuration loaded from: ${configSource}`);
    this._log(`Final configuration: ${JSON.stringify(finalConfig, null, 2)}`);

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
    const validTypes = ['browser_connect', 'desktop_connect', 'status_connect', 'connection_init', 'edit_request', 'code_update', 'ping', 'info'];
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

      case 'info':
        if (!message.userId || !message.snippetId || !message.message) {
          return { valid: false, error: 'info requires userId, snippetId, and message' };
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
   * Normalize line endings to Unix-style LF
   * @param {string} content - The content to normalize
   * @returns {string} - Content with normalized line endings
   */
  normalizeLineEndings(content) {
    if (!this.config.normalizeLineEndings) {
      return content;
    }
    // First remove all \r, then ensure \n for line breaks
    return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
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
            this._log(`Web-IDE-Bridge server v${VERSION} running on ${this.config.server.host}:${this.config.server.port}`);
            this._log(`WebSocket endpoint: ${this.wsOptions.path}`);
            this._log(`Environment: ${this.config.environment}`);
            this._log(`Debug mode: ${this.config.debug ? 'enabled' : 'disabled'}`);

            // Add to activity log
            this._log(`Server started on ${this.config.server.host}:${this.config.server.port}`, 'success');
            this._log(`WebSocket endpoint: ${this.wsOptions.path}`, 'info');
            this._log(`Environment: ${this.config.environment}`, 'info');
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
      this.sendError(ws, 'Error: Connection initialization failed. Please try reconnecting.');
      return;
    }

    // Set the connectionId provided by the client
    ws.connectionId = connectionId;

    this._log(`Connection initialized with client connectionId: ${connectionId} from ${ws.clientIP}`);

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

    this._log(`New WebSocket connection from ${clientIP} (waiting for connectionId)`);

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
          case 'status_connect':
            this.handleStatusConnect(ws, message);
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
      this.sendError(ws, 'Error: Web page connection requires user identification. Please refresh the page and try again.');
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
    if (!userSession.browserIds) userSession.browserIds = new Set();
    userSession.browserIds.add(ws.connectionId);
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

    this._log(`Browser connected, userId: ${userId}, connectionId: ${ws.connectionId}`, 'success');
  }

  /**
   * Handle desktop client connection
   */
  handleDesktopConnect(ws, message) {
    const { userId, connectionId } = message;
    ws.connectionId = connectionId;

    if (!userId) {
      this.sendError(ws, 'Error: Desktop application connection requires user identification. Please restart the desktop app and try again.');
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

    this._log(`Desktop connected, userId: ${userId}, connectionId: ${ws.connectionId}`, 'success');
  }

  /**
   * Handle edit request from browser
   */
  handleEditRequest(ws, message) {
    const { userId, snippetId, code: rawCode, fileType } = message;
    const code = this.normalizeLineEndings(rawCode);

    if (!userId || !snippetId || !code) {
      this.sendError(ws, 'Error: Edit request is missing required information. Please try again.');
      return;
    }

    // Find user's desktop connection
    const userSession = this.userSessions.get(userId);
    if (!userSession || !userSession.desktopId) {
      this.sendError(ws, 'Error: No desktop application connected. Please start the Web-IDE-Bridge desktop app and try again.');
      return;
    }

    const desktopConn = this.desktopConnections.get(userSession.desktopId);
    if (!desktopConn) {
      this.sendError(ws, 'Error: Desktop application connection lost. Please restart the Web-IDE-Bridge desktop app and try again.');
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

    if (this.config.debug) {
      this._log(`Browser edit request for userId: ${userId}, snippetId: ${snippetId}, fileType: ${fileType}, code: '%CODE%', codeLength: ${code.length}`, 'info', code);
    } else {
      this._log(`Browser edit request for userId: ${userId}, snippetId: ${snippetId}, fileType: ${fileType}, codeLength: ${code.length}`, 'info');
    }
  }

  /**
   * Handle code update from desktop
   */
  handleCodeUpdate(ws, message) {
    const { userId, snippetId, code: rawCode, fileType } = message;
    const code = this.normalizeLineEndings(rawCode);

    if (!userId || !snippetId || !code) {
      this.sendError(ws, 'Error: Code update is missing required information. Please try again.');
      return;
    }

    if (this.config.debug) {
      this._log(`Desktop code update for userId: ${userId}, snippetId: ${snippetId}, fileType: ${fileType}, code: '%CODE%', codeLength: ${code.length}`, 'info', code);
    } else {
      this._log(`Desktop code update for userId: ${userId}, snippetId: ${snippetId}, fileType: ${fileType}, codeLength: ${code.length}`, 'info');
    }

    const sessionKey = userId + ':' + snippetId;
    if (this.config.debug) {
      this._log(`Looking for session with key: ${sessionKey}`);
      this._log(`Available sessions: ${Array.from(this.activeSessions.keys())}`);
    }
    const session = this.activeSessions.get(sessionKey);
    if (!session) {
      // Try to notify the desktop if possible
      // Find the desktop connection for this user (if any)
      const userSession = this.userSessions.get(userId);
      if (userSession && userSession.desktopId) {
        const desktopConn = this.desktopConnections.get(userSession.desktopId);
        if (desktopConn) {
          const errorMsg = 'Error: Code update could not be sent to web application. Please make sure the web page is open and in edit mode, then try saving again.';
          this.sendMessage(desktopConn.ws, {
            type: 'info',
            snippetId: snippetId,
            message: errorMsg
          });

          // Log to server log and activity log
          this._log(`Code update could not be sent to web application for user ${userId}, snippetId: ${snippetId}`, 'warning');
        }
      }
      this.sendError(ws, 'Error: Edit session expired. Please try editing the code snippet again.');
      return;
    }

    // Update session activity
    session.lastActivity = Date.now();

    // Get all browser connections for this user
    const userSession = this.userSessions.get(userId);
    if (this.config.debug) {
      this._log(`User session for ${userId}: ${JSON.stringify(userSession)}`);
      this._log(`Browser IDs: ${userSession ? Array.from(userSession.browserIds || []) : 'no session'}`);
    }

    if (!userSession || !userSession.browserIds || userSession.browserIds.size === 0) {
      if (this.config.debug) {
        this._log(`No browser connections found for user ${userId}`);
      }
      // Send info message to desktop
      const desktopConn = this.desktopConnections.get(session.desktopConnectionId);
      if (desktopConn) {
        const errorMsg = 'Error: Code update could not be sent to web application. Please make sure the web page is open and in edit mode, then try saving again.';
        this.sendMessage(desktopConn.ws, {
          type: 'info',
          snippetId: session.snippetId,
          message: errorMsg
        });

        // Log to server log and activity log
        this._log(`Code update failed: No browser connections for user ${userId}, snippetId: ${session.snippetId}`, 'warning');
      }
      // Do not treat as error, just return
      return;
    }

    // Forward to the browser connection that initiated this edit session
    let delivered = false;
    const targetBrowserId = session.browserConnectionId;

    if (this.config.debug) {
      this._log(`Looking for target browser connection: ${targetBrowserId}`);
      this._log(`Available browser connections: ${Array.from(userSession.browserIds)}`);
    }

    if (targetBrowserId && userSession.browserIds.has(targetBrowserId)) {
      const browserConn = this.browserConnections.get(targetBrowserId);
      if (browserConn) {
        this.sendMessage(browserConn.ws, {
          type: 'code_update',
          snippetId: session.snippetId,
          code: code
        });
        delivered = true;
        if (this.config.debug) {
          this._log(`Code update delivered to target browser ${targetBrowserId}`);
        }
      } else {
        if (this.config.debug) {
          this._log(`Target browser connection ${targetBrowserId} not found`);
        }
      }
    } else {
      if (this.config.debug) {
        this._log(`Target browser ${targetBrowserId} not in user's browser connections`);
      }
    }

    // If not delivered, notify desktop
    if (!delivered) {
      const desktopConn = this.desktopConnections.get(session.desktopConnectionId);
      if (desktopConn) {
        const message = targetBrowserId 
          ? 'Error: The web page that initiated this edit session is no longer connected. Please refresh the web page and try saving again.'
          : 'Error: No web page connections found. Please make sure the web page is open and connected, then try saving again.';

        this.sendMessage(desktopConn.ws, {
          type: 'info',
          snippetId: session.snippetId,
          message: message
        });

        // Log to server log and activity log
        this._log(`Code update failed: ${message} for user ${userId}, snippetId: ${session.snippetId}`, 'warning');

        if (this.config.debug) {
          this._log(`Notified desktop: ${message}`);
        }
      }
    }


  }

  /**
   * Handle ping message
   */
  handlePing(ws, message) {
    this.sendMessage(ws, {
      type: 'pong',
      ...(message.payload || {}),
      timestamp: Date.now()
    });
  }

  /**
   * Handle info message from browser
   */
  handleInfoMessage(ws, message) {
    const { userId, snippetId, message: msg } = message;
    if (!userId || !snippetId || !msg) return;
    // Find user's desktop connection
    const userSession = this.userSessions.get(userId);
    if (!userSession || !userSession.desktopId) return;
    const desktopConn = this.desktopConnections.get(userSession.desktopId);
    if (!desktopConn) return;
    // Forward info message to desktop
    this.sendMessage(desktopConn.ws, {
      type: 'info',
      snippetId: snippetId,
      message: msg
    });
  }



  /**
   * Handle status_connect message from status page
   */
  handleStatusConnect(ws, message) {
    // Mark this connection as a status page
    ws.isStatusPage = true;

    // Add to status page connections set
    this.statusPageConnections.add(ws);

    // Start the shared status update interval if it's not already running
    if (!this.statusUpdateInterval) {
      this.statusUpdateInterval = setInterval(() => {
        this.broadcastStatusToAllPages();
      }, 1000); // Send status updates every second
    }

    // Send initial status immediately
    const statusData = this.generateStatusData();
    this.sendMessage(ws, {
      type: 'status',
      data: statusData,
      timestamp: Date.now()
    });
  }

  /**
   * Broadcast status to all status page connections
   */
  broadcastStatusToAllPages() {
    const statusData = this.generateStatusData();
    const message = {
      type: 'status',
      data: statusData,
      timestamp: Date.now()
    };

    // Send to all status page connections
    for (const ws of this.statusPageConnections) {
      if (ws.readyState === WebSocket.OPEN) {
        this.sendMessage(ws, message);
      }
    }
  }

  /**
   * Handle WebSocket disconnection
   */
  handleDisconnection(ws, code, reason) {
    // Clean up status page connection
    if (ws.isStatusPage) {
      this.statusPageConnections.delete(ws);

      // If no more status pages are connected, stop the interval
      if (this.statusPageConnections.size === 0 && this.statusUpdateInterval) {
        clearInterval(this.statusUpdateInterval);
        this.statusUpdateInterval = null;
      }
    }

    // Remove from browser connections
    if (this.browserConnections.has(ws.connectionId)) {
      const browserConn = this.browserConnections.get(ws.connectionId);
      this.browserConnections.delete(ws.connectionId);

      this._log(`Browser disconnected, userId: ${browserConn.userId}, connectionId: ${ws.connectionId}, code: ${code}, reason: ${reason}`, 'warning');

      // Update user session
      const userSession = this.userSessions.get(browserConn.userId);
      if (userSession && userSession.browserIds) {
        userSession.browserIds.delete(ws.connectionId);
        // Remove user session if no browser connections and no desktop connection
        if (userSession.browserIds.size === 0 && !userSession.desktopId) {
          this.userSessions.delete(browserConn.userId);
        }
      }
      this.sendBrowserStatusToDesktop(browserConn.userId);
    }

    // Remove from desktop connections
    if (this.desktopConnections.has(ws.connectionId)) {
      const desktopConn = this.desktopConnections.get(ws.connectionId);
      this.desktopConnections.delete(ws.connectionId);

      this._log(`Desktop disconnected, userId: ${desktopConn.userId}, connectionId: ${ws.connectionId}, code: ${code}, reason: ${reason}`, 'warning');

      // Update user session
      const userSession = this.userSessions.get(desktopConn.userId);
      if (userSession && userSession.desktopId === ws.connectionId) {
        delete userSession.desktopId;
        // Remove user session if no browser connections and no desktop connection
        if ((!userSession.browserIds || userSession.browserIds.size === 0) && !userSession.desktopId) {
          this.userSessions.delete(desktopConn.userId);
        }
      }
      this.sendDesktopStatusToBrowser(desktopConn.userId);
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

    this._log(`Error: ${message}, connectionId: ${ws.connectionId}`, 'error');



    this.sendMessage(ws, {
      type: 'error',
      message: message,
      code: code
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

    return `<!DOCTYPE html>
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
            <p class="subtitle">WebSocket relay server for seamless integration between web applications and IDEs</p>
            <div class="status-badge" id="status-badge">${connectionStatus}</div>
        </div>

        <div class="grid">
            <div class="card">
                <h2 class="card-title">🔗 Connections</h2>
                <div class="card-content">
                    <div class="metric">
                        <span class="metric-label">Browser Clients</span>
                        <span class="metric-value number" id="browser-clients"></span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Desktop Clients</span>
                        <span class="metric-value number" id="desktop-clients"></span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Total Connected</span>
                        <span class="metric-value number" id="total-connected"></span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Total Since Start</span>
                        <span class="metric-value number" id="total-since-start"></span>
                    </div>
                </div>
            </div>

            <div class="card">
                <h2 class="card-title">📝 Sessions</h2>
                <div class="card-content">
                    <div class="metric">
                        <span class="metric-label">Active Users</span>
                        <span class="metric-value number" id="active-users"></span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Active Edit Sessions</span>
                        <span class="metric-value number" id="active-edit-sessions"></span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Total Sessions</span>
                        <span class="metric-value number" id="total-sessions"></span>
                    </div>
                </div>
            </div>

            <div class="card">
                <h2 class="card-title">📊 Performance</h2>
                <div class="card-content">
                    <div class="metric">
                        <span class="metric-label">Uptime</span>
                        <span class="metric-value" id="uptime"></span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Messages Processed</span>
                        <span class="metric-value number" id="messages-processed"></span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Memory Used</span>
                        <span class="metric-value" id="memory-used"></span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Errors</span>
                        <span class="metric-value number" id="errors"></span>
                    </div>
                </div>
            </div>

            <div class="card">
                <h2 class="card-title">⚙️ Configuration</h2>
                <div class="card-content">
                    <div class="metric">
                        <span class="metric-label">Environment</span>
                        <span class="metric-value" id="environment"></span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">WebSocket Path</span>
                        <span class="metric-value" id="websocket-path"></span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Max Connections</span>
                        <span class="metric-value number" id="max-connections"></span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Debug Mode</span>
                        <span class="metric-value" id="debug-mode"></span>
                    </div>
                </div>
            </div>

            <div class="card activity-log">
                <h2 class="card-title">📋 Activity Log</h2>
                <div class="card-content" id="activity-log">
                    <div class="log-entry info"><span class="log-message">Loading...</span></div>
                </div>
            </div>
        </div>

        <div class="footer">
            <p>
                <a id="health-link" href="#">Health Check</a>
                <a id="debug-link" href="#" style="display: none;">Debug Info</a>
                <a href="https://github.com/peterthoeny/web-ide-bridge">GitHub</a>
            </p>
            <p style="margin-top: 0.5rem;">
                Server started: <span id="server-start-time"></span>
            </p>
        </div>
    </div>

    <script>
        // WebSocket-based real-time status updates
        let ws = null;
        let reconnectAttempts = 0;
        const maxReconnectAttempts = 5;
        const reconnectInterval = 10000; // Reconnect every 10 seconds
        let connectionId = null;
        let lastStatusTime = 0;
        let statusTimeoutTimer = null;
        const STATUS_TIMEOUT = 10000; // 10 seconds timeout for status updates

        // Get WebSocket URL from current page
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = protocol + '//' + window.location.host + '/web-ide-bridge/ws';

        function connectWebSocket() {
            try {
                ws = new WebSocket(wsUrl);

                ws.onopen = function() {
                    console.log('WebSocket connected for status updates');
                    reconnectAttempts = 0;
                    updateConnectionStatus('active');

                    // Send connection init with a unique ID
                    const statusConnectionId = 'status-page-' + Date.now();
                    ws.send(JSON.stringify({
                        type: 'connection_init',
                        connectionId: statusConnectionId
                    }));
                };

                ws.onmessage = function(event) {
                    try {
                        const message = JSON.parse(event.data);
                        if (message.type === 'status') {
                            lastStatusTime = Date.now();
                            updateStatusDisplay(message.data);
                            updateConnectionStatus('active');

                            // Reset timeout timer
                            if (statusTimeoutTimer) {
                                clearTimeout(statusTimeoutTimer);
                            }
                            statusTimeoutTimer = setTimeout(() => {
                                updateConnectionStatus('down');
                            }, STATUS_TIMEOUT);
                        } else if (message.type === 'connection_ack') {
                            connectionId = message.connectionId;
                            console.log('Connection acknowledged with ID:', connectionId);

                            // Send status_connect to start receiving updates
                            ws.send(JSON.stringify({
                                type: 'status_connect',
                                connectionId: connectionId,
                                timestamp: Date.now()
                            }));
                        }
                    } catch (error) {
                        console.error('Error parsing WebSocket message:', error);
                    }
                };

                ws.onclose = function(event) {
                    console.log('WebSocket disconnected:', event.code, event.reason);
                    updateConnectionStatus('down');

                    // Clear timeout timer
                    if (statusTimeoutTimer) {
                        clearTimeout(statusTimeoutTimer);
                        statusTimeoutTimer = null;
                    }

                    // Attempt to reconnect
                    if (reconnectAttempts < maxReconnectAttempts) {
                        reconnectAttempts++;
                        setTimeout(connectWebSocket, reconnectInterval);
                    }
                };

                ws.onerror = function(error) {
                    console.error('WebSocket error:', error);
                    updateConnectionStatus('down');
                };

            } catch (error) {
                console.error('Error creating WebSocket connection:', error);
                updateConnectionStatus('down');
            }
        }

        function updateConnectionStatus(status) {
            const statusBadge = document.getElementById('status-badge');
            if (statusBadge) {
                statusBadge.textContent = status.toUpperCase();
                if (status === 'active') {
                    statusBadge.style.backgroundColor = '#10b981';
                } else if (status === 'waiting') {
                    statusBadge.style.backgroundColor = '#f59e0b';
                } else if (status === 'down') {
                    statusBadge.style.backgroundColor = '#ef4444';
                }
            }
        }

        function updateStatusDisplay(data) {
            // Update connection status
            updateConnectionStatus(data.connectionStatus);

            // Update connection metrics
            updateElement('browser-clients', data.connections.browser);
            updateElement('desktop-clients', data.connections.desktop);
            updateElement('total-connected', data.connections.total);
            updateElement('total-since-start', data.connections.totalSinceStart);

            // Update session metrics
            updateElement('active-users', data.sessions.users);
            updateElement('active-edit-sessions', data.sessions.active);
            updateElement('total-sessions', data.sessions.total);

            // Update performance metrics
            updateElement('uptime', data.uptime);
            updateElement('messages-processed', data.performance.messagesProcessed);
            updateElement('memory-used', data.memoryUsed + ' MB');
            updateElement('errors', data.performance.errors);

            // Update configuration
            updateElement('environment', data.configuration.environment);
            updateElement('websocket-path', data.configuration.websocketPath);
            updateElement('max-connections', data.configuration.maxConnections);
            updateElement('debug-mode', data.configuration.debugMode ? '✅ Enabled' : 'Disabled');

            // Update activity log
            updateActivityLog(data.activityLog);

            // Update server start time
            updateElement('server-start-time', new Date(data.performance.startTime).toLocaleString());

            // Show/hide debug link based on debug mode
            const debugLink = document.getElementById('debug-link');
            if (debugLink) {
                debugLink.style.display = data.configuration.debugMode ? 'inline' : 'none';
            }
        }

        function updateElement(id, value) {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        }

        function updateActivityLog(activityLog) {
            const logContainer = document.getElementById('activity-log');
            if (logContainer) {
                if (activityLog.length > 0) {
                    logContainer.innerHTML = activityLog.map(entry => 
                        '<div class="log-entry ' + entry.type + '">' +
                        '<span class="log-time">' + entry.time + '</span>' +
                        '<span class="log-message">' + entry.message + '</span>' +
                        '</div>'
                    ).join('');
                } else {
                    logContainer.innerHTML = '<div class="log-entry info"><span class="log-message">No activity yet</span></div>';
                }
            }
        }

        // Initialize WebSocket connection when page loads
        document.addEventListener('DOMContentLoaded', function() {
            // Update footer links to use current page URL
            updateFooterLinks();

            // Connect to WebSocket
            connectWebSocket();
        });

        function updateFooterLinks() {
            // Get the current page URL
            const currentUrl = window.location.href;

            // Create health check URL by replacing /status with /health
            const healthUrl = currentUrl.replace(/\\/status(\\/)?$/, '/health');
            const healthLink = document.getElementById('health-link');
            if (healthLink) {
                healthLink.href = healthUrl;
            }

            // Create debug info URL by replacing /status with /debug
            const debugUrl = currentUrl.replace(/\\/status(\\/)?$/, '/debug');
            const debugLink = document.getElementById('debug-link');
            if (debugLink) {
                debugLink.href = debugUrl;
            }
        }

        // Clean up on page unload
        window.addEventListener('beforeunload', function() {
            if (statusTimeoutTimer) {
                clearTimeout(statusTimeoutTimer);
            }
            if (ws) {
                ws.close();
            }
        });
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
      return days + 'd ' + hours + 'h ' + minutes + 'm';
    } else if (hours > 0) {
      return hours + 'h ' + minutes + 'm ' + secs + 's';
    } else if (minutes > 0) {
      return minutes + 'm ' + secs + 's';
    } else {
      return secs + 's';
    }
  }

  /**
   * Generate status data for WebSocket responses
   */
  generateStatusData() {
    const uptime = process.uptime();
    const uptimeFormatted = this.formatUptime(uptime);
    const memoryUsage = process.memoryUsage();

    const connectionStatus = this.browserConnections.size > 0 || this.desktopConnections.size > 0 
      ? 'active' 
      : 'waiting';

    return {
      connectionStatus,
      uptime: uptimeFormatted,
      uptimeSeconds: uptime,
      memoryUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      connections: {
        browser: this.browserConnections.size,
        desktop: this.desktopConnections.size,
        total: this.browserConnections.size + this.desktopConnections.size,
        totalSinceStart: this.metrics.totalConnections
      },
      sessions: {
        users: this.userSessions.size,
        active: this.activeSessions.size,
        total: this.metrics.totalSessions
      },
      performance: {
        messagesProcessed: this.metrics.messagesProcessed,
        errors: this.metrics.errors,
        startTime: new Date(this.metrics.startTime).toISOString()
      },
      configuration: {
        environment: this.config.environment,
        websocketPath: this.wsOptions.path,
        maxConnections: this.config.server.maxConnections,
        debugMode: this.config.debug
      },
      activityLog: this.getActivityLogEntries(15)
    };
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
      this._log(`Cleaned up ${cleanedCount} expired sessions`, 'info');
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
      this._log(`Cleaned up ${cleanedCount} expired rate limit entries`, 'info');
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
      this._log(`Received ${signal}, shutting down gracefully...`);
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
      this._log('Server is already in the process of shutting down.');
      return;
    }

    this.isShuttingDown = true;
    try {
      this._log('Starting server shutdown...');
      this._log('Server shutdown initiated', 'warning');

      // Clear all intervals first
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        this.cleanupInterval = null;
        this._log('Cleared cleanup interval');
      }

      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
        this._log('Cleared heartbeat interval');
      }

      if (this.statusUpdateInterval) {
        clearInterval(this.statusUpdateInterval);
        this.statusUpdateInterval = null;
        this._log('Cleared status update interval');
      }

      // Close all WebSocket connections with proper cleanup
      if (this.wss && this.wss.clients) {
        this._log(`Closing ${this.wss.clients.size} WebSocket connections...`, 'info');
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
        this._log('All WebSocket connections closed', 'info');
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
                this._log('WebSocket server closed');
                resolve();
              }
            });
          });
        } catch (error) {
          this._log(`WebSocket server already closed or error during close: ${error.message}`);
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
                this._log('HTTP server closed');
                resolve();
              }
            });
          });
        } catch (error) {
          this._log(`HTTP server already closed or error during close: ${error.message}`);
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
      if (this.statusPageConnections) {
        this.statusPageConnections.clear();
      }
      if (this.rateLimitStore) {
        this.rateLimitStore.clear();
      }

      // Remove process handlers
      this.removeProcessHandlers();

      this._log('Server shutdown complete');

      // Give a moment for everything to settle
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (error) {
      console.error('Error during shutdown:', error);
      this._log(`Shutdown error: ${error.message}`, 'error');
      // Don't re-throw the error to prevent uncaught exception
    }
  }

  sendDesktopStatusToBrowser(userId) {
    const userSession = this.userSessions.get(userId);
    if (!userSession || !userSession.browserIds || userSession.browserIds.size === 0) return;

    const desktopConnected = !!(userSession && userSession.desktopId && this.desktopConnections.has(userSession.desktopId));

    // Send status update to all browser connections for this user
    userSession.browserIds.forEach(browserId => {
      const browserConn = this.browserConnections.get(browserId);
      if (browserConn) {
        this.sendMessage(browserConn.ws, {
          type: 'status_update',
          desktopConnected
        });
      }
    });
  }

  sendBrowserStatusToDesktop(userId) {
    const userSession = this.userSessions.get(userId);
    if (!userSession || !userSession.desktopId) return;
    const desktopConn = this.desktopConnections.get(userSession.desktopId);
    if (!desktopConn) return;

    // Check if user has any active browser connections
    const browserConnected = !!(userSession && userSession.browserIds && userSession.browserIds.size > 0);

    this.sendMessage(desktopConn.ws, {
      type: 'status_update',
      browserConnected
    });
  }

  /**
   * Get formatted timestamp for logging (server local time)
   */
  _getTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  /**
   * Unified logging function with optional activity log entry
   */
  _log(message, type = null, code = null) {
    const timestamp = this._getTimestamp();

    // Handle code string specially
    if (typeof code === 'string' && code) {
      // Replace newlines with \n for single-line logging (handle both CRLF and LF)
      code = code.replace(/\n/g, '\\n').replace(/[\x00-\x1F]/g, '');

      // Truncate if too long
      if (code.length > 120 && this.config.debug) {
        code = `${code.substring(0, 100)}...${code.substring(code.length - 20)}`;
      }
      message = message.replace(/%CODE%/, code);
    }

    // Clean up whitespace - remove newlines and extra whitespace
    message = message.replace(/\s+/g, ' ');
    console.log(`${timestamp}: ${message}`);

    // Add to activity log if type is provided
    if (type) {
      this.addActivityLogEntry(timestamp, message, type);
    }
  }

  /**
   * Add entry to activity log
   */
  addActivityLogEntry(timestamp, message, type = 'info') {
    const entry = {
      time: timestamp.replace(/^\d+[^ ]*/, ''),
      message: message
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/'/g, '&#39;')
        .replace(/"/g, '&quot;')
        .replace(/\$/g, '&#36;')
        .replace(/\{/g, '&#123;')
        .replace(/\}/g, '&#125;'),
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
    return this.activityLog.slice(0, limit);
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
