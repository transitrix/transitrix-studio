### Fixed

- **Goal-tree and capability-map collapse toggle is visible on expanded parents.** The ± button on a node with children was gated on `hasHiddenChildren`, which is only true after the subtree is already hidden — so a fully expanded tree never showed the control. The toggle now appears whenever the node has children (minus to collapse, plus to expand), matching the static capability-tree SVG renderer.
