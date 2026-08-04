// Versioned-attribute sidecar (CONTRACT.md §9) — shared shape across every
// notation that declares a `time_varying` field. A sidecar is a co-located
// `<primitive_id>.history.yaml` document: no `id`, no admission record, no
// lifecycle of its own — its temporal window is governed by the target
// primitive's own `valid_from`/`valid_to` (CONTRACT.md §9.1).

/** One version entry in an attribute's history. `value: null` is a gap
 *  marker — the attribute is unset from `valid_from` until the next entry. */
export interface AttributeVersionEntry {
  valid_from: string;
  value: unknown;
}

/** A parsed sidecar document, keyed by attribute name. */
export interface VersionedAttributeSidecar {
  /** Canonical id of the primitive this sidecar versions. */
  target: string;
  attribute_versions: Record<string, AttributeVersionEntry[]>;
}
