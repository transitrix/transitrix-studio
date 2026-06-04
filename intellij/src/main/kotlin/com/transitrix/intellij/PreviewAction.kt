package com.transitrix.intellij

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.vfs.VirtualFile

/**
 * Opens a read-only Transitrix notation preview for the file under the caret.
 *
 * Phase 3 surface (ADR 0001 step 3): the action picks up the file's suffix via
 * [TransitrixNotation.kindFor], reads the document text through
 * [FileDocumentManager], and hands both to [TransitrixPreviewDialog], which
 * hosts a `JBCefBrowser` that runs the bundled `@transitrix/diagrams` renderer.
 *
 * The action stays surfaced on every recognised notation file regardless of
 * which renderer is wired into the bundle today — kinds the bundle hasn't
 * picked up yet (Step 4 backlog) come back as a structured
 * `NOTATION-NOT-WIRED` panel rather than a crash, so the user sees a clear
 * status instead of an empty dialog.
 */
class PreviewAction : AnAction() {

    override fun update(event: AnActionEvent) {
        val file = event.getData(CommonDataKeys.VIRTUAL_FILE)
        event.presentation.isEnabledAndVisible =
            file != null && TransitrixNotation.isTransitrixNotationFile(file.name)
    }

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

    override fun actionPerformed(event: AnActionEvent) {
        val file = event.getData(CommonDataKeys.VIRTUAL_FILE) ?: return
        val kind = TransitrixNotation.kindFor(file.name) ?: return

        if (!TransitrixPreviewDialog.isPreviewSupported()) {
            Messages.showErrorDialog(
                event.project,
                "This IDE build does not ship JCEF, so the Transitrix preview cannot run.\n\n" +
                    "JCEF ships with IntelliJ IDEA Community / Ultimate 2020.2 and newer.",
                "Transitrix Studio",
            )
            return
        }

        val source = readDocumentText(file)
        if (source == null) {
            Messages.showErrorDialog(
                event.project,
                "Could not read ${file.name}. The file may be binary or detached from the editor.",
                "Transitrix Studio",
            )
            return
        }

        TransitrixPreviewDialog(
            project = event.project,
            title = file.name,
            notationKind = kind,
            source = source,
        ).show()
    }

    /**
     * Prefer the in-memory `Document` (picks up unsaved edits) before falling
     * back to the on-disk bytes; matches the VS Code preview's expectation
     * that the user sees what they're editing, not what was last saved.
     */
    private fun readDocumentText(file: VirtualFile): String? {
        FileDocumentManager.getInstance().getDocument(file)?.let { return it.text }
        return try {
            String(file.contentsToByteArray(), file.charset)
        } catch (t: Throwable) {
            null
        }
    }
}
