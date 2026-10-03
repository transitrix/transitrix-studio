import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, readdir, readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { buildComplianceIndex, buildSubjectRequirementChain, chainDate, requirementReleaseCounts,
  scanRequirementCatalogue, type ChainSubject, type RequirementCatalogueIO } from '@transitrix/diagrams/compliance';
import { isCanonicalId } from '@transitrix/diagrams/typed-id.js';
import { transitrixPackageVersion } from './package-version.js';

const HELP = `transitrix requirements-report --root <catalogue> --subject-type PRODUCT|APPLICATION
  --subject-id <ID> --release <ID> --as-at YYYY-MM-DD --json
  [--project <ACTION-ID>] [--expect-source-revision <full-commit>]
requirements-report/1; requirement-chain/0.3. Exit: 0 complete, 2 incomplete, 1 error.
`;
class ReportError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}
function parse(argv: string[]) {
  const values: Record<string, string> = {};
  const flags = new Set(['root', 'subject-type', 'subject-id', 'release', 'as-at', 'project', 'expect-source-revision']);
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json' && !json) { json = true; continue; }
    const name = argv[i].slice(2);
    if (!argv[i].startsWith('--') || !flags.has(name) || values[name] !== undefined || !argv[i + 1] || argv[i + 1].startsWith('--')) {
      throw new ReportError('USAGE', `Unknown, duplicate or incomplete option: ${argv[i]}`);
    }
    values[name] = argv[++i];
  }
  for (const name of ['root', 'subject-type', 'subject-id', 'release', 'as-at']) {
    if (!values[name]) throw new ReportError('USAGE', `Missing --${name}`);
  }
  if (!json) throw new ReportError('USAGE', 'This interface requires --json');
  const type = values['subject-type'];
  if (type !== 'PRODUCT' && type !== 'APPLICATION') throw new ReportError('USAGE', 'Subject type must be PRODUCT or APPLICATION');
  for (const [name, prefix] of [['subject-id', type], ['release', 'RELEASE'], ['project', 'ACTION']]) {
    if (values[name] && (!isCanonicalId(values[name]) || !values[name].startsWith(prefix + '-'))) throw new ReportError('USAGE', `Invalid --${name} identity`);
  }
  if (!chainDate(values['as-at'])) throw new ReportError('USAGE', 'Invalid ISO calendar date');
  if (values['expect-source-revision'] && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(values['expect-source-revision'])) throw new ReportError('USAGE', 'Expected revision must be a full Git object ID');
  return { root: path.resolve(values.root), subject: { type, id: values['subject-id'] } as ChainSubject,
    release: values.release, project: values.project, asAt: values['as-at'], expectedRevision: values['expect-source-revision'] };
}
function provenance(root: string): { revision: string | null; dirty: boolean | null } {
  const git = (args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  try { return { revision: git(['rev-parse', 'HEAD']), dirty: git(['status', '--porcelain', '--untracked-files=all', '--', '.']).length > 0 }; }
  catch { return { revision: null, dirty: null }; }
}
export function diskRequirementCatalogue(root: string): RequirementCatalogueIO {
  const file = (relative: string) => path.join(root, relative);
  return {
    read: async relative => {
      if (!(await lstat(file(relative))).isFile()) throw new Error('Expected a regular file');
      return readFile(file(relative), 'utf8');
    },
    list: async relative => {
      if (!(await lstat(file(relative))).isDirectory()) throw new Error('Expected a directory');
      return (await readdir(file(relative), { withFileTypes: true })).map(e => ({ name: e.name,
        kind: e.isSymbolicLink() ? 'symlink' : e.isDirectory() ? 'directory' : e.isFile() ? 'file' : 'other' }));
    },
    missing: error => (error as NodeJS.ErrnoException).code === 'ENOENT',
    parse: content => yaml.load(content, { schema: yaml.JSON_SCHEMA }),
    digest: content => createHash('sha256').update(content).digest('hex'),
  };
}
async function toolIdentity() {
  let sourceRevision: string | null = null;
  try {
    const metadata = JSON.parse(await readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), 'requirements-build.json'), 'utf8'));
    sourceRevision = typeof metadata.sourceRevision === 'string' ? metadata.sourceRevision : null;
  } catch { /* Unbundled development calls have no package build identity. */ }
  return { name: '@transitrix/cli', version: transitrixPackageVersion(), sourceRevision };
}
export async function handleRequirementsReportCommand(argv: string[]): Promise<void> {
  if (argv.length === 1 && ['--help', '-h'].includes(argv[0])) { process.stdout.write(HELP); return; }
  const tool = await toolIdentity();
  let request: ReturnType<typeof parse> | null = null;
  try {
    request = parse(argv);
    const before = provenance(request.root);
    if (request.expectedRevision && request.expectedRevision !== before.revision) throw new ReportError('SOURCE_REVISION', 'Observed source revision does not match --expect-source-revision');
    const io = diskRequirementCatalogue(request.root);
    const readSnapshot = async () => {
      try { return await scanRequirementCatalogue(io); }
      catch (error) { throw new ReportError('LOAD', error instanceof Error ? error.message : String(error)); }
    };
    const scan = await readSnapshot();
    const confirmation = await readSnapshot();
    const after = provenance(request.root);
    if (scan.snapshotId !== confirmation.snapshotId || JSON.stringify(before) !== JSON.stringify(after)) throw new ReportError('SOURCE_CHANGED', 'Catalogue changed during scan; retry on stable input');
    const projection = buildSubjectRequirementChain({ index: buildComplianceIndex(scan.canon),
      scope: { catalogue: '.', subject: request.subject, release: request.release, project: request.project },
      asAt: request.asAt, snapshotId: scan.snapshotId, sourceRevision: before.revision ?? undefined,
      complete: !scan.canon.findings.some(f => f.severity === 'error') });
    const { expectedRevision: _, ...publicRequest } = request;
    process.stdout.write(JSON.stringify({ schemaVersion: 'requirements-report/1', status: projection.completeness,
      tool, request: publicRequest, source: { catalogue: '.', snapshotId: scan.snapshotId, ...before, mode: 'disk' },
      projection, counts: requirementReleaseCounts(projection), errors: [] }) + '\n');
    process.exitCode = projection.completeness === 'complete' ? 0 : 2;
  } catch (error) {
    const code = error instanceof ReportError ? error.code : 'INTERNAL';
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(JSON.stringify({ schemaVersion: 'requirements-report/1', status: 'error', tool, request: request ? { root: request.root, subject: request.subject, release: request.release, project: request.project, asAt: request.asAt } : null,
      source: null, projection: null, counts: null, errors: [{ code, message }] }) + '\n');
    process.stderr.write(`requirements-report: ${message}\n`);
    process.exitCode = 1;
  }
}
