# Layout Quality Metrics

**Version:** 0.1  
**Date:** 2026-05-03  
**Scope:** Objective, measurable indicators of BPMN diagram layout quality.  
**Related:** [`roadmap.md`](../roadmap.md) Phase 11, [`method/methodology.md`](../method/methodology.md) Section 5

---

## Overview

Layout quality cannot be optimized without measurement. This document defines nine metrics, each computed from `LayoutIr` after the layout algorithm completes. Metrics are deterministic, inexpensive to compute, and tied to the four acceptance criteria from RD-054.

**Aggregate score** combines these metrics with axiomatic weights, subject to revision when visual review reveals systematic mismatches.

---

## 1. Structural Metrics

### 1.1 Crossings

**Definition:** Count of orthogonal segment intersections in the final routing (excluding intersections at shared waypoints).

**Rationale:** Every crossing increases cognitive load and makes the diagram harder to follow. Minimizing crossings is a foundational goal in graph drawing (Purchase 1997, "Which Aesthetics Has the Greatest Effect on Human Understanding?").

**Formal definition:**
- For each pair of sequence flows `(f1, f2)`, check if their waypoint paths intersect at an interior point.
- Two segments intersect at an interior point if their orthogonal projections overlap and they cross at a unique non-endpoint location.
- Sum total across all pairs.

**Edge cases:**
- Flows sharing a waypoint (e.g., two flows from a gateway) do not count as a crossing.
- A crossing at a flow endpoint does not count (endpoint is allowed to be "touched").
- Self-overlapping path (same flow visiting the same segment twice) counts as one crossing per unique pair of segments.

**Target:** ≤ baseline (TBD after first run on corpus).

---

### 1.2 Bends

**Definition:** Total number of direction changes (90° turns) in all sequence flows.

**Rationale:** Orthogonal routing always produces bends. Too many bends create visual "noise"; too few may require long detours that increase crossings. Bends are a secondary metric after crossings.

**Formal definition:**
- For each flow, count the number of segments in its waypoint path.
- A straight line `[p1, p2, p3]` where p1→p2→p3 are collinear is **one segment** (zero bends between them).
- A turn `[p1, p2, p3]` where p1→p2 and p2→p3 are orthogonal is **two segments** (one bend at p2).
- Total bends = Σ (segments − 1) across all flows.

**Edge cases:**
- A flow with a single straight waypoint path (e.g., `[source.center, target.center]`) has 0 bends.
- Port-to-port paths (e.g., `[source.right, ...target.left]`) contribute based on the actual waypoint array, not the implicit entry/exit.

**Target:** ≤ baseline.

---

### 1.3 Edge Length (Manhattan)

**Definition:** Sum of Manhattan distances of all flow segments.

**Rationale:** Long paths increase visual clutter and make the diagram sprawl. Orthogonal routing's segment lengths directly reflect the layout algorithm's efficiency.

**Formal definition:**
- For each segment `(p1, p2)` in the flow waypoint path: `distance = |p1.x − p2.x| + |p1.y − p2.y|`.
- Total edge length = Σ distance across all segments and all flows.

**Unit:** pixels.

**Target:** ≤ baseline.

---

### 1.4 Waypoint Density

**Definition:** Average number of waypoints per flow.

**Rationale:** High density indicates complex routing; low density is simpler. Not a primary driver but useful for sanity checks.

**Formal definition:**
- `waypointDensity = Σ (waypoints per flow) / count(flows)`.

**Edge cases:**
- A direct `[from, to]` flow has 2 waypoints.
- Flows with intermediate waypoints are counted as-is.

**Target:** Monitor, no hard threshold.

---

## 2. BPMN-Specific Metrics

### 2.1 Spine Deviation

**Definition:** Per-lane measure of how far the "happy path" elements deviate from their lane's horizontal centreline (swimlane axis).

**Rationale:** Directly targets RD-054 criterion 1 (lane spine alignment). Spine is the sequence of elements on the primary flow through the lane.

**Formal definition:**
- **Spine definition**: For each lane, identify the "main path" — the longest sequence of elements reachable via single forward-flow edges (no branching). If multiple paths of equal length exist, pick the one with the most incoming flows to the lane.
- **Axis**: `axisY = lane.bounds.y + lane.bounds.height / 2` (horizontal centreline).
- **Deviation per element**: `|element.center.y − axisY|` for each element in the spine.
- **Lane deviation**: maximum deviation within that lane's spine.
- **Aggregate**: `spineDeviation = median(lane deviations)` across all lanes.

**Unit:** pixels.

**Target:** ≤ 4 px (spine elements within 4 px of their axis; consistent with Phase 3 Step D snap preference).

---

### 2.2 Empty Area Ratio

**Definition:** Fraction of lane bounding box area not occupied by any element.

**Rationale:** Large empty bands (RD-055's primary defect) indicate poor element distribution. Targets the visual complaint: "elements stranded far right with huge gaps to the left."

**Formal definition:**
- **Lane bounding box**: axis-aligned rectangle containing all lane elements.
- **Occupied area**: Σ (width × height) of all element bounds within the lane.
- **Empty area**: `lane.bbox.area − occupied.area`.
- **Ratio per lane**: `emptyRatio = empty / lane.bbox.area`.
- **Aggregate**: `emptyArea = median(ratios)` across all lanes with >1 element. Lanes with 0 or 1 element are excluded (not meaningful).

**Unit:** dimensionless (0.0 to 1.0).

**Target:** ≤ 0.30 (max 30% empty).

**Note (post-RD-051, 2026-05-04):** After stakeholder decision on RD-051 (variant C), `emptyArea` is monitored as a **diagnostic metric**, not a hard acceptance gate. For multi-lane vertical pipeline processes, values of 60–80% are accepted as structural, not a defect. This reflects the layout algorithm's priority: correct routing and swimlane alignment over horizontal compactness. See `docs/baseline-2026-05-03.md` and `roadmap.md` RD-055 for context.

---

### 2.3 Port Violations

**Definition:** Count of sequence flows whose entry/exit ports violate the horizontal port rule (RD-054 criterion 2).

**Rationale:** Horizontal routing (left/right exits) is the primary routing aesthetic. Top/bottom exits are only permitted for cross-lane flows arriving from adjacent lanes.

**Formal definition:**
- **Horizontal port rule**: A flow must exit its source through the LEFT or RIGHT port, and enter its target through the LEFT or RIGHT port, with exceptions:
  - **Cross-lane up** (target lane is above source): exit and entry may be TOP.
  - **Cross-lane down** (target lane is below source): exit and entry may be BOTTOM.
- **Same-lane flows** must always exit and enter LEFT or RIGHT.
- **Port assignment**: determined by the first and last segment direction of the waypoint path.
  - If last segment before source is horizontal (±X), source exit is LEFT or RIGHT.
  - If last segment before source is vertical (±Y), source exit is TOP or BOTTOM.
- **Violation**: a flow whose port assignment contradicts the rule above.
- **Count**: total violations across all flows.

**Target:** 0 violations.

---

### 2.4 Port Uniqueness

**Definition:** Fraction of flows exiting from distinct ports at multi-exit gateways.

**Rationale:** Gateway port distribution (RD-054 criterion 4) requires that multiple outgoing flows use different ports. Uniqueness measures compliance.

**Formal definition:**
- For each gateway element with ≥2 outgoing flows:
  - Determine the exit port for each outgoing flow (LEFT, RIGHT, TOP, BOTTOM).
  - Count distinct ports used.
  - **Gateway uniqueness** = `distinct_ports / outgoing_flows` (capped at 1.0).
- **Aggregate**: `portUniqueness = mean(gateway uniquenesses)` across all gateways with ≥2 outgoing flows.

**Unit:** dimensionless (0.0 to 1.0).

**Target:** = 1.0 (perfect: all flows use distinct ports).

---

### 2.5 Lane Axis Alignment

**Definition:** Fraction of single-column elements (isolated in their X range within their lane) that are snapped to the swimlane axis.

**Rationale:** Phase 3 Step D snaps single-column elements to the axis to make cross-lane flows straight. This metric tracks how many actually landed on the axis.

**Formal definition:**
- **Single-column element**: an element that, within its lane, is the only one occupying its ELK column (no other element in the lane shares the same rounded X coordinate).
- **On-axis**: `|element.center.y − axisY| ≤ 4 px` (same tolerance as RD-054 spine alignment).
- **Alignment ratio**: `elements_on_axis / total_single_column_elements` per lane.
- **Aggregate**: `laneAxisAlignment = mean(alignment ratios)` across all lanes.

**Unit:** dimensionless (0.0 to 1.0).

**Target:** = 1.0 (all single-column elements are axis-aligned).

---

## 3. Aggregate Quality Score

### Definition

A single summary number combining the five primary metrics with axiomatic weights.

```
LayoutScore = 1000 × (1 - crossingsNorm) × (1 - spineDevNorm) × (1 - portViolNorm)
            × (1 - emptyAreaNorm) × laneAxisAlign
            
where:
  crossingsNorm = min(crossings / crossingsBaseline, 1.0)
  spineDevNorm = min(spineDeviation / 4.0, 1.0)
  portViolNorm = min(portViolations / max(flows / 4, 1), 1.0)
  emptyAreaNorm = emptyArea (already 0.0–1.0)
  laneAxisAlign = laneAxisAlignment (0.0–1.0)
```

**Interpretation:**
- LayoutScore in [0, 1000].
- Score decreases multiplicatively with each defect; all five must be good for a high score.
- `laneAxisAlign` is kept separate as a positive factor (reward for alignment, not penalty).
- Baseline values (`crossingsBaseline`, etc.) are set after the first corpus run (RD-088).

### Weight Rationale

1. **Crossings** (multiplicative, heaviest weight): Primary cognitive load driver; graph drawing literature consensus.
2. **Spine deviation** (multiplicative, heavy): Directly targets RD-054 criterion 1.
3. **Port violations** (multiplicative, medium): Targets RD-054 criterion 2.
4. **Empty area** (multiplicative, medium): Targets the visual defect RD-055.
5. **Lane axis alignment** (multiplicative, reward): Bonus for achieving the structural goal of Phase 3 Step D.

### Revision Rule

If visual review of baseline diagrams (RD-090) reveals that LayoutScore rank order contradicts human judgment (e.g., a low-score diagram looks better than a high-score one), the weight vector is revised. Such revisions are documented in `baseline-{date}.md` with the rationale.

---

## 4. Measurement Pseudocode

### Crossing Detection

```
function countCrossings(flows: SequenceFlow[]): number {
  let count = 0
  for (let i = 0; i < flows.length; i++) {
    for (let j = i + 1; j < flows.length; j++) {
      if (orthogonalPathsIntersect(flows[i].waypoints, flows[j].waypoints)) {
        count++
      }
    }
  }
  return count
}

function orthogonalPathsIntersect(path1, path2): boolean {
  for (let i = 0; i < path1.length - 1; i++) {
    for (let j = 0; j < path2.length - 1; j++) {
      const seg1 = [path1[i], path1[i + 1]]
      const seg2 = [path2[j], path2[j + 1]]
      if (orthogonalSegmentsIntersect(seg1, seg2)) {
        return true
      }
    }
  }
  return false
}

function orthogonalSegmentsIntersect([p1, p2], [p3, p4]): boolean {
  // Assume p1→p2 is axis-aligned and p3→p4 is axis-aligned
  if (p1.x === p2.x && p3.y === p4.y) {
    // seg1 is vertical, seg2 is horizontal
    return p1.x > min(p3.x, p4.x) && p1.x < max(p3.x, p4.x) &&
           p3.y > min(p1.y, p2.y) && p3.y < max(p1.y, p2.y)
  }
  if (p1.y === p2.y && p3.x === p4.x) {
    // seg1 is horizontal, seg2 is vertical
    return p1.y > min(p3.y, p4.y) && p1.y < max(p3.y, p4.y) &&
           p3.x > min(p1.x, p2.x) && p3.x < max(p1.x, p2.x)
  }
  return false
}
```

### Spine Deviation

```
function computeSpineDeviation(layout: LayoutIr): number {
  const laneDeviations = []
  for (const lane of layout.lanes) {
    const spine = findMainPath(lane)
    const axisY = lane.bounds.y + lane.bounds.height / 2
    const maxDev = max(spine.map(el => Math.abs(el.bounds.center.y - axisY)))
    laneDeviations.push(maxDev)
  }
  return median(laneDeviations)
}
```

---

## 5. Implementation Notes

- All metric functions are **pure**: same input always produces the same output.
- All are **deterministic**: no randomness.
- Computation cost is **polynomial** in element/flow count (O(n²) for crossings, O(n) for others).
- Results are **cached** in `LayoutMetrics` struct; composite scores reuse cached values.
- **Precision**: all pixel measurements use `number` (IEEE 754 double); tolerance thresholds (e.g., 4 px for axis snap) are explicitly noted.

---

## 6. Related Documents

- [`method/methodology.md`](../method/methodology.md) Section 6 — routing rules R1–R6 underlying the port violations metric.
- [`method/methodology.md`](../method/methodology.md) Section 5 — step-by-step methodology and metric rationale.
- [`roadmap.md`](../roadmap.md) Phase 11 — implementation plan (RD-079…095).
