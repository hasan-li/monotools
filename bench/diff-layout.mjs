// Requires agent-browser and a running Vite server.
// node bench/diff-layout.mjs [http://localhost:5173/monotools/diff/]
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const browser = (...args) => {
  const response = JSON.parse(execFileSync('agent-browser', ['--session', 'diff-check', '--json', ...args], { encoding: 'utf8' }));
  assert.equal(response.success, true, response.error);
  return response.data;
};
const evaluate = (code) => browser('eval', code).result;
const mainEvaluate = (code) => evaluate(`(() => { const script = document.createElement('script'); script.textContent = ${JSON.stringify(code)}; document.head.append(script); script.remove(); })()`);
const check = (code, message) => assert.equal(evaluate(code), true, message);
const wait = (code) => browser('wait', '--fn', code);
const click = (name) => evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent === ${JSON.stringify(name)}).click()`);
const fill = (side, text) => setLarge(side, JSON.stringify(text));
const setLarge = (side, expression) => evaluate(`(() => {
  const input = document.querySelector('#diff-${side}');
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, ${expression});
  input.dispatchEvent(new Event('input', { bubbles: true }));
})()`);
const settled = () => wait("!document.querySelector('.diff-compare').disabled && !!document.querySelector('.diff-results')");
try {
  browser('open', process.argv[2] ?? 'http://localhost:5173/monotools/diff/');
  check("document.querySelectorAll('textarea').length === 2 && !document.querySelector('.diff-results') && document.querySelector('.diff-compare').disabled", 'Initial state');
  fill('original', 'keep\ntimeout = 30\nend\n');
  fill('changed', 'keep\ntimeout = 60\nend\n');
  check("!document.querySelector('.diff-results')", 'No automatic comparison');
  click('Compare'); settled();
  check("document.querySelectorAll('.diff-cell').length === 6 && document.querySelectorAll('.diff-unchanged').length === 4 && document.querySelector('.diff-original mark').textContent === '3' && document.querySelector('.diff-changed mark').textContent === '6'", 'Full text with unchanged context and highlighted changed characters');
  fill('changed', 'keep\ntimeout = 90\nend\n');
  wait("document.querySelector('.diff-status').textContent.includes('compare again')");
  check("document.querySelector('.diff-changed mark').textContent === '6'", 'Keep previous result');
  click('Compare'); settled();
  check("document.querySelector('.diff-changed mark').textContent === '9'", 'Recompare');
  fill('changed', 'keep\ntimeout = 30\nend\n'); click('Compare'); settled();
  check("document.querySelector('.diff-status').textContent === 'No differences' && document.querySelectorAll('.diff-unchanged').length === 6 && !document.querySelector('.diff-results mark')", 'Identical text stays visible without highlights');
  fill('original', '');
  fill('changed', Array.from({ length: 800 }, (_, i) => `line ${i}`).join('\n'));
  click('Compare'); settled();
  check("document.querySelectorAll('.diff-cell').length === 1600 && Array.from(document.querySelectorAll('.diff-line-number')).at(-1).textContent === '800'", 'All 800 lines render without pagination');
  check("getComputedStyle(document.querySelector('.diff-cell')).paddingTop === '0px' && getComputedStyle(document.querySelector('.diff-cell')).paddingBottom === '0px'", 'Compact lines');
  evaluate("document.documentElement.dataset.theme = 'light'");
  check("getComputedStyle(document.querySelector('.diff-result-scroll')).backgroundColor === 'rgb(255, 255, 255)'", 'White comparison surface in light mode');
  evaluate("window.scrollTo(0, document.documentElement.scrollHeight)");
  check("Array.from(document.querySelectorAll('.diff-line-number')).at(-1).getBoundingClientRect().bottom <= innerHeight", 'Last line reachable by page scrolling');
  fill('changed', '<img src=x onerror=alert(1)>\n👩🏽‍💻\n\t  \n');
  click('Compare'); settled();
  check("!document.querySelector('.diff-results img') && !!document.querySelector('.diff-whitespace')", 'Escape HTML and annotate whitespace');
  for (const width of [1440, 820, 390, 320]) {
    browser('set', 'viewport', String(width), '900');
    check("document.documentElement.scrollWidth <= innerWidth", 'Contain mobile overflow');
    check("document.querySelector('.diff-result-scroll').scrollHeight <= document.querySelector('.diff-result-scroll').clientHeight + 1", 'No vertical result box scroll');
  }
  setLarge('original', "'é'.repeat(524289)");
  check("document.querySelector('#diff-original').getAttribute('aria-invalid') === 'true' && document.querySelector('.diff-compare').disabled", 'UTF-8 limit');
  fill('original', 'a'); fill('changed', 'b');
  // Hold worker responses to deterministically exercise edits during work and cancellation.
  mainEvaluate('window.RealWorker = window.Worker; window.Worker = class { postMessage() {} terminate() {} };');
  mainEvaluate(`document.querySelector('.diff-compare').click(); setTimeout(() => {
    const input = document.querySelector('#diff-original');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, 'c');
    input.dispatchEvent(new Event('input', {bubbles: true}));
    setTimeout(() => document.querySelector('.diff-actions .text-control').click(), 30);
  }, 30);`);
  wait("document.querySelector('.diff-status').textContent.includes('cancelled')");
  check("document.querySelector('.diff-status').textContent.includes('cancelled') && document.querySelectorAll('textarea').length === 2", 'Cancel retains inputs');
  mainEvaluate('window.Worker = window.RealWorker;');
  click('Compare'); settled();
  wait("document.querySelector('.diff-original mark')?.textContent === 'c'");
  // Deliver a snapshot result after editing; it must not be presented as current.
  mainEvaluate(`window.Worker = class { postMessage(data) { window.pendingDiff = () => this.onmessage({data: {id: data.id, result: {rows: [], counts: {added: 0, removed: 0, changed: 0}}}}); } terminate() {} };`);
  mainEvaluate(`document.querySelector('.diff-compare').click(); setTimeout(() => {
    const input = document.querySelector('#diff-changed');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, 'edited while running');
    input.dispatchEvent(new Event('input', {bubbles: true}));
    setTimeout(() => window.pendingDiff(), 30);
  }, 30);`);
  wait("document.querySelector('.diff-status').textContent.includes('compare again')");
  mainEvaluate('window.Worker = window.RealWorker;');
  console.log('Diff browser checks passed: highlights, edits, all 800 lines, white surface, compact rows, responsive layout, input limit, cancellation and stale snapshots.');
} finally { browser('close'); }
