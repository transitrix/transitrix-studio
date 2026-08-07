#!/usr/bin/env node
// Scaffold a new changelog/fragments/<slug>-<random>.md file for the current
// change. Usage: node scripts/new-changelog-fragment.mjs <section> <slug>
//   section — one of Added, Changed, Fixed, Removed, Deprecated, Security, Packages
//   slug    — short kebab-case description, e.g. "wire-node-validator"

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

import { SECTION_ORDER } from './changelog-fragments.mjs';

const [section, slug] = process.argv.slice(2);

if (!section || !slug) {
  console.error('usage: node scripts/new-changelog-fragment.mjs <section> <slug>');
  console.error(`  section: one of ${SECTION_ORDER.join(', ')}`);
  process.exit(1);
}

if (!SECTION_ORDER.includes(section)) {
  console.error(`[new-changelog-fragment] unknown section "${section}" — expected one of ${SECTION_ORDER.join(', ')}`);
  process.exit(1);
}

const dir = path.join(process.cwd(), 'changelog', 'fragments');
mkdirSync(dir, { recursive: true });

const suffix = randomBytes(4).toString('hex');
const filename = `${slug}-${suffix}.md`;
const filePath = path.join(dir, filename);

if (existsSync(filePath)) {
  console.error(`[new-changelog-fragment] ${filename} already exists — re-run for a fresh suffix.`);
  process.exit(1);
}

writeFileSync(filePath, `### ${section}\n\n- **Title.** Description.\n`);
console.log(`[new-changelog-fragment] wrote changelog/fragments/${filename}`);
