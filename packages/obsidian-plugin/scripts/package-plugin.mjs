import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(root, '..');
const dest = path.resolve(pkg, '../../output/obsidian-plugin');

mkdirSync(dest, { recursive: true });
copyFileSync(path.join(pkg, 'manifest.json'), path.join(dest, 'manifest.json'));
copyFileSync(path.join(pkg, 'styles.css'), path.join(dest, 'styles.css'));
copyFileSync(path.join(pkg, 'dist/main.js'), path.join(dest, 'main.js'));
console.log(`[obsidian-plugin] wrote ${dest}`);
