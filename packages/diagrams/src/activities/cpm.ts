import type { Activity, CpmResult, CpmValues } from './types.js';

export function computeCpm(activities: Activity[]): CpmResult {
  const result: CpmResult = new Map();

  if (activities.length === 0) return result;

  // When no activity carries any duration data, critical path is indeterminate —
  // return all non-critical so the diagram renders in default grey.
  const hasDuration = activities.some(
    (a) => (a.duration !== undefined && a.duration !== null) || (a.duration_days !== undefined && a.duration_days !== null),
  );
  if (!hasDuration) {
    for (const a of activities) {
      result.set(a.id, { es: 0, ef: 0, ls: 0, lf: 0, slack: 0, isCritical: false });
    }
    return result;
  }

  // Build successor map and in-degree for topological sort
  const successors = new Map<string, string[]>();
  const predecessors = new Map<string, string[]>();
  for (const a of activities) {
    successors.set(a.id, []);
    predecessors.set(a.id, a.predecessors?.filter(p => p !== a.id) ?? []);
  }
  for (const a of activities) {
    for (const pred of (predecessors.get(a.id) ?? [])) {
      successors.get(pred)?.push(a.id);
    }
  }

  // Topological sort (Kahn's)
  const inDegree = new Map<string, number>();
  for (const a of activities) {
    inDegree.set(a.id, (predecessors.get(a.id) ?? []).length);
  }
  const queue: string[] = [];
  for (const a of activities) {
    if ((inDegree.get(a.id) ?? 0) === 0) queue.push(a.id);
  }
  const topoOrder: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    topoOrder.push(id);
    for (const succ of (successors.get(id) ?? [])) {
      const newDeg = (inDegree.get(succ) ?? 1) - 1;
      inDegree.set(succ, newDeg);
      if (newDeg === 0) queue.push(succ);
    }
  }

  const actById = new Map(activities.map(a => [a.id, a]));

  // Forward pass
  const es = new Map<string, number>();
  const ef = new Map<string, number>();
  for (const id of topoOrder) {
    const a = actById.get(id)!;
    const dur = a.duration ?? a.duration_days ?? 0;
    const maxPredEf = Math.max(0, ...(predecessors.get(id) ?? []).map(p => ef.get(p) ?? 0));
    es.set(id, maxPredEf);
    ef.set(id, maxPredEf + dur);
  }

  // Project finish
  const projectFinish = Math.max(0, ...[...ef.values()]);

  // Backward pass
  const ls = new Map<string, number>();
  const lf = new Map<string, number>();
  for (const id of [...topoOrder].reverse()) {
    const a = actById.get(id)!;
    const dur = a.duration ?? a.duration_days ?? 0;
    const succs = successors.get(id) ?? [];
    const minSuccLs = succs.length === 0 ? projectFinish : Math.min(...succs.map(s => ls.get(s) ?? projectFinish));
    lf.set(id, minSuccLs);
    ls.set(id, minSuccLs - dur);
  }

  // Assemble result
  for (const id of topoOrder) {
    const esV = es.get(id) ?? 0;
    const efV = ef.get(id) ?? 0;
    const lsV = ls.get(id) ?? 0;
    const lfV = lf.get(id) ?? 0;
    const slack = lsV - esV;
    result.set(id, { es: esV, ef: efV, ls: lsV, lf: lfV, slack, isCritical: slack <= 0 });
  }

  // Cycle defence: Kahn's topo-order silently omits any activity that's part
  // of a cycle (its in-degree never reaches zero), and the forward/backward
  // passes above skip those nodes. The validator's ACT-006 is the
  // authoritative cycle error — but layoutActivities is reachable without
  // validation, so fill the omitted nodes with neutral CPM values so
  // downstream consumers don't see `undefined` entries. Cyclic activities
  // simply render without critical-path highlighting.
  if (topoOrder.length < activities.length) {
    for (const a of activities) {
      if (!result.has(a.id)) {
        result.set(a.id, { es: 0, ef: 0, ls: 0, lf: 0, slack: 0, isCritical: false });
      }
    }
  }

  return result;
}
