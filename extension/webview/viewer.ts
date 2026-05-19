import NavigatedViewer from 'bpmn-js/lib/NavigatedViewer.js';

interface VsCodeApi {
  postMessage(message: Record<string, unknown>): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();

const container = document.getElementById('canvas');
if (!container) {
  throw new Error('missing #canvas');
}

const errEl = document.getElementById('err');

function setError(text: string): void {
  if (!errEl) return;
  if (text) {
    errEl.textContent = text;
    errEl.hidden = false;
  } else {
    errEl.textContent = '';
    errEl.hidden = true;
  }
}

/** Wait for final layout before fit/zoom (flex + webview). */
function afterLayout(cb: () => void): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(cb);
  });
}

/** diagram-js sets height/width to 100%; if the parent is 0×0 on cold start, the viewport stays tiny forever. */
const MIN_SZ = 32;
const MAX_INIT_FRAMES = 180;

let viewerInstance: InstanceType<typeof NavigatedViewer> | undefined;

function attachResizeHooks(v: InstanceType<typeof NavigatedViewer>): void {
  let raf = 0;
  const scheduleFit = (): void => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      raf = 0;
      fitDiagramToViewport(v);
    });
  };

  const ro = new ResizeObserver(() => {
    scheduleFit();
  });
  ro.observe(container);
  window.addEventListener('resize', scheduleFit);
}

type CanvasApi = {
  resized: () => void;
  zoom: (s: string) => void;
  viewbox: (box?: Record<string, unknown> | false) => {
    inner: { x?: number; y?: number; width?: number; height?: number };
    outer: { width: number; height: number };
  };
};

/**
 * "fit-viewport" in diagram-js intentionally never zooms above 100% (Math.min(1, …)),
 * so a small diagram stays tiny in the centre/corner and the canvas appears mostly empty.
 * viewbox({ … }) sets a rectangle in diagram coordinates; the engine scales it to fill
 * the pixel-size of the container — including zooming in.
 */
function fitDiagramToViewport(v: InstanceType<typeof NavigatedViewer>): void {
  const pad = 56;
  try {
    const canvas = v.get('canvas') as CanvasApi;
    canvas.resized();
    const vb = canvas.viewbox();
    const inner = vb.inner;

    const iw = inner?.width ?? 0;
    const ih = inner?.height ?? 0;
    if (!(iw > 0 && ih > 0)) {
      canvas.zoom('fit-viewport');
      return;
    }

    const ix = inner.x ?? 0;
    const iy = inner.y ?? 0;
    canvas.viewbox({
      x: ix - pad,
      y: iy - pad,
      width: iw + pad * 2,
      height: ih + pad * 2,
    });
  } catch {
    /* nothing to show yet */
  }
}

function createViewerOnce(): InstanceType<typeof NavigatedViewer> {
  if (viewerInstance) {
    return viewerInstance;
  }
  viewerInstance = new NavigatedViewer({
    container,
    keyboard: { bindTo: document },
  });
  attachResizeHooks(viewerInstance);
  afterLayout(() => {
    fitDiagramToViewport(viewerInstance!);
  });
  return viewerInstance;
}

/**
 * VS Code may run this script before #canvas has non-zero dimensions.
 * Defer NavigatedViewer creation until clientWidth/clientHeight are available.
 */
function ensureViewerSized(): Promise<InstanceType<typeof NavigatedViewer>> {
  if (viewerInstance) {
    return Promise.resolve(viewerInstance);
  }
  let frames = 0;
  return new Promise((resolve) => {
    function tick(): void {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if ((w >= MIN_SZ && h >= MIN_SZ) || frames++ >= MAX_INIT_FRAMES) {
        resolve(createViewerOnce());
        return;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

interface LayoutMetrics {
  crossings: number;
  bends: number;
  edgeLength: number;
  waypointDensity: number;
  spineDeviation: number;
  emptyArea: number;
  portViolations: number;
  portUniqueness: number;
  laneAxisAlignment: number;
  layoutScore: number;
}

interface ValidationFinding {
  ruleId: string;
  severity: 'error' | 'warning' | 'info';
  elementId?: string;
  message: string;
  hint?: string;
  docUrl?: string;
}

interface ValidationReport {
  isValid: boolean;
  findings: ValidationFinding[];
  summary: {
    errorCount: number;
    warningCount: number;
    infoCount: number;
  };
}

function renderMetrics(metrics: LayoutMetrics): void {
  const container = document.getElementById('metrics-display');
  if (!container) return;

  const metricDefs: Record<string, { label: string; format: (v: number) => string; tooltip: string }> = {
    portViolations: {
      label: 'Port violations',
      format: (v) => String(v),
      tooltip: 'Flows that exit/enter at non-canonical ports',
    },
    emptyArea: {
      label: 'Empty area',
      format: (v) => `${(v * 100).toFixed(1)}%`,
      tooltip: 'Unused horizontal space in lanes (target: ≤30%)',
    },
    spineDeviation: {
      label: 'Spine deviation',
      format: (v) => `${v.toFixed(1)} px`,
      tooltip: 'Max deviation from swimlane axis',
    },
    bends: {
      label: 'Bends',
      format: (v) => String(v),
      tooltip: 'Number of 90° turns in flows',
    },
    crossings: {
      label: 'Crossings',
      format: (v) => String(v),
      tooltip: 'Number of orthogonal edge intersections',
    },
  };

  container.innerHTML = '';
  for (const [key, def] of Object.entries(metricDefs)) {
    const value = metrics[key as keyof LayoutMetrics];
    if (typeof value === 'number') {
      const metric = document.createElement('div');
      metric.className = 'metric';
      metric.setAttribute('data-tooltip', def.tooltip);
      metric.innerHTML = `<span class="metric-label">${def.label}:</span><span class="metric-value">${def.format(value)}</span>`;
      container.appendChild(metric);
    }
  }
  container.hidden = false;
}

function renderFindings(validation: ValidationReport): void {
  const findingsPanel = document.getElementById('findings');
  const findingsList = document.getElementById('findings-list');
  if (!findingsPanel || !findingsList) return;

  const errorCount = document.getElementById('error-count');
  const warningCount = document.getElementById('warning-count');
  if (errorCount) errorCount.textContent = String(validation.summary.errorCount);
  if (warningCount) warningCount.textContent = String(validation.summary.warningCount);

  findingsList.innerHTML = '';

  for (const finding of validation.findings) {
    const item = document.createElement('div');
    item.className = `finding-item ${finding.severity}`;

    let content = `<div class="finding-id">[${finding.ruleId}]</div>`;
    content += `<div class="finding-message">${escapeHtml(finding.message)}</div>`;
    if (finding.hint) {
      content += `<div class="finding-hint">💡 ${escapeHtml(finding.hint)}</div>`;
    }

    item.innerHTML = content;
    item.style.cursor = finding.docUrl ? 'pointer' : 'default';
    if (finding.docUrl) {
      item.addEventListener('click', () => {
        vscode.postMessage({
          type: 'open-docs',
          url: finding.docUrl,
        });
      });
    }
    findingsList.appendChild(item);
  }

  if (validation.findings.length > 0) {
    findingsPanel.classList.add('has-findings');
  } else {
    findingsPanel.classList.remove('has-findings');
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

window.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data as {
    type: string;
    xml?: string;
    metrics?: LayoutMetrics;
    validation?: ValidationReport;
    message?: string;
    seq?: number;
  };

  void (async () => {
    if (msg?.type === 'compile-error') {
      setError(msg.message ?? 'Compile error');
      return;
    }

    if (msg?.type !== 'update' || typeof msg.xml !== 'string') {
      return;
    }

    try {
      setError('');
      if (msg.metrics) {
        renderMetrics(msg.metrics);
      }
      if (msg.validation) {
        renderFindings(msg.validation);
      }
      const v = await ensureViewerSized();
      await v.importXML(msg.xml);
      afterLayout(() => {
        fitDiagramToViewport(v);
        vscode.postMessage({ type: 'diagram-ready', seq: msg.seq });
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      vscode.postMessage({
        type: 'diagram-error',
        message,
      });
    }
  })();
});

vscode.postMessage({ type: 'viewer-mounted' });
