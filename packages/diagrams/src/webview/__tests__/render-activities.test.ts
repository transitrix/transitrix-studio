/**
 * Unit tests for renderActivitiesSvg — project-node suppression (#421).
 *
 * Convention: activities with activity_type === 'project' are omitted from
 * the Network/PSND layout by default (suppressProjectNodes: true). Text/Tree
 * views keep them via the caller; data is never mutated.
 */
import { describe, it, expect } from 'vitest';
import { renderActivitiesSvg } from '../render-activities.js';
import type { ActivityDoc } from '../../activities/types.js';

const BASE_DOC: ActivityDoc = {
  notation: 'action',
  activities: [
    {
      id: 'PROJ-1',
      name: 'Platform Launch',
      activity_type: 'project',
    },
    {
      id: 'TASK-1',
      name: 'Design',
      activity_type: 'task',
      parent: 'PROJ-1',
    },
    {
      id: 'TASK-2',
      name: 'Implement',
      activity_type: 'task',
      parent: 'PROJ-1',
      predecessors: ['TASK-1'],
    },
  ],
};

describe('renderActivitiesSvg — project-node suppression (#421)', () => {
  it('suppresses project-type nodes in the network SVG by default', () => {
    const svg = renderActivitiesSvg(BASE_DOC);
    // TASK-1 and TASK-2 should appear as rendered nodes.
    expect(svg).toContain('TASK-1');
    expect(svg).toContain('TASK-2');
    // The project container should not appear as a rendered node.
    expect(svg).not.toContain('PROJ-1');
  });

  it('suppresses project nodes when suppressProjectNodes is explicitly true', () => {
    const svg = renderActivitiesSvg(BASE_DOC, { suppressProjectNodes: true });
    expect(svg).not.toContain('PROJ-1');
    expect(svg).toContain('TASK-1');
  });

  it('renders project nodes when suppressProjectNodes is false', () => {
    const svg = renderActivitiesSvg(BASE_DOC, { suppressProjectNodes: false });
    expect(svg).toContain('PROJ-1');
    expect(svg).toContain('TASK-1');
    expect(svg).toContain('TASK-2');
  });

  it('does not mutate the original doc', () => {
    const original = BASE_DOC.activities.length;
    renderActivitiesSvg(BASE_DOC);
    expect(BASE_DOC.activities).toHaveLength(original);
  });

  it('suppresses project_type matching case-insensitively', () => {
    const doc: ActivityDoc = {
      notation: 'action',
      activities: [
        { id: 'P1', name: 'Container', activity_type: 'Project' },
        { id: 'T1', name: 'Leaf', activity_type: 'task' },
      ],
    };
    const svg = renderActivitiesSvg(doc);
    expect(svg).not.toContain('P1');
    expect(svg).toContain('T1');
  });

  it('renders a valid SVG when all activities are project-type (graceful degrade)', () => {
    const doc: ActivityDoc = {
      notation: 'action',
      activities: [{ id: 'P1', name: 'Only project', activity_type: 'project' }],
    };
    const svg = renderActivitiesSvg(doc);
    // When all activities are filtered out, the renderer returns an empty SVG.
    expect(svg).toContain('<svg');
  });

  it('renders activities without activity_type unchanged', () => {
    const doc: ActivityDoc = {
      notation: 'action',
      activities: [
        { id: 'A1', name: 'Analysis', duration: 5 },
        { id: 'A2', name: 'Design', duration: 3, predecessors: ['A1'] },
      ],
    };
    const svg = renderActivitiesSvg(doc);
    expect(svg).toContain('A1');
    expect(svg).toContain('A2');
  });
});
