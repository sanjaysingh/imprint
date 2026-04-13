import './style.css';
import { compositeToCanvas, downloadCanvas } from './export';
import { FONT_OPTIONS, type TextLayer } from './types';

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

let dragLayerId: string | null = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app missing');

app.innerHTML = `
  <div class="shell">
    <header class="header">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true"></span>
        <div>
          <h1 class="brand-title">Imprint</h1>
          <p class="brand-sub">Style text on your image and export</p>
        </div>
      </div>
    </header>

    <div class="toolbar" role="toolbar" aria-label="Actions">
      <label class="btn btn-primary">
        <input type="file" class="visually-hidden" id="file-input" accept="image/*" />
        Upload image
      </label>
      <button type="button" class="btn" id="btn-add-text" disabled>Add text</button>
      <div class="toolbar-spacer"></div>
      <button type="button" class="btn" id="btn-png" disabled title="Download PNG">PNG</button>
      <button type="button" class="btn" id="btn-jpg" disabled title="Download JPG">JPG</button>
    </div>

    <main class="main">
      <section class="workspace" aria-label="Canvas">
        <div class="dropzone" id="dropzone">
          <div class="dropzone-inner">
            <p class="dropzone-title">Drop an image here</p>
            <p class="dropzone-hint">or use Upload — PNG, JPG, WebP, GIF</p>
          </div>
        </div>
        <div class="stage-host hidden" id="stage-host">
          <div class="stage" id="stage">
            <img class="stage-img" id="stage-img" alt="Uploaded artwork" />
            <div class="layers" id="layers" aria-live="polite"></div>
          </div>
        </div>
      </section>

      <aside class="inspector" aria-label="Text properties">
        <div class="inspector-empty" id="inspector-empty">
          <p>Add text after uploading an image, then select a layer to edit.</p>
        </div>
        <div class="inspector-form hidden" id="inspector-form">
          <h2 class="inspector-heading">Selected text</h2>
          <label class="field">
            <span class="field-label">Content</span>
            <textarea class="input textarea" id="inp-text" rows="4" placeholder="Type here…"></textarea>
          </label>
          <label class="field">
            <span class="field-label">Font</span>
            <select class="input select" id="inp-font"></select>
          </label>
          <label class="field">
            <span class="field-label">Size <span class="field-hint" id="size-label"></span></span>
            <input type="range" class="input range" id="inp-size" min="20" max="160" step="1" />
          </label>
          <div class="row">
            <label class="check">
              <input type="checkbox" id="inp-bold" />
              <span>Bold</span>
            </label>
            <label class="check">
              <input type="checkbox" id="inp-italic" />
              <span>Italic</span>
            </label>
          </div>
          <label class="field">
            <span class="field-label">Color</span>
            <div class="color-row">
              <input type="color" class="input color" id="inp-color" />
              <input type="text" class="input text flex-1" id="inp-color-hex" spellcheck="false" />
            </div>
          </label>
          <button type="button" class="btn btn-danger btn-block" id="btn-delete-layer">Delete text box</button>
        </div>
      </aside>
    </main>

    <footer class="footer">
      <p>Runs entirely in your browser. Nothing is uploaded to a server.</p>
    </footer>
  </div>
`;

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel);

const fileInput = $('#file-input') as HTMLInputElement;
const btnAddText = $('#btn-add-text') as HTMLButtonElement;
const btnPng = $('#btn-png') as HTMLButtonElement;
const btnJpg = $('#btn-jpg') as HTMLButtonElement;
const dropzone = $('#dropzone') as HTMLDivElement;
const stageHost = $('#stage-host') as HTMLDivElement;
const stageImg = $('#stage-img') as HTMLImageElement;
const layersEl = $('#layers') as HTMLDivElement;
const inspectorEmpty = $('#inspector-empty') as HTMLDivElement;
const inspectorForm = $('#inspector-form') as HTMLDivElement;
const inpText = $('#inp-text') as HTMLTextAreaElement;
const inpFont = $('#inp-font') as HTMLSelectElement;
const inpSize = $('#inp-size') as HTMLInputElement;
const sizeLabel = $('#size-label') as HTMLSpanElement;
const inpBold = $('#inp-bold') as HTMLInputElement;
const inpItalic = $('#inp-italic') as HTMLInputElement;
const inpColor = $('#inp-color') as HTMLInputElement;
const inpColorHex = $('#inp-color-hex') as HTMLInputElement;
const btnDeleteLayer = $('#btn-delete-layer') as HTMLButtonElement;

FONT_OPTIONS.forEach((f) => {
  const opt = document.createElement('option');
  opt.value = f.value;
  opt.textContent = f.label;
  inpFont.appendChild(opt);
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
    dropzone.classList.add('hidden');
    stageHost.classList.remove('hidden');
    btnAddText.disabled = false;
    btnPng.disabled = false;
    btnJpg.disabled = false;
    const layer = defaultLayer();
    state.layers.push(layer);
    state.selectedId = layer.id;
    renderLayers();
    syncInspectorFromState();
  };
}

function updateLayer(partial: Partial<TextLayer>): void {
  const layer = selectedLayer();
  if (!layer) return;
  Object.assign(layer, partial);
  renderLayers();
}

function renderLayers(): void {
  layersEl.replaceChildren();
  for (const layer of state.layers) {
    const el = document.createElement('div');
    el.className = 'text-layer' + (layer.id === state.selectedId ? ' text-layer--selected' : '');
    el.dataset.id = layer.id;
    el.textContent = layer.text;
    el.style.left = `${layer.nx * 100}%`;
    el.style.top = `${layer.ny * 100}%`;
    const displayH = stageImg.getBoundingClientRect().height || 1;
    const fontPx = Math.max(10, layer.sizeRatio * displayH);
    el.style.fontFamily = `"${layer.fontFamily}", sans-serif`;
    el.style.fontSize = `${fontPx}px`;
    el.style.fontWeight = String(layer.fontWeight);
    el.style.fontStyle = layer.fontStyle;
    el.style.color = layer.color;
    el.setAttribute('role', 'button');
    el.tabIndex = 0;
    el.setAttribute('aria-label', `Text layer: ${layer.text.slice(0, 40)}${layer.text.length > 40 ? '…' : ''}`);

    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      state.selectedId = layer.id;
      dragLayerId = layer.id;
      const rect = layersEl.getBoundingClientRect();
      const lx = ((e.clientX - rect.left) / rect.width) * 100;
      const ly = ((e.clientY - rect.top) / rect.height) * 100;
      dragOffsetX = lx - layer.nx * 100;
      dragOffsetY = ly - layer.ny * 100;
      el.setPointerCapture(e.pointerId);
      renderLayers();
      syncInspectorFromState();
    });

    el.addEventListener('pointermove', (e) => {
      if (dragLayerId !== layer.id) return;
      const rect = layersEl.getBoundingClientRect();
      let nx = ((e.clientX - rect.left) / rect.width) * 100 - dragOffsetX;
      let ny = ((e.clientY - rect.top) / rect.height) * 100 - dragOffsetY;
      nx = Math.max(0, Math.min(100, nx));
      ny = Math.max(0, Math.min(100, ny));
      layer.nx = nx / 100;
      layer.ny = ny / 100;
      el.style.left = `${nx}%`;
      el.style.top = `${ny}%`;
    });

    const endDrag = (e: PointerEvent) => {
      if (dragLayerId === layer.id) {
        dragLayerId = null;
        try {
          el.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
    };
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      state.selectedId = layer.id;
      renderLayers();
      syncInspectorFromState();
    });

    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        state.selectedId = layer.id;
        renderLayers();
        syncInspectorFromState();
      }
    });

    layersEl.appendChild(el);
  }
}

function syncInspectorFromState(): void {
  const layer = selectedLayer();
  const hasImage = !!state.imageObject;
  if (!hasImage || !layer) {
    inspectorEmpty.classList.remove('hidden');
    inspectorForm.classList.add('hidden');
    return;
  }
  inspectorEmpty.classList.add('hidden');
  inspectorForm.classList.remove('hidden');
  inpText.value = layer.text;
  inpFont.value = layer.fontFamily;
  inpSize.value = String(layer.sizeRatio * 1000);
  inpBold.checked = layer.fontWeight >= 700;
  inpItalic.checked = layer.fontStyle === 'italic';
  inpColor.value = hexToInputColor(layer.color);
  inpColorHex.value = normalizeHex(layer.color);
  sizeLabel.textContent = `(${(layer.sizeRatio * 100).toFixed(1)}% of height)`;
}

function normalizeHex(c: string): string {
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

function hexToInputColor(c: string): string {
  const h = normalizeHex(c);
  return h.length === 7 ? h : '#ffffff';
}

function parseHex(s: string): string | null {
  const t = s.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(t)) return normalizeHex(t);
  return null;
}

inpText.addEventListener('input', () => updateLayer({ text: inpText.value }));
inpFont.addEventListener('change', () => updateLayer({ fontFamily: inpFont.value }));
inpSize.addEventListener('input', () => {
  const v = Number(inpSize.value);
  const ratio = v / 1000;
  updateLayer({ sizeRatio: ratio });
  sizeLabel.textContent = `(${(ratio * 100).toFixed(1)}% of height)`;
});
inpBold.addEventListener('change', () => updateLayer({ fontWeight: inpBold.checked ? 700 : 400 }));
inpItalic.addEventListener('change', () => updateLayer({ fontStyle: inpItalic.checked ? 'italic' : 'normal' }));
inpColor.addEventListener('input', () => {
  updateLayer({ color: inpColor.value });
  inpColorHex.value = inpColor.value;
});
inpColorHex.addEventListener('change', () => {
  const p = parseHex(inpColorHex.value);
  if (p) {
    updateLayer({ color: p });
    inpColor.value = p;
  } else {
    inpColorHex.value = normalizeHex(selectedLayer()?.color ?? '#fff');
  }
});

btnDeleteLayer.addEventListener('click', () => {
  const id = state.selectedId;
  if (!id) return;
  state.layers = state.layers.filter((l) => l.id !== id);
  state.selectedId = state.layers[0]?.id ?? null;
  renderLayers();
  syncInspectorFromState();
});

btnAddText.addEventListener('click', () => {
  const layer = defaultLayer();
  state.layers.push(layer);
  state.selectedId = layer.id;
  renderLayers();
  syncInspectorFromState();
  inpText.focus();
});

fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0];
  if (f) setImageFromFile(f);
  fileInput.value = '';
});

['dragenter', 'dragover'].forEach((ev) => {
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add('dropzone--active');
  });
});
['dragleave', 'drop'].forEach((ev) => {
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('dropzone--active');
  });
});
dropzone.addEventListener('drop', (e) => {
  const f = e.dataTransfer?.files?.[0];
  if (f) setImageFromFile(f);
});

stageHost.addEventListener('click', () => {
  /* deselect optional — keep selection for clearer UX */
});

function exportImage(kind: 'png' | 'jpg'): void {
  const img = state.imageObject;
  if (!img || !img.complete || img.naturalWidth === 0) return;
  const canvas = compositeToCanvas(img, state.layers);
  const base = 'imprint-export';
  if (kind === 'png') {
    downloadCanvas(canvas, `${base}.png`, 'image/png');
  } else {
    downloadCanvas(canvas, `${base}.jpg`, 'image/jpeg', 0.92);
  }
}

btnPng.addEventListener('click', () => exportImage('png'));
btnJpg.addEventListener('click', () => exportImage('jpg'));

window.addEventListener('resize', () => {
  if (state.layers.length) renderLayers();
});
