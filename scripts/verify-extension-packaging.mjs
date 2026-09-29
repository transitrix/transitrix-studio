/**
 * Gate before `vsce package`: extension/ must contain only shippable runtime
 * assets. Non-runtime directory names are blocked by FORBIDDEN_DIR_NAMES below.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import yauzl from 'yauzl';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const extRoot = path.join(root, 'extension');

// These existing suites cover the behavior illustrated by the retained media.
// Reports stay outside the package; each review is bound to the exact VSIX.
export const mediaReviewSuites = [
  'src/goals/__tests__/mutations.test.ts',
  'src/goals/__tests__/GoalTreeView.test.tsx',
  'src/webview/__tests__/render-goals.test.ts',
  'src/webview/__tests__/render-fgca.test.ts',
];

const REQUIREMENT_REPORT_TERMS = [
  'Transitrix: Traceability Matrix',
  'Transitrix: Requirements by Release',
  'broken references',
  'no accepted source',
  'no verification definition',
  'no applicable',
  'failed verification',
  'no effective release',
];

export function verifyListing(readme, manifest, review, packageSha256, changelog) {
  if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(manifest.version)) {
    throw new Error('Invalid packaged extension version');
  }
  if (!/requirement traceability/i.test(manifest.description ?? '')) {
    throw new Error('Packaged description omits requirement traceability');
  }
  const foldedReadme = readme.toLowerCase().replace(/\s+/g, ' ');
  for (const term of REQUIREMENT_REPORT_TERMS) {
    if (!foldedReadme.includes(term.toLowerCase())) {
      throw new Error(`Packaged feature list omits: ${term}`);
    }
  }
  if (changelog !== undefined) {
    if (!changelog.includes(`## ${manifest.version}`)) {
      throw new Error(`Packaged changelog omits version ${manifest.version}`);
    }
    const foldedChangelog = changelog.toLowerCase().replace(/\s+/g, ' ');
    for (const term of REQUIREMENT_REPORT_TERMS) {
      if (!foldedChangelog.includes(term.toLowerCase())) {
        throw new Error(`Packaged changelog omits: ${term}`);
      }
    }
  }
  // Ignore fenced examples and explicitly historical sections. Only assertions
  // about the current extension release are compared with its manifest.
  const prose = readme.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1\s*$/gm, '');
  const version = '(\\d+\\.\\d+\\.\\d+(?:-[\\w.-]+)?)';
  const assertion = new RegExp(
    `(?:current|latest|released|installed)\\s+(?:Transitrix Studio\\s+)?(?:extension\\s+)?(?:version|release)?\\s*(?:is|:|=)?\\s*v?${version}`, 'gi');
  for (const section of prose.split(/(?=^#{1,6} )/m)) {
    if (/^#{1,6} (?:changelog|history|release notes|examples?)\b/i.test(section)) continue;
    for (const match of section.replace(/[*_`]/g, '').matchAll(assertion)) {
      if (match[1] !== manifest.version) throw new Error('Stale current-version assertion in packaged README');
    }
  }
  // This contract covers the VS Code stills, independently of the older GIF
  // and of media for other editor families.
  const gallery = prose.match(/^## Goals and DGCA in VS Code\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1];
  if (!gallery) throw new Error('Missing VS Code screenshot gallery');
  const provenance = gallery.match(/historical screenshots were captured on ([A-Za-z]+ \d{1,2}, \d{4}), in VS Code (\d+\.\d+\.\d+) with Transitrix Studio (\d+\.\d+\.\d+)\./);
  if (!provenance || !gallery.includes('The capture version is separate from the current extension version')) {
    throw new Error('Missing explicit historical capture provenance');
  }
  if (provenance[3] !== manifest.version) {
    if (!review || review.packageSha256 !== packageSha256 || !packageSha256) {
      throw new Error('Missing compatibility review for this exact package');
    }
    const tests = review.tests;
    if (tests?.success !== true || tests.numFailedTests !== 0 || tests.numPendingTests !== 0) {
      throw new Error('Compatibility review did not pass');
    }
    for (const suite of mediaReviewSuites) {
      const result = tests.testResults?.find(r => r.name.replaceAll('\\', '/').endsWith(`/${suite}`));
      if (result?.status !== 'passed' || !result.assertionResults?.length ||
          result.assertionResults.some(r => r.status !== 'passed')) {
        throw new Error(`Missing passing compatibility coverage: ${suite}`);
      }
    }
  }
}

async function readPackagedListing(vsix) {
  return new Promise((resolve, reject) => {
    yauzl.open(vsix, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error);
      const files = new Map();
      zip.on('error', reject);
      zip.on('end', () => resolve(files));
      zip.on('entry', entry => {
        if (!['extension/package.json', 'extension/readme.md', 'extension/changelog.md'].includes(entry.fileName.toLowerCase())) return zip.readEntry();
        if (files.has(entry.fileName.toLowerCase()) || entry.uncompressedSize > 2 * 1024 * 1024) {
          zip.close();
          return reject(new Error('Duplicate or oversized packaged listing entry'));
        }
        zip.openReadStream(entry, (error, stream) => {
          if (error) return reject(error);
          const chunks = [];
          stream.on('error', reject);
          stream.on('data', chunk => chunks.push(chunk));
          stream.on('end', () => {
            files.set(entry.fileName.toLowerCase(), Buffer.concat(chunks).toString('utf8'));
            zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
}

// Directory names that must never appear under extension/ (would ship in the VSIX).
const FORBIDDEN_DIR_NAMES = new Set(['0. archive', '.archive']);

/** @returns {string[]} relative paths under extension/ that must not ship */
function findForbiddenUnderExtension(dir, rel = '') {
  const hits = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return hits;
  }
  for (const ent of entries) {
    const relPath = rel ? `${rel}/${ent.name}` : ent.name;
    if (ent.isDirectory()) {
      if (FORBIDDEN_DIR_NAMES.has(ent.name)) {
        hits.push(relPath);
        continue;
      }
      hits.push(...findForbiddenUnderExtension(path.join(dir, ent.name), relPath));
    }
  }
  return hits;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 4 || args[0] !== '--vsix' || args[2] !== '--review')) {
    throw new Error('Usage: verify-extension-packaging [--vsix FILE --review FILE]');
  }
  const forbidden = findForbiddenUnderExtension(extRoot);
  if (forbidden.length > 0) {
    console.error('verify-extension-packaging: non-runtime path(s) under extension/:');
    for (const p of forbidden) {
      console.error(`  extension/${p}`);
    }
    console.error('Remove or relocate before packaging. See docs/internal/packaging.md.');
    process.exit(1);
  }

  if (args.length) {
    const files = await readPackagedListing(args[1]);
    const readme = files.get('extension/readme.md');
    const changelog = files.get('extension/changelog.md');
    const manifest = JSON.parse(files.get('extension/package.json'));
    if (!readme) throw new Error('Missing packaged README');
    if (!changelog) throw new Error('Missing packaged changelog');
    const sha256 = createHash('sha256').update(fs.readFileSync(args[1])).digest('hex');
    const review = JSON.parse(fs.readFileSync(args[3], 'utf8'));
    verifyListing(readme, manifest, review, sha256, changelog);
    verifyListing(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), manifest, review, sha256);
    if (manifest.version !== JSON.parse(fs.readFileSync(path.join(extRoot, 'package.json'), 'utf8')).version) {
      throw new Error('Packaged version differs from source manifest');
    }
    console.log(`verify-extension-packaging: listing ${manifest.version}, sha256=${sha256}`);
  }
  console.log('verify-extension-packaging: OK');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
