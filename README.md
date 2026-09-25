# tools

ASCII-first tools directory built with React + Vite.

## Available routes

- `/` main tools index
- `/json` JSON formatter / validator with ASCII tree view
- `/color` color converter (single input, multi-format output)

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## JSON verification

```bash
npm run check:json
npm run bench:json
```

The benchmark covers small, deeply nested, root primitive, unsafe integer, generated 5 MB, invalid, and truncated inputs. It reports median parse, recursive sort, format, tree preparation, and React static-render times separately. Static rendering isolates React element work; use a browser profiler when DOM commit and paint measurements are needed.

## GitHub Pages notes

- `vite.config.ts` uses `base: '/tools/'` for a repository named `tools`.
- `public/404.html` enables SPA deep-link fallback for `/json` and `/color`.
