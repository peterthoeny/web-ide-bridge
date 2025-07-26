// Web-IDE-Bridge Version Configuration
// Update this file to bump the version across the entire project

const VERSION = '1.0.0';

module.exports = {
  VERSION,
  // Helper functions for different version formats
  getVersion: () => VERSION,
  getVersionWithV: () => `v${VERSION}`,
  getVersionBadge: () => `![Version](https://img.shields.io/badge/version-${VERSION}-blue)`,
  getVersionShield: () => `https://img.shields.io/badge/version-${VERSION}-blue`
}; 