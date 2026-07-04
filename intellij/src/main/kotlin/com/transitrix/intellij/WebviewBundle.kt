package com.transitrix.intellij

import java.nio.charset.StandardCharsets

/**
 * Loads the bundled `@transitrix/diagrams` browser-safe webview assets from
 * the plugin classpath and assembles the JCEF host HTML.
 *
 * The shape of this assembly is set by ADR 0001 (IntelliJ MVP Technology Choice):
 * the JS / CSS bundle is produced by `node scripts/build-webview-bundle.mjs`,
 * copied into the plugin jar under `webview/` by Gradle's `syncWebviewBundle`
 * task, and inlined into `webview/host.html` so JCEF can take the entire
 * preview surface from a single `loadHTML(...)` call. We deliberately avoid
 * `<script src=...>` / `<link href=...>` to sidestep JCEF's local-resource
 * loading rules — everything stays in one self-contained document.
 *
 * The bundle exposes `window.transitrix.render(notationKind, sourceText)`,
 * which returns `{ status, notation, svg, errors, warnings }`. The bootstrap
 * snippet generated here calls that API and writes the SVG (or the
 * validation error/warning panels) into `#transitrix-root`. The JVM side
 * does not interpret notation semantics — the methodology canon stays single-
 * source in `@transitrix/diagrams`.
 */
object WebviewBundle {

    private const val HOST_TEMPLATE_PATH = "/webview/host.html"
    private const val BUNDLE_JS_PATH = "/webview/transitrix-render.js"
    private const val BUNDLE_CSS_PATH = "/webview/transitrix-render.css"

    private const val STYLES_PLACEHOLDER = "@@STYLES@@"
    private const val BUNDLE_PLACEHOLDER = "@@BUNDLE@@"
    private const val BOOTSTRAP_PLACEHOLDER = "@@BOOTSTRAP@@"

    /**
     * Build a self-contained HTML document that, when handed to
     * `JBCefBrowser.loadHTML(...)`, renders the supplied [source] of the given
     * [notationKind] using the bundled @transitrix/diagrams renderer.
     *
     * Both arguments are user-controlled — [notationKind] is derived from the
     * file suffix and [source] is the editor buffer — so they are JSON-encoded
     * into the bootstrap snippet rather than spliced raw. The HTML scaffold
     * does no escaping of its own beyond that; the @transitrix/diagrams
     * renderer is responsible for XML-escaping inside the SVG output.
     */
    fun buildHostHtml(notationKind: String, source: String): String {
        val template = readResource(HOST_TEMPLATE_PATH)
        val styles = readResource(BUNDLE_CSS_PATH)
        val bundle = readResource(BUNDLE_JS_PATH)
        val bootstrap = buildBootstrap(notationKind, source)

        return template
            .replace(STYLES_PLACEHOLDER, styles)
            .replace(BUNDLE_PLACEHOLDER, bundle)
            .replace(BOOTSTRAP_PLACEHOLDER, bootstrap)
    }

    /**
     * Bootstrap script: invokes `window.transitrix.render(kind, source)` and
     * writes the resulting SVG or error/warning panels into `#transitrix-root`.
     * Kept inline (no helpers added to the bundle) so the JS API surface
     * stays exactly what's documented in `packages/diagrams/src/webview/entry.ts`.
     */
    private fun buildBootstrap(notationKind: String, source: String): String {
        val kindJson = encodeJsonString(notationKind)
        val sourceJson = encodeJsonString(source)
        return """
            (function () {
              var root = document.getElementById('transitrix-root');
              if (!root) { return; }
              if (!window.transitrix || typeof window.transitrix.render !== 'function') {
                root.textContent = 'Transitrix renderer failed to initialise.';
                return;
              }
              var result;
              try {
                result = window.transitrix.render($kindJson, $sourceJson);
              } catch (e) {
                root.textContent = 'Renderer threw: ' + (e && e.message ? e.message : String(e));
                return;
              }
              function escapeHtml(s) {
                return String(s)
                  .replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;');
              }
              function panelHtml(cls, issue) {
                var path = issue.path ? '<span class="tx-issue-path">' + escapeHtml(issue.path) + '</span>' : '';
                return '<div class="' + cls + '"><span class="tx-issue-code">'
                  + escapeHtml(issue.code) + '</span>' + escapeHtml(issue.message) + path + '</div>';
              }
              var html = '';
              if (result.errors && result.errors.length) {
                for (var i = 0; i < result.errors.length; i++) {
                  html += panelHtml('tx-error-panel', result.errors[i]);
                }
              }
              if (result.warnings && result.warnings.length) {
                for (var j = 0; j < result.warnings.length; j++) {
                  html += panelHtml('tx-warning-panel', result.warnings[j]);
                }
              }
              if (result.status === 'ok' && result.svg) {
                html += '<div class="tx-svg-host">' + result.svg + '</div>';
              } else if (!html) {
                html = '<div class="tx-error-panel">Preview produced no output.</div>';
              }
              root.innerHTML = html;
            })();
        """.trimIndent()
    }

    private fun readResource(path: String): String {
        val stream = WebviewBundle::class.java.getResourceAsStream(path)
            ?: throw IllegalStateException(
                "Webview asset missing from plugin jar: $path. " +
                    "The Gradle build's syncWebviewBundle task must have failed silently — " +
                    "rebuild with `node scripts/build-webview-bundle.mjs` then `./gradlew buildPlugin`."
            )
        return stream.use { it.readBytes().toString(StandardCharsets.UTF_8) }
    }

    /**
     * Minimal JSON-string encoder. The renderer accepts arbitrary editor
     * contents, so we cannot rely on the input avoiding quotes, backslashes,
     * or control chars. JCEF runs JavaScript, so the JSON-string form ("…")
     * is both a valid JS string literal and easy to inline into the
     * bootstrap script.
     *
     * Beyond the JSON-required escapes, we also force-escape '<', '>', '&'
     * (so the contents cannot break out of the surrounding <script> block)
     * and U+2028 / U+2029 (line terminators in JS — they break a string
     * literal mid-parse even though JSON accepts them raw).
     */
    internal fun encodeJsonString(s: String): String {
        val sb = StringBuilder(s.length + 2)
        sb.append('"')
        for (c in s) {
            when (c) {
                '\\' -> sb.append("\\\\")
                '"' -> sb.append("\\\"")
                '\n' -> sb.append("\\n")
                '\r' -> sb.append("\\r")
                '\t' -> sb.append("\\t")
                '\b' -> sb.append("\\b")
                '\u000C' -> sb.append("\\f")
                '<' -> sb.append("\\u003c")
                '>' -> sb.append("\\u003e")
                '&' -> sb.append("\\u0026")
                '\u2028' -> sb.append("\\u2028")
                '\u2029' -> sb.append("\\u2029")
                else -> if (c.code < 0x20) {
                    sb.append("\\u").append("%04x".format(c.code))
                } else {
                    sb.append(c)
                }
            }
        }
        sb.append('"')
        return sb.toString()
    }
}
