import { useCallback, useEffect, useState } from 'react';
import { useSkillGraphStore } from '@/shared/store/useSkillGraphStore';
import type { SkillDefinition, SkillStage } from '@/core/skill-graph/types';
import '../../../src/styles/skill-graph-panel.css';

const SKILL_STAGES: SkillStage[] = ['cross', 'f2l', 'oll', 'pll', 'full'];
const STAGE_LABELS: Record<SkillStage, string> = {
  cross: '白十字',
  f2l: '两层',
  oll: '最后层定向',
  pll: '最后层排列',
  full: '进阶',
};

export function SkillGraphPanel() {
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
  const [filterStage, setFilterStage] = useState<SkillStage | 'all'>('all');
  const [newSkillStage, setNewSkillStage] = useState<SkillStage>('cross');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const skills = useSkillGraphStore((state) => state.skills);
  const hasUnsavedChanges = useSkillGraphStore((state) => state.hasUnsavedChanges);
  const skillGraph = useSkillGraphStore((state) => state.skillGraph);
  const updateSkill = useSkillGraphStore((state) => state.updateSkill);
  const deleteSkill = useSkillGraphStore((state) => state.deleteSkill);
  const createSkill = useSkillGraphStore((state) => state.createSkill);
  const exportToDisk = useSkillGraphStore((state) => state.exportToDisk);
  const saveSkillGraph = useSkillGraphStore((state) => state.saveSkillGraph);

  const filteredSkills =
    filterStage === 'all' ? skills : skills.filter((skill) => skill.stage === filterStage);

  const handleExport = async () => {
    try {
      setError(null);
      const filePath = await exportToDisk();
      if (!filePath) {
        setError('导出已取消');
      } else {
        setError('✓ 导出成功');
      }
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
      setError('✓ 已创建新技能，请点击编辑');
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
    }
  };

  const handleDeleteSkill = (skillId: string) => {
    try {
      setError(null);
      deleteSkill(skillId);
      setError('✓ 已删除技能');
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
          <h2>正在加载技能编辑器...</h2>
          <p>系统正在加载默认技能模版，请稍候</p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel skill-graph-panel">
      <div className="skill-header">
        <div className="skill-header-title">
          <h2>技能编辑</h2>
          <span className="skill-count">{skills.length} 个技能</span>
        </div>
        <div className="skill-header-actions" id="skill-export">
          <button className="btn btn-sm btn-text" onClick={() => setShowGuide(true)}>
            ? 指引
          </button>
          <button className="btn btn-sm" onClick={handleExport}>
            导出 JSON
          </button>
          {hasUnsavedChanges && (
            <button className="btn btn-sm btn-primary" onClick={() => void handleSave()} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </button>
          )}
        </div>
      </div>

      {showGuide && (
        <SkillGuideDialog onClose={() => setShowGuide(false)} skillCount={skills.length} />
      )}

      {error && (
        <div className={`banner ${error.startsWith('✓') ? 'banner-ok' : 'banner-error'}`}>
          {error}
        </div>
      )}

      <div className="skill-toolbar">
        <div className="toolbar-item" id="skill-filter">
          <label>按阶段筛选:</label>
          <select value={filterStage} onChange={(e) => setFilterStage(e.target.value as SkillStage | 'all')}>
            <option value="all">全部</option>
            {SKILL_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {STAGE_LABELS[stage]}
              </option>
            ))}
          </select>
        </div>

        <div className="toolbar-item create-item" id="skill-create">
          <label>新建技能:</label>
          <div className="create-row">
            <select value={newSkillStage} onChange={(e) => setNewSkillStage(e.target.value as SkillStage)}>
              {SKILL_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {STAGE_LABELS[stage]}
                </option>
              ))}
            </select>
            <button className="btn btn-sm btn-primary" onClick={handleCreate}>
              + 创建
            </button>
          </div>
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
    onUpdate(skill.id, {
      displayNameZh,
      displayNameEn,
      goal,
      masteryStandard,
    });
    onClose();
  };

  if (isEditing) {
    return (
      <div className="skill-card editing">
        <div className="card-form">
          <div className="form-field">
            <label>中文名称</label>
            <input
              type="text"
              value={displayNameZh}
              onChange={(e) => setDisplayNameZh(e.target.value)}
              className="text-input"
              placeholder="如：白十字·单面转动"
            />
          </div>

          <div className="form-field">
            <label>英文名称</label>
            <input
              type="text"
              value={displayNameEn}
              onChange={(e) => setDisplayNameEn(e.target.value)}
              className="text-input"
              placeholder="如：White Cross: Single Face Turn"
            />
          </div>

          <div className="form-field">
            <label>学习目标</label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="text-input"
              placeholder="用一句话描述技能目标"
              rows={2}
            />
          </div>

          <div className="form-field">
            <label>掌握标准</label>
            <select value={masteryStandard} onChange={(e) => setMasteryStandard(e.target.value as any)}>
              <option value="guided_only">仅需引导通过</option>
              <option value="guided_and_one_star">引导 + 一星</option>
              <option value="two_stars">两星</option>
            </select>
          </div>

          <div className="form-actions">
            <button className="btn btn-sm btn-primary" onClick={handleSave}>
              保存
            </button>
            <button className="btn btn-sm" onClick={onClose}>
              取消
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="skill-card">
      <div className="card-header">
        <div className="card-badge">{skill.stage.toUpperCase()}</div>
        <div className="card-title">{skill.displayNameZh}</div>
      </div>

      <div className="card-body">
        <div className="skill-info">
          <div className="info-row">
            <span className="label">英文:</span>
            <span className="value">{skill.displayNameEn}</span>
          </div>
          <div className="info-row">
            <span className="label">目标:</span>
            <span className="value">{skill.goal}</span>
          </div>
          <div className="info-row">
            <span className="label">前置:</span>
            <span className="value">{skill.prerequisites.length > 0 ? skill.prerequisites.join(', ') : '无'}</span>
          </div>
          <div className="info-row">
            <span className="label">标准:</span>
            <span className="value">{skill.masteryStandard}</span>
          </div>
        </div>
      </div>

      <div className="card-actions">
        <button className="btn btn-sm" onClick={onEdit}>
          编辑
        </button>
        <button className="btn btn-sm btn-danger" onClick={onDelete}>
          删除
        </button>
      </div>
    </div>
  );
}

interface GuideDialogProps {
  onClose: () => void;
  skillCount: number;
}

function SkillGuideDialog({ onClose, skillCount }: GuideDialogProps) {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: '👋 欢迎使用技能编辑器',
      content: `系统已加载 ${skillCount} 个技能模版。我会用 4 个步骤教你如何使用。`,
      action: '开始',
      highlight: null,
    },
    {
      title: '1️⃣ 按阶段筛选技能',
      content: '👆 点击上面的"按阶段筛选"下拉框\n\n你可以查看不同阶段的技能：\n• 全部\n• 白十字\n• 两层\n• 最后层定向\n• 最后层排列\n• 进阶',
      action: '我看到了',
      highlight: 'skill-filter',
    },
    {
      title: '2️⃣ 创建新技能',
      content: '👆 看到工具栏右侧的"新建技能"了吗？\n\n1. 选择所属阶段\n2. 点击"+ 创建"按钮\n3. 系统会创建新技能卡片',
      action: '我看到了',
      highlight: 'skill-create',
    },
    {
      title: '3️⃣ 编辑技能信息',
      content: '👆 在任何技能卡片上点击"编辑"\n\n可以修改：\n• 中文名称\n• 英文名称  \n• 学习目标\n• 掌握标准\n\n完成后点"保存"',
      action: '我看到了',
      highlight: 'skill-list',
    },
    {
      title: '4️⃣ 导出技能到App',
      content: '👆 点击右上角的"导出 JSON"\n\n这会生成 skill_graph_cfop.json 文件\n\n把这个文件覆盖到 App 项目的：\ndata/skills/skill_graph_cfop.json',
      action: '完成了',
      highlight: 'skill-export',
    },
  ];

  const currentStep = steps[step];

  return (
    <>
      <div className="guide-overlay" onClick={onClose} />
      {currentStep.highlight && (
        <style>{`
          #${currentStep.highlight} {
            box-shadow: inset 0 0 0 3px #3b82f6, 0 0 0 3px rgba(59, 130, 246, 0.3);
            animation: pulse-highlight 2s infinite;
          }
          @keyframes pulse-highlight {
            0%, 100% { box-shadow: inset 0 0 0 3px #3b82f6, 0 0 0 3px rgba(59, 130, 246, 0.3); }
            50% { box-shadow: inset 0 0 0 3px #3b82f6, 0 0 0 6px rgba(59, 130, 246, 0.2); }
          }
        `}</style>
      )}
      <div className="guide-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="guide-header">
          <h2>{currentStep.title}</h2>
          <button className="guide-close" onClick={onClose}>✕</button>
        </div>

        <div className="guide-content">
          {currentStep.content.split('\n').map((line, i) => (
            <p key={i}>{line || <br />}</p>
          ))}
        </div>

        <div className="guide-footer">
          <div className="guide-progress">
            {steps.map((_, i) => (
              <div key={i} className={`progress-dot ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`} />
            ))}
          </div>

          <div className="guide-buttons">
            {step > 0 && (
              <button className="btn btn-sm" onClick={() => setStep(step - 1)}>
                上一步
              </button>
            )}
            <button
              className="btn btn-sm btn-primary"
              onClick={() => {
                if (step < steps.length - 1) {
                  setStep(step + 1);
                } else {
                  onClose();
                }
              }}
            >
              {currentStep.action}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
