/** ACTION field types and the manifest-selected 7.0.0 numeric boundary. */
export function validateActionFields(
  action: Record<string, unknown>, methodologyVersion?: string,
): Array<{ code: string; message: string; path: string }> {
  const errors: Array<{ code: string; message: string; path: string }> = [];
  const version = /^(\d+)\.(\d+)\.(\d+)(-[^+]+)?(?:\+.*)?$/.exec(methodologyVersion ?? '');
  const nonnegative = version !== null && (Number(version[1]) > 7 ||
    (Number(version[1]) === 7 && (Number(version[2]) > 0 || Number(version[3]) > 0 || !version[4])));
  const type = (value: unknown): string => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  const schema = (path: string, expected: string, value: unknown) => errors.push({
    code: 'SCHEMA_INVALID', path,
    message: `ACTION field '${path}' expected ${expected}, actual ${type(value)} (${String(value)}).`,
  });
  for (const field of ['duration', 'duration_days', 'labor_cost', 'resources_cost', 'effort', 'score', 'sort']) {
    const value = action[field];
    if (value === undefined || (value === null && (field === 'duration' || field === 'duration_days'))) continue;
    const integer = field === 'score' || field === 'sort';
    if (typeof value !== 'number' || !Number.isFinite(value) || (integer && !Number.isInteger(value))) {
      schema(field, integer ? 'finite integer' : 'finite number', value);
    } else if (nonnegative && field !== 'sort' && value < 0) {
      errors.push({ code: 'ACTION-011', path: field, message: `ACTION field '${field}' is negative (${value}).` });
    }
  }
  if (action.predecessors !== undefined) {
    if (!Array.isArray(action.predecessors)) schema('predecessors', 'array of strings', action.predecessors);
    else action.predecessors.forEach((value, index) => {
      if (typeof value !== 'string') schema(`predecessors[${index}]`, 'string', value);
    });
  }
  return errors;
}
