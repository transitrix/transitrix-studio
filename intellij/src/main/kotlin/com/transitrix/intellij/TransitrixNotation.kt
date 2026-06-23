package com.transitrix.intellij

/**
 * Map a Transitrix notation filename to the `notationKind` token the
 * `@transitrix/diagrams` webview bundle expects.
 *
 * The suffix list mirrors `extension/package.json` `activationEvents` plus
 * the `*.cervin.yaml` / `*.bpmn.transitrix.yaml` files the VS Code extension
 * handles. The kinds returned here are the same strings the JS-side
 * `entry.ts` whitelists in `SUPPORTED_KINDS`. As of Phase 4 (ADR 0001 step 4)
 * every kind below is wired to its validator + renderer in the bundle, so a
 * valid document renders and a malformed one surfaces the validation error
 * panel.
 */
object TransitrixNotation {

    /**
     * Notation suffixes the action will surface on. The order matters: we
     * pick the *longest* matching suffix so `.activity-card.transitrix.yaml`
     * is preferred over the bare `.yaml`.
     */
    private val SUFFIX_TO_KIND: List<Pair<String, String>> = listOf(
        ".goals.transitrix.yaml" to "goals",
        ".dgca.transitrix.yaml" to "dgca",
        ".dga.transitrix.yaml" to "dga",
        ".fgca.transitrix.yaml" to "fgca",
        ".fga.transitrix.yaml" to "fga",
        ".activities.transitrix.yaml" to "activities",
        ".activity-card.transitrix.yaml" to "activity-card",
        ".applications.transitrix.yaml" to "applications",
        ".products.transitrix.yaml" to "products",
        ".process-map.transitrix.yaml" to "process-map",
        ".process-blueprint.transitrix.yaml" to "process-blueprint",
        ".scenarios.transitrix.yaml" to "scenarios",
        ".capability-map.transitrix.yaml" to "capability-map",
        ".blocks.transitrix.yaml" to "blocks",
    ).sortedByDescending { it.first.length }

    fun isTransitrixNotationFile(name: String): Boolean = kindFor(name) != null

    /**
     * Returns the notation kind for [filename] or `null` if the file is not
     * a recognised Transitrix notation. Matched case-insensitively to match
     * the VS Code extension's behaviour on Windows / macOS filesystems.
     */
    fun kindFor(filename: String): String? {
        val lower = filename.lowercase()
        for ((suffix, kind) in SUFFIX_TO_KIND) {
            if (lower.endsWith(suffix)) return kind
        }
        return null
    }
}
