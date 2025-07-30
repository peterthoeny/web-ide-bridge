// Web-IDE-Bridge Server Version Configuration
// Update this file to bump the version for the server component

const VERSION = '1.1.3';

module.exports = {
  VERSION,
  // Helper functions for different version formats
  getVersion: () => VERSION,
  getVersionWithV: () => `v${VERSION}`,
  getVersionBadge: () => `![Version](https://img.shields.io/badge/version-${VERSION}-blue)`,
  getVersionShield: () => `https://img.shields.io/badge/version-${VERSION}-blue`
};
