import { inspectSource, goalsSvg } from './source.mjs';
import { renderToString } from '@plantuml/core';

const el = id => document.getElementById(id);
const image = el('diagram'), viewport = el('viewport'), status = el('status');
let serial = 0, scale = 1, x = 0, y = 0, model, snapshot, refreshArgs;
let toolName = 'view_diagram', origin, ready = false, nextId = 0;
const pending = new Map(), collapsed = new Set();
const send = message => window.parent.postMessage({ jsonrpc: '2.0', ...message }, origin || '*');
function call(method, params) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Host did not respond. Reopen the viewer or check MCP Apps support.')); }, 15000);
    pending.set(id, { resolve, reject, timer });
    send({ id, method, params });
  });
}
function message(text, error = false) { status.textContent = text; status.className = error ? 'error' : ''; }
function transform() { image.style.transform = `translate(${x}px, ${y}px) scale(${scale})`; }
function fit() {
  if (!image.naturalWidth || !image.naturalHeight) return;
  scale = Math.min((viewport.clientWidth - 24) / image.naturalWidth, (viewport.clientHeight - 24) / image.naturalHeight, 1);
  x = (viewport.clientWidth - image.naturalWidth * scale) / 2;
  y = (viewport.clientHeight - image.naturalHeight * scale) / 2;
  transform();
}
function zoom(factor) { const old = scale; scale = Math.min(8, Math.max(.05, scale * factor)); x = viewport.clientWidth / 2 - (viewport.clientWidth / 2 - x) * scale / old; y = viewport.clientHeight / 2 - (viewport.clientHeight / 2 - y) * scale / old; transform(); }
function showSvg(svg, seq) {
  if (seq !== serial) return;
  // An image document cannot execute SVG scripts or load external subresources.
  image.onload = () => { if (seq === serial) { fit(); message('Read-only diagram. Drag to pan; use zoom controls for labels.'); } };
  image.onerror = () => { if (seq === serial) message('Rendered image could not be displayed.', true); };
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
function renderGoals(seq) { showSvg(goalsSvg(model, collapsed), seq); }
async function showResult(result) {
  const seq = ++serial;
  image.removeAttribute('src'); image.alt = 'Diagram';
  el('expansion').replaceChildren(); el('warnings').textContent = ''; collapsed.clear(); model = undefined;
  result ||= {};
  el('refresh').disabled = !ready || !refreshArgs;
  snapshot = result.structuredContent;
  el('source').textContent = snapshot?.sha256 ? `${snapshot.identity} · ${snapshot.notation} · ${snapshot.bytes} bytes · SHA-256 ${snapshot.sha256}` : 'Source unavailable';
  if (result.isError || !snapshot || snapshot.status !== 'ok') { message(snapshot?.diagnostic || result.content?.[0]?.text || 'Source unavailable.', true); return; }
  try {
    const source = result._meta?.source;
    model = inspectSource(snapshot.notation, source);
    refreshArgs = snapshot.identity === 'supplied-content' ? { notation: snapshot.notation, content: source } : { sourceId: snapshot.identity };
    el('refresh').disabled = !ready;
    message('Rendering…');
    if (snapshot.notation === 'goals') {
      const parents = new Set(model.tree.goals.map(g => g.parent_id));
      for (const goal of model.tree.goals.filter(g => parents.has(g.id))) {
        const button = document.createElement('button');
        button.textContent = `Collapse ${goal.name}`;
        button.setAttribute('aria-expanded', 'true');
        button.onclick = () => {
          if (collapsed.has(goal.id)) collapsed.delete(goal.id); else collapsed.add(goal.id);
          button.textContent = `${collapsed.has(goal.id) ? 'Expand' : 'Collapse'} ${goal.name}`;
          button.setAttribute('aria-expanded', String(!collapsed.has(goal.id)));
          renderGoals(seq);
        };
        el('expansion').append(button);
      }
      renderGoals(seq);
    } else {
      renderToString(source.split('\n'), svg => showSvg(svg, seq), error => { if (seq === serial) message(`PlantUML syntax/render error: ${String(error)}`, true); });
    }
    el('warnings').textContent = (snapshot.warnings || []).map(w => `${w.code}: ${w.message}`).join('\n');
  } catch (error) { message(error.message, true); }
}
el('fit').onclick = fit;
el('zoom-in').onclick = () => zoom(1.25);
el('zoom-out').onclick = () => zoom(.8);
el('refresh').onclick = async () => {
  if (!refreshArgs || !ready) return;
  const refreshSerial = ++serial; image.removeAttribute('src'); el('expansion').replaceChildren(); el('warnings').textContent = '';
  message('Refreshing source…'); el('refresh').disabled = true;
  try {
    const result = await call('tools/call', { name: toolName, arguments: refreshArgs });
    if (serial === refreshSerial) await showResult(result);
  } catch (error) { if (serial === refreshSerial) message(error.message, true); }
  finally { el('refresh').disabled = false; }
};
let drag;
viewport.onpointerdown = event => { drag = { startX: event.clientX, startY: event.clientY, x, y }; viewport.setPointerCapture(event.pointerId); };
viewport.onpointermove = event => { if (drag) { x = drag.x + event.clientX - drag.startX; y = drag.y + event.clientY - drag.startY; transform(); } };
viewport.onpointerup = viewport.onpointercancel = () => { drag = undefined; };
viewport.onkeydown = event => {
  if (event.key === '+') zoom(1.25);
  else if (event.key === '-') zoom(.8);
  else if (event.key === '0') fit();
  else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) { x += event.key === 'ArrowLeft' ? 30 : event.key === 'ArrowRight' ? -30 : 0; y += event.key === 'ArrowUp' ? 30 : event.key === 'ArrowDown' ? -30 : 0; transform(); }
  else return;
  event.preventDefault();
};
window.addEventListener('message', event => {
  if (event.source !== window.parent || (origin && event.origin !== origin)) return;
  const data = event.data;
  if (data?.jsonrpc !== '2.0') return;
  if (pending.has(data.id) && !data.method) {
    const request = pending.get(data.id); pending.delete(data.id); clearTimeout(request.timer);
    if (event.origin && event.origin !== 'null') origin = event.origin;
    if (data.error) request.reject(new Error(data.error.message)); else request.resolve(data.result);
  } else if (ready && data.method === 'ui/notifications/tool-result') void showResult(data.params);
  else if (ready && data.method === 'ui/notifications/tool-input') {
    ++serial; image.removeAttribute('src'); el('expansion').replaceChildren(); el('warnings').textContent = '';
    el('source').textContent = 'Reading source…'; refreshArgs = data.params.arguments;
    el('refresh').disabled = !refreshArgs; message('Reading source…');
  }
  else if (data.method === 'ping' && data.id !== undefined) send({ id: data.id, result: {} });
  else if (data.method === 'ui/resource-teardown' && data.id !== undefined) { ++serial; image.removeAttribute('src'); send({ id: data.id, result: {} }); }
});
if (window.parent === window) message('Open this resource in an MCP Apps host. A standalone page has no source access.');
else {
  call('ui/initialize', { appInfo: { name: 'Transitrix diagram viewer', version: '0.1.0' }, appCapabilities: { availableDisplayModes: ['inline'] }, protocolVersion: '2026-01-26' })
    .then(result => {
      if (result.protocolVersion !== '2026-01-26') throw new Error('Unsupported MCP Apps protocol version.');
      toolName = result.hostContext?.toolInfo?.tool?.name || toolName;
      ready = true;
      send({ method: 'ui/notifications/initialized', params: {} });
      send({ method: 'ui/notifications/size-changed', params: { height: 620 } });
      message('Choose a diagram to view.');
    }).catch(error => message(error.message, true));
}
