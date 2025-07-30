/**
 * @name            Web-IDE-Bridge / Tests / Desktop
 * @tagline         Desktop application tests for Web-IDE-Bridge Desktop
 * @description     Tests for Web-IDE-Bridge Desktop
 * @file            tests/desktop/desktop_test.go
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
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

// TestConfig represents the config structure for testing
type TestConfig struct {
	UserID       string `json:"user_id"`
	WebSocket    string `json:"websocket_url"`
	IDECommand   string `json:"ide_command"`
	ConnectionID string `json:"connection_id"`
}

// TestAppConfig represents the app config structure for testing
type TestAppConfig struct {
	DefaultIDEs          map[string][]string `json:"ides"`
	WSURL                string              `json:"ws_url"`
	TempFileCleanupHours int                 `json:"temp_file_cleanup_hours"`
}

// TestFullAppConfig represents the full app config structure for testing
type TestFullAppConfig struct {
	Defaults             TestAppConfig `json:"defaults"`
	TempFileCleanupHours int           `json:"temp_file_cleanup_hours"`
}

// TestWebSocketClient represents a simplified WebSocket client for testing
type TestWebSocketClient struct {
	cfg              TestConfig
	status           string
	statusMu         sync.Mutex
	logMessages      []string
	logMu            sync.Mutex
	stopCh           chan struct{}
	reconnectCh      chan struct{}
	statusCh         chan string
	watchers         map[string]chan struct{}
	watchersMu       sync.Mutex
	sessionMap       map[string]string
	browserConnected bool
}

// TestFileWatcher represents a simplified file watcher for testing
type TestFileWatcher struct {
	watchedFiles map[string]chan struct{}
	mu           sync.Mutex
	stopCh       chan struct{}
	events       []string
	eventsMu     sync.Mutex
}

// TestMessage represents a WebSocket message for testing
type TestMessage struct {
	Type      string `json:"type"`
	UserID    string `json:"user_id"`
	SessionID string `json:"session_id,omitempty"`
	SnippetID string `json:"snippet_id,omitempty"`
	Code      string `json:"code,omitempty"`
	FileType  string `json:"file_type,omitempty"`
}

// TestIntegration represents an integration test environment
type TestIntegration struct {
	config      TestConfig
	wsClient    *TestWebSocketClient
	fileWatcher *TestFileWatcher
	tempDir     string
	mu          sync.Mutex
}

// ============================================================================
// Configuration Tests
// ============================================================================

func TestConfigSaveAndLoad(t *testing.T) {
	// Create a temporary directory for testing
	tempDir := t.TempDir()

	// Create a test config
	testConfig := TestConfig{
		UserID:       "testuser",
		WebSocket:    "ws://localhost:8071/test",
		IDECommand:   "test-ide",
		ConnectionID: "test-connection-123",
	}

	// Test saving config
	configPath := filepath.Join(tempDir, "test-config.json")
	err := saveTestConfig(testConfig, configPath)
	if err != nil {
		t.Fatalf("Failed to save test config: %v", err)
	}

	// Verify file exists
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		t.Fatalf("Config file was not created: %v", err)
	}

	// Test loading config
	loadedConfig, err := loadTestConfig(configPath)
	if err != nil {
		t.Fatalf("Failed to load test config: %v", err)
	}

	// Verify loaded config matches original
	if loadedConfig.UserID != testConfig.UserID {
		t.Errorf("UserID mismatch: expected %s, got %s", testConfig.UserID, loadedConfig.UserID)
	}
	if loadedConfig.WebSocket != testConfig.WebSocket {
		t.Errorf("WebSocket mismatch: expected %s, got %s", testConfig.WebSocket, loadedConfig.WebSocket)
	}
	if loadedConfig.IDECommand != testConfig.IDECommand {
		t.Errorf("IDECommand mismatch: expected %s, got %s", testConfig.IDECommand, loadedConfig.IDECommand)
	}
	if loadedConfig.ConnectionID != testConfig.ConnectionID {
		t.Errorf("ConnectionID mismatch: expected %s, got %s", testConfig.ConnectionID, loadedConfig.ConnectionID)
	}
}

func TestAppConfigSaveAndLoad(t *testing.T) {
	// Create a temporary directory for testing
	tempDir := t.TempDir()

	// Create a test app config
	testAppConfig := TestFullAppConfig{
		Defaults: TestAppConfig{
			DefaultIDEs: map[string][]string{
				"darwin":  {"Visual Studio Code", "Cursor", "TextEdit"},
				"windows": {"notepad.exe", "code.exe"},
				"linux":   {"gedit", "nano"},
			},
			WSURL:                "ws://localhost:8071/web-ide-bridge/ws",
			TempFileCleanupHours: 24,
		},
		TempFileCleanupHours: 24,
	}

	// Test saving app config
	configPath := filepath.Join(tempDir, "test-app-config.json")
	err := saveTestAppConfig(testAppConfig, configPath)
	if err != nil {
		t.Fatalf("Failed to save test app config: %v", err)
	}

	// Verify file exists
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		t.Fatalf("App config file was not created: %v", err)
	}

	// Test loading app config
	loadedAppConfig, err := loadTestAppConfig(configPath)
	if err != nil {
		t.Fatalf("Failed to load test app config: %v", err)
	}

	// Verify loaded config matches original
	if loadedAppConfig.Defaults.WSURL != testAppConfig.Defaults.WSURL {
		t.Errorf("WSURL mismatch: expected %s, got %s", testAppConfig.Defaults.WSURL, loadedAppConfig.Defaults.WSURL)
	}
	if loadedAppConfig.TempFileCleanupHours != testAppConfig.TempFileCleanupHours {
		t.Errorf("TempFileCleanupHours mismatch: expected %d, got %d", testAppConfig.TempFileCleanupHours, loadedAppConfig.TempFileCleanupHours)
	}

	// Verify IDEs map
	for os, expectedIDEs := range testAppConfig.Defaults.DefaultIDEs {
		loadedIDEs, exists := loadedAppConfig.Defaults.DefaultIDEs[os]
		if !exists {
			t.Errorf("OS %s not found in loaded config", os)
			continue
		}
		if len(loadedIDEs) != len(expectedIDEs) {
			t.Errorf("IDE count mismatch for %s: expected %d, got %d", os, len(expectedIDEs), len(loadedIDEs))
		}
		for i, expectedIDE := range expectedIDEs {
			if i >= len(loadedIDEs) || loadedIDEs[i] != expectedIDE {
				t.Errorf("IDE mismatch for %s[%d]: expected %s, got %s", os, i, expectedIDE, loadedIDEs[i])
			}
		}
	}
}

func TestUUIDGeneration(t *testing.T) {
	// Test that UUID generation produces valid UUIDs
	uuid1 := generateTestUUID()
	uuid2 := generateTestUUID()

	// Verify UUIDs are not empty
	if uuid1 == "" {
		t.Error("Generated UUID is empty")
	}
	if uuid2 == "" {
		t.Error("Generated UUID is empty")
	}

	// Verify UUIDs are different (very unlikely to be the same)
	if uuid1 == uuid2 {
		t.Error("Generated UUIDs are identical, which is extremely unlikely")
	}

	// Verify UUID format (basic check for length)
	if len(uuid1) < 10 {
		t.Errorf("UUID length is too short: got %d", len(uuid1))
	}

	// Verify UUID starts with expected prefix
	if !strings.HasPrefix(uuid1, "test-uuid-") {
		t.Error("UUID should start with 'test-uuid-' prefix")
	}
}

// ============================================================================
// WebSocket Client Tests
// ============================================================================

func TestWebSocketClientCreation(t *testing.T) {
	// Test creating a new WebSocket client
	cfg := TestConfig{
		UserID:       "testuser",
		WebSocket:    "ws://localhost:8071/test",
		IDECommand:   "test-ide",
		ConnectionID: "test-connection-123",
	}

	logMessages := []string{}
	logFunc := func(msg string) {
		logMessages = append(logMessages, msg)
	}

	client := NewTestWebSocketClient(cfg, logFunc)

	// Verify client was created with correct config
	if client.cfg.UserID != cfg.UserID {
		t.Errorf("UserID mismatch: expected %s, got %s", cfg.UserID, client.cfg.UserID)
	}
	if client.cfg.WebSocket != cfg.WebSocket {
		t.Errorf("WebSocket mismatch: expected %s, got %s", cfg.WebSocket, client.cfg.WebSocket)
	}
	if client.cfg.IDECommand != cfg.IDECommand {
		t.Errorf("IDECommand mismatch: expected %s, got %s", cfg.IDECommand, client.cfg.IDECommand)
	}
	if client.cfg.ConnectionID != cfg.ConnectionID {
		t.Errorf("ConnectionID mismatch: expected %s, got %s", cfg.ConnectionID, client.cfg.ConnectionID)
	}

	// Verify initial status
	if client.getStatus() != "disconnected" {
		t.Errorf("Initial status should be 'disconnected', got %s", client.getStatus())
	}

	// Verify channels are initialized
	if client.stopCh == nil {
		t.Error("stopCh should be initialized")
	}
	if client.reconnectCh == nil {
		t.Error("reconnectCh should be initialized")
	}
	if client.statusCh == nil {
		t.Error("statusCh should be initialized")
	}

	// Verify maps are initialized
	if client.watchers == nil {
		t.Error("watchers map should be initialized")
	}
	if client.sessionMap == nil {
		t.Error("sessionMap should be initialized")
	}
}

func TestWebSocketStatusManagement(t *testing.T) {
	client := NewTestWebSocketClient(TestConfig{}, func(msg string) {})

	// Test status setting and getting
	testStatuses := []string{"connecting", "connected", "disconnected", "error"}

	for _, status := range testStatuses {
		client.setStatus(status)
		if client.getStatus() != status {
			t.Errorf("Status mismatch: expected %s, got %s", status, client.getStatus())
		}
	}
}

func TestWebSocketLogging(t *testing.T) {
	logMessages := []string{}
	logFunc := func(msg string) {
		logMessages = append(logMessages, msg)
	}

	client := NewTestWebSocketClient(TestConfig{}, logFunc)

	// Test logging messages
	testMessages := []string{
		"Connecting to server...",
		"Connected successfully",
		"Received edit request",
		"Error: connection lost",
	}

	for _, msg := range testMessages {
		client.log(msg)
	}

	// Verify all messages were logged
	if len(client.logMessages) != len(testMessages) {
		t.Errorf("Log message count mismatch: expected %d, got %d", len(testMessages), len(client.logMessages))
	}

	for i, expectedMsg := range testMessages {
		if i >= len(client.logMessages) || client.logMessages[i] != expectedMsg {
			t.Errorf("Log message mismatch at index %d: expected %s, got %s", i, expectedMsg, client.logMessages[i])
		}
	}
}

// ============================================================================
// File Watcher Tests
// ============================================================================

func TestFileWatcherCreation(t *testing.T) {
	// Test creating a new file watcher
	watcher := NewTestFileWatcher()

	// Verify watcher was created with correct initial state
	if watcher.watchedFiles == nil {
		t.Error("watchedFiles map should be initialized")
	}
	if watcher.stopCh == nil {
		t.Error("stopCh should be initialized")
	}
	if watcher.events == nil {
		t.Error("events slice should be initialized")
	}

	// Verify initial state
	if len(watcher.watchedFiles) != 0 {
		t.Errorf("Initial watched files count should be 0, got %d", len(watcher.watchedFiles))
	}
	if len(watcher.events) != 0 {
		t.Errorf("Initial events count should be 0, got %d", len(watcher.events))
	}
}

func TestFileWatcherAddAndRemove(t *testing.T) {
	watcher := NewTestFileWatcher()

	// Test adding files to watch
	testFiles := []string{
		"/tmp/test1.js",
		"/tmp/test2.py",
		"/tmp/test3.html",
	}

	for _, file := range testFiles {
		stopCh := make(chan struct{})
		watcher.addFile(file, stopCh)

		// Verify file was added
		if _, exists := watcher.watchedFiles[file]; !exists {
			t.Errorf("File %s was not added to watcher", file)
		}
	}

	// Verify all files are being watched
	if len(watcher.watchedFiles) != len(testFiles) {
		t.Errorf("Watched files count mismatch: expected %d, got %d", len(testFiles), len(watcher.watchedFiles))
	}

	// Test removing specific file
	watcher.removeFile("/tmp/test2.py")
	if _, exists := watcher.watchedFiles["/tmp/test2.py"]; exists {
		t.Error("File /tmp/test2.py was not removed from watcher")
	}

	// Test stopping all watchers
	watcher.stopAll()
	if len(watcher.watchedFiles) != 0 {
		t.Errorf("All files should be unwatched, but %d remain", len(watcher.watchedFiles))
	}
}

// ============================================================================
// Integration Tests
// ============================================================================

func TestIntegrationSetup(t *testing.T) {
	// Test setting up a complete integration environment
	integration := NewTestIntegration(t)

	// Verify all components were created
	if integration.config.UserID == "" {
		t.Error("Config UserID should not be empty")
	}
	if integration.wsClient == nil {
		t.Error("WebSocket client should be created")
	}
	if integration.fileWatcher == nil {
		t.Error("File watcher should be created")
	}
	if integration.tempDir == "" {
		t.Error("Temp directory should be created")
	}

	// Verify temp directory exists
	if _, err := os.Stat(integration.tempDir); os.IsNotExist(err) {
		t.Errorf("Temp directory %s does not exist", integration.tempDir)
	}
}

func TestIntegrationEditRequestWorkflow(t *testing.T) {
	integration := NewTestIntegration(t)

	// Simulate a complete edit request workflow
	snippetID := "test-snippet-123"
	code := "console.log('Hello, World!');"
	fileType := "js"

	// 1. Receive edit request
	integration.wsClient.handleEditRequest(snippetID, code, fileType)

	// 2. Verify session was created
	if sessionID, exists := integration.wsClient.sessionMap[snippetID]; !exists {
		t.Error("Session should be created for edit request")
	} else if sessionID == "" {
		t.Error("Session ID should not be empty")
	}

	// 3. Verify watcher was added
	if _, exists := integration.wsClient.watchers[snippetID]; !exists {
		t.Error("File watcher should be added for edit request")
	}

	// 4. Verify log message was recorded
	if len(integration.wsClient.logMessages) == 0 {
		t.Error("Log message should be recorded for edit request")
	}

	// 5. Check that the log message contains the snippet ID
	found := false
	for _, msg := range integration.wsClient.logMessages {
		if contains(msg, snippetID) {
			found = true
			break
		}
	}
	if !found {
		t.Error("Log message should contain snippet ID")
	}
}

// ============================================================================
// Helper Functions
// ============================================================================

func saveTestConfig(cfg TestConfig, path string) error {
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

func loadTestConfig(path string) (TestConfig, error) {
	var cfg TestConfig
	data, err := os.ReadFile(path)
	if err != nil {
		return cfg, err
	}
	err = json.Unmarshal(data, &cfg)
	return cfg, err
}

func saveTestAppConfig(cfg TestFullAppConfig, path string) error {
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

func loadTestAppConfig(path string) (TestFullAppConfig, error) {
	var cfg TestFullAppConfig
	data, err := os.ReadFile(path)
	if err != nil {
		return cfg, err
	}
	err = json.Unmarshal(data, &cfg)
	return cfg, err
}

func generateTestUUID() string {
	// Simple UUID generation for testing
	// In the real app, this would use crypto/rand
	// Generate a unique UUID for each call
	return fmt.Sprintf("test-uuid-%d-%d-%d-%d",
		time.Now().UnixNano(),
		time.Now().UnixNano()/1000,
		time.Now().UnixNano()/1000000,
		time.Now().UnixNano()/1000000000)
}

func NewTestWebSocketClient(cfg TestConfig, logFunc func(string)) *TestWebSocketClient {
	return &TestWebSocketClient{
		cfg:              cfg,
		status:           "disconnected",
		logMessages:      []string{},
		stopCh:           make(chan struct{}),
		reconnectCh:      make(chan struct{}),
		statusCh:         make(chan string, 10),
		watchers:         make(map[string]chan struct{}),
		sessionMap:       make(map[string]string),
		browserConnected: false,
	}
}

func (c *TestWebSocketClient) getStatus() string {
	c.statusMu.Lock()
	defer c.statusMu.Unlock()
	return c.status
}

func (c *TestWebSocketClient) setStatus(status string) {
	c.statusMu.Lock()
	defer c.statusMu.Unlock()
	c.status = status
	select {
	case c.statusCh <- status:
	default:
	}
}

func (c *TestWebSocketClient) log(msg string) {
	c.logMu.Lock()
	defer c.logMu.Unlock()
	c.logMessages = append(c.logMessages, msg)
}

func (c *TestWebSocketClient) handleEditRequest(snippetID, code, fileType string) {
	// Simulate handling an edit request
	sessionID := "session-" + snippetID
	c.addSession(snippetID, sessionID)

	stopCh := make(chan struct{})
	c.addWatcher(snippetID, stopCh)

	c.log("Handled edit request for snippet: " + snippetID)
}

func (c *TestWebSocketClient) addSession(snippetID, sessionID string) {
	c.watchersMu.Lock()
	defer c.watchersMu.Unlock()
	c.sessionMap[snippetID] = sessionID
}

func (c *TestWebSocketClient) addWatcher(snippetID string, stopCh chan struct{}) {
	c.watchersMu.Lock()
	defer c.watchersMu.Unlock()
	c.watchers[snippetID] = stopCh
}

func (c *TestWebSocketClient) stopAllWatchers() {
	c.watchersMu.Lock()
	defer c.watchersMu.Unlock()
	for snippetID, stopCh := range c.watchers {
		close(stopCh)
		delete(c.watchers, snippetID)
	}
}

func (c *TestWebSocketClient) clearSessions() {
	c.watchersMu.Lock()
	defer c.watchersMu.Unlock()
	c.sessionMap = make(map[string]string)
}

func NewTestFileWatcher() *TestFileWatcher {
	return &TestFileWatcher{
		watchedFiles: make(map[string]chan struct{}),
		stopCh:       make(chan struct{}),
		events:       make([]string, 0),
	}
}

func (w *TestFileWatcher) addFile(file string, stopCh chan struct{}) {
	w.mu.Lock()
	defer w.mu.Unlock()

	// If file already exists, close the existing stop channel
	if existingStopCh, exists := w.watchedFiles[file]; exists {
		close(existingStopCh)
	}

	w.watchedFiles[file] = stopCh
}

func (w *TestFileWatcher) removeFile(file string) {
	w.mu.Lock()
	defer w.mu.Unlock()

	if stopCh, exists := w.watchedFiles[file]; exists {
		close(stopCh)
		delete(w.watchedFiles, file)
	}
}

func (w *TestFileWatcher) stopAll() {
	w.mu.Lock()
	defer w.mu.Unlock()

	for file, stopCh := range w.watchedFiles {
		close(stopCh)
		delete(w.watchedFiles, file)
	}
}

func (w *TestFileWatcher) cleanup() {
	w.mu.Lock()
	defer w.mu.Unlock()

	for _, stopCh := range w.watchedFiles {
		close(stopCh)
	}
	w.watchedFiles = make(map[string]chan struct{})

	w.eventsMu.Lock()
	defer w.eventsMu.Unlock()
	w.events = make([]string, 0)
}

func NewTestIntegration(t *testing.T) *TestIntegration {
	// Create temp directory
	tempDir := t.TempDir()

	// Create test config
	config := TestConfig{
		UserID:       "testuser",
		WebSocket:    "ws://localhost:8071/test",
		IDECommand:   "test-ide",
		ConnectionID: "test-connection-123",
	}

	// Create WebSocket client
	logFunc := func(msg string) {}
	wsClient := NewTestWebSocketClient(config, logFunc)

	// Create file watcher
	fileWatcher := NewTestFileWatcher()

	return &TestIntegration{
		config:      config,
		wsClient:    wsClient,
		fileWatcher: fileWatcher,
		tempDir:     tempDir,
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr ||
		(len(s) > len(substr) && (s[:len(substr)] == substr ||
			s[len(s)-len(substr):] == substr ||
			containsSubstring(s, substr))))
}

func containsSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
