import { useCallback, useEffect, useState } from 'react';
import { CatalogPanel } from '@/features/catalog/CatalogPanel';
import { EditorPanel } from '@/features/editor/EditorPanel';
import { LlmPanel } from '@/features/llm-formula/LlmPanel';

const CATALOG_WIDTH_KEY = 'catalog-panel-width';
const DEFAULT_CATALOG_WIDTH = 360;
const MIN_CATALOG_WIDTH = 260;
const MAX_CATALOG_WIDTH = 640;

function readCatalogWidth(): number {
  const stored = localStorage.getItem(CATALOG_WIDTH_KEY);
  if (!stored) return DEFAULT_CATALOG_WIDTH;
  const value = Number(stored);
  if (!Number.isFinite(value)) return DEFAULT_CATALOG_WIDTH;
  return Math.min(MAX_CATALOG_WIDTH, Math.max(MIN_CATALOG_WIDTH, value));
}

export default function App() {
  const [catalogWidth, setCatalogWidth] = useState(readCatalogWidth);

  useEffect(() => {
    document.documentElement.dataset.platform = window.platform;
  }, []);

  useEffect(() => {
    localStorage.setItem(CATALOG_WIDTH_KEY, String(catalogWidth));
  }, [catalogWidth]);

  const startCatalogResize = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = catalogWidth;

    const onMove = (moveEvent: MouseEvent) => {
      const next = startWidth + moveEvent.clientX - startX;
      setCatalogWidth(Math.min(MAX_CATALOG_WIDTH, Math.max(MIN_CATALOG_WIDTH, next)));
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [catalogWidth]);

  return (
    <div className="studio-shell">
      <header className="studio-titlebar">
        <span className="studio-title">cube-level-generator</span>
      </header>
      <main className="studio-columns">
        <div className="studio-column catalog-column" style={{ width: catalogWidth }}>
          <CatalogPanel />
        </div>
        <div
          className="column-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="拖动调整目录面板宽度"
          onMouseDown={startCatalogResize}
        />
        <div className="studio-column studio-column-main">
          <EditorPanel />
        </div>
        <div className="studio-column llm-column">
          <LlmPanel />
        </div>
      </main>
    </div>
  );
}
