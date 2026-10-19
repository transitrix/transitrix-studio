#!/usr/bin/env node
// Scan the complete tracked public repository. Diagnostics identify paths only.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function parseManifest(content) {
  const allowed = new Set();
  let section = false;
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (line === 'published:' && !section) { section = true; continue; }
    const match = section && /^  - (.+)$/.exec(line);
    const path = match && match[1];
    if (!path || /[\\\x00-\x20\x7f*?\[\]]/.test(path) ||
        path.split('/').some(part => !part || part === '.' || part === '..') || allowed.has(path)) {
      throw new Error('Invalid publish manifest');
    }
    allowed.add(path);
  }
  if (!allowed.size) throw new Error('Invalid publish manifest');
  return allowed;
}

export function main() {
  try {
    const allowed = parseManifest(readFileSync('publish-manifest.yaml', 'utf8'));
    const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
    const missing = [...new Set(tracked)].filter(path => !allowed.has(path)).sort();
    for (const path of missing) console.error(`Undeclared path: ${JSON.stringify(path)}`);
    if (missing.length) return 1;
    console.log('Publish manifest passed');
    return 0;
  } catch {
    console.error('Publish manifest check failed');
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main();
