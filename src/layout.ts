/**
 * BPMN diagram layout — orchestrator (layout v2).
 *
 * Pipeline:
 *   1. `computePlacement` (layout-placement.ts) — lane-aware Sugiyama:
 *      cycle breaking → global columns → barycenter row ordering →
 *      PAVA-based Y assignment → column-centred X assignment.
 *   2. `routeFlows` (layout-routing.ts) — channel-based orthogonal A*
 *      router with port conventions, congestion penalties and nudging.
 *
 * See docs/internal/bpmn-routing.md for the routing conventions.
 */

import type { LayoutIr, ProcessIr, PositionedAssociation } from './ir.js';
import { mergeLayoutDiagramOptions, type LayoutDiagramOptions } from './layout-options.js';
import { computePlacement } from './layout-placement.js';
import { routeFlows } from './layout-routing.js';

export async function layoutProcess(
  ir: ProcessIr,
  layoutOpts?: Partial<LayoutDiagramOptions>,
): Promise<LayoutIr> {
  const o = mergeLayoutDiagramOptions(layoutOpts ?? {});

  const placement = computePlacement(ir, o);
  const flows = routeFlows(ir, placement, o);

  const associations: PositionedAssociation[] = (ir.associations ?? []).map((a) => {
    const fb = placement.elements.get(a.from);
    const tb = placement.elements.get(a.to);
    return {
      ...a,
      waypoints: fb && tb
        ? [
            { x: fb.x + fb.width / 2, y: fb.y + fb.height / 2 },
            { x: tb.x + tb.width / 2, y: tb.y + tb.height / 2 },
          ]
        : [],
    };
  });
  associations.sort((a, b) => a.id.localeCompare(b.id));

  return {
    process: ir,
    elements: placement.elements,
    laneBounds: placement.laneBounds,
    poolBounds: placement.poolBounds,
    flows,
    associations,
  };
}
