/**
 * VS Code glue for PNG export — save-to-file and copy-to-clipboard.
 *
 * The pure rasterization lives in `raster.ts` (no `vscode` import). This
 * module owns the editor-facing parts: the save dialog, file write, and the
 * OS-specific clipboard path.
 *
 * Clipboard scope (vkgeorgia/strategy#32): `vscode.env.clipboard` is
 * text-only, so an image copy needs an OS-specific path. Windows ships here;
 * macOS (`osascript`) and Linux (`xclip` / `wl-copy`) are a documented
 * follow-up — `copyPngToClipboard` degrades to a clear notice there.
 */
import * as path from 'node:path';
import * as os from 'node:os';
import { promises as fsp } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as vscode from 'vscode';
import { prepareSvgForExport, type ThemeId } from './diagram-frame.js';
import { rasterizeSvgToPng } from './raster.js';

const execFileP = promisify(execFile);

export interface PngCopyTarget {
  /** Raw rendered SVG (pre-export). Undefined/empty → nothing to export. */
  rawSvg: string | undefined;
  themeId: ThemeId;
  /** Per-notation class CSS to embed — same value passed to prepareSvgForExport. */
  notationCss?: string;
  /** Message shown when no diagram has been rendered yet. */
  emptyMessage: string;
}

export interface PngSaveTarget extends PngCopyTarget {
  /** URI of the source document, for the default save location + filename. */
  sourceUri?: vscode.Uri;
  /** Regex stripping the notation suffix from the source filename. */
  stripExt: RegExp;
  /** Optional suffix before `.png` (e.g. "-network" for the activities views). */
  viewSuffix?: string;
}

function rasterizeOrReport(svg: string): Promise<Buffer | undefined> {
  return rasterizeSvgToPng(svg).catch((e: unknown) => {
    vscode.window.showErrorMessage(`PNG export failed: ${(e as Error).message ?? String(e)}`);
    return undefined;
  });
}

/** Save the current diagram as a `.png` via a save dialog. */
export async function savePngFromSvg(t: PngSaveTarget): Promise<void> {
  if (!t.rawSvg) {
    vscode.window.showWarningMessage(t.emptyMessage);
    return;
  }
  const stem = t.sourceUri
    ? path.basename(t.sourceUri.fsPath).replace(t.stripExt, '')
    : 'diagram';
  const filename = `${stem}${t.viewSuffix ?? ''}.png`;
  const defaultUri = t.sourceUri
    ? vscode.Uri.file(path.join(path.dirname(t.sourceUri.fsPath), filename))
    : vscode.Uri.file(filename);
  const target = await vscode.window.showSaveDialog({ defaultUri, filters: { 'PNG Image': ['png'] } });
  if (!target) return;

  const svg = prepareSvgForExport(t.rawSvg, t.themeId, t.notationCss ?? '');
  const png = await rasterizeOrReport(svg);
  if (!png) return;
  await vscode.workspace.fs.writeFile(target, png);
  vscode.window.showInformationMessage(`Saved: ${path.basename(target.fsPath)}`);
}

/** Copy the current diagram to the clipboard as a PNG image. */
export async function copyPngFromSvg(t: PngCopyTarget): Promise<void> {
  if (!t.rawSvg) {
    vscode.window.showWarningMessage(t.emptyMessage);
    return;
  }
  const svg = prepareSvgForExport(t.rawSvg, t.themeId, t.notationCss ?? '');
  const png = await rasterizeOrReport(svg);
  if (!png) return;
  await copyPngToClipboard(png);
}

async function copyPngToClipboard(png: Buffer): Promise<void> {
  if (process.platform === 'win32') {
    try {
      await copyPngWindows(png);
      vscode.window.showInformationMessage('Diagram copied to clipboard as PNG.');
    } catch (e) {
      vscode.window.showErrorMessage(`Copy as PNG failed: ${(e as Error).message ?? String(e)}`);
    }
    return;
  }
  // macOS / Linux: not yet wired (Windows-first, vkgeorgia/strategy#32).
  vscode.window.showWarningMessage(
    'Copy as PNG is not yet available on macOS/Linux — use “Save .png” instead. (Tracked in vkgeorgia/strategy#32.)',
  );
}

/**
 * Windows clipboard image copy.
 *
 * `vscode.env.clipboard` is text-only and there is no Node API for image
 * clipboard, so shell out to Windows PowerShell. `Clipboard.SetImage` must
 * run on an STA thread — `powershell.exe` (Windows PowerShell 5.1, always
 * present) is STA by default; we pass `-STA` to be explicit. The PNG is
 * staged through a temp file (simpler and more robust than piping binary on
 * stdin). `execFile` with an argv array — never a shell string — keeps the
 * generated, non-user path clear of any command-injection surface.
 */
async function copyPngWindows(png: Buffer): Promise<void> {
  const tmp = path.join(os.tmpdir(), `transitrix-clip-${process.pid}-${Date.now()}.png`);
  await fsp.writeFile(tmp, png);
  const escaped = tmp.replace(/'/g, "''"); // PowerShell single-quote escape
  const psScript =
    'Add-Type -AssemblyName System.Windows.Forms,System.Drawing; ' +
    `$img = [System.Drawing.Image]::FromFile('${escaped}'); ` +
    '[System.Windows.Forms.Clipboard]::SetImage($img); ' +
    '$img.Dispose()';
  try {
    await execFileP('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-Command', psScript]);
  } finally {
    await fsp.unlink(tmp).catch(() => undefined);
  }
}
