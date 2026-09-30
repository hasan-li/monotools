# monotools

ASCII-first, private browser tools built with React + Vite.

**Live:** https://hasan-li.github.io/tools/

## Available tools

- [JSON formatter and validator](https://hasan-li.github.io/tools/json/) — format, validate, recursively sort, copy, and inspect JSON in an ASCII tree; preserves large integers exactly
- [CSS color converter](https://hasan-li.github.io/tools/color/) — convert CSS colors to HEX, RGB, HSL, HSV, and CMYK

Inputs are processed locally and never uploaded.

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
