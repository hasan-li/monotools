import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

const applyGithubPagesRedirect = (): void => {
  const query = new URLSearchParams(window.location.search);
  const encodedPath = query.get('p');

  if (!encodedPath) {
    return;
  }

  const decodedPath = decodeURIComponent(encodedPath);
  const basePath = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL.slice(0, -1)
    : import.meta.env.BASE_URL;

  const normalizedPath = decodedPath.startsWith('/') ? decodedPath : `/${decodedPath}`;
  const nextUrl = `${basePath}${normalizedPath}`;

  window.history.replaceState({}, '', nextUrl);
};

applyGithubPagesRedirect();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
