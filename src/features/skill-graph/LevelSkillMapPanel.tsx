import { useEffect, useMemo, useState } from 'react';
import { useCatalogStore } from '@/shared/store/useCatalogStore';
import { useSkillGraphStore } from '@/shared/store/useSkillGraphStore';
import { useLevelSkillMapStore } from '@/shared/store/useLevelSkillMapStore';
import { SelectDropdown } from '@/shared/ui/SelectDropdown';
import type { LevelSkillMapEntry, LevelSkillMap } from '@/core/skill-graph/types';
import '../../styles/level-skill-map-panel.css';

const TEACH_MODES = [
  { value: 'guided', label: 'guided' },
  { value: 'challenge', label: 'challenge' },
  { value: 'demo', label: 'demo' },
] as const;

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

  const skillOptions = useMemo(
    () => skills.map((s) => ({ value: s.id, label: s.displayNameZh })),
    [skills],
  );

  const filteredLevels = useMemo(() => {
    if (filterChapter === 'all') return levels;
    return levels.filter((level) => level.chapterId === filterChapter);
  }, [levels, filterChapter]);

  const mappedCount = useMemo(() => {
    return levelSkillMap ? Object.keys(levelSkillMap.mappings).length : 0;
  }, [levelSkillMap]);

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

  const handleUpdateEntry = (levelId: string, entry: Partial<LevelSkillMapEntry>) => {
    const current = getLevelSkillEntry(levelId);
    if (!current && !entry.skillId) {
      setError('请选择一个技能');
      return;
    }

    const skillId = entry.skillId || current?.skillId || '';
    const skill = skills.find((s) => s.id === skillId);
    if (!skill) {
      setError(`未找到技能 "${skillId}"`);
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
      setError('请选择一个技能');
      return;
    }
    if (selectedLevelIds.size === 0) {
      setError('请至少选择一个关卡');
      return;
    }

    const skill = skills.find((s) => s.id === quickAssignSkillId);
    if (!skill) {
      setError(`未找到技能 "${quickAssignSkillId}"`);
      return;
    }

    let count = 0;
    selectedLevelIds.forEach((levelId) => {
      handleUpdateEntry(levelId, { skillId: skill.id, cfopStage: skill.stage });
      count++;
    });

    setSelectedLevelIds(new Set());
    setQuickAssignSkillId('');
    setError(`✓ 已为 ${count} 个关卡分配技能`);
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
      {showGuide && (
        <MapGuideDialog onClose={() => setShowGuide(false)} mappedCount={mappedCount} totalCount={levels.length} />
      )}

      <div className="map-header">
        <div className="map-header-left">
          <h2>关卡映射</h2>
          <span className="map-badge">{mappedCount} / {levels.length}</span>
        </div>
        <div className="map-header-actions" id="map-export">
          <button className="btn btn-sm btn-text" onClick={() => setShowGuide(true)}>指引</button>
          <button className="btn btn-sm" onClick={() => void handleExport()}>导出</button>
          {hasUnsavedChanges && (
            <button className="btn btn-sm btn-primary" onClick={() => void handleSave()}>保存</button>
          )}
        </div>
      </div>

      {error && (
        <div className={`banner ${error.startsWith('✓') ? 'banner-ok' : 'banner-error'}`}>{error}</div>
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
          <SelectDropdown
            size="sm"
            className="map-bulk-select"
            value={quickAssignSkillId}
            options={skillOptions}
            placeholder="选择技能..."
            searchable
            onChange={setQuickAssignSkillId}
          />
          <button
            className="btn btn-sm btn-primary"
            onClick={handleQuickAssign}
            disabled={selectedLevelIds.size === 0}
          >分配 ({selectedLevelIds.size})</button>
        </div>
      </div>

      <div className="map-list" id="map-list">
        {filteredLevels.length === 0 ? (
          <div className="map-empty">该章节无关卡</div>
        ) : (
          <div className="level-cards">
            {filteredLevels.map((level) => {
              const entry = getLevelSkillEntry(level.id);
              const isSelected = selectedLevelIds.has(level.id);
              const skill = entry ? skills.find((s) => s.id === entry.skillId) : null;

              return (
                <div
                  key={level.id}
                  className={`level-card ${isSelected ? 'selected' : ''} ${entry ? '' : 'unmapped'}`}
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
                  </div>

                  <div className="level-card-body">
                    {entry ? (
                      <>
                        {skill && (
                          <div className="level-card-mapped-info">
                            <span className="mapped-stage-badge">{(entry.cfopStage ?? '').toUpperCase()}</span>
                            <span className="mapped-skill-name">{skill.displayNameZh}</span>
                          </div>
                        )}
                        <div className="level-card-row">
                          <div className="level-card-field">
                            <label>技能</label>
                            <SelectDropdown
                              size="sm"
                              value={entry.skillId ?? ''}
                              options={skillOptions}
                              searchable
                              onChange={(v) => handleUpdateEntry(level.id, { skillId: v })}
                            />
                          </div>
                          <div className="level-card-field">
                            <label>模式</label>
                            <SelectDropdown
                              size="sm"
                              value={entry.teachMode}
                              options={[...TEACH_MODES]}
                              onChange={(v) => handleUpdateEntry(level.id, { teachMode: v as LevelSkillMapEntry['teachMode'] })}
                            />
                          </div>
                        </div>
                        <div className="level-card-row">
                          <div className="level-card-field">
                            <label>难度</label>
                            <input
                              className="text-input text-input--sm map-number-input"
                              type="number"
                              min="1"
                              max="6"
                              value={entry.formulaDifficulty}
                              onChange={(e) => handleUpdateEntry(level.id, { formulaDifficulty: parseInt(e.target.value) || 1 })}
                            />
                          </div>
                          <div className="level-card-field level-card-field--action">
                            <button className="level-card-clear" onClick={() => deleteLevelSkillEntry(level.id)}>清除映射</button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <SelectDropdown
                        size="sm"
                        value=""
                        options={skillOptions}
                        placeholder="点击选择技能..."
                        searchable
                        onChange={(v) => {
                          if (v) handleUpdateEntry(level.id, { skillId: v });
                        }}
                      />
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

interface MapGuideDialogProps {
  onClose: () => void;
  mappedCount: number;
  totalCount: number;
}

function MapGuideDialog({ onClose, mappedCount, totalCount }: MapGuideDialogProps) {
  const [step, setStep] = useState(0);
  const steps = [
    { title: '欢迎使用关卡映射编辑器', content: `已加载 ${totalCount} 个关卡，其中 ${mappedCount} 个已分配技能。`, action: '开始', highlight: null },
    { title: '章节筛选', content: '使用工具栏 chip 按钮快速切换到不同章节，聚焦处理映射。', action: '下一步', highlight: 'map-filter' },
    { title: '逐个分配', content: '灰色卡片表示未分配，直接在下拉框中选择技能即可。已分配的卡片可以修改技能、模式和难度。', action: '下一步', highlight: 'map-list' },
    { title: '批量操作', content: '勾选多个关卡，然后在工具栏选择技能点击"分配"，一键批量完成。', action: '下一步', highlight: 'map-toolbar' },
    { title: '导出到应用', content: '点击右上角"导出"按钮生成 level_skill_map.json 文件。', action: '完成', highlight: 'map-export' },
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
