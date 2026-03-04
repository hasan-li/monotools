import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import JSONBigFactory from 'json-bigint';

type Theme = 'light' | 'dark';
type ToolPath = '/' | '/json' | '/color';
type JsonView = 'formatted' | 'tree';

interface ColorChannels {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

interface ColorFormats {
  hex: string;
  hexa: string;
  rgb: string;
  rgba: string;
  hsl: string;
  hsla: string;
  hsv: string;
  cmyk: string;
}

const JSONBig = JSONBigFactory();
const INDENT_SIZE = 2;
const BASE_URL = import.meta.env.BASE_URL;
const THEME_STORAGE_KEY = 'tools-theme';
const ROUTE_META: Record<string, { title: string; description: string }> = {
  '/': {
    title: 'Tools Directory | JSON Formatter and Color Converter',
    description: 'ASCII-first tools directory with a JSON formatter/validator and universal color converter.',
  },
  '/json': {
    title: 'JSON Tool | Tools Directory',
    description: 'Format, validate, sort, copy, and inspect JSON with collapsible ASCII tree view.',
  },
  '/color': {
    title: 'Color Tool | Tools Directory',
    description: 'Convert any color input to HEX, RGB, HSL, HSV, and CMYK with live preview.',
  },
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const isBigNumberLike = (value: unknown): boolean =>
  typeof value === 'object'
  && value !== null
  && (value as { constructor?: { name?: string } }).constructor?.name === 'BigNumber';

const isRenderableContainer = (value: unknown): value is Record<string, unknown> | unknown[] =>
  typeof value === 'object' && value !== null && !isBigNumberLike(value);

const sortJsonKeys = (value: unknown): unknown => {
  if (!isRenderableContainer(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sortJsonKeys(item));
  }

  const entries = Object.entries(value)
    .sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey));

  return entries.reduce<Record<string, unknown>>((accumulator, [key, entryValue]) => {
    accumulator[key] = sortJsonKeys(entryValue);
    return accumulator;
  }, {});
};

interface JsonRenderRow {
  lineNumber: number;
  prefix: string;
  content: string;
  collapsiblePath?: string;
}

const toJsonPrimitiveString = (value: unknown): string => {
  if (value === null) {
    return 'null';
  }

  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }

  if (isBigNumberLike(value)) {
    return String(value);
  }

  return JSON.stringify(value);
};

const encodePathSegment = (segment: string): string => segment.replace(/~/g, '~0').replace(/\//g, '~1');

const collectContainerPaths = (value: unknown, path: string, output: Set<string>): void => {
  if (!isRenderableContainer(value)) {
    return;
  }

  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index), item] as const)
    : Object.entries(value);

  if (entries.length === 0) {
    return;
  }

  output.add(path);

  entries.forEach(([segment, childValue]) => {
    collectContainerPaths(childValue, `${path}/${encodePathSegment(segment)}`, output);
  });
};

const buildTreeRows = (rootValue: unknown, expandedPaths: Set<string>): JsonRenderRow[] => {
  const rows: JsonRenderRow[] = [];
  let lineNumber = 1;

  const pushRow = (prefix: string, content: string, collapsiblePath?: string): void => {
    rows.push({
      lineNumber,
      prefix,
      content,
      collapsiblePath,
    });

    lineNumber += 1;
  };

  const renderNode = (
    value: unknown,
    key: string | null,
    ancestorsHaveSibling: boolean[],
    isLast: boolean,
    path: string,
  ): void => {
    const branchPrefix = ancestorsHaveSibling.map((hasSibling) => (hasSibling ? '|   ' : '    ')).join('');
    const connector = isLast ? '`-- ' : '|-- ';
    const prefix = `${branchPrefix}${connector}`;
    const keyPrefix = key === null ? '' : `${JSON.stringify(key)}: `;

    if (!isRenderableContainer(value)) {
      pushRow(prefix, `${keyPrefix}${toJsonPrimitiveString(value)}${isLast ? '' : ','}`);
      return;
    }

    const isArray = Array.isArray(value);
    const openToken = isArray ? '[' : '{';
    const closeToken = isArray ? ']' : '}';
    const entries = isArray
      ? value.map((item, index) => ({ segment: String(index), childKey: null as string | null, childValue: item }))
      : Object.entries(value).map(([entryKey, entryValue]) => ({
        segment: entryKey,
        childKey: entryKey,
        childValue: entryValue,
      }));

    if (entries.length === 0) {
      pushRow(prefix, `${keyPrefix}${openToken}${closeToken}${isLast ? '' : ','}`);
      return;
    }

    const isExpanded = expandedPaths.has(path);
    if (!isExpanded) {
      pushRow(prefix, `${keyPrefix}${openToken} ... ${closeToken}${isLast ? '' : ','}`, path);
      return;
    }

    pushRow(prefix, `${keyPrefix}${openToken}`, path);

    const nextAncestors = [...ancestorsHaveSibling, !isLast];

    entries.forEach((entry, index) => {
      const childIsLast = index === entries.length - 1;
      const childPath = `${path}/${encodePathSegment(entry.segment)}`;
      renderNode(entry.childValue, entry.childKey, nextAncestors, childIsLast, childPath);
    });

    const closingPrefix = `${branchPrefix}${isLast ? '    ' : '|   '}`;
    pushRow(closingPrefix, `${closeToken}${isLast ? '' : ','}`);
  };

  if (!isRenderableContainer(rootValue)) {
    pushRow('', toJsonPrimitiveString(rootValue));
    return rows;
  }

  const rootPath = '$';
  const rootIsArray = Array.isArray(rootValue);
  const rootOpenToken = rootIsArray ? '[' : '{';
  const rootCloseToken = rootIsArray ? ']' : '}';
  const rootEntries = rootIsArray
    ? rootValue.map((item, index) => ({ segment: String(index), childKey: null as string | null, childValue: item }))
    : Object.entries(rootValue).map(([entryKey, entryValue]) => ({
      segment: entryKey,
      childKey: entryKey,
      childValue: entryValue,
    }));

  if (rootEntries.length === 0) {
    pushRow('', `${rootOpenToken}${rootCloseToken}`);
    return rows;
  }

  const rootExpanded = expandedPaths.has(rootPath);
  if (!rootExpanded) {
    pushRow('', `${rootOpenToken} ... ${rootCloseToken}`, rootPath);
    return rows;
  }

  pushRow('', rootOpenToken, rootPath);

  rootEntries.forEach((entry, index) => {
    const childIsLast = index === rootEntries.length - 1;
    const childPath = `${rootPath}/${encodePathSegment(entry.segment)}`;
    renderNode(entry.childValue, entry.childKey, [], childIsLast, childPath);
  });

  pushRow('', rootCloseToken);
  return rows;
};

const trimTrailingSlash = (value: string): string => {
  if (value.length > 1 && value.endsWith('/')) {
    return value.slice(0, -1);
  }

  return value;
};

const basePrefix = BASE_URL === '/' ? '' : trimTrailingSlash(BASE_URL);

const normalizeRoutePath = (pathname: string): string => {
  const withoutBase =
    basePrefix.length > 0 && pathname.startsWith(basePrefix)
      ? pathname.slice(basePrefix.length) || '/'
      : pathname;

  let normalized = withoutBase.startsWith('/') ? withoutBase : `/${withoutBase}`;

  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized || '/';
};

const buildHref = (path: ToolPath): string => {
  if (path === '/') {
    return BASE_URL;
  }

  const suffix = path.slice(1);
  return `${BASE_URL}${suffix}/`;
};

const parseCssColor = (input: string): ColorChannels | null => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const probe = document.createElement('span');
  probe.style.color = '';
  probe.style.color = trimmed;

  if (!probe.style.color) {
    return null;
  }

  probe.style.position = 'fixed';
  probe.style.opacity = '0';
  probe.style.pointerEvents = 'none';
  probe.style.visibility = 'hidden';

  document.body.appendChild(probe);
  const computedColor = window.getComputedStyle(probe).color;
  probe.remove();

  const values = computedColor.match(/[\d.]+/g);
  if (!values || values.length < 3) {
    return null;
  }

  const red = clamp(Math.round(Number(values[0])), 0, 255);
  const green = clamp(Math.round(Number(values[1])), 0, 255);
  const blue = clamp(Math.round(Number(values[2])), 0, 255);
  const alpha = values[3] === undefined ? 1 : clamp(Number(values[3]), 0, 1);

  if ([red, green, blue, alpha].some((channel) => Number.isNaN(channel))) {
    return null;
  }

  return { red, green, blue, alpha };
};

const toHex = (value: number): string => value.toString(16).padStart(2, '0').toUpperCase();

const rgbToHsl = (red: number, green: number, blue: number): { h: number; s: number; l: number } => {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let hue = 0;

  if (delta !== 0) {
    if (max === r) {
      hue = ((g - b) / delta) % 6;
    } else if (max === g) {
      hue = (b - r) / delta + 2;
    } else {
      hue = (r - g) / delta + 4;
    }

    hue *= 60;
    if (hue < 0) {
      hue += 360;
    }
  }

  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  return {
    h: Math.round(hue),
    s: Math.round(saturation * 100),
    l: Math.round(lightness * 100),
  };
};

const rgbToHsv = (red: number, green: number, blue: number): { h: number; s: number; v: number } => {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let hue = 0;

  if (delta !== 0) {
    if (max === r) {
      hue = ((g - b) / delta) % 6;
    } else if (max === g) {
      hue = (b - r) / delta + 2;
    } else {
      hue = (r - g) / delta + 4;
    }

    hue *= 60;
    if (hue < 0) {
      hue += 360;
    }
  }

  const saturation = max === 0 ? 0 : delta / max;

  return {
    h: Math.round(hue),
    s: Math.round(saturation * 100),
    v: Math.round(max * 100),
  };
};

const rgbToCmyk = (
  red: number,
  green: number,
  blue: number,
): { c: number; m: number; y: number; k: number } => {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;

  const key = 1 - Math.max(r, g, b);
  if (key >= 1) {
    return { c: 0, m: 0, y: 0, k: 100 };
  }

  const cyan = (1 - r - key) / (1 - key);
  const magenta = (1 - g - key) / (1 - key);
  const yellow = (1 - b - key) / (1 - key);

  return {
    c: Math.round(cyan * 100),
    m: Math.round(magenta * 100),
    y: Math.round(yellow * 100),
    k: Math.round(key * 100),
  };
};

const alphaToString = (alpha: number): string => {
  const rounded = Math.round(alpha * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
};

const toColorFormats = (channels: ColorChannels): ColorFormats => {
  const { red, green, blue, alpha } = channels;
  const alphaHex = toHex(Math.round(alpha * 255));
  const hsl = rgbToHsl(red, green, blue);
  const hsv = rgbToHsv(red, green, blue);
  const cmyk = rgbToCmyk(red, green, blue);
  const alphaString = alphaToString(alpha);

  return {
    hex: `#${toHex(red)}${toHex(green)}${toHex(blue)}`,
    hexa: `#${toHex(red)}${toHex(green)}${toHex(blue)}${alphaHex}`,
    rgb: `rgb(${red}, ${green}, ${blue})`,
    rgba: `rgba(${red}, ${green}, ${blue}, ${alphaString})`,
    hsl: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`,
    hsla: `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, ${alphaString})`,
    hsv: `hsv(${hsv.h}, ${hsv.s}%, ${hsv.v}%)`,
    cmyk: `cmyk(${cmyk.c}%, ${cmyk.m}%, ${cmyk.y}%, ${cmyk.k}%)`,
  };
};

const toolRows: Array<{ index: string; path: ToolPath; name: string; meta: string }> = [
  {
    index: '01',
    path: '/color',
    name: 'COLOR TOOLS',
    meta: 'HEX | RGB | HSL | HSV | CMYK',
  },
  {
    index: '02',
    path: '/json',
    name: 'JSON TOOL',
    meta: 'Format | Validate | Minify | Tree',
  },
];

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  theme: Theme;
  onToggleTheme: () => void;
  homeHref: string;
  onHomeClick: (event: MouseEvent<HTMLAnchorElement>) => void;
  showHomeLink?: boolean;
}

const ScreenHeader = ({
  title,
  subtitle,
  theme,
  onToggleTheme,
  homeHref,
  onHomeClick,
  showHomeLink = false,
}: ScreenHeaderProps) => (
  <header className="screen-header">
    <div className="header-title-wrap">
      {showHomeLink && (
        <a href={homeHref} onClick={onHomeClick} className="ascii-link">
          [HOME]
        </a>
      )}
      <h1 className="screen-title">{title}</h1>
      {subtitle ? <p className="screen-subtitle">{subtitle}</p> : null}
    </div>
    <button type="button" className="ascii-toggle" onClick={onToggleTheme}>
      [{theme === 'light' ? 'DARK' : 'LIGHT'}]
    </button>
  </header>
);

interface HomePageProps {
  theme: Theme;
  onToggleTheme: () => void;
  linkForPath: (path: ToolPath) => string;
  onNavigateClick: (event: MouseEvent<HTMLAnchorElement>, path: ToolPath) => void;
}

const HomePage = ({ theme, onToggleTheme, linkForPath, onNavigateClick }: HomePageProps) => (
  <main className="screen home-screen">
    <ScreenHeader
      title="TOOLS"
      theme={theme}
      onToggleTheme={onToggleTheme}
      homeHref={linkForPath('/')}
      onHomeClick={(event) => onNavigateClick(event, '/')}
    />

    <div className="ascii-rule" />

    <section className="home-content">
      <p className="section-label">AVAILABLE TOOLS</p>
      <p className="page-text">
        Fast browser tools for JSON cleanup and color conversion, built for direct use on desktop and mobile.
      </p>
      <nav className="tool-list" aria-label="Tools">
        {toolRows.map((row) => (
          <a
            key={row.path}
            href={linkForPath(row.path)}
            onClick={(event) => onNavigateClick(event, row.path)}
            className="tool-row"
          >
            <span className="tool-left">
              <span className="tool-index">{row.index}</span>
              <span className="tool-name">{row.name}</span>
            </span>
            <span className="tool-dots" aria-hidden="true" />
            <span className="tool-meta">{row.meta}</span>
          </a>
        ))}
      </nav>
    </section>

    <div className="ascii-rule" />
  </main>
);

interface JsonToolPageProps {
  theme: Theme;
  onToggleTheme: () => void;
  linkForPath: (path: ToolPath) => string;
  onNavigateClick: (event: MouseEvent<HTMLAnchorElement>, path: ToolPath) => void;
}

const JsonToolPage = ({ theme, onToggleTheme, linkForPath, onNavigateClick }: JsonToolPageProps) => {
  const [inputJson, setInputJson] = useState<string>('');
  const [sortKeys, setSortKeys] = useState<boolean>(false);
  const [view, setView] = useState<JsonView>('formatted');
  const [showLineNumbers, setShowLineNumbers] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set<string>(['$']));

  const parsedResult = useMemo(() => {
    if (!inputJson.trim()) {
      return { value: null as unknown, error: '' };
    }

    try {
      const parsed = JSONBig.parse(inputJson) as unknown;
      const sorted = sortKeys ? sortJsonKeys(parsed) : parsed;
      return { value: sorted, error: '' };
    } catch (error) {
      return {
        value: null as unknown,
        error: error instanceof Error ? `Invalid JSON: ${error.message}` : 'Invalid JSON: Unknown error',
      };
    }
  }, [inputJson, sortKeys]);

  const formattedOutput = useMemo(() => {
    if (parsedResult.value === null || parsedResult.error) {
      return '';
    }

    return JSONBig.stringify(parsedResult.value, null, INDENT_SIZE);
  }, [parsedResult.error, parsedResult.value]);

  const defaultExpandedPaths = useMemo(() => {
    const paths = new Set<string>(['$']);

    if (parsedResult.value === null || parsedResult.error) {
      return paths;
    }

    collectContainerPaths(parsedResult.value, '$', paths);
    return paths;
  }, [parsedResult.error, parsedResult.value]);

  useEffect(() => {
    setExpandedPaths(defaultExpandedPaths);
  }, [defaultExpandedPaths]);

  const treeRows = useMemo(() => {
    if (parsedResult.value === null || parsedResult.error) {
      return [] as JsonRenderRow[];
    }

    return buildTreeRows(parsedResult.value, expandedPaths);
  }, [expandedPaths, parsedResult.error, parsedResult.value]);

  const treeOutput = useMemo(
    () => treeRows.map((row) => `${row.prefix}${row.content}`).join('\n'),
    [treeRows],
  );

  const plainRows = useMemo(() => {
    if (!formattedOutput) {
      return [] as JsonRenderRow[];
    }

    return formattedOutput.split('\n').map<JsonRenderRow>((line, index) => ({
      lineNumber: index + 1,
      prefix: '',
      content: line,
    }));
  }, [formattedOutput]);

  const outputRows = view === 'formatted' ? plainRows : treeRows;
  const lineNumberWidthCh = useMemo(
    () => String(Math.max(1, outputRows.length)).length + 1,
    [outputRows.length],
  );

  const toggleTreeNode = useCallback((path: string) => {
    setExpandedPaths((previous) => {
      const next = new Set(previous);

      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }

      return next;
    });
  }, []);

  const activeOutput = view === 'formatted' ? formattedOutput : treeOutput;

  const onCopy = useCallback(async () => {
    if (!activeOutput) {
      return;
    }

    try {
      await navigator.clipboard.writeText(activeOutput);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }, [activeOutput]);

  const onClear = useCallback(() => {
    setInputJson('');
    setCopied(false);
  }, []);

  return (
    <main className="screen tool-screen">
      <ScreenHeader
        title="JSON TOOL"
        subtitle="ASCII FORMATTER"
        theme={theme}
        onToggleTheme={onToggleTheme}
        homeHref={linkForPath('/')}
        onHomeClick={(event) => onNavigateClick(event, '/')}
        showHomeLink
      />

      <div className="ascii-rule" />

      <section className="tool-grid" aria-label="JSON Formatter">
        <p className="page-text tool-intro">
          Paste JSON to validate, format, sort keys, copy output, and inspect nested structures in tree mode.
        </p>
        <article className="panel">
          <div className="panel-header">
            <span className="panel-title">INPUT</span>
            <button type="button" className="ascii-control" onClick={onClear}>
              [CLEAR]
            </button>
          </div>
          <textarea
            className="ascii-textarea"
            value={inputJson}
            onChange={(event) => setInputJson(event.target.value)}
            placeholder='Paste JSON here, e.g. {"project":"tools"}'
            spellCheck={false}
            aria-label="JSON Input"
          />
        </article>

        <article className="panel">
          <div className="panel-header panel-header-wrap">
            <span className="panel-title">OUTPUT</span>
            <div className="json-controls" role="toolbar" aria-label="JSON Output Controls">
              <button
                type="button"
                className={`json-control ${view === 'formatted' ? 'is-active' : ''}`}
                onClick={() => setView('formatted')}
              >
                [PLAIN]
              </button>
              <button
                type="button"
                className={`json-control ${view === 'tree' ? 'is-active' : ''}`}
                onClick={() => setView('tree')}
              >
                [TREE]
              </button>
              <button
                type="button"
                className={`json-control ${showLineNumbers ? 'is-active' : ''}`}
                onClick={() => setShowLineNumbers((current) => !current)}
              >
                [LINES]
              </button>
              <button
                type="button"
                className={`json-control ${sortKeys ? 'is-active' : ''}`}
                onClick={() => setSortKeys((current) => !current)}
              >
                [SORT]
              </button>
              <button
                type="button"
                className={`json-control ${copied ? 'is-active' : ''}`}
                onClick={onCopy}
                disabled={!activeOutput}
              >
                [COPY]
              </button>
            </div>
          </div>

          {parsedResult.error ? (
            <pre className="panel-output panel-output-error">{parsedResult.error}</pre>
          ) : (
            <div className="panel-output panel-output-rows">
              {outputRows.length === 0 ? (
                <span className="output-placeholder">Output appears here.</span>
              ) : (
                outputRows.map((row) => {
                  const rowBody = (
                    <>
                      {showLineNumbers && (
                        <span className="output-row-number" style={{ width: `${lineNumberWidthCh}ch` }}>
                          {row.lineNumber}
                        </span>
                      )}
                      {view === 'tree' && <span className="output-row-prefix">{row.prefix}</span>}
                      <span className="output-row-content">{row.content}</span>
                    </>
                  );

                  if (view === 'tree' && row.collapsiblePath) {
                    return (
                      <button
                        key={`${row.lineNumber}-${row.collapsiblePath}`}
                        type="button"
                        className="output-row output-row-toggle"
                        onClick={() => toggleTreeNode(row.collapsiblePath!)}
                      >
                        {rowBody}
                      </button>
                    );
                  }

                  return (
                    <div key={`${row.lineNumber}-${row.content}`} className="output-row">
                      {rowBody}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </article>
      </section>

      <div className="ascii-rule" />
      <p className="status-line">MODES: FORMAT | TREE | VALIDATE | SORT | COPY</p>
    </main>
  );
};

interface ColorToolPageProps {
  theme: Theme;
  onToggleTheme: () => void;
  linkForPath: (path: ToolPath) => string;
  onNavigateClick: (event: MouseEvent<HTMLAnchorElement>, path: ToolPath) => void;
}

const ColorToolPage = ({ theme, onToggleTheme, linkForPath, onNavigateClick }: ColorToolPageProps) => {
  const [inputColor, setInputColor] = useState<string>('');
  const [copiedFormat, setCopiedFormat] = useState<string>('');

  const channels = useMemo(() => parseCssColor(inputColor), [inputColor]);
  const colorFormats = useMemo(() => (channels ? toColorFormats(channels) : null), [channels]);

  const previewTextColor = useMemo(() => {
    if (!channels) {
      return 'var(--fg)';
    }

    const luminance = (channels.red * 0.299 + channels.green * 0.587 + channels.blue * 0.114) / 255;
    return luminance > 0.55 ? '#151515' : '#f5f5f5';
  }, [channels]);

  const colorStatus = useMemo(() => {
    if (!inputColor.trim()) {
      return 'TYPE A COLOR VALUE TO START.';
    }

    if (!channels || !colorFormats) {
      return 'INVALID COLOR VALUE.';
    }

    return 'COLOR PARSED.';
  }, [channels, colorFormats, inputColor]);

  const formatRows = useMemo(() => {
    if (!channels || !colorFormats) {
      return [
        { label: 'HEX', value: '-' },
        { label: 'HEXA', value: '-' },
        { label: 'RGB', value: '-' },
        { label: 'RGBA', value: '-' },
        { label: 'HSL', value: '-' },
        { label: 'HSLA', value: '-' },
        { label: 'HSV', value: '-' },
        { label: 'CMYK', value: '-' },
      ];
    }

    return [
      { label: 'HEX', value: colorFormats.hex },
      { label: 'HEXA', value: colorFormats.hexa },
      { label: 'RGB', value: colorFormats.rgb },
      { label: 'RGBA', value: colorFormats.rgba },
      { label: 'HSL', value: colorFormats.hsl },
      { label: 'HSLA', value: colorFormats.hsla },
      { label: 'HSV', value: colorFormats.hsv },
      { label: 'CMYK', value: colorFormats.cmyk },
    ];
  }, [channels, colorFormats]);

  const copyFormatValue = useCallback(async (label: string, value: string) => {
    if (value === '-') {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopiedFormat(label);
      window.setTimeout(() => setCopiedFormat(''), 1200);
    } catch {
      setCopiedFormat('');
    }
  }, []);

  return (
    <main className="screen tool-screen">
      <ScreenHeader
        title="COLOR TOOL"
        subtitle="ONE INPUT - MULTI FORMAT"
        theme={theme}
        onToggleTheme={onToggleTheme}
        homeHref={linkForPath('/')}
        onHomeClick={(event) => onNavigateClick(event, '/')}
        showHomeLink
      />

      <div className="ascii-rule" />

      <section className="color-layout" aria-label="Color Converter">
        <p className="page-text">
          Enter any CSS color value to preview it and convert instantly across HEX, RGB, HSL, HSV, and CMYK formats.
        </p>
        <p className="section-label color-section-title">ENTER COLOR</p>

        <input
          type="text"
          className="color-input"
          value={inputColor}
          onChange={(event) => setInputColor(event.target.value)}
          placeholder="#6366f1"
          aria-label="Color Input"
        />

        <div className="solid-rule" />

        <div className="color-preview-shell">
          <div
            className="color-preview-fill"
            style={{
              backgroundColor: colorFormats?.rgba ?? 'transparent',
              color: previewTextColor,
            }}
          >
            {colorFormats?.hex ?? 'NO COLOR'}
          </div>
        </div>

        <div className="ascii-rule" />

        <div className="formats-wrap">
          <p className="section-label color-section-title">FORMATS</p>
          <div className="formats-list">
            {formatRows.map((row) => (
              <button
                key={row.label}
                type="button"
                className={`format-row ${row.value !== '-' ? 'is-copyable' : ''}`}
                onClick={() => copyFormatValue(row.label, row.value)}
                disabled={row.value === '-'}
              >
                <span className="format-label">{row.label}</span>
                <span className="format-dots" aria-hidden="true" />
                <span className="format-value">{row.value}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="ascii-rule" />
        <p className="status-line">
          {copiedFormat ? `${copiedFormat} COPIED` : 'Click any value to copy'}
        </p>
        <p className="panel-hint">{colorStatus}</p>
      </section>

      <div className="ascii-rule" />
    </main>
  );
};

interface NotFoundPageProps {
  theme: Theme;
  onToggleTheme: () => void;
  linkForPath: (path: ToolPath) => string;
  onNavigateClick: (event: MouseEvent<HTMLAnchorElement>, path: ToolPath) => void;
}

const NotFoundPage = ({ theme, onToggleTheme, linkForPath, onNavigateClick }: NotFoundPageProps) => (
  <main className="screen tool-screen">
    <ScreenHeader
      title="NOT FOUND"
      subtitle="ROUTE MISSING"
      theme={theme}
      onToggleTheme={onToggleTheme}
      homeHref={linkForPath('/')}
      onHomeClick={(event) => onNavigateClick(event, '/')}
      showHomeLink
    />
    <div className="ascii-rule" />
    <p className="status-line">AVAILABLE: / | /json | /color</p>
    <div className="ascii-rule" />
  </main>
);

function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return storedTheme === 'dark' ? 'dark' : 'light';
  });

  const [routePath, setRoutePath] = useState<string>(() => normalizeRoutePath(window.location.pathname));

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const routeMeta = ROUTE_META[routePath] ?? {
      title: 'Tools Directory',
      description: 'ASCII-first web tools for JSON and color conversion.',
    };

    document.title = routeMeta.title;

    let descriptionTag = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (!descriptionTag) {
      descriptionTag = document.createElement('meta');
      descriptionTag.setAttribute('name', 'description');
      document.head.appendChild(descriptionTag);
    }

    descriptionTag.setAttribute('content', routeMeta.description);
  }, [routePath]);

  useEffect(() => {
    const handlePopState = (): void => {
      setRoutePath(normalizeRoutePath(window.location.pathname));
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((currentTheme) => (currentTheme === 'light' ? 'dark' : 'light'));
  }, []);

  const navigate = useCallback((nextPath: ToolPath) => {
    const href = buildHref(nextPath);

    if (normalizeRoutePath(window.location.pathname) === nextPath) {
      return;
    }

    window.history.pushState({}, '', href);
    setRoutePath(nextPath);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const onNavigateClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>, path: ToolPath) => {
      if (
        event.defaultPrevented
        || event.button !== 0
        || event.metaKey
        || event.ctrlKey
        || event.shiftKey
        || event.altKey
      ) {
        return;
      }

      event.preventDefault();
      navigate(path);
    },
    [navigate],
  );

  const linkForPath = useCallback((path: ToolPath) => buildHref(path), []);

  if (routePath === '/') {
    return (
      <HomePage
        theme={theme}
        onToggleTheme={toggleTheme}
        linkForPath={linkForPath}
        onNavigateClick={onNavigateClick}
      />
    );
  }

  if (routePath === '/json') {
    return (
      <JsonToolPage
        theme={theme}
        onToggleTheme={toggleTheme}
        linkForPath={linkForPath}
        onNavigateClick={onNavigateClick}
      />
    );
  }

  if (routePath === '/color') {
    return (
      <ColorToolPage
        theme={theme}
        onToggleTheme={toggleTheme}
        linkForPath={linkForPath}
        onNavigateClick={onNavigateClick}
      />
    );
  }

  return (
    <NotFoundPage
      theme={theme}
      onToggleTheme={toggleTheme}
      linkForPath={linkForPath}
      onNavigateClick={onNavigateClick}
    />
  );
}

export default App;
