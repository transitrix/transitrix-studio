package com.transitrix.intellij

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.ui.Messages

/**
 * Placeholder Transitrix preview action. Wires the action class through the
 * plugin manifest and proves the plugin loads in a running IDE; the JCEF
 * preview surface and the @transitrix/diagrams webview bundle land in
 * follow-up PRs (ADR 0001, plan steps 2–4).
 */
class PreviewAction : AnAction() {

    override fun update(event: AnActionEvent) {
        val file = event.getData(CommonDataKeys.VIRTUAL_FILE)
        event.presentation.isEnabledAndVisible = file != null && isTransitrixNotationFile(file.name)
    }

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

    override fun actionPerformed(event: AnActionEvent) {
        val file = event.getData(CommonDataKeys.VIRTUAL_FILE) ?: return
        Messages.showInfoMessage(
            event.project,
            "Transitrix preview placeholder for ${file.name}.\n\n" +
                "The JCEF preview surface lands in the next PR (ADR 0001 step 3); " +
                "this action exists to confirm the plugin manifest registers and " +
                "the action surfaces on Transitrix notation files.",
            "Transitrix Studio",
        )
    }

    private fun isTransitrixNotationFile(name: String): Boolean =
        SUPPORTED_SUFFIXES.any { name.endsWith(it) }

    companion object {
        // Mirrors the VS Code extension's activationEvents list. The JCEF
        // wiring PR will replace this with FileType registrations.
        val SUPPORTED_SUFFIXES: List<String> = listOf(
            ".cervin.yaml",
            ".bpmn.transitrix.yaml",
            ".goals.transitrix.yaml",
            ".fgca.transitrix.yaml",
            ".fga.transitrix.yaml",
            ".activities.transitrix.yaml",
            ".blocks.transitrix.yaml",
            ".applications.transitrix.yaml",
            ".products.transitrix.yaml",
            ".process-map.transitrix.yaml",
            ".scenarios.transitrix.yaml",
            ".capability-map.transitrix.yaml",
            ".process-blueprint.transitrix.yaml",
            ".activity-card.transitrix.yaml",
            ".issues.transitrix.yaml",
        )
    }
}
