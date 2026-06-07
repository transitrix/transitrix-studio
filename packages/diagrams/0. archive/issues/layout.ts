import type {
  Issue,
  IssuesFile,
  IssuesLayout,
  IssuesLayoutOptions,
  LaidOutIssue,
} from './types.js';

const DEFAULTS = {
  rowHeight: 44,
  rowGap: 10,
  indentWidth: 32,
  nodeWidth: 460,
  paddingX: 0,
  paddingY: 0,
};

/**
 * Lays an Issues document out as a nested outline: one row per issue, in
 * pre-order, with x indented by nesting depth and y stacked top-to-bottom.
 *
 * Robust to malformed input — a broken `parent` reference is treated as a
 * root, and a `parent` cycle cannot stack-overflow or drop nodes (a
 * `placed` guard ensures every issue is laid out exactly once).
 */
export function layoutIssues(file: IssuesFile, options: IssuesLayoutOptions = {}): IssuesLayout {
  const o = { ...DEFAULTS, ...options };
  const issues: Issue[] = file?.issues_catalogue?.issues ?? [];

  const byId = new Map<string, Issue>();
  for (const it of issues) {
    if (it && typeof it.issue_id === 'string') byId.set(it.issue_id, it);
  }

  const childrenOf = new Map<string, string[]>();
  const roots: string[] = [];
  for (const it of issues) {
    if (!it || typeof it.issue_id !== 'string') continue;
    const parent = it.parent;
    if (typeof parent === 'string' && byId.has(parent) && parent !== it.issue_id) {
      const arr = childrenOf.get(parent) ?? [];
      arr.push(it.issue_id);
      childrenOf.set(parent, arr);
    } else {
      roots.push(it.issue_id);
    }
  }

  const rows: LaidOutIssue[] = [];
  const placed = new Set<string>();
  let y = o.paddingY;

  function place(id: string, depth: number): void {
    if (placed.has(id)) return; // cycle / duplicate guard
    const issue = byId.get(id);
    if (!issue) return;
    placed.add(id);

    const kids = childrenOf.get(id) ?? [];
    rows.push({
      issue_id: id,
      depth,
      x: o.paddingX + depth * o.indentWidth,
      y,
      width: o.nodeWidth,
      height: o.rowHeight,
      data: issue,
      hasChildren: kids.length > 0,
    });
    y += o.rowHeight + o.rowGap;

    for (const childId of kids) place(childId, depth + 1);
  }

  for (const rootId of roots) place(rootId, 0);
  // Any issue not reached above (e.g. trapped inside a parent cycle) is
  // still laid out, at the root level, so nothing silently disappears.
  for (const it of issues) {
    if (it && typeof it.issue_id === 'string' && !placed.has(it.issue_id)) {
      place(it.issue_id, 0);
    }
  }

  if (rows.length === 0) {
    return { rows: [], bounds: { x: 0, y: 0, width: 0, height: 0 } };
  }

  const minX = Math.min(...rows.map((r) => r.x));
  const minY = Math.min(...rows.map((r) => r.y));
  const maxX = Math.max(...rows.map((r) => r.x + r.width));
  const maxY = Math.max(...rows.map((r) => r.y + r.height));

  return { rows, bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY } };
}
