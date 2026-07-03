# BPMN layout & routing (layout v2)

Placement and orthogonal-routing architecture for BPMN process diagrams
(`src/layout.ts`, `src/layout-placement.ts`, `src/layout-routing.ts`).

Layout v2 replaced the previous hybrid (a global ELK pass for X coordinates
combined with per-lane ELK passes for Y, followed by per-flow routing
heuristics) with a single coherent pipeline: a lane-aware Sugiyama placement
and a channel-based orthogonal A* router.

---

## Placement (`layout-placement.ts`)

1. **Cycle breaking.** DFS over the global flow graph; back edges are
   reversed for layering only. Roots are chosen in declaration order,
   in-degree-0 nodes first, so results are deterministic.

2. **Column assignment.** Longest-path layering on the acyclic graph, then a
   pull-in pass that moves pure sources (no incoming flows) directly left of
   their earliest consumer. Every forward flow therefore ends in a strictly
   later column — the invariant behind “forward flows always point right”.

3. **Row ordering.** Barycenter sweeps (LTR + RTL) over `(lane × column)`
   cells. Neighbours in **other lanes** pull an element toward that lane’s
   side of its own lane, which shortens cross-lane flows and reduces
   crossings before any routing happens.

4. **Y coordinates.** Within a lane, each element *desires* the mean row of
   its already-placed same-lane neighbours (straight chains stay straight);
   elements with no same-lane predecessor desire the lane spine. Conflicts
   inside a cell are resolved with isotonic regression (PAVA) under minimum
   row gaps — equal desires spread symmetrically, which produces the classic
   symmetric gateway branch fan. The most populated row (the spine) is then
   aligned with the lane axis where the padding budget allows.

5. **X coordinates.** Columns are global across lanes; each element is
   centred within its column, so a gateway sitting under a task in an
   adjacent lane shares its centre X and vertical flows are straight.

## Routing (`layout-routing.ts`)

### Port conventions (unchanged from v1, verified by integration tests)

- Default exit is the **right face**; entry is the **left face**.
- Same-lane gateway splits distribute the diamond vertices: the most-above
  target exits **TOP**, the most-below exits **BOTTOM**, level targets exit
  **RIGHT** with a small Y-offset spread so no two arrows share a vertex.
- Cross-lane gateway branches exit **BOTTOM** (target lane below) or **TOP**
  (target lane above).
- Backward flows (loops) exit the source **LEFT face** and enter the target
  **LEFT face** (U-turn convention).
- Non-gateway sources with several same-lane forward exits spread the exit Y
  by ±8 px per flow.

### Path construction

1. **Fast paths.** A same-row forward flow whose straight segment is clear
   becomes a 2-point straight line. A vertical (TOP/BOTTOM) exit whose X
   falls within the target’s horizontal extent and whose vertical run is
   clear becomes a 2-point straight drop onto the target face.

2. **Sparse orthogonal grid.** Vertical travel happens in the channels
   between columns (plus column centres); horizontal travel happens in
   corridors — free strips inside lanes computed from merged element
   extents, plus inter-lane gap centres. Channels and corridors are
   obstacle-free by construction; every remaining candidate segment is
   tested against element rectangles inflated by 6 px, so routed paths can
   never clip a shape.

3. **A\* search** per flow (forward flows first, short spans first, then
   backward loops; all ties broken deterministically) with the cost model:
   - segment length (Manhattan);
   - `BEND_COST` (40) per 90° turn;
   - `REUSE_COST` (32) per grid segment already occupied by an earlier flow
     (congestion — pushes parallel flows into separate tracks);
   - `CROSS_COST` (45) per crossing of a perpendicular routed run;
   - a micro-bias that places vertical runs near the target column and
     horizontal runs near the target row (the “late turn / approach column”
     visual convention).
   Flows leave and enter ports through a 12 px straight stub, and the goal
   may only be reached by a step in the entry direction — never by an
   in-place turn — so arrows always arrive straight.

4. **Nudging.** Interior parallel segments that overlap inside one channel
   or corridor are spread onto distinct tracks (6 px step, ±18 px max),
   ordered by their flow’s entry coordinate so tracks do not cross inside
   the channel.

### Quality gates

`src/metrics.ts` computes crossings, bends, edge length, spine deviation,
empty area and port violations for the corpus under
`tests/fixtures/notation-corpus/bpmn/`; `tests/metrics-regression.test.ts`
fails when a change regresses any diagram beyond tolerance. Regenerate the
baseline after an intentional layout change with `npm run metrics:baseline`.
