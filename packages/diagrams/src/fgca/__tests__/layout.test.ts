import { describe, it, expect, vi, beforeAll } from "vitest";

// reactflow uses browser APIs — stub the minimum required before importing layout
beforeAll(() => {
  vi.mock("reactflow", () => ({
    Position: { Left: "left", Right: "right" },
    MarkerType: { ArrowClosed: "arrowclosed" },
  }));
});

import { buildFGCALayout } from "../layout";
import type { DriverItem, GoalItem, BdnChangeWithActivities, ActivityItem } from "../types";
import { ALL_FGCA_COLUMNS } from "../types";

const ALL_COLS = new Set(ALL_FGCA_COLUMNS);

const factors: DriverItem[] = [
  { id: 1, name: "Digital growth" },
  { id: 2, name: "Talent shortage" },
];

const goals: GoalItem[] = [
  { id: 10, name: "Grow revenue", level: 0, factor: [{ id: 1 }] },
  { id: 11, name: "Build talent pipeline", level: 1, factor: [{ id: 2 }] },
];

const changes: BdnChangeWithActivities[] = [
  { id: 100, name: "Launch digital channel", goal_id: 10, activity_ids: [200] },
  { id: 101, name: "Partner with bootcamps", goal_id: 11, activity_ids: [201] },
];

const activities: ActivityItem[] = [
  { id: 200, name: "Build e-commerce MVP", goal_id: 10, activity_type_id: 1 },
  { id: 201, name: "Run hiring sprint", goal_id: 11, activity_type_id: 1 },
];

describe("buildFGCALayout — all columns visible", () => {
  const { nodes, edges } = buildFGCALayout({
    factors,
    goals,
    changes,
    activities,
    visibleColumns: ALL_COLS,
    activityTypeList: [{ id: 1, name: "Initiative" }],
  });

  it("produces the correct number of nodes", () => {
    expect(nodes).toHaveLength(factors.length + goals.length + changes.length + activities.length);
  });

  it("assigns correct node types", () => {
    const types = nodes.map((n) => n.type);
    expect(types.filter((t) => t === "fgcaDriver")).toHaveLength(factors.length);
    expect(types.filter((t) => t === "fgcaGoal")).toHaveLength(goals.length);
    expect(types.filter((t) => t === "fgcaChange")).toHaveLength(changes.length);
    expect(types.filter((t) => t === "fgcaActivity")).toHaveLength(activities.length);
  });

  it("creates Factor→Goal edges", () => {
    const fgEdges = edges.filter((e) => e.source.startsWith("driver_") && e.target.startsWith("goal_"));
    expect(fgEdges).toHaveLength(2);
    expect(fgEdges.find((e) => e.source === "driver_1" && e.target === "goal_10")).toBeTruthy();
  });

  it("creates Goal→Change edges", () => {
    const gcEdges = edges.filter((e) => e.source.startsWith("goal_") && e.target.startsWith("change_"));
    expect(gcEdges).toHaveLength(2);
  });

  it("creates Change→Activity edges", () => {
    const caEdges = edges.filter((e) => e.source.startsWith("change_") && e.target.startsWith("activity_"));
    expect(caEdges).toHaveLength(2);
  });

  it("does NOT create direct Goal→Activity edges when Change column is visible and all activities are covered", () => {
    const directEdges = edges.filter(
      (e) => e.source.startsWith("goal_") && e.target.startsWith("activity_")
    );
    expect(directEdges).toHaveLength(0);
  });

  it("uses the activity type name in activity node data", () => {
    const actNode = nodes.find((n) => n.id === "activity_200");
    expect(actNode?.data.activityTypeName).toBe("Initiative");
  });

  it("encodes F-XXXX label format via id in node data", () => {
    const factorNode = nodes.find((n) => n.id === "driver_1");
    expect(String(factorNode?.data.id).padStart(4, "0")).toBe("0001");
  });

  it("encodes C-XXX label format via id in node data", () => {
    const changeNode = nodes.find((n) => n.id === "change_100");
    expect(String(changeNode?.data.id).padStart(3, "0")).toBe("100");
  });
});

describe("buildFGCALayout — Driver column hidden", () => {
  const cols = new Set(ALL_FGCA_COLUMNS.filter((c) => c !== "driver"));
  const { nodes, edges } = buildFGCALayout({ factors, goals, changes, activities, visibleColumns: cols });

  it("produces no driver nodes", () => {
    expect(nodes.filter((n) => n.type === "fgcaDriver")).toHaveLength(0);
  });

  it("produces no Driver→Goal edges", () => {
    expect(edges.filter((e) => e.source.startsWith("driver_"))).toHaveLength(0);
  });

  it("still produces Goal and downstream nodes", () => {
    expect(nodes.filter((n) => n.type === "fgcaGoal")).toHaveLength(goals.length);
  });
});

describe("buildFGCALayout — Change column hidden", () => {
  const cols = new Set(ALL_FGCA_COLUMNS.filter((c) => c !== "change"));
  const { nodes, edges } = buildFGCALayout({ factors, goals, changes, activities, visibleColumns: cols });

  it("produces no change nodes", () => {
    expect(nodes.filter((n) => n.type === "fgcaChange")).toHaveLength(0);
  });

  it("creates direct Goal→Activity edges when Change column is hidden", () => {
    const directEdges = edges.filter(
      (e) => e.source.startsWith("goal_") && e.target.startsWith("activity_")
    );
    expect(directEdges.length).toBeGreaterThan(0);
  });
});

describe("buildFGCALayout — only one column visible", () => {
  const { nodes, edges } = buildFGCALayout({
    factors,
    goals,
    changes,
    activities,
    visibleColumns: new Set(["goal"] as const),
  });

  it("produces only goal nodes", () => {
    expect(nodes.filter((n) => n.type !== "fgcaGoal")).toHaveLength(0);
  });

  it("produces no edges", () => {
    expect(edges).toHaveLength(0);
  });
});

describe("buildFGCALayout — columns are positioned left to right", () => {
  const { nodes } = buildFGCALayout({ factors, goals, changes, activities, visibleColumns: ALL_COLS });

  it("factor column x < goal column x", () => {
    const f = nodes.find((n) => n.type === "fgcaDriver")!;
    const g = nodes.find((n) => n.type === "fgcaGoal")!;
    expect(f.position.x).toBeLessThan(g.position.x);
  });

  it("goal column x < change column x", () => {
    const g = nodes.find((n) => n.type === "fgcaGoal")!;
    const c = nodes.find((n) => n.type === "fgcaChange")!;
    expect(g.position.x).toBeLessThan(c.position.x);
  });

  it("change column x < activity column x", () => {
    const c = nodes.find((n) => n.type === "fgcaChange")!;
    const a = nodes.find((n) => n.type === "fgcaActivity")!;
    expect(c.position.x).toBeLessThan(a.position.x);
  });

  // Pre-release blocker regression (orchestrator review 2026-05-21).
  it("[blocker] tolerates a change with no activity_ids (optional per validator)", () => {
    const changesNoIds: BdnChangeWithActivities[] = [
      { id: 100, name: "No activities", goal_id: 10 } as BdnChangeWithActivities,
    ];
    expect(() =>
      buildFGCALayout({ factors, goals, changes: changesNoIds, activities, visibleColumns: ALL_COLS }),
    ).not.toThrow();
  });
});
