import { useEffect, useMemo, useState } from 'react';
import { useCatalogStore } from '@/shared/store/useCatalogStore';
import { useSkillGraphStore } from '@/shared/store/useSkillGraphStore';
import { useLevelSkillMapStore } from '@/shared/store/useLevelSkillMapStore';
import { SelectDropdown } from '@/shared/ui/SelectDropdown';
import type {
  LevelSkillBinding,
  LevelSkillMap,
  TeachMode,
} from '@/core/skill-graph/types';
import { LEVEL_SKILL_MAP_VERSION } from '@/core/skill-graph/types';
import '../../styles/level-skill-map-panel.css';

const TEACH_MODES = [
  { value: 'guided', label: '引导' },
  { value: 'challenge', label: '挑战' },
  { value: 'demo', label: '演示' },
] as const;

const TEACH_MODE_HINT = '引导：带提示教学；挑战：弱化提示独立完成；演示：以观看演示为主';

export function LevelSkillMapPanel() {
  const [error, setError] = useState<string | null>(null);
  const [filterChapter, setFilterChapter] = useState<string | 'all'>('all');
  const [selectedLevelIds, setSelectedLevelIds] = useState<Set<string>>(new Set());
  const [quickAssignSkillId, setQuickAssignSkillId] = useState<string>('');
  const [addingForLevelId, setAddingForLevelId] = useState<string | null>(null);

  const levels = useCatalogStore((state) => state.levels);
  const chapters = useCatalogStore((state) => state.chapters);
  const skills = useSkillGraphStore((state) => state.skills);
  const skillGraph = useSkillGraphStore((state) => state.skillGraph);
  const isSkillLoading = useSkillGraphStore((state) => state.isLoading);
  const skillLoadError = useSkillGraphStore((state) => state.loadError);
  const refreshSkillGraph = useSkillGraphStore((state) => state.refreshSkillGraph);

  const levelSkillMap = useLevelSkillMapStore((state) => state.levelSkillMap);
  const addLevelSkillBinding = useLevelSkillMapStore((state) => state.addLevelSkillBinding);
  const updateLevelSkillBinding = useLevelSkillMapStore((state) => state.updateLevelSkillBinding);
  const removeLevelSkillBinding = useLevelSkillMapStore((state) => state.removeLevelSkillBinding);
  const deleteLevelSkillEntry = useLevelSkillMapStore((state) => state.deleteLevelSkillEntry);
  const getLevelSkillEntry = useLevelSkillMapStore((state) => state.getLevelSkillEntry);
  const exportToDisk = useLevelSkillMapStore((state) => state.exportToDisk);
  const hasUnsavedChanges = useLevelSkillMapStore((state) => state.hasUnsavedChanges);
  const saveMap = useLevelSkillMapStore((state) => state.saveMap);

  useEffect(() => {
    if (!skillGraph && !isSkillLoading && !skillLoadError) {
      void refreshSkillGraph();
    }
  }, [skillGraph, isSkillLoading, skillLoadError, refreshSkillGraph]);

  useEffect(() => {
    if (!levelSkillMap && levels.length > 0) {
      const emptyMap: LevelSkillMap = {
        version: LEVEL_SKILL_MAP_VERSION,
        mappings: {},
      };
      useLevelSkillMapStore.setState({
        levelSkillMap: emptyMap,
        savedLevelSkillMap: emptyMap,
        isLoaded: true,
      });
    }
  }, [levelSkillMap, levels.length]);

  const skillOptions = useMemo(
    () => skills.map((s) => ({ value: s.id, label: s.displayNameZh })),
    [skills],
  );

  const skillLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of skills) map.set(s.id, s.displayNameZh);
    return map;
  }, [skills]);

  const filteredLevels = useMemo(() => {
    if (filterChapter === 'all') return levels;
    return levels.filter((level) => level.chapterId === filterChapter);
  }, [levels, filterChapter]);

  const mappedCount = useMemo(() => {
    if (!levelSkillMap) return 0;
    return Object.values(levelSkillMap.mappings).filter((e) => e.skills.length > 0).length;
  }, [levelSkillMap]);

  const quickAssignSkillName = quickAssignSkillId
    ? skillLabelById.get(quickAssignSkillId) ?? quickAssignSkillId
    : '';

  const canBulkAssign = Boolean(quickAssignSkillId) && selectedLevelIds.size > 0;

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
    try {
      setError(null);
      await saveMap();
      setError('✓ 保存成功');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    }
  };

  const buildBinding = (skillId: string, overrides?: Partial<LevelSkillBinding>): LevelSkillBinding | null => {
    const skill = skills.find((s) => s.id === skillId);
    if (!skill) {
      setError(skills.length === 0 ? '技能树未加载，请稍候或先打开「技能编辑」' : `未找到技能 "${skillId}"`);
      return null;
    }
    return {
      skillId: skill.id,
      cfopStage: overrides?.cfopStage ?? skill.stage,
      teachMode: overrides?.teachMode ?? 'guided',
      formulaDifficulty: overrides?.formulaDifficulty ?? 1,
    };
  };

  const handleAddSkill = (levelId: string, skillId: string) => {
    if (!skillId) return;
    const binding = buildBinding(skillId);
    if (!binding) return;
    addLevelSkillBinding(levelId, binding);
    setAddingForLevelId(null);
    setError(null);
  };

  const handleChangeBindingSkill = (levelId: string, fromSkillId: string, toSkillId: string) => {
    if (!toSkillId || toSkillId === fromSkillId) return;
    const skill = skills.find((s) => s.id === toSkillId);
    if (!skill) {
      setError(`未找到技能 "${toSkillId}"`);
      return;
    }
    updateLevelSkillBinding(levelId, fromSkillId, {
      skillId: toSkillId,
      cfopStage: skill.stage,
    });
    setError(null);
  };

  const handleQuickAssign = () => {
    if (!quickAssignSkillId) {
      setError('请先选择要分配的技能');
      return;
    }
    if (selectedLevelIds.size === 0) {
      setError('请先勾选至少一个关卡');
      return;
    }

    const binding = buildBinding(quickAssignSkillId);
    if (!binding) return;

    let added = 0;
    let updated = 0;
    selectedLevelIds.forEach((levelId) => {
      const entry = getLevelSkillEntry(levelId);
      const exists = entry?.skills.some((b) => b.skillId === binding.skillId);
      addLevelSkillBinding(levelId, binding);
      if (exists) updated++;
      else added++;
    });

    setSelectedLevelIds(new Set());
    setQuickAssignSkillId('');
    setError(`✓ 已追加 ${added} 个、更新 ${updated} 个绑定（技能：${binding.skillId}）`);
  };

  if (!levelSkillMap) {
    return (
      <div className="panel level-skill-map-panel">
        <div className="panel-empty">
          <p>未加载关卡映射数据</p>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>请先在关卡编辑模式加载关卡</p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel level-skill-map-panel">
      <div className="map-header">
        <div className="map-header-left">
          <h2>关卡映射</h2>
          <span className="map-badge">{mappedCount} / {levels.length}</span>
        </div>
        <div className="map-header-actions" id="map-export" data-tour="map-save">
          <button className="btn btn-sm" onClick={() => void handleExport()}>导出</button>
          {hasUnsavedChanges && (
            <button className="btn btn-sm btn-primary" onClick={() => void handleSave()}>保存</button>
          )}
        </div>
      </div>

      {error && (
        <div className={`banner ${error.startsWith('✓') ? 'banner-ok' : 'banner-error'}`}>{error}</div>
      )}

      {skills.length === 0 && (
        <div className="banner banner-error">
          {isSkillLoading ? '正在加载技能树…' : '尚未加载技能。请打开「技能编辑」或等待自动加载后再分配。'}
        </div>
      )}

      <div className="map-toolbar" id="map-toolbar">
        <div className="map-filter-chips" id="map-filter">
          <button
            className={`chip ${filterChapter === 'all' ? 'chip-active' : ''}`}
            onClick={() => setFilterChapter('all')}
          >全部</button>
          {chapters.map((chapter) => (
            <button
              key={chapter.id}
              className={`chip ${filterChapter === chapter.id ? 'chip-active' : ''}`}
              onClick={() => setFilterChapter(chapter.id)}
            >{chapter.partName}</button>
          ))}
        </div>

        <div className="map-bulk-actions">
          <div data-tour="skill-select" className="map-bulk-skill">
            <SelectDropdown
              size="sm"
              className="map-bulk-select"
              value={quickAssignSkillId}
              options={skillOptions}
              placeholder="选择技能..."
              searchable
              disabled={skills.length === 0}
              onChange={setQuickAssignSkillId}
            />
            {quickAssignSkillName && (
              <span className="map-bulk-skill-hint">已选：{quickAssignSkillName}</span>
            )}
          </div>
          <button
            className="btn btn-sm btn-primary"
            data-tour="assign-button"
            onClick={handleQuickAssign}
            disabled={!canBulkAssign}
            title={
              !quickAssignSkillId
                ? '请先选择技能'
                : selectedLevelIds.size === 0
                  ? '请先勾选关卡'
                  : `向 ${selectedLevelIds.size} 个关卡追加技能`
            }
          >
            分配 ({selectedLevelIds.size})
          </button>
        </div>
      </div>

      <div className="map-list" id="map-list" data-tour="map-list">
        {filteredLevels.length === 0 ? (
          <div className="map-empty">该章节无关卡</div>
        ) : (
          <div className="level-cards">
            {filteredLevels.map((level) => {
              const entry = getLevelSkillEntry(level.id);
              const bindings = entry?.skills ?? [];
              const isSelected = selectedLevelIds.has(level.id);
              const boundIds = new Set(bindings.map((b) => b.skillId));
              const addOptions = skillOptions.filter((o) => !boundIds.has(o.value));
              const isAdding = addingForLevelId === level.id;

              return (
                <div
                  key={level.id}
                  className={`level-card ${isSelected ? 'selected' : ''} ${bindings.length ? '' : 'unmapped'}`}
                >
                  <div className="level-card-header">
                    <label className="map-check">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          const next = new Set(selectedLevelIds);
                          if (e.target.checked) next.add(level.id);
                          else next.delete(level.id);
                          setSelectedLevelIds(next);
                        }}
                      />
                      <span className="map-check-box" />
                    </label>
                    <span className="level-card-order">{level.order}</span>
                    <span className="level-card-name">{level.title}</span>
                    {bindings.length > 0 && (
                      <span className="level-card-bind-count">{bindings.length} 技能</span>
                    )}
                  </div>

                  <div className="level-card-body">
                    {bindings.length === 0 ? (
                      <SelectDropdown
                        size="sm"
                        value=""
                        options={skillOptions}
                        placeholder={skills.length === 0 ? '技能加载中…' : '点击选择技能...'}
                        searchable
                        disabled={skills.length === 0}
                        onChange={(v) => {
                          if (v) handleAddSkill(level.id, v);
                        }}
                      />
                    ) : (
                      <>
                        <div className="level-card-mapped-info">
                          {bindings.map((b) => {
                            const name = skillLabelById.get(b.skillId) ?? b.skillId;
                            return (
                              <span key={b.skillId} className="mapped-skill-chip">
                                <span className="mapped-stage-badge">{b.cfopStage.toUpperCase()}</span>
                                <span className="mapped-skill-name">{name}</span>
                              </span>
                            );
                          })}
                        </div>

                        <ul className="level-binding-list">
                          {bindings.map((binding) => {
                            const otherIds = new Set(
                              bindings.filter((b) => b.skillId !== binding.skillId).map((b) => b.skillId),
                            );
                            const rowOptions = skillOptions.filter(
                              (o) => o.value === binding.skillId || !otherIds.has(o.value),
                            );
                            return (
                              <li key={binding.skillId} className="level-binding-row">
                                <div className="level-card-field">
                                  <label>技能</label>
                                  <SelectDropdown
                                    size="sm"
                                    value={binding.skillId}
                                    options={rowOptions}
                                    searchable
                                    onChange={(v) => handleChangeBindingSkill(level.id, binding.skillId, v)}
                                  />
                                </div>
                                <div className="level-card-field">
                                  <label>模式</label>
                                  <SelectDropdown
                                    size="sm"
                                    value={binding.teachMode}
                                    options={[...TEACH_MODES]}
                                    onChange={(v) =>
                                      updateLevelSkillBinding(level.id, binding.skillId, {
                                        teachMode: v as TeachMode,
                                      })
                                    }
                                  />
                                </div>
                                <div className="level-card-field level-card-field--diff">
                                  <label>难度</label>
                                  <input
                                    className="text-input text-input--sm map-number-input"
                                    type="number"
                                    min="1"
                                    max="6"
                                    value={binding.formulaDifficulty}
                                    onChange={(e) =>
                                      updateLevelSkillBinding(level.id, binding.skillId, {
                                        formulaDifficulty: parseInt(e.target.value, 10) || 1,
                                      })
                                    }
                                  />
                                </div>
                                <button
                                  type="button"
                                  className="level-binding-remove"
                                  aria-label="移除该技能"
                                  onClick={() => removeLevelSkillBinding(level.id, binding.skillId)}
                                >
                                  移除
                                </button>
                              </li>
                            );
                          })}
                        </ul>

                        <p className="level-card-hint">{TEACH_MODE_HINT}</p>

                        <div className="level-card-footer">
                          {isAdding ? (
                            <div className="level-card-add-row">
                              <SelectDropdown
                                size="sm"
                                value=""
                                options={addOptions}
                                placeholder={addOptions.length ? '选择要添加的技能...' : '已无更多技能'}
                                searchable
                                disabled={addOptions.length === 0}
                                onChange={(v) => {
                                  if (v) handleAddSkill(level.id, v);
                                }}
                              />
                              <button
                                type="button"
                                className="btn btn-sm"
                                onClick={() => setAddingForLevelId(null)}
                              >
                                取消
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-sm"
                              disabled={addOptions.length === 0 || skills.length === 0}
                              onClick={() => setAddingForLevelId(level.id)}
                            >
                              + 添加技能
                            </button>
                          )}
                          <button
                            type="button"
                            className="level-card-clear"
                            onClick={() => deleteLevelSkillEntry(level.id)}
                          >
                            清除全部
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
