import { readFileSync } from 'node:fs';
import {
  checkDocumentProvenance,
  type ProvenanceAdapter,
  type ProvenanceResult,
} from '../vendor/methodology/document-renderer/provenance/provenance.mjs';

export { checkDocumentProvenance };
export type { ProvenanceAdapter, ProvenanceResult };

export interface EvidenceFiles {
  run?: string;
  recipe?: string;
  output?: string;
  claims?: string;
}

/** The caller explicitly selects and authorizes all files. No discovery, Git
 * inspection or author-supplied observations are performed by this adapter. */
export function fileEvidenceAdapter(files: EvidenceFiles, authorize: ProvenanceAdapter['authorize']): ProvenanceAdapter {
  const selection = { ...files };
  return {
    authorize,
    load: () => {
      const bundle: Record<string, unknown> = {};
      for (const key of ['run', 'recipe', 'output'] as const) {
        if (selection[key]) bundle[key] = readFileSync(selection[key]);
      }
      if (selection.claims) bundle.claims = JSON.parse(readFileSync(selection.claims, 'utf8'));
      return bundle;
    },
  };
}

/** Structured CLI adapter; preserves every field and the checker's ordering. */
export async function documentProvenanceJson(adapter?: ProvenanceAdapter): Promise<string> {
  return JSON.stringify(await checkDocumentProvenance(adapter), null, 2);
}

export async function handleProvenanceCommand(argv: string[]): Promise<void> {
  const usage = 'usage: transitrix check-document [--run <record.json>] [--recipe <input.ttrs>] [--output <artifact>] [--claims <claims.json>] [--json]';
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage);
    return;
  }
  const files: EvidenceFiles = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') continue;
    const key = argv[i].slice(2) as keyof EvidenceFiles;
    if (!argv[i].startsWith('--') || !['run', 'recipe', 'output', 'claims'].includes(key)
      || !argv[i + 1] || argv[i + 1].startsWith('--') || files[key]) {
      console.error(usage);
      process.exitCode = 2;
      return;
    }
    files[key] = argv[++i];
  }
  // Explicit local file arguments grant disclosure to this local CLI caller.
  // Missing selection is the same generic unavailable result as denial.
  const json = await documentProvenanceJson(fileEvidenceAdapter(files, () => Object.keys(files).length > 0));
  console.log(json);
  const result = JSON.parse(json) as ProvenanceResult;
  process.exitCode = result.status === 'inconsistent' ? 1 : result.incomplete ? 2 : 0;
}
