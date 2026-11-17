# Browser-local BPMN compilation

`src/browser-bpmn.ts` exposes the Studio BPMN parser, validation, layout and XML
conversion to browser consumers. It uses the existing structured BPMN YAML DSL.
The host supplies the canonical `schemas/bpmn-dsl.schema.json` from the **same
source revision**, an exporter version and an immutable example identity. Pin
the source revision and schema hash in your application build.

Build the source entry with the existing esbuild dependency:

```sh
npx --no-install esbuild src/browser-bpmn.ts --bundle --platform=browser \
  --format=esm --alias:xmlbuilder2=xmlbuilder2/lib/xmlbuilder2.min.js \
  --outfile=dist/browser-bpmn.js
```

The alias selects the browser distribution already shipped by xmlbuilder2; its
Node entry imports Node built-ins. Bundle your own entry to include the schema
as JSON. No filesystem shim, backend or new dependency is required. Preserve
dependency licences and the bpmn-js attribution when using that renderer. AJV
compiles the schema at adapter creation; the host's Content Security Policy must
permit that compilation. This entry does not load `.transitrixrc`; it uses the
ordinary default-enabled Studio rules.

```ts
import { createBpmnTrialAdapter } from './browser-bpmn.js';

const adapter = createBpmnTrialAdapter({
  schema, // Canonical schema bundled by the host, not loaded from a URL at runtime.
  exporterVersion: studioVersion,
  example: { id: exampleId, revision: exampleContentHash,
    source: initialYaml, filename: 'order-fulfillment-basic.bpmn.transitrix.yaml' },
});

const result = await adapter.compile(currentYaml);
if (!adapter.isCurrent(result)) return;
if (result.status === 'valid') {
  // Render result.xml with bpmn-js. result.source is the exact downloadable YAML.
  // result.changed compares parsed diagram semantics with the initial example.
} else if (result.status === 'invalid') {
  // Show result.message/errors; mark the last-valid diagram stale, disable download.
}
```

Every result carries its generation, example ID/revision and exact input text.
Overlapping requests return `stale` for obsolete results. `isCurrent` also
rejects results from another adapter, including one with the same example and
generation. Use a new adapter when switching examples, and call `invalidate()`
on the previous adapter when leaving it.

Rendering is asynchronous too: import into a separate candidate canvas, check
`isCurrent(result)` again, then swap that canvas into the page. Destroy obsolete
canvases. Do not let an earlier import replace a newer preview. At download or
event time, recheck identity and require `status === 'valid'`. Download
`result.source` unchanged under `result.filename`; never export the baseline or
a last-valid result after another edit.

Initial input, comments, whitespace and reset do not count as meaningful diagram
changes. A changed valid result is evidence of changed parsed diagram semantics,
not evidence that a user has completed an exercise. The host owns first-edit
attribution, reset/navigation state, rendering failures and last-valid labels.
An invalid input never has XML or an exportable success result.

The downloaded `.bpmn.transitrix.yaml` file opens directly in Transitrix Studio's
BPMN preview. Keep the current edits when offering that continuation. XML is
BPMN 2.0 interchange output; it is a separate format from the editable YAML.
