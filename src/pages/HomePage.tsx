import type { MouseEvent } from 'react';

interface HomePageProps {
  linkForPath: (path: '/' | '/json' | '/color' | '/diff') => string;
  onNavigateClick: (event: MouseEvent<HTMLAnchorElement>, path: '/' | '/json' | '/color' | '/diff') => void;
}

const tools = [
  { path: '/json' as const, name: 'JSON', meta: 'FORMAT · VALIDATE · INSPECT' },
  { path: '/color' as const, name: 'COLOR', meta: 'CONVERT · PREVIEW · COPY' },
  { path: '/diff' as const, name: 'DIFF', meta: 'COMPARE · REVIEW' },
];

export default function HomePage({ linkForPath, onNavigateClick }: HomePageProps) {
  return (
    <>
      <p className="page-summary">Fast, private browser tools. No uploads or accounts.</p>
      <nav className="tool-index" aria-label="Tools">
        {tools.map((tool) => (
          <a key={tool.path} href={linkForPath(tool.path)} onClick={(event) => onNavigateClick(event, tool.path)} className="index-row">
            <span className="index-name">{tool.name}</span>
            <span className="index-meta">{tool.meta}</span>
          </a>
        ))}
      </nav>
    </>
  );
}
