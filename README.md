# MonoTools

ASCII-first, private browser tools built with React + Vite.

**Live:** https://hasan-li.github.io/monotools/

## Available tools

- [JSON formatter and validator](https://hasan-li.github.io/monotools/json/) — format, validate, recursively sort, copy, and inspect JSON in an ASCII tree; preserves large integers exactly
- [CSS color converter](https://hasan-li.github.io/monotools/color/) — convert CSS colors to HEX, RGB, HSL, HSV, and CMYK

- [Text diff checker](https://hasan-li.github.io/monotools/diff/) — compare two editable texts and review the full texts side by side with line and character-level highlights

Inputs are processed locally and never uploaded.

## Text comparison

Each input accepts up to 1 MiB (1,048,576 UTF-8 bytes). Compare runs on demand in a Web Worker. Spaces, tabs, and final newlines matter; CRLF and CR are normalized to LF. Replacement lines are paired in order; moved blocks appear as removals and additions.

Results show all paired rows in one continuous, page-scrolling comparison. Expensive comparisons stop after approximately five seconds; highly fragmented highlights are rejected rather than partially rendered. Inputs and the previous result remain available after errors or cancellation.

```bash
npm run check:diff
```

Browser regression check (requires `agent-browser` and `npm run dev`):

```bash
node bench/diff-layout.mjs
```

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

- `vite.config.ts` uses `base: '/monotools/'` for a repository named `monotools`.
- `public/404.html` enables SPA deep-link fallback for `/json`, `/color`, and `/diff`.
