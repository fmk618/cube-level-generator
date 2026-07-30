import { useEffect, useState } from 'react';
import { useSkillGraphStore } from '@/shared/store/useSkillGraphStore';
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
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

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

  useEffect(() => {
    if (!skillGraph && !isLoading && !loadError) {
      void refreshSkillGraph();
    }
  }, [skillGraph, isLoading, loadError, refreshSkillGraph]);

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
      setError('✓ 保存成功');
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
        stage: newSkillStage,
        displayNameZh: '新技能（待编辑）',
        displayNameEn: 'New Skill',
        goal: '请编辑技能目标描述',
        prerequisites: [],
        masteryStandard: 'guided_and_one_star',
        order: maxOrder,
      });
      setShowCreate(false);
      setError('✓ 已创建，请点击编辑');
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
    }
  };

  const handleDeleteSkill = (skillId: string) => {
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
              <h2>技能模版加载失败</h2>
              <p>{loadError}</p>
              <button className="btn btn-sm btn-primary" onClick={() => void refreshSkillGraph()}>
                重试
              </button>
            </>
          ) : (
            <>
              <h2>正在加载技能编辑器...</h2>
              <p>系统正在加载默认技能模版，请稍候</p>
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
          <h2>技能编辑</h2>
          <span className="skill-badge">{skills.length} 个技能</span>
        </div>
        <div className="skill-header-actions" id="skill-export">
          <button className="btn btn-sm btn-text" onClick={() => setShowGuide(true)}>指引</button>
          <button className="btn btn-sm" onClick={() => void handleExport()}>导出</button>
          {hasUnsavedChanges && (
            <button className="btn btn-sm btn-primary" onClick={() => void handleSave()} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className={`banner ${error.startsWith('✓') ? 'banner-ok' : 'banner-error'}`}>{error}</div>
      )}

      {showGuide && <SkillGuideDialog onClose={() => setShowGuide(false)} skillCount={skills.length} />}

      <div className="skill-toolbar" id="skill-filter">
        <div className="skill-filter-chips">
          <button
            className={`chip ${filterStage === 'all' ? 'chip-active' : ''}`}
            onClick={() => setFilterStage('all')}
          >全部</button>
          {SKILL_STAGES.map((stage) => (
            <button
              key={stage}
              className={`chip ${filterStage === stage ? 'chip-active' : ''}`}
              onClick={() => setFilterStage(stage)}
            >{STAGE_LABELS[stage]}</button>
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
              <button className="btn btn-sm btn-primary" onClick={handleCreate}>创建</button>
              <button className="btn btn-sm" onClick={() => setShowCreate(false)}>取消</button>
            </>
          ) : (
            <button className="btn btn-sm" onClick={() => setShowCreate(true)}>+ 新建</button>
          )}
        </div>
      </div>

      <div className="skill-list" id="skill-list">
        {filteredSkills.length === 0 ? (
          <div className="skill-empty-state">
            <p>该阶段暂无技能</p>
          </div>
        ) : (
          filteredSkills.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              isEditing={editingSkillId === skill.id}
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
  isEditing: boolean;
  onEdit: () => void;
  onClose: () => void;
  onUpdate: (skillId: string, partial: Partial<SkillDefinition>) => void;
  onDelete: () => void;
}

function SkillCard({ skill, isEditing, onEdit, onClose, onUpdate, onDelete }: SkillCardProps) {
  const [displayNameZh, setDisplayNameZh] = useState(skill.displayNameZh);
  const [displayNameEn, setDisplayNameEn] = useState(skill.displayNameEn);
  const [goal, setGoal] = useState(skill.goal);
  const [masteryStandard, setMasteryStandard] = useState(skill.masteryStandard);

  const handleSave = () => {
    onUpdate(skill.id, { displayNameZh, displayNameEn, goal, masteryStandard });
    onClose();
  };

  return (
    <div className={`skill-card ${isEditing ? 'editing' : ''}`}>
      <div className="skill-card-top">
        <span className="skill-stage-badge">{skill.stage}</span>
        <span className="skill-card-name">{skill.displayNameZh}</span>
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
            <label>中文名称</label>
            <input className="text-input" value={displayNameZh} onChange={(e) => setDisplayNameZh(e.target.value)} placeholder="白十字·单面转动" />
          </div>
          <div className="form-field">
            <label>英文名称</label>
            <input className="text-input" value={displayNameEn} onChange={(e) => setDisplayNameEn(e.target.value)} placeholder="White Cross: Single Face" />
          </div>
          <div className="form-field full-width">
            <label>学习目标</label>
            <textarea className="text-input" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="描述技能目标" rows={2} />
          </div>
          <div className="form-field">
            <label>掌握标准</label>
            <SelectDropdown
              size="sm"
              value={masteryStandard}
              options={MASTERY_OPTIONS}
              onChange={(v) => setMasteryStandard(v as MasteryStandard)}
            />
          </div>
          <div className="skill-form-actions">
            <button className="btn btn-sm" onClick={onClose}>取消</button>
            <button className="btn btn-sm btn-primary" onClick={handleSave}>保存</button>
          </div>
        </div>
      ) : (
        <div className="skill-card-meta">
          <div className="skill-meta-item">
            <span className="meta-label">EN:</span>
            <span className="meta-value">{skill.displayNameEn}</span>
          </div>
          <div className="skill-meta-item">
            <span className="meta-label">标准:</span>
            <span className="meta-value">{skill.masteryStandard.replace(/_/g, ' ')}</span>
          </div>
          <div className="skill-meta-item full-width">
            <span className="meta-label">目标:</span>
            <span className="meta-value">{skill.goal}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function SkillGuideDialog({ onClose, skillCount }: { onClose: () => void; skillCount: number }) {
  const [step, setStep] = useState(0);
  const steps = [
    { title: '欢迎使用技能编辑器', content: `已加载 ${skillCount} 个技能模版。`, action: '开始', highlight: null },
    { title: '按阶段筛选', content: '使用工具栏的 chip 按钮筛选不同 CFOP 阶段的技能。', action: '下一步', highlight: 'skill-filter' },
    { title: '创建新技能', content: '点击 "+ 新建" 按钮，选择阶段后创建。', action: '下一步', highlight: 'skill-create' },
    { title: '编辑与导出', content: '在技能卡片上点击"编辑"修改信息，完成后点右上角"导出"生成 JSON。', action: '完成', highlight: 'skill-export' },
  ];
  const cur = steps[step];

  return (
    <>
      <div className="guide-overlay" onClick={onClose} />
      {cur.highlight && (
        <style>{`#${cur.highlight}{outline:3px solid #3b82f6;outline-offset:3px;border-radius:8px;animation:pulse-hl 2s infinite}@keyframes pulse-hl{0%,100%{outline-offset:3px}50%{outline-offset:5px}}`}</style>
      )}
      <div className="guide-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="guide-header">
          <h2>{cur.title}</h2>
          <button className="guide-close" onClick={onClose}>✕</button>
        </div>
        <div className="guide-content"><p>{cur.content}</p></div>
        <div className="guide-footer">
          <div className="guide-progress">
            {steps.map((_, i) => <div key={i} className={`progress-dot ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`} />)}
          </div>
          <div className="guide-buttons">
            {step > 0 && <button className="btn btn-sm" onClick={() => setStep(step - 1)}>上一步</button>}
            <button className="btn btn-sm btn-primary" onClick={() => step < steps.length - 1 ? setStep(step + 1) : onClose()}>{cur.action}</button>
          </div>
        </div>
      </div>
    </>
  );
}
