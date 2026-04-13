import './style.css';
import { compositeToCanvas, downloadCanvas } from './export';
import { FONT_OPTIONS, type TextLayer } from './types';

const DRAG_THRESHOLD_PX = 6;

function createId(): string {
  return `t_${Math.random().toString(36).slice(2, 11)}`;
}

function defaultLayer(): TextLayer {
  return {
    id: createId(),
    text: 'Your text',
    nx: 0.5,
    ny: 0.5,
    sizeRatio: 0.06,
    fontFamily: FONT_OPTIONS[0].value,
    fontWeight: 700,
    fontStyle: 'normal',
    color: '#ffffff',
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
      <button type="button" class="icon-btn icon-btn--plus" id="btn-add-text" disabled aria-label="Add text layer" title="Add text">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </header>

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
          <div class="stage" id="stage">
            <img class="stage-img" id="stage-img" alt="Your image" />
            <div class="layers" id="layers"></div>
          </div>
        </div>
      </div>
    </main>

    <div class="text-toolbox hidden" id="text-toolbox" role="toolbar" aria-label="Text formatting">
      <div class="text-toolbox-row">
        <select class="tb-select" id="tb-font" title="Font"></select>
        <label class="tb-size" title="Size">
          <input type="range" id="tb-size-range" min="20" max="160" step="1" aria-label="Text size" />
        </label>
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

    <p class="privacy-note">Runs in your browser — nothing is uploaded.</p>
  </div>
`;

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel);

const fileInput = $('#file-input') as HTMLInputElement;
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
const tbSize = $('#tb-size-range') as HTMLInputElement;
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

function selectedLayer(): TextLayer | null {
  if (!state.selectedId) return null;
  return state.layers.find((l) => l.id === state.selectedId) ?? null;
}

function setImageFromFile(file: File): void {
  if (!file.type.startsWith('image/')) return;
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
    btnAddText.disabled = false;
    btnPng.disabled = false;
    btnJpg.disabled = false;
    const layer = defaultLayer();
    state.layers.push(layer);
    state.selectedId = layer.id;
    renderLayers();
    syncToolboxFromLayer();
    requestAnimationFrame(() => positionToolbox());
  };
}

function openFilePicker(): void {
  fileInput.click();
}

function applyLayerVisuals(el: HTMLElement, layer: TextLayer): void {
  el.style.left = `${layer.nx * 100}%`;
  el.style.top = `${layer.ny * 100}%`;
  const displayH = stageImg.getBoundingClientRect().height || 1;
  const fontPx = Math.max(10, layer.sizeRatio * displayH);
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
  el.dataset.id = layer.id;
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

      el.addEventListener(
        'pointerdown',
        (e) => {
          if (e.button !== 0) return;
          state.selectedId = layer.id;
          renderLayers();
          syncToolboxFromLayer();
          requestAnimationFrame(() => positionToolbox());
          pointerCandidate = {
            layerId: layer.id,
            pointerId: e.pointerId,
            x: e.clientX,
            y: e.clientY,
            dragging: false,
          };
          el!.setPointerCapture(e.pointerId);
        },
        true,
      );

      el.addEventListener('pointermove', (e) => {
        if (pointerCandidate && pointerCandidate.layerId === layer.id && pointerCandidate.pointerId === e.pointerId) {
          const dx = e.clientX - pointerCandidate.x;
          const dy = e.clientY - pointerCandidate.y;
          if (!pointerCandidate.dragging && dx * dx + dy * dy >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
            pointerCandidate.dragging = true;
            const innerEl = el!.querySelector<HTMLElement>('.text-layer__inner');
            innerEl?.blur();
            const rect = layersEl.getBoundingClientRect();
            const lx = ((pointerCandidate.x - rect.left) / rect.width) * 100;
            const ly = ((pointerCandidate.y - rect.top) / rect.height) * 100;
            dragSession = {
              layerId: layer.id,
              pointerId: e.pointerId,
              offsetXPct: lx - layer.nx * 100,
              offsetYPct: ly - layer.ny * 100,
            };
          }
        }
        if (dragSession?.layerId === layer.id && dragSession.pointerId === e.pointerId) {
          e.preventDefault();
          const r = layersEl.getBoundingClientRect();
          let nx = ((e.clientX - r.left) / r.width) * 100 - dragSession.offsetXPct;
          let ny = ((e.clientY - r.top) / r.height) * 100 - dragSession.offsetYPct;
          nx = Math.max(0, Math.min(100, nx));
          ny = Math.max(0, Math.min(100, ny));
          layer.nx = nx / 100;
          layer.ny = ny / 100;
          el!.style.left = `${nx}%`;
          el!.style.top = `${ny}%`;
          positionToolbox();
        }
      });

      const endPointer = (e: PointerEvent) => {
        if (pointerCandidate?.pointerId === e.pointerId && pointerCandidate.layerId === layer.id) {
          if (!pointerCandidate.dragging) {
            requestAnimationFrame(() => {
              const ed = el!.querySelector<HTMLElement>('.text-layer__inner');
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
        if (dragSession?.pointerId === e.pointerId) {
          dragSession = null;
        }
        try {
          el!.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      };
      el.addEventListener('pointerup', endPointer);
      el.addEventListener('pointercancel', endPointer);

      layersEl.appendChild(el);
    }
    applyLayerVisuals(el, layer);
  }

  if (!state.layers.some((l) => l.id === state.selectedId)) {
    state.selectedId = state.layers[0]?.id ?? null;
  }
  syncToolboxFromLayer();
  requestAnimationFrame(() => positionToolbox());
}

function positionToolbox(): void {
  const layer = selectedLayer();
  const show = !!(state.imageObject && layer);
  if (!show) {
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
  tbSize.value = String(layer.sizeRatio * 1000);
  tbBold.setAttribute('aria-pressed', String(layer.fontWeight >= 700));
  tbBold.classList.toggle('tb-toggle--on', layer.fontWeight >= 700);
  tbItalic.setAttribute('aria-pressed', String(layer.fontStyle === 'italic'));
  tbItalic.classList.toggle('tb-toggle--on', layer.fontStyle === 'italic');
  tbColor.value = hexToInputColor(layer.color);
}

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

tbFont.addEventListener('change', () => {
  const layer = selectedLayer();
  if (!layer) return;
  layer.fontFamily = tbFont.value;
  renderLayers();
});

tbSize.addEventListener('input', () => {
  const layer = selectedLayer();
  if (!layer) return;
  layer.sizeRatio = Number(tbSize.value) / 1000;
  renderLayers();
});

tbBold.addEventListener('click', () => {
  const layer = selectedLayer();
  if (!layer) return;
  layer.fontWeight = layer.fontWeight >= 700 ? 400 : 700;
  renderLayers();
});

tbItalic.addEventListener('click', () => {
  const layer = selectedLayer();
  if (!layer) return;
  layer.fontStyle = layer.fontStyle === 'italic' ? 'normal' : 'italic';
  renderLayers();
});

tbColor.addEventListener('input', () => {
  const layer = selectedLayer();
  if (!layer) return;
  layer.color = tbColor.value;
  renderLayers();
});

tbDelete.addEventListener('click', () => {
  const id = state.selectedId;
  if (!id) return;
  state.layers = state.layers.filter((l) => l.id !== id);
  state.selectedId = state.layers[0]?.id ?? null;
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

textToolbox.addEventListener('pointerdown', (e) => e.stopPropagation());

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
  else downloadCanvas(canvas, `${base}.jpg`, 'image/jpeg', 0.92);
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
    (document.activeElement as HTMLElement)?.blur?.();
  }
});
