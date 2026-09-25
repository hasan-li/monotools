import type { MouseEvent } from 'react';

interface HomePageProps {
  linkForPath: (path: '/' | '/json' | '/color') => string;
  onNavigateClick: (event: MouseEvent<HTMLAnchorElement>, path: '/' | '/json' | '/color') => void;
}

const tools = [
  { index: '01', path: '/json' as const, name: 'JSON', meta: 'FORMAT · VALIDATE · INSPECT' },
  { index: '02', path: '/color' as const, name: 'COLOR', meta: 'CONVERT · PREVIEW · COPY' },
];

export default function HomePage({ linkForPath, onNavigateClick }: HomePageProps) {
  return (
    <nav className="tool-index" aria-label="Tools">
      {tools.map((tool) => (
        <a key={tool.path} href={linkForPath(tool.path)} onClick={(event) => onNavigateClick(event, tool.path)} className="index-row">
          <span className="index-number">{tool.index}</span>
          <span className="index-name">{tool.name}</span>
          <span className="index-meta">{tool.meta}</span>
        </a>
      ))}
    </nav>
  );
}
