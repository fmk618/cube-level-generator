import { useEffect, useMemo, useState } from 'react';
import { useSkillGraphStore } from '@/shared/store/useSkillGraphStore';
import { useLevelSkillMapStore } from '@/shared/store/useLevelSkillMapStore';
import { useCatalogStore } from '@/shared/store/useCatalogStore';
import { useUiStore } from '@/shared/store/useUiStore';
import { SelectDropdown } from '@/shared/ui/SelectDropdown';
import type { MasteryStandard, SkillDefinition, SkillStage } from '@/core/skill-graph/types';
import '../../styles/skill-graph-panel.css';

const SKILL_STAGES: SkillStage[] = ['cross', 'f2l', 'oll', 'pll', 'full'];
const STAGE_LABELS: Record<SkillStage, string> = {
  cross: '白十字',
  f2l: '两层',
  oll: 'OLL',
  pll: 'PLL',
  full: '进阶',
};
const STAGE_OPTIONS = SKILL_STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] }));
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
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const skills = useSkillGraphStore((state) => state.skills);
  const hasUnsavedChanges = useSkillGraphStore((state) => state.hasUnsavedChanges);
  const skillGraph = useSkillGraphStore((state) => state.skillGraph);
  const loadError = useSkillGraphStore((state) => state.loadError);
  const isLoading = useSkillGraphStore((state) => state.isLoading);
  const refreshSkillGraph = useSkillGraphStore((state) => state.refreshSkillGraph);
  const updateSkill = useSkillGraphStore((state) => state.updateSkill);
  const deleteSkill = useSkillGraphStore((state) => state.deleteSkill);
  const createSkill = useSkillGraphStore((state) => state.createSkill);
  const exportToDisk = useSkillGraphStore((state) => state.exportToDisk);
  const saveSkillGraph = useSkillGraphStore((state) => state.saveSkillGraph);
  const resetToDefault = useSkillGraphStore((state) => state.resetToDefault);
  const aiTouchedSkillIds = useUiStore((state) => state.aiTouchedSkillIds);
  const clearAiTouched = useUiStore((state) => state.clearAiTouched);
  const levelSkillMap = useLevelSkillMapStore((state) => state.levelSkillMap);
  const levels = useCatalogStore((state) => state.levels);

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

  const handleSave = async () => {
    setSaving(true);
    try {
      setError(null);
      await saveSkillGraph();
      clearAiTouched();
      setError('✓ 已保存并同步到云端');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = () => {
    try {
      setError(null);
      const maxOrder =
        Math.max(0, ...skills.filter((s) => s.stage === newSkillStage).map((s) => s.order)) + 1;
      createSkill({
        id: newSkillId.trim() || undefined,
        stage: newSkillStage,
        displayNameZh: '新能力标签（待编辑）',
        displayNameEn: 'New Capability Tag',
        goal: '请描述 AI 在判断什么能力',
        prerequisites: [],
        masteryStandard: 'guided_and_one_star',
        order: maxOrder,
        draft: true,
      });
      setShowCreate(false);
      setNewSkillId('');
      setError('✓ 已创建（草稿），请完善字段后启用');
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
                <button className="btn btn-sm" onClick={() => void resetToDefault()}>恢复默认</button>
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
          <button className="btn btn-sm" onClick={() => void handleExport()}>导出</button>
          {hasUnsavedChanges && (
            <button className="btn btn-sm btn-primary" onClick={() => void handleSave()} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </button>
          )}
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

      <div className="skill-toolbar" id="skill-filter" data-tour="skill-editor">
        <div className="skill-filter-chips">
          <button className={`chip ${filterStage === 'all' ? 'chip-active' : ''}`} onClick={() => setFilterStage('all')}>全部</button>
          {SKILL_STAGES.map((stage) => (
            <button
              key={stage}
              className={`chip ${filterStage === stage ? 'chip-active' : ''}`}
              onClick={() => setFilterStage(stage)}
            >
              {STAGE_LABELS[stage]}
            </button>
          ))}
        </div>

        <div className="skill-create-inline" id="skill-create">
          {showCreate ? (
            <>
              <SelectDropdown
                size="sm"
                className="skill-create-select"
                value={newSkillStage}
                options={STAGE_OPTIONS}
                onChange={(v) => setNewSkillStage(v as SkillStage)}
              />
              <input
                className="text-input skill-create-id"
                placeholder="标签 ID（可选）"
                value={newSkillId}
                onChange={(e) => setNewSkillId(e.target.value)}
              />
              <button className="btn btn-sm btn-primary" onClick={handleCreate}>创建</button>
              <button className="btn btn-sm" onClick={() => setShowCreate(false)}>取消</button>
            </>
          ) : (
            <button className="btn btn-sm" onClick={() => setShowCreate(true)}>+ 新建标签</button>
          )}
        </div>
      </div>

      <div className="skill-list" id="skill-list" data-tour="skill-list">
        {filteredSkills.length === 0 ? (
          <div className="skill-empty-state"><p>该阶段暂无能力标签</p></div>
        ) : (
          filteredSkills.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              allSkills={skills}
              referencedLevelIds={referencedBySkillId.get(skill.id) ?? []}
              levelTitleById={levelTitleById}
              isEditing={editingSkillId === skill.id}
              isAiTouched={aiTouchedSkillIds.includes(skill.id)}
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
  referencedLevelIds: string[];
  levelTitleById: Map<string, string>;
  isEditing: boolean;
  isAiTouched: boolean;
  onEdit: () => void;
  onClose: () => void;
  onUpdate: (skillId: string, partial: Partial<SkillDefinition>) => void;
  onDelete: () => void;
}

function SkillCard({
  skill,
  allSkills,
  referencedLevelIds,
  levelTitleById,
  isEditing,
  isAiTouched,
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
      className={`skill-card ${isEditing ? 'editing' : ''} ${isAiTouched ? 'ai-touched' : ''} ${skill.draft ? 'is-draft' : ''}`}
    >
      <div className="skill-card-top">
        <span className="skill-stage-badge">{skill.stage}</span>
        <span className="skill-card-name">{skill.displayNameZh}</span>
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
            <SelectDropdown size="sm" value={stage} options={STAGE_OPTIONS} onChange={(v) => setStage(v as SkillStage)} />
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
            <button className="btn btn-sm btn-primary" onClick={handleSave}>保存</button>
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
