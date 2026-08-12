import { useCallback, useEffect, useState } from 'react';
import { CatalogPanel } from '@/features/catalog/CatalogPanel';
import { EditorPanel } from '@/features/editor/EditorPanel';
import { LlmPanel } from '@/features/llm-formula/LlmPanel';
import { SkillGraphPanel } from '@/features/skill-graph/SkillGraphPanel';
import { LevelSkillMapPanel } from '@/features/skill-graph/LevelSkillMapPanel';
import { OnboardingTour } from '@/features/onboarding/OnboardingTour';
import { HelpOnboardingMenu } from '@/features/onboarding/HelpOnboardingMenu';
import { AppDataImportWizard } from '@/features/migration/AppDataImportWizard';
import { useCatalogStore } from '@/shared/store/useCatalogStore';
import { useUiStore } from '@/shared/store/useUiStore';
import { useSkillGraphStore } from '@/shared/store/useSkillGraphStore';
import { useLevelSkillMapStore } from '@/shared/store/useLevelSkillMapStore';
import { useCloudSyncStore } from '@/shared/store/useCloudSyncStore';
import { pushAllRemote, saveAllLocal } from '@/shared/store/localRemoteSave';

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
  const [savingLocal, setSavingLocal] = useState(false);
  const [pushingRemote, setPushingRemote] = useState(false);
  const [pullingRemote, setPullingRemote] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<'catalog' | 'skills' | 'levelSkillMap'>('catalog');
  const [migrationOpen, setMigrationOpen] = useState(false);
  const selectedLevelId = useUiStore((state) => state.selectedLevelId);
  const selectLevel = useUiStore((state) => state.selectLevel);
  const hasUnsavedChanges = useCatalogStore((state) => state.hasUnsavedChanges);
  const skillsUnsaved = useSkillGraphStore((state) => state.hasUnsavedChanges);
  const mapUnsaved = useLevelSkillMapStore((state) => state.hasUnsavedChanges);
  const anyUnsaved = hasUnsavedChanges || skillsUnsaved || mapUnsaved;
  const refreshCatalog = useCatalogStore((state) => state.refreshCatalog);
  const refreshSkillGraph = useSkillGraphStore((state) => state.refreshSkillGraph);
  const refreshMap = useLevelSkillMapStore((state) => state.refreshMap);
  const syncPhase = useCloudSyncStore((state) => state.phase);
  const syncLabel = useCloudSyncStore((state) => state.label);
  const syncProgress = useCloudSyncStore((state) => state.progress);
  const syncError = useCloudSyncStore((state) => state.error);
  const resetSync = useCloudSyncStore((state) => state.reset);
  const beginLocal = useCloudSyncStore((state) => state.beginLocal);
  const markCloud = useCloudSyncStore((state) => state.markCloud);
  const setProgress = useCloudSyncStore((state) => state.setProgress);
  const finishOk = useCloudSyncStore((state) => state.finishOk);
  const finishError = useCloudSyncStore((state) => state.finishError);

  useEffect(() => {
    document.documentElement.dataset.platform = window.platform;
  }, []);

  useEffect(() => {
    window.api.app.setUnsaved(anyUnsaved);
  }, [anyUnsaved]);

  useEffect(() => {
    const unsubscribe = window.api.app.onSaveAndQuit(() => {
      void (async () => {
        try {
          await saveAllLocal();
          await window.api.app.confirmQuit();
        } catch {
          // 保存失败时不退出
        }
      })();
    });
    return unsubscribe;
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

  const busySync = syncPhase === 'local' || syncPhase === 'cloud' || savingLocal || pushingRemote || pullingRemote;

  const handleSaveLocal = async () => {
    if (savingLocal || pushingRemote) return;
    setSavingLocal(true);
    setSaveError(null);
    try {
      await saveAllLocal();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingLocal(false);
    }
  };

  const handlePushRemote = async () => {
    if (savingLocal || pushingRemote) return;
    setPushingRemote(true);
    setSaveError(null);
    try {
      await pushAllRemote();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setPushingRemote(false);
    }
  };

  const handlePullRemote = async () => {
    if (pullingRemote) return;
    if (hasUnsavedChanges || skillsUnsaved || mapUnsaved) {
      const ok = window.confirm(
        '本地有未保存的修改，拉取远程将用云端数据覆盖当前编辑内容，是否继续？',
      );
      if (!ok) return;
    }

    setPullingRemote(true);
    setSaveError(null);
    beginLocal('正在连接云端…');
    try {
      markCloud('正在拉取关卡目录…', 20);
      await refreshCatalog({ force: true, persistLocal: true });
      setProgress(45, '正在拉取能力标签…');
      await refreshSkillGraph({ force: true, persistLocal: true });
      setProgress(70, '正在拉取推荐配置…');
      await refreshMap({ force: true, persistLocal: true });
      finishOk('已从云端拉取关卡目录；能力标签与推荐配置若云端无数据则保留本地');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSaveError(message);
      finishError(message, '拉取远程失败');
    } finally {
      setPullingRemote(false);
    }
  };

  const syncBarVisible = syncPhase !== 'idle';
  const syncBarClass =
    syncPhase === 'error' ? 'is-error'
      : syncPhase === 'done' ? 'is-done'
        : '';

  return (
    <div className="studio-shell">
      <header className="studio-titlebar">
        <nav className="titlebar-nav" aria-label="编辑模块">
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
        </nav>
        <div className="titlebar-identity">
          <div className="titlebar-copy">
            <strong>cube-level-generator</strong>
          </div>
        </div>
        <div className="titlebar-actions" id="global-editor-actions">
          <button
            type="button"
            className="btn btn-sm"
            disabled={busySync}
            onClick={() => void handlePullRemote()}
            title="从云端拉取关卡、能力标签与推荐配置，并覆盖本地缓存"
          >
            {pullingRemote ? <><span className="spinner" />拉取中</> : '拉取远程'}
          </button>
          <button type="button" className="btn btn-sm" onClick={() => setMigrationOpen(true)}>
            从 App 迁移
          </button>
          <HelpOnboardingMenu />
          <div className="titlebar-save-slot">
            {!(selectedLevelId && editMode === 'catalog') ? (
              <>
                {anyUnsaved && <span className="save-state"><i />未保存</span>}
                <button
                  type="button"
                  className="btn btn-sm titlebar-save"
                  disabled={busySync || !anyUnsaved}
                  onClick={() => void handleSaveLocal()}
                  title="仅写入本机 runtime，不推 MySQL"
                >
                  {savingLocal ? <><span className="spinner" />保存中</> : '本地保存'}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary titlebar-save"
                  disabled={busySync}
                  onClick={() => void handlePushRemote()}
                  title="有草稿先本地保存，再批量推送关卡 / 能力标签 / 推荐配置"
                >
                  {pushingRemote ? <><span className="spinner" />推送中</> : '保存远程'}
                </button>
              </>
            ) : null}
          </div>
        </div>
      </header>
      {syncBarVisible && (
        <div className={`cloud-sync-bar ${syncBarClass}`} role="status" aria-live="polite">
          <span className="cloud-sync-label">
            {syncPhase === 'error' && syncError ? `${syncLabel}：${syncError}` : syncLabel}
          </span>
          <div className="cloud-sync-track" aria-hidden>
            <div className="cloud-sync-fill" style={{ width: `${syncProgress}%` }} />
          </div>
          {syncPhase === 'error' && (
            <button type="button" className="cloud-sync-dismiss" onClick={() => resetSync()}>
              关闭
            </button>
          )}
        </div>
      )}
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
      <AppDataImportWizard
        open={migrationOpen}
        onClose={() => setMigrationOpen(false)}
        onOpenPage={(page) => {
          setMigrationOpen(false);
          setEditMode(page);
        }}
      />
      <OnboardingTour
        editMode={editMode}
        setEditMode={setEditMode}
        llmCollapsed={llmCollapsed}
        setLlmCollapsed={setLlmCollapsed}
      />
    </div>
  );
}
