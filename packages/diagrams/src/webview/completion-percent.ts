/** Shared completion display contract for Action, DGA and DGCA previews. */
export interface ActionProgress {
  percent: number;
  computedAt: string;
}

export function completionPercentState(progress: ActionProgress | undefined, linked: boolean, enabled = true, now = Date.now()): { label: string; stale: boolean } | undefined {
  if (!enabled) return undefined;
  if (progress && Number.isFinite(progress.percent) && progress.percent >= 0 && progress.percent <= 100 && Number.isFinite(Date.parse(progress.computedAt))) {
    return { label: `${progress.percent}%`, stale: now - Date.parse(progress.computedAt) > 7 * 24 * 60 * 60 * 1000 };
  }
  return linked ? { label: '–%', stale: false } : undefined;
}

export function completionPercentSvg(progress: ActionProgress | undefined, linked: boolean, x: number, y: number, enabled = true): string {
  const state = completionPercentState(progress, linked, enabled);
  return state ? `<text class="text-id completion-percent" x="${x}" y="${y}" text-anchor="end" dominant-baseline="hanging" font-size="10"${state.stale ? ' opacity="0.5"' : ''}>${state.label}</text>` : '';
}
