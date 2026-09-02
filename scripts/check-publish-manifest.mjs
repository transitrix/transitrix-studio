#!/usr/bin/env node
// Publish manifest check — validates that PR changes only touch declared files.
//
// Fails if a PR adds or modifies a file not covered by the publish-manifest.yaml
// declaration. Declared paths are matched as literal prefixes; ** globs match
// any directory depth.

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import * as YAML from 'yaml';

const TAG = 'publish-manifest';

// Read and parse the publish manifest
let manifest;
try {
  const content = readFileSync('publish-manifest.yaml', 'utf8');
  manifest = YAML.parse(content);
} catch (err) {
  console.error(`[${TAG}] Failed to read publish-manifest.yaml:`, err.message);
  process.exit(2);
}

if (!manifest || !Array.isArray(manifest.published)) {
  console.error(`[${TAG}] publish-manifest.yaml must contain a 'published' array.`);
  process.exit(2);
}

// Helper: test if a file path matches a declared pattern
// Patterns can be:
//   - literal files: "README.md"
//   - directories: "extension/" (trailing slash)
//   - glob patterns: "extension/**" or "packages/*/src"
function pathMatches(filePath, pattern) {
  if (pattern === filePath) return true;
  // Pattern with ** matches any depth
  if (pattern.includes('**')) {
    const [prefix, suffix] = pattern.split('**');
    return filePath.startsWith(prefix.replace(/\/$/, ''));
  }
  // Pattern ending with / matches directory and contents
  if (pattern.endsWith('/')) {
    return filePath.startsWith(pattern);
  }
  // Prefix match for directory-like patterns without trailing slash
  if (filePath.startsWith(pattern + '/')) {
    return true;
  }
  return false;
}

// Get the PR's changed files from git
const baseSha = process.env.BASE_SHA;
const headSha = process.env.HEAD_SHA;

if (!baseSha || !headSha) {
  console.warn(`[${TAG}] BASE_SHA/HEAD_SHA not set — skipping check. (run from pull_request workflow)`);
  process.exit(0);
}

let addedFiles = [];
try {
  const output = execSync(`git diff --name-only --diff-filter=A ${baseSha}..${headSha}`, {
    encoding: 'utf8',
  }).trim();
  addedFiles = output ? output.split('\n').filter(f => f.length > 0) : [];
} catch (err) {
  console.error(`[${TAG}] failed to get added files:`, err.message);
  process.exit(2);
}

if (addedFiles.length === 0) {
  console.log(`[${TAG}] no new files in PR — check passes.`);
  process.exit(0);
}

// Check each added file against declared patterns
const undeclared = [];
for (const file of addedFiles) {
  const matches = manifest.published.some(pattern => pathMatches(file, pattern));
  if (!matches) {
    undeclared.push(file);
  }
}

if (undeclared.length === 0) {
  console.log(`[${TAG}] all new files are declared in publish-manifest.yaml — check passes.`);
  process.exit(0);
}

console.error(`[${TAG}] undeclared files detected in pull request.`);
console.error(`[${TAG}] Files must be listed in publish-manifest.yaml before they can be published.`);
for (const file of undeclared) {
  console.error(`  - ${file}`);
}
process.exit(1);
