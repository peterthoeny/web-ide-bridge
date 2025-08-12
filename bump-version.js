#!/usr/bin/env node

/**
 * @name            Web-IDE-Bridge / Build
 * @tagline         Version bump script for Web-IDE-Bridge
 * @description     Updates version numbers and release dates across all source files
 * @file            bump-version.js
 * @version         1.1.5
 * @release         2025-08-11
 * @repository      https://github.com/peterthoeny/web-ide-bridge
 * @author          Peter Thoeny, https://twiki.org & https://github.com/peterthoeny/
 * @copyright       2025 Peter Thoeny, https://twiki.org & https://github.com/peterthoeny/
 * @license         GPL v3, see LICENSE file
 * @genai           99%, Cursor 1.2, Claude Sonnet 4
 */

const fs = require('fs');
const path = require('path');

const newVersion = process.argv[2];
const providedDate = process.argv[3];
const newDate = providedDate || new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

if (!newVersion) {
  console.error('❌ Please provide a new version number');
  console.error('Usage: node bump-version.js <new-version> [new-date]');
  console.error('Example: node bump-version.js 1.0.1');
  console.error('Example: node bump-version.js 1.0.1 2025-01-27');
  console.error('Note: If no date is provided, today\'s date will be used automatically');
  process.exit(1);
}

// Show what date is being used
if (!providedDate) {
  console.log(`📅 No date provided, using today's date: ${newDate}`);
}

// Validate version format (simple check)
if (!/^\d+\.\d+\.\d+$/.test(newVersion)) {
  console.error('❌ Invalid version format. Use semantic versioning (e.g., 1.0.1)');
  process.exit(1);
}

// Validate date format (YYYY-MM-DD)
if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
  console.error('❌ Invalid date format. Use YYYY-MM-DD format (e.g., 2025-01-27)');
  process.exit(1);
}

console.log(`🚀 Bumping version to ${newVersion} with release date ${newDate}...`);

// Files to update with their patterns
const filesToUpdate = [
  {
    file: 'server/version.js',
    patterns: [
      { from: /const VERSION = '[\d.]+'/, to: `const VERSION = '${newVersion}'` }
    ]
  },
  {
    file: 'browser/version.js',
    patterns: [
      { from: /const VERSION = '[\d.]+'/, to: `const VERSION = '${newVersion}'` }
    ]
  },
  {
    file: 'package.json',
    patterns: [
      { from: /"version": "[\d.]+"/, to: `"version": "${newVersion}"` }
    ]
  },
  {
    file: 'browser/package.json',
    patterns: [
      { from: /"version": "[\d.]+"/, to: `"version": "${newVersion}"` }
    ]
  },
  {
    file: 'server/package.json',
    patterns: [
      { from: /"version": "[\d.]+"/, to: `"version": "${newVersion}"` }
    ]
  },
  {
    file: 'README.md',
    patterns: [
      { from: /# Web-IDE-Bridge v[\d.]+/, to: `# Web-IDE-Bridge v${newVersion}` },
      { from: /version-[\d.]+-blue/, to: `version-${newVersion}-blue` }
    ]
  },
  {
    file: 'developer_context.md',
    patterns: [
      { from: /# Web-IDE-Bridge Technical Implementation Guide v[\d.]+/, to: `# Web-IDE-Bridge Technical Implementation Guide v${newVersion}` }
    ]
  },
  {
    file: 'browser/web-ide-bridge.js',
    patterns: [
      { from: /\* Web-IDE-Bridge v[\d.]+/, to: `* Web-IDE-Bridge v${newVersion}` }
    ]
  },
  {
    file: 'browser/web-ide-bridge.min.js',
    patterns: [
      // Only update an existing header if present; do NOT inject a new
      // preamble into the minified file to avoid duplicate comment blocks
      { from: /\* Web-IDE-Bridge v[\d.]+/, to: `* Web-IDE-Bridge v${newVersion}` }
    ]
  },
  {
    file: 'browser/index.html',
    patterns: [
      { from: /<span class="version">v[\d.]+<\/span>/, to: `<span class="version">v${newVersion}</span>` }
    ]
  },
  {
    file: 'browser/demo.html',
    patterns: [
      { from: /<span class="version">v[\d.]+<\/span>/, to: `<span class="version">v${newVersion}</span>` }
    ]
  },
  {
    file: 'browser/jquery-demo.html',
    patterns: [
      { from: /<span class="version">v[\d.]+<\/span>/, to: `<span class="version">v${newVersion}</span>` }
    ]
  },
  {
    file: 'tests/server/server.test.js',
    patterns: [
      { from: /expect\(data\.version\)\.toBe\('[\d.]+'\)/g, to: `expect(data.version).toBe('${newVersion}')` }
    ]
  },
  {
    file: 'tests/server/basic.test.js',
    patterns: [
      { from: /expect\(data\.version\)\.toBe\('[\d.]+'\)/g, to: `expect(data.version).toBe('${newVersion}')` }
    ]
  },
  {
    file: 'desktop/web-ide-bridge.go',
    patterns: [
      { from: /Version = "[\d.]+"/, to: `Version = "${newVersion}"` }
    ]
  }
];

// Source files with headers to update (version and release date)
const sourceFilesWithHeaders = [
  // JavaScript files
  'bump-version.js',
  'browser/web-ide-bridge.js',
  'browser/web-ide-bridge.min.js',
  'browser/version.js',
  'server/web-ide-bridge-server.js',
  'server/version.js',
  'tests/browser/browser-test-runner.js',
  'tests/browser/built-library.test.js',
  'tests/browser/simple-browser.test.js',
  'tests/e2e/full-workflow.test.js',
  'tests/run-server-tests.js',
  'tests/server/basic.test.js',
  'tests/server/edge-cases.test.js',
  'tests/server/performance.test.js',
  'tests/server/quick-test.js',
  'tests/server/server.test.js',
  'tests/server/setup-server.js',
  'tests/server/simple-import.test.js',
  'tests/server/validation.test.js',
  'tests/utils/websocket-utils.js',
  // Go files
  'desktop/web-ide-bridge.go',
  'tests/desktop/desktop_test.go',
  // Shell scripts
  'desktop/build.sh'
];

let updatedFiles = 0;
let errors = 0;

// Function to update headers in source files
function updateSourceFileHeaders() {
  sourceFilesWithHeaders.forEach(file => {
    try {
      if (!fs.existsSync(file)) {
        console.log(`⚠️  File not found: ${file}`);
        return;
      }

      let content = fs.readFileSync(file, 'utf8');
      let fileUpdated = false;

      // Update version in header
      const versionPattern = /\* @version\s+[\d.]+/;
      if (versionPattern.test(content)) {
        content = content.replace(versionPattern, `* @version         ${newVersion}`);
        fileUpdated = true;
      }

      // Update release date in header
      const releasePattern = /\* @release\s+[\d-]+/;
      if (releasePattern.test(content)) {
        content = content.replace(releasePattern, `* @release         ${newDate}`);
        fileUpdated = true;
      }

      if (fileUpdated) {
        fs.writeFileSync(file, content, 'utf8');
        console.log(`✅ Updated headers: ${file}`);
        updatedFiles++;
      } else {
        console.log(`ℹ️  No header changes needed: ${file}`);
      }
    } catch (error) {
      console.error(`❌ Error updating headers in ${file}:`, error.message);
      errors++;
    }
  });
}

// Update regular files
filesToUpdate.forEach(({ file, patterns }) => {
  try {
    if (!fs.existsSync(file)) {
      console.log(`⚠️  File not found: ${file}`);
      return;
    }

    let content = fs.readFileSync(file, 'utf8');
    let fileUpdated = false;

    patterns.forEach(({ from, to }) => {
      const newContent = content.replace(from, to);
      if (newContent !== content) {
        content = newContent;
        fileUpdated = true;
      }
    });

    if (fileUpdated) {
      fs.writeFileSync(file, content, 'utf8');
      console.log(`✅ Updated: ${file}`);
      updatedFiles++;
    } else {
      console.log(`ℹ️  No changes needed: ${file}`);
    }
  } catch (error) {
    console.error(`❌ Error updating ${file}:`, error.message);
    errors++;
  }
});

// Update source file headers
console.log('\n📝 Updating source file headers...');
updateSourceFileHeaders();

console.log('\n📊 Summary:');
console.log(`✅ Files updated: ${updatedFiles}`);
if (errors > 0) {
  console.log(`❌ Errors: ${errors}`);
}

if (errors === 0) {
  console.log('\n🎉 Version bump completed successfully!');
  console.log(`📝 Don't forget to:`);
  console.log(`   - Run tests: npm test`);
  console.log(`   - Update CHANGELOG.md (if you have one)`);
  console.log(`   - Commit changes: git add . && git commit -m "Bump version to ${newVersion}"`);
  console.log(`   - Tag release: git tag v${newVersion}`);
} else {
  console.log('\n⚠️  Version bump completed with errors. Please review the output above.');
  process.exit(1);
}
