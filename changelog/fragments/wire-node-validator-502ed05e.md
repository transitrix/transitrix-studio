### Added

- **`NODE` element-envelope validation wired into `validate --scope=repo`.** The `node` notation's per-notation validator (`NOD-001`, `NOD-002`) existed in `@transitrix/diagrams` but had no caller anywhere in the CLI or extension — a hand-authored `NODE-*.yaml` file missing envelope fields, or with an invalid `type`, produced zero findings. One of the ten dead per-notation envelope validators being wired in, one notation per change.
