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
        <div className="studio-brand">
          <span className="studio-brand-mark" aria-hidden />
          <span className="studio-title">cube-level-generator</span>
        </div>
        <span className="studio-tagline">关卡 · 公式 · 指引</span>
      </header>
      <main className="studio-columns">
        <CatalogPanel />
        <EditorPanel />
        <LlmPanel />
      </main>
    </div>
  );
}
