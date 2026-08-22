// Codex artefact — external laws/regulations and internal policies/standards.
// Schema: methodology notations/elements/14-codex.md §3–§4.

/** TYPE prefixes admitted in the codex zone (REQ-003 / 14-codex.md). */
export const CODEX_ARTEFACT_TYPES = ['LAW', 'REGULATION', 'POLICY', 'INTERNAL_STANDARD', 'PRINCIPLE'] as const;

export type CodexArtefactType = (typeof CODEX_ARTEFACT_TYPES)[number];

/** External codex artefacts (codex/external/<jurisdiction>/). */
export const EXTERNAL_CODEX_TYPES: readonly CodexArtefactType[] = ['LAW', 'REGULATION'];

/** Internal codex artefacts (codex/internal/). PRINCIPLE is internal but has
 *  its own required-field shape — see `validateCodex`'s PRINCIPLE branch. */
export const INTERNAL_CODEX_TYPES: readonly CodexArtefactType[] = ['POLICY', 'INTERNAL_STANDARD', 'PRINCIPLE'];
