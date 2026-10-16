# T04 Action network

Open in **Reading view**. Expected: a network of four activities; two run in parallel after the first and both feed the last one.

```transitrix-action
notation: action
spec_version: "0.1"
title: Demo backlog
actions:
  - { id: ACTIVITY-D-1, name: Interview stakeholders, duration: 5, sort: 10 }
  - { id: ACTIVITY-D-2, name: Desk research, duration: 2, sort: 15, predecessors: [ACTIVITY-D-1] }
  - { id: ACTIVITY-D-3, name: Deep dive, duration: 8, sort: 16, predecessors: [ACTIVITY-D-1] }
  - { id: ACTIVITY-D-4, name: Synthesise findings, duration: 3, sort: 20, predecessors: [ACTIVITY-D-2, ACTIVITY-D-3] }
```
