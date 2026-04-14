import './style.css';
import { compositeToCanvas, downloadCanvas } from './export';
import { FONT_OPTIONS, type TextLayer } from './types';

const DRAG_THRESHOLD_PX = 6;

/** In-session defaults for new text layers (reset when a new image is loaded). */
type TextStyleDefaults = {
  sizeRatio: number;
  fontFamily: string;
  fontWeight: 400 | 700;
  fontStyle: 'normal' | 'italic';
  color: string;
};

const FALLBACK_TEXT_DEFAULTS: TextStyleDefaults = {
  sizeRatio: 0.055,
  fontFamily: FONT_OPTIONS[0].value,
  fontWeight: 700,
  fontStyle: 'normal',
  color: '#ffffff',
};

function hexToInputColor(c: string): string {
  const s = c.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const r = s[1],
      g = s[2],
      b = s[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return '#ffffff';
}

/** Preset sizes (labels ≈ familiar scale); ratio = fraction of image height when exported */
const SIZE_PRESETS: { label: string; ratio: number }[] = [
  { label: '8', ratio: 0.018 },
  { label: '10', ratio: 0.023 },
  { label: '12', ratio: 0.028 },
  { label: '14', ratio: 0.033 },
  { label: '16', ratio: 0.038 },
  { label: '18', ratio: 0.043 },
  { label: '24', ratio: 0.055 },
  { label: '32', ratio: 0.072 },
  { label: '40', ratio: 0.088 },
  { label: '48', ratio: 0.1 },
  { label: '64', ratio: 0.125 },
];

function nearestPresetRatio(ratio: number): number {
  let best = SIZE_PRESETS[0].ratio;
  let bestD = Math.abs(best - ratio);
  for (const p of SIZE_PRESETS) {
    const d = Math.abs(p.ratio - ratio);
    if (d < bestD) {
      bestD = d;
      best = p.ratio;
    }
  }
  return best;
}

let sessionTextDefaults: TextStyleDefaults = { ...FALLBACK_TEXT_DEFAULTS };

function resetSessionTextDefaults(): void {
  sessionTextDefaults = { ...FALLBACK_TEXT_DEFAULTS };
}

function rememberTextStyleFromLayer(layer: TextLayer): void {
  sessionTextDefaults = {
    sizeRatio: nearestPresetRatio(layer.sizeRatio),
    fontFamily: layer.fontFamily,
    fontWeight: layer.fontWeight,
    fontStyle: layer.fontStyle,
    color: hexToInputColor(layer.color),
  };
}

function createId(): string {
  return `t_${Math.random().toString(36).slice(2, 11)}`;
}

function defaultLayer(): TextLayer {
  const s = sessionTextDefaults;
  return {
    id: createId(),
    text: 'Your text',
    nx: 0.5,
    ny: 0.5,
    sizeRatio: s.sizeRatio,
    fontFamily: s.fontFamily,
    fontWeight: s.fontWeight,
    fontStyle: s.fontStyle,
    color: s.color,
  };
}

type AppState = {
  imageSrc: string | null;
  imageObject: HTMLImageElement | null;
  layers: TextLayer[];
  selectedId: string | null;
};

const state: AppState = {
  imageSrc: null,
  imageObject: null,
  layers: [],
  selectedId: null,
};

type DragSession = {
  layerId: string;
  pointerId: number;
  offsetXPct: number;
  offsetYPct: number;
};

let dragSession: DragSession | null = null;
let pointerCandidate: {
  layerId: string;
  pointerId: number;
  x: number;
  y: number;
  dragging: boolean;
} | null = null;

/** Removes document pointer listeners for the active layer gesture (deferred capture until drag threshold). */
let detachLayerPointerTracking: (() => void) | null = null;

function detachLayerPointerTrackingIfAny(): void {
  detachLayerPointerTracking?.();
  detachLayerPointerTracking = null;
}

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app missing');

app.innerHTML = `
  <div class="shell">
    <input type="file" class="visually-hidden" id="file-input" accept="image/*" />

    <header class="topbar">
      <div class="topbar-brand">
        <span class="topbar-logo" aria-hidden="true"></span>
        <span class="topbar-title">Imprint</span>
      </div>
    </header>

    <p class="tagline">Your words, your image — designed in your browser, never uploaded.</p>

    <main class="viewport">
      <div class="canvas-shell" id="canvas-shell">
        <div class="empty-state" id="empty-state">
          <div class="empty-state-card">
            <div class="empty-state-icon" aria-hidden="true">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <circle cx="8.5" cy="10" r="1.5" fill="currentColor" stroke="none"/>
                <path d="M21 17l-5-5-4 4-2-2-4 4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <p class="empty-state-title">Add your image</p>
            <p class="empty-state-hint">Drop a file here or click to browse</p>
          </div>
        </div>

        <div class="stage-block hidden" id="stage-block">
          <div class="stage-area">
            <div class="stage-toolbar">
              <button type="button" class="icon-btn icon-btn--toolbar" id="btn-replace-image" disabled aria-label="Replace image" title="Replace image">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </button>
              <button type="button" class="icon-btn icon-btn--toolbar icon-btn--plus" id="btn-add-text" disabled aria-label="Add text layer" title="Add text">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </div>
            <div class="stage" id="stage">
              <img class="stage-img" id="stage-img" alt="Your image" />
              <div class="layers" id="layers"></div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <div class="text-toolbox hidden" id="text-toolbox" role="toolbar" aria-label="Text formatting">
      <div class="text-toolbox-row">
        <select class="tb-select" id="tb-font" title="Font"></select>
        <select class="tb-select tb-select--size" id="tb-size" title="Size" aria-label="Font size"></select>
        <button type="button" class="tb-toggle" id="tb-bold" aria-pressed="false" title="Bold">B</button>
        <button type="button" class="tb-toggle" id="tb-italic" aria-pressed="false" title="Italic"><i>I</i></button>
        <label class="tb-color-wrap" title="Color">
          <input type="color" id="tb-color" class="tb-color" aria-label="Text color" />
        </label>
        <button type="button" class="tb-icon-danger" id="tb-delete" aria-label="Delete text" title="Delete">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6"/>
          </svg>
        </button>
      </div>
    </div>

    <nav class="bottom-dock" aria-label="Export">
      <button type="button" class="dock-btn" id="btn-png" disabled aria-label="Download PNG">
        <svg class="dock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 3v12"/>
          <path d="M8 11l4 4 4-4"/>
          <path d="M4 19h16"/>
        </svg>
        <span class="dock-label">PNG</span>
      </button>
      <button type="button" class="dock-btn" id="btn-jpg" disabled aria-label="Download JPG">
        <svg class="dock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 3v12"/>
          <path d="M8 11l4 4 4-4"/>
          <path d="M4 19h16"/>
        </svg>
        <span class="dock-label">JPG</span>
      </button>
    </nav>

  </div>
`;

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel);

const fileInput = $('#file-input') as HTMLInputElement;
const btnReplaceImage = $('#btn-replace-image') as HTMLButtonElement;
const btnAddText = $('#btn-add-text') as HTMLButtonElement;
const btnPng = $('#btn-png') as HTMLButtonElement;
const btnJpg = $('#btn-jpg') as HTMLButtonElement;
const canvasShell = $('#canvas-shell') as HTMLDivElement;
const emptyState = $('#empty-state') as HTMLDivElement;
const stageBlock = $('#stage-block') as HTMLDivElement;
const stageImg = $('#stage-img') as HTMLImageElement;
const layersEl = $('#layers') as HTMLDivElement;
const textToolbox = $('#text-toolbox') as HTMLDivElement;
const tbFont = $('#tb-font') as HTMLSelectElement;
const tbSize = $('#tb-size') as HTMLSelectElement;
const tbBold = $('#tb-bold') as HTMLButtonElement;
const tbItalic = $('#tb-italic') as HTMLButtonElement;
const tbColor = $('#tb-color') as HTMLInputElement;
const tbDelete = $('#tb-delete') as HTMLButtonElement;

FONT_OPTIONS.forEach((f) => {
  const opt = document.createElement('option');
  opt.value = f.value;
  opt.textContent = f.label;
  tbFont.appendChild(opt);
});

SIZE_PRESETS.forEach((s) => {
  const opt = document.createElement('option');
  opt.value = String(s.ratio);
  opt.textContent = s.label;
  tbSize.appendChild(opt);
});

function selectedLayer(): TextLayer | null {
  if (!state.selectedId) return null;
  return state.layers.find((l) => l.id === state.selectedId) ?? null;
}

function setImageFromFile(file: File): void {
  if (!file.type.startsWith('image/')) return;
  resetSessionTextDefaults();
  const url = URL.createObjectURL(file);
  if (state.imageSrc) URL.revokeObjectURL(state.imageSrc);
  state.imageSrc = url;
  state.layers = [];
  state.selectedId = null;
  stageImg.src = url;
  stageImg.onload = () => {
    state.imageObject = stageImg;
    emptyState.classList.add('hidden');
    stageBlock.classList.remove('hidden');
    btnReplaceImage.disabled = false;
    btnAddText.disabled = false;
    btnPng.disabled = false;
    btnJpg.disabled = false;
    renderLayers();
  };
}

function openFilePicker(): void {
  fileInput.click();
}

function applyLayerVisuals(el: HTMLElement, layer: TextLayer): void {
  el.style.left = `${layer.nx * 100}%`;
  el.style.top = `${layer.ny * 100}%`;
  const displayH = stageImg.getBoundingClientRect().height || 1;
  const fontPx = Math.max(4, layer.sizeRatio * displayH);
  const inner = el.querySelector<HTMLElement>('.text-layer__inner');
  if (!inner) return;
  inner.style.fontFamily = `"${layer.fontFamily}", sans-serif`;
  inner.style.fontSize = `${fontPx}px`;
  inner.style.fontWeight = String(layer.fontWeight);
  inner.style.fontStyle = layer.fontStyle;
  inner.style.color = layer.color;
  const isSelected = layer.id === state.selectedId;
  inner.contentEditable = isSelected ? 'true' : 'false';
  inner.tabIndex = isSelected ? 0 : -1;
  if (document.activeElement !== inner) {
    inner.textContent = layer.text;
  }
  el.classList.toggle('text-layer--selected', isSelected);
  el.classList.toggle('text-layer--editing', isSelected && document.activeElement === inner);
  el.dataset.id = layer.id;

  el.style.touchAction = 'none';
  inner.style.touchAction = document.activeElement === inner ? 'auto' : 'none';
}

function renderLayers(): void {
  const existing = new Map<string, HTMLElement>();
  layersEl.querySelectorAll<HTMLElement>('.text-layer').forEach((n) => {
    const id = n.dataset.id;
    if (id) existing.set(id, n);
  });

  const nextIds = new Set(state.layers.map((l) => l.id));

  existing.forEach((el, id) => {
    if (!nextIds.has(id)) el.remove();
  });

  for (const layer of state.layers) {
    let el = existing.get(layer.id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'text-layer';
      el.dataset.id = layer.id;
      el.setAttribute('role', 'group');
      el.setAttribute('aria-label', 'Text layer');

      const inner = document.createElement('div');
      inner.className = 'text-layer__inner';
      inner.spellcheck = false;
      el.appendChild(inner);

      inner.addEventListener('input', () => {
        layer.text = inner.innerText.replace(/\u00a0/g, ' ');
        positionToolbox();
      });

      inner.addEventListener('focus', () => {
        inner.style.touchAction = 'auto';
        renderLayers();
      });
      inner.addEventListener('blur', () => {
        inner.style.touchAction = 'none';
        requestAnimationFrame(() => renderLayers());
      });

      inner.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        if (document.activeElement === inner) {
          return;
        }
        const wasSelected = state.selectedId === layer.id;
        if (!wasSelected) {
          state.selectedId = layer.id;
          renderLayers();
          syncToolboxFromLayer();
          rememberTextStyleFromLayer(layer);
        }
        detachLayerPointerTrackingIfAny();
        pointerCandidate = {
          layerId: layer.id,
          pointerId: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          dragging: false,
        };
        const pid = e.pointerId;
        const layerEl = el!;
        const onDocMove = (moveEv: PointerEvent) => {
          if (moveEv.pointerId !== pid) return;

          if (pointerCandidate?.layerId !== layer.id || pointerCandidate.pointerId !== pid) {
            if (dragSession?.layerId === layer.id && dragSession.pointerId === pid) {
              moveEv.preventDefault();
              const r = layersEl.getBoundingClientRect();
              let nx = ((moveEv.clientX - r.left) / r.width) * 100 - dragSession.offsetXPct;
              let ny = ((moveEv.clientY - r.top) / r.height) * 100 - dragSession.offsetYPct;
              nx = Math.max(0, Math.min(100, nx));
              ny = Math.max(0, Math.min(100, ny));
              layer.nx = nx / 100;
              layer.ny = ny / 100;
              layerEl.style.left = `${nx}%`;
              layerEl.style.top = `${ny}%`;
              positionToolbox();
            }
            return;
          }

          const pc = pointerCandidate;
          const dx = moveEv.clientX - pc.x;
          const dy = moveEv.clientY - pc.y;
          if (!pc.dragging && dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
            return;
          }

          if (!pc.dragging && dx * dx + dy * dy >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
            pc.dragging = true;
            inner.blur();
            layerEl.setPointerCapture(pid);
            const rect = layersEl.getBoundingClientRect();
            const lx = ((pc.x - rect.left) / rect.width) * 100;
            const ly = ((pc.y - rect.top) / rect.height) * 100;
            dragSession = {
              layerId: layer.id,
              pointerId: pid,
              offsetXPct: lx - layer.nx * 100,
              offsetYPct: ly - layer.ny * 100,
            };
          }

          if (dragSession?.layerId === layer.id && dragSession.pointerId === pid) {
            moveEv.preventDefault();
            const r = layersEl.getBoundingClientRect();
            let nx = ((moveEv.clientX - r.left) / r.width) * 100 - dragSession.offsetXPct;
            let ny = ((moveEv.clientY - r.top) / r.height) * 100 - dragSession.offsetYPct;
            nx = Math.max(0, Math.min(100, nx));
            ny = Math.max(0, Math.min(100, ny));
            layer.nx = nx / 100;
            layer.ny = ny / 100;
            layerEl.style.left = `${nx}%`;
            layerEl.style.top = `${ny}%`;
            positionToolbox();
          }
        };

        const onDocUp = (upEv: PointerEvent) => {
          if (upEv.pointerId !== pid) return;
          detachLayerPointerTrackingIfAny();

          if (pointerCandidate?.pointerId === pid && pointerCandidate.layerId === layer.id) {
            if (!pointerCandidate.dragging) {
              requestAnimationFrame(() => {
                if (!wasSelected) return;
                const ed = layerEl.querySelector<HTMLElement>('.text-layer__inner');
                ed?.focus();
                const len = ed?.innerText.length ?? 0;
                try {
                  const range = document.createRange();
                  const sel = window.getSelection();
                  const node = ed?.firstChild;
                  if (ed && sel && node && node.nodeType === Node.TEXT_NODE) {
                    range.setStart(node, len);
                    range.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(range);
                  } else if (ed && sel) {
                    range.selectNodeContents(ed);
                    range.collapse(false);
                    sel.removeAllRanges();
                    sel.addRange(range);
                  }
                } catch {
                  /* ignore */
                }
              });
            }
            pointerCandidate = null;
          }
          if (dragSession?.pointerId === pid) {
            dragSession = null;
          }
          try {
            layerEl.releasePointerCapture(pid);
          } catch {
            /* ignore */
          }
        };

        document.addEventListener('pointermove', onDocMove, true);
        document.addEventListener('pointerup', onDocUp, true);
        document.addEventListener('pointercancel', onDocUp, true);
        detachLayerPointerTracking = () => {
          document.removeEventListener('pointermove', onDocMove, true);
          document.removeEventListener('pointerup', onDocUp, true);
          document.removeEventListener('pointercancel', onDocUp, true);
        };

        requestAnimationFrame(() => positionToolbox());
      });

      layersEl.appendChild(el);
    }
    applyLayerVisuals(el, layer);
  }

  if (state.selectedId && !state.layers.some((l) => l.id === state.selectedId)) {
    state.selectedId = null;
  }
  syncToolboxFromLayer();
  requestAnimationFrame(() => positionToolbox());
}

function positionToolbox(): void {
  const layer = selectedLayer();
  const show = !!(state.imageObject && layer && state.selectedId);
  if (!show) {
    textToolbox.classList.add('hidden');
    return;
  }
  const innerEl = layersEl.querySelector<HTMLElement>(`.text-layer[data-id="${layer.id}"] .text-layer__inner`);
  if (innerEl && document.activeElement === innerEl) {
    textToolbox.classList.add('hidden');
    return;
  }
  textToolbox.classList.remove('hidden');
  const el = layersEl.querySelector<HTMLElement>(`.text-layer[data-id="${layer.id}"]`);
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const tb = textToolbox.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  let top = rect.top - tb.height - 12;
  const safeTop = 8 + (typeof CSS !== 'undefined' ? Number.parseFloat(getComputedStyle(document.documentElement).paddingTop) || 0 : 0);
  if (top < safeTop) {
    top = rect.bottom + 12;
  }
  let left = cx - tb.width / 2;
  const pad = 10;
  left = Math.max(pad, Math.min(left, window.innerWidth - tb.width - pad));
  textToolbox.style.left = `${left}px`;
  textToolbox.style.top = `${top}px`;
}

function syncToolboxFromLayer(): void {
  const layer = selectedLayer();
  if (!layer) return;
  tbFont.value = layer.fontFamily;
  tbSize.value = String(nearestPresetRatio(layer.sizeRatio));
  tbBold.setAttribute('aria-pressed', String(layer.fontWeight >= 700));
  tbBold.classList.toggle('tb-toggle--on', layer.fontWeight >= 700);
  tbItalic.setAttribute('aria-pressed', String(layer.fontStyle === 'italic'));
  tbItalic.classList.toggle('tb-toggle--on', layer.fontStyle === 'italic');
  tbColor.value = hexToInputColor(layer.color);
}

tbFont.addEventListener('change', () => {
  const layer = selectedLayer();
  if (!layer) return;
  layer.fontFamily = tbFont.value;
  rememberTextStyleFromLayer(layer);
  renderLayers();
});

tbSize.addEventListener('change', () => {
  const layer = selectedLayer();
  if (!layer) return;
  layer.sizeRatio = Number(tbSize.value);
  rememberTextStyleFromLayer(layer);
  renderLayers();
});

tbBold.addEventListener('click', () => {
  const layer = selectedLayer();
  if (!layer) return;
  layer.fontWeight = layer.fontWeight >= 700 ? 400 : 700;
  rememberTextStyleFromLayer(layer);
  renderLayers();
});

tbItalic.addEventListener('click', () => {
  const layer = selectedLayer();
  if (!layer) return;
  layer.fontStyle = layer.fontStyle === 'italic' ? 'normal' : 'italic';
  rememberTextStyleFromLayer(layer);
  renderLayers();
});

tbColor.addEventListener('input', () => {
  const layer = selectedLayer();
  if (!layer) return;
  layer.color = tbColor.value;
  rememberTextStyleFromLayer(layer);
  renderLayers();
});

tbDelete.addEventListener('click', () => {
  const id = state.selectedId;
  if (!id) return;
  state.layers = state.layers.filter((l) => l.id !== id);
  state.selectedId = null;
  renderLayers();
});

btnAddText.addEventListener('click', () => {
  if (!state.imageObject) return;
  const layer = defaultLayer();
  state.layers.push(layer);
  state.selectedId = layer.id;
  renderLayers();
  requestAnimationFrame(() => {
    const ed = layersEl.querySelector<HTMLElement>(`.text-layer[data-id="${layer.id}"] .text-layer__inner`);
    ed?.focus();
  });
});

btnReplaceImage.addEventListener('click', () => openFilePicker());

fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0];
  if (f) setImageFromFile(f);
  fileInput.value = '';
});

emptyState.addEventListener('click', () => openFilePicker());

['dragenter', 'dragover'].forEach((ev) => {
  canvasShell.addEventListener(ev, (e) => {
    e.preventDefault();
    e.stopPropagation();
    canvasShell.classList.add('canvas-shell--drop');
  });
});
['dragleave', 'drop'].forEach((ev) => {
  canvasShell.addEventListener(ev, (e) => {
    e.preventDefault();
    e.stopPropagation();
    canvasShell.classList.remove('canvas-shell--drop');
  });
});
canvasShell.addEventListener('drop', (e) => {
  const f = e.dataTransfer?.files?.[0];
  if (f?.type.startsWith('image/')) setImageFromFile(f);
});

function isInsideToolbarOrDock(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el?.closest) return false;
  return Boolean(
    el.closest('#text-toolbox') ||
      el.closest('.bottom-dock') ||
      el.closest('.topbar') ||
      el.closest('.tagline'),
  );
}

canvasShell.addEventListener('pointerdown', (e) => {
  const el = e.target as HTMLElement;
  if (el.closest('.text-layer') || el.closest('.stage-toolbar')) return;
  state.selectedId = null;
  layersEl.querySelector<HTMLElement>('.text-layer__inner:focus')?.blur();
  renderLayers();
});

textToolbox.addEventListener('pointerdown', (e) => e.stopPropagation());

document.addEventListener(
  'pointerdown',
  (e) => {
    if (!state.imageObject) return;
    const el = e.target as HTMLElement;
    if (el.closest('.canvas-shell') || isInsideToolbarOrDock(e.target)) return;
    if (state.selectedId === null) return;
    state.selectedId = null;
    layersEl.querySelector<HTMLElement>('.text-layer__inner:focus')?.blur();
    renderLayers();
  },
  true,
);

function exportImage(kind: 'png' | 'jpg'): void {
  const img = state.imageObject;
  if (!img || !img.complete || img.naturalWidth === 0) return;
  layersEl.querySelector<HTMLElement>('.text-layer__inner:focus')?.blur();
  state.layers.forEach((layer) => {
    const ed = layersEl.querySelector<HTMLElement>(`.text-layer[data-id="${layer.id}"] .text-layer__inner`);
    if (ed) layer.text = ed.innerText.replace(/\u00a0/g, ' ');
  });
  const canvas = compositeToCanvas(img, state.layers);
  const base = 'imprint-export';
  if (kind === 'png') downloadCanvas(canvas, `${base}.png`, 'image/png');
  else downloadCanvas(canvas, `${base}.jpg`, 'image/jpeg');
}

btnPng.addEventListener('click', () => exportImage('png'));
btnJpg.addEventListener('click', () => exportImage('jpg'));

window.addEventListener('resize', () => {
  if (state.layers.length) {
    renderLayers();
  }
});

window.addEventListener('scroll', () => positionToolbox(), true);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    layersEl.querySelector<HTMLElement>('.text-layer__inner:focus')?.blur();
    if (state.selectedId !== null) {
      state.selectedId = null;
      renderLayers();
    }
  }
});
