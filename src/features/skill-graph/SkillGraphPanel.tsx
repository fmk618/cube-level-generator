import { useEffect, useMemo, useState } from 'react';
import { useSkillGraphStore } from '@/shared/store/useSkillGraphStore';
import { useLevelSkillMapStore } from '@/shared/store/useLevelSkillMapStore';
import { useCatalogStore } from '@/shared/store/useCatalogStore';
import { useUiStore } from '@/shared/store/useUiStore';
import { pushAllRemote } from '@/shared/store/localRemoteSave';
import { SelectDropdown } from '@/shared/ui/SelectDropdown';
import type { MasteryStandard, SkillDefinition, SkillStage } from '@/core/skill-graph/types';
import { resolveStageLabel, resolveStages } from '@/core/skill-graph/utils';
import '../../styles/skill-graph-panel.css';

const MASTERY_OPTIONS = [
  { value: 'guided_only', label: '仅需引导通过' },
  { value: 'guided_and_one_star', label: '引导 + 一星' },
  { value: 'two_stars', label: '两星' },
];

export function SkillGraphPanel() {
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
  const [filterStage, setFilterStage] = useState<SkillStage | 'all'>('all');
  const [newSkillStage, setNewSkillStage] = useState<SkillStage>('cross');
  const [newSkillId, setNewSkillId] = useState('');
  const [newDisplayNameZh, setNewDisplayNameZh] = useState('');
  const [newDisplayNameEn, setNewDisplayNameEn] = useState('');
  const [newGoal, setNewGoal] = useState('');
  const [newMasteryStandard, setNewMasteryStandard] = useState<MasteryStandard>('guided_and_one_star');
  const [newDraft, setNewDraft] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [justCreatedSkillId, setJustCreatedSkillId] = useState<string | null>(null);
  const [managingStages, setManagingStages] = useState(false);
  const [newStageId, setNewStageId] = useState('');
  const [newStageLabel, setNewStageLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pushingRemote, setPushingRemote] = useState(false);

  const skills = useSkillGraphStore((state) => state.skills);
  const hasUnsavedChanges = useSkillGraphStore((state) => state.hasUnsavedChanges);
  const skillGraph = useSkillGraphStore((state) => state.skillGraph);
  const loadError = useSkillGraphStore((state) => state.loadError);
  const isLoading = useSkillGraphStore((state) => state.isLoading);
  const refreshSkillGraph = useSkillGraphStore((state) => state.refreshSkillGraph);
  const updateSkill = useSkillGraphStore((state) => state.updateSkill);
  const addStage = useSkillGraphStore((state) => state.addStage);
  const updateStage = useSkillGraphStore((state) => state.updateStage);
  const removeStage = useSkillGraphStore((state) => state.removeStage);
  const deleteSkill = useSkillGraphStore((state) => state.deleteSkill);
  const createSkill = useSkillGraphStore((state) => state.createSkill);
  const exportToDisk = useSkillGraphStore((state) => state.exportToDisk);
  const importFromDisk = useSkillGraphStore((state) => state.importFromDisk);
  const saveLocal = useSkillGraphStore((state) => state.saveLocal);
  const resetToDefault = useSkillGraphStore((state) => state.resetToDefault);
  const aiTouchedSkillIds = useUiStore((state) => state.aiTouchedSkillIds);
  const clearAiTouched = useUiStore((state) => state.clearAiTouched);
  const levelSkillMap = useLevelSkillMapStore((state) => state.levelSkillMap);
  const levels = useCatalogStore((state) => state.levels);

  const stages = useMemo(() => resolveStages(skillGraph), [skillGraph]);
  const stageOptions = useMemo(
    () => stages.map((stage) => ({ value: stage.id, label: stage.label })),
    [stages],
  );

  useEffect(() => {
    if (stages.length === 0) return;
    if (!stages.some((stage) => stage.id === newSkillStage)) {
      setNewSkillStage(stages[0].id);
    }
  }, [stages, newSkillStage]);

  useEffect(() => {
    if (filterStage === 'all') return;
    if (!stages.some((stage) => stage.id === filterStage)) {
      setFilterStage('all');
    }
  }, [stages, filterStage]);

  useEffect(() => {
    if (!skillGraph && !isLoading) void refreshSkillGraph();
  }, [skillGraph, isLoading, refreshSkillGraph]);

  useEffect(() => {
    if (skillGraph || !isLoading) return;
    const timer = window.setTimeout(() => {
      useSkillGraphStore.setState({ isLoading: false, loadError: '加载超时，请重试或恢复默认技能树' });
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [skillGraph, isLoading]);

  useEffect(() => {
    if (aiTouchedSkillIds.length === 0) return;
    const firstId = aiTouchedSkillIds[0];
    const el = document.querySelector(`[data-skill-id="${CSS.escape(firstId)}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [aiTouchedSkillIds]);

  const levelTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const level of levels) map.set(level.id, level.title);
    return map;
  }, [levels]);

  const referencedBySkillId = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!levelSkillMap) return map;
    for (const [levelId, entry] of Object.entries(levelSkillMap.mappings)) {
      const skillId = entry.skills[0]?.skillId;
      if (!skillId) continue;
      const list = map.get(skillId) ?? [];
      list.push(levelId);
      map.set(skillId, list);
    }
    return map;
  }, [levelSkillMap]);

  const filteredSkills =
    filterStage === 'all' ? skills : skills.filter((skill) => skill.stage === filterStage);

  const handleExport = async () => {
    try {
      setError(null);
      const filePath = await exportToDisk();
      setError(filePath ? '✓ 导出成功' : '导出已取消');
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败');
    }
  };

  const handleImport = async () => {
    if (
      hasUnsavedChanges
      && !window.confirm('导入 JSON 会覆盖当前未保存的能力标签草稿，确定继续吗？')
    ) {
      return;
    }
    try {
      setError(null);
      const imported = await importFromDisk();
      setError(imported ? '✓ 已导入 JSON，请检查后本地保存或保存远程' : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      setError(null);
      await saveLocal();
      clearAiTouched();
      setError('✓ 已保存到本地（未推远程）');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handlePushRemote = async () => {
    setPushingRemote(true);
    try {
      setError(null);
      await pushAllRemote();
      clearAiTouched();
      setError('✓ 已批量推送到远程（关卡 / 能力标签 / 推荐配置）');
    } catch (err) {
      setError(err instanceof Error ? err.message : '远程推送失败');
    } finally {
      setPushingRemote(false);
    }
  };

  useEffect(() => {
    if (!justCreatedSkillId) return;
    const timer = window.setTimeout(() => {
      const el = document.querySelector(`[data-skill-id="${CSS.escape(justCreatedSkillId)}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
    const clearTimer = window.setTimeout(() => setJustCreatedSkillId(null), 8000);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(clearTimer);
    };
  }, [justCreatedSkillId]);

  const resetCreateForm = () => {
    setNewSkillId('');
    setNewDisplayNameZh('');
    setNewDisplayNameEn('');
    setNewGoal('');
    setNewMasteryStandard('guided_and_one_star');
    setNewDraft(false);
    if (stages[0]) setNewSkillStage(stages[0].id);
  };

  const handleCreate = () => {
    const displayNameZh = newDisplayNameZh.trim();
    const goal = newGoal.trim();
    if (!displayNameZh) {
      setError('请填写内部名称');
      return;
    }
    if (!goal) {
      setError('请填写能力定义');
      return;
    }
    try {
      setError(null);
      const maxOrder =
        Math.max(0, ...skills.filter((s) => s.stage === newSkillStage).map((s) => s.order)) + 1;
      const created = createSkill({
        id: newSkillId.trim() || undefined,
        stage: newSkillStage,
        displayNameZh,
        displayNameEn: newDisplayNameEn.trim() || displayNameZh,
        goal,
        prerequisites: [],
        masteryStandard: newMasteryStandard,
        order: maxOrder,
        draft: newDraft,
      });
      setFilterStage(newSkillStage);
      setJustCreatedSkillId(created.id);
      setEditingSkillId(null);
      setShowCreate(false);
      resetCreateForm();
      setError(`✓ 已创建「${created.displayNameZh}」，已定位到新卡片`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
    }
  };

  const handleDeleteSkill = (skillId: string) => {
    const refs = referencedBySkillId.get(skillId) ?? [];
    if (refs.length > 0) {
      setError(`无法删除：仍有 ${refs.length} 个关卡以它为主能力标签，请先在「AI 推荐配置」解绑`);
      return;
    }
    try {
      setError(null);
      deleteSkill(skillId);
      setError('✓ 已删除');
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleUpdateSkill = (skillId: string, partial: Partial<SkillDefinition>) => {
    try {
      setError(null);
      updateSkill(skillId, partial);
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新失败');
    }
  };

  const handleAddStage = () => {
    try {
      setError(null);
      const created = addStage({ id: newStageId, label: newStageLabel });
      setNewStageId('');
      setNewStageLabel('');
      setFilterStage(created.id);
      setError('✓ 已新增阶段（请本地保存或保存远程）');
    } catch (err) {
      setError(err instanceof Error ? err.message : '新增阶段失败');
    }
  };

  const handleRenameStage = (stageId: string, label: string) => {
    try {
      setError(null);
      updateStage(stageId, { label });
    } catch (err) {
      setError(err instanceof Error ? err.message : '重命名阶段失败');
    }
  };

  const handleRemoveStage = (stageId: string) => {
    try {
      setError(null);
      removeStage(stageId);
      if (filterStage === stageId) setFilterStage('all');
      setError('✓ 已删除阶段（请本地保存或保存远程）');
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除阶段失败');
    }
  };

  if (!skillGraph) {
    return (
      <div className="panel skill-graph-panel">
        <div className="skill-empty-state">
          {loadError ? (
            <>
              <h2>能力标签加载失败</h2>
              <p>{loadError}</p>
              <div className="skill-empty-actions">
                <button className="btn btn-sm btn-primary" onClick={() => void refreshSkillGraph()}>重试</button>
                <button className="btn btn-sm" onClick={() => void resetToDefault()}>恢复内置</button>
              </div>
            </>
          ) : (
            <>
              <h2>正在加载 AI 能力标签...</h2>
              <p>系统正在加载默认模版，请稍候</p>
              <div className="skill-empty-actions">
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    useSkillGraphStore.setState({ isLoading: false, loadError: null });
                    void resetToDefault();
                  }}
                >
                  立即加载默认技能树
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="panel skill-graph-panel">
      <div className="skill-header">
        <div className="skill-header-left">
          <h2>AI 能力标签</h2>
          <span className="skill-badge">{skills.length} 个标签</span>
        </div>
        <div className="skill-header-actions" id="skill-export" data-tour="skill-save">
          <button className="btn btn-sm" onClick={() => void handleImport()}>导入 JSON</button>
          <button className="btn btn-sm" onClick={() => void handleExport()}>导出 JSON</button>
          {hasUnsavedChanges && (
            <button className="btn btn-sm" onClick={() => void handleSave()} disabled={saving || pushingRemote}>
              {saving ? '保存中...' : '本地保存'}
            </button>
          )}
          <button
            className="btn btn-sm btn-primary"
            onClick={() => void handlePushRemote()}
            disabled={saving || pushingRemote}
            title="有草稿先本地保存，再批量推送三份数据"
          >
            {pushingRemote ? '推送中...' : '保存远程'}
          </button>
        </div>
      </div>

      <div className="skill-callout">
        <p>能力标签只用于 AI 判断玩家的薄弱项、聚合关卡成绩和筛选候选关卡。</p>
        <p>它不是独立玩法，不需要配置公式；公式请在「关卡内容」中维护。</p>
      </div>

      {error && (
        <div className={`banner ${error.startsWith('✓') ? 'banner-ok' : 'banner-error'}`}>{error}</div>
      )}

      {aiTouchedSkillIds.length > 0 && (
        <div className="banner banner-ai">
          AI 刚改动了 {aiTouchedSkillIds.length} 个能力标签（橙色高亮）。核对后点保存。
          <button type="button" className="btn btn-sm" onClick={() => clearAiTouched()}>清除高亮</button>
        </div>
      )}

      <div className={`skill-toolbar ${managingStages ? 'is-managing-stages' : ''}`} id="skill-filter" data-tour="skill-editor">
        <div className="skill-filter-block">
          {managingStages ? (
            <div className="skill-stage-manager">
              <div className="skill-stage-manager-list">
                {stages.map((stage) => (
                  <div key={stage.id} className="skill-stage-manager-row">
                    <code className="skill-stage-id">{stage.id}</code>
                    <input
                      className="text-input text-input--sm"
                      value={stage.label}
                      maxLength={24}
                      onChange={(e) => handleRenameStage(stage.id, e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={() => handleRemoveStage(stage.id)}
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
              <div className="skill-stage-add-row">
                <input
                  className="text-input text-input--sm"
                  placeholder="阶段 ID，如 beginner"
                  value={newStageId}
                  onChange={(e) => setNewStageId(e.target.value.toLowerCase())}
                />
                <input
                  className="text-input text-input--sm"
                  placeholder="显示名，如 入门"
                  value={newStageLabel}
                  maxLength={24}
                  onChange={(e) => setNewStageLabel(e.target.value)}
                />
                <button type="button" className="btn btn-sm btn-primary" onClick={handleAddStage}>
                  新增阶段
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={saving}
                  onClick={() => {
                    setManagingStages(false);
                    if (hasUnsavedChanges) {
                      void handleSave();
                    }
                  }}
                >
                  {hasUnsavedChanges ? (saving ? '保存中...' : '完成并保存') : '完成'}
                </button>
              </div>
              <p className="hint-text">可新增自定义阶段（如入门/综合）。App 会按阶段 ID 写入 cfopStage；自定义 ID 需 App 同步识别。</p>
            </div>
          ) : (
            <div className="skill-filter-chips" id="skill-create">
              <button className={`chip ${filterStage === 'all' ? 'chip-active' : ''}`} onClick={() => setFilterStage('all')}>
                全部
              </button>
              {stages.map((stage) => (
                <button
                  key={stage.id}
                  className={`chip ${filterStage === stage.id ? 'chip-active' : ''}`}
                  onClick={() => setFilterStage(stage.id)}
                >
                  {stage.label}
                </button>
              ))}
              <button type="button" className="btn btn-sm skill-rename-stages-btn" onClick={() => setManagingStages(true)}>
                管理阶段
              </button>
              {!showCreate && (
                <button
                  type="button"
                  className="btn btn-sm btn-primary skill-create-chip-btn"
                  onClick={() => setShowCreate(true)}
                >
                  + 新建标签
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <div className="skill-create-panel">
          <div className="skill-create-panel-header">
            <strong>新建能力标签</strong>
            <span>一次填完核心字段，创建后会高亮定位到新卡片</span>
          </div>
          <div className="skill-create-form-grid">
            <label className="form-field">
              <span>阶段</span>
              <SelectDropdown
                size="sm"
                value={newSkillStage}
                options={stageOptions}
                onChange={(v) => setNewSkillStage(v)}
              />
            </label>
            <label className="form-field">
              <span>标签 ID（可选，创建后不可改）</span>
              <input
                className="text-input"
                placeholder="留空则自动生成"
                value={newSkillId}
                onChange={(e) => setNewSkillId(e.target.value)}
              />
            </label>
            <label className="form-field">
              <span>内部名称</span>
              <input
                className="text-input"
                placeholder="例如：双层转"
                value={newDisplayNameZh}
                onChange={(e) => setNewDisplayNameZh(e.target.value)}
              />
            </label>
            <label className="form-field">
              <span>英文内部名称</span>
              <input
                className="text-input"
                placeholder="例如：Double Turn"
                value={newDisplayNameEn}
                onChange={(e) => setNewDisplayNameEn(e.target.value)}
              />
            </label>
            <label className="form-field full-width">
              <span>能力定义</span>
              <textarea
                className="text-input"
                rows={2}
                placeholder="描述 AI 在判断什么能力"
                value={newGoal}
                onChange={(e) => setNewGoal(e.target.value)}
              />
            </label>
            <label className="form-field">
              <span>状态聚合规则</span>
              <SelectDropdown
                size="sm"
                value={newMasteryStandard}
                options={MASTERY_OPTIONS}
                onChange={(v) => setNewMasteryStandard(v as MasteryStandard)}
              />
            </label>
            <label className="form-field">
              <span>启用状态</span>
              <SelectDropdown
                size="sm"
                value={newDraft ? 'draft' : 'enabled'}
                options={[
                  { value: 'enabled', label: '启用（可进推荐）' },
                  { value: 'draft', label: '草稿' },
                ]}
                onChange={(v) => setNewDraft(v === 'draft')}
              />
            </label>
          </div>
          <div className="skill-create-panel-actions">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setShowCreate(false);
                resetCreateForm();
              }}
            >
              取消
            </button>
            <button type="button" className="btn btn-sm btn-primary" onClick={handleCreate}>
              创建标签
            </button>
          </div>
        </div>
      )}

      <div className="skill-list" id="skill-list" data-tour="skill-list">
        {filteredSkills.length === 0 ? (
          <div className="skill-empty-state"><p>该阶段暂无能力标签</p></div>
        ) : (
          filteredSkills.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              allSkills={skills}
              stageOptions={stageOptions}
              stageLabel={resolveStageLabel(stages, skill.stage)}
              referencedLevelIds={referencedBySkillId.get(skill.id) ?? []}
              levelTitleById={levelTitleById}
              isEditing={editingSkillId === skill.id}
              isAiTouched={aiTouchedSkillIds.includes(skill.id)}
              isJustCreated={justCreatedSkillId === skill.id}
              onEdit={() => setEditingSkillId(skill.id)}
              onClose={() => setEditingSkillId(null)}
              onUpdate={handleUpdateSkill}
              onDelete={() => handleDeleteSkill(skill.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface SkillCardProps {
  skill: SkillDefinition;
  allSkills: SkillDefinition[];
  stageOptions: { value: string; label: string }[];
  stageLabel: string;
  referencedLevelIds: string[];
  levelTitleById: Map<string, string>;
  isEditing: boolean;
  isAiTouched: boolean;
  isJustCreated: boolean;
  onEdit: () => void;
  onClose: () => void;
  onUpdate: (skillId: string, partial: Partial<SkillDefinition>) => void;
  onDelete: () => void;
}

function SkillCard({
  skill,
  allSkills,
  stageOptions,
  stageLabel,
  referencedLevelIds,
  levelTitleById,
  isEditing,
  isAiTouched,
  isJustCreated,
  onEdit,
  onClose,
  onUpdate,
  onDelete,
}: SkillCardProps) {
  const [displayNameZh, setDisplayNameZh] = useState(skill.displayNameZh);
  const [displayNameEn, setDisplayNameEn] = useState(skill.displayNameEn);
  const [goal, setGoal] = useState(skill.goal);
  const [masteryStandard, setMasteryStandard] = useState(skill.masteryStandard);
  const [stage, setStage] = useState(skill.stage);
  const [order, setOrder] = useState(String(skill.order));
  const [draft, setDraft] = useState(Boolean(skill.draft));
  const [prerequisites, setPrerequisites] = useState(skill.prerequisites.join(', '));

  useEffect(() => {
    if (!isEditing) return;
    setDisplayNameZh(skill.displayNameZh);
    setDisplayNameEn(skill.displayNameEn);
    setGoal(skill.goal);
    setMasteryStandard(skill.masteryStandard);
    setStage(skill.stage);
    setOrder(String(skill.order));
    setDraft(Boolean(skill.draft));
    setPrerequisites(skill.prerequisites.join(', '));
  }, [isEditing, skill]);

  const handleSave = () => {
    const orderNum = Number(order);
    onUpdate(skill.id, {
      displayNameZh,
      displayNameEn,
      goal,
      masteryStandard,
      stage,
      order: Number.isFinite(orderNum) ? orderNum : skill.order,
      draft,
      prerequisites: prerequisites
        .split(/[,，\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((id) => allSkills.some((s) => s.id === id)),
    });
    onClose();
  };

  return (
    <div
      data-skill-id={skill.id}
      className={`skill-card ${isEditing ? 'editing' : ''} ${isAiTouched ? 'ai-touched' : ''} ${isJustCreated ? 'just-created' : ''} ${skill.draft ? 'is-draft' : ''}`}
    >
      <div className="skill-card-top">
        <span className="skill-stage-badge">{stageLabel}</span>
        <span className="skill-card-name">{skill.displayNameZh}</span>
        {isJustCreated && <span className="skill-just-created-badge">刚创建</span>}
        {skill.draft && <span className="skill-draft-badge">草稿</span>}
        {isAiTouched && <span className="ai-touched-badge">AI</span>}
        <div className="skill-card-actions">
          {!isEditing && (
            <>
              <button className="btn btn-sm" onClick={onEdit}>编辑</button>
              <button className="btn btn-sm btn-danger" onClick={onDelete}>删除</button>
            </>
          )}
        </div>
      </div>

      {isEditing ? (
        <div className="skill-edit-form">
          <div className="form-field">
            <label>标签 ID（稳定，创建后不可改）</label>
            <input className="text-input" value={skill.id} disabled />
          </div>
          <div className="form-field">
            <label>Stage</label>
            <SelectDropdown size="sm" value={stage} options={stageOptions} onChange={(v) => setStage(v as SkillStage)} />
          </div>
          <div className="form-field">
            <label>内部名称</label>
            <input className="text-input" value={displayNameZh} onChange={(e) => setDisplayNameZh(e.target.value)} />
          </div>
          <div className="form-field">
            <label>英文内部名称</label>
            <input className="text-input" value={displayNameEn} onChange={(e) => setDisplayNameEn(e.target.value)} />
          </div>
          <div className="form-field full-width">
            <label>能力定义</label>
            <textarea className="text-input" value={goal} onChange={(e) => setGoal(e.target.value)} rows={2} />
          </div>
          <div className="form-field">
            <label>状态聚合规则</label>
            <SelectDropdown
              size="sm"
              value={masteryStandard}
              options={MASTERY_OPTIONS}
              onChange={(v) => setMasteryStandard(v as MasteryStandard)}
            />
          </div>
          <div className="form-field full-width">
            <label>前置能力标签（逗号分隔 id）</label>
            <input className="text-input" value={prerequisites} onChange={(e) => setPrerequisites(e.target.value)} />
          </div>
          <div className="form-field">
            <label>筛选顺序</label>
            <input className="text-input" value={order} onChange={(e) => setOrder(e.target.value.replace(/[^0-9]/g, ''))} />
          </div>
          <div className="form-field">
            <label>启用状态</label>
            <SelectDropdown
              size="sm"
              value={draft ? 'draft' : 'enabled'}
              options={[
                { value: 'enabled', label: '启用（可进入推荐）' },
                { value: 'draft', label: '草稿（不得进入推荐）' },
              ]}
              onChange={(v) => setDraft(v === 'draft')}
            />
          </div>
          <div className="skill-form-actions">
            <button className="btn btn-sm" onClick={onClose}>取消</button>
            <button className="btn btn-sm btn-primary" onClick={handleSave}>应用修改</button>
          </div>
        </div>
      ) : (
        <div className="skill-card-meta">
          <div className="skill-meta-item"><span className="meta-label">ID:</span><span className="meta-value">{skill.id}</span></div>
          <div className="skill-meta-item"><span className="meta-label">EN:</span><span className="meta-value">{skill.displayNameEn}</span></div>
          <div className="skill-meta-item"><span className="meta-label">聚合:</span><span className="meta-value">{skill.masteryStandard.replace(/_/g, ' ')}</span></div>
          <div className="skill-meta-item"><span className="meta-label">顺序:</span><span className="meta-value">{skill.order}</span></div>
          <div className="skill-meta-item full-width"><span className="meta-label">定义:</span><span className="meta-value">{skill.goal}</span></div>
          <div className="skill-meta-item full-width">
            <span className="meta-label">前置:</span>
            <span className="meta-value">{skill.prerequisites.length ? skill.prerequisites.join(', ') : '无'}</span>
          </div>
          <div className="skill-meta-item full-width">
            <span className="meta-label">引用关卡:</span>
            <span className="meta-value">
              {referencedLevelIds.length === 0
                ? '0'
                : `${referencedLevelIds.length} · ${referencedLevelIds
                    .slice(0, 4)
                    .map((id) => levelTitleById.get(id) ?? id)
                    .join('、')}${referencedLevelIds.length > 4 ? '…' : ''}`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
