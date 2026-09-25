import assert from 'node:assert/strict';
import { buildTreeRows, getInitialExpandedPaths, isJsonInputTooLarge, MAX_JSON_INPUT_SIZE, parseJson, sortJsonKeys, stringifyJson } from '../src/json.ts';

const exact = '9007199254740993123456789';
const largeDecimal = '123456789012345678901234567890.5';
const decimalString = (value: unknown): string =>
  typeof value === 'object' && value !== null && 'toFixed' in value
    ? (value as { toFixed: () => string }).toFixed()
    : String(value);
const source = `{"z":${exact},"a":{"value":${exact}}}`;
const parsed = parseJson(source);
const sorted = sortJsonKeys(parsed);
const formatted = stringifyJson(sorted, 2);
const expanded = getInitialExpandedPaths(sorted);
expanded.add('$/a');
const treeRows = buildTreeRows(sorted, expanded);
const treeOutput = treeRows.map((row) => `${row.prefix}${row.content}`).join('\n');

const formattedParsed = parseJson(formatted) as Record<string, Record<string, unknown>>;
const renderedInteger = String((sorted as Record<string, Record<string, unknown>>).a.value);
const decimalOutput = stringifyJson(parseJson(largeDecimal));

assert.equal(decimalString((parsed as Record<string, unknown>).z), exact, 'parse must preserve the integer');
assert.equal(decimalString((sorted as Record<string, Record<string, unknown>>).a.value), exact, 'sort must preserve the integer');
assert.equal(decimalString(formattedParsed.a.value), exact, 'formatted/plain copy output must preserve the integer');
assert.equal((treeOutput.match(new RegExp(renderedInteger.replace('+', '\\+'), 'g')) ?? []).length, 2, 'tree/copy output must preserve the integer');
assert.equal(decimalString(parseJson(renderedInteger)), exact, 'tree representation must round-trip exactly');
assert.equal(decimalString(parseJson(decimalOutput)), largeDecimal, 'large decimals must parse and round-trip exactly');
assert.equal(stringifyJson(parseJson('null'), 2), 'null', 'root null must render');
assert.equal(buildTreeRows(parseJson('null'), new Set())[0]?.content, 'null', 'root null must render in tree view');
assert.equal(treeRows.find((row) => row.collapsiblePath === '$/a')?.content, '"a": {', 'expanded containers must retain property and structural context');
assert.equal(isJsonInputTooLarge('x'.repeat(MAX_JSON_INPUT_SIZE)), false, 'input at the limit must be accepted');
assert.equal(isJsonInputTooLarge('x'.repeat(MAX_JSON_INPUT_SIZE + 1)), true, 'pasted or typed input over the limit must be rejected');

console.log('Exact integer, large decimal, and root null checks passed.');
