import { diffArrays } from 'diff';

export const MAX_TEXT_BYTES = 1024 * 1024;
export const DIFF_TIMEOUT_MS = 5000;
export const DIFF_COMPLEXITY_ERROR = 'Comparison too complex. Try a smaller section of text.';
export const normalizeLineEndings = (text: string): string => text.replace(/\r\n?/g, '\n');

export interface DiffSegment { text: string; changed: boolean }
export interface DiffLine { number: number; segments: DiffSegment[]; noNewline: boolean }
export interface DiffRow {
  original: DiffLine | null;
  changed: DiffLine | null;
  kind: 'added' | 'removed' | 'changed' | 'unchanged';
}
export interface DiffResult {
  rows: DiffRow[];
  counts: { added: number; removed: number; changed: number };
}
export interface DiffRequest { id: number; original: string; changed: string }
export type DiffResponse = { id: number; result: DiffResult } | { id: number; error: string };

const lines = (text: string): string[] => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
const graphemes = (text: string): string[] => /^[\t\x20-\x7e]*$/.test(text)
  ? Array.from(text)
  : Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), ({ segment }) => segment);

export function compareTexts(original: string, changed: string, timeout = DIFF_TIMEOUT_MS): DiffResult {
  const encoder = new TextEncoder();
  if (encoder.encode(original).byteLength > MAX_TEXT_BYTES || encoder.encode(changed).byteLength > MAX_TEXT_BYTES) {
    throw new Error('Each input must be 1 MiB or less (1,048,576 UTF-8 bytes).');
  }
  const deadline = performance.now() + timeout;
  const remaining = (): number => {
    const time = deadline - performance.now();
    if (time <= 0) throw new Error(DIFF_COMPLEXITY_ERROR);
    return time;
  };
  const result: DiffResult = { rows: [], counts: { added: 0, removed: 0, changed: 0 } };
  const before = normalizeLineEndings(original);
  const after = normalizeLineEndings(changed);
  const changes = diffArrays(lines(before), lines(after), { timeout: remaining() });
  if (!changes) throw new Error(DIFF_COMPLEXITY_ERROR);
  let originalNumber = 1;
  let changedNumber = 1;
  let segmentCount = 0;

  const makeLine = (text: string, number: number): DiffLine => ({
    number,
    segments: [{ text: text.replace(/\n$/, ''), changed: true }],
    noNewline: !text.endsWith('\n'),
  });

  for (let index = 0; index < changes.length;) {
    remaining();
    const change = changes[index];
    if (!change.added && !change.removed) {
      for (const text of change.value) {
        remaining();
        const left = makeLine(text, originalNumber++);
        const right = makeLine(text, changedNumber++);
        left.segments[0].changed = false;
        right.segments[0].changed = false;
        result.rows.push({ original: left, changed: right, kind: 'unchanged' });
        if (result.rows.length % 200 === 0) segmentCount = 0;
      }
      index += 1;
      continue;
    }
    const removed: string[] = [];
    const added: string[] = [];
    while (index < changes.length && (changes[index].added || changes[index].removed)) {
      const part = changes[index++];
      const target = part.removed ? removed : added;
      for (const line of part.value) target.push(line);
    }
    // ponytail: pair replacement lines in order; use similarity matching only if real examples require it.
    for (let row = 0; row < Math.max(removed.length, added.length); row += 1) {
      remaining();
      const left = row < removed.length ? makeLine(removed[row], originalNumber++) : null;
      const right = row < added.length ? makeLine(added[row], changedNumber++) : null;
      if (left && right) {
        const leftText = left.segments[0].text;
        const rightText = right.segments[0].text;
        if (leftText === rightText) {
          left.segments[0].changed = false;
          right.segments[0].changed = false;
        } else {
          const leftChars = graphemes(leftText);
          const rightChars = graphemes(rightText);
          const characters = diffArrays(leftChars, rightChars, { timeout: remaining() });
          if (!characters) throw new Error(DIFF_COMPLEXITY_ERROR);
          left.segments = [];
          right.segments = [];
          for (const part of characters) {
            const segment = { text: part.value.join(''), changed: part.added || part.removed };
            if (!part.added) left.segments.push(segment);
            if (!part.removed) right.segments.push(segment);
          }
        }
      }
      for (const line of [left, right]) {
        for (const segment of line?.segments ?? []) {
          segmentCount += 1 + (segment.changed ? (segment.text.match(/[ \t]+/g)?.length ?? 0) * 2 : 0);
        }
      }
      // ponytail: cap fragmented highlight DOM; use incremental worker/render batches if this ceiling matters.
      if (segmentCount > 20000) throw new Error(DIFF_COMPLEXITY_ERROR);
      const kind = left && right ? 'changed' : left ? 'removed' : 'added';
      result.rows.push({ original: left, changed: right, kind });
      result.counts[kind] += 1;
      if (result.rows.length % 200 === 0) segmentCount = 0;
    }
  }
  remaining();
  return result;
}
