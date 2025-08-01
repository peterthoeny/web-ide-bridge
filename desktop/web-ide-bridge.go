/**
 * @name            Web-IDE-Bridge / Desktop
 * @tagline         Desktop application for seamless IDE integration
 * @description     Fyne-based UI, persistent config, WebSocket client, file watching,
 *                  and IDE launching for seamless code editing between browser and desktop
 * @file            desktop/web-ide-bridge.go
 * @version         1.1.4
 * @release         2025-07-30
 * @repository      https://github.com/peterthoeny/web-ide-bridge
 * @author          Peter Thoeny, https://twiki.org & https://github.com/peterthoeny/
 * @copyright       2025 Peter Thoeny, https://twiki.org & https://github.com/peterthoeny/
 * @license         GPL v3, see LICENSE file
 * @genai           99%, Cursor 1.2, Claude Sonnet 4
 */

 package main

import (
	"crypto/rand"
	"embed"
	"encoding/json"
	"fmt"
	"image/color"
	"log"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/app"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/layout"
	"fyne.io/fyne/v2/widget"

	"fyne.io/fyne/v2/storage"
	"github.com/fsnotify/fsnotify"
	"github.com/gorilla/websocket"
)

// Version variables that can be set via build flags
var (
	Version = "1.1.4" // Default version, can be overridden at build time
)

// getVersion returns the version string
func getVersion() string {
	return Version
}



//go:embed web-ide-bridge.conf
var embeddedConfig []byte

//go:embed assets/*
var iconFS embed.FS

//go:embed assets/web-ide-bridge-24.png
var icon24 []byte

//go:embed assets/web-ide-bridge.png
var icon512 []byte

// ----------------------
// Persistent Config
// ----------------------

type Config struct {
	UserID       string `json:"user_id"`
	WebSocket    string `json:"websocket_url"`
	IDECommand   string `json:"ide_command"`
	ConnectionID string `json:"connection_id"`
}

// Update defaultConfig to use app config
func defaultConfig() Config {
	usr, _ := user.Current()
	userID := usr.Username

	// On Windows, strip domain prefix from username (e.g., "FOO\jsmith" -> "jsmith")
	if runtime.GOOS == "windows" && strings.Contains(userID, "\\") {
		parts := strings.Split(userID, "\\")
		if len(parts) == 2 {
			userID = parts[1]
		}
	}

	appCfg, _ := loadAppConfig()
	fmt.Printf("[DEBUG] Loaded org config: ws_url=%q, ides=%v\n", appCfg.WSURL, appCfg.DefaultIDEs)

	// Use environment variable as highest priority, then config file, then default
	wsURL := "ws://localhost:8071/web-ide-bridge/ws" // fallback default
	if envURL := os.Getenv("WEB_IDE_BRIDGE_WS_URL"); envURL != "" {
		wsURL = envURL
		fmt.Printf("[DEBUG] Using WebSocket URL from environment: %s\n", wsURL)
	} else if appCfg.WSURL != "" {
		wsURL = appCfg.WSURL
		fmt.Printf("[DEBUG] Using WebSocket URL from config: %s\n", wsURL)
	} else {
		fmt.Printf("[DEBUG] Using default WebSocket URL: %s\n", wsURL)
	}
	ide := "TextEdit"
	if runtime.GOOS == "darwin" {
		if len(appCfg.DefaultIDEs["darwin"]) > 0 {
			found := false
			checked := []string{}
			for _, candidate := range appCfg.DefaultIDEs["darwin"] {
				appPath := filepath.Join("/Applications", candidate+".app")
				checked = append(checked, appPath)
				if _, err := os.Stat(appPath); err == nil {
					ide = candidate
					found = true
					break
				}
			}
			if !found {
				ide = "TextEdit"
			}
			fmt.Printf("[IDE Detection] Checked: %v, Selected: %s\n", checked, ide)
		} else {
			editors := []struct {
				name string
				app  string
			}{
				{"Visual Studio Code", "/Applications/Visual Studio Code.app"},
				{"Cursor", "/Applications/Cursor.app"},
				{"Xcode", "/Applications/Xcode.app"},
				{"TextEdit", "/Applications/TextEdit.app"},
			}
			for _, editor := range editors {
				if _, err := os.Stat(editor.app); err == nil {
					ide = editor.name
					break
				}
			}
		}
	} else if runtime.GOOS == "windows" {
		if len(appCfg.DefaultIDEs["windows"]) > 0 {
			ide = appCfg.DefaultIDEs["windows"][0]
		} else {
			ide = "notepad.exe"
		}
	} else if runtime.GOOS == "linux" {
		if len(appCfg.DefaultIDEs["linux"]) > 0 {
			ide = appCfg.DefaultIDEs["linux"][0]
		} else {
			ide = "gedit"
		}
	}
	return Config{
		UserID:       userID,
		WebSocket:    wsURL,
		IDECommand:   ide,
		ConnectionID: generateUUID(),
	}
}

// Returns config file path, ensures config dir exists
func configPath() string {
	home, _ := os.UserHomeDir()
	dir := filepath.Join(home, ".web-ide-bridge")
	os.MkdirAll(dir, 0700)
	return filepath.Join(dir, "config.json")
}

// Loads config from disk, or creates default if missing
func loadConfig() (Config, error) {
	path := configPath()
	if _, err := os.Stat(path); os.IsNotExist(err) {
		cfg := defaultConfig()
		_ = saveConfig(cfg)
		return cfg, nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return Config{}, err
	}
	var cfg Config
	err = json.Unmarshal(data, &cfg)
	if err != nil {
		return Config{}, err
	}
	return cfg, nil
}

// Saves config to disk
func saveConfig(cfg Config) error {
	path := configPath()
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0600)
}

// UUID v4 generator (simple, not cryptographically secure)
func generateUUID() string {
	r := make([]byte, 16)
	_, err := rand.Read(r)
	if err != nil {
		// fallback: all zeroes, but should never happen
		return "00000000-0000-4000-8000-000000000000"
	}
	r[6] = (r[6] & 0x0f) | 0x40 // version 4
	r[8] = (r[8] & 0x3f) | 0x80 // variant
	return fmt.Sprintf("%x-%x-%x-%x-%x", r[0:4], r[4:6], r[6:8], r[8:10], r[10:16])
}

// AppConfig struct for app/org defaults
// { "defaults": { "ides": { ... }, "ws_url": "..." }, "temp_file_cleanup_hours": ... }
type AppConfig struct {
	DefaultIDEs          map[string][]string `json:"ides"`
	WSURL                string              `json:"ws_url"`
	TempFileCleanupHours int                 `json:"temp_file_cleanup_hours"`
}

type FullAppConfig struct {
	Defaults             AppConfig `json:"defaults"`
	TempFileCleanupHours int       `json:"temp_file_cleanup_hours"`
}

// Load app config from desktop/web-ide-bridge.conf, /etc/web-ide-bridge.conf, or $WEB_IDE_BRIDGE_CONFIG
func loadAppConfig() (AppConfig, error) {
	var config AppConfig
	paths := []string{}
	if env := os.Getenv("WEB_IDE_BRIDGE_CONFIG"); env != "" {
		paths = append(paths, env)
	}
	// Look in /etc/, then current dir, then desktop/
	paths = append(paths, "/etc/web-ide-bridge.conf", "web-ide-bridge.conf", "desktop/web-ide-bridge.conf")
	for _, path := range paths {
		if _, err := os.Stat(path); err == nil {
			data, err := os.ReadFile(path)
			if err != nil {
				continue
			}
			var fullConfig FullAppConfig
			if err := json.Unmarshal(data, &fullConfig); err != nil {
				continue
			}
			config = fullConfig.Defaults
			config.TempFileCleanupHours = fullConfig.TempFileCleanupHours
			return config, nil
		}
	}
	// Fallback: use embedded config if present
	if len(embeddedConfig) > 0 {
		fmt.Printf("[DEBUG] Using embedded config, size: %d bytes\n", len(embeddedConfig))
		var fullConfig FullAppConfig
		if err := json.Unmarshal(embeddedConfig, &fullConfig); err == nil {
			config = fullConfig.Defaults
			config.TempFileCleanupHours = fullConfig.TempFileCleanupHours
			return config, nil
		} else {
			fmt.Printf("[DEBUG] Failed to parse embedded config: %v\n", err)
		}
	} else {
		fmt.Printf("[DEBUG] No embedded config found (length: %d)\n", len(embeddedConfig))
	}
	return config, nil // empty config if not found
}

// ----------------------
// WebSocket Client
// ----------------------

type WebSocketClient struct {
	cfg         Config
	conn        *websocket.Conn
	status      string
	statusMu    sync.Mutex
	logFunc     func(string)
	stopCh      chan struct{}
	reconnectCh chan struct{}
	statusCh    chan string              // notify UI of status changes
	watchers    map[string]chan struct{} // snippetId -> stop channel
	watchersMu  sync.Mutex
	// sessionMap maps snippetId to sessionId
	sessionMap       map[string]string
	browserConnected bool
}

func NewWebSocketClient(cfg Config, logFunc func(string)) *WebSocketClient {
	return &WebSocketClient{
		cfg:              cfg,
		status:           "disconnected",
		logFunc:          logFunc,
		stopCh:           make(chan struct{}),
		reconnectCh:      make(chan struct{}, 1),
		statusCh:         make(chan string, 1),
		watchers:         make(map[string]chan struct{}),
		sessionMap:       make(map[string]string),
		browserConnected: false,
	}
}

// Start the connection loop in a goroutine
func (c *WebSocketClient) Start() {
	go c.connectLoop()
}

// Restart safely closes the current connection and starts a new one
func (c *WebSocketClient) Restart() {
	c.log("Restarting WebSocket connection...")

	// Get list of active watchers before closing
	activeWatchers := c.getActiveWatchers()

	c.Close() // Close the current connection and stop all watchers
	c.Start() // Start a new connection

	// Restore watchers after connection is established
	if len(activeWatchers) > 0 {
		c.log(fmt.Sprintf("Restoring %d active file watchers after reconnect", len(activeWatchers)))
		// Give the connection a moment to establish before restoring watchers
		time.Sleep(500 * time.Millisecond)
		c.restoreWatchers(activeWatchers)
	}
}

// RestartWithConfig safely closes the current connection, updates config, and starts a new one
func (c *WebSocketClient) RestartWithConfig(newConfig Config) {
	c.log("Restarting WebSocket connection with new configuration...")

	// Get list of active watchers before closing
	activeWatchers := c.getActiveWatchers()

	c.Close() // Close the current connection and stop all watchers

	// Update configuration with proper synchronization
	c.statusMu.Lock()
	c.cfg = newConfig
	c.statusMu.Unlock()

	c.log(fmt.Sprintf("Updated IDE command to: %s", newConfig.IDECommand))
	c.Start() // Start a new connection

	// Restore watchers after connection is established
	if len(activeWatchers) > 0 {
		c.log(fmt.Sprintf("Restoring %d active file watchers after reconnect", len(activeWatchers)))
		// Give the connection a moment to establish before restoring watchers
		time.Sleep(500 * time.Millisecond)
		c.restoreWatchers(activeWatchers)
	}
}

// Main connection loop: handles connect, reconnect, and cleanup
func (c *WebSocketClient) connectLoop() {
	for {
		// Get current configuration with proper synchronization
		c.statusMu.Lock()
		currentCfg := c.cfg
		c.statusMu.Unlock()

		c.log("Connecting to " + currentCfg.WebSocket)
		conn, _, err := websocket.DefaultDialer.Dial(currentCfg.WebSocket, nil)
		if err != nil {
			c.setStatus("disconnected")
			c.log("Failed to connect to server: " + err.Error())
			time.Sleep(10 * time.Second)
			continue
		}
		c.conn = conn

		// Send desktop_connect message to server
		desktopConnectMsg := map[string]interface{}{
			"type":         "desktop_connect",
			"connectionId": currentCfg.ConnectionID,
			"userId":       currentCfg.UserID,
			"timestamp":    time.Now().UnixMilli(),
		}
		if data, err := json.Marshal(desktopConnectMsg); err == nil {
			c.conn.WriteMessage(websocket.TextMessage, data)
			c.log("Registered with server as user: " + currentCfg.UserID)
		} else {
			c.log("Failed to register with server: " + err.Error())
		}

		c.setStatus("connected")
		c.log("Connected to Web-IDE-Bridge server")
		pongCh := make(chan struct{})
		go c.pingPongLoop(pongCh)
		c.readLoop(pongCh)
		c.setStatus("disconnected")
		c.log("Disconnected from Web-IDE-Bridge server")
		conn.Close()
		c.stopAllWatchers()
		// Wait before reconnecting
		time.Sleep(10 * time.Second)
	}
}

// Ping/pong keepalive
func (c *WebSocketClient) pingPongLoop(pongCh chan struct{}) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			if c.conn != nil {
				c.conn.WriteMessage(websocket.PingMessage, []byte("ping"))
			}
		case <-pongCh:
			return
		case <-c.stopCh:
			return
		}
	}
}

// Read messages from server
func (c *WebSocketClient) readLoop(pongCh chan struct{}) {
	for {
		_, msg, err := c.conn.ReadMessage()
		if err != nil {
			close(pongCh)
			return
		}
		if string(msg) == "pong" {
			// Debug log (not shown in activity log)
			log.Printf("Received pong from server")
			continue
		}
		// Handle JSON messages
		var m map[string]interface{}
		if err := json.Unmarshal(msg, &m); err != nil {
			c.log("Received invalid message from server: " + err.Error())
			continue
		}
		typeVal, _ := m["type"].(string)
		if typeVal == "edit_request" {
			snippetId, _ := m["snippetId"].(string)
			code, _ := m["code"].(string)
			fileType, _ := m["fileType"].(string)
			if snippetId != "" {
				c.sessionMap[snippetId] = snippetId
			}
			c.log(fmt.Sprintf("Received edit request for code snippet: %s, fileType: %s, codeLength: %d", snippetId, fileType, len(code)))
			go c.handleEditRequest(snippetId, code, fileType)
		} else if typeVal == "status_update" {
			if val, ok := m["browserConnected"].(bool); ok {
				c.browserConnected = val
				// Optionally, notify UI via a channel or callback
			}
		} else if typeVal == "info" {
			message, _ := m["message"].(string)
			if message != "" {
				c.log(message)
			}
		}
	}
}

// Handle edit_request: save code, launch IDE, start watcher
func (c *WebSocketClient) handleEditRequest(snippetId, code, fileType string) {
	tmpDir := os.TempDir()
	// Add a helper to sanitize snippetId for file names
	sanitizeSnippetId := func(snippetId string) string {
		var b strings.Builder
		for _, r := range snippetId {
			if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
				b.WriteRune(r)
			} else {
				b.WriteRune('_')
			}
		}
		return b.String()
	}
	sanitizedId := sanitizeSnippetId(snippetId)
	tmpFile := filepath.Join(tmpDir, "web-"+sanitizedId+"."+fileType)

	// Get current configuration with proper synchronization
	c.statusMu.Lock()
	currentCfg := c.cfg
	c.statusMu.Unlock()

	// Debug log (not shown in activity log)
	log.Printf("[handleEditRequest] userId=%s, snippetId=%s, fileType=%s, codeLength=%d", currentCfg.UserID, snippetId, fileType, len(code))

	c.log(fmt.Sprintf("Saving code snippet %s to temp file, and launching IDE %s", snippetId, currentCfg.IDECommand))
	if err := os.WriteFile(tmpFile, []byte(code), 0644); err != nil {
		c.log("Failed to save code snippet to temp file: " + err.Error())
		return
	}

	var cmd *exec.Cmd
	ideCmd := currentCfg.IDECommand
	if runtime.GOOS == "darwin" {
		if strings.HasSuffix(ideCmd, ".app") {
			// Extract app name from path, e.g., /Applications/TextEdit.app -> TextEdit
			appName := strings.TrimSuffix(filepath.Base(ideCmd), ".app")
			cmd = exec.Command("open", "-a", appName, tmpFile)
		} else if !strings.Contains(ideCmd, "/") {
			// App name only (e.g., TextEdit, Cursor)
			cmd = exec.Command("open", "-a", ideCmd, tmpFile)
		} else {
			// Path to binary
			cmd = exec.Command(ideCmd, tmpFile)
		}
	} else if runtime.GOOS == "windows" {
		cmd = exec.Command(ideCmd, tmpFile)
	} else {
		cmd = exec.Command(ideCmd, tmpFile)
	}

	if err := cmd.Start(); err != nil {
		c.log("Failed to launch IDE: " + err.Error())
		return
	}
	c.startFileWatcher(snippetId, tmpFile, fileType)
}

// Start or restart a file watcher for a snippetId
func (c *WebSocketClient) startFileWatcher(snippetId, tmpFile, fileType string) {
	c.watchersMu.Lock()
	if stopCh, ok := c.watchers[snippetId]; ok {
		c.log("Stopping previous file watcher for snippet: " + snippetId)
		close(stopCh)
		delete(c.watchers, snippetId)
	}
	stopCh := make(chan struct{})
	c.watchers[snippetId] = stopCh
	c.watchersMu.Unlock()
	go c.watchFileAndSendUpdates(tmpFile, snippetId, fileType, stopCh)
}

// Watch file for changes and send updates if connected
func (c *WebSocketClient) watchFileAndSendUpdates(tmpFile, snippetId, fileType string, stopCh chan struct{}) {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		c.log("Failed to create file watcher: " + err.Error())
		return
	}
	defer watcher.Close()
	if err := watcher.Add(tmpFile); err != nil {
		c.log("Failed to watch temp file for changes: " + err.Error())
		return
	}
	c.log(fmt.Sprintf("Now watching for %s file changes in IDE...", snippetId))

	// Initialize lastContent with current file content to avoid detecting initial file creation
	initialContent, err := os.ReadFile(tmpFile)
	if err != nil {
		c.log("Failed to read initial file content: " + err.Error())
		return
	}
	lastContent := string(initialContent)

	for {
		select {
		case event, ok := <-watcher.Events:
			if !ok {
				return
			}
			if event.Op&fsnotify.Write == fsnotify.Write {
				content, err := os.ReadFile(tmpFile)
				if err != nil {
					c.log("Failed to read file: " + err.Error())
					continue
				}
				if string(content) != lastContent {
					lastContent = string(content)
					if c.getStatus() == "connected" {
						c.log(fmt.Sprintf("Detected temp file change, sending code to server, snippet: %s, fileType: %s, codeLength: %d", snippetId, fileType, len(content)))
						c.sendCodeUpdate(snippetId, string(content), fileType)
					} else {
						c.log("File changed, but not connected. Please save again after reconnect.")
					}
				}
			}
		case err, ok := <-watcher.Errors:
			if !ok {
				return
			}
			c.log("File watcher error: " + err.Error())
		case <-stopCh:
			c.log("Stopped watching for file changes in IDE")
			return
		}
	}
}

// Get list of active watchers (for restoration after reconnect)
func (c *WebSocketClient) getActiveWatchers() map[string]string {
	c.watchersMu.Lock()
	defer c.watchersMu.Unlock()

	activeWatchers := make(map[string]string)
	for snippetId := range c.watchers {
		// Reconstruct the temp file path
		sanitizeSnippetId := func(snippetId string) string {
			var b strings.Builder
			for _, r := range snippetId {
				if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
					b.WriteRune(r)
				} else {
					b.WriteRune('_')
				}
			}
			return b.String()
		}
		sanitizedId := sanitizeSnippetId(snippetId)
		tmpFile := filepath.Join(os.TempDir(), "web-"+sanitizedId+".js") // Default to .js, will be corrected below

		// Try to determine the actual file type by checking what files exist
		for _, ext := range []string{"js", "py", "java", "cpp", "c", "go", "rs", "php", "rb", "ts", "html", "css", "json", "xml", "md", "txt"} {
			testFile := filepath.Join(os.TempDir(), "web-"+sanitizedId+"."+ext)
			if _, err := os.Stat(testFile); err == nil {
				tmpFile = testFile
				break
			}
		}

		// Extract file type from the found file
		ext := filepath.Ext(tmpFile)
		if ext != "" {
			fileType := strings.TrimPrefix(ext, ".")
			activeWatchers[snippetId] = fileType
		}
	}
	return activeWatchers
}

// Stop all file watchers (on disconnect/shutdown)
func (c *WebSocketClient) stopAllWatchers() {
	c.watchersMu.Lock()
	for id, stopCh := range c.watchers {
		c.log("Stopping file watcher for snippet: " + id)
		close(stopCh)
	}
	c.watchers = make(map[string]chan struct{})
	c.watchersMu.Unlock()
}

// Restore watchers from a saved list
func (c *WebSocketClient) restoreWatchers(watchers map[string]string) {
	for snippetId, fileType := range watchers {
		// Reconstruct the temp file path
		sanitizeSnippetId := func(snippetId string) string {
			var b strings.Builder
			for _, r := range snippetId {
				if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
					b.WriteRune(r)
				} else {
					b.WriteRune('_')
				}
			}
			return b.String()
		}
		sanitizedId := sanitizeSnippetId(snippetId)
		tmpFile := filepath.Join(os.TempDir(), "web-"+sanitizedId+"."+fileType)

		// Check if the file still exists before restoring the watcher
		if _, err := os.Stat(tmpFile); err == nil {
			c.log(fmt.Sprintf("Restoring watcher for existing file: %s (%s)", snippetId, fileType))
			c.startFileWatcher(snippetId, tmpFile, fileType)
		} else {
			c.log(fmt.Sprintf("Skipping watcher restoration for %s - file no longer exists", snippetId))
		}
	}
}

// Send code update to server
func (c *WebSocketClient) sendCodeUpdate(snippetId, code, fileType string) {
	// Get current configuration with proper synchronization
	c.statusMu.Lock()
	currentCfg := c.cfg
	c.statusMu.Unlock()

	// Debug log (not shown in activity log)
	log.Printf("[sendCodeUpdate] userId=%s, snippetId=%s, fileType=%s, codeLength=%d", currentCfg.UserID, snippetId, fileType, len(code))
	msg := map[string]interface{}{
		"type":         "code_update",
		"connectionId": currentCfg.ConnectionID,
		"userId":       currentCfg.UserID,
		"snippetId":    snippetId,
		"code":         code,
		"fileType":     fileType,
		"timestamp":    time.Now().UnixMilli(),
	}
	data, _ := json.Marshal(msg)
	if c.conn != nil {
		c.conn.WriteMessage(websocket.TextMessage, data)
		c.log(fmt.Sprintf("Sent code snippet %s to server", snippetId))
	}
}

// Get current connection status (thread-safe)
func (c *WebSocketClient) getStatus() string {
	c.statusMu.Lock()
	defer c.statusMu.Unlock()
	return c.status
}

// Set connection status and notify UI
func (c *WebSocketClient) setStatus(status string) {
	c.statusMu.Lock()
	c.status = status
	c.statusMu.Unlock()
	select {
	case c.statusCh <- status:
	default:
	}
}

// Smart logging helper for large messages
func (c *WebSocketClient) smartLog(msg string, data interface{}) {
	if data != nil {
		// If data is a string and it's long, truncate it
		if str, ok := data.(string); ok && len(str) > 100 {
			truncated := str[:100] + "..." + str[len(str)-20:] + fmt.Sprintf(" (%d chars total)", len(str))
			c.log(msg + ": " + truncated)
		} else {
			c.log(msg + ": " + fmt.Sprintf("%v", data))
		}
	} else {
		c.log(msg)
	}
}

// Log to activity log and stdout
func (c *WebSocketClient) log(msg string) {
	if c.logFunc != nil {
		c.logFunc(time.Now().Format("15:04:05 ") + msg)
	}
	log.Println(msg)
}

// Graceful shutdown
func (c *WebSocketClient) Close() {
	// Check if client is properly initialized
	if c.stopCh == nil {
		return // Not initialized
	}

	// Check current status
	currentStatus := c.getStatus()
	if currentStatus == "shutdown" {
		return // Already shutting down
	}

	c.log("Shutting down Web-IDE-Bridge client...")

	// Set status to shutdown to prevent multiple close attempts
	c.setStatus("shutdown")

	// Safely close stopCh only if it hasn't been closed yet
	select {
	case <-c.stopCh:
		// Channel already closed
	default:
		close(c.stopCh)
	}

	c.stopAllWatchers()
	if c.conn != nil {
		c.conn.Close()
	}
}

// ----------------------
// UI Helpers
// ----------------------

// Returns a colored status dot
func statusDot(col color.Color, size float32) *canvas.Circle {
	dot := canvas.NewCircle(col)
	dot.Resize(fyne.NewSize(size, size))
	return dot
}

// Helper to create a centered, fixed-size dot container
func statusDotContainer(dot *canvas.Circle) fyne.CanvasObject {
	bg := canvas.NewRectangle(color.Transparent)
	bg.SetMinSize(fyne.NewSize(18, 18))
	return container.NewCenter(container.NewMax(bg, dot))
}

// Returns a section header with gray background
func sectionHeader(title string) fyne.CanvasObject {
	// Create gradient background using LinearGradient
	gradient := canvas.NewLinearGradient(
		color.RGBA{250, 250, 250, 255}, // Light gray at top
		color.RGBA{230, 230, 230, 255}, // Darker gray at bottom
		180,                            // 90 degrees (vertical gradient)
	)
	gradient.SetMinSize(fyne.NewSize(0, 32))

	headerText := widget.NewLabelWithStyle(title, fyne.TextAlignLeading, fyne.TextStyle{Bold: true})

	// Use NewPadded with the gradient to remove flush margins while keeping text padding
	return container.NewMax(
		gradient,
		container.NewPadded(headerText),
	)
}

// ----------------------
// App Icon Setup
// ----------------------

// setupAppIcon sets the appropriate icon for the current platform
func setupAppIcon(a fyne.App) {
	// Use the embedded PNG icon for all platforms
	iconResource := fyne.NewStaticResource("web-ide-bridge.png", icon512)
	a.SetIcon(iconResource)
	log.Printf("Set app icon for platform: %s", runtime.GOOS)
}

// ----------------------
// Main
// ----------------------

func main() {
	cfg, _ := loadConfig()

	a := app.NewWithID("com.peterthoeny.web-ide-bridge")

	// Set up platform-specific app icon
	setupAppIcon(a)

	w := a.NewWindow("Web-IDE-Bridge")
	w.SetTitle("Web-IDE-Bridge")
	w.Resize(fyne.NewSize(700, 720)) // wider window

	// Activity Log Section (improved contrast)
	logText := ""
	logLabel := widget.NewLabel(logText)
	logLabel.Wrapping = fyne.TextWrapWord
	logLabel.TextStyle = fyne.TextStyle{Monospace: true}
	logScroll := container.NewVScroll(logLabel)
	logScroll.SetMinSize(fyne.NewSize(0, 160))
	appendLog := func(msg string) {
		if len(logText) > 0 && logText[len(logText)-1] != '\n' {
			logText += "\n"
		}
		logText += msg
		if len(logText) > 10000 {
			logText = logText[len(logText)-10000:]
		}
		logLabel.SetText(strings.TrimRight(logText, "\n"))
		logScroll.ScrollToBottom()
	}
	logSection := container.NewVBox(
		sectionHeader("Activity Log"),
		logScroll,
	)
	logCard := widget.NewCard("", "", logSection)

	wsClient := NewWebSocketClient(cfg, appendLog)
	wsClient.Start()

	// Start temp file cleanup goroutine
	cleanupHours := 24
	if appCfg, err := loadAppConfig(); err == nil && appCfg.TempFileCleanupHours > 0 {
		cleanupHours = appCfg.TempFileCleanupHours
	}
	go func() {
		for {
			tmpDir := os.TempDir()
			files, err := os.ReadDir(tmpDir)
			if err == nil {
				now := time.Now()
				for _, f := range files {
					if strings.HasPrefix(f.Name(), "web-") {
						info, err := f.Info()
						if err == nil && info.ModTime().Add(time.Duration(cleanupHours)*time.Hour).Before(now) {
							os.Remove(filepath.Join(tmpDir, f.Name()))
						}
					}
				}
			}
			time.Sleep(1 * time.Hour)
		}
	}()

	// Config value labels (for live update)
	userVal := widget.NewLabel(cfg.UserID)
	userVal.Alignment = fyne.TextAlignLeading
	wsVal := widget.NewLabel(cfg.WebSocket)
	wsVal.Alignment = fyne.TextAlignLeading
	ideVal := widget.NewLabel(cfg.IDECommand)
	ideVal.Alignment = fyne.TextAlignLeading
	connIDVal := widget.NewLabel(cfg.ConnectionID)
	connIDVal.Alignment = fyne.TextAlignLeading

	// Desktop <=> Server status box
	dsStatusLabel := widget.NewLabelWithStyle("Disconnected", fyne.TextAlignLeading, fyne.TextStyle{})
	dsStatusDot := statusDot(color.RGBA{200, 0, 0, 255}, 24)
	dsStatusBg := canvas.NewRectangle(color.RGBA{255, 235, 235, 255}) // faint red by default
	dsStatusBg.SetMinSize(fyne.NewSize(0, 56))
	dsStatusContent := container.NewVBox(
		widget.NewLabelWithStyle("Desktop <=> Server", fyne.TextAlignCenter, fyne.TextStyle{Bold: true}),
		container.NewHBox(
			layout.NewSpacer(),
			statusDotContainer(dsStatusDot),
			canvas.NewText(" ", color.Transparent),
			dsStatusLabel,
			layout.NewSpacer(),
		),
	)
	dsStatusCard := widget.NewCard("", "",
		container.NewMax(
			dsStatusBg,
			dsStatusContent,
		),
	)

	// Server <=> Browser status box
	sbStatusLabel := widget.NewLabelWithStyle("Disconnected", fyne.TextAlignLeading, fyne.TextStyle{})
	sbStatusDot := statusDot(color.RGBA{200, 0, 0, 255}, 24)
	sbStatusBg := canvas.NewRectangle(color.RGBA{255, 235, 235, 255}) // faint red
	sbStatusBg.SetMinSize(fyne.NewSize(0, 56))
	sbStatusContent := container.NewVBox(
		widget.NewLabelWithStyle("Server <=> Browser", fyne.TextAlignCenter, fyne.TextStyle{Bold: true}),
		container.NewHBox(
			layout.NewSpacer(),
			statusDotContainer(sbStatusDot),
			canvas.NewText(" ", color.Transparent),
			sbStatusLabel,
			layout.NewSpacer(),
		),
	)
	sbStatusCard := widget.NewCard("", "",
		container.NewMax(
			sbStatusBg,
			sbStatusContent,
		),
	)

	// Horizontal layout of status cards with equal width distribution
	statusCardsRow := container.NewGridWithColumns(2,
		dsStatusCard,
		sbStatusCard,
	)

	// Remove the old connStatusCard and reconnectBtn definitions, and replace with:
			reconnectBtn := widget.NewButton("Reconnect", func() {
			go func() {
				appendLog(time.Now().Format("15:04:05 ") + "Manual reconnect initiated...")
				log.Println("Manual reconnect initiated...")
				wsClient.Restart()
			}()
		})
	reconnectBtn.Importance = widget.HighImportance

	// Main connection status section
	connStatusSection := container.NewVBox(
		sectionHeader("Connection Status"),
		statusCardsRow,
		container.NewHBox(layout.NewSpacer(), reconnectBtn, layout.NewSpacer()),
	)
	connStatusCard := widget.NewCard("", "", connStatusSection)

	// Edit Configuration dialog
	showEditConfig := func() {
		userEntry := widget.NewEntry()
		userEntry.SetText(cfg.UserID)
		wsEntry := widget.NewEntry()
		wsEntry.SetText(cfg.WebSocket)
		ideEntry := widget.NewEntry()
		ideEntry.SetText(cfg.IDECommand)

		browseBtn := widget.NewButton("Browse", func() {
			startDir := ""
			if runtime.GOOS == "darwin" {
				macApps := "/Applications"
				if _, err := os.Stat(macApps); err == nil {
					startDir = macApps
				}
			}
			fileDialog := dialog.NewFileOpen(func(uc fyne.URIReadCloser, err error) {
				if err != nil {
					appendLog("File browser error: " + err.Error())
					return
				}
				if uc != nil {
					ideEntry.SetText(uc.URI().Path())
					uc.Close()
				}
			}, w)
			// Don't set a filter - let the user see all files and folders
			if startDir != "" {
				if lister, err := storage.ListerForURI(storage.NewFileURI(startDir)); err == nil && lister != nil {
					fileDialog.SetLocation(lister)
				}
			}
			fileDialog.Show()
		})

		// Dialog header with gradient background like main sections
		headerGradient := canvas.NewLinearGradient(
			color.RGBA{250, 250, 250, 255}, // Light gray at top
			color.RGBA{230, 230, 230, 255}, // Darker gray at bottom
			180,                            // 180 degrees (vertical gradient)
		)
		headerGradient.SetMinSize(fyne.NewSize(0, 36))
		headerText := widget.NewLabelWithStyle("Edit Configuration", fyne.TextAlignCenter, fyne.TextStyle{Bold: true})
		header := container.NewMax(headerGradient, headerText)

		// IDE field row with Browse button inline
		ideRow := container.NewBorder(nil, nil, nil, browseBtn, ideEntry)

		// In showEditConfig, show only the platform-specific tip for the current OS
		var platformTip fyne.CanvasObject
		if runtime.GOOS == "darwin" {
			macTipLabel := widget.NewLabel("Enter the app name (e.g. Cursor, TextEdit) or the full path to the .app bundle (e.g. /Applications/Cursor.app)")
			macTipLabel.Wrapping = fyne.TextWrapWord
			platformTip = macTipLabel
		} else if runtime.GOOS == "windows" {
			winTipLabel := widget.NewLabel("The IDE command must be in your PATH, or provide the full path to the .exe file.")
			winTipLabel.Wrapping = fyne.TextWrapWord
			platformTip = winTipLabel
		} else {
			platformTip = layout.NewSpacer()
		}

		form := container.New(layout.NewFormLayout(),
			widget.NewLabelWithStyle("User ID:", fyne.TextAlignTrailing, fyne.TextStyle{}), userEntry,
			widget.NewLabelWithStyle("WebSocket URL:", fyne.TextAlignTrailing, fyne.TextStyle{}), wsEntry,
			widget.NewLabelWithStyle("IDE Command:", fyne.TextAlignTrailing, fyne.TextStyle{}), ideRow,
			widget.NewLabel(""), platformTip,
		)

		customDialogContent := container.NewVBox(
			header,
			layout.NewSpacer(),        // Top margin
			container.NewPadded(form), // Side padding for form
			layout.NewSpacer(),        // Bottom margin
		)

		customDialog := dialog.NewCustomConfirm(
			"",
			"Save Changes",
			"Cancel",
			customDialogContent,
			func(ok bool) {
				if ok {
					cfg.UserID = userEntry.Text
					cfg.WebSocket = wsEntry.Text
					cfg.IDECommand = ideEntry.Text
					err := saveConfig(cfg)
					if err != nil {
						appendLog("Failed to save configuration: " + err.Error())
					} else {
						appendLog("Configuration updated and saved successfully.")
						userVal.SetText(cfg.UserID)
						wsVal.SetText(cfg.WebSocket)
						ideVal.SetText(cfg.IDECommand)
						go func() {
							appendLog("Re-initializing app with new configuration...")
							// Re-initialize the configuration similar to app restart
							// This ensures the new IDE command is properly used
							wsClient.RestartWithConfig(cfg)
						}()
					}
				}
			},
			w,
		)
		customDialog.Resize(fyne.NewSize(680, 0))
		customDialog.Show()
	}

	editConfigBtn := widget.NewButton("Edit Configuration", showEditConfig)
	editConfigBtn.Importance = widget.HighImportance

	// Header with version badge and 24x24 icon
	icon24Res := fyne.NewStaticResource("web-ide-bridge-24.png", icon24)
	icon24Img := canvas.NewImageFromResource(icon24Res)
	icon24Img.SetMinSize(fyne.NewSize(24, 24))
	icon24Img.FillMode = canvas.ImageFillContain
	title := canvas.NewText("Web-IDE-Bridge", color.RGBA{80, 80, 220, 255})
	title.TextStyle = fyne.TextStyle{Bold: true}
	title.TextSize = 26
	// Version badge with vertical adjustment
	versionBadge := widget.NewLabel("v" + getVersion())
	versionBadge.TextStyle = fyne.TextStyle{Italic: true}

	titleRow := container.NewHBox(
		icon24Img,
		canvas.NewText(" ", color.Transparent),
		title,
		canvas.NewText(" ", color.Transparent),
		versionBadge,
		layout.NewSpacer(),
	)
	intro := widget.NewLabel("Edit code in your desktop IDE, seamlessly synced with your browser.")
	intro.TextStyle = fyne.TextStyle{Italic: true}

	// Configuration Section (table format, aligned)
	configTable := container.New(layout.NewFormLayout(),
		widget.NewLabelWithStyle("User ID:", fyne.TextAlignTrailing, fyne.TextStyle{}), userVal,
		widget.NewLabelWithStyle("WebSocket URL:", fyne.TextAlignTrailing, fyne.TextStyle{}), wsVal,
		widget.NewLabelWithStyle("IDE Command:", fyne.TextAlignTrailing, fyne.TextStyle{}), ideVal,
		widget.NewLabelWithStyle("Connection ID:", fyne.TextAlignTrailing, fyne.TextStyle{}), connIDVal,
	)
	configSection := container.NewVBox(
		sectionHeader("Configuration"),
		container.NewPadded(configTable),
		container.NewHBox(layout.NewSpacer(), editConfigBtn, layout.NewSpacer()),
	)
	configCard := widget.NewCard("", "", configSection)

	mainContent := container.NewVBox(
		container.NewCenter(titleRow),
		container.NewCenter(intro),
		connStatusCard,
		configCard,
		logCard,
	)

	pad := container.NewVBox(
		layout.NewSpacer(),
		container.NewPadded(mainContent),
		layout.NewSpacer(),
	)

	w.SetContent(pad)

			w.SetCloseIntercept(func() {
			appendLog("Web-IDE-Bridge application shutting down...")
			wsClient.Close()
			w.Close()
		})

	// Goroutine to update status indicator in real time
	go func() {
		for status := range wsClient.statusCh {
			a.Settings().SetTheme(a.Settings().Theme()) // force UI refresh
			if status == "connected" {
				dsStatusLabel.SetText("Connected")
				dsStatusDot.FillColor = color.RGBA{0, 200, 0, 255}
				dsStatusBg.FillColor = color.RGBA{230, 255, 230, 255} // faint green
			} else {
				dsStatusLabel.SetText("Disconnected")
				dsStatusDot.FillColor = color.RGBA{200, 0, 0, 255}
				dsStatusBg.FillColor = color.RGBA{255, 235, 235, 255} // faint red
			}
			dsStatusDot.Refresh()
			dsStatusBg.Refresh()
		}
	}()

	// Add a goroutine to update sbStatusLabel and sbStatusDot based on wsClient.browserConnected
	go func() {
		for {
			// poll or use a channel for updates
			time.Sleep(1 * time.Second)
			if wsClient.browserConnected {
				sbStatusLabel.SetText("Connected")
				sbStatusDot.FillColor = color.RGBA{0, 200, 0, 255}
				sbStatusBg.FillColor = color.RGBA{230, 255, 230, 255}
			} else {
				sbStatusLabel.SetText("Disconnected")
				sbStatusDot.FillColor = color.RGBA{200, 0, 0, 255}
				sbStatusBg.FillColor = color.RGBA{255, 235, 235, 255}
			}
			sbStatusDot.Refresh()
			sbStatusBg.Refresh()
		}
	}()

	w.ShowAndRun()
}
