#!/usr/bin/env node

/**
 * Web-IDE-Bridge Version Bump Script
 * 
 * Usage: node bump-version.js <new-version>
 * Example: node bump-version.js 1.0.1
 */

const fs = require('fs');
const path = require('path');

const newVersion = process.argv[2];

if (!newVersion) {
  console.error('❌ Please provide a new version number');
  console.error('Usage: node bump-version.js <new-version>');
  console.error('Example: node bump-version.js 1.0.1');
  process.exit(1);
}

// Validate version format (simple check)
if (!/^\d+\.\d+\.\d+$/.test(newVersion)) {
  console.error('❌ Invalid version format. Use semantic versioning (e.g., 1.0.1)');
  process.exit(1);
}

console.log(`🚀 Bumping version to ${newVersion}...`);

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
      { from: /\* Web-IDE-Bridge v[\d.]+/, to: `* Web-IDE-Bridge v${newVersion}` },
      { from: /^/, to: `/**
 * Web-IDE-Bridge v${newVersion}
 * Browser library for seamless IDE integration
 * 
 * This is the production build (minified).
 */
` }
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
  }
];

let updatedFiles = 0;
let errors = 0;

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