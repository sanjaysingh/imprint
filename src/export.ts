import type { TextLayer } from './types';

function canvasFont(layer: TextLayer, sizePx: number): string {
  return `${layer.fontStyle} ${layer.fontWeight} ${sizePx}px "${layer.fontFamily}", sans-serif`;
}

/**
 * Draw image and all text layers onto a canvas at the image's natural size.
 */
export function compositeToCanvas(
  image: HTMLImageElement,
  layers: TextLayer[],
): HTMLCanvasElement {
  const w = image.naturalWidth;
  const h = image.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not available');

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

export function downloadCanvas(canvas: HTMLCanvasElement, filename: string, type: 'image/png' | 'image/jpeg', quality?: number): void {
  const mime = type;
  const q = type === 'image/jpeg' ? quality ?? 0.92 : undefined;
  const url = canvas.toDataURL(mime, q);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
