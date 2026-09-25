import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  buildTreeRows,
  getInitialExpandedPaths,
  parseJson,
  sortJsonKeys,
  stringifyJson,
  type JsonRenderRow,
} from '../src/json.ts';
const fixture = (name: string): string => readFileSync(fileURLToPath(new URL(`fixtures/${name}`, import.meta.url)), 'utf8');
const fiveMegabytes = 5 * 1024 * 1024;
const record = '{"id":1,"name":"benchmark item","enabled":true,"tags":["json","tools"]}';
const recordCount = Math.floor((fiveMegabytes - 4) / (record.length + 1));
const largePrefix = `[${Array(recordCount).fill(record).join(',')},"`;
const large = `${largePrefix}${'x'.repeat(fiveMegabytes - largePrefix.length - 2)}"]`;

const fixtures = [
  { name: 'small', input: fixture('small.json') },
  { name: 'deep-200', input: `${'['.repeat(200)}null${']'.repeat(200)}` },
  { name: 'root-null', input: 'null' },
  { name: 'root-string', input: '"tools"' },
  { name: 'root-number', input: '42' },
  { name: 'root-boolean', input: 'true' },
  { name: 'unsafe-integer', input: '9007199254740993123456789' },
  { name: '5mb-array', input: large },
  { name: 'invalid', input: fixture('invalid.json'), invalid: true },
  { name: 'truncated', input: fixture('truncated.json'), invalid: true },
];

let sink: unknown;
const median = (run: () => unknown, iterations: number): number => {
  const samples: number[] = [];
  run();
  for (let index = 0; index < iterations; index += 1) {
    const start = performance.now();
    sink = run();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
};

const prepareTree = (value: unknown): JsonRenderRow[] =>
  buildTreeRows(value, getInitialExpandedPaths(value));

const renderOutput = (formatted: string): string =>
  renderToStaticMarkup(createElement('pre', { className: 'panel-output' }, formatted));

assert.equal(large.length, fiveMegabytes);
assert.equal(stringifyJson(parseJson('null')), 'null');
assert.equal((parseJson('9007199254740993123456789') as { toFixed: () => string }).toFixed(), '9007199254740993123456789');
assert.throws(() => parseJson(fixture('invalid.json')));

const results = fixtures.map(({ name, input, invalid }) => {
  const iterations = input.length >= fiveMegabytes ? 3 : 15;
  const parse = (): unknown => parseJson(input);
  const parseMs = median(() => {
    try { return parse(); } catch { return null; }
  }, iterations);

  if (invalid) {
    return { fixture: name, size: `${(input.length / 1024).toFixed(1)} KB`, parse: parseMs.toFixed(2), sort: '-', format: '-', tree: '-', render: '-', lines: '-' };
  }

  const value = parse();
  const sorted = sortJsonKeys(value);
  const formatted = stringifyJson(value, 2);

  return {
    fixture: name,
    size: `${(input.length / 1024).toFixed(1)} KB`,
    parse: parseMs.toFixed(2),
    sort: median(() => sortJsonKeys(value), iterations).toFixed(2),
    format: median(() => stringifyJson(sorted, 2), iterations).toFixed(2),
    tree: median(() => prepareTree(value), iterations).toFixed(2),
    render: median(() => renderOutput(formatted), iterations).toFixed(2),
    lines: formatted.split('\n').length.toLocaleString('en-US'),
  };
});

console.table(results);
console.log('Times are median milliseconds; render is React static-render cost (browser DOM commit excluded).');
void sink;
