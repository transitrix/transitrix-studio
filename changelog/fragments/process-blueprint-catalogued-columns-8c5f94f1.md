### Added

- **Process Blueprint catalogued columns render from the PROCESS element, and the compliance lane joins on that process (or a STEP of it).** A `PROCESS-…` column header and goal / result come from the child process (`name`, optional `goal` / `result`); restated view fields are ignored. Sketch `STAGE-…` columns keep their authored copy. The compliance overlay pins an assertion when `realised_via` names that process or a step whose home is that process, and no longer treats a sketch `STAGE-…` id as a join key. The STAGE-only fulfilment blueprint still renders as before.
