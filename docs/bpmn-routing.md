# BPMN routing rules

Orthogonal-routing decisions for cross-lane and same-lane sequence flows
(`src/layout.ts`).

---

## Cross-lane flows: gateway top/bottom exit

When a gateway has an outgoing flow to an element in a different lane, the
port-distribution logic assigns a `bottom` exit port (target lane is below)
or a `top` exit port (target lane is above).  The routing then applies the
first matching rule:

### Rule 1 — Straight-down / straight-up (2-point)

**Condition:** the gateway exit x (`ep.x = gateway center x`) falls within the
target element's horizontal extent (`toB.x ≤ ep.x ≤ toB.x + toB.width`) AND
the straight vertical segment from the gateway exit to the target face is clear
of all other elements in the target lane.

**Route:** single vertical segment from the gateway exit to the target's top
face (downward flow) or bottom face (upward flow).

```
[Gateway]        [Gateway]
    ↓     or         ↑
[Target ]        [Target ]
```

**Rationale:** when the gateway is in the same ELK column as the target (a
task is wider than a gateway diamond, so the target's x-span contains the
gateway center), a direct vertical connection is visually correct.  Routing
via the inter-lane gap (chanY) would produce an unnecessary horizontal kink.

### Rule 2 — 5-point chanY elbow (default)

**Condition:** rule 1 does not apply (exit x is outside the target's x range
or an intermediate element blocks the direct path).

**Route:** exit vertically to the inter-lane gap (`chanY`), move horizontally
to `toB.x − 20 px` (the approach column), drop to the target center Y, then
enter from the target left face.

```
[Gateway]
    ↓ ep.x
    ·  ──────────→  ·   ← chanY (inter-lane gap)
                    ↓
                    · → [Target]
```

**Rationale:** when the gateway exit x is to the left of the target, any
element in the target lane sitting between `ep.x` and `toB.x` would be
clipped by a direct vertical segment.  The chanY detour routes safely around
such elements by travelling below the entire source lane before approaching
the target from the left.

---

## Cross-lane flows: right exit (non-gateway sources, or gateway with right port)

S-curve (4-point elbow): exit right face → horizontal to midpoint → vertical to
target center Y → horizontal into target left face.

---

## Same-lane flows

See `routeSameLane()` in `src/layout.ts` for backward arc (top loop or
left-side U-turn) and forward S-curve rules.
