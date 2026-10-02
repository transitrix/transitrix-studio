// Standalone forms from ELEMENT_PRIMITIVES and CONTRACT (Methodology 7).
// Field payloads are opaque: only their published identity/admission contract is checked.
import { isCanonicalIdOfType, typeOfId, type CanonCatalog } from '../typed-id.js';
import type { ValidationResult } from '../validation-types.js';

export const mapping = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
export const isoDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const capabilityId = (v: unknown) => typeof v === 'string' && /^CAPABILITY-[VH][1-9]\d*(?:\.[1-9]\d*)*$/.test(v);
export interface StandaloneOptions { catalog?: CanonCatalog; documents?: ReadonlyMap<string, Record<string, unknown>> }

export function validateStandalone(notation: string, input: unknown, options: StandaloneOptions = {}): ValidationResult {
  const errors: ValidationResult['errors'] = [], warnings: ValidationResult['warnings'] = [];
  const fail = (field: string, expected: string, actual: unknown, code = 'SCHEMA_INVALID') => errors.push({code, message: `${notation} standalone: ${field}: expected ${expected}; actual ${JSON.stringify(actual) ?? 'missing'}.`, path: field});
  if (!mapping(input)) { fail('$', 'mapping', input); return {valid:false, errors, warnings}; }
  const d = input, field = ['draft', 'observation'].includes(notation);
  const requiredText = (key: string) => { if (!text(d[key])) fail(key, 'nonempty string', d[key]); };
  const optionalText = (key: string) => { if (key in d && !text(d[key])) fail(key, 'nonempty string', d[key]); };
  if (d.notation !== notation && !(field && d.notation === undefined && d.type === notation.toUpperCase())) fail('notation', notation, d.notation);
  if (!(notation === 'capability' ? capabilityId(d.id) : isCanonicalIdOfType(d.id, notation.toUpperCase()))) fail('id', `${notation.toUpperCase()} canonical ID`, d.id);
  if (!field) requiredText('name'); else optionalText('name');
  if (d.zone !== (field ? 'field' : 'canon')) fail('zone', field ? 'field' : 'canon', d.zone);
  requiredText('admitted_by');
  if (!isoDate(d.admitted_at)) fail('admitted_at', 'ISO calendar date', d.admitted_at);
  if (!mapping(d.gate_checks)) fail('gate_checks', 'mapping', d.gate_checks);
  else for (const key of field ? ['provenance'] : ['uniqueness', 'consistency', 'completeness']) {
    if (!text(d.gate_checks[key])) fail(`gate_checks.${key}`, 'nonempty check outcome', d.gate_checks[key]);
  }
  if (!field) {
    if (!isoDate(d.valid_from)) fail('valid_from', 'ISO calendar date', d.valid_from, 'LIFECYCLE-001');
    if (!(d.valid_to === null || isoDate(d.valid_to))) fail('valid_to', 'ISO calendar date or null', d.valid_to, 'LIFECYCLE-002');
    if (isoDate(d.valid_from) && isoDate(d.valid_to) && d.valid_to < d.valid_from) fail('valid_to', 'date on or after valid_from', d.valid_to, 'LIFECYCLE-003');
  }
  const ref = (key: string, value: unknown, types: string[]) => {
    const type = typeOfId(value);
    if (!type || !types.includes(type) || !(type === 'CAPABILITY' ? capabilityId(value) : isCanonicalIdOfType(value, type))) { fail(key, types.join('|') + ' canonical reference', value); return; }
    if (options.catalog && !types.includes(options.catalog.typeOf(value as string) ?? '')) fail(key, 'reference to admitted ' + types.join('|'), value);
  };
  const reference = (key: string, types: string[], required = false) => { if (required || key in d) ref(key, d[key], types); };
  const references = (key: string, types: string[], required = false) => {
    if (!required && !(key in d)) return;
    const values = d[key];
    if (!Array.isArray(values) || (required && values.length === 0)) { fail(key, required ? 'nonempty list of references' : 'list of references', values); return; }
    values.forEach((v, i) => ref(`${key}[${i}]`, v, types));
  };
  optionalText('description');
  if (notation === 'product') {
    if (!['physical_product', 'digital_product','service','platform','bundle'].includes(d.type as string)) fail('type', 'physical_product|digital_product|service|platform|bundle', d.type);
    optionalText('domain'); reference('owner_role', ['ROLE']);
    if ('maturity' in d && !(Number.isInteger(d.maturity) && Number(d.maturity) >= 1 && Number(d.maturity) <= 5)) fail('maturity', 'integer 1..5', d.maturity);
    references('capabilities', ['CAPABILITY']); references('processes', ['PROCESS']); references('supporting_apps', ['APPLICATION']);
  } else if (notation === 'capability') {
    if (!['domain','supporting'].includes(d.type as string)) fail('type', 'domain|supporting', d.type);
    for (const key of ['current_maturity','target_maturity','owner_role','target_date']) if (key in d) fail(key, 'attribute in history sidecar, absent inline', d[key], 'VERSIONED-004');
    reference('business_process', ['PROCESS']); references('applications', ['APPLICATION']);
  } else if (notation === 'role') {
    optionalText('responsibility_area'); reference('unit', ['ACTOR']);
    const unit = typeof d.unit === 'string' ? options.documents?.get(d.unit) : undefined;
    if (unit && unit.type !== 'business_unit') fail('unit', 'ACTOR of type business_unit', d.unit);
  } else if (notation === 'assessment') {
    requiredText('description'); reference('assesses', ['DRIVER','FACTOR'], true);
    for (const key of ['method','source']) optionalText(key);
    if ('observed_at' in d && !isoDate(d.observed_at)) fail('observed_at', 'ISO calendar date', d.observed_at);
    for (const key of ['polarity','swot','type']) if (key in d) fail(key, 'absent on assessment', d[key]);
    if ('geographic_scope' in d) {
      const values = d.geographic_scope;
      // Country vocabulary is checked by the shared jurisdiction set below.
      if (!Array.isArray(values) || !values.length || values.some(v => typeof v !== 'string' || !COUNTRIES.has(v.toLowerCase())) || (values.some(v => typeof v === 'string' && v.toLowerCase() === 'global') && values.length !== 1)) fail('geographic_scope', 'nonempty ISO country/eu list, or [global]', values, 'ASSESS-001');
    }
  } else if (notation === 'scenario') {
    references('pursues', ['GOAL'], true); reference('arrives_at', ['TARGET_STATE'], true); references('steps', ['ACTION','CHANGE'], true);
    const target = typeof d.arrives_at === 'string' ? options.documents?.get(d.arrives_at) : undefined;
    if (target?.type === 'base') fail('arrives_at', 'target plateau, not base', d.arrives_at);
    for (const key of ['type','vision','factors_view','status','drivers','capabilities','processes','applications','products']) if (key in d) fail(key, 'absent on standalone scenario', d[key]);
    optionalText('link');
  } else if (field) {
    const provenance = d.provenance;
    if (provenance === undefined || provenance === null || (typeof provenance === 'string' && !provenance.trim()) || (mapping(provenance) && Object.keys(provenance).length === 0)) fail('provenance', 'recorded source evidence', provenance);
    else if (!mapping(provenance)) warnings.push({code:'NOTATION-SKIP-001',message:'Field provenance form is unsupported; source evidence remains unvalidated.'});
    else {
      // Two supported evidence forms: captured source and versioned source import.
      // Other forms remain visible as unsupported, not falsely validated or forbidden.
      const captured = text(provenance.captured_by) && isoDate(provenance.captured_on) && text(provenance.setting);
      const imported = text(provenance.source_revision) && text(provenance.original_path) && text(provenance.source_hash) && isoDate(provenance.captured_on);
      if (!captured && !imported) warnings.push({code:'NOTATION-SKIP-001',message:'Field provenance form is unsupported: source, capture date and context cannot all be checked.'});
    }
    if ('source_quality' in d && !['authoritative','corroborated','single_source','unverified'].includes(d.source_quality as string)) fail('source_quality', 'authoritative|corroborated|single_source|unverified', d.source_quality);
  }
  return {valid: errors.length === 0, errors, warnings};
}

// ISO 3166-1 alpha-2 vocabulary, plus the published eu/global scope tokens.
const COUNTRIES = new Set(('ad ae af ag ai al am ao aq ar as at au aw ax az ba bb bd be bf bg bh bi bj bl bm bn bo bq br bs bt bv bw by bz ca cc cd cf cg ch ci ck cl cm cn co cr cu cv cw cx cy cz de dj dk dm do dz ec ee eg eh er es et fi fj fk fm fo fr ga gb gd ge gf gg gh gi gl gm gn gp gq gr gs gt gu gw gy hk hm hn hr ht hu id ie il im in io iq ir is it je jm jo jp ke kg kh ki km kn kp kr kw ky kz la lb lc li lk lr ls lt lu lv ly ma mc md me mf mg mh mk ml mm mn mo mp mq mr ms mt mu mv mw mx my mz na nc ne nf ng ni nl no np nr nu nz om pa pe pf pg ph pk pl pm pn pr ps pt pw py qa re ro rs ru rw sa sb sc sd se sg sh si sj sk sl sm sn so sr ss st sv sx sy sz tc td tf tg th tj tk tl tm tn to tr tt tv tw tz ua ug um us uy uz va vc ve vg vi vn vu wf ws ye yt za zm zw eu global').split(' '));
