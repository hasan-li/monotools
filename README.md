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

## GitHub Pages notes

- `vite.config.ts` uses `base: '/tools/'` for a repository named `tools`.
- `public/404.html` enables SPA deep-link fallback for `/json` and `/color`.
