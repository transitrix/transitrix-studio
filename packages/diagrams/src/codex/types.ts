// Codex artefact — external laws/regulations and internal policies/standards/principles.
// Schema: methodology notations/elements/14-codex.md §3–§4.

/** TYPE prefixes admitted in the codex zone (REQ-003 / 14-codex.md). */
export const CODEX_ARTEFACT_TYPES = ['LAW', 'REGULATION', 'POLICY', 'INTERNAL_STANDARD', 'PRINCIPLE'] as const;

export type CodexArtefactType = (typeof CODEX_ARTEFACT_TYPES)[number];

/** External codex artefacts (codex/external/<jurisdiction>/). */
export const EXTERNAL_CODEX_TYPES: readonly CodexArtefactType[] = ['LAW', 'REGULATION'];

/** Internal codex artefacts (codex/internal/) that carry a named issuing authority (§4). */
export const INTERNAL_CODEX_TYPES: readonly CodexArtefactType[] = ['POLICY', 'INTERNAL_STANDARD'];

/**
 * Internal codex artefacts (codex/internal/) with the `PRINCIPLE` shape (§4.1) —
 * `statement` + `rationale` required, `issuing_authority`/`effective_date`/`established_by`
 * optional. Kept distinct from {@link INTERNAL_CODEX_TYPES} because the required-field set
 * differs; both share the same file location.
 */
export const PRINCIPLE_CODEX_TYPES: readonly CodexArtefactType[] = ['PRINCIPLE'];
