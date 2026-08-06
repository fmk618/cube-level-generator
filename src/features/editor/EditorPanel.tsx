import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCatalogStore } from '@/shared/store/useCatalogStore';
import { useUiStore } from '@/shared/store/useUiStore';
import { useLevelSkillMapStore } from '@/shared/store/useLevelSkillMapStore';
import { useSkillGraphStore } from '@/shared/store/useSkillGraphStore';
import { useCloudSyncStore } from '@/shared/store/useCloudSyncStore';
import {
  buildYawEquivalentGoalStates,
  deriveLevelFormulaPreset,
  formatChapterLevelOrder,
  formatGuidanceFailureThresholdLabel,
  getLevelGuidanceSummary,
  getMinimumStarThresholds,
  isYawEquivalentGoalSet,
  LEVEL_GUIDANCE_FAILURE_THRESHOLD_OPTIONS,
  normalizeLevelGoalStates,
  resolveLevelGuidanceFailureThreshold,
  resolveStarThresholds,
  type LevelDefinition,
  type LevelFormulaTarget,
  type LevelGuidanceFailureThreshold,
} from '@/core/levels';
import { getLevelRecommendStatus, getTeachModeLabel } from '@/core/skill-graph/utils';
import { INITIAL_BRIGHTNESS_MATRIX, type BrightnessMatrix, type StateMatrix } from '@/core/cube';
import { expandTokenToLayerMoves, applyTokensToState } from '@/core/formula';
import { CubePreview } from '@/features/preview-3d/CubePreview';
import type { CubePlayRequest } from '@/features/preview-3d/CubeScene';
import { FormulaKeyboard } from './FormulaKeyboard';
import { EditorMovePad } from './EditorMovePad';

const FACE_NAMES = ['U', 'L', 'F', 'R', 'B', 'D'];

const EDITOR_PREVIEW_HEIGHT_KEY = 'editor-preview-height';
const DEFAULT_PREVIEW_HEIGHT = 360;
const MIN_PREVIEW_HEIGHT = 120;
const MIN_WORKSPACE_HEIGHT = 220;

const readPreviewHeight = (): number => {
  const stored = localStorage.getItem(EDITOR_PREVIEW_HEIGHT_KEY);
  if (!stored) return DEFAULT_PREVIEW_HEIGHT;
  const value = Number(stored);
  if (!Number.isFinite(value)) return DEFAULT_PREVIEW_HEIGHT;
  return Math.max(MIN_PREVIEW_HEIGHT, value);
};

const getMaxPreviewHeight = (): number => {
  const viewportBudget = window.innerHeight - 220;
  return Math.max(MIN_PREVIEW_HEIGHT, viewportBudget - MIN_WORKSPACE_HEIGHT);
};

const cloneStateMatrix = (matrix: StateMatrix): StateMatrix => matrix.map((face) => face.map((row) => [...row]));
const cloneBrightness = (matrix: BrightnessMatrix): BrightnessMatrix => matrix.map((face) => face.map((row) => [...row]));

const parsePositiveInteger = (text: string): number | null => {
  const value = parseInt(text, 10);
  return Number.isInteger(value) && value > 0 ? value : null;
};

const resolveGoalVariantList = (
  primary: StateMatrix,
  matrices: StateMatrix[] | undefined,
): StateMatrix[] => {
  if (matrices && matrices.length > 0) {
    return matrices.map(cloneStateMatrix);
  }
  return [cloneStateMatrix(primary)];
};

const formatGoalVariantLabel = (index: number): string => `目标${index + 1}`;

type Tab = 'meta' | 'states' | 'formula' | 'brightness' | 'guidance';

export function EditorPanel({ onOpenAiRecommend }: { onOpenAiRecommend?: () => void } = {}) {
  const selectedLevelId = useUiStore((s) => s.selectedLevelId);
  const selectLevel = useUiStore((s) => s.selectLevel);
  const formulaAdoptionRequest = useUiStore((s) => s.formulaAdoptionRequest);
  const clearFormulaAdoptionRequest = useUiStore((s) => s.clearFormulaAdoptionRequest);
  const { levels, chapters, hasUnsavedChanges, updateLevel, deleteLevel, saveCatalog } = useCatalogStore();
  const level = useMemo(() => levels.find((l) => l.id === selectedLevelId) ?? null, [levels, selectedLevelId]);
  const getPrimary = useLevelSkillMapStore((s) => s.getPrimary);
  const skills = useSkillGraphStore((s) => s.skills);
  const refreshMap = useLevelSkillMapStore((s) => s.refreshMap);
  const levelSkillMap = useLevelSkillMapStore((s) => s.levelSkillMap);
  const isMapLoading = useLevelSkillMapStore((s) => s.isLoading);

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
  const [goalStateMatrices, setGoalStateMatrices] = useState<StateMatrix[] | undefined>(undefined);
  const [liveStateMatrix, setLiveStateMatrix] = useState<StateMatrix | null>(null);
  const [brightnessMatrix, setBrightnessMatrix] = useState<BrightnessMatrix>(cloneBrightness(INITIAL_BRIGHTNESS_MATRIX));
  const [previewMode, setPreviewMode] = useState<'start' | 'goal'>('start');
  const [selectedGoalVariantIndex, setSelectedGoalVariantIndex] = useState(0);
  const [selectedFace, setSelectedFace] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [headerActionsHost, setHeaderActionsHost] = useState<HTMLElement | null>(null);
  const [playRequest, setPlayRequest] = useState<CubePlayRequest | null>(null);
  const playCounterRef = useRef(0);
  const syncPhase = useCloudSyncStore((s) => s.phase);
  const [previewHeight, setPreviewHeight] = useState(readPreviewHeight);

  useEffect(() => {
    setHeaderActionsHost(document.getElementById('global-editor-actions'));
  }, []);

  useEffect(() => {
    localStorage.setItem(EDITOR_PREVIEW_HEIGHT_KEY, String(previewHeight));
  }, [previewHeight]);

  useEffect(() => {
    const clampPreviewHeight = () => {
      setPreviewHeight((height) => Math.min(getMaxPreviewHeight(), Math.max(MIN_PREVIEW_HEIGHT, height)));
    };
    clampPreviewHeight();
    window.addEventListener('resize', clampPreviewHeight);
    return () => window.removeEventListener('resize', clampPreviewHeight);
  }, []);

  const startWorkspaceResize = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = previewHeight;

    const onMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientY - startY;
      const next = startHeight + delta;
      const maxHeight = getMaxPreviewHeight();
      setPreviewHeight(Math.min(maxHeight, Math.max(MIN_PREVIEW_HEIGHT, next)));
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [previewHeight]);

  const handleTabBarResizeStart = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const offsetY = event.clientY - rect.top;
    if (offsetY > 8) return;
    startWorkspaceResize(event);
  }, [startWorkspaceResize]);

  useEffect(() => {
    if (!levelSkillMap && !isMapLoading) void refreshMap();
  }, [levelSkillMap, isMapLoading, refreshMap]);

  const aiRecommendSummary = useMemo(() => {
    if (!level) return null;
    const primary = getPrimary(level.id);
    const skill = primary ? skills.find((s) => s.id === primary.skillId) : undefined;
    const status = getLevelRecommendStatus(level, primary, skill);
    return {
      primary,
      skill,
      status,
      label: skill
        ? `${skill.stage.toUpperCase()} · ${skill.displayNameZh}`
        : primary
          ? primary.skillId
          : '未配置',
      teachMode: primary?.teachMode ?? '—',
      difficulty: primary ? String(primary.formulaDifficulty) : '—',
    };
  }, [level, getPrimary, skills]);

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
    setGoalStateMatrices(level.goalStateMatrices?.map(cloneStateMatrix) ?? undefined);
    setLiveStateMatrix(cloneStateMatrix(level.startStateMatrix));
    setBrightnessMatrix(cloneBrightness(level.brightnessMatrix));
    setPreviewMode('start');
    setSelectedGoalVariantIndex(0);
    setActiveTab('meta');
    setSaveError(null);
    setSaveNotice(null);
    // 只在切换关卡时重置表单，避免目录状态更新覆盖尚未保存的编辑内容。
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [level?.id]);

  useEffect(() => {
    if (!formulaAdoptionRequest || !level) return;
    if (formulaAdoptionRequest.kind === 'rotation') {
      const formula = formulaAdoptionRequest.formula;
      const target = formulaAdoptionRequest.target;
      setFormulaText(formula);
      setFormulaTarget(target);
      setActiveTab('formula');
      if (formulaAdoptionRequest.autoApply !== false) {
        try {
          const derived = deriveLevelFormulaPreset(formula, target);
          setStartStateMatrix(cloneStateMatrix(derived.startStateMatrix));
          setGoalStateMatrix(cloneStateMatrix(derived.goalStateMatrix));
          setGoalStateMatrices(undefined);
          setSelectedGoalVariantIndex(0);
          setLiveStateMatrix(cloneStateMatrix(derived.startStateMatrix));
          setBrightnessMatrix(cloneBrightness(derived.brightnessMatrix));
          setPreviewMode('start');
          setSaveError(null);
          setSaveNotice(`AI 已应用旋转公式（${target.toUpperCase()}），起始/目标态已生成。请检查后保存关卡。`);
        } catch (error) {
          setSaveError(error instanceof Error ? error.message : String(error));
          setSaveNotice('公式已写入编辑器，但自动应用失败，请手动点「应用公式」。');
        }
      }
    } else {
      setGuidanceFormulaText(formulaAdoptionRequest.formula);
      setActiveTab('guidance');
      setSaveNotice('AI 已写入指引公式，请检查后保存关卡。');
    }
    clearFormulaAdoptionRequest();
  }, [formulaAdoptionRequest, level, clearFormulaAdoptionRequest]);

  const chapter = level ? chapters.find((c) => c.id === level.chapterId) : undefined;

  const allGoalVariants = useMemo(() => {
    if (!goalStateMatrix) return [];
    return resolveGoalVariantList(goalStateMatrix, goalStateMatrices);
  }, [goalStateMatrix, goalStateMatrices]);

  const isYawGoalSet = useMemo(() => {
    if (!goalStateMatrix || !goalStateMatrices || goalStateMatrices.length <= 1) return false;
    return isYawEquivalentGoalSet(goalStateMatrix, goalStateMatrices);
  }, [goalStateMatrix, goalStateMatrices]);

  const previewStateMatrix = liveStateMatrix ?? startStateMatrix;

  const applyManualToken = useCallback((token: string) => {
    const base = liveStateMatrix ?? startStateMatrix;
    if (!base) return;
    try {
      const next = applyTokensToState(base, [token]);
      setLiveStateMatrix(cloneStateMatrix(next));
      const moves = expandTokenToLayerMoves(token);
      if (moves.length > 0) {
        playCounterRef.current += 1;
        setPlayRequest({ id: playCounterRef.current, moves });
      }
    } catch {
      // 无效记号忽略
    }
  }, [liveStateMatrix, startStateMatrix]);

  const syncGoalVariants = useCallback((variants: StateMatrix[]) => {
    const cloned = variants.map(cloneStateMatrix);
    setGoalStateMatrix(cloned[0]);
    if (cloned.length <= 1) {
      setGoalStateMatrices(undefined);
    } else {
      setGoalStateMatrices(cloned);
    }
  }, []);

  const handlePreviewStart = useCallback(() => {
    if (!startStateMatrix) return;
    setLiveStateMatrix(cloneStateMatrix(startStateMatrix));
    setPreviewMode('start');
  }, [startStateMatrix]);

  const handlePreviewGoal = useCallback((index: number) => {
    const matrix = allGoalVariants[index];
    if (!matrix) return;
    setLiveStateMatrix(cloneStateMatrix(matrix));
    setSelectedGoalVariantIndex(index);
    setPreviewMode('goal');
  }, [allGoalVariants]);

  const captureStartState = useCallback(() => {
    if (!liveStateMatrix) return;
    setStartStateMatrix(cloneStateMatrix(liveStateMatrix));
    setFormulaText('');
    setPreviewMode('start');
    setSaveError(null);
    setSaveNotice('已捕获为初始状态。旋转公式已清空，请保存关卡。');
  }, [liveStateMatrix]);

  const captureGoalState = useCallback(() => {
    if (!liveStateMatrix) return;
    const list = allGoalVariants.length > 0
      ? allGoalVariants.map(cloneStateMatrix)
      : [cloneStateMatrix(liveStateMatrix)];
    list[selectedGoalVariantIndex] = cloneStateMatrix(liveStateMatrix);
    syncGoalVariants(list);
    setFormulaText('');
    setPreviewMode('goal');
    setSaveError(null);
    setSaveNotice(`已捕获为${formatGoalVariantLabel(selectedGoalVariantIndex)}。旋转公式已清空，请保存关卡。`);
  }, [allGoalVariants, liveStateMatrix, selectedGoalVariantIndex, syncGoalVariants]);

  const formulaPreviewText = useMemo(() => {
    const trimmed = formulaText.trim();
    if (!trimmed) {
      return `未输入公式。仍可点击「应用公式」，将按 ${formulaTarget.toUpperCase()} 生成默认初始态、目标态与亮度掩码（无公式时初始态与目标态相同）。`;
    }
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
      goalStateMatrices: allGoalVariants.length > 1 ? allGoalVariants : undefined,
      brightnessMatrix,
      guidanceFormula: formula,
    });
    return summary.status === 'ready' ? `校验通过，可生成 ${summary.stepCount} 步流水灯指引。` : summary.message;
  }, [guidanceFormulaText, level, startStateMatrix, goalStateMatrix, allGoalVariants, brightnessMatrix]);

  const applyFormula = () => {
    const trimmed = formulaText.trim();
    try {
      const derived = deriveLevelFormulaPreset(trimmed, formulaTarget);
      setStartStateMatrix(cloneStateMatrix(derived.startStateMatrix));
      setGoalStateMatrix(cloneStateMatrix(derived.goalStateMatrix));
      setGoalStateMatrices(undefined);
      setSelectedGoalVariantIndex(0);
      setLiveStateMatrix(cloneStateMatrix(derived.startStateMatrix));
      setBrightnessMatrix(cloneBrightness(derived.brightnessMatrix));
      setPreviewMode('start');
      setSaveError(null);
      setSaveNotice(
        trimmed
          ? `已按 ${formulaTarget.toUpperCase()} 目标生成起始态。`
          : `已应用 ${formulaTarget.toUpperCase()} 默认目标（无公式，初始态与目标态相同）。`,
      );
      try {
        const moves = derived.mappedTokens.flatMap((token) => expandTokenToLayerMoves(token));
        if (moves.length > 0) {
          playCounterRef.current += 1;
          setPlayRequest({ id: playCounterRef.current, moves });
        }
      } catch {
        // 演示动画失败不影响矩阵应用
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleFormulaTokenAppended = (token: string) => {
    applyManualToken(token);
  };

  const handleGenerateYawGoalStates = () => {
    if (!goalStateMatrix) return;
    const yawVariants = buildYawEquivalentGoalStates(goalStateMatrix);
    const list = allGoalVariants.map(cloneStateMatrix);

    if (list.length > 1 && !isYawGoalSet) {
      const confirmed = window.confirm(
        '将用「目标1 绕 Y 轴四向」替换当前所有目标，是否继续？',
      );
      if (!confirmed) return;
      syncGoalVariants(yawVariants);
    } else if (list.length > yawVariants.length) {
      const confirmed = window.confirm(
        `将按目标1 重新生成前 ${yawVariants.length} 个 Y 轴四向目标，${formatGoalVariantLabel(yawVariants.length)} 及之后会保留。是否继续？`,
      );
      if (!confirmed) return;
      syncGoalVariants([...yawVariants, ...list.slice(yawVariants.length)]);
    } else {
      syncGoalVariants(yawVariants);
    }

    setSelectedGoalVariantIndex(0);
    setPreviewMode('goal');
    if (yawVariants[0]) {
      setLiveStateMatrix(cloneStateMatrix(yawVariants[0]));
    }
    setSaveNotice(
      list.length > yawVariants.length
        ? `已更新 Y 轴四向目标（前 ${yawVariants.length} 个），其余手动目标已保留。`
        : `已生成 Y 轴四向等效目标（共 ${yawVariants.length} 个），请在下方逐个核对。`,
    );
    setSaveError(null);
  };

  const handleAddGoalVariant = () => {
    if (!goalStateMatrix || !liveStateMatrix) return;
    const list = allGoalVariants.map(cloneStateMatrix);
    const next = [...list, cloneStateMatrix(liveStateMatrix)];
    syncGoalVariants(next);
    setSelectedGoalVariantIndex(next.length - 1);
    setPreviewMode('goal');
    setSaveNotice(`已添加${formatGoalVariantLabel(next.length - 1)}（当前 3D 状态）。可用缩略图核对或继续手动转动。`);
    setSaveError(null);
  };

  const handleSelectGoalVariant = (index: number) => {
    handlePreviewGoal(index);
  };

  const handleRotateGoalVariantYaw = (index: number) => {
    const list = allGoalVariants.map(cloneStateMatrix);
    if (!list[index]) return;
    list[index] = applyTokensToState(list[index], ['y']);
    syncGoalVariants(list);
    setSelectedGoalVariantIndex(index);
    setPreviewMode('goal');
    setLiveStateMatrix(cloneStateMatrix(list[index]));
  };

  const handleRemoveGoalVariant = (index: number) => {
    if (allGoalVariants.length <= 1) return;
    const list = allGoalVariants.filter((_, variantIndex) => variantIndex !== index);
    syncGoalVariants(list);
    setSelectedGoalVariantIndex(Math.min(index, list.length - 1));
  };

  const goalVariantCount = allGoalVariants.length;

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
      || JSON.stringify(goalStateMatrices ?? null) !== JSON.stringify(level.goalStateMatrices ?? null)
      || JSON.stringify(brightnessMatrix) !== JSON.stringify(level.brightnessMatrix)
    );
  }, [
    level, titleText, descriptionText, hintText, maxMovesText, star3Text, star2Text,
    formulaText, formulaTarget, guidanceFormulaText, guidanceFailureThreshold,
    startStateMatrix, goalStateMatrix, goalStateMatrices, brightnessMatrix,
  ]);

  const handleSave = async () => {
    if (!level) return;
    setSaveError(null);
    setSaveNotice(null);

    // 草稿友好：允许中途保存，缺省字段回退到当前关卡或占位值
    const title = titleText.trim() || level.title.trim() || '未命名关卡';
    const description = descriptionText.trim() || level.description.trim() || '待完善';

    const maxMoves = parsePositiveInteger(maxMovesText) ?? level.maxMoves;
    let threeStar = parsePositiveInteger(star3Text) ?? level.starThresholds[0];
    let twoStar = parsePositiveInteger(star2Text) ?? level.starThresholds[1];
    if (threeStar > twoStar) twoStar = threeStar;
    if (twoStar > maxMoves) {
      // 保持可保存：放宽最大步数而不是阻断
    }
    const effectiveMaxMoves = Math.max(maxMoves, twoStar, threeStar);
    const starThresholds = resolveStarThresholds(effectiveMaxMoves, [threeStar, twoStar]);

    const rotationFormula = formulaText.trim();
    const guidanceFormula = guidanceFormulaText.trim();
    const warnings: string[] = [];

    if (rotationFormula) {
      try {
        deriveLevelFormulaPreset(rotationFormula, formulaTarget);
      } catch (error) {
        warnings.push(`旋转公式暂未通过校验（已按草稿保存）：${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const normalizedGoals = normalizeLevelGoalStates({
      goalStateMatrix: cloneStateMatrix(goalStateMatrix ?? level.goalStateMatrix),
      goalStateMatrices: goalStateMatrices?.map(cloneStateMatrix),
    });

    const patch: Partial<LevelDefinition> = {
      title,
      description,
      hint: hintText.trim() || undefined,
      maxMoves: effectiveMaxMoves,
      starThresholds,
      startStateMatrix: cloneStateMatrix(startStateMatrix ?? level.startStateMatrix),
      ...normalizedGoals,
      brightnessMatrix: cloneBrightness(brightnessMatrix),
      rotationFormula: rotationFormula || undefined,
      rotationTarget: rotationFormula ? formulaTarget : undefined,
      guidanceFormula: guidanceFormula || undefined,
      guidanceFailureThreshold,
    };

    if (guidanceFormula) {
      const summary = getLevelGuidanceSummary({ ...level, ...patch } as LevelDefinition);
      if (summary.status !== 'ready') {
        warnings.push(`推荐解法暂未通过校验（已按草稿保存）：${summary.message}`);
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
      setGoalStateMatrices(updatedLevel.goalStateMatrices?.map(cloneStateMatrix) ?? undefined);
      setLiveStateMatrix(cloneStateMatrix(updatedLevel.startStateMatrix));
      setBrightnessMatrix(cloneBrightness(updatedLevel.brightnessMatrix));
      useUiStore.getState().clearAiTouched();
      const syncHint = syncPhase === 'cloud' || useCloudSyncStore.getState().phase === 'cloud'
        ? '关卡已保存到本地，云端后台同步中…'
        : '关卡已保存到本地。';
      setSaveNotice(warnings.length > 0 ? `${syncHint} ${warnings.join(' ')}` : syncHint);
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

  if (!level || !startStateMatrix || !goalStateMatrix || !liveStateMatrix) {
    return (
      <div className="panel panel--main editor-panel" data-tour="level-editor">
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
      <div className="panel panel--main editor-panel" data-tour="level-editor">
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

        <div className="preview-hero" style={{ height: previewHeight }}>
          <div className="preview-hero-header">
            <span className="preview-hero-title">3D 预览</span>
            <div className="segmented preview-segmented">
              <button type="button" className={`chip ${previewMode === 'start' ? 'chip-active' : ''}`} onClick={handlePreviewStart}>初始态</button>
              {allGoalVariants.length > 1 ? (
                allGoalVariants.map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    className={`chip ${previewMode === 'goal' && selectedGoalVariantIndex === index ? 'chip-active' : ''}`}
                    onClick={() => handlePreviewGoal(index)}
                  >
                    {formatGoalVariantLabel(index)}
                  </button>
                ))
              ) : (
                <button type="button" className={`chip ${previewMode === 'goal' ? 'chip-active' : ''}`} onClick={() => handlePreviewGoal(0)}>目标态</button>
              )}
            </div>
          </div>
          <CubePreview
            className="cube-preview cube-preview-editor cube-preview-resizable"
            stateMatrix={previewStateMatrix!}
            brightnessMatrix={brightnessMatrix}
            playRequest={playRequest}
            onPlayComplete={() => setPlayRequest(null)}
          />
        </div>

        <div
          className="editor-workspace-resize-handle"
          role="separator"
          aria-orientation="horizontal"
          aria-label="拖动调整编辑区高度"
          title="拖动调整 3D 预览与编辑区高度"
          onMouseDown={startWorkspaceResize}
        />

        <div className="editor-workspace">
          <div
            className="tab-bar"
            onMouseDown={handleTabBarResizeStart}
            title="在顶部边框拖拽可调整下方编辑区高度"
          >
            {(['meta', 'states', 'formula', 'brightness', 'guidance'] as Tab[]).map((tab) => (
              <button key={tab} className={`tab tab-${tab} ${activeTab === tab ? 'tab-active' : ''}`} onClick={() => setActiveTab(tab)}>
                {tab === 'meta' ? '基础信息' : tab === 'states' ? '状态编辑' : tab === 'formula' ? '自定义公式' : tab === 'brightness' ? '点亮控制' : '指引校验'}
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

          <div className="ai-recommend-summary">
            <div className="ai-recommend-summary-header">
              <strong>AI 推荐配置</strong>
              <button type="button" className="btn btn-sm" onClick={() => onOpenAiRecommend?.()}>
                前往 AI 推荐配置
              </button>
            </div>
            <div className="ai-recommend-summary-grid">
              <div><span>主能力标签</span><strong>{aiRecommendSummary?.label ?? '未配置'}</strong></div>
              <div><span>教学模式</span><strong>{aiRecommendSummary?.teachMode ? getTeachModeLabel(aiRecommendSummary.teachMode) : '—'}</strong></div>
              <div><span>推荐难度</span><strong>{aiRecommendSummary?.difficulty ?? '—'}</strong></div>
              <div>
                <span>推荐状态</span>
                <strong className={aiRecommendSummary?.status.ok ? 'rec-ok' : 'rec-bad'}>
                  {aiRecommendSummary?.status.ok ? '可推荐' : '不可推荐'}
                </strong>
              </div>
            </div>
            {aiRecommendSummary && !aiRecommendSummary.status.ok && aiRecommendSummary.status.reasons.length > 0 && (
              <ul className="ai-recommend-reasons">
                {aiRecommendSummary.status.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
          </div>

          <div><button className="btn btn-danger" onClick={handleDelete}>删除当前关卡</button></div>
        </div>
      )}

      {activeTab === 'states' && (
        <div className="tab-content tab-content-states">
          <div className="state-edit-banner">
            <p>
              初始态与目标态相互独立：在上方 3D 预览中手动转动魔方，再点「捕获」写入对应状态。
              点亮控制在「点亮控制」页单独配置，不会随公式自动覆盖（除非点「应用公式」）。
            </p>
          </div>

          <div className="field-row">
            <button type="button" className="btn" onClick={handlePreviewStart}>预览初始</button>
            <button type="button" className="btn" onClick={() => handlePreviewGoal(selectedGoalVariantIndex)}>预览目标</button>
          </div>
          <div className="field-row">
            <button type="button" className="btn capture-btn" onClick={captureStartState}>捕获为初始</button>
            <button type="button" className="btn capture-btn" onClick={captureGoalState}>捕获为当前目标</button>
          </div>

          <EditorMovePad onMove={applyManualToken} />

          <div className="goal-variant-paths">
            <div className={`goal-variant-path ${isYawGoalSet ? 'goal-variant-path-active' : ''}`}>
              <div className="goal-variant-path-title">快捷：Y 轴四向等效</div>
              <p className="hint-text">
                玩家把整个魔方绕竖直轴转 90° 仍算过关时，一键生成目标1～4。
              </p>
              <button className="btn" type="button" onClick={handleGenerateYawGoalStates}>
                {isYawGoalSet && allGoalVariants.length > 4
                  ? '重新生成前四个 Y 轴四向'
                  : isYawGoalSet
                    ? '重新生成 Y 轴四向'
                    : allGoalVariants.length > 1
                      ? '替换为 Y 轴四向'
                      : '一键生成目标1～4'}
              </button>
            </div>
            <div className={`goal-variant-path ${allGoalVariants.length > 1 && !isYawGoalSet ? 'goal-variant-path-active' : ''}`}>
              <div className="goal-variant-path-title">新增目标情况</div>
              <p className="hint-text">
                先把 3D 预览转到期望朝向，再点「新增情况」保存当前画面为目标2、目标3…
              </p>
              <button className="btn" type="button" onClick={handleAddGoalVariant}>
                {allGoalVariants.length <= 1
                  ? '新增情况 2'
                  : `新增情况 ${allGoalVariants.length + 1}`}
              </button>
            </div>
          </div>

          <p className="hint-text goal-variant-summary">
            {goalVariantCount <= 1
              ? '当前：仅目标1。可手动转动后捕获，或一键生成 Y 轴四向。'
              : isYawGoalSet && goalVariantCount > 4
                ? `当前：Y 轴四向（前 4 个）+ 手动补充（${goalVariantCount - 4} 个），共 ${goalVariantCount} 个可过关目标。`
                : isYawGoalSet
                  ? `当前：Y 轴四向等效（${goalVariantCount} 个）。`
                  : `当前：${goalVariantCount} 种目标状态，App 命中任一即可结算。`}
          </p>

          <div className="goal-variant-section">
            <div className="goal-variant-section-header">
              <strong>目标态预览（{goalVariantCount}）</strong>
              {previewMode === 'goal' && allGoalVariants.length > 0 && (
                <div className="goal-variant-actions">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => handleRotateGoalVariantYaw(selectedGoalVariantIndex)}
                  >
                    当前目标绕 Y 转 90°
                  </button>
                </div>
              )}
            </div>
            <div className="goal-variant-grid">
              {allGoalVariants.map((variant, index) => (
                <div
                  key={index}
                  className={`goal-variant-card ${previewMode === 'goal' && selectedGoalVariantIndex === index ? 'is-selected' : ''}`}
                  onClick={() => handleSelectGoalVariant(index)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleSelectGoalVariant(index);
                    }
                  }}
                >
                  <div className="goal-variant-card-header">
                    <span>{formatGoalVariantLabel(index)}</span>
                    <div className="goal-variant-card-actions">
                      <button
                        type="button"
                        title="绕 Y 轴转 90°"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleRotateGoalVariantYaw(index);
                        }}
                      >
                        Y
                      </button>
                      <button
                        type="button"
                        title="删除此目标"
                        disabled={allGoalVariants.length <= 1}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleRemoveGoalVariant(index);
                        }}
                      >
                        删
                      </button>
                    </div>
                  </div>
                  <CubePreview
                    className="cube-preview cube-preview-thumb"
                    stateMatrix={variant}
                    brightnessMatrix={brightnessMatrix}
                    hideViewControls
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'formula' && (
        <div className="tab-content tab-content-formula">
          <div className="state-edit-banner">
            <p>
              默认朝向：白顶绿前。点击「应用公式」写入初始态、目标态与亮度掩码；公式留空时也可应用，将生成该目标类型的默认状态。
              若已手动捕获状态，应用公式会覆盖它们。
            </p>
          </div>
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
          <FormulaKeyboard value={formulaText} onChange={setFormulaText} onTokenAppended={handleFormulaTokenAppended} />
          <div className="field-row">
            <button className="btn btn-primary" type="button" onClick={applyFormula}>应用公式</button>
          </div>
          <div className="preview-card">{formulaPreviewText}</div>
          <EditorMovePad onMove={applyManualToken} />
        </div>
      )}

      {activeTab === 'brightness' && (
        <div className="tab-content tab-content-brightness">
          <p className="hint-text">点亮掩码独立于初始/目标态。在此配置哪些贴纸参与过关判定，保存后生效。</p>
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
              {LEVEL_GUIDANCE_FAILURE_THRESHOLD_OPTIONS.map((threshold) => (
                <button
                  key={threshold}
                  className={`chip ${guidanceFailureThreshold === threshold ? 'chip-active' : ''}`}
                  onClick={() => {
                    setGuidanceFailureThreshold(threshold);
                    if (level) {
                      updateLevel(level.id, { guidanceFailureThreshold: threshold });
                    }
                  }}
                >
                  {threshold === -1 ? '不开启' : `${threshold} 次`}
                </button>
              ))}
            </div>
          </div>
          <p className="hint-text">
            {guidanceFailureThreshold === -1
              ? '不开启：本关永不显示箭头演示与流水灯提示。'
              : guidanceFailureThreshold === 0
                ? '0 次：进入本关即开启箭头演示与流水灯提示。'
                : `${guidanceFailureThreshold} 次：连续失败 ${guidanceFailureThreshold} 次后开启箭头演示与流水灯提示。`}
            {' '}当前：{formatGuidanceFailureThresholdLabel(guidanceFailureThreshold)}
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
