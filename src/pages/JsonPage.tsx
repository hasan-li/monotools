import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { buildTreeRows, getInitialExpandedPaths, isJsonInputTooLarge, MAX_JSON_INPUT_SIZE, parseJson, sortJsonKeys, stringifyJson, type JsonRenderRow } from '../json';

type JsonView = 'formatted' | 'tree';
type ProcessingState =
  | { status: 'idle' }
  | { status: 'reading' }
  | { status: 'processing' }
  | { status: 'valid'; value: unknown }
  | { status: 'invalid'; line?: number; column?: number }
  | { status: 'too-large' };

const treeRowPresentation = (row: JsonRenderRow, expandedPaths: Set<string>) => {
  const path = row.collapsiblePath;
  const expanded = path ? expandedPaths.has(path) : false;
  const segment = path === '$' ? 'root' : path?.split('/').at(-1)?.replace(/~1/g, '/').replace(/~0/g, '~') ?? '';
  const property = segment && segment !== 'root' ? `${JSON.stringify(segment)}: ` : '';
  const hasProperty = Boolean(property && row.content.startsWith(property));

  return {
    expanded,
    marker: path ? (expanded ? '[-] ' : '[+] ') : row.prefix && !/^[}\]],?/.test(row.content) ? '    ' : '',
    property: hasProperty ? property : '',
    structure: hasProperty ? row.content.slice(property.length) : row.content,
    label: `${expanded ? 'Collapse' : 'Expand'} ${hasProperty || segment === 'root' ? segment : `item ${segment}`}`,
  };
};

const errorLocation = (input: string): { line?: number; column?: number } => {
  try {
    JSON.parse(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const location = message.match(/line\s+(\d+).*column\s+(\d+)/i);
    if (location) return { line: Number(location[1]), column: Number(location[2]) };

    const positionMatch = message.match(/position\s+(\d+)/i);
    const position = positionMatch ? Number(positionMatch[1]) : /end of json/i.test(message) ? input.length : undefined;
    if (position !== undefined) {
      const before = input.slice(0, position);
      const lastBreak = before.lastIndexOf('\n');
      return { line: before.split('\n').length, column: position - lastBreak };
    }
  }
  return {};
};

export default function JsonPage() {
  const [inputJson, setInputJson] = useState('');
  const [inputRevision, setInputRevision] = useState(0);
  const [result, setResult] = useState<ProcessingState>({ status: 'idle' });
  const [sortKeys, setSortKeys] = useState(false);
  const [view, setView] = useState<JsonView>('formatted');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [treeWindow, setTreeWindow] = useState({ start: 0, end: 100 });
  const [treeRowHeight, setTreeRowHeight] = useState(() => matchMedia('(max-width: 560px)').matches ? 44 : 20);
  const treeRef = useRef<HTMLDivElement>(null);
  const processingVersion = useRef(0);

  const processInput = useCallback((input: string) => {
    if (isJsonInputTooLarge(input)) {
      setResult({ status: 'too-large' });
      return;
    }
    try {
      const value = parseJson(input);
      setExpandedPaths(getInitialExpandedPaths(value));
      setResult({ status: 'valid', value });
    } catch {
      setResult({ status: 'invalid', ...errorLocation(input) });
    }
  }, []);

  useEffect(() => {
    const narrow = matchMedia('(max-width: 560px)');
    const resizeRows = (event: MediaQueryListEvent): void => setTreeRowHeight(event.matches ? 44 : 20);
    narrow.addEventListener('change', resizeRows);
    return () => narrow.removeEventListener('change', resizeRows);
  }, []);

  useEffect(() => {
    if (!inputJson.trim()) {
      setResult({ status: 'idle' });
      setExpandedPaths(new Set());
      return;
    }

    setResult({ status: 'processing' });
    const version = ++processingVersion.current;
    const timeout = window.setTimeout(() => {
      if (version === processingVersion.current) processInput(inputJson);
    }, 200);
    return () => window.clearTimeout(timeout);
  }, [inputJson, inputRevision, processInput]);

  const displayValue = useMemo(
    () => result.status === 'valid' ? (sortKeys ? sortJsonKeys(result.value) : result.value) : undefined,
    [result, sortKeys],
  );
  const formattedOutput = useMemo(
    () => result.status === 'valid' ? stringifyJson(displayValue, 2) : '',
    [displayValue, result.status],
  );
  const treeRows = useMemo(
    () => view === 'tree' && result.status === 'valid' ? buildTreeRows(displayValue, expandedPaths) : [],
    [displayValue, expandedPaths, result.status, view],
  );
  const visibleTreeRows = treeRows.slice(treeWindow.start, treeWindow.end);
  const hasOutput = view === 'formatted' ? Boolean(formattedOutput) : treeRows.length > 0;

  useLayoutEffect(() => {
    const tree = treeRef.current;
    if (!tree) return;
    let frame = 0;
    const updateWindow = (): void => {
      const size = Math.ceil(window.innerHeight / treeRowHeight) + 40;
      const start = Math.max(0, Math.min(
        Math.floor(-tree.getBoundingClientRect().top / treeRowHeight) - 20,
        treeRows.length - size,
      ));
      const end = Math.min(treeRows.length, start + size);
      setTreeWindow((current) => current.start === start && current.end === end ? current : { start, end });
    };
    const scheduleUpdate = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateWindow);
    };
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(tree);
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    updateWindow();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
    };
  }, [treeRows.length, treeRowHeight, view]);

  useEffect(() => {
    setCopyStatus('idle');
  }, [inputJson, sortKeys, view]);

  useEffect(() => {
    if (copyStatus === 'idle') return;
    const timeout = window.setTimeout(() => setCopyStatus('idle'), 1600);
    return () => window.clearTimeout(timeout);
  }, [copyStatus]);

  const loadFile = useCallback(async (file?: File) => {
    if (!file) return;
    processingVersion.current += 1;
    setCopyStatus('idle');
    if (file.size > MAX_JSON_INPUT_SIZE) {
      setResult({ status: 'too-large' });
      return;
    }
    setResult({ status: 'reading' });
    try {
      setInputJson(await file.text());
      setInputRevision((current) => current + 1);
    } catch {
      setResult({ status: 'invalid' });
    }
  }, []);

  const onDrop = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    void loadFile(event.dataTransfer.files[0]);
  }, [loadFile]);

  const toggleTreeNode = useCallback((path: string) => {
    setExpandedPaths((previous) => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }, []);

  const onCopy = useCallback(async () => {
    if (!hasOutput) return;
    const output = view === 'formatted' ? formattedOutput : treeRows.map((row) => `${row.prefix}${treeRowPresentation(row, expandedPaths).marker}${row.content}`).join('\n');
    try {
      await navigator.clipboard.writeText(output);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  }, [expandedPaths, formattedOutput, hasOutput, treeRows, view]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key === 'Enter') {
        event.preventDefault();
        processingVersion.current += 1;
        if (inputJson.trim()) processInput(inputJson);
      } else if (command && event.shiftKey && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        void onCopy();
      } else if (event.key === 'Escape') {
        setCopyStatus('idle');
        (document.activeElement as HTMLElement | null)?.blur();
      }
    };
    addEventListener('keydown', onKeyDown);
    return () => removeEventListener('keydown', onKeyDown);
  }, [inputJson, onCopy, processInput]);

  const clear = (): void => {
    processingVersion.current += 1;
    setInputJson('');
    setResult({ status: 'idle' });
    setCopyStatus('idle');
  };
  const status = result.status === 'valid'
    ? 'Valid'
    : result.status === 'invalid'
      ? `Invalid JSON${result.line ? ` · Line ${result.line}, column ${result.column}` : ''}`
      : result.status === 'too-large'
        ? 'Input too large · Maximum 5 MB'
        : result.status === 'reading' ? 'Reading…'
          : result.status === 'processing' ? 'Processing…' : '';

  return (
    <>
      <p className="page-summary">Format and inspect JSON locally. Large integers stay exact; files never leave your browser.</p>
      <section className="json-workspace" aria-label="JSON formatter">
      <article className="workspace-pane input-pane" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
        <header className="workspace-header">
          <h2 className="workspace-title">01 INPUT</h2>
          <div className="workspace-actions">
            <label className="text-control file-control">Open file<input type="file" accept=".json,application/json" aria-label="Open JSON file" onChange={(event) => { void loadFile(event.target.files?.[0]); event.target.value = ''; }} /></label>
            <button type="button" className="text-control" onClick={clear}>Clear</button>
          </div>
        </header>
        <textarea className="workspace-surface json-input" value={inputJson} onChange={(event) => setInputJson(event.target.value)} placeholder="Paste JSON or drop a file" spellCheck={false} aria-label="JSON input and file drop target" aria-invalid={result.status === 'invalid' || result.status === 'too-large'} aria-describedby="json-status" />
        <footer className="workspace-feedback">
          <span id="json-status" className={`workspace-status ${result.status === 'invalid' || result.status === 'too-large' ? 'is-error' : ''}`} role="status" aria-live="polite" aria-atomic="true">{status}</span>
          <span className="workspace-note">Processed locally</span>
        </footer>
      </article>
      <article className="workspace-pane" aria-busy={result.status === 'reading' || result.status === 'processing'}>
        <header className="workspace-header">
          <h2 className="workspace-title">02 OUTPUT</h2>
          <div className="workspace-actions" role="group" aria-label="JSON output controls">
            <div className="workspace-views" role="group" aria-label="Output view">
              <button type="button" className={`text-control ${view === 'formatted' ? 'is-current' : ''}`} aria-pressed={view === 'formatted'} onClick={() => setView('formatted')}>Formatted</button>
              <button type="button" className={`text-control ${view === 'tree' ? 'is-current' : ''}`} aria-pressed={view === 'tree'} onClick={() => setView('tree')}>Tree</button>
            </div>
            <button type="button" className={`text-control ${sortKeys ? 'is-current' : ''}`} aria-pressed={sortKeys} onClick={() => setSortKeys((current) => !current)} disabled={result.status !== 'valid'}>Sort keys</button>
            <button type="button" className="text-control copy-control" onClick={onCopy} disabled={!hasOutput} aria-live="polite" aria-atomic="true">{copyStatus === 'copied' ? 'Copied' : copyStatus === 'failed' ? 'Copy failed' : 'Copy'}</button>
          </div>
        </header>
        {result.status === 'valid' && view === 'formatted' ? (
          <pre className="workspace-surface output-plain" tabIndex={0} aria-label="Formatted JSON output">{formattedOutput}</pre>
        ) : result.status === 'valid' ? (
          <div className="workspace-surface tree-scroll" tabIndex={0} aria-label="JSON tree output">
            <div ref={treeRef} className="tree-spacer" style={{ height: `${treeRows.length * treeRowHeight}px` }}>
              <div className="tree-window" style={{ transform: `translateY(${treeWindow.start * treeRowHeight}px)` }}>
                {visibleTreeRows.map((row) => {
                  const presentation = treeRowPresentation(row, expandedPaths);
                  const body = <><span className="output-row-prefix">{row.prefix}</span><span className="output-row-marker">{presentation.marker}</span><span className="output-row-property">{presentation.property}</span><span className="output-row-content">{presentation.structure}</span></>;
                  return row.collapsiblePath ? (
                    <button key={`${row.lineNumber}-${row.collapsiblePath}`} type="button" className="output-row output-row-toggle" aria-label={presentation.label} aria-expanded={presentation.expanded} onClick={() => toggleTreeNode(row.collapsiblePath!)}>{body}</button>
                  ) : <div key={`${row.lineNumber}-${row.content}`} className="output-row">{body}</div>;
                })}
              </div>
            </div>
          </div>
        ) : null}
      </article>
      </section>
    </>
  );
}
