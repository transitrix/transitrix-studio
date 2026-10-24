### Fixed

- **Canonical goal hierarchies.** Goals projections now read `goal_parent` relation records before selecting descendants and computing levels. VS Code, repository validation and staged-impact analysis share the same relationship-aware resolution. Date-scoped reparenting respects inclusive lifecycle boundaries; conflicting or multiple active parents are reported instead of silently choosing one.
