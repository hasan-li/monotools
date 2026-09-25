import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import ColorPage from './pages/ColorPage';
import HomePage from './pages/HomePage';
import JsonPage from './pages/JsonPage';

type Theme = 'light' | 'dark';
type ToolPath = '/' | '/json' | '/color';

const BASE_URL = import.meta.env.BASE_URL;
const THEME_STORAGE_KEY = 'tools-theme';
const ROUTE_META: Record<string, { label: string; title: string; description: string }> = {
  '/': { label: 'INDEX', title: 'Tools Directory | JSON Formatter and Color Converter', description: 'ASCII-first tools for JSON formatting and color conversion.' },
  '/json': { label: 'JSON', title: 'JSON Tool | Tools Directory', description: 'Format, validate, sort, copy, and inspect JSON locally.' },
  '/color': { label: 'COLOR', title: 'Color Tool | Tools Directory', description: 'Convert CSS colors to HEX, RGB, HSL, HSV, and CMYK.' },
};

const basePrefix = BASE_URL === '/' ? '' : BASE_URL.replace(/\/$/, '');
const normalizeRoutePath = (pathname: string): string => {
  const withoutBase = basePrefix && pathname.startsWith(basePrefix) ? pathname.slice(basePrefix.length) || '/' : pathname;
  return (`/${withoutBase}`.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/');
};
const buildHref = (path: ToolPath): string => path === '/' ? BASE_URL : `${BASE_URL}${path.slice(1)}/`;
const initialTheme = (): Theme => {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export default function App() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const themeIsExplicit = useRef(['light', 'dark'].includes(localStorage.getItem(THEME_STORAGE_KEY) ?? ''));
  const [routePath, setRoutePath] = useState(() => normalizeRoutePath(location.pathname));
  const route = ROUTE_META[routePath];

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const preference = matchMedia('(prefers-color-scheme: dark)');
    const followSystem = (event: MediaQueryListEvent): void => {
      if (!themeIsExplicit.current) setTheme(event.matches ? 'dark' : 'light');
    };
    preference.addEventListener('change', followSystem);
    return () => preference.removeEventListener('change', followSystem);
  }, []);

  useEffect(() => {
    const meta = route ?? { title: 'Tools Directory', description: 'ASCII-first web tools for JSON and color conversion.' };
    document.title = meta.title;
    document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute('content', meta.description);
  }, [route]);

  useEffect(() => {
    const onPopState = (): void => setRoutePath(normalizeRoutePath(location.pathname));
    addEventListener('popstate', onPopState);
    return () => removeEventListener('popstate', onPopState);
  }, []);

  const toggleTheme = useCallback(() => {
    themeIsExplicit.current = true;
    setTheme((current) => {
      const next = current === 'light' ? 'dark' : 'light';
      localStorage.setItem(THEME_STORAGE_KEY, next);
      return next;
    });
  }, []);
  const navigate = useCallback((path: ToolPath) => {
    if (normalizeRoutePath(location.pathname) === path) return;
    history.pushState({}, '', buildHref(path));
    setRoutePath(path);
    scrollTo({ top: 0, behavior: 'auto' });
  }, []);
  const onNavigateClick = useCallback((event: MouseEvent<HTMLAnchorElement>, path: ToolPath) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(path);
  }, [navigate]);

  let page = <section className="not-found">ROUTE NOT FOUND · <a href={buildHref('/')} onClick={(event) => onNavigateClick(event, '/')}>RETURN TO INDEX</a></section>;
  if (routePath === '/') page = <HomePage linkForPath={buildHref} onNavigateClick={onNavigateClick} />;
  if (routePath === '/json') page = <JsonPage />;
  if (routePath === '/color') page = <ColorPage />;

  return (
    <main className="screen">
      <header className="doc-header">
        <nav aria-label="Breadcrumb">
          <h1 className="breadcrumb">
            <a href={buildHref('/')} onClick={(event) => onNavigateClick(event, '/')}>TOOLS</a>
            <span aria-hidden="true">/</span>
            <span>{route?.label ?? '404'}</span>
          </h1>
        </nav>
        <button type="button" className="theme-control" onClick={toggleTheme} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} aria-pressed={theme === 'dark'}>
          <span className={theme === 'light' ? 'is-current' : ''}>LIGHT</span>—<span className={theme === 'dark' ? 'is-current' : ''}>DARK</span>
        </button>
      </header>
      {page}
    </main>
  );
}
