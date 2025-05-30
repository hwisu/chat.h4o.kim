#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Get Git hash and build timestamp
function getGitHash() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch (error) {
    console.warn('Warning: Could not get Git hash, using fallback');
    return 'unknown';
  }
}

function getBuildTimestamp() {
  return Date.now().toString();
}

// Update HTML and Service Worker with version info
function updateVersionInfo() {
  const htmlPath = path.join(__dirname, '../public/index.html');
  const swPath = path.join(__dirname, '../public/sw.js');
  const gitHash = getGitHash();
  const timestamp = getBuildTimestamp();

  console.log(`🔧 Injecting version info: ${gitHash} (${new Date(parseInt(timestamp)).toISOString()})`);

  // Update HTML file
  let html = fs.readFileSync(htmlPath, 'utf8');
  html = html.replace(
    /<meta name="app-version" content="[^"]*">/,
    `<meta name="app-version" content="${gitHash}">`
  );
  html = html.replace(
    /<meta name="build-timestamp" content="[^"]*">/,
    `<meta name="build-timestamp" content="${timestamp}">`
  );
  fs.writeFileSync(htmlPath, html);

  // Update Service Worker file
  let swContent = fs.readFileSync(swPath, 'utf8');
  swContent = swContent.replace(
    /const CURRENT_VERSION = '[^']*';/,
    `const CURRENT_VERSION = '${gitHash}';`
  );
  swContent = swContent.replace(
    /const CACHE_NAME = 'terminal-chat-v[^']*';/,
    `const CACHE_NAME = 'terminal-chat-v${gitHash}';`
  );
  swContent = swContent.replace(
    /const STATIC_CACHE_NAME = 'terminal-chat-static-v[^']*';/,
    `const STATIC_CACHE_NAME = 'terminal-chat-static-v${gitHash}';`
  );
  swContent = swContent.replace(
    /const API_CACHE_NAME = 'terminal-chat-api-v[^']*';/,
    `const API_CACHE_NAME = 'terminal-chat-api-v${gitHash}';`
  );
  fs.writeFileSync(swPath, swContent);

  console.log(`✅ Version info updated: ${gitHash}`);
  console.log(`📦 Cache names updated with version: ${gitHash}`);
}

// Main execution
if (require.main === module) {
  updateVersionInfo();
}

module.exports = { updateVersionInfo, getGitHash, getBuildTimestamp };
