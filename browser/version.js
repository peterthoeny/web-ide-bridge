/**
 * @name            Web-IDE-Bridge / Browser
 * @tagline         Component of Web-IDE-Bridge library for seamless IDE integration
 * @description     Version configuration for the browser component
 * @file            browser/version.js
 * @version         1.1.5
 * @release         2025-08-11
 * @repository      https://github.com/peterthoeny/web-ide-bridge
 * @author          Peter Thoeny, https://twiki.org & https://github.com/peterthoeny/
 * @copyright       2025 Peter Thoeny, https://twiki.org & https://github.com/peterthoeny/
 * @license         GPL v3, see LICENSE file
 * @genai           99%, Cursor 1.2, Claude Sonnet 4
 */

const VERSION = '1.1.5';

module.exports = {
  VERSION,
  // Helper functions for different version formats
  getVersion: () => VERSION,
  getVersionWithV: () => `v${VERSION}`,
  getVersionBadge: () => `![Version](https://img.shields.io/badge/version-${VERSION}-blue)`,
  getVersionShield: () => `https://img.shields.io/badge/version-${VERSION}-blue`
};
