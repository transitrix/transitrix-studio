import { checkDocumentProvenance, type ProvenanceAdapter, type ProvenanceResult } from '../../src/document-provenance.js';

function escape(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function renderDocumentProvenance(result: ProvenanceResult): string {
  const value = (v: unknown) => v === null ? 'Unknown / not supplied' : escape(v);
  return `<section aria-label="Document provenance">
    <h1>Document provenance</h1>
    <p>Contract: ${escape(result.contract_version)} · Status: <strong>${escape(result.status)}</strong> · Incomplete: <strong>${result.incomplete ? 'yes' : 'no'}</strong></p>
    <p>Matching digests establish byte consistency only. They do not prove generation, authenticity, approval or compliance. Unknown applicable checks remain unverifiable.</p>
    <p>Document revision and product/release association are separate. The run model is the model used for generated prose, not the repository identity.</p>
    <h2>Coverage</h2><ul>${Object.entries(result.coverage).map(([k, v]) => `<li>${escape(k)}: ${v}</li>`).join('')}</ul>
    <h2>Checks and evidence</h2>
    <p>Evidence handles: run = selected run record; recipe = selected source bytes; output = selected issued artifact; claims = recorded assertions; adapter = independent observer. A handle does not establish existence or authenticity.</p>
    ${result.checks.map((check) => `<article><h3>${escape(check.id)} — ${escape(check.status)}</h3><dl>
      <dt>Scope</dt><dd>${escape(check.scope)}</dd>
      <dt>Reason / gap</dt><dd>${escape(check.reason)}</dd>
      <dt>Expected (recorded claim)</dt><dd>${value(check.expected)}</dd>
      <dt>Observed comparison value</dt><dd>${value(check.observed)}</dd>
      <dt>Basis</dt><dd>${escape(check.basis)}</dd>
      <dt>Evidence references</dt><dd>${check.evidence.length ? check.evidence.map(escape).join(', ') : 'None'}</dd>
    </dl></article>`).join('')}
  </section>`;
}

/** UI adapter retains the exact normalized result beside its readable view. */
export async function documentProvenanceView(adapter?: ProvenanceAdapter): Promise<{ result: ProvenanceResult; bodyContent: string }> {
  const result = await checkDocumentProvenance(adapter);
  return { result, bodyContent: renderDocumentProvenance(result) };
}
