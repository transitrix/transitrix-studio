/**
 * Cervin → Transitrix corpus convention guard (CLAUDE.md §Cervin naming, P6).
 *
 * New notation files must use the canonical `*.transitrix.yaml` suffixes
 * (BPMN: `*.bpmn.transitrix.yaml`). The legacy `*.cervin.yaml` suffix is still
 * accepted by the compiler/editor for backward compatibility, but is deprecated
 * and must not be used for new files. This gate fails if any tracked
 * `*.cervin.yaml` file is committed.
 *
 * Operates on git-tracked files only, so generated/ignored trees and
 * node_modules are out of scope by construction.
 */
import { execFileSync } from 'node:child_process';

let out = '';
try {
  out = execFileSync('git', ['ls-files', '*.cervin.yaml'], { encoding: 'utf8' });
} catch (e) {
  console.error(`check-no-cervin-yaml: could not run 'git ls-files': ${e.message}`);
  process.exit(2);
}

const files = out
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean);

if (files.length > 0) {
  console.error(
    'check-no-cervin-yaml: the .cervin.yaml suffix is deprecated — use *.bpmn.transitrix.yaml',
  );
  console.error('Offending tracked file(s):');
  for (const f of files) console.error(`  - ${f}`);
  console.error('See CLAUDE.md §Cervin naming (P6) and CONTRIBUTING.md.');
  process.exit(1);
}

console.log('check-no-cervin-yaml: OK (no tracked *.cervin.yaml files)');
