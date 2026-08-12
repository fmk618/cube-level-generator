import { useMemo, useState, type ReactNode } from 'react';

import { exportLevelsToJSON, importLevelsFromJSON } from '@/core/levels';
import {
  exportLevelSkillMapToJSON,
  exportSkillGraphToJSON,
  importLevelSkillMapFromJSON,
  importSkillGraphFromJSON,
  validateLevelSkillMapForPublish,
  validateSkillGraph,
} from '@/core/skill-graph/utils';
import { useCatalogStore } from '@/shared/store/useCatalogStore';
import { useLevelSkillMapStore } from '@/shared/store/useLevelSkillMapStore';
import { useSkillGraphStore } from '@/shared/store/useSkillGraphStore';
import '../../styles/data-import-wizard.css';

type ImportStep = 'catalog' | 'skills' | 'map' | 'review';

type AppDataImportWizardProps = {
  open: boolean;
  onClose: () => void;
  onOpenPage: (page: 'catalog' | 'skills' | 'levelSkillMap') => void;
};

type Notice = {
  kind: 'ok' | 'error' | 'warning';
  text: string;
} | null;

const STEPS: Array<{ id: ImportStep; index: string; title: string }> = [
  { id: 'catalog', index: '1', title: '关卡内容' },
  { id: 'skills', index: '2', title: '能力标签' },
  { id: 'map', index: '3', title: '推荐配置' },
  { id: 'review', index: '4', title: '校验与发布' },
];

const basename = (filePath: string): string => filePath.split(/[\\/]/).pop() ?? filePath;

export function AppDataImportWizard({ open, onClose, onOpenPage }: AppDataImportWizardProps) {
  const [activeStep, setActiveStep] = useState<ImportStep>('catalog');
  const [busyStep, setBusyStep] = useState<ImportStep | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [importedFiles, setImportedFiles] = useState<Partial<Record<ImportStep, string>>>({});
  const [savedSteps, setSavedSteps] = useState<Partial<Record<ImportStep, boolean>>>({});
  const [legacyMapImported, setLegacyMapImported] = useState(false);
  const [exportDirectory, setExportDirectory] = useState<string | null>(null);

  const catalog = useCatalogStore((state) => state.catalog);
  const levels = useCatalogStore((state) => state.levels);
  const catalogUnsaved = useCatalogStore((state) => state.hasUnsavedChanges);
  const saveLocalCatalog = useCatalogStore((state) => state.saveLocal);
  const pushRemoteCatalog = useCatalogStore((state) => state.pushRemote);

  const skillGraph = useSkillGraphStore((state) => state.skillGraph);
  const skills = useSkillGraphStore((state) => state.skills);
  const skillsUnsaved = useSkillGraphStore((state) => state.hasUnsavedChanges);
  const saveLocalSkills = useSkillGraphStore((state) => state.saveLocal);
  const pushRemoteSkills = useSkillGraphStore((state) => state.pushRemote);

  const levelSkillMap = useLevelSkillMapStore((state) => state.levelSkillMap);
  const ambiguous = useLevelSkillMapStore((state) => state.ambiguous);
  const mapUnsaved = useLevelSkillMapStore((state) => state.hasUnsavedChanges);
  const saveLocalMap = useLevelSkillMapStore((state) => state.saveLocal);
  const pushRemoteMap = useLevelSkillMapStore((state) => state.pushRemote);

  const publishIssues = useMemo(() => {
    if (!levelSkillMap) return [];
    return validateLevelSkillMapForPublish(
      levelSkillMap,
      levels,
      skills,
      Object.keys(ambiguous),
    );
  }, [ambiguous, levelSkillMap, levels, skills]);
  const publishErrors = publishIssues.filter((issue) => issue.level === 'error');
  const publishWarnings = publishIssues.filter((issue) => issue.level === 'warning');
  const mappedCount = levelSkillMap
    ? Object.values(levelSkillMap.mappings).filter((entry) => entry.skills.length === 1).length
    : 0;
  const ambiguousCount = Object.keys(ambiguous).length;
  const hasAnyUnsavedChanges = catalogUnsaved || skillsUnsaved || mapUnsaved;

  if (!open) return null;

  const requestClose = () => {
    if (
      hasAnyUnsavedChanges
      && !window.confirm('仍有导入后的草稿未保存。关闭向导不会丢失当前内存草稿，但退出应用前必须保存。确定关闭吗？')
    ) {
      return;
    }
    onClose();
  };

  const confirmReplace = (label: string, hasUnsavedChanges: boolean): boolean => (
    !hasUnsavedChanges
    || window.confirm(`重新导入会覆盖当前未保存的${label}草稿，确定继续吗？`)
  );

  const importStep = async (step: Exclude<ImportStep, 'review'>) => {
    const hasUnsavedChanges = step === 'catalog'
      ? catalogUnsaved
      : step === 'skills'
        ? skillsUnsaved
        : mapUnsaved;
    const label = step === 'catalog' ? '关卡内容' : step === 'skills' ? '能力标签' : '推荐配置';
    if (!confirmReplace(label, hasUnsavedChanges)) return;

    setBusyStep(step);
    setNotice(null);
    try {
      if (step === 'catalog') {
        const result = await window.api.catalog.importFromDisk();
        if (!result) return;
        const parsed = importLevelsFromJSON(result.content);
        useCatalogStore.getState().importCatalogFromJSON(result.content);
        setImportedFiles((current) => ({ ...current, catalog: result.filePath }));
        setSavedSteps((current) => ({ ...current, catalog: false }));
        setNotice({ kind: 'ok', text: `已解析 ${parsed.levels.length} 个关卡；保存并同步后才能进入下一步。` });
        return;
      }

      if (step === 'skills') {
        const result = await window.api.skillGraph.importFromDisk();
        if (!result) return;
        const parsed = importSkillGraphFromJSON(result.content);
        const errors = validateSkillGraph(parsed);
        if (errors.length > 0) throw new Error(errors.join('；'));
        useSkillGraphStore.getState().importSkillGraphFromJSON(result.content);
        setImportedFiles((current) => ({ ...current, skills: result.filePath }));
        setSavedSteps((current) => ({ ...current, skills: false }));
        setNotice({ kind: 'ok', text: `已解析 ${parsed.skills.length} 个能力标签；保存并同步后才能进入下一步。` });
        return;
      }

      const result = await window.api.levelSkillMap.importFromDisk();
      if (!result) return;
      const raw = JSON.parse(result.content) as { map?: unknown; mappings?: unknown };
      const parsed = importLevelSkillMapFromJSON(result.content);
      useLevelSkillMapStore.getState().importMapFromJSON(result.content);
      setLegacyMapImported(Boolean(raw.mappings && !raw.map));
      setImportedFiles((current) => ({ ...current, map: result.filePath }));
      setSavedSteps((current) => ({ ...current, map: false }));
      const resolvedCount = Object.keys(parsed.map.mappings).length;
      const ambiguousImportedCount = Object.keys(parsed.ambiguous).length;
      setNotice(ambiguousImportedCount > 0
        ? {
            kind: 'warning',
            text: `已解析 ${resolvedCount} 个单主标签映射；另有 ${ambiguousImportedCount} 关存在多个标签，必须先消歧。`,
          }
        : {
            kind: 'ok',
            text: `已解析 ${resolvedCount} 个映射${raw.mappings && !raw.map ? '，旧 v2 已转换为 App v1 草稿' : ''}。`,
          });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusyStep(null);
    }
  };

  const saveStep = async (step: Exclude<ImportStep, 'review'>) => {
    setBusyStep(step);
    setNotice(null);
    try {
      if (step === 'catalog') {
        await saveLocalCatalog();
        await pushRemoteCatalog();
        setSavedSteps((current) => ({ ...current, catalog: true }));
        setActiveStep('skills');
        setNotice({ kind: 'ok', text: '关卡内容已写入本地并推送到远程。现在导入能力标签。' });
        return;
      }
      if (step === 'skills') {
        await saveLocalSkills();
        await pushRemoteSkills();
        setSavedSteps((current) => ({ ...current, skills: true }));
        setActiveStep('map');
        setNotice({ kind: 'ok', text: '能力标签已写入本地并推送到远程。现在导入推荐配置。' });
        return;
      }
      if (ambiguousCount > 0) {
        throw new Error(`仍有 ${ambiguousCount} 个多标签映射未消歧。`);
      }
      if (publishErrors.length > 0) {
        throw new Error(`发布检查发现 ${publishErrors.length} 个阻断项，请先修复后再保存。`);
      }
      await saveLocalMap();
      await pushRemoteMap();
      setSavedSteps((current) => ({ ...current, map: true }));
      setActiveStep('review');
      setNotice({ kind: 'ok', text: '推荐配置已保存为 App v1，并已推送到远程。' });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusyStep(null);
    }
  };

  const resetAndClose = () => {
    setActiveStep('catalog');
    setNotice(null);
    setImportedFiles({});
    setSavedSteps({});
    setLegacyMapImported(false);
    setExportDirectory(null);
    onClose();
  };

  const exportAppBundle = async () => {
    setBusyStep('review');
    setNotice(null);
    try {
      if (!catalog || !skillGraph || !levelSkillMap) {
        throw new Error('三份桌面端数据尚未全部加载，无法发布回 App。');
      }
      if (hasAnyUnsavedChanges) {
        throw new Error('仍有未保存草稿，请先完成“保存并同步”再导出。');
      }
      const skillErrors = validateSkillGraph(skillGraph);
      if (skillErrors.length > 0) {
        throw new Error(`能力标签校验失败：${skillErrors.join('；')}`);
      }
      if (ambiguousCount > 0 || publishErrors.length > 0) {
        throw new Error(`发布检查未通过：${ambiguousCount} 个待消歧，${publishErrors.length} 个阻断项。`);
      }
      const result = await window.api.migration.exportAppBundle({
        catalog: exportLevelsToJSON(catalog),
        skillGraph: exportSkillGraphToJSON(skillGraph),
        levelSkillMap: exportLevelSkillMapToJSON(levelSkillMap),
      });
      if (!result) return;
      setExportDirectory(result.directory);
      setNotice({ kind: 'ok', text: '已从桌面端导出 3 个 JSON，可用于发布回 LiberCube App。' });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusyStep(null);
    }
  };

  const stepStatus = (step: ImportStep): string => {
    if (step === 'review') return savedSteps.map ? '可验收' : '未开始';
    if (savedSteps[step]) return '已同步';
    if (importedFiles[step]) return '待保存';
    return '未导入';
  };

  const renderImportStep = (
    step: Exclude<ImportStep, 'review'>,
    fileName: string,
    description: string,
    summary: string,
    hasUnsavedChanges: boolean,
    extra?: ReactNode,
  ) => (
    <>
      <div className="migration-guidance">
        <strong>选择 {fileName}</strong>
        <p>{description}</p>
      </div>
      <button
        type="button"
        className="btn"
        disabled={busyStep !== null}
        onClick={() => void importStep(step)}
      >
        {busyStep === step ? '读取中…' : '选择 JSON 文件'}
      </button>
      {importedFiles[step] && (
        <div className="migration-file" title={importedFiles[step]}>
          <span>已选择</span>
          <strong>{basename(importedFiles[step]!)}</strong>
        </div>
      )}
      <div className="migration-summary">{summary}</div>
      {extra}
      <div className="migration-save-note">
        从 App 读取后只替换桌面端当前草稿；“保存并同步”成功后才会写入桌面端 runtime 和 MySQL。
      </div>
      <div className="migration-actions">
        <button type="button" className="btn" onClick={requestClose}>稍后继续</button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!importedFiles[step] || !hasUnsavedChanges || busyStep !== null}
          onClick={() => void saveStep(step)}
        >
          {busyStep === step ? '保存中…' : '保存并同步'}
        </button>
      </div>
    </>
  );

  return (
    <div className="migration-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) requestClose();
    }}>
      <section className="migration-dialog" role="dialog" aria-modal="true" aria-labelledby="migration-title">
        <header className="migration-header">
          <div>
            <span className="migration-eyebrow">LIBERCUBE APP → DESKTOP</span>
            <h2 id="migration-title">从 App 迁移数据</h2>
            <p>将 LiberCube App 仓库中的三份 JSON 导入桌面端，并保存到桌面端 runtime 与 MySQL。</p>
          </div>
          <button type="button" className="migration-close" aria-label="关闭从 App 迁移数据" onClick={requestClose}>×</button>
        </header>

        <div className="migration-direction" aria-label="迁移方向">
          <span>LiberCube App JSON</span>
          <strong>→</strong>
          <span>桌面端草稿</span>
          <strong>→</strong>
          <span>runtime + MySQL</span>
        </div>

        <nav className="migration-steps" aria-label="导入步骤">
          {STEPS.map((step) => {
            const enabled = step.id === 'catalog'
              || (step.id === 'skills' && savedSteps.catalog)
              || (step.id === 'map' && savedSteps.catalog && savedSteps.skills)
              || (step.id === 'review' && savedSteps.map);
            return (
              <button
                type="button"
                key={step.id}
                disabled={!enabled}
                className={activeStep === step.id ? 'is-active' : ''}
                onClick={() => setActiveStep(step.id)}
              >
                <span>{step.index}</span>
                <div><strong>{step.title}</strong><small>{stepStatus(step.id)}</small></div>
              </button>
            );
          })}
        </nav>

        <div className="migration-content">
          {notice && <div className={`migration-notice is-${notice.kind}`}>{notice.text}</div>}

          {activeStep === 'catalog' && renderImportStep(
            'catalog',
            'game_levels_english.json',
            '来源：LiberCube-App-RN/data/levels/game_levels_english.json。导入后会替换桌面端整个关卡目录草稿。',
            `当前解析结果：${catalog?.chapters.length ?? 0} 个章节 · ${levels.length} 个关卡`,
            catalogUnsaved,
          )}

          {activeStep === 'skills' && renderImportStep(
            'skills',
            'skill_graph_cfop.json',
            '来源：LiberCube-App-RN/data/skills/skill_graph_cfop.json。能力标签只用于 mastery 聚合和候选关卡筛选。',
            `当前解析结果：${skillGraph?.version ?? '-'} 版 · ${skills.length} 个能力标签`,
            skillsUnsaved,
          )}

          {activeStep === 'map' && (
            renderImportStep(
              'map',
              'level_skill_map.json',
              '来源：LiberCube-App-RN/data/skills/level_skill_map.json。一关只能有一个主能力标签；旧 v2 多标签必须人工消歧。',
              `当前解析结果：${mappedCount} 个单主标签映射 · ${ambiguousCount} 个待消歧 · ${publishErrors.length} 个阻断项`,
              mapUnsaved,
              <>
                {legacyMapImported && <div className="migration-legacy">已识别旧 v2 格式；保存时统一写为 App v1。</div>}
                {ambiguousCount > 0 && (
                  <div className="migration-inline-action">
                    <span>先完成消歧，暂时不要在配置页保存；返回向导后统一保存并同步。</span>
                    <button type="button" className="btn" onClick={() => {
                      onClose();
                      onOpenPage('levelSkillMap');
                    }}>
                      前往 AI 推荐配置消歧
                    </button>
                  </div>
                )}
                {publishErrors.length > 0 && (
                  <ul className="migration-issues">
                    {publishErrors.slice(0, 5).map((issue, index) => (
                      <li key={`${issue.code}-${issue.levelId ?? ''}-${index}`}>{issue.message}</li>
                    ))}
                  </ul>
                )}
              </>,
            )
          )}

          {activeStep === 'review' && (
            <>
              <div className={`migration-result ${publishErrors.length === 0 ? 'is-ready' : 'is-blocked'}`}>
                <strong>{publishErrors.length === 0 ? 'App 数据已迁移到桌面端' : '迁移数据仍有阻断项'}</strong>
                <p>
                  {levels.length} 个关卡 · {skills.length} 个能力标签 · {mappedCount} 个映射 · {publishWarnings.length} 条未映射警告
                </p>
              </div>
              <div className="migration-review-grid">
                <div><span>Catalog</span><strong>{levels.length}</strong><small>关卡</small></div>
                <div><span>Skill Graph</span><strong>{skills.length}</strong><small>标签</small></div>
                <div><span>Level Map</span><strong>{mappedCount}</strong><small>映射</small></div>
                <div><span>阻断项</span><strong>{publishErrors.length}</strong><small>errors</small></div>
              </div>
              <p className="migration-save-note">
                下方导出是反向发布：桌面端 → App。发布检查通过后，可一次导出三份 JSON；它不属于本次 App → 桌面端迁移。
              </p>
              {exportDirectory && (
                <div className="migration-file" title={exportDirectory}>
                  <span>导出目录</span>
                  <strong>{exportDirectory}</strong>
                </div>
              )}
              <div className="migration-actions">
                <button type="button" className="btn" onClick={() => {
                  onClose();
                  onOpenPage('levelSkillMap');
                }}>
                  打开 AI 推荐配置
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={publishErrors.length > 0 || hasAnyUnsavedChanges || busyStep !== null}
                  onClick={() => void exportAppBundle()}
                >
                  {busyStep === 'review' ? '导出中…' : '发布回 App（3 个 JSON）'}
                </button>
                <button type="button" className="btn" disabled={publishErrors.length > 0} onClick={resetAndClose}>
                  完成
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
