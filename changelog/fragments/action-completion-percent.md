### Fixed

- **ACTION completion in previews.** Action, DGA and DGCA previews read completion percentages from the model's `analytics/action-progress.ndjson` sidecar. Action's Network, Gantt and Tree views share the seven-day freshness rule and the enabled-by-default completion control. Invalid or duplicate rows produce no percentage; missing-data placeholders require a tracker link.
