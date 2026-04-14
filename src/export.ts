import type { TextLayer } from './types';

/** Longest side (px). Larger images are scaled down for smaller files; smaller images are not upscaled. */
const MAX_EXPORT_LONG_EDGE = 1080;

/** JPEG quality 0–1 (lower = smaller file, more compression). */
const JPEG_EXPORT_QUALITY = 0.75;

function canvasFont(layer: TextLayer, sizePx: number): string {
  return `${layer.fontStyle} ${layer.fontWeight} ${sizePx}px "${layer.fontFamily}", sans-serif`;
}

function exportDimensions(naturalW: number, naturalH: number): { w: number; h: number } {
  const longEdge = Math.max(naturalW, naturalH);
  if (longEdge <= MAX_EXPORT_LONG_EDGE) {
    return { w: naturalW, h: naturalH };
  }
  const scale = MAX_EXPORT_LONG_EDGE / longEdge;
  return {
    w: Math.max(1, Math.round(naturalW * scale)),
    h: Math.max(1, Math.round(naturalH * scale)),
  };
}

/**
 * Draw image and text onto a canvas sized for download (downscaled if huge, e.g. phone photos).
 */
export function compositeToCanvas(image: HTMLImageElement, layers: TextLayer[]): HTMLCanvasElement {
  const nw = image.naturalWidth;
  const nh = image.naturalHeight;
  const { w, h } = exportDimensions(nw, nh);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not available');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, w, h);

  const lineHeightFactor = 1.25;

  for (const layer of layers) {
    const fontPx = Math.max(4, layer.sizeRatio * h);
    ctx.font = canvasFont(layer, fontPx);
    ctx.fillStyle = layer.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = Math.max(2, fontPx * 0.08);
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = Math.max(1, fontPx * 0.04);

    const lines = layer.text.split('\n');
    const lineHeight = fontPx * lineHeightFactor;
    const totalHeight = lines.length * lineHeight;
    const startY = layer.ny * h - totalHeight / 2 + lineHeight / 2;

    lines.forEach((line, i) => {
      const y = startY + i * lineHeight;
      ctx.fillText(line, layer.nx * w, y);
    });

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }

  return canvas;
}

export function downloadCanvas(
  canvas: HTMLCanvasElement,
  filename: string,
  type: 'image/png' | 'image/jpeg',
  quality?: number,
): void {
  const mime = type;
  const q = type === 'image/jpeg' ? (quality ?? JPEG_EXPORT_QUALITY) : undefined;

  canvas.toBlob(
    (blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2500);
    },
    mime,
    q,
  );
}
