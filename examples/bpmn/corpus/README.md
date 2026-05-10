# Test Corpus Catalog

**Version:** 0.3  
**Generated:** 2026-05-03  
**Count:** 11 diagrams (5 new added; target 14–18 after Phase 11.3)

This table lists all diagrams in `examples/bpmn/corpus/` with their structural properties and coverage matrix cell.

| Filename | Elements | Flows | Cross-lane % | Cycles | Gateways | Lanes | Cell | Purpose |
|----------|----------|-------|--------------|--------|----------|-------|------|---------|
| `simple-linear.cervin.yaml` | 6 | 5 | 0% | No | 0 | 1 | S-Lo-A-Lo-1 | Minimal baseline; pure same-lane, no gates |
| `simple-approval.cervin.yaml` | 8 | 7 | 29% | No | 1 (XOR) | 2 | S-Mi-A-Lo-2 | Basic cross-lane routing; horizontal port rule |
| `small-dense-approval.cervin.yaml` | 9 | 11 | 75% | No | 4 (2 AND, 1 XOR) | 2 | S-Hi-A-Hi-2 | Dense gates, high cross-lane; parallel paths |
| `approval-single-lane.cervin.yaml` | 11 | 10 | 0% | No | 1 (XOR) | 1 | M-Lo-A-Lo-1 | Medium same-lane; gateway port distribution |
| `parallel-approval.cervin.yaml` | 13 | 12 | 42% | No | 4 (1 XOR, 2 AND) | 2 | M-Mi-A-Hi-2 | Multi-gate coordination; parallel execution |
| `medium-complex-workflow.cervin.yaml` | 15 | 18 | 86% | No | 6 (3 AND, 3 XOR) | 3 | M-Hi-A-Hi-3 | Dense gates, very high cross-lane; complex routing |
| `order-processing.cervin.yaml` | 14 | 13 | 46% | Yes | 4 (1 XOR, 2 AND) | 3 | M-Mi-C-Hi-3 | Multi-lane; gateway distribution; backward edge |
| `large-order-process.cervin.yaml` | 35 | 26 | 24% | Yes (requeue loop) | 6 (2 XOR, 1 AND) | 3 | L-Mi-A-Lo-3 | Large diagram; scaling test; processing pipeline |
| `large-dense-workflow.cervin.yaml` | 24 | 29 | 78% | No | 10 (4 AND, 6 XOR) | 4 | L-Hi-A-Hi-4 | Dense gates, high cross-lane; stress test |
| `large-cyclic-workflow.cervin.yaml` | 22 | 25 | 76% | Yes (rework loop) | 10 (4 AND, 6 XOR) | 4 | L-Hi-C-Hi-4 | Dense gates, cyclic; backward routing test |
| `xlarge-stress-test.cervin.yaml` | 52 | 54 | 82% | No | 20 (8 AND, 12 XOR) | 5 | XL-Hi-A-Hi-4+ | Stress test: 50+ elements, extreme complexity |

## High-Priority Cells Still Needed (2–3 more)

| Cell | Purpose | Status |
|------|---------|--------|
| S-Hi-A-Hi-2 | Small, dense gates, high cross-lane | ✓ DONE |
| M-Hi-A-Hi-3 | Medium, high gates, many cross-lane | ✓ DONE |
| L-Hi-A-Hi-4 | Large, dense gates, many cross-lane | ✓ DONE |
| L-Hi-C-Hi-4 | Large, cycle, complex (multi-cycle) | ✓ DONE |
| XL-Hi-A-Hi-4+ | Stress test: 50+ elements | ✓ DONE |

## Optional Additional Coverage (for Phase 11.4+)

| Cell | Purpose | Status |
|------|---------|--------|
| M-Hi-C-Hi-3 | Medium, high gates, cyclic | DEFERRED |
| L-Lo-A-Lo-1 | Large, sparse gates, few cross-lane | DEFERRED |
| L-Hi-A-Lo-2 | Large, dense gates, sparse cross-lane | DEFERRED |

## Notes

- **Acyclic** diagrams are preferred for baseline (simpler to reason about); cyclic examples test backward routing and cycle-breaking heuristics.
- **Gateway density** ranges from 0% (only tasks/events) to 100% (only gateways). Most real processes cluster around 10–30%.
- **Cross-lane share** measures flows connecting different lanes; 0% is pure same-lane, 100% is every flow goes cross-lane.
- Each file is validated via `BpmnModdle.fromXML` during test runs to ensure valid BPMN 2.0 output.

## Phase 11.3 Completion (RD-081)

✓ All high-priority cells completed (11 diagrams total):
- S-Hi-A-Hi-2: Small, dense gates, high cross-lane (✓ small-dense-approval.cervin.yaml)
- M-Hi-A-Hi-3: Medium, dense gates, high cross-lane (✓ medium-complex-workflow.cervin.yaml)
- L-Hi-A-Hi-4: Large, dense gates, high cross-lane (✓ large-dense-workflow.cervin.yaml)
- L-Hi-C-Hi-4: Large, dense gates, cyclic (✓ large-cyclic-workflow.cervin.yaml)
- XL-Hi-A-Hi-4+: Stress test 50+ elements (✓ xlarge-stress-test.cervin.yaml)

## Optional Next Steps (Phase 11.4+)

Add 2–3 optional diagrams for additional coverage:
1. M-Hi-C-Hi-3: Medium with cycles and dense gates
2. L-Lo-A-Lo-1: Large, sparse gates (performance baseline)
3. L-Hi-A-Lo-2: Large, dense gates, sparse cross-lane (routing complexity)
