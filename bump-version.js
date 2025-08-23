#!/usr/bin/env node

/**
 * @name            Web-IDE-Bridge / Build
 * @tagline         Version bump script for Web-IDE-Bridge
 * @description     Updates version numbers and release dates across all source files
 * @file            bump-version.js
 * @version         1.1.6
 * @release         2025-08-23
 * @repository      https://github.com/peterthoeny/web-ide-bridge
 * @author          Peter Thoeny, https://twiki.org & https://github.com/peterthoeny/
 * @copyright       2025 Peter Thoeny, https://twiki.org & https://github.com/peterthoeny/
 * @license         GPL v3, see LICENSE file
 * @genai           99%, Cursor 1.2, Claude Sonnet 4
 */

const conf = {
    // Explicit file patterns for each directory of interest
    filePatterns: [
        // Root level files
        'package.json',
        'README.md',
        'developer_context.md',
        'bump-version.js',

        // Browser directory
        'browser/*.js',
        'browser/*.html',
        'browser/package.json',

        // Server directory
        'server/*.js',
        'server/package.json',

        // Desktop directory
        'desktop/*.go',
        'desktop/*.sh',
        'desktop/*.conf',

        // Tests directory - specific files and patterns
        'tests/browser/*.js',
        'tests/e2e/*.js',
        'tests/server/*.js',
        'tests/utils/*.js',
        'tests/*.js',
        'tests/desktop/*.go'
    ],

    // Specific file update patterns for version/content replacement
    fileUpdateRules: [
        // Root level files
        {
            pattern: 'package.json',
            replacements: [
                { from: /"version": "[\d.]+"/, to: (version) => `"version": "${version}"` }
            ]
        },
        {
            pattern: 'README.md',
            replacements: [
                { from: /# Web-IDE-Bridge v[\d.]+/, to: (version) => `# Web-IDE-Bridge v${version}` },
                { from: /version-[\d.]+-blue/, to: (version) => `version-${version}-blue` }
            ]
        },
        {
            pattern: 'developer_context.md',
            replacements: [
                { from: /# Web-IDE-Bridge Technical Implementation Guide v[\d.]+/, to: (version) => `# Web-IDE-Bridge Technical Implementation Guide v${version}` }
            ]
        },
        // Browser directory
        {
            pattern: 'browser/package.json',
            replacements: [
                { from: /"version": "[\d.]+"/, to: (version) => `"version": "${version}"` }
            ]
        },
        {
            pattern: 'browser/version.js',
            replacements: [
                { from: /const VERSION = '[\d.]+'/, to: (version) => `const VERSION = '${version}'` }
            ]
        },
        {
            pattern: 'browser/web-ide-bridge.js',
            replacements: [
                { from: /\* Web-IDE-Bridge v[\d.]+/, to: (version) => `* Web-IDE-Bridge v${version}` }
            ]
        },
        {
            pattern: 'browser/web-ide-bridge.min.js',
            replacements: [
                { from: /\* Web-IDE-Bridge v[\d.]+/, to: (version) => `* Web-IDE-Bridge v${version}` }
            ]
        },
        {
            pattern: 'browser/demo.html',
            replacements: [
                { from: /<span class="version">v[\d.]+<\/span>/, to: (version) => `<span class="version">v${version}</span>` }
            ]
        },
        {
            pattern: 'browser/index.html',
            replacements: [
                { from: /<span class="version">v[\d.]+<\/span>/, to: (version) => `<span class="version">v${version}</span>` }
            ]
        },
        {
            pattern: 'browser/jquery-demo.html',
            replacements: [
                { from: /<span class="version">v[\d.]+<\/span>/, to: (version) => `<span class="version">v${version}</span>` }
            ]
        },
        // Server directory
        {
            pattern: 'server/package.json',
            replacements: [
                { from: /"version": "[\d.]+"/, to: (version) => `"version": "${version}"` }
            ]
        },
        {
            pattern: 'server/version.js',
            replacements: [
                { from: /const VERSION = '[\d.]+'/, to: (version) => `const VERSION = '${version}'` }
            ]
        },
        {
            pattern: 'server/web-ide-bridge-server.js',
            replacements: [
                { from: /const VERSION = '[\d.]+'/, to: (version) => `const VERSION = '${version}'` }
            ]
        },
        // Desktop directory
        {
            pattern: 'desktop/web-ide-bridge.go',
            replacements: [
                { from: /Version = "[\d.]+"/, to: (version) => `Version = "${version}"` }
            ]
        },
        // Test files
        {
            pattern: 'tests/server/server.test.js',
            replacements: [
                { from: /expect\(data\.version\)\.toBe\('[\d.]+'\)/g, to: (version) => `expect(data.version).toBe('${version}')` }
            ]
        },
        {
            pattern: 'tests/server/basic.test.js',
            replacements: [
                { from: /expect\(data\.version\)\.toBe\('[\d.]+'\)/g, to: (version) => `expect(data.version).toBe('${version}')` }
            ]
        }
    ],

    // Header update patterns for source files
    headerUpdatePatterns: {
        version: /([\*#] @version\s+)[\d.]+/, // Captures comment prefix: * @version or # @version
        release: /([\*#] @release\s+)[\d-]+/  // Captures comment prefix: * @release or # @release
    }
};

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

// Configuration moved to conf object above

let updatedFiles = 0;
let errors = 0;

// Function to match file against pattern (simple glob-like matching)
function matchesPattern(filePath, pattern) {
    // Convert glob pattern to regex
    const regex = pattern
        .replace(/\*\*/g, '.*')      // ** matches any characters including /
        .replace(/\*/g, '[^/]*')     // * matches any characters except /
        .replace(/\./g, '\\.');      // Escape dots

    return new RegExp(`^${regex}$`).test(filePath);
}

// Function to discover files recursively
function discoverFiles(dir = '.') {
    const files = [];
    function scanDirectory(currentDir) {
        try {
            const entries = fs.readdirSync(currentDir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);
                const relativePath = path.relative('.', fullPath).replace(/\\/g, '/'); // Normalize path separators
                if (entry.isDirectory()) {
                    scanDirectory(fullPath);
                } else if (entry.isFile()) {
                    // Check if file matches any pattern
                    const shouldInclude = conf.filePatterns.some(pattern => 
                        matchesPattern(relativePath, pattern)
                    );
                    if (shouldInclude) {
                        files.push(relativePath);
                    }
                }
            }
        } catch (error) {
            console.error(`❌ Error scanning directory ${currentDir}:`, error.message);
        }
    }
    scanDirectory(dir);
    return files;
}

// Function to update file content based on rules
function updateFileContent(filePath, content) {
    let updatedContent = content;
    let hasChanges = false;

    // Find matching update rules
    const matchingRules = conf.fileUpdateRules.filter(rule => 
        matchesPattern(filePath, rule.pattern)
    );
    for (const rule of matchingRules) {
        for (const replacement of rule.replacements) {
            const newContent = updatedContent.replace(replacement.from, replacement.to(newVersion));
            if (newContent !== updatedContent) {
                updatedContent = newContent;
                hasChanges = true;
            }
        }
    }
    return { content: updatedContent, hasChanges };
}

// Function to update headers in source files
function updateFileHeaders(filePath, content) {
    let updatedContent = content;
    let hasChanges = false;

    // Update version in header using capture group
    if (conf.headerUpdatePatterns.version.test(updatedContent)) {
        updatedContent = updatedContent.replace(
            conf.headerUpdatePatterns.version, 
            '$1' + newVersion
        );
        hasChanges = true;
    }

    // Update release date in header using capture group
    if (conf.headerUpdatePatterns.release.test(updatedContent)) {
        updatedContent = updatedContent.replace(
            conf.headerUpdatePatterns.release, 
            '$1' + newDate
        );
        hasChanges = true;
    }

    return { content: updatedContent, hasChanges };
}

// Main processing function
function processFiles() {
    console.log('🔍 Discovering files...');
    const discoveredFiles = discoverFiles();
    console.log(`📁 Found ${discoveredFiles.length} files to process`);
    for (const filePath of discoveredFiles) {
        try {
            if (!fs.existsSync(filePath)) {
                continue;
            }
            const originalContent = fs.readFileSync(filePath, 'utf8');
            let { content: updatedContent, hasChanges: contentChanged } = updateFileContent(filePath, originalContent);
            let { content: finalContent, hasChanges: headerChanged } = updateFileHeaders(filePath, updatedContent);
            const hasAnyChanges = contentChanged || headerChanged;
            if (hasAnyChanges) {
                fs.writeFileSync(filePath, finalContent, 'utf8');
                console.log(`✅ Updated: ${filePath}`);
                updatedFiles++;
            } else {
                console.log(`ℹ️  No changes needed: ${filePath}`);
            }
        } catch (error) {
            console.error(`❌ Error processing ${filePath}:`, error.message);
            errors++;
        }
    }
}

// Execute the main process
processFiles();

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
