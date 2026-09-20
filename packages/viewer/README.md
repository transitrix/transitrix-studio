# Read-only diagram viewer prototype

Use the viewer to inspect a self-contained Transitrix Goals diagram or a small
PlantUML sequence in an MCP Apps host. It displays source identity, byte count
and SHA-256, with pan, zoom, fit, explicit refresh and Goals collapse/expansion.
It never edits the source. This source prototype is separate from the released
IDE extensions; installed desktop compatibility must be checked in your host.

## Build and run

From a checkout of this repository, use Node.js 20 or newer:

```sh
npm ci
npm run build:viewer
node packages/viewer/dist/server.mjs \
  goals:goals=packages/viewer/examples/service.goals.transitrix.yaml \
  sequence:plantuml=packages/viewer/examples/service.puml
```

The process speaks newline-delimited MCP JSON-RPC on stdin/stdout. It does not
open a network listener. Start it through your host's local MCP server configuration;
when typing directly into a terminal, it waits for protocol input, not commands.
For hosts that accept an `mcpServers` configuration, adapt absolute paths:

```json
{
  "mcpServers": {
    "transitrix-viewer": {
      "command": "node",
      "args": [
        "/your/checkout/packages/viewer/dist/server.mjs",
        "goals:goals=/your/checkout/packages/viewer/examples/service.goals.transitrix.yaml",
        "sequence:plantuml=/your/checkout/packages/viewer/examples/service.puml"
      ]
    }
  }
}
```

Ask the assistant to call `view_diagram` with `{"sourceId":"goals"}` or
`{"sourceId":"sequence"}`. Alternatively pass `notation` and `content` together.
No sourceId may accompany supplied content. Configured IDs are shown in the MCP
initialization instructions. No directory listing or filesystem path input is exposed.

To move the built prototype to another machine, copy the entire `dist/` directory,
this README and the two `examples/` files, preserving those names. `dist/server.mjs`
is bundled and needs only Node.js; `viewer.html` includes its rendering runtime.
Keep the license files alongside it. From that directory run
`node dist/server.mjs goals:goals=examples/service.goals.transitrix.yaml sequence:plantuml=examples/service.puml`.
No registry installation, remote service, Java or Graphviz binary is needed.

## Coverage

| Input | Supported | Explicitly unsupported |
| --- | --- | --- |
| Transitrix | Self-contained canonical `goals`, `spec_version: "0.1"`; up to 100 goals, shared parser/validator/layout/SVG | Other notations; repository-derived `view_config` and `sources`; implicit catalogue retrieval |
| PlantUML | `@startuml`, declarations `participant NAME`, and messages `A -> B : Plain text` or `A --> B : Plain text`; declared ASCII participant IDs | Other diagram families, includes, macros, preprocessing, themes, links, markup, sprites, arbitrary directives and expansion |
| Source | UTF-8 content up to 32768 bytes; one explicitly bound local file per ID; supplied text | URLs, filesystem discovery, write/apply, history, federation and multi-user authorization |

PlantUML names use letters, digits and underscores, start with a letter and have
at most 32 characters. Message labels use ASCII letters, digits, spaces and
`.,?()_-`, up to 120 characters. A sequence has at most 100 body lines. These
limits intentionally bound the first integration; this is not an arbitrary
PlantUML viewer. Syntax/validation failures include diagnostics and the source
hash when the bytes were available. Unavailable or denied files share a generic
message so errors do not reveal filesystem paths.

Refresh re-reads a bound file, validates it and computes a new content hash.
Refresh of supplied text re-renders the same supplied snapshot; send another tool
call to replace that snapshot. A hash identifies the bytes, not a Git revision or
an observation date. Collapse and navigation affect only the derived image.
Use arrow keys to pan, `+`/`-` to zoom and `0` to fit while the canvas has focus.

## Host and trust boundary

The adapter uses MCP protocol `2025-06-18` and the MCP Apps `2026-01-26` UI
handshake, `ui://transitrix/viewer.html`, `text/html;profile=mcp-app`, tool/resource
metadata and parent-window JSON-RPC. See the [MCP Apps specification](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/draft/apps.mdx).
Its narrow protocol implementation adds no SDK dependency. A compatible host must
forward tool results including `_meta.source`, serve the resource in its sandbox,
and proxy the viewer's `tools/call` refresh requests. The viewer uses the tool name
provided by the host, including any namespace prefix.

A host without MCP Apps can use the textual diagnostics/provenance but cannot
embed this viewer. A host requiring HTTP cannot connect directly to this stdio
adapter. No remote bridge, tunnel, account setup or claim of Claude Desktop or
ChatGPT Desktop support is included. Verify those exact installed clients and
versions before treating the prototype as an available desktop capability.

The local process owner chooses bindings at startup and is the authorization
principal. Every connected caller inherits those explicitly selected bindings;
this is a single-user adapter, not an enterprise identity gateway. Launch separate
instances for separate scopes. Bindings resolve to canonical paths at startup;
missing files, replacement symlinks, non-regular files, invalid UTF-8 and oversize
sources are denied on read. Do not expose it to another user or run it against a
filesystem that another principal can concurrently modify: path-based checks do
not provide an OS sandbox against adversarial directory replacement or hardlinks.
Use filesystem permissions for that boundary. Trusted startup bindings may resolve
symlinks; callers cannot add or change bindings through MCP.

Authorized source bytes travel from the process through the host to the UI;
provenance and diagnostics are model-visible. The host may retain or process
messages under its own policy. The viewer does not fetch from a PlantUML service
or send network requests: all rendering assets are bundled, its declared external
domains are empty, and its HTML CSP denies connections. The PlantUML engine is
`@plantuml/core` from the repository lockfile. Rendered SVG is displayed as an
image document, isolating it from the viewer DOM. No write tool, sampling,
execution, clipboard permission or host navigation is declared.
