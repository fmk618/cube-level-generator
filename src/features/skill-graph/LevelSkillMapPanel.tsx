import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCatalogStore } from '@/shared/store/useCatalogStore';
import { useSkillGraphStore } from '@/shared/store/useSkillGraphStore';
import { useLevelSkillMapStore } from '@/shared/store/useLevelSkillMapStore';
import type { LevelSkillMapEntry, SkillStage, LevelSkillMap } from '@/core/skill-graph/types';
import '../../../src/styles/level-skill-map-panel.css';

const TEACH_MODES = ['guided', 'challenge', 'demo'] as const;
const SKILL_STAGES: SkillStage[] = ['cross', 'f2l', 'oll', 'pll', 'full'];

export function LevelSkillMapPanel() {
  const [error, setError] = useState<string | null>(null);
  const [filterChapter, setFilterChapter] = useState<string | 'all'>('all');
  const [selectedLevelIds, setSelectedLevelIds] = useState<Set<string>>(new Set());
  const [quickAssignSkillId, setQuickAssignSkillId] = useState<string>('');
  const [showGuide, setShowGuide] = useState(false);

  const levels = useCatalogStore((state) => state.levels);
  const chapters = useCatalogStore((state) => state.chapters);
  const skills = useSkillGraphStore((state) => state.skills);
  const levelSkillMap = useLevelSkillMapStore((state) => state.levelSkillMap);
  const updateLevelSkillEntry = useLevelSkillMapStore((state) => state.updateLevelSkillEntry);
  const deleteLevelSkillEntry = useLevelSkillMapStore((state) => state.deleteLevelSkillEntry);
  const getLevelSkillEntry = useLevelSkillMapStore((state) => state.getLevelSkillEntry);
  const exportToDisk = useLevelSkillMapStore((state) => state.exportToDisk);
  const hasUnsavedChanges = useLevelSkillMapStore((state) => state.hasUnsavedChanges);
  const saveMap = useLevelSkillMapStore((state) => state.saveMap);

  const filteredLevels = useMemo(() => {
    if (filterChapter === 'all') return levels;
    return levels.filter((level) => level.chapterId === filterChapter);
  }, [levels, filterChapter]);

  const mappedCount = useMemo(() => {
    return levelSkillMap ? Object.keys(levelSkillMap.mappings).length : 0;
  }, [levelSkillMap]);

  // 初始化空映射
  useEffect(() => {
    if (!levelSkillMap && levels.length > 0) {
      const emptyMap: LevelSkillMap = {
        version: 1,
        mappings: {},
      };
      useLevelSkillMapStore.setState({
        levelSkillMap: emptyMap,
        savedLevelSkillMap: emptyMap,
        isLoaded: true,
      });
    }
  }, [levelSkillMap, levels.length]);

  const handleExport = async () => {
    try {
      setError(null);
      const filePath = await exportToDisk();
      if (!filePath) {
        setError('Export cancelled');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const handleSave = async () => {
    try {
      setError(null);
      await saveMap();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const handleUpdateEntry = (levelId: string, entry: Partial<LevelSkillMapEntry>) => {
    const current = getLevelSkillEntry(levelId);
    if (!current && !entry.skillId) {
      setError('Skill ID is required');
      return;
    }

    const skillId = entry.skillId || current?.skillId || '';
    const skill = skills.find((s) => s.id === skillId);
    if (!skill) {
      setError(`Skill "${skillId}" not found in graph`);
      return;
    }

    const nextEntry: LevelSkillMapEntry = {
      skillId,
      cfopStage: entry.cfopStage || current?.cfopStage || skill.stage,
      teachMode: entry.teachMode || current?.teachMode || 'guided',
      formulaDifficulty: entry.formulaDifficulty ?? current?.formulaDifficulty ?? 1,
    };

    updateLevelSkillEntry(levelId, nextEntry);
    setError(null);
  };

  const handleQuickAssign = () => {
    if (!quickAssignSkillId) {
      setError('Please select a skill');
      return;
    }

    if (selectedLevelIds.size === 0) {
      setError('Please select at least one level');
      return;
    }

    const skill = skills.find((s) => s.id === quickAssignSkillId);
    if (!skill) {
      setError(`Skill "${quickAssignSkillId}" not found`);
      return;
    }

    let count = 0;
    selectedLevelIds.forEach((levelId) => {
      handleUpdateEntry(levelId, {
        skillId: skill.id,
        cfopStage: skill.stage,
      });
      count++;
    });

    setSelectedLevelIds(new Set());
    setQuickAssignSkillId('');
    setError(`✓ 已为 ${count} 个关卡分配 skill`);
  };

  if (!levelSkillMap) {
    return (
      <div className="panel level-skill-map-panel">
        <div className="panel-empty">
          <p>未加载 Level-Skill 映射</p>
          <p className="text-small">请先在关卡编辑模式加载关卡</p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel level-skill-map-panel">
      {showGuide && (
        <MapGuideDialog onClose={() => setShowGuide(false)} mappedCount={mappedCount} totalCount={levels.length} />
      )}

      <div className="map-header">
        <h2>关卡-Skill 映射</h2>
        <div className="map-progress">
          {mappedCount} / {levels.length} 已分配
        </div>
        <div className="map-actions" id="map-export">
          <button className="btn btn-sm btn-text" onClick={() => setShowGuide(true)}>
            ? 指引
          </button>
          <button className="btn btn-sm" onClick={handleExport}>
            导出
          </button>
          {hasUnsavedChanges && (
            <button className="btn btn-sm btn-primary" onClick={() => void handleSave()}>
              保存
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className={`banner ${error.startsWith('✓') ? 'banner-ok' : 'banner-error'}`}>
          {error}
        </div>
      )}

      <div className="map-toolbar">
        <div className="toolbar-group" id="map-filter">
          <label className="toolbar-label">筛选章节:</label>
          <select value={filterChapter} onChange={(e) => setFilterChapter(e.target.value)} className="toolbar-select">
            <option value="all">全部</option>
            {chapters.map((chapter) => (
              <option key={chapter.id} value={chapter.id}>
                {chapter.partName}: {chapter.title}
              </option>
            ))}
          </select>
        </div>

        <div className="toolbar-group quick-assign-group" id="map-toolbar">
          <label className="toolbar-label">快速分配:</label>
          <div className="quick-assign-row">
            <select
              value={quickAssignSkillId}
              onChange={(e) => setQuickAssignSkillId(e.target.value)}
              className="toolbar-select"
            >
              <option value="">选择 Skill...</option>
              {skills.map((skill) => (
                <option key={skill.id} value={skill.id}>
                  {skill.displayNameZh}
                </option>
              ))}
            </select>
            <button
              className="btn btn-sm btn-primary"
              onClick={handleQuickAssign}
              disabled={selectedLevelIds.size === 0}
            >
              分配给 {selectedLevelIds.size} 个
            </button>
          </div>
        </div>
      </div>

      <div className="map-list">
        {filteredLevels.length === 0 ? (
          <p className="empty-state">该章节无关卡</p>
        ) : (
          <div className="level-cards">
            {filteredLevels.map((level) => {
              const entry = getLevelSkillEntry(level.id);
              const isSelected = selectedLevelIds.has(level.id);
              const skill = entry ? skills.find((s) => s.id === entry.skillId) : null;

              return (
                <div
                  key={level.id}
                  className={`level-card ${isSelected ? 'selected' : ''} ${entry ? 'mapped' : 'unmapped'}`}
                >
                  <div className="card-header">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        const next = new Set(selectedLevelIds);
                        if (e.target.checked) {
                          next.add(level.id);
                        } else {
                          next.delete(level.id);
                        }
                        setSelectedLevelIds(next);
                      }}
                      className="card-checkbox"
                    />
                    <div className="card-title">
                      <span className="card-order">{level.order}</span>
                      <span className="card-name">{level.title}</span>
                    </div>
                  </div>

                  {entry ? (
                    <div className="card-content">
                      <div className="card-field">
                        <label>Skill:</label>
                        <select
                          value={entry.skillId}
                          onChange={(e) => handleUpdateEntry(level.id, { skillId: e.target.value })}
                          className="text-input small"
                        >
                          {skills.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.displayNameZh}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="card-row">
                        <div className="card-field">
                          <label>教学模式:</label>
                          <select
                            value={entry.teachMode}
                            onChange={(e) => handleUpdateEntry(level.id, { teachMode: e.target.value as any })}
                            className="text-input small"
                          >
                            {TEACH_MODES.map((mode) => (
                              <option key={mode} value={mode}>
                                {mode}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="card-field">
                          <label>难度 (1-6):</label>
                          <input
                            type="number"
                            min="1"
                            max="6"
                            value={entry.formulaDifficulty}
                            onChange={(e) =>
                              handleUpdateEntry(level.id, { formulaDifficulty: parseInt(e.target.value) as any })
                            }
                            className="text-input small"
                          />
                        </div>
                      </div>

                      {skill && (
                        <div className="card-badge">
                          <span className="badge-stage">{entry.cfopStage.toUpperCase()}</span>
                          <span className="badge-skill">{skill.displayNameZh}</span>
                        </div>
                      )}

                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => deleteLevelSkillEntry(level.id)}
                      >
                        清除映射
                      </button>
                    </div>
                  ) : (
                    <div className="card-empty">
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            handleUpdateEntry(level.id, { skillId: e.target.value });
                          }
                        }}
                        defaultValue=""
                        className="text-input"
                      >
                        <option value="">点击选择 Skill...</option>
                        {skills.map((skill) => (
                          <option key={skill.id} value={skill.id}>
                            {skill.displayNameZh}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

interface MapGuideDialogProps {
  onClose: () => void;
  mappedCount: number;
  totalCount: number;
}

function MapGuideDialog({ onClose, mappedCount, totalCount }: MapGuideDialogProps) {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: '👋 欢迎使用关卡映射编辑器',
      content: `已加载 ${totalCount} 个关卡，其中 ${mappedCount} 个已分配技能。我会用 4 个步骤教你如何使用。`,
      action: '开始',
      highlight: null,
    },
    {
      title: '1️⃣ 选择章节',
      content: '👆 看到上面的"筛选章节"下拉框了吗？\n\n点击它可以：\n• 查看某个章节的关卡\n• 一次性处理一个章节的映射\n\n这样能聚焦注意力，不会很混乱',
      action: '我看到了',
      highlight: 'map-filter',
    },
    {
      title: '2️⃣ 逐个分配技能',
      content: '👆 看到下面的关卡卡片了吗？\n\n灰色卡片 = 未分配\n白色卡片 = 已分配\n\n点击灰色卡片的下拉框选择技能，它会自动添加映射。已分配的卡片可以随时修改。',
      action: '我看到了',
      highlight: 'map-list',
    },
    {
      title: '3️⃣ 快速批量分配（推荐）⚡',
      content: '👆 对于多个相同的关卡：\n\n1. 在卡片左上打勾选中多个\n2. 在工具栏选择技能\n3. 点"分配给 N 个关卡"\n\n效率高 10 倍！',
      action: '我看到了',
      highlight: 'map-toolbar',
    },
    {
      title: '4️⃣ 导出文件到 App',
      content: '👆 点击右上角的"导出"按钮\n\n这会生成 level_skill_map.json\n\n覆盖到 App 的：\ndata/skills/level_skill_map.json',
      action: '完成了',
      highlight: 'map-export',
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
