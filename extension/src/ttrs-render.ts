// Pure rendering: `.ttrs` pass-1 resolver output → preview HTML.
//
// No vscode import here — this module takes plain data (the object
// `runPass1()` from the vendored @transitrix/document-renderer returns, plus
// whatever figures the host already rasterised) and returns HTML strings.
// ttrs-preview.ts owns the vscode-facing half (finding the document, calling
// the vendored resolver, wiring the webview panel).
//
// The resolved Markdown from pass 1 is rendered as-is — this module never
// re-decides what a reference resolved to. It only:
//   - converts the Markdown pass 1 already produced to HTML (headings,
//     paragraphs, bold — the format's document text has no italic content
//     and this repo's rendered output never adds any, per the "no italic
//     text in any rendered output" design rule),
//   - style-marks the state markers and flags pass 1 already embedded in
//     that Markdown («unresolved: ID», a trailing ⚑U/⚑A/⚑V, an instruction
//     slot's raw byte-for-byte block),
//   - and adds summary panels built from pass 1's own findings/errors/
//     instructionSlots/suspicion fields, for the acceptance criteria that
//     need distinct visibility rather than inline placement (the "each"/
//     "trace" TTRS-004 case: pass 1 drops the construct from its Markdown
//     entirely — no marker, no position — so it can only be surfaced as a
//     summary entry, not inline).

export interface Pass1Finding {
  code: string;
  state: string;
  flag: string | null;
  id: string | null;
  file: string;
}

export interface Pass1Error {
  code: string;
  message: string;
}

export interface Pass1InstructionSlot {
  slotId: string;
  question: string;
  inputs: string[];
  sufficient: string;
}

export interface Pass1Figure {
  number: number;
  name: string;
  kind: 'view' | 'figure';
  source: string;
  derived: boolean;
  fit: string | null;
  caption: string | null;
  embedPath: string;
}

export interface Pass1Suspicion {
  computed: boolean;
  state: string;
  reason: string;
}

/** The subset of runPass1()'s return value this module reads. */
export interface Pass1Result {
  ok: boolean;
  markdown: string;
  instructionSlots: Pass1InstructionSlot[];
  figures: Pass1Figure[];
  errors: Pass1Error[];
  findings: Pass1Finding[];
  states: Record<string, number>;
  suspicion: Pass1Suspicion;
  profile: 'strict' | 'review';
}

/** What the host resolved a figure to, keyed by its pass-1 figure `number`. */
export interface FigureEmbed {
  /** Inline SVG markup (no wrapping <img> — CSP on this frame has no img-src). */
  svg?: string;
  /** Set instead of `svg` when this figure's notation isn't rendered in the preview yet. */
  unavailable?: string;
}

const STATE_LABEL: Record<string, string> = {
  unresolved: 'unresolved',
  'not-admitted': 'not admitted',
  'out-of-validity': 'out of validity',
};

const STATE_CLASS: Record<string, string> = {
  unresolved: 'ttrs-state-error',
  'not-admitted': 'ttrs-state-error',
  'out-of-validity': 'ttrs-state-warning',
};

const FLAG_CLASS: Record<string, string> = {
  '⚑U': 'ttrs-state-error',
  '⚑A': 'ttrs-state-error',
  '⚑V': 'ttrs-state-warning',
};

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Placeholder tokens carry only characters escHtml leaves untouched, so they
// survive the escape pass on surrounding paragraph text intact.
let placeholderSeq = 0;
function nextPlaceholder(kind: string): string {
  placeholderSeq += 1;
  return `TTRS_${kind}_${placeholderSeq}`;
}

interface Extraction {
  text: string;
  replacements: Map<string, string>;
}

/** Pulls instruction-slot raw blocks and figure images out of the Markdown,
 *  replacing each with a placeholder token, so the remaining text can go
 *  through ordinary paragraph/heading/escaping without either construct
 *  being mangled by it. */
function extractBlocks(
  markdown: string,
  instructionSlots: Pass1InstructionSlot[],
  figureEmbeds: Map<number, FigureEmbed>,
): Extraction {
  const replacements = new Map<string, string>();
  const slotById = new Map(instructionSlots.map((s) => [s.slotId, s]));

  let text = markdown.replace(
    /\{\{#\s*instruct\s+([a-z0-9-]+)\s*\}\}[\s\S]*?\{\{\/\s*instruct\s*\}\}/g,
    (_match, slotId: string) => {
      const token = nextPlaceholder('INSTRUCT');
      replacements.set(token, renderInstructionSlot(slotById.get(slotId), slotId));
      return token;
    },
  );

  text = text.replace(/!\[([^\]]*)\]\(([^)]*)\)/g, (_match, caption: string, src: string) => {
    const token = nextPlaceholder('FIGURE');
    const numberMatch = /^#ttrs-fig-(\d+)$/.exec(src);
    const embed = numberMatch ? figureEmbeds.get(Number(numberMatch[1])) : undefined;
    replacements.set(token, renderFigureEmbed(caption, embed));
    return token;
  });

  return { text, replacements };
}

function renderInstructionSlot(slot: Pass1InstructionSlot | undefined, slotId: string): string {
  if (!slot) {
    return `<div class="ttrs-instruct">\n  <div class="ttrs-instruct-label">⧗ instruction slot "${escHtml(slotId)}" — pending, pass 2 not run in this preview</div>\n</div>`;
  }
  const inputs = slot.inputs.length > 0
    ? `<div class="ttrs-instruct-row"><span class="ttrs-instruct-key">inputs</span> ${escHtml(slot.inputs.join(', '))}</div>`
    : '';
  return `<div class="ttrs-instruct">
  <div class="ttrs-instruct-label">⧗ instruction slot "${escHtml(slot.slotId)}" — pending, pass 2 not run in this preview</div>
  <div class="ttrs-instruct-row"><span class="ttrs-instruct-key">question</span> ${escHtml(slot.question)}</div>
  ${inputs}
  <div class="ttrs-instruct-row"><span class="ttrs-instruct-key">sufficient</span> ${escHtml(slot.sufficient)}</div>
</div>`;
}

function renderFigureEmbed(caption: string, embed: FigureEmbed | undefined): string {
  const captionHtml = caption ? `<div class="ttrs-figure-caption">${escHtml(caption)}</div>` : '';
  if (embed?.svg) {
    return `<div class="ttrs-figure">${embed.svg}${captionHtml}</div>`;
  }
  const reason = embed?.unavailable ?? 'figure source could not be resolved';
  return `<div class="ttrs-figure ttrs-figure-unavailable">
  <div class="ttrs-figure-note">⧗ not rendered in this preview — ${escHtml(reason)}</div>
  ${captionHtml}
</div>`;
}

function renderInlineMarkers(escaped: string): string {
  let out = escaped.replace(
    /«(unresolved|not admitted|out of validity): ([^»]*)»/g,
    (_m, state: string, id: string) => {
      const key = state.replace(/ /g, '-');
      const cls = STATE_CLASS[key] ?? 'ttrs-state-error';
      return `<span class="ttrs-ref-state ${cls}" title="${escHtml(STATE_LABEL[key] ?? state)}">⚑ ${escHtml(state)}: ${escHtml(id)}</span>`;
    },
  );
  out = out.replace(/⚑[UAV]/g, (flag) => {
    const cls = FLAG_CLASS[flag] ?? 'ttrs-state-error';
    return `<span class="ttrs-flag ${cls}">${flag}</span>`;
  });
  return out;
}

function renderInlineBold(escaped: string): string {
  return escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function renderParagraphContent(text: string): string {
  return renderInlineMarkers(renderInlineBold(escHtml(text)));
}

/** Converts pass 1's resolved Markdown to HTML. Headings, paragraphs and bold
 *  only — this format's own body has no other inline styling, and this repo
 *  renders no italics anywhere. */
function markdownToHtml(text: string, replacements: Map<string, string>): string {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter((b) => b !== '');
  const html = blocks.map((block) => {
    const heading = /^(#{1,6})\s+(.*)$/s.exec(block);
    if (heading) {
      const level = heading[1].length;
      return `<h${level}>${renderParagraphContent(heading[2].replace(/\n/g, ' '))}</h${level}>`;
    }
    // A block that is entirely one placeholder token (instruction slot or
    // figure) is already its own HTML — don't wrap it in <p>.
    if (/^TTRS_(INSTRUCT|FIGURE)_\d+$/.test(block)) {
      return block;
    }
    return `<p>${renderParagraphContent(block.replace(/\n/g, ' '))}</p>`;
  }).join('\n');

  let out = html;
  for (const [token, replacement] of replacements) {
    out = out.split(token).join(replacement);
  }
  return out;
}

function renderNoRepositoryBanner(findings: Pass1Finding[]): string {
  if (!findings.some((f) => f.state === 'no-repository')) return '';
  return `<div class="ttrs-banner ttrs-banner-info">
  ℹ No repository configured — every model-object reference below is shown unresolved because there is nothing to resolve against.
</div>`;
}

function renderSuspicionBanner(suspicion: Pass1Suspicion): string {
  return `<div class="ttrs-banner ttrs-banner-info">
  ℹ Link suspicion (⚑S): <strong>not computed</strong> — ${escHtml(suspicion.reason)}
</div>`;
}

function renderDeferredPanel(errors: Pass1Error[]): string {
  const deferred = errors.filter((e) => e.code === 'TTRS-004');
  if (deferred.length === 0) return '';
  const items = deferred.map((e) => `<li>${escHtml(e.message)}</li>`).join('');
  return `<div class="ttrs-panel ttrs-panel-deferred">
  <div class="ttrs-panel-title">⧗ Recognised, not implemented in this pass</div>
  <ul>${items}</ul>
</div>`;
}

function renderReferenceIssuesPanel(findings: Pass1Finding[]): string {
  const byState = findings.filter((f) => f.state !== 'no-repository');
  if (byState.length === 0) return '';
  const items = byState.map((f) => {
    const cls = STATE_CLASS[f.state] ?? 'ttrs-state-error';
    return `<li><span class="ttrs-ref-state ${cls}">${escHtml(STATE_LABEL[f.state] ?? f.state)}</span> <code>${escHtml(f.id ?? '')}</code> (${escHtml(f.code)})</li>`;
  }).join('');
  return `<div class="ttrs-panel ttrs-panel-issues">
  <div class="ttrs-panel-title">Reference issues</div>
  <ul>${items}</ul>
</div>`;
}

export interface TtrsRenderOutput {
  bodyContent: string;
  errorMsg: string;
  warnings: string[];
}

/** Builds the webview body for a pass-1 result. Pure — no vscode. */
export function renderTtrsResult(
  result: Pass1Result,
  figureEmbeds: Map<number, FigureEmbed>,
): TtrsRenderOutput {
  const { text, replacements } = extractBlocks(result.markdown, result.instructionSlots, figureEmbeds);
  const contentHtml = markdownToHtml(text, replacements);

  const panels = [
    renderNoRepositoryBanner(result.findings),
    renderDeferredPanel(result.errors),
    renderReferenceIssuesPanel(result.findings),
    renderSuspicionBanner(result.suspicion),
  ].filter(Boolean).join('\n');

  const bodyContent = `<div class="ttrs-doc">${contentHtml}</div>\n${panels}`;

  // Hard problems only — never the deferred-construct marker (its own panel
  // above) and never the no-repository state (its own banner above).
  const hardErrors = result.errors.filter((e) => e.code !== 'TTRS-004' && e.code !== 'TTRS-011');
  const errorMsg = hardErrors.map((e) => `${e.code}: ${e.message}`).join('\n');

  return { bodyContent, errorMsg, warnings: [] };
}

export const TTRS_STYLES = `
.ttrs-doc { font-size: 13px; line-height: 1.6; color: var(--ts-text, #0f172a); font-family: var(--vscode-font-family, system-ui, sans-serif); }
.ttrs-doc h1, .ttrs-doc h2, .ttrs-doc h3, .ttrs-doc h4, .ttrs-doc h5, .ttrs-doc h6 { color: var(--ts-header-text, #0f172a); margin: 20px 0 8px; }
.ttrs-doc p { margin: 0 0 12px; }
.ttrs-ref-state { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 11px; font-weight: 600; white-space: nowrap; }
.ttrs-flag { display: inline-block; padding: 0 3px; border-radius: 3px; font-weight: 700; }
.ttrs-state-error { background: var(--ts-status-error-bg, #fee2e2); color: var(--ts-status-error-fg, #991b1b); }
.ttrs-state-warning { background: var(--ts-status-warning-bg, #fef9c3); color: var(--ts-status-warning-fg, #854d0e); }
.ttrs-instruct { margin: 12px 0; padding: 10px 12px; border-left: 3px solid var(--ts-status-info-fg, #0c4a6e); background: var(--ts-status-info-bg, #e0f2fe); border-radius: 4px; }
.ttrs-instruct-label { font-weight: 600; color: var(--ts-status-info-fg, #0c4a6e); margin-bottom: 4px; }
.ttrs-instruct-row { font-size: 12px; margin-top: 2px; }
.ttrs-instruct-key { font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: 0.04em; color: var(--ts-text-muted, #64748b); margin-right: 6px; }
.ttrs-figure { margin: 12px 0; }
.ttrs-figure svg { max-width: 100%; height: auto; }
.ttrs-figure-caption { font-size: 12px; color: var(--ts-text-muted, #64748b); margin-top: 4px; }
.ttrs-figure-unavailable { padding: 10px 12px; border: 1px dashed var(--ts-border, #cbd5e1); border-radius: 4px; }
.ttrs-figure-note { font-size: 12px; color: var(--ts-text-muted, #64748b); }
.ttrs-banner { margin: 0 0 12px; padding: 8px 12px; border-radius: 4px; font-size: 12px; }
.ttrs-banner-info { background: var(--ts-status-info-bg, #e0f2fe); color: var(--ts-status-info-fg, #0c4a6e); }
.ttrs-panel { margin: 16px 0; padding: 10px 12px; border-radius: 6px; border: 1px solid var(--ts-border, #cbd5e1); }
.ttrs-panel-title { font-weight: 600; font-size: 12px; margin-bottom: 6px; }
.ttrs-panel ul { margin: 0; padding-left: 20px; }
.ttrs-panel li { font-size: 12px; margin-bottom: 4px; }
.ttrs-panel-deferred { background: var(--ts-bg-elevated, #f1f5f9); }
`;
