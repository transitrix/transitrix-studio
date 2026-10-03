import { emptyCanon, ingestComplianceDoc } from './classify.js';

/** Relative POSIX paths keep scanning policy and content identity independent of host APIs. */
export interface RequirementCatalogueIO {
  read(path: string): Promise<string>;
  list(path: string): Promise<Array<{ name: string; kind: 'file' | 'directory' | 'symlink' | 'other' }>>;
  missing(error: unknown): boolean;
  parse(content: string): unknown;
  digest(content: string): string;
  sourcePath?(path: string): string;
}

/** Shared disk/editor policy: one manifest boundary, all three zones, lossless failures. */
export async function scanRequirementCatalogue(io: RequirementCatalogueIO) {
  const canon = emptyCanon();
  const transcript: unknown[] = [];
  const manifest = await io.read('transitrix.yaml');
  const parsed = io.parse(manifest);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid transitrix.yaml manifest: expected a mapping');
  transcript.push(['transitrix.yaml', manifest]);
  const fail = (path: string, message: string) => {
    transcript.push(['failure', path, message]);
    canon.findings.push({ id: `${path}:load`, owner: path, field: '', code: 'LOAD', message, reference: false, severity: 'error' });
  };
  const walk = async (dir: string, top = false): Promise<void> => {
    let entries: Awaited<ReturnType<RequirementCatalogueIO['list']>>;
    try { entries = await io.list(dir); }
    catch (error) {
      if (top && io.missing(error)) { transcript.push(['absent-zone', dir]); return; }
      fail(dir, 'Directory could not be enumerated'); return;
    }
    if (!top && entries.some(e => e.name === 'transitrix.yaml')) { transcript.push(['catalogue-boundary', dir]); return; }
    for (const { name, kind } of entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const path = `${dir}/${name}`;
      if (kind === 'symlink') { fail(path, 'Symbolic link was not enumerated'); continue; }
      if (kind === 'directory') { await walk(path); continue; }
      if (!/\.ya?ml$/i.test(name)) continue;
      if (kind !== 'file') { fail(path, 'Unsupported file type'); continue; }
      let content: string;
      try { content = await io.read(path); }
      catch { fail(path, 'Unreadable YAML record'); continue; }
      transcript.push([path, content]);
      try { ingestComplianceDoc(canon, io.parse(content), io.sourcePath?.(path) ?? path); }
      catch { fail(path, 'Malformed YAML record'); }
    }
  };
  for (const zone of ['canon', 'codex', 'field']) await walk(zone, true);
  return { canon, snapshotId: `sha256:${io.digest(JSON.stringify(transcript))}` };
}
