import { useCallback, useEffect, useState } from 'react';
import { CatalogPanel } from '@/features/catalog/CatalogPanel';
import { EditorPanel } from '@/features/editor/EditorPanel';
import { LlmPanel } from '@/features/llm-formula/LlmPanel';
import { SkillGraphPanel } from '@/features/skill-graph/SkillGraphPanel';
import { LevelSkillMapPanel } from '@/features/skill-graph/LevelSkillMapPanel';
import { OnboardingTour } from '@/features/onboarding/OnboardingTour';
import { HelpOnboardingMenu } from '@/features/onboarding/HelpOnboardingMenu';
import { useCatalogStore } from '@/shared/store/useCatalogStore';
import { useUiStore } from '@/shared/store/useUiStore';
import { useSkillGraphStore } from '@/shared/store/useSkillGraphStore';
import { useLevelSkillMapStore } from '@/shared/store/useLevelSkillMapStore';

const CATALOG_WIDTH_KEY = 'catalog-panel-width';
const DEFAULT_CATALOG_WIDTH = 300;
const MIN_CATALOG_WIDTH = 260;
const MAX_CATALOG_WIDTH = 420;
const ASSISTANT_WIDTH_KEY = 'assistant-panel-width';
const DEFAULT_ASSISTANT_WIDTH = 340;
const MIN_ASSISTANT_WIDTH = 280;
const MAX_ASSISTANT_WIDTH = 480;
const STACKED_LAYOUT_BREAKPOINT = 900;
const TWO_COLUMN_LAYOUT_BREAKPOINT = 1300;

function getResponsiveCatalogMaxWidth(viewportWidth: number): number {
  if (viewportWidth < STACKED_LAYOUT_BREAKPOINT || viewportWidth >= TWO_COLUMN_LAYOUT_BREAKPOINT) {
    return MAX_CATALOG_WIDTH;
  }
  return Math.max(MIN_CATALOG_WIDTH, Math.min(MAX_CATALOG_WIDTH, viewportWidth - 570));
}

function readCatalogWidth(): number {
  const stored = localStorage.getItem(CATALOG_WIDTH_KEY);
  if (!stored) return DEFAULT_CATALOG_WIDTH;
  const value = Number(stored);
  if (!Number.isFinite(value)) return DEFAULT_CATALOG_WIDTH;
  return Math.min(MAX_CATALOG_WIDTH, Math.max(MIN_CATALOG_WIDTH, value));
}

function getResponsiveAssistantMaxWidth(viewportWidth: number, catalogWidth: number): number {
  if (viewportWidth < TWO_COLUMN_LAYOUT_BREAKPOINT) return MAX_ASSISTANT_WIDTH;
  return Math.max(
    MIN_ASSISTANT_WIDTH,
    Math.min(MAX_ASSISTANT_WIDTH, viewportWidth - catalogWidth - 680),
  );
}

function readAssistantWidth(): number {
  const stored = localStorage.getItem(ASSISTANT_WIDTH_KEY);
  if (!stored) return DEFAULT_ASSISTANT_WIDTH;
  const value = Number(stored);
  if (!Number.isFinite(value)) return DEFAULT_ASSISTANT_WIDTH;
  return Math.min(MAX_ASSISTANT_WIDTH, Math.max(MIN_ASSISTANT_WIDTH, value));
}

export default function App() {
  const [catalogWidth, setCatalogWidth] = useState(readCatalogWidth);
  const [assistantWidth, setAssistantWidth] = useState(readAssistantWidth);
  const [llmCollapsed, setLlmCollapsed] = useState(false);
  const [savingCatalog, setSavingCatalog] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<'catalog' | 'skills' | 'levelSkillMap'>('catalog');
  const selectedLevelId = useUiStore((state) => state.selectedLevelId);
  const selectLevel = useUiStore((state) => state.selectLevel);
  const hasUnsavedChanges = useCatalogStore((state) => state.hasUnsavedChanges);
  const saveCatalog = useCatalogStore((state) => state.saveCatalog);
  const refreshCatalog = useCatalogStore((state) => state.refreshCatalog);
  const refreshSkillGraph = useSkillGraphStore((state) => state.refreshSkillGraph);
  const refreshMap = useLevelSkillMapStore((state) => state.refreshMap);

  useEffect(() => {
    document.documentElement.dataset.platform = window.platform;
  }, []);

  useEffect(() => {
    void Promise.allSettled([
      refreshCatalog(),
      refreshSkillGraph(),
      refreshMap(),
    ]);
  }, [refreshCatalog, refreshSkillGraph, refreshMap]);

  useEffect(() => {
    localStorage.setItem(CATALOG_WIDTH_KEY, String(catalogWidth));
  }, [catalogWidth]);

  useEffect(() => {
    localStorage.setItem(ASSISTANT_WIDTH_KEY, String(assistantWidth));
  }, [assistantWidth]);

  useEffect(() => {
    const clampPanelWidths = () => {
      const catalogMaxWidth = getResponsiveCatalogMaxWidth(window.innerWidth);
      setCatalogWidth((width) => Math.min(catalogMaxWidth, Math.max(MIN_CATALOG_WIDTH, width)));
      const assistantMaxWidth = getResponsiveAssistantMaxWidth(window.innerWidth, catalogWidth);
      setAssistantWidth((width) => Math.min(assistantMaxWidth, Math.max(MIN_ASSISTANT_WIDTH, width)));
    };
    clampPanelWidths();
    window.addEventListener('resize', clampPanelWidths);
    return () => window.removeEventListener('resize', clampPanelWidths);
  }, [catalogWidth]);

  const startCatalogResize = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = catalogWidth;

    const onMove = (moveEvent: MouseEvent) => {
      const next = startWidth + moveEvent.clientX - startX;
      const maxWidth = getResponsiveCatalogMaxWidth(window.innerWidth);
      setCatalogWidth(Math.min(maxWidth, Math.max(MIN_CATALOG_WIDTH, next)));
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

  const startAssistantResize = useCallback((event: React.MouseEvent) => {
    if (window.innerWidth < TWO_COLUMN_LAYOUT_BREAKPOINT || llmCollapsed) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = assistantWidth;

    const onMove = (moveEvent: MouseEvent) => {
      const next = startWidth + startX - moveEvent.clientX;
      const maxWidth = getResponsiveAssistantMaxWidth(window.innerWidth, catalogWidth);
      setAssistantWidth(Math.min(maxWidth, Math.max(MIN_ASSISTANT_WIDTH, next)));
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
  }, [assistantWidth, catalogWidth, llmCollapsed]);

  const handleCatalogSave = async () => {
    setSavingCatalog(true);
    setSaveError(null);
    try {
      await saveCatalog();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingCatalog(false);
    }
  };

  return (
    <div className="studio-shell">
      <header className="studio-titlebar">
        <div className="titlebar-identity">
          <div className="titlebar-copy">
            <strong>cube-level-generator</strong>
          </div>
        </div>
        <div className="titlebar-actions" id="global-editor-actions">
          <div className="editor-mode-tabs" data-tour="module-tabs">
            <button
              type="button"
              className={`mode-tab ${editMode === 'catalog' ? 'active' : ''}`}
              data-tour="tab-catalog"
              onClick={() => setEditMode('catalog')}
            >
              关卡内容
            </button>
            <button
              type="button"
              className={`mode-tab ${editMode === 'skills' ? 'active' : ''}`}
              data-tour="tab-skills"
              onClick={() => setEditMode('skills')}
            >
              AI 能力标签
            </button>
            <button
              type="button"
              className={`mode-tab ${editMode === 'levelSkillMap' ? 'active' : ''}`}
              data-tour="tab-map"
              onClick={() => setEditMode('levelSkillMap')}
            >
              AI 推荐配置
            </button>
          </div>
          <HelpOnboardingMenu />
          {!selectedLevelId && editMode === 'catalog' && (
            <>
              {hasUnsavedChanges && <span className="save-state"><i />未保存</span>}
              <button
                type="button"
                className="btn btn-primary titlebar-save"
                disabled={!hasUnsavedChanges || savingCatalog}
                onClick={() => void handleCatalogSave()}
              >
                {savingCatalog ? <><span className="spinner" />保存中</> : '保存关卡'}
              </button>
            </>
          )}
        </div>
      </header>
      {saveError && <div className="global-save-error">{saveError}</div>}
      <main
        className="studio-columns"
        style={{
          '--catalog-width': `${catalogWidth}px`,
          '--assistant-width': `${assistantWidth}px`,
        } as React.CSSProperties}
      >
        {editMode === 'catalog' ? (
          <>
            <div className="studio-column catalog-column" style={{ width: catalogWidth }}>
              <CatalogPanel />
              <div
                className="catalog-resize-edge"
                role="separator"
                aria-orientation="vertical"
                aria-label="拖动目录面板右边框调整宽度"
                aria-valuemin={MIN_CATALOG_WIDTH}
                aria-valuemax={getResponsiveCatalogMaxWidth(window.innerWidth)}
                aria-valuenow={catalogWidth}
                tabIndex={0}
                onMouseDown={startCatalogResize}
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                  event.preventDefault();
                  const direction = event.key === 'ArrowLeft' ? -1 : 1;
                  const maxWidth = getResponsiveCatalogMaxWidth(window.innerWidth);
                  setCatalogWidth((width) => Math.min(maxWidth, Math.max(MIN_CATALOG_WIDTH, width + direction * 16)));
                }}
              />
            </div>
            <div className="studio-column studio-column-main">
              <EditorPanel onOpenAiRecommend={() => setEditMode('levelSkillMap')} />
            </div>
          </>
        ) : editMode === 'skills' ? (
          <div className="studio-column studio-column-main" style={{ width: '100%' }}>
            <SkillGraphPanel />
          </div>
        ) : (
          <div className="studio-column studio-column-main" style={{ width: '100%' }}>
            <LevelSkillMapPanel onOpenLevelContent={(id) => { selectLevel(id); setEditMode('catalog'); }} />
          </div>
        )}
        <div className={`studio-column llm-column ${llmCollapsed ? 'is-collapsed' : ''}`}>
          <div
            className="llm-resize-edge"
            role="separator"
            aria-orientation="vertical"
            aria-label="拖动公式助手左边框调整宽度"
            aria-valuemin={MIN_ASSISTANT_WIDTH}
            aria-valuemax={getResponsiveAssistantMaxWidth(window.innerWidth, catalogWidth)}
            aria-valuenow={assistantWidth}
            tabIndex={llmCollapsed ? -1 : 0}
            onMouseDown={startAssistantResize}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
              event.preventDefault();
              const direction = event.key === 'ArrowLeft' ? 1 : -1;
              const maxWidth = getResponsiveAssistantMaxWidth(window.innerWidth, catalogWidth);
              setAssistantWidth((width) => Math.min(
                maxWidth,
                Math.max(MIN_ASSISTANT_WIDTH, width + direction * 16),
              ));
            }}
          />
          <LlmPanel
            collapsed={llmCollapsed}
            onToggleCollapsed={() => setLlmCollapsed((value) => !value)}
            editMode={editMode}
            onSwitchToCatalog={() => setEditMode('catalog')}
          />
        </div>
      </main>
      <OnboardingTour
        editMode={editMode}
        setEditMode={setEditMode}
        llmCollapsed={llmCollapsed}
        setLlmCollapsed={setLlmCollapsed}
      />
    </div>
  );
}
