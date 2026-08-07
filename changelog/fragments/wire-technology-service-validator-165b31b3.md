### Added

- **`TECHNOLOGY_SERVICE` element-envelope validation wired into `validate --scope=repo`.** The `technology-service` notation's per-notation validator (`TSVC-001`, `TSVC-002`, `TSVC-003`) existed in `@transitrix/diagrams` but had no caller anywhere in the CLI or extension — a hand-authored `TECHNOLOGY_SERVICE-*.yaml` file missing envelope fields, or with an invalid `type`, produced zero findings. Last of the ten dead per-notation envelope validators being wired in.
