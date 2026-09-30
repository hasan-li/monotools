import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { DIFF_COMPLEXITY_ERROR, DIFF_TIMEOUT_MS, MAX_TEXT_BYTES, type DiffLine, type DiffResponse, type DiffResult } from '../diff';

function Line({ line, side, unchanged }: { line: DiffLine | null; side: 'original' | 'changed'; unchanged: boolean }) {
  if (!line) return <div className="diff-cell diff-absent" aria-label={`No ${side} line`} />;
  return (
    <div className={`diff-cell ${unchanged ? 'diff-unchanged' : `diff-${side}`}`}>
      <span className="diff-line-number" aria-label={`Line ${line.number}`}>{line.number}</span>
      <span className="diff-marker" aria-label={unchanged ? 'Unchanged' : side === 'original' ? 'Removed' : 'Added'}>{unchanged ? ' ' : side === 'original' ? '−' : '+'}</span>
      <code className="diff-code">
        {line.segments.map((segment, index) => segment.changed ? (
          <mark key={index}>{segment.text.split(/([ \t]+)/).map((text, token) => /[ \t]/.test(text) ? (
            <span key={token} className="diff-whitespace" title="Changed whitespace" data-symbol={text.replace(/ /g, '·').replace(/\t/g, '→   ')}>{text}</span>
          ) : text)}</mark>
        ) : <Fragment key={index}>{segment.text}</Fragment>)}
        {line.segments.every((segment) => !segment.text) && <span className="diff-annotation">[empty line]</span>}
        {line.noNewline && <span className="diff-annotation"> [no newline at end]</span>}
      </code>
    </div>
  );
}

export default function DiffPage() {
  const [original, setOriginal] = useState('');
  const [changed, setChanged] = useState('');
  const [result, setResult] = useState<{ diff: DiffResult; original: string; changed: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const requestId = useRef(0);
  const task = useRef<{ worker: Worker; timeout: number } | null>(null);
  const sizes = useMemo(() => {
    const encoder = new TextEncoder();
    return { original: encoder.encode(original).byteLength, changed: encoder.encode(changed).byteLength };
  }, [original, changed]);
  const tooLarge = sizes.original > MAX_TEXT_BYTES || sizes.changed > MAX_TEXT_BYTES;
  const stale = result !== null && (result.original !== original || result.changed !== changed);
  const rows = result?.diff.rows ?? [];
  const summary = !result ? '' : Object.entries(result.diff.counts)
    .filter(([, count]) => count > 0).map(([kind, count]) => `${count.toLocaleString()} ${kind}`).join(' · ') || 'No differences';

  const stop = (): void => {
    task.current?.worker.terminate();
    window.clearTimeout(task.current?.timeout);
    task.current = null;
  };
  useEffect(() => stop, []);

  const compare = (event: FormEvent): void => {
    event.preventDefault();
    if (tooLarge || (!original && !changed) || busy) return;
    stop();
    const id = ++requestId.current;
    setBusy(true);
    setMessage('');
    const finish = (): void => { stop(); setBusy(false); };
    try {
      const worker = new Worker(new URL('../diff.worker.ts', import.meta.url), { type: 'module' });
      const timeout = window.setTimeout(() => {
        finish();
        setMessage(DIFF_COMPLEXITY_ERROR);
      }, DIFF_TIMEOUT_MS + 1000);
      task.current = { worker, timeout };
      worker.onmessage = ({ data }: MessageEvent<DiffResponse>) => {
        if (id !== requestId.current || task.current?.worker !== worker) return;
        finish();
        if ('error' in data) { setMessage(data.error); return; }
        setResult({ diff: data.result, original, changed });
      };
      worker.onerror = () => {
        if (task.current?.worker !== worker) return;
        finish();
        setMessage('Comparison failed. Please try again.');
      };
      worker.postMessage({ id, original, changed });
    } catch {
      finish();
      setMessage('Could not start comparison. Please try again.');
    }
  };

  return (
    <section className="diff-page" aria-label="Text diff checker">
      <p className="page-summary">Compare full texts side by side. Changed lines and characters are highlighted.</p>
      <form onSubmit={compare}>
        <div className="diff-inputs">
          {(['original', 'changed'] as const).map((side) => (
            <div key={side}>
              <label className="workspace-title diff-input-label" htmlFor={`diff-${side}`}>{side.toUpperCase()}</label>
              <textarea id={`diff-${side}`} className="workspace-surface json-input diff-input" value={side === 'original' ? original : changed}
                onChange={(event) => { (side === 'original' ? setOriginal : setChanged)(event.target.value); setMessage(''); }}
                placeholder={side === 'original' ? 'Paste original text' : 'Paste changed text'} spellCheck={false}
                aria-invalid={sizes[side] > MAX_TEXT_BYTES} aria-describedby={`diff-${side}-limit`} />
              <p id={`diff-${side}-limit`} className={`diff-input-note ${sizes[side] > MAX_TEXT_BYTES ? 'is-error' : ''}`}>
                {sizes[side] > MAX_TEXT_BYTES ? 'Input too large — maximum 1 MiB (1,048,576 UTF-8 bytes).' : '1 MiB maximum'}
              </p>
            </div>
          ))}
        </div>
        <div className="diff-actions">
          <button className="diff-compare" type="submit" disabled={busy || tooLarge || (!original && !changed)}>Compare</button>
          {busy && <button className="text-control" type="button" onClick={() => { requestId.current += 1; stop(); setBusy(false); setMessage('Comparison cancelled.'); }}>Cancel</button>}
          <span className="diff-status" role="status" aria-live="polite" aria-atomic="true">
            {busy ? 'Comparing…' : message || (tooLarge ? 'Reduce oversized inputs before comparing.' : stale ? 'Inputs changed — compare again.' : summary)}
          </span>
        </div>
      </form>
      {result && (
        <section className="diff-results" aria-labelledby="diff-result-heading" aria-busy={busy}>
          <header className="diff-results-header">
            <h2 id="diff-result-heading" className="workspace-title">COMPARISON</h2>
          </header>
          {stale && <p className="diff-input-note">Previous comparison · {summary}</p>}
          {rows.length === 0 ? <p className="diff-empty">No differences</p> : (
            <div className="diff-result-scroll" tabIndex={0} role="region" aria-label="Read-only comparison: original on the left, changed on the right">
              <div className="diff-result-grid">
                <h3 className="diff-column-title">ORIGINAL <span>− removed</span></h3>
                <h3 className="diff-column-title">CHANGED <span>+ added</span></h3>
                {rows.map((row, index) => (
                  <Fragment key={index}>
                    <Line line={row.original} side="original" unchanged={row.kind === 'unchanged'} />
                    <Line line={row.changed} side="changed" unchanged={row.kind === 'unchanged'} />
                  </Fragment>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </section>
  );
}
