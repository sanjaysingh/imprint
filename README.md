# Imprint

Add styled text layers on top of an image and export as **PNG** or **JPG**. Everything runs in the browser; images are not uploaded to a server.

## Features

- Upload or drop an image onto the canvas
- Multiple draggable text layers with font, size, weight, italic, and color
- Floating formatting toolbar for the selected layer
- Export composite to PNG or JPG

## Prerequisites

- [Node.js](https://nodejs.org/)18+ (includes npm)

## Running locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (typically `http://localhost:5173`).

## Scripts

| Command        | Description                                      |
| -------------- | ------------------------------------------------ |
| `npm run dev`  | Start dev server with hot reload                 |
| `npm run build`| Typecheck (`tsc`) and production build (`vite`)  |
| `npm run preview` | Serve the production build locally            |

## Project structure

| Path        | Role |
| ----------- | ----------------------------------------- |
| `index.html`| Entry HTML                                |
| `src/main.ts` | App UI, layers, interactions |
| `src/export.ts` | Canvas export / download helpers |
| `src/types.ts`  | Shared types (e.g. text layers)       |
| `src/style.css` | Global styles                         |

## License

MIT — see [LICENSE](LICENSE).
