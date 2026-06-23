/** Diagram geometry options (pool, lanes, ELK inside each lane). */
export interface LayoutDiagramOptions {
  /** Inner padding of the BPMN pool (top/bottom/left/right around lane content). */
  poolPad: number;
  /** Horizontal offset of the participant shape on the DI canvas. */
  poolOriginX: number;
  /** Vertical offset of the participant shape on the DI canvas. */
  poolOriginY: number;
  /**
   * Left band reserved for the vertical participant caption (above lane rectangles).
   */
  participantLabelBand: number;
  /** Width of the lane-name column on the left. */
  laneLabelWidth: number;
  /** Vertical gap between swimlanes (stacked lanes). */
  laneVerticalGap: number;
  /** Extra padding inside a lane strip on the right (after ELK content). */
  laneContentRightPad: number;
  /** Extra padding before the first ELK column inside a lane (after the lane-name column). */
  laneContentLeftPad: number;
  /** `elk.spacing.nodeNode` — horizontal spacing between nodes. */
  elkNodeSpacing: number;
  /** `elk.layered.spacing.nodeNodeBetweenLayers` — spacing between Sugiyama layers. */
  elkLayerSpacing: number;
  /** Uniform `elk.padding` around the subgraph inside a lane. */
  elkDiagramPadding: number;
}

export const DEFAULT_LAYOUT_DIAGRAM_OPTIONS: LayoutDiagramOptions = {
  poolPad: 12,
  poolOriginX: 12,
  poolOriginY: 12,
  participantLabelBand: 44,
  laneLabelWidth: 44,
  laneVerticalGap: 0,
  laneContentRightPad: 40,
  laneContentLeftPad: 32,
  elkNodeSpacing: 52,
  elkLayerSpacing: 88,
  elkDiagramPadding: 44,
};

const BOUNDS = { min: 0, max: 800 } as const;

function clamp(n: number): number {
  return Math.min(BOUNDS.max, Math.max(BOUNDS.min, n));
}

/** Merges partial options with defaults and clamps values to supported bounds. */
export function mergeLayoutDiagramOptions(
  partial?: Partial<LayoutDiagramOptions>,
): LayoutDiagramOptions {
  const d = DEFAULT_LAYOUT_DIAGRAM_OPTIONS;
  if (!partial) return { ...d };
  const pick = (k: keyof LayoutDiagramOptions): number => {
    const v = partial[k];
    if (v === undefined) return d[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) return d[k];
    return clamp(v);
  };
  return {
    poolPad: pick('poolPad'),
    poolOriginX: pick('poolOriginX'),
    poolOriginY: pick('poolOriginY'),
    participantLabelBand: pick('participantLabelBand'),
    laneLabelWidth: pick('laneLabelWidth'),
    laneVerticalGap: pick('laneVerticalGap'),
    laneContentRightPad: pick('laneContentRightPad'),
    laneContentLeftPad: pick('laneContentLeftPad'),
    elkNodeSpacing: pick('elkNodeSpacing'),
    elkLayerSpacing: pick('elkLayerSpacing'),
    elkDiagramPadding: pick('elkDiagramPadding'),
  };
}

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

const LAYOUT_KEYS: (keyof LayoutDiagramOptions)[] = [
  'poolPad',
  'poolOriginX',
  'poolOriginY',
  'participantLabelBand',
  'laneLabelWidth',
  'laneVerticalGap',
  'laneContentRightPad',
  'laneContentLeftPad',
  'elkNodeSpacing',
  'elkLayerSpacing',
  'elkDiagramPadding',
];

/** Parses the `layout` field from JSON request bodies (e.g. `POST /api/compile`). */
export function parseLayoutDiagramOptionsFromJson(value: unknown): Partial<LayoutDiagramOptions> {
  if (!value || typeof value !== 'object') return {};
  const o = value as Record<string, unknown>;
  const out: Partial<LayoutDiagramOptions> = {};
  for (const k of LAYOUT_KEYS) {
    const n = asFiniteNumber(o[k]);
    if (n !== undefined) out[k] = n;
  }
  return out;
}
