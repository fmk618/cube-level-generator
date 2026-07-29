import { useEffect } from 'react';
import { CatalogPanel } from '@/features/catalog/CatalogPanel';
import { EditorPanel } from '@/features/editor/EditorPanel';
import { LlmPanel } from '@/features/llm-formula/LlmPanel';

export default function App() {
  useEffect(() => {
    document.documentElement.dataset.platform = window.platform;
  }, []);

  return (
    <div className="studio-shell">
      <header className="studio-titlebar">
        <span className="studio-title">cube-level-generator</span>
      </header>
      <main className="studio-columns">
        <CatalogPanel />
        <EditorPanel />
        <LlmPanel />
      </main>
    </div>
  );
}
