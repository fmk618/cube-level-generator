import { useEffect, useMemo, useState } from 'react';
import { useCatalogStore } from '@/shared/store/useCatalogStore';
import { useSkillGraphStore } from '@/shared/store/useSkillGraphStore';
import { useLevelSkillMapStore } from '@/shared/store/useLevelSkillMapStore';
import { useUiStore } from '@/shared/store/useUiStore';
import { SelectDropdown } from '@/shared/ui/SelectDropdown';
import type { LevelDefinition } from '@/core/levels';
import {
  getLevelRecommendStatus,
  resolveStageLabel,
  resolveStages,
  TEACH_MODE_OPTIONS,
  validateLevelSkillMapForPublish,
  type PublishCheckIssue,
} from '@/core/skill-graph/utils';
import type { TeachMode } from '@/core/skill-graph/types';
import '../../styles/level-skill-map-panel.css';

type LevelSkillMapPanelProps = {
  onOpenLevelContent?: (levelId: string) => void;
};

export function LevelSkillMapPanel({ onOpenLevelContent }: LevelSkillMapPanelProps = {}) {
  const [error, setError] = useState<string | null>(null);
  const [filterChapter, setFilterChapter] = useState<string | 'all'>('all');
  const [selectedLevelIds, setSelectedLevelIds] = useState<Set<string>>(new Set());
  const [batchSkillId, setBatchSkillId] = useState('');
  const [batchTeachMode, setBatchTeachMode] = useState<TeachMode>('guided');
  const [batchDifficulty, setBatchDifficulty] = useState('2');
  const [publishIssues, setPublishIssues] = useState<PublishCheckIssue[] | null>(null);
  const setAiMapLevelIds = useUiStore((state) => state.setAiMapLevelIds);
  const aiTouchedLevelIds = useUiStore((state) => state.aiTouchedLevelIds);
  const clearAiTouched = useUiStore((state) => state.clearAiTouched);

  const levels = useCatalogStore((state) => state.levels);
  const chapters = useCatalogStore((state) => state.chapters);
  const isCatalogLoaded = useCatalogStore((state) => state.isLoaded);
  const isCatalogLoading = useCatalogStore((state) => state.isLoading);
  const refreshCatalog = useCatalogStore((state) => state.refreshCatalog);
  const skills = useSkillGraphStore((state) => state.skills);
  const skillGraph = useSkillGraphStore((state) => state.skillGraph);
  const isSkillLoading = useSkillGraphStore((state) => state.isLoading);
  const refreshSkillGraph = useSkillGraphStore((state) => state.refreshSkillGraph);

  const levelSkillMap = useLevelSkillMapStore((state) => state.levelSkillMap);
  const ambiguous = useLevelSkillMapStore((state) => state.ambiguous);
  const getPrimary = useLevelSkillMapStore((state) => state.getPrimary);
  const setPrimarySkill = useLevelSkillMapStore((state) => state.setPrimarySkill);
  const updatePrimaryMeta = useLevelSkillMapStore((state) => state.updatePrimaryMeta);
  const clearPrimary = useLevelSkillMapStore((state) => state.clearPrimary);
  const batchSetPrimarySkill = useLevelSkillMapStore((state) => state.batchSetPrimarySkill);
  const batchSetTeachMode = useLevelSkillMapStore((state) => state.batchSetTeachMode);
  const batchSetDifficulty = useLevelSkillMapStore((state) => state.batchSetDifficulty);
  const resolveAmbiguous = useLevelSkillMapStore((state) => state.resolveAmbiguous);
  const exportToDisk = useLevelSkillMapStore((state) => state.exportToDisk);
  const importFromDisk = useLevelSkillMapStore((state) => state.importFromDisk);
  const hasUnsavedChanges = useLevelSkillMapStore((state) => state.hasUnsavedChanges);
  const saveMap = useLevelSkillMapStore((state) => state.saveMap);
  const refreshMap = useLevelSkillMapStore((state) => state.refreshMap);
  const isMapLoading = useLevelSkillMapStore((state) => state.isLoading);

  useEffect(() => {
    setAiMapLevelIds(Array.from(selectedLevelIds));
  }, [selectedLevelIds, setAiMapLevelIds]);

  useEffect(() => {
    if (aiTouchedLevelIds.length === 0) return;
    const firstId = aiTouchedLevelIds[0];
    const el = document.querySelector(`[data-level-id="${CSS.escape(firstId)}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [aiTouchedLevelIds]);

  useEffect(() => {
    if (!isCatalogLoaded && !isCatalogLoading) void refreshCatalog();
  }, [isCatalogLoaded, isCatalogLoading, refreshCatalog]);

  useEffect(() => {
    if (!skillGraph && !isSkillLoading) void refreshSkillGraph();
  }, [skillGraph, isSkillLoading, refreshSkillGraph]);

  useEffect(() => {
    if (!levelSkillMap && !isMapLoading) void refreshMap();
  }, [levelSkillMap, isMapLoading, refreshMap]);

  const stages = useMemo(() => resolveStages(skillGraph), [skillGraph]);

  const skillOptions = useMemo(
    () =>
      skills
        .filter((s) => !s.draft)
        .map((s) => ({ value: s.id, label: `${resolveStageLabel(stages, s.stage)} · ${s.displayNameZh}` })),
    [skills, stages],
  );

  const skillOptionsWithDraft = useMemo(
    () =>
      skills.map((s) => ({
        value: s.id,
        label: `${resolveStageLabel(stages, s.stage)} · ${s.displayNameZh}${s.draft ? '（草稿）' : ''}`,
      })),
    [skills, stages],
  );

  const skillById = useMemo(() => {
    const map = new Map(skills.map((s) => [s.id, s]));
    return map;
  }, [skills]);

  const filteredLevels = useMemo(() => {
    if (filterChapter === 'all') return levels;
    return levels.filter((level) => level.chapterId === filterChapter);
  }, [levels, filterChapter]);

  const ambiguousCount = Object.keys(ambiguous).length;

  const runPublishCheck = () => {
    if (!levelSkillMap) return;
    const issues = validateLevelSkillMapForPublish(
      levelSkillMap,
      levels,
      skills,
      Object.keys(ambiguous),
    );
    setPublishIssues(issues);
    const errors = issues.filter((i) => i.level === 'error');
    setError(
      errors.length === 0
        ? `✓ 发布检查通过（警告 ${issues.filter((i) => i.level === 'warning').length} 条）`
        : `发布检查未通过：${errors.length} 个阻断项`,
    );
  };

  const handleExport = async () => {
    try {
      setError(null);
      if (!levelSkillMap) return;
      const issues = validateLevelSkillMapForPublish(
        levelSkillMap,
        levels,
        skills,
        Object.keys(ambiguous),
      );
      setPublishIssues(issues);
      if (issues.some((i) => i.level === 'error')) {
        setError('发布检查未通过，已阻止导出给 App');
        return;
      }
      const filePath = await exportToDisk();
      setError(filePath ? '✓ 已导出 App v1 level_skill_map.json' : '导出已取消');
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败');
    }
  };

  const handleImport = async () => {
    if (
      hasUnsavedChanges
      && !window.confirm('导入 JSON 会覆盖当前未保存的推荐配置草稿，确定继续吗？')
    ) {
      return;
    }
    try {
      setError(null);
      setPublishIssues(null);
      const imported = await importFromDisk();
      setError(imported ? '✓ 已导入 JSON，请先运行发布检查' : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败');
    }
  };

  const handleSave = async () => {
    try {
      setError(null);
      await saveMap();
      clearAiTouched();
      setError('✓ 已保存并同步到云端（App v1）');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    }
  };

  const toggleSelect = (levelId: string) => {
    setSelectedLevelIds((prev) => {
      const next = new Set(prev);
      if (next.has(levelId)) next.delete(levelId);
      else next.add(levelId);
      return next;
    });
  };

  if (!isCatalogLoaded && isCatalogLoading) {
    return (
      <div className="panel level-skill-map-panel">
        <div className="panel-empty"><p>正在加载关卡数据...</p></div>
      </div>
    );
  }

  if (!isCatalogLoaded || levels.length === 0) {
    return (
      <div className="panel level-skill-map-panel">
        <div className="panel-empty">
          <p>暂无可用关卡</p>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            请先在「关卡内容」导入或创建关卡，再回到本页配置推荐
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel level-skill-map-panel">
      <div className="map-header">
        <div>
          <h2>AI 推荐配置</h2>
          <p className="map-subtitle">
            一关一个主能力标签；通关/失败聚合到该标签。导出为 App v1 <code>map</code> 契约。
          </p>
        </div>
        <div className="map-header-actions" data-tour="map-save">
          <button type="button" className="btn btn-sm" onClick={() => void handleImport()}>导入 JSON</button>
          <button type="button" className="btn btn-sm" onClick={runPublishCheck}>发布检查</button>
          <button type="button" className="btn btn-sm" onClick={() => void handleExport()}>导出 JSON</button>
          {hasUnsavedChanges && (
            <button type="button" className="btn btn-sm btn-primary" onClick={() => void handleSave()}>保存并同步</button>
          )}
        </div>
      </div>

      {error && (
        <div className={`banner ${error.startsWith('✓') ? 'banner-ok' : 'banner-error'}`}>{error}</div>
      )}

      {ambiguousCount > 0 && (
        <div className="banner banner-error">
          有 {ambiguousCount} 个关卡存在多个能力标签，请先选择主能力标签后再保存/导出。
        </div>
      )}

      {aiTouchedLevelIds.length > 0 && (
        <div className="banner banner-ai">
          AI 刚改动了 {aiTouchedLevelIds.length} 个关卡推荐配置（橙色高亮）。
          <button type="button" className="btn btn-sm" onClick={() => clearAiTouched()}>清除高亮</button>
        </div>
      )}

      {publishIssues && (
        <div className="publish-check-panel" data-tour="publish-check">
          <div className="publish-check-header">
            <strong>发布检查</strong>
            <button type="button" className="btn btn-sm" onClick={() => setPublishIssues(null)}>关闭</button>
          </div>
          {publishIssues.length === 0 ? (
            <p className="hint-text">无问题</p>
          ) : (
            <ul className="publish-check-list">
              {publishIssues.map((issue, index) => (
                <li key={`${issue.code}-${issue.levelId ?? ''}-${index}`} className={issue.level === 'error' ? 'is-error' : 'is-warning'}>
                  [{issue.level === 'error' ? '阻断' : '警告'}] {issue.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="map-toolbar">
        <SelectDropdown
          size="sm"
          value={filterChapter}
          options={[
            { value: 'all', label: '全部章节' },
            ...chapters.map((c) => ({ value: c.id, label: `${c.partName} ${c.title}` })),
          ]}
          onChange={(v) => setFilterChapter(v === 'all' ? 'all' : v)}
        />
        <span className="hint-text">已配置 {useLevelSkillMapStore.getState().getMappedCount()} / {levels.length}</span>
      </div>

      {selectedLevelIds.size > 0 && (
        <div className="map-batch-bar" data-tour="map-batch">
          <span>已选 {selectedLevelIds.size} 关</span>
          <SelectDropdown
            size="sm"
            value={batchSkillId}
            options={skillOptions}
            placeholder="批量设主标签..."
            searchable
            onChange={setBatchSkillId}
          />
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={!batchSkillId}
            onClick={() => {
              const skill = skillById.get(batchSkillId);
              if (!skill) return;
              batchSetPrimarySkill(Array.from(selectedLevelIds), skill);
              setError(`✓ 已批量设置主标签：${skill.displayNameZh}`);
            }}
          >
            设主标签
          </button>
          <SelectDropdown
            size="sm"
            value={batchTeachMode}
            options={TEACH_MODE_OPTIONS}
            onChange={(v) => setBatchTeachMode(v as TeachMode)}
          />
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              batchSetTeachMode(Array.from(selectedLevelIds), batchTeachMode);
              setError('✓ 已批量设置教学模式');
            }}
          >
            设模式
          </button>
          <input
            className="text-input map-diff-input"
            value={batchDifficulty}
            onChange={(e) => setBatchDifficulty(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="难度"
          />
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              const n = Number(batchDifficulty);
              if (!Number.isFinite(n) || n < 1 || n > 6) {
                setError('难度需为 1～6');
                return;
              }
              batchSetDifficulty(Array.from(selectedLevelIds), n);
              setError('✓ 已批量设置推荐难度');
            }}
          >
            设难度
          </button>
          <button type="button" className="btn btn-sm" onClick={() => setSelectedLevelIds(new Set())}>取消勾选</button>
        </div>
      )}

      <div className="map-list" data-tour="map-list">
        {filteredLevels.map((level) => (
          <RecommendCard
            key={level.id}
            level={level}
            chapterLabel={chapters.find((c) => c.id === level.chapterId)?.title ?? level.chapterId}
            selected={selectedLevelIds.has(level.id)}
            aiTouched={aiTouchedLevelIds.includes(level.id)}
            ambiguous={ambiguous[level.id]}
            primary={getPrimary(level.id)}
            skillOptions={skillOptionsWithDraft}
            skillById={skillById}
            onToggleSelect={() => toggleSelect(level.id)}
            onSetPrimary={(skillId) => {
              const skill = skillById.get(skillId);
              if (!skill) return;
              setPrimarySkill(level.id, skill);
            }}
            onUpdateMeta={(partial) => updatePrimaryMeta(level.id, partial)}
            onClear={() => clearPrimary(level.id)}
            onResolveAmbiguous={(skillId) => resolveAmbiguous(level.id, skillId, skills)}
            onOpenLevel={() => onOpenLevelContent?.(level.id)}
          />
        ))}
      </div>
    </div>
  );
}

type RecommendCardProps = {
  level: LevelDefinition;
  chapterLabel: string;
  selected: boolean;
  aiTouched: boolean;
  ambiguous?: { skillId: string; teachMode: TeachMode; formulaDifficulty: number; cfopStage: string }[];
  primary: ReturnType<typeof useLevelSkillMapStore.getState>['getPrimary'] extends (id: string) => infer R ? R : never;
  skillOptions: { value: string; label: string }[];
  skillById: Map<string, { id: string; stage: string; displayNameZh: string; draft?: boolean }>;
  onToggleSelect: () => void;
  onSetPrimary: (skillId: string) => void;
  onUpdateMeta: (partial: { teachMode?: TeachMode; formulaDifficulty?: number }) => void;
  onClear: () => void;
  onResolveAmbiguous: (skillId: string) => void;
  onOpenLevel: () => void;
};

function RecommendCard({
  level,
  chapterLabel,
  selected,
  aiTouched,
  ambiguous,
  primary,
  skillOptions,
  skillById,
  onToggleSelect,
  onSetPrimary,
  onUpdateMeta,
  onClear,
  onResolveAmbiguous,
  onOpenLevel,
}: RecommendCardProps) {
  const skill = primary ? skillById.get(primary.skillId) : undefined;
  const status = getLevelRecommendStatus(
    level,
    primary,
    skill
      ? {
          id: skill.id,
          stage: skill.stage as 'cross' | 'f2l' | 'oll' | 'pll' | 'full',
          displayNameZh: skill.displayNameZh,
          displayNameEn: '',
          goal: '',
          prerequisites: [],
          masteryStandard: 'guided_only',
          order: 0,
          draft: skill.draft,
        }
      : undefined,
  );

  const guidanceOk = Boolean(level.guidanceFormula?.trim());

  return (
    <div
      data-level-id={level.id}
      className={`map-card ${primary ? 'is-mapped' : ''} ${selected ? 'is-selected' : ''} ${aiTouched ? 'ai-touched' : ''} ${ambiguous ? 'is-ambiguous' : ''}`}
    >
      <div className="map-card-top">
        <label className="map-card-check">
          <input type="checkbox" checked={selected} onChange={onToggleSelect} />
        </label>
        <div className="map-card-title-block">
          <div className="map-card-title">{level.title}</div>
          <div className="map-card-sub">{chapterLabel}</div>
        </div>
        {aiTouched && <span className="ai-touched-badge">AI</span>}
        <button type="button" className="btn btn-sm" onClick={onOpenLevel}>打开关卡内容</button>
      </div>

      <div className="map-card-meta-row">
        <span>公式状态：{guidanceOk ? 'Guidance ✓' : level.rotationFormula?.trim() ? '仅 Rotation' : '缺失'}</span>
        <span className={status.ok ? 'rec-ok' : 'rec-bad'}>
          推荐状态：{status.ok ? '可推荐' : '不可推荐'}
        </span>
      </div>

      {ambiguous && ambiguous.length > 0 ? (
        <div className="map-ambiguous">
          <p>
            此关卡存在 {ambiguous.length} 个能力标签，请选择其中一个作为主能力标签。
          </p>
          <div className="map-ambiguous-actions">
            {ambiguous.map((candidate) => (
              <button
                key={candidate.skillId}
                type="button"
                className="btn btn-sm"
                onClick={() => onResolveAmbiguous(candidate.skillId)}
              >
                {skillById.get(candidate.skillId)?.displayNameZh ?? candidate.skillId}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="map-primary-fields">
          <label>
            主能力标签
            <SelectDropdown
              size="sm"
              value={primary?.skillId ?? ''}
              options={skillOptions}
              placeholder="选择主能力标签..."
              searchable
              onChange={onSetPrimary}
            />
          </label>
          <label>
            教学模式
            <SelectDropdown
              size="sm"
              value={primary?.teachMode ?? 'guided'}
              options={TEACH_MODE_OPTIONS}
              disabled={!primary}
              onChange={(v) => onUpdateMeta({ teachMode: v as TeachMode })}
            />
          </label>
          <label>
            推荐难度
            <input
              className="text-input"
              disabled={!primary}
              value={primary ? String(primary.formulaDifficulty) : ''}
              onChange={(e) => {
                const n = Number(e.target.value.replace(/[^0-9]/g, ''));
                if (!Number.isFinite(n)) return;
                onUpdateMeta({ formulaDifficulty: Math.min(6, Math.max(1, n)) });
              }}
            />
          </label>
          <button type="button" className="btn btn-sm" disabled={!primary} onClick={onClear}>
            解除主标签
          </button>
        </div>
      )}

      {!status.ok && status.reasons.length > 0 && (
        <div className="map-block-reasons">
          <strong>为什么不能进入推荐</strong>
          <ul>
            {status.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
