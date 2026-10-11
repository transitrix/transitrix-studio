import { describe, it, expect } from 'vitest';
import { validateNotationDoc, isFileValidatableNotation } from '../src/validate-notation.js';
import { runRepoValidate } from '../src/repo-validate.js';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import yaml from 'js-yaml';
const provenance = {captured_by:'author',captured_on:'2026-01-01',setting:'Source observation'};
const envelope = {name:'Example', zone:'canon', admitted_at:'2026-01-01', admitted_by:'author', gate_checks:{uniqueness:'pass',consistency:'pass',completeness:'pass'}, valid_from:'2026-01-01', valid_to:null};
const examples: Record<string, Record<string, unknown>> = {
 process:{...envelope,notation:'process',id:'PROCESS-1',goal:'A useful outcome',result:'Accepted output'},
 capability:{...envelope, notation:'capability',id:'CAPABILITY-V1',type:'domain'},
 product:{...envelope, notation:'product',id:'PRODUCT-1',type:'service'},
 role:{...envelope, notation:'role',id:'ROLE-1'},
 assessment:{...envelope,notation:'assessment',id:'ASSESSMENT-1',description:'Observed state',assesses:'DRIVER-1'},
 scenario:{...envelope,notation:'scenario',id:'SCENARIO-1',pursues:['GOAL-1'],arrives_at:'TARGET_STATE-1',steps:['ACTION-1']},
 draft:{notation:'draft',id:'DRAFT-1',zone:'field',admitted_at:'2026-01-01',admitted_by:'author',gate_checks:{provenance:'source recorded'},provenance,content:'Raw text'},
 observation:{notation:'observation',id:'OBSERVATION-1',zone:'field',admitted_at:'2026-01-01',admitted_by:'author',gate_checks:{provenance:'source recorded'},provenance,observations:'Raw text'},
};
describe('standalone published forms', () => {
 for (const [notation, doc] of Object.entries(examples)) {
  it(`${notation}: validates envelope and rejects missing admission`, () => {
   expect(isFileValidatableNotation(notation)).toBe(true);
   expect(validateNotationDoc(notation, doc).isValid).toBe(true);
   expect(validateNotationDoc(notation,{...doc,gate_checks:[]}).isValid).toBe(false);
   expect(validateNotationDoc(notation,{...doc,admitted_at:'2026-02-30'}).isValid).toBe(false);
  });
 }
 it('checks primitive-specific constraints and catalogue resolution', () => {
  for (const [notation, patch] of [['product',{type:'invalid'}],['capability',{current_maturity:3}],['assessment',{assesses:'ROLE-1'}],['assessment',{geographic_scope:['global','ge']}],['assessment',{geographic_scope:['GLOBAL','ge']}],['scenario',{steps:[]}],['scenario',{steps:['ROLE-1']}]] as const) expect(validateNotationDoc(notation,{...examples[notation],...patch}).isValid).toBe(false);
  expect(validateNotationDoc('assessment', examples.assessment,{catalog:{typeOf:()=>undefined}}).isValid).toBe(false);
  expect(validateNotationDoc('role',{...examples.role,unit:'ACTOR-1'},{catalog:{typeOf:()=> 'ACTOR'},documents:new Map([['ACTOR-1',{type:'person'}]])}).isValid).toBe(false);
 });
 it('keeps Field payload opaque and does not impose canonical lifecycle', () => {
  expect(validateNotationDoc('draft',{...examples.draft,content:{arbitrary:['source',1]}}).isValid).toBe(true);
  expect(validateNotationDoc('observation',{...examples.observation,source_quality:'invented'}).isValid).toBe(false);
 });
});
const history = {target:'CAPABILITY-V1',attribute_versions:{current_maturity:[{valid_from:'2026-01-01',value:3}]}};
const options = {documents:new Map([['CAPABILITY-V1',examples.capability]]),catalog:{typeOf:(id:string)=>id==='CAPABILITY-V1'?'CAPABILITY':undefined}};
describe('strict raw histories', () => {
 it('accepts values and explicit gaps, rejects malformed arrays, dates, entries and ranges', () => {
  expect(validateNotationDoc('history',history,options).isValid).toBe(true);
  for (const value of [null,1,5]) expect(validateNotationDoc('history',{...history,attribute_versions:{current_maturity:[{valid_from:'2026-01-01',value}]}},options).isValid).toBe(true);
  for (const entries of [42,[null],[{valid_from:'2026-01-01'}],[{valid_from:'2026-02-30',value:3}],[{valid_from:'2025-01-01',value:3}],[{valid_from:'2026-01-01',value:6}],[{valid_from:'2026-01-01',value:'3'}],[{valid_from:'2026-01-01',value:3},{valid_from:'2026-01-01',value:4}]]) expect(validateNotationDoc('history',{...history,attribute_versions:{current_maturity:entries}},options).isValid).toBe(false);
  expect(validateNotationDoc('history',{...history,attribute_versions:{unknown:[]}},options).isValid).toBe(false);
  expect(validateNotationDoc('history',{...history,target:'CAPABILITY-V2'},options).isValid).toBe(false);
 });
 it('reports missing target context as unvalidated rather than a full pass', () => {
  expect(validateNotationDoc('history',history).findings).toContainEqual(expect.objectContaining({ruleId:'NOTATION-SKIP-001'}));
 });
});
function repo(files:Record<string,string>) {
 const root=mkdtempSync(join(tmpdir(),'standalone-'));
 try { for(const [file,content] of Object.entries(files)){mkdirSync(dirname(join(root,file)),{recursive:true});writeFileSync(join(root,file),content);} return runRepoValidate(root); }
 finally {rmSync(root,{recursive:true,force:true});}
}
describe('actual repository coverage dispatch', () => {
 it('dispatches headerless histories and standalone primitives; does not swallow invalid entries', () => {
  const files={'canon/elements/CAPABILITY-V1.yaml':yaml.dump(examples.capability),'canon/elements/CAPABILITY-V1.history.yaml':yaml.dump(history)};
  const good=repo(files);
  expect(good.coverage).toMatchObject({discovered:2,validated:2,unvalidated:0,failed:0});
  expect(good.views.filter(f=>f.severity==='error')).toEqual([]);
  const bad=repo({...files,'canon/elements/CAPABILITY-V1.history.yaml':yaml.dump({...history,attribute_versions:{current_maturity:[null]}})});
  expect(bad.views).toContainEqual(expect.objectContaining({ruleId:'SCHEMA_INVALID',severity:'error'}));
 });
 it('rejects duplicate Field IDs and reports unsupported provenance forms', () => {
  const result=repo({'field/one.yaml':yaml.dump(examples.draft),'field/two.yaml':yaml.dump(examples.draft)});
  expect(result.views).toContainEqual(expect.objectContaining({ruleId:'SCHEMA_INVALID',severity:'error'}));
  const unknown=repo({'field/one.yaml':yaml.dump({...examples.draft,provenance:{unknown:'source'}})});
  expect(unknown.coverage?.unvalidated).toBe(1);
  const prose=repo({'field/one.yaml':yaml.dump({...examples.draft,provenance:'Author observed source on a date'})});
  expect(prose.coverage?.unvalidated).toBe(1);
  expect(prose.views.filter(f=>f.severity==='error')).toEqual([]);
  expect(validateNotationDoc('draft',{...examples.draft,provenance:undefined}).isValid).toBe(false);
 });
 it('exempts colocated Codex archives only, and forbids their admission', () => {
  const result=repo({'codex/internal/sources/policy.txt':'Raw source','codex/external/ge/sources/law.txt':'Raw source','canon/sources/notes.md':'Raw notes','field/sources/notes.md':'Raw notes','codex/internal/sources/admitted.yaml':'zone: codex\nadmitted_by: author\n'});
  expect(result.coverage?.excluded).toHaveLength(3);
  expect(result.views.filter(f=>f.ruleId==='ZONE-001')).toHaveLength(2);
  expect(result.views).toContainEqual(expect.objectContaining({ruleId:'ADMIT-012',severity:'error'}));
 });
});


describe('canonical process coverage', () => {
 const process = {...examples.process, owner_role:'ROLE-1', capability:'CAPABILITY-V1', participants:['ROLE-1'], flow:{
  steps:[{id:'STEP-START-1',type:'startEvent',performed_by:'ROLE-1'},{id:'STEP-WORK-1',type:'task',name:'Work',performed_by:'ROLE-1'},{id:'STEP-END-1',type:'endEvent',performed_by:'ROLE-1'}],
  sequence:[{from:'STEP-START-1',to:'STEP-WORK-1'},{from:'STEP-WORK-1',to:'STEP-END-1'}],
 }};
 it('accepts metadata-only and behavioural definitions; rejects malformed published fields', () => {
  expect(validateNotationDoc('process',process).isValid).toBe(true);
  for(const patch of [{owner_role:'ACTOR-1'},{capability:'GOAL-1'},{participants:'ROLE-1'},{participants:['ROLE-1','ROLE-1']},{goal:4},{result:[]},{parent:'PROCESS-2'},{bpmn_file:'flow.bpmn'},{maturity:2},{flow:[]},{flow:{steps:[],sequence:[]}}, {flow:{...process.flow,sequence:[{from:'STEP-START-1',to:'STEP-MISSING-1'}]}}, {flow:{...process.flow,steps:[{id:'bad',type:'unknown',performed_by:'ROLE-2'}]}}, {flow:{...process.flow,steps:[...process.flow.steps,process.flow.steps[0]]}}]) {
   expect(validateNotationDoc('process',{...process,...patch}).isValid,JSON.stringify(patch)).toBe(false);
  }
 });
 it('executes repository field and reference validation without skipping PROCESS', () => {
  const files={'canon/elements/PROCESS-1.yaml':yaml.dump(process),'canon/elements/ROLE-1.yaml':yaml.dump(examples.role),'canon/elements/CAPABILITY-V1.yaml':yaml.dump(examples.capability)};
  const good=repo(files);
  expect(good.coverage).toMatchObject({discovered:3,read:3,validated:3,unvalidated:0,failed:0});
  expect(good.views.filter(f=>f.severity==='error')).toEqual([]);
  for(const patch of [{owner_role:'ROLE-MISSING-1'},{capability:'CAPABILITY-V9'},{participants:['ACTOR-MISSING-1']},{flow:{...process.flow,steps:[{...process.flow.steps[1],supported_by_application:'APPLICATION-MISSING-1'}]}}]) {
   const bad=repo({...files,'canon/elements/PROCESS-1.yaml':yaml.dump({...process,...patch})});
   expect(bad.views).toContainEqual(expect.objectContaining({ruleId:'SCHEMA_INVALID',severity:'error'}));
   expect(bad.coverage?.unvalidated).toBe(0);
  }
 });
});
