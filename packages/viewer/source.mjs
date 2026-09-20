import yaml from 'js-yaml';
import { parseCanonicalGoals } from '../diagrams/src/goals/parse-canonical.ts';
import { validateGoalTree } from '../diagrams/src/goals/validate.ts';
import { renderGoalsSvg } from '../diagrams/src/webview/render-goals.ts';

export const MAX_BYTES = 32 * 1024;
export const NOTATIONS = ['goals', 'plantuml'];

// Intentionally a small allowlist: preprocessing, includes, links, sprites and
// arbitrary PlantUML directives cannot enter the browser rendering engine.
export function inspectSource(notation, source) {
  if (!NOTATIONS.includes(notation)) throw new Error('Unsupported notation. Choose goals or plantuml.');
  if (typeof source !== 'string' || new TextEncoder().encode(source).length > MAX_BYTES) {
    throw new Error('Source must be UTF-8 text of at most 32768 bytes.');
  }
  if (notation === 'goals') {
    const doc = yaml.load(source, { schema: yaml.JSON_SCHEMA });
    if (doc?.notation !== 'goals' || doc?.spec_version !== '0.1') {
      throw new Error('Expected notation: goals and spec_version: "0.1".');
    }
    if ('view_config' in doc || 'sources' in doc) throw new Error('Repository-derived views are unsupported; supply a self-contained Goals document.');
    const result = parseCanonicalGoals(doc);
    if (!result.valid || !result.parsed) throw new Error(result.errors.map(e => `${e.code} ${e.path ?? ''}: ${e.message}`).join('\n'));
    if (result.parsed.goals.length > 100) throw new Error('At most 100 goals are supported.');
    const checked = validateGoalTree(result.parsed);
    if (!checked.valid) throw new Error(checked.errors.map(e => `${e.code} ${e.path ?? ''}: ${e.message}`).join('\n'));
    return { tree: result.parsed, name: doc.name, warnings: [...result.warnings, ...checked.warnings] };
  }
  const lines = source.trim().split(/\r?\n/);
  if (lines[0] !== '@startuml' || lines.at(-1) !== '@enduml') throw new Error('PlantUML requires @startuml and @enduml on their own lines.');
  if (lines.length > 102) throw new Error('At most 100 PlantUML body lines are supported.');
  const participants = new Set();
  let messages = 0;
  for (let i = 1; i < lines.length - 1; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const participant = /^participant ([A-Za-z][A-Za-z0-9_]{0,31})$/.exec(line);
    const message = /^([A-Za-z][A-Za-z0-9_]{0,31}) (->|-->) ([A-Za-z][A-Za-z0-9_]{0,31}) : ([A-Za-z0-9 .,?()_-]{1,120})$/.exec(line);
    if (participant) participants.add(participant[1]);
    else if (message && participants.has(message[1]) && participants.has(message[3])) messages++;
    else throw new Error(`Unsupported PlantUML syntax at line ${i + 1}. Use participant NAME or declared participants with A -> B : Plain text. Includes, macros, markup and external resources are disabled.`);
  }
  if (!messages) throw new Error('PlantUML sequence must contain at least one message between declared participants.');
  return { warnings: [] };
}

export function goalsSvg(model, collapsed = new Set()) {
  const byId = new Map(model.tree.goals.map(g => [g.id, g]));
  const visible = model.tree.goals.filter(goal => {
    let parent = byId.get(goal.parent_id);
    const seen = new Set();
    while (parent && !seen.has(parent.id)) {
      if (collapsed.has(parent.id)) return false;
      seen.add(parent.id);
      parent = byId.get(parent.parent_id);
    }
    return true;
  });
  return renderGoalsSvg({ ...model.tree, goals: visible }, { treeName: model.name });
}
