package com.transitrix.intellij

import com.intellij.openapi.Disposable
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.util.Disposer
import com.intellij.ui.jcef.JBCefApp
import com.intellij.ui.jcef.JBCefBrowser
import java.awt.BorderLayout
import java.awt.Dimension
import javax.swing.JComponent
import javax.swing.JPanel

/**
 * Non-modal dialog hosting a JCEF `JBCefBrowser` that renders one Transitrix
 * notation document via the bundled `@transitrix/diagrams` webview.
 *
 * Phase 3 surface (ADR 0001 step 3): minimum viable end-to-end preview —
 * one dialog per `PreviewAction` invocation, single-document content, no
 * re-render on save, no editor-tab split. Tool-window / editor-tab parity
 * with the VS Code extension is the natural follow-up; the JCEF wiring,
 * bundle-load contract, and notation-kind dispatch carry over unchanged.
 */
class TransitrixPreviewDialog(
    project: Project?,
    private val title: String,
    private val notationKind: String,
    private val source: String,
) : DialogWrapper(project, true) {

    private val browser: JBCefBrowser = JBCefBrowser().also { Disposer.register(disposable, it) }

    init {
        setTitle("Transitrix preview — $title")
        // Non-modal so the user can keep editing the source while the
        // preview is visible. They'll re-open the preview after edits in
        // Phase 3; auto-refresh on save lands in a follow-up (ADR step 7).
        isModal = false
        init()
        loadPreview()
    }

    override fun createCenterPanel(): JComponent {
        val panel = JPanel(BorderLayout())
        panel.preferredSize = Dimension(900, 700)
        panel.add(browser.component, BorderLayout.CENTER)
        return panel
    }

    /**
     * The "OK / Cancel" buttons aren't meaningful for a read-only preview;
     * the close button on the dialog frame is the only action the user needs.
     */
    override fun createActions(): Array<javax.swing.Action> = emptyArray()

    private fun loadPreview() {
        val html = WebviewBundle.buildHostHtml(notationKind, source)
        // Give the document a synthetic file:// origin so JCEF's same-origin
        // rules don't reject inline scripts in some platform builds. The URL
        // isn't dereferenced — `loadHTML(html, url)` only uses it as the
        // document origin.
        browser.loadHTML(html, "transitrix://preview/$notationKind")
    }

    companion object {
        /**
         * True iff this IntelliJ build has JCEF available. JetBrains ships
         * JCEF in IntelliJ IDEA 2020.2+ Community and Ultimate, but the
         * stripped variants (some custom builds, certain Linux distros'
         * packages) omit it — and the ADR commits to a graceful error rather
         * than a crash in that case.
         */
        fun isPreviewSupported(): Boolean = try {
            JBCefApp.isSupported()
        } catch (t: Throwable) {
            // Defensive: older platforms can throw during isSupported() when
            // the native binary is missing entirely. Treat as "not supported".
            false
        }

        /** For tests / diagnostics that want the unwrapped disposable. */
        fun disposableOf(dialog: TransitrixPreviewDialog): Disposable = dialog.disposable
    }
}
