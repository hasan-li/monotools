// Requires the agent-browser CLI and a running dev server.
// node bench/json-layout.mjs [http://localhost:5173/monotools/json/]
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const browser = (...args) => {
  const response = JSON.parse(execFileSync('agent-browser', ['--session', 'json-layout-check', '--json', ...args], { encoding: 'utf8' }));
  assert.equal(response.success, true, response.error);
  return response.data;
};
const evaluate = (code) => browser('eval', code).result;
const check = (code, message) => assert.equal(evaluate(code), true, message);
const wait = (code) => browser('wait', '--fn', code);
const click = (label) => browser('find', 'role', 'button', 'click', '--name', label, '--exact');
const load = (expression) => {
  evaluate(`(() => {
    const input = document.querySelector('textarea');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, ${expression});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  wait("document.querySelector('#json-status').textContent === 'Valid'");
};
const noBoxScroll = (selector) => check(`(() => {
  const element = document.querySelector('${selector}');
  const style = getComputedStyle(element);
  return element.scrollHeight <= element.clientHeight + 1 && style.borderTopWidth === '0px' && style.borderBottomWidth === '0px';
})()`, `${selector} must grow with its content without output borders`);

try {
  browser('open', process.argv[2] ?? 'http://localhost:5173/monotools/json/');
  for (const [width, height] of [[1440, 900], [820, 900], [390, 844], [320, 700]]) {
    browser('set', 'viewport', String(width), String(height));
    click('Formatted');
    load('JSON.stringify(Array.from({length: 1000}, (_, id) => ({id, value: `record-${id}`})))');
    noBoxScroll('.output-plain');
    evaluate('window.scrollTo(0, 2000)');
    wait('window.scrollY > 1000');
    check("document.querySelector('.workspace-pane:last-child .workspace-header').getBoundingClientRect().top === 0", 'Output controls must remain visible while scrolling');
    if (width > 820) check("document.querySelector('.input-pane').getBoundingClientRect().top === 16", 'Desktop input must stay visible');

    click('Tree');
    wait("document.querySelectorAll('.output-row').length > 0");
    noBoxScroll('.tree-scroll');
    check("document.querySelectorAll('.output-row').length < 150", 'Tree must remain virtualized');
    evaluate('window.scrollTo(0, document.documentElement.scrollHeight / 2)');
    wait("parseFloat(document.querySelector('.tree-window').style.transform.match(/[0-9.]+/)[0]) > 1000");
    check(`Array.from(document.querySelectorAll('.output-row')).some(row => {
      const rect = row.getBoundingClientRect();
      return rect.top > 100 && rect.bottom < innerHeight;
    })`, 'Page scrolling must populate the visible tree window');
    evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
    wait("!!document.querySelector('[aria-label=\"Expand item 999\"]')");
    click('Expand item 999');
    wait("document.querySelector('.tree-window').textContent.includes('record-999')");
    noBoxScroll('.tree-scroll');
    click('Collapse item 999');
    evaluate('window.scrollTo(0, 0)');
    wait("!!document.querySelector('[aria-label=\"Collapse root\"]')");
    browser('focus', '[aria-label="Collapse root"]');
    browser('press', 'Enter');
    wait("document.querySelectorAll('.output-row').length === 1");
    browser('press', 'Enter');
    wait("document.querySelectorAll('.output-row').length > 1");
    check('document.documentElement.scrollWidth <= innerWidth', 'Layout must not overflow the viewport');
    console.log(`${width}px: document scrolling, sticky controls, virtual tree, keyboard expansion passed`);
  }

  click('Formatted');
  load('JSON.stringify({line: "x".repeat(10000)})');
  noBoxScroll('.output-plain');
  check('document.documentElement.scrollWidth <= innerWidth', 'Long lines must not widen the page');
  load('JSON.stringify({z: 1, a: {nested: true}})');
  click('Sort keys');
  check("document.querySelector('pre').textContent.indexOf('\"a\"') < document.querySelector('pre').textContent.indexOf('\"z\"')", 'Sort must still work');
  click('Copy');
  wait("document.querySelector('.copy-control').textContent === 'Copied'");
  check("document.querySelector('#json-status').textContent === 'Valid'", 'Copy feedback must not replace validation');
  evaluate("Object.defineProperty(navigator.clipboard, 'writeText', {configurable: true, value: async () => { throw new Error('denied'); }});");
  click('Copied');
  wait("document.querySelector('.copy-control').textContent === 'Copy failed'");

  browser('fill', 'textarea', '{"broken": 1,}');
  wait("document.querySelector('#json-status').textContent.includes('Line 1, column')");
  check("document.querySelector('textarea').getAttribute('aria-invalid') === 'true' && !document.querySelector('.output-plain')", 'Errors must identify invalid input and remove stale output');
  load(`'['.repeat(200) + 'null' + ']'.repeat(200)`);
  noBoxScroll('.output-plain');
  load("'null'");
  check("document.querySelector('pre').textContent === 'null'", 'Root primitives must render');
  click('Clear');
  check("!document.querySelector('.workspace-pane:last-child .workspace-surface')", 'Empty output must not reserve a box');

  // A realistic near-5 MB file: verify the actual browser layout, not just parsing.
  browser('set', 'viewport', '1440', '900');
  load(`JSON.stringify(Array.from({length: 68000}, (_, id) => ({id, name: 'benchmark item', enabled: true, tags: ['json', 'tools']})))`);
  noBoxScroll('.output-plain');
  evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
  wait('window.scrollY > 100000');
  check("document.querySelector('pre').getBoundingClientRect().bottom <= innerHeight", 'Large formatted output must be reachable to its end');
  click('Tree');
  evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
  wait("!!document.querySelector('[aria-label=\"Expand item 67999\"]')");
  noBoxScroll('.tree-scroll');
  check("document.querySelectorAll('.output-row').length < 150", 'Large trees must not mount every row');

  evaluate(`(() => {
    const file = new File(['x'.repeat(5 * 1024 * 1024 + 1)], 'oversized.json');
    const transfer = new DataTransfer();
    transfer.items.add(file);
    document.querySelector('.input-pane').dispatchEvent(new DragEvent('drop', {bubbles: true, dataTransfer: transfer}));
  })()`);
  wait("document.querySelector('#json-status').textContent.includes('Maximum 5 MB')");
  click('Clear');
  check("document.querySelector('#json-status').textContent === ''", 'Clear must dismiss oversized-file feedback');
  console.log('Long lines, sort, copy/error feedback, invalid/deep/root JSON, large documents, file limit passed.');
} finally {
  browser('close');
}
