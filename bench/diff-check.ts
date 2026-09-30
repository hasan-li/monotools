import assert from 'node:assert/strict';
import { compareTexts, MAX_TEXT_BYTES, DIFF_COMPLEXITY_ERROR, type DiffLine } from '../src/diff.ts';

const changesOnly = (original: string, changed: string, timeout?: number) => {
  const result = compareTexts(original, changed, timeout);
  return { ...result, rows: result.rows.filter((row) => row.kind !== 'unchanged') };
};
const text = (line: DiffLine | null): string => line?.segments.map((part) => part.text).join('') ?? '';
const highlights = (line: DiffLine | null): string[] => line?.segments.filter((part) => part.changed).map((part) => part.text) ?? [];

assert.equal(compareTexts('', '').rows.length, 0);
assert.equal(compareTexts('same\n', 'same\n').rows[0].kind, 'unchanged');
assert.equal(compareTexts('a\r\nb\rc\r\n', 'a\nb\nc\n').rows.length, 3);
assert.deepEqual(compareTexts('a\r\nb\rc\r\n', 'a\nb\nc\n').counts, { added: 0, removed: 0, changed: 0 });
assert.deepEqual(compareTexts('', 'a\n\n').counts, { added: 2, removed: 0, changed: 0 });
assert.equal(compareTexts('', '\n').rows[0].original, null, 'Absent is not an empty line');
assert.equal(text(compareTexts('', '\n').rows[0].changed), '');
assert.deepEqual(compareTexts('a\n', '').counts, { added: 0, removed: 1, changed: 0 });
const replacement = changesOnly('same\ntimeout = 30\nend\n', 'same\ntimeout = 60\nend\n');
assert.equal(replacement.rows.length, 1);
assert.equal(replacement.rows[0].original?.number, 2);
assert.equal(replacement.rows[0].changed?.number, 2);
assert.deepEqual(highlights(replacement.rows[0].original), ['3']);
assert.deepEqual(highlights(replacement.rows[0].changed), ['6']);
assert.equal(text(replacement.rows[0].original), 'timeout = 30');
assert.equal(text(replacement.rows[0].changed), 'timeout = 60');

const uneven = changesOnly('before\na\nb\nafter\n', 'before\nx\ny\nz\nafter\n');
assert.deepEqual(uneven.counts, { added: 1, removed: 0, changed: 2 });
assert.equal(uneven.rows[2].changed?.number, 4);
assert.equal(uneven.rows[2].original, null);
const separated = compareTexts('one\na\nkeep\nb\nend', 'one\nx\nkeep\ny\nend');
assert.deepEqual(separated.rows.map((row) => [row.kind, row.original?.number]), [['unchanged', 1], ['changed', 2], ['unchanged', 3], ['changed', 4], ['unchanged', 5]]);
assert.deepEqual(separated.rows.map((row) => text(row.original)), ['one', 'a', 'keep', 'b', 'end']);
assert.deepEqual(separated.rows.map((row) => text(row.changed)), ['one', 'x', 'keep', 'y', 'end']);
assert.equal(compareTexts('a\nb\na\nb\n', 'a\nb\nx\na\nb\n').counts.added, 1);
const moved = compareTexts('a\nb\nc\n', 'c\na\nb\n');
assert.deepEqual(moved.counts, { added: 1, removed: 1, changed: 0 });

for (const [before, after] of [[' leading', 'leading'], ['trailing ', 'trailing'], ['a\tb', 'a b'], ['a  b', 'a b']]) {
  const diff = compareTexts(before, after);
  assert.equal(diff.rows.length, 1);
  assert.equal(text(diff.rows[0].original), before);
  assert.equal(text(diff.rows[0].changed), after);
}
const finalNewline = compareTexts('text', 'text\n');
assert.equal(finalNewline.rows.length, 1);
assert.equal(finalNewline.rows[0].original?.noNewline, true);
assert.equal(finalNewline.rows[0].changed?.noNewline, false);
assert.deepEqual(highlights(finalNewline.rows[0].original), []);
assert.equal(compareTexts('text\n', 'text\n\n').counts.added, 1);
const emoji = compareTexts('hi 👩🏽‍💻!', 'hi 👩🏽‍🚀!');
assert.deepEqual(highlights(emoji.rows[0].original), ['👩🏽‍💻']);
assert.deepEqual(highlights(emoji.rows[0].changed), ['👩🏽‍🚀']);
assert.deepEqual(highlights(compareTexts('e\u0301', 'e').rows[0].original), ['e\u0301']);
assert.equal(text(compareTexts('こんにちは', 'こんばんは').rows[0].changed), 'こんばんは');
assert.equal(text(compareTexts('', '<script>alert(1)</script>').rows[0].changed), '<script>alert(1)</script>');

assert.equal(compareTexts('x'.repeat(MAX_TEXT_BYTES), 'x'.repeat(MAX_TEXT_BYTES)).rows[0].kind, 'unchanged');
assert.throws(() => compareTexts('x'.repeat(MAX_TEXT_BYTES + 1), ''), /1 MiB/);
assert.throws(() => compareTexts('', 'é'.repeat(MAX_TEXT_BYTES / 2 + 1)), /1 MiB/);
assert.throws(() => compareTexts('a', 'b', 0), { message: DIFF_COMPLEXITY_ERROR });
assert.throws(() => compareTexts('', 'a '.repeat(11000)), { message: DIFF_COMPLEXITY_ERROR }, 'Bound highlight DOM, including whitespace annotations');

const records = Array.from({ length: 20000 }, (_, index) => `record ${index}: ${'x'.repeat(32)}\n`).join('');
const start = performance.now();
const large = compareTexts(records, records.replace('record 15000:', 'updated record 15000:'));
assert.equal(large.rows.length, 20000);
assert.equal(large.counts.changed, 1);
assert.equal(large.rows[15000].original?.number, 15001);
assert.equal(large.rows[15000].kind, 'changed');
console.log(`Diff checks passed; near-limit comparison: ${Math.round(performance.now() - start)}ms.`);
