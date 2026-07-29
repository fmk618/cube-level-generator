import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCatalogStore } from '@/shared/store/useCatalogStore';
import { useUiStore } from '@/shared/store/useUiStore';
import {
  deriveLevelFormulaPreset,
  formatChapterLevelOrder,
  getLevelGuidanceSummary,
  getMinimumStarThresholds,
  resolveLevelGuidanceFailureThreshold,
  resolveStarThresholds,
  type LevelDefinition,
  type LevelFormulaTarget,
  type LevelGuidanceFailureThreshold,
} from '@/core/levels';
import { INITIAL_BRIGHTNESS_MATRIX, type BrightnessMatrix, type StateMatrix } from '@/core/cube';
import { CubePreview } from '@/features/preview-3d/CubePreview';
import { FormulaKeyboard } from './FormulaKeyboard';

const FACE_NAMES = ['U', 'L', 'F', 'R', 'B', 'D'];

const cloneStateMatrix = (matrix: StateMatrix): StateMatrix => matrix.map((face) => face.map((row) => [...row]));
const cloneBrightness = (matrix: BrightnessMatrix): BrightnessMatrix => matrix.map((face) => face.map((row) => [...row]));

const parsePositiveInteger = (text: string): number | null => {
  const value = parseInt(text, 10);
  return Number.isInteger(value) && value > 0 ? value : null;
};

type Tab = 'meta' | 'formula' | 'brightness' | 'guidance';

export function EditorPanel() {
  const selectedLevelId = useUiStore((s) => s.selectedLevelId);
  const selectLevel = useUiStore((s) => s.selectLevel);
  const formulaAdoptionRequest = useUiStore((s) => s.formulaAdoptionRequest);
  const clearFormulaAdoptionRequest = useUiStore((s) => s.clearFormulaAdoptionRequest);
  const { levels, chapters, hasUnsavedChanges, updateLevel, deleteLevel, saveCatalog } = useCatalogStore();
  const level = useMemo(() => levels.find((l) => l.id === selectedLevelId) ?? null, [levels, selectedLevelId]);

  const [activeTab, setActiveTab] = useState<Tab>('meta');
  const [titleText, setTitleText] = useState('');
  const [descriptionText, setDescriptionText] = useState('');
  const [hintText, setHintText] = useState('');
  const [maxMovesText, setMaxMovesText] = useState('');
  const [star3Text, setStar3Text] = useState('');
  const [star2Text, setStar2Text] = useState('');
  const [formulaText, setFormulaText] = useState('');
  const [formulaTarget, setFormulaTarget] = useState<LevelFormulaTarget>('f2l');
  const [guidanceFormulaText, setGuidanceFormulaText] = useState('');
  const [guidanceFailureThreshold, setGuidanceFailureThreshold] = useState<LevelGuidanceFailureThreshold>(3);
  const [startStateMatrix, setStartStateMatrix] = useState<StateMatrix | null>(null);
  const [goalStateMatrix, setGoalStateMatrix] = useState<StateMatrix | null>(null);
  const [brightnessMatrix, setBrightnessMatrix] = useState<BrightnessMatrix>(cloneBrightness(INITIAL_BRIGHTNESS_MATRIX));
  const [previewMode, setPreviewMode] = useState<'start' | 'goal'>('start');
  const [selectedFace, setSelectedFace] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [headerActionsHost, setHeaderActionsHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHeaderActionsHost(document.getElementById('global-editor-actions'));
  }, []);

  useEffect(() => {
    if (!level) return;
    setTitleText(level.title);
    setDescriptionText(level.description);
    setHintText(level.hint ?? '');
    setMaxMovesText(String(level.maxMoves));
    setStar3Text(String(level.starThresholds[0]));
    setStar2Text(String(level.starThresholds[1]));
    setFormulaText(level.rotationFormula ?? '');
    setFormulaTarget(level.rotationTarget ?? 'f2l');
    setGuidanceFormulaText(level.guidanceFormula ?? '');
    setGuidanceFailureThreshold(resolveLevelGuidanceFailureThreshold(level.guidanceFailureThreshold));
    setStartStateMatrix(cloneStateMatrix(level.startStateMatrix));
    setGoalStateMatrix(cloneStateMatrix(level.goalStateMatrix));
    setBrightnessMatrix(cloneBrightness(level.brightnessMatrix));
    setPreviewMode('start');
    setActiveTab('meta');
    setSaveError(null);
    setSaveNotice(null);
    // 只在切换关卡时重置表单，避免目录状态更新覆盖尚未保存的编辑内容。
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [level?.id]);

  useEffect(() => {
    if (!formulaAdoptionRequest || !level) return;
    if (formulaAdoptionRequest.kind === 'rotation') {
      setFormulaText(formulaAdoptionRequest.formula);
      setFormulaTarget(formulaAdoptionRequest.target);
      setActiveTab('formula');
    } else {
      setGuidanceFormulaText(formulaAdoptionRequest.formula);
      setActiveTab('guidance');
    }
    clearFormulaAdoptionRequest();
  }, [formulaAdoptionRequest, level, clearFormulaAdoptionRequest]);

  const chapter = level ? chapters.find((c) => c.id === level.chapterId) : undefined;

  const formulaPreviewText = useMemo(() => {
    const trimmed = formulaText.trim();
    if (!trimmed) return '尚未输入公式。输入后点击"应用公式"，会按白顶绿前的默认朝向生成初始态、目标态和亮度掩码。';
    try {
      const derived = deriveLevelFormulaPreset(trimmed, formulaTarget);
      return `已解析 ${derived.officialTokens.length} 个官方动作，映射后生成 ${derived.mappedTokens.length} 个实际转动；目标类型 ${formulaTarget.toUpperCase()}。`;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }, [formulaText, formulaTarget]);

  const guidancePreviewText = useMemo(() => {
    const formula = guidanceFormulaText.trim();
    if (!formula) return '尚未配置推荐解法，关卡列表会标记为"缺解法"。';
    if (!level || !startStateMatrix || !goalStateMatrix) return '请先配置起始状态和目标状态。';
    const summary = getLevelGuidanceSummary({
      ...level,
      startStateMatrix,
      goalStateMatrix,
      brightnessMatrix,
      guidanceFormula: formula,
    });
    return summary.status === 'ready' ? `校验通过，可生成 ${summary.stepCount} 步流水灯指引。` : summary.message;
  }, [guidanceFormulaText, level, startStateMatrix, goalStateMatrix, brightnessMatrix]);

  const applyFormula = () => {
    const trimmed = formulaText.trim();
    if (!trimmed) {
      setSaveError('请先输入旋转公式。');
      return;
    }
    try {
      const derived = deriveLevelFormulaPreset(trimmed, formulaTarget);
      setStartStateMatrix(cloneStateMatrix(derived.startStateMatrix));
      setGoalStateMatrix(cloneStateMatrix(derived.goalStateMatrix));
      setBrightnessMatrix(cloneBrightness(derived.brightnessMatrix));
      setPreviewMode('start');
      setSaveError(null);
      setSaveNotice(`已按 ${formulaTarget.toUpperCase()} 目标生成起始态。`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    }
  };

  const toggleBrightnessCell = (face: number, row: number, col: number) => {
    const next = cloneBrightness(brightnessMatrix);
    next[face][row][col] = brightnessMatrix[face][row][col] > 0 ? 0 : 8;
    setBrightnessMatrix(next);
  };

  const setFaceAllBrightness = (face: number, value: number) => {
    const next = cloneBrightness(brightnessMatrix);
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) next[face][row][col] = value;
    }
    setBrightnessMatrix(next);
  };

  const parsedMaxMoves = parsePositiveInteger(maxMovesText);
  const minimumStarThresholds = parsedMaxMoves ? getMinimumStarThresholds(parsedMaxMoves) : null;

  const hasEditorChanges = useMemo(() => {
    if (!level || !startStateMatrix || !goalStateMatrix) return false;
    return (
      titleText !== level.title
      || descriptionText !== level.description
      || hintText !== (level.hint ?? '')
      || maxMovesText !== String(level.maxMoves)
      || star3Text !== String(level.starThresholds[0])
      || star2Text !== String(level.starThresholds[1])
      || formulaText !== (level.rotationFormula ?? '')
      || formulaTarget !== (level.rotationTarget ?? 'f2l')
      || guidanceFormulaText !== (level.guidanceFormula ?? '')
      || guidanceFailureThreshold !== resolveLevelGuidanceFailureThreshold(level.guidanceFailureThreshold)
      || JSON.stringify(startStateMatrix) !== JSON.stringify(level.startStateMatrix)
      || JSON.stringify(goalStateMatrix) !== JSON.stringify(level.goalStateMatrix)
      || JSON.stringify(brightnessMatrix) !== JSON.stringify(level.brightnessMatrix)
    );
  }, [
    level, titleText, descriptionText, hintText, maxMovesText, star3Text, star2Text,
    formulaText, formulaTarget, guidanceFormulaText, guidanceFailureThreshold,
    startStateMatrix, goalStateMatrix, brightnessMatrix,
  ]);

  const handleSave = async () => {
    if (!level) return;
    setSaveError(null);
    setSaveNotice(null);

    const title = titleText.trim();
    const description = descriptionText.trim();
    if (!title) return setSaveError('标题不能为空。');
    if (!description) return setSaveError('描述不能为空。');

    const maxMoves = parsePositiveInteger(maxMovesText);
    const threeStar = parsePositiveInteger(star3Text);
    const twoStar = parsePositiveInteger(star2Text);
    if (maxMoves === null || threeStar === null || twoStar === null) {
      return setSaveError('最大步数和星级阈值都需要是正整数。');
    }
    if (threeStar > twoStar) return setSaveError('3 星步数上限不能大于 2 星步数上限。');
    if (twoStar > maxMoves) return setSaveError('2 星步数上限不能大于最大步数。');
    const starThresholds = resolveStarThresholds(maxMoves, [threeStar, twoStar]);

    const rotationFormula = formulaText.trim();
    const guidanceFormula = guidanceFormulaText.trim();
    if (rotationFormula) {
      try {
        deriveLevelFormulaPreset(rotationFormula, formulaTarget);
      } catch (error) {
        return setSaveError(error instanceof Error ? error.message : String(error));
      }
    }

    const patch: Partial<LevelDefinition> = {
      title,
      description,
      hint: hintText.trim() || undefined,
      maxMoves,
      starThresholds,
      startStateMatrix: cloneStateMatrix(startStateMatrix ?? level.startStateMatrix),
      goalStateMatrix: cloneStateMatrix(goalStateMatrix ?? level.goalStateMatrix),
      brightnessMatrix: cloneBrightness(brightnessMatrix),
      rotationFormula: rotationFormula || undefined,
      rotationTarget: rotationFormula ? formulaTarget : undefined,
      guidanceFormula: guidanceFormula || undefined,
      guidanceFailureThreshold,
    };

    if (guidanceFormula) {
      const summary = getLevelGuidanceSummary({ ...level, ...patch } as LevelDefinition);
      if (summary.status !== 'ready') {
        return setSaveError(`推荐解法无效：${summary.message}`);
      }
    }

    setSaving(true);
    try {
      const updatedLevel = updateLevel(level.id, patch);
      if (!updatedLevel) throw new Error(`找不到要保存的关卡：${level.id}`);
      await saveCatalog();
      setTitleText(updatedLevel.title);
      setDescriptionText(updatedLevel.description);
      setHintText(updatedLevel.hint ?? '');
      setMaxMovesText(String(updatedLevel.maxMoves));
      setStar3Text(String(updatedLevel.starThresholds[0]));
      setStar2Text(String(updatedLevel.starThresholds[1]));
      setFormulaText(updatedLevel.rotationFormula ?? '');
      setFormulaTarget(updatedLevel.rotationTarget ?? 'f2l');
      setGuidanceFormulaText(updatedLevel.guidanceFormula ?? '');
      setGuidanceFailureThreshold(resolveLevelGuidanceFailureThreshold(updatedLevel.guidanceFailureThreshold));
      setStartStateMatrix(cloneStateMatrix(updatedLevel.startStateMatrix));
      setGoalStateMatrix(cloneStateMatrix(updatedLevel.goalStateMatrix));
      setBrightnessMatrix(cloneBrightness(updatedLevel.brightnessMatrix));
      setSaveNotice('关卡已保存到运行文件。');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!level) return;
    if (!window.confirm(`确定要删除「${level.title}」吗？`)) return;
    deleteLevel(level.id);
    selectLevel(null);
  };

  if (!level || !startStateMatrix || !goalStateMatrix) {
    return (
      <div className="panel panel--main editor-panel">
        <div className="panel-scroll editor-panel-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }}>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 3v18M3 9h6M3 15h6" />
          </svg>
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.6 }}>
            从左侧选择一个关卡开始编辑<br />
            <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>或点击「新增关卡」创建</span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {headerActionsHost && createPortal(
        <>
          {(hasEditorChanges || hasUnsavedChanges) && <span className="save-state"><i />未保存</span>}
          <button
            type="button"
            className="btn btn-primary titlebar-save"
            disabled={saving || (!hasEditorChanges && !hasUnsavedChanges)}
            onClick={() => void handleSave()}
          >
            {saving ? <><span className="spinner" />保存中</> : '保存关卡'}
          </button>
        </>,
        headerActionsHost,
      )}
      <div className="panel panel--main editor-panel">
      <div className="panel-scroll editor-scroll">
        <div className="editor-header">
          <div>
            <h2>{titleText || level.title}</h2>
            <p className="editor-subtitle">
              {chapter?.title ?? level.chapterId} · {formatChapterLevelOrder(level.chapterId, level.order, chapters)}
            </p>
          </div>
        </div>

        {saveError && <div className="banner banner-error">{saveError}</div>}
        {saveNotice && <div className="banner banner-ok">{saveNotice}</div>}

        <div className="preview-hero">
          <div className="preview-hero-header">
            <span className="preview-hero-title">3D 预览</span>
            <div className="segmented preview-segmented">
              <button type="button" className={`chip ${previewMode === 'start' ? 'chip-active' : ''}`} onClick={() => setPreviewMode('start')}>初始态</button>
              <button type="button" className={`chip ${previewMode === 'goal' ? 'chip-active' : ''}`} onClick={() => setPreviewMode('goal')}>目标态</button>
            </div>
          </div>
          <CubePreview
            className="cube-preview cube-preview-editor"
            stateMatrix={previewMode === 'start' ? startStateMatrix : goalStateMatrix}
            brightnessMatrix={brightnessMatrix}
          />
        </div>

        <div className="editor-workspace">
          <div className="tab-bar">
            {(['meta', 'formula', 'brightness', 'guidance'] as Tab[]).map((tab) => (
              <button key={tab} className={`tab tab-${tab} ${activeTab === tab ? 'tab-active' : ''}`} onClick={() => setActiveTab(tab)}>
                {tab === 'meta' ? '基础信息' : tab === 'formula' ? '旋转公式' : tab === 'brightness' ? '点亮控制' : '指引校验'}
              </button>
            ))}
          </div>

      {activeTab === 'meta' && (
        <div className="tab-content tab-content-meta">
          <label>标题<input className="text-input" value={titleText} onChange={(e) => setTitleText(e.target.value)} /></label>
          <label>描述<textarea className="text-input" value={descriptionText} onChange={(e) => setDescriptionText(e.target.value)} /></label>
          <label>提示（可选）<textarea className="text-input" value={hintText} onChange={(e) => setHintText(e.target.value)} /></label>
          <div className="field-row">
            <label>最大步数<input className="text-input" value={maxMovesText} onChange={(e) => setMaxMovesText(e.target.value.replace(/[^0-9]/g, ''))} /></label>
            <label>3 星≤<input className="text-input" value={star3Text} onChange={(e) => setStar3Text(e.target.value.replace(/[^0-9]/g, ''))} /></label>
            <label>2 星≤<input className="text-input" value={star2Text} onChange={(e) => setStar2Text(e.target.value.replace(/[^0-9]/g, ''))} /></label>
          </div>
          {minimumStarThresholds && (
            <p className="hint-text">评分保障：{minimumStarThresholds[0]} 步内 3 星，{minimumStarThresholds[1]} 步内至少 2 星；配置只能放宽奖励。</p>
          )}
          <div><button className="btn btn-danger" onClick={handleDelete}>删除当前关卡</button></div>
        </div>
      )}

      {activeTab === 'formula' && (
        <div className="tab-content tab-content-formula">
          <div className="chip-group">
            <span className="chip-group-label">目标类型</span>
            <div className="segmented formula-segmented">
              {(['f2l', 'oll', 'pll'] as LevelFormulaTarget[]).map((target) => (
                <button key={target} type="button" className={`chip ${formulaTarget === target ? 'chip-active' : ''}`} onClick={() => setFormulaTarget(target)}>
                  {target.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <FormulaKeyboard value={formulaText} onChange={setFormulaText} />
          <div><button className="btn" onClick={applyFormula}>应用公式</button></div>
          <div className="preview-card">{formulaPreviewText}</div>
        </div>
      )}

      {activeTab === 'brightness' && (
        <div className="tab-content tab-content-brightness">
          <div className="chip-group">
            <span className="chip-group-label">选择面</span>
            <div className="face-selector">
              {FACE_NAMES.map((name, index) => (
                <button key={name} className={`chip ${selectedFace === index ? 'chip-active' : ''}`} onClick={() => setSelectedFace(index)}>{name}</button>
              ))}
            </div>
          </div>
          <div className="brightness-grid">
            {[0, 1, 2].map((row) => (
              <div key={row} className="brightness-row">
                {[0, 1, 2].map((col) => {
                  const value = brightnessMatrix[selectedFace][row][col];
                  return (
                    <button
                      key={col}
                      className={`brightness-cell ${value > 0 ? 'brightness-cell-on' : ''}`}
                      onClick={() => toggleBrightnessCell(selectedFace, row, col)}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="field-row">
            <button className="btn" onClick={() => setFaceAllBrightness(selectedFace, 8)}>全亮</button>
            <button className="btn" onClick={() => setFaceAllBrightness(selectedFace, 0)}>全灭</button>
          </div>
        </div>
      )}

      {activeTab === 'guidance' && (
        <div className="tab-content tab-content-guidance">
          <p className="hint-text">配置推荐解法，系统会校验公式能否从初始态到达目标点亮区域。</p>
          <div className="chip-group">
            <span className="chip-group-label">指引解锁失败次数</span>
            <div className="chip-row">
              {([0, 1, 2, 3] as LevelGuidanceFailureThreshold[]).map((threshold) => (
                <button key={threshold} className={`chip ${guidanceFailureThreshold === threshold ? 'chip-active' : ''}`} onClick={() => setGuidanceFailureThreshold(threshold)}>
                  {threshold} 次
                </button>
              ))}
            </div>
          </div>
          <p className="hint-text">
            {guidanceFailureThreshold === 0
              ? '0 次表示本关永久关闭公式、箭头演示和流水灯提示。'
              : guidanceFailureThreshold === 1
                ? '1 次表示进入本关即可使用流水灯和公式指引。'
                : `${guidanceFailureThreshold} 次表示连续失败 ${guidanceFailureThreshold - 1} 次后解锁指引。`}
          </p>
          <FormulaKeyboard value={guidanceFormulaText} onChange={setGuidanceFormulaText} />
          <div className="preview-card">{guidancePreviewText}</div>
        </div>
      )}
        </div>
      </div>
    </div>
    </>
  );
}
