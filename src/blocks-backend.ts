import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/** Subprocess caps (ASCII / Markdown sources are capped by HTTP middleware). */
const BLOCKS_BACKEND_TIMEOUT_MS = 60_000;

export type BlocksCompileMode = 'ascii' | 'markdown_table' | 'markdown_tables';

export interface BlocksCompileRequest {
  mode: BlocksCompileMode;
  source: string;
  svgbobCommand?: string;
}

export interface BlocksCompileSuccess {
  svgs: string[];
}

/** Resolve repository root assuming this module lives in dist/*.js. */
function repoRootFromHere(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..');
}

export function resolveBlocksStdioScriptPath(): string {
  return join(repoRootFromHere(), 'backends', 'blocks', 'blocks_stdio.py');
}

function defaultPythonExe(): string {
  const fromEnv = process.env.TRANSITRIX_PYTHON ?? process.env.PYTHON;
  return fromEnv && fromEnv.trim() ? fromEnv.trim() : 'python3';
}

/**
 * TX-R001: Reject shell metacharacters in svgbobCommand to prevent command injection.
 * Only a plain executable name or filesystem path is valid.
 * Character codes used to avoid special characters in source text.
 */
function containsShellMetachar(s: string): boolean {
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    // Whitespace and control characters
    if (c <= 32) return true;
    // ; | & backtick $ ( ) < > ! " ' { } [ ] # ~
    // 59  124 38  96      36 40 41 60 62 33 34 39 123 125 91 93 35 126
    // Backslash (92) is allowed — Windows path separator. Safe because the
    // command is passed as a spawn() argv element, never through a shell.
    if (c === 59 || c === 124 || c === 38 || c === 96 || c === 36 ||
        c === 40 || c === 41 || c === 60 || c === 62 || c === 33 ||
        c === 34 || c === 39 || c === 123 || c === 125 || c === 91 ||
        c === 93 || c === 35 || c === 126) return true;
  }
  return false;
}

async function spawnBlocksJsonPipeline(
  payload: BlocksCompileRequest,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const pythonExe = defaultPythonExe();
  const scriptPath = resolveBlocksStdioScriptPath();

  return new Promise((resolve, reject) => {
    const child = spawn(pythonExe, [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let settled = false;
    const bail = (err: Error): void => {
      if (settled) return;
      settled = true;
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
      reject(err);
    };

    const timer = setTimeout(
      () => bail(new Error('Blocks backend subprocess timed out')),
      BLOCKS_BACKEND_TIMEOUT_MS,
    );

    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    child.stdout.on('data', (c: Buffer) => outChunks.push(c));
    child.stderr.on('data', (c: Buffer) => errChunks.push(c));
    child.on('error', (e: NodeJS.ErrnoException) =>
      bail(
        new Error(
          e.code === 'ENOENT'
            ? 'Python interpreter not found ("' + pythonExe + '"). Install Python 3 or set TRANSITRIX_PYTHON.'
            : e.message,
        ),
      ),
    );
    child.on('close', (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(outChunks).toString('utf8'),
        stderr: Buffer.concat(errChunks).toString('utf8'),
        code,
      });
    });

    try {
      child.stdin.end(JSON.stringify(payload), 'utf8');
    } catch (e) {
      bail(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

/** Run backends/blocks/blocks_stdio.py and normalize the JSON result. */
export async function invokeBlocksDiagram(req: BlocksCompileRequest): Promise<BlocksCompileSuccess> {
  const { stdout, stderr, code } = await spawnBlocksJsonPipeline(req);

  let parsed: unknown;
  try {
    parsed = stdout.trim().length === 0 ? null : JSON.parse(stdout);
  } catch {
    const tail = stderr.trim() || stdout.slice(0, 500);
    throw new Error('Blocks backend returned non-JSON (exit ' + String(code) + '). ' + tail);
  }

  const rec = parsed as Record<string, unknown>;

  if (rec.ok === false) {
    const message = typeof rec.message === 'string' ? rec.message : 'Nested blocks compilation failed';
    const detailsRaw = Array.isArray(rec.details) ? rec.details : [];
    const details = detailsRaw.map((d: unknown) => (typeof d === 'string' ? d : JSON.stringify(d)));
    const extras = details.length > 0 ? '\n' + details.map((d: string) => '  ' + d).join('\n') : '';
    throw new Error((message + extras).slice(0, 4000));
  }

  if (rec.ok !== true) {
    throw new Error('Blocks backend response missing ok flag.');
  }

  const svgs = rec.svgs;
  if (!Array.isArray(svgs) || !svgs.every((s) => typeof s === 'string')) {
    throw new Error('Blocks backend returned invalid SVG list.');
  }

  const nonEmpty = svgs.filter((s: string) => s.length > 0);
  if (nonEmpty.length === 0) {
    throw new Error('Blocks backend returned zero SVG payloads.');
  }

  return { svgs: nonEmpty };
}

const BLOCKS_VALID_MODES: BlocksCompileMode[] = ['ascii', 'markdown_table', 'markdown_tables'];

export function parseBlocksCompileJson(body: unknown): BlocksCompileRequest {
  const rec = body as Record<string, unknown>;
  const modeRaw = rec.mode;
  const sourceRaw = rec.source;

  const modeOk = BLOCKS_VALID_MODES.find((m) => m === modeRaw);
  if (!modeOk) {
    throw new Error(
      'Expected "mode" as one of ' + BLOCKS_VALID_MODES.map((m) => JSON.stringify(m)).join(', '),
    );
  }

  if (typeof sourceRaw !== 'string') {
    throw new Error('Expected JSON body shaped like { "mode": "<mode>", "source": "<diagram text>" }');
  }

  const out: BlocksCompileRequest = {
    mode: modeOk,
    source: sourceRaw,
  };

  if (typeof rec.svgbobCommand === 'string' && rec.svgbobCommand.trim()) {
    const cmd = rec.svgbobCommand.trim();
    if (containsShellMetachar(cmd)) {
      throw new Error(
        'svgbobCommand contains invalid characters. Use only alphanumerics, hyphens, dots, and path separators.',
      );
    }
    out.svgbobCommand = cmd;
  }

  return out;
}
