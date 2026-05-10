/**
 * Triggers a browser download (no server-side persistence).
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Best-effort read of `process.id` from YAML (export file basename). */
export function guessExportBasenameFromYaml(yamlText: string): string {
  const m = yamlText.match(/process\s*:[\s\S]*?^\s+id:\s*['"]?([^'"\n\s#]+)/m);
  const raw = (m?.[1] ?? '').trim();
  const sanitized = raw
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
  return sanitized || 'cervin-diagram';
}

/**
 * Rasterizes a BPMN SVG string from `viewer.saveSVG()` into a PNG blob via Canvas.
 */
export function rasterSvgStringToPngBlob(svgMarkup: string, scale = 2): Promise<Blob> {
  const doc = new DOMParser().parseFromString(svgMarkup, 'image/svg+xml');
  const svgRoot = doc.documentElement;
  if (!svgRoot || svgRoot.tagName !== 'svg') {
    return Promise.reject(new Error('Failed to parse SVG'));
  }

  let width =
    typeof svgRoot.getAttribute('width') === 'string'
      ? Number.parseFloat(svgRoot.getAttribute('width') ?? '')
      : NaN;
  let height =
    typeof svgRoot.getAttribute('height') === 'string'
      ? Number.parseFloat(svgRoot.getAttribute('height') ?? '')
      : NaN;
  const vb = (svgRoot.getAttribute('viewBox') ?? '').trim().split(/\s+/).map(Number);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    if (vb.length >= 4 && Number.isFinite(vb[2]) && Number.isFinite(vb[3]) && vb[2] > 0 && vb[3] > 0) {
      width = vb[2];
      height = vb[3];
    }
  }
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return Promise.reject(new Error('SVG has no drawable dimensions for raster export'));
  }

  const mime = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;

  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = (): void => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas 2D context unavailable'));
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('Failed to create PNG blob'));
            return;
          }
          resolve(blob);
        }, 'image/png');
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    };
    img.onerror = (): void => {
      reject(new Error('Browser failed to load SVG as raster source'));
    };
    img.src = mime;
  });
}
