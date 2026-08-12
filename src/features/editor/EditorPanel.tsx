import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useCatalogStore } from '@/shared/store/useCatalogStore';
import { useUiStore } from '@/shared/store/useUiStore';
import { useLevelSkillMapStore } from '@/shared/store/useLevelSkillMapStore';
import { useSkillGraphStore } from '@/shared/store/useSkillGraphStore';
import { pushAllRemote } from '@/shared/store/localRemoteSave';
import {
  buildYawEquivalentGoalStates,
  deriveLevelDebugFormulaPreset,
  DEFAULT_LEVEL_DEBUG_ORIENTATION,
  formatChapterLevelOrder,
  formatGuidanceFailureThresholdLabel,
  GUIDANCE_UNLOCK_PLAYBACK_FLOW_STEPS,
  formatLevelDebugOrientation,
  getLevelGuidanceSummary,
  getMinimumStarThresholds,
  getPhysicalFaceForColor,
  gripFaceToPhysicalFace,
  isValidDebugFrontColor,
  isYawEquivalentGoalSet,
  LEVEL_DEBUG_FRONT_FACE_OPTIONS,
  LEVEL_DEBUG_TOP_FACE_OPTIONS,
  LEVEL_GUIDANCE_FAILURE_THRESHOLD_OPTIONS,
  normalizeLevelGoalStates,
  resolveDebugFrontColor,
  resolveLevelGuidanceFailureThreshold,
  resolveStarThresholds,
  toPhysicalTokensFromGrip,
  formatLevelFormulaTargetLabel,
  LEVEL_FORMULA_BUILTIN_TARGETS,
  type LevelDefinition,
  type LevelFormulaTarget,
  type LevelGuidanceFailureThreshold,
} from '@/core/levels';
import {
  expandTokenToLayerMoves,
  applyTokensToState,
  invertReverseTokens,
  resolveOrientationRecord,
  type DevCustomOrientation,
} from '@/core/formula';
import { getLevelRecommendStatus, getTeachModeLabel } from '@/core/skill-graph/utils';
import {
  INITIAL_BRIGHTNESS_MATRIX,
  INITIAL_STATE_MATRIX,
  colorIndexToHex,
  findInitialPositionByStateId,
  type BrightnessMatrix,
  type StateMatrix,
} from '@/core/cube';
import { CubePreview } from '@/features/preview-3d/CubePreview';
import type { CubePlayRequest } from '@/features/preview-3d/CubeScene';
import { FormulaKeyboard } from './FormulaKeyboard';
import { EditorMovePad } from './EditorMovePad';

const FACE_NAMES = ['U', 'L', 'F', 'R', 'B', 'D'] as const;
type GripFaceName = (typeof FACE_NAMES)[number];

type AuthoringMode = 'formula' | 'brightness' | 'manual' | null;

type PendingFormulaApply = {
  startStateMatrix: StateMatrix;
  brightnessMatrix: BrightnessMatrix;
};

const defaultGoalLabel = (index: number, target: LevelFormulaTarget, label?: string) =>
  `${formatLevelFormulaTargetLabel(target, label)}-目标${index + 1}`;

const orientationEquals = (
  a: DevCustomOrientation | undefined,
  b: DevCustomOrientation | undefined,
): boolean => {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.topColor === b.topColor && a.frontColor === b.frontColor;
};

const gripFaceToPhysicalIndex = (
  gripFace: GripFaceName,
  orientation: DevCustomOrientation,
): number => {
  const { faceToColor } = resolveOrientationRecord(orientation);
  return getPhysicalFaceForColor(faceToColor[gripFace]);
};

const stateMatricesEqual = (a: StateMatrix, b: StateMatrix): boolean => {
  for (let face = 0; face < 6; face += 1) {
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        if (a[face][row][col] !== b[face][row][col]) return false;
      }
    }
  }
  return true;
};

type OrientationOption = {
  value: DevCustomOrientation['topColor'];
  label: string;
  disabled?: boolean;
};

/** 朝向按钮边框色：近白用石板灰，保证彩色描边可见 */
const orientationChipBorder = (colorIndex: number): string => {
  const hex = colorIndexToHex(colorIndex);
  return hex.toLowerCase() === '#f8fafc' ? '#94A3B8' : hex;
};

const authoringPathLabel = (mode: AuthoringMode): string => {
  switch (mode) {
    case 'formula':
      return '自定义公式';
    case 'brightness':
      return '点亮控制';
    case 'manual':
      return '状态编辑捕获';
    default:
      return '尚未指定';
  }
};

function OrientationMappingBlock({
  orientation,
  orientationText,
  frontOptions,
  onChange,
  locked = false,
  lockHint,
}: {
  orientation: DevCustomOrientation;
  orientationText: string;
  frontOptions: OrientationOption[];
  onChange: (next: DevCustomOrientation) => void;
  locked?: boolean;
  lockHint?: string;
}) {
  return (
    <div className={`formula-orientation-card ${locked ? 'is-locked' : ''}`}>
      <div className="formula-orientation-title">魔方朝向映射</div>
      {locked && lockHint ? (
        <p className="formula-orientation-lock-hint">{lockHint}</p>
      ) : null}
      <div className="orientation-field">
        <span className="orientation-field-label">顶色</span>
        <div className="orientation-chip-row" role="group" aria-label="顶色">
          {LEVEL_DEBUG_TOP_FACE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`orientation-chip ${orientation.topColor === option.value ? 'is-active' : ''}`}
              style={{
                '--orientation-color': colorIndexToHex(option.value),
                '--orientation-border': orientationChipBorder(option.value),
              } as CSSProperties}
              disabled={locked}
              onClick={() => onChange({
                topColor: option.value,
                frontColor: resolveDebugFrontColor(option.value, orientation.frontColor),
              })}
            >
              <span className="orientation-chip-swatch" aria-hidden />
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="orientation-field">
        <span className="orientation-field-label">前色</span>
        <div className="orientation-chip-row" role="group" aria-label="前色">
          {frontOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`orientation-chip ${orientation.frontColor === option.value ? 'is-active' : ''} ${option.disabled ? 'is-disabled' : ''}`}
              style={{
                '--orientation-color': colorIndexToHex(option.value),
                '--orientation-border': orientationChipBorder(option.value),
              } as CSSProperties}
              disabled={locked || option.disabled}
              title={option.disabled ? '不可与顶色相同或相对' : undefined}
              onClick={() => {
                if (!isValidDebugFrontColor(orientation.topColor, option.value)) return;
                onChange({
                  topColor: orientation.topColor,
                  frontColor: option.value,
                });
              }}
            >
              <span className="orientation-chip-swatch" aria-hidden />
              {option.label}
            </button>
          ))}
        </div>
        <p className="orientation-field-hint">灰色选项不可用：不能与顶色相同或相对</p>
      </div>
      <p className="formula-orientation-grip">当前握持：{orientationText}</p>
    </div>
  );
}

function GuidanceThresholdBlock({
  threshold,
  onChange,
}: {
  threshold: LevelGuidanceFailureThreshold;
  onChange: (next: LevelGuidanceFailureThreshold) => void;
}) {
  return (
    <div className="guidance-threshold-block">
      <div className="guidance-threshold-title">指引开启条件</div>
      <div className="guidance-threshold-row" role="group" aria-label="指引开启条件">
        {LEVEL_GUIDANCE_FAILURE_THRESHOLD_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            className={`guidance-threshold-chip ${threshold === option ? 'is-active' : ''}`}
            onClick={() => onChange(option)}
          >
            {option === -1 ? '不开启' : `${option} 次`}
          </button>
        ))}
      </div>
      <p className="guidance-threshold-summary">
        {threshold === -1
          ? '不开启：本关永不播放音乐/箭头/公式演示，也不下发流水灯指引。'
          : threshold === 0
            ? '0 次：进入本关即自动开启指引。'
            : `${threshold} 次：连续失败 ${threshold} 次后解锁指引。`}
      </p>
      {threshold !== -1 && (
        <ul className="guidance-flow-list" aria-label="指引统一播放流程">
          {GUIDANCE_UNLOCK_PLAYBACK_FLOW_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
          {threshold === 0 && (
            <li>0 次自动开启时不会重复创建第二个关卡记录。</li>
          )}
        </ul>
      )}
      <p className="guidance-threshold-current">
        当前：{formatGuidanceFailureThresholdLabel(threshold)}
      </p>
    </div>
  );
}

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

type Tab = 'meta' | 'states' | 'formula' | 'brightness';

export function EditorPanel({ onOpenAiRecommend }: { onOpenAiRecommend?: () => void } = {}) {
  const selectedLevelId = useUiStore((s) => s.selectedLevelId);
  const selectLevel = useUiStore((s) => s.selectLevel);
  const formulaAdoptionRequest = useUiStore((s) => s.formulaAdoptionRequest);
  const clearFormulaAdoptionRequest = useUiStore((s) => s.clearFormulaAdoptionRequest);
  const { levels, chapters, hasUnsavedChanges, updateLevel, deleteLevel, saveLocal } = useCatalogStore();
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
  const [rotationTargetLabel, setRotationTargetLabel] = useState('');
  const [customTargetDraft, setCustomTargetDraft] = useState('');
  const [customTargetNames, setCustomTargetNames] = useState<string[]>([]);
  const [formulaOrientation, setFormulaOrientation] = useState<DevCustomOrientation>(() => ({
    ...DEFAULT_LEVEL_DEBUG_ORIENTATION,
  }));
  const [guidanceFormulaText, setGuidanceFormulaText] = useState('');
  const [guidanceFailureThreshold, setGuidanceFailureThreshold] = useState<LevelGuidanceFailureThreshold>(3);
  const [startStateMatrix, setStartStateMatrix] = useState<StateMatrix | null>(null);
  const [goalStateMatrix, setGoalStateMatrix] = useState<StateMatrix | null>(null);
  const [goalStateMatrices, setGoalStateMatrices] = useState<StateMatrix[] | undefined>(undefined);
  const [liveStateMatrix, setLiveStateMatrix] = useState<StateMatrix | null>(null);
  const [brightnessMatrix, setBrightnessMatrix] = useState<BrightnessMatrix>(cloneBrightness(INITIAL_BRIGHTNESS_MATRIX));
  const [previewMode, setPreviewMode] = useState<'start' | 'goal'>('start');
  const [selectedGoalVariantIndex, setSelectedGoalVariantIndex] = useState(0);
  const [selectedGripFace, setSelectedGripFace] = useState<GripFaceName>('U');
  const [authoringMode, setAuthoringMode] = useState<AuthoringMode>(null);
  const [goalVariantLabels, setGoalVariantLabels] = useState<string[]>([]);
  const [goalNameDraft, setGoalNameDraft] = useState('');
  const [formulaAppliedOk, setFormulaAppliedOk] = useState(false);
  const [formulaVerifiedOk, setFormulaVerifiedOk] = useState(false);
  const [startCapturedOk, setStartCapturedOk] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [headerActionsHost, setHeaderActionsHost] = useState<HTMLElement | null>(null);
  const [playRequest, setPlayRequest] = useState<CubePlayRequest | null>(null);
  const playCounterRef = useRef(0);
  const playingRef = useRef(false);
  const pendingPlayApplyRef = useRef<(() => void) | null>(null);
  const pendingFormulaApplyRef = useRef<PendingFormulaApply | null>(null);
  const pendingFormulaNoticeRef = useRef<string | null>(null);
  const pendingGuidancePreviewRef = useRef<StateMatrix | null>(null);
  const pendingGuidancePreviewNoticeRef = useRef<string | null>(null);
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
    setRotationTargetLabel(level.rotationTargetLabel ?? '');
    setCustomTargetNames(
      level.rotationTarget === 'custom' && level.rotationTargetLabel?.trim()
        ? [level.rotationTargetLabel.trim()]
        : [],
    );
    setCustomTargetDraft('');
    setFormulaOrientation({ ...(level.formulaOrientation ?? DEFAULT_LEVEL_DEBUG_ORIENTATION) });
    setGuidanceFormulaText(level.guidanceFormula ?? '');
    setGuidanceFailureThreshold(resolveLevelGuidanceFailureThreshold(level.guidanceFailureThreshold));
    setStartStateMatrix(cloneStateMatrix(level.startStateMatrix));
    setGoalStateMatrix(cloneStateMatrix(level.goalStateMatrix));
    setGoalStateMatrices(level.goalStateMatrices?.map(cloneStateMatrix) ?? undefined);
    const goalCount = Math.max(1, level.goalStateMatrices?.length ?? 1);
    const target = level.rotationTarget ?? 'f2l';
    const label = level.rotationTargetLabel;
    setGoalVariantLabels(Array.from({ length: goalCount }, (_, i) => defaultGoalLabel(i, target, label)));
    setGoalNameDraft(defaultGoalLabel(0, target, label));
    setFormulaAppliedOk(Boolean(level.rotationFormula?.trim()));
    setFormulaVerifiedOk(false);
    setStartCapturedOk(false);
    setLiveStateMatrix(cloneStateMatrix(level.startStateMatrix));
    setBrightnessMatrix(cloneBrightness(level.brightnessMatrix));
    setPreviewMode('start');
    setSelectedGoalVariantIndex(0);
    setAuthoringMode(null);
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
          const derived = deriveLevelDebugFormulaPreset(formula, target, formulaOrientation);
          const goal = goalStateMatrix ?? derived.goalStateMatrix;
          const start = applyTokensToState(goal, invertReverseTokens(derived.mappedTokens));
          if (!goalStateMatrix) {
            setGoalStateMatrix(cloneStateMatrix(goal));
            setGoalStateMatrices(undefined);
            setSelectedGoalVariantIndex(0);
          }
          setStartStateMatrix(cloneStateMatrix(start));
          setLiveStateMatrix(cloneStateMatrix(start));
          setBrightnessMatrix(cloneBrightness(derived.brightnessMatrix));
          setPreviewMode('start');
          setAuthoringMode('formula');
          setGuidanceFormulaText('');
          setSaveError(null);
          setSaveNotice(
            goalStateMatrix
              ? `AI 已按当前目标逆推初始态（${target.toUpperCase()}）。请检查后保存关卡。`
              : `AI 已套用 ${target.toUpperCase()} 默认目标并逆推初始态。请检查后保存关卡。`,
          );
        } catch (error) {
          setSaveError(error instanceof Error ? error.message : String(error));
          setSaveNotice('公式已写入编辑器，但自动应用失败，请手动点「应用公式」。');
        }
      }
    } else {
      setGuidanceFormulaText(formulaAdoptionRequest.formula);
      setActiveTab('brightness');
      setSaveNotice('AI 已写入推荐解法，请在点亮控制中校验后保存关卡。');
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
    if (playingRef.current) return;
    const base = liveStateMatrix ?? startStateMatrix;
    if (!base) return;
    try {
      const [physicalToken] = toPhysicalTokensFromGrip([token], formulaOrientation);
      const moves = expandTokenToLayerMoves(physicalToken);
      if (moves.length === 0) {
        setLiveStateMatrix(cloneStateMatrix(applyTokensToState(base, [physicalToken])));
        return;
      }
      playCounterRef.current += 1;
      const requestId = playCounterRef.current;
      pendingPlayApplyRef.current = () => {
        setLiveStateMatrix((prev) => {
          const current = prev ?? startStateMatrix;
          if (!current) return prev;
          return cloneStateMatrix(applyTokensToState(current, [physicalToken]));
        });
      };
      playingRef.current = true;
      setPlayRequest({ id: requestId, moves });
    } catch {
      // 无效记号忽略
    }
  }, [formulaOrientation, liveStateMatrix, startStateMatrix]);

  const handlePlayComplete = useCallback((_requestId: number) => {
    if (pendingGuidancePreviewRef.current) {
      setLiveStateMatrix(cloneStateMatrix(pendingGuidancePreviewRef.current));
      pendingGuidancePreviewRef.current = null;
      setSaveNotice(pendingGuidancePreviewNoticeRef.current);
      pendingGuidancePreviewNoticeRef.current = null;
    } else if (pendingFormulaApplyRef.current) {
      const pending = pendingFormulaApplyRef.current;
      pendingFormulaApplyRef.current = null;
      setStartStateMatrix(cloneStateMatrix(pending.startStateMatrix));
      setLiveStateMatrix(cloneStateMatrix(pending.startStateMatrix));
      setBrightnessMatrix(cloneBrightness(pending.brightnessMatrix));
      setPreviewMode('start');
      setSaveNotice(pendingFormulaNoticeRef.current);
      pendingFormulaNoticeRef.current = null;
    } else if (pendingPlayApplyRef.current) {
      pendingPlayApplyRef.current();
      pendingPlayApplyRef.current = null;
    }
    playingRef.current = false;
    setPlayRequest(null);
  }, []);

  const syncGoalVariants = useCallback((variants: StateMatrix[], labels?: string[]) => {
    const cloned = variants.map(cloneStateMatrix);
    setGoalStateMatrix(cloned[0]);
    if (cloned.length <= 1) {
      setGoalStateMatrices(undefined);
    } else {
      setGoalStateMatrices(cloned);
    }
    if (labels) {
      setGoalVariantLabels(labels.slice(0, cloned.length));
    } else {
      setGoalVariantLabels((prev) => {
        const next = cloned.map((_, i) => prev[i] ?? defaultGoalLabel(i, formulaTarget, rotationTargetLabel));
        return next;
      });
    }
  }, [formulaTarget, rotationTargetLabel]);

  const invalidateFormulaProgress = useCallback(() => {
    setFormulaAppliedOk(false);
    setFormulaVerifiedOk(false);
    setStartCapturedOk(false);
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

  /** 起终态只能由一条路径定义；切换时确认并清理对侧公式字段 */
  const ensureAuthoringPath = useCallback((next: Exclude<AuthoringMode, null>): boolean => {
    const hasFormulaDraft = Boolean(formulaText.trim());
    const hasGuidanceDraft = Boolean(guidanceFormulaText.trim());

    if (authoringMode === next) {
      return true;
    }

    if (authoringMode === 'manual' && next === 'brightness') {
      return true;
    }

    if (authoringMode === 'brightness' && next === 'manual') {
      return true;
    }

    if (authoringMode === null) {
      if (next === 'formula' && hasGuidanceDraft) {
        const confirmed = window.confirm(
          '已填写推荐解法。改用「自定义公式」定义起终态将清空推荐解法。是否继续？',
        );
        if (!confirmed) return false;
        setGuidanceFormulaText('');
      }
      if (next === 'brightness' && hasFormulaDraft) {
        const confirmed = window.confirm(
          '已填写旋转公式。改用「点亮控制」路径将清空旋转公式。是否继续？',
        );
        if (!confirmed) return false;
        setFormulaText('');
      }
      if (next === 'manual' && (hasFormulaDraft || hasGuidanceDraft)) {
        const confirmed = window.confirm(
          '手动捕获起终态将清空旋转公式与推荐解法。是否继续？',
        );
        if (!confirmed) return false;
        setFormulaText('');
        setGuidanceFormulaText('');
      }
      return true;
    }

    if (next === 'formula') {
      const confirmed = window.confirm(
        `当前起终态由「${authoringPathLabel(authoringMode)}」定义。改用「自定义公式」将相对目标逆推初始态（保留或套用目标），并清空推荐解法。是否继续？`,
      );
      if (!confirmed) return false;
      setGuidanceFormulaText('');
      return true;
    }

    if (next === 'brightness') {
      const confirmed = window.confirm(
        `当前起终态由「${authoringPathLabel(authoringMode)}」定义。改用「点亮控制」将清空旋转公式；起终态请继续用状态编辑维护，亮度与推荐解法在本页配置。是否继续？`,
      );
      if (!confirmed) return false;
      setFormulaText('');
      return true;
    }

    if (next === 'manual') {
      const confirmed = window.confirm(
        `当前起终态由「${authoringPathLabel(authoringMode)}」定义。改为手动捕获将清空旋转公式与推荐解法。是否继续？`,
      );
      if (!confirmed) return false;
      setFormulaText('');
      setGuidanceFormulaText('');
      return true;
    }

    return true;
  }, [authoringMode, formulaText, guidanceFormulaText]);

  const switchToAuthoringPath = useCallback((next: Exclude<AuthoringMode, null>): boolean => {
    if (!ensureAuthoringPath(next)) return false;
    setAuthoringMode(next);
    setSaveError(null);
    setSaveNotice(`已切换为「${authoringPathLabel(next)}」路径定义起终态。`);
    return true;
  }, [ensureAuthoringPath]);

  const captureStartState = useCallback(() => {
    if (!liveStateMatrix) return;
    if (!ensureAuthoringPath('manual')) return;
    setStartStateMatrix(cloneStateMatrix(liveStateMatrix));
    setFormulaText('');
    setGuidanceFormulaText('');
    setAuthoringMode('manual');
    setPreviewMode('start');
    setSaveError(null);
    setSaveNotice('已捕获为初始状态。旋转公式与推荐解法已清空，请保存关卡。');
  }, [ensureAuthoringPath, liveStateMatrix]);

  const captureGoalState = useCallback(() => {
    if (!liveStateMatrix) return;
    if (!ensureAuthoringPath('manual')) return;
    const list = allGoalVariants.length > 0
      ? allGoalVariants.map(cloneStateMatrix)
      : [cloneStateMatrix(liveStateMatrix)];
    list[selectedGoalVariantIndex] = cloneStateMatrix(liveStateMatrix);
    syncGoalVariants(list);
    setFormulaText('');
    setGuidanceFormulaText('');
    setAuthoringMode('manual');
    setPreviewMode('goal');
    setSaveError(null);
    setSaveNotice(`已捕获为${formatGoalVariantLabel(selectedGoalVariantIndex)}。旋转公式与推荐解法已清空，请保存关卡。`);
  }, [allGoalVariants, ensureAuthoringPath, liveStateMatrix, selectedGoalVariantIndex, syncGoalVariants]);

  const formulaOrientationText = useMemo(
    () => formatLevelDebugOrientation(formulaOrientation),
    [formulaOrientation],
  );

  const frontOrientationOptions = useMemo(
    () => LEVEL_DEBUG_FRONT_FACE_OPTIONS.map((option) => ({
      ...option,
      disabled: !isValidDebugFrontColor(formulaOrientation.topColor, option.value),
    })),
    [formulaOrientation.topColor],
  );

  const applyInvertStartFromGoal = useCallback((
    orientation: DevCustomOrientation,
    options?: { requireExistingGoal?: boolean },
  ): { start: StateMatrix; brightness: BrightnessMatrix; seededGoal: StateMatrix | null } | null => {
    const trimmed = formulaText.trim();
    if (!trimmed) {
      setSaveError('请先输入旋转公式。');
      setSaveNotice(null);
      return null;
    }
    if (formulaTarget === 'custom' && !rotationTargetLabel.trim()) {
      setSaveError('请先为自定义目标类型填写名称。');
      setSaveNotice(null);
      return null;
    }
    try {
      const derived = deriveLevelDebugFormulaPreset(trimmed, formulaTarget, orientation);
      if ((options?.requireExistingGoal || formulaTarget === 'custom') && !goalStateMatrix) {
        setSaveError('请先在点亮控制「捕获为目标类型」，再应用公式。');
        setSaveNotice(null);
        return null;
      }
      const seededGoal = goalStateMatrix ? null : derived.goalStateMatrix;
      const goal = goalStateMatrix ?? derived.goalStateMatrix;
      const start = applyTokensToState(goal, invertReverseTokens(derived.mappedTokens));
      setSaveError(null);
      return { start, brightness: derived.brightnessMatrix, seededGoal };
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
      setSaveNotice(null);
      return null;
    }
  }, [formulaText, formulaTarget, goalStateMatrix, rotationTargetLabel]);

  const currentTargetDisplayLabel = formatLevelFormulaTargetLabel(formulaTarget, rotationTargetLabel);

  const addCustomTargetType = () => {
    const name = customTargetDraft.trim();
    if (!name) {
      setSaveError('请输入自定义目标类型名称。');
      return;
    }
    setCustomTargetNames((prev) => (prev.includes(name) ? prev : [...prev, name]));
    setFormulaTarget('custom');
    setRotationTargetLabel(name);
    setCustomTargetDraft('');
    setGoalNameDraft(defaultGoalLabel(allGoalVariants.length, 'custom', name));
    setSaveError(null);
    setSaveNotice(`已添加目标类型「${name}」。点亮后可「捕获为目标类型」。`);
  };

  const selectBuiltinTarget = (target: typeof LEVEL_FORMULA_BUILTIN_TARGETS[number]) => {
    setFormulaTarget(target);
    setRotationTargetLabel('');
    setGoalNameDraft(defaultGoalLabel(allGoalVariants.length, target));
  };

  const selectCustomTarget = (name: string) => {
    setFormulaTarget('custom');
    setRotationTargetLabel(name);
    setGoalNameDraft(defaultGoalLabel(allGoalVariants.length, 'custom', name));
  };

  const applyOrientationChange = useCallback((orientation: DevCustomOrientation) => {
    if (orientationEquals(formulaOrientation, orientation)) return;
    setFormulaOrientation(orientation);
    setSaveError(null);
    setSaveNotice(
      `朝向已切换为 ${formatLevelDebugOrientation(orientation)}。点亮掩码未改（仍按贴纸 home）。`,
    );
  }, [formulaOrientation]);

  const formulaPreviewText = useMemo(() => {
    const trimmed = formulaText.trim();
    const typeLabel = formatLevelFormulaTargetLabel(formulaTarget, rotationTargetLabel);
    if (!trimmed) {
      return `当前目标类型：${typeLabel}。输入公式后点「应用公式」相对目标逆推初始（自动捕获为初始），再点「校验」。`;
    }
    try {
      const derived = deriveLevelDebugFormulaPreset(trimmed, formulaTarget, formulaOrientation);
      const view = derived.viewTokens?.join(' ') ?? derived.mappedTokens.join(' ');
      const goalHint = goalStateMatrix
        ? `将相对已捕获目标「${goalVariantLabels[selectedGoalVariantIndex] ?? '当前目标'}」逆推初始（不改点亮掩码）。`
        : formulaTarget === 'custom'
          ? '自定义类型须先在点亮控制捕获目标。'
          : `尚未捕获目标：应用时将套用 ${typeLabel} 默认已解目标再逆推。`;
      return `类型 ${typeLabel} · 握持 [${view}] → 物理 [${derived.mappedTokens.join(' ')}]。${goalHint}`;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }, [
    formulaText, formulaTarget, formulaOrientation, goalStateMatrix,
    rotationTargetLabel, goalVariantLabels, selectedGoalVariantIndex,
  ]);

  const resetFormulaToSolved = () => {
    if (!ensureAuthoringPath('formula')) return;
    setStartStateMatrix(cloneStateMatrix(INITIAL_STATE_MATRIX));
    setGoalStateMatrix(cloneStateMatrix(INITIAL_STATE_MATRIX));
    setGoalStateMatrices(undefined);
    setSelectedGoalVariantIndex(0);
    setLiveStateMatrix(cloneStateMatrix(INITIAL_STATE_MATRIX));
    setBrightnessMatrix(cloneBrightness(INITIAL_BRIGHTNESS_MATRIX));
    setFormulaText('');
    setGuidanceFormulaText('');
    setAuthoringMode('formula');
    setPreviewMode('start');
    setGoalVariantLabels([defaultGoalLabel(0, formulaTarget)]);
    setGoalNameDraft(defaultGoalLabel(0, formulaTarget));
    invalidateFormulaProgress();
    setSaveError(null);
    setSaveNotice('已还原为六面已解状态。可再设目标态并输入公式逆推初始。');
  };

  const applyFormula = () => {
    const trimmed = formulaText.trim();
    if (!trimmed) {
      setSaveError('请先输入旋转公式。');
      setSaveNotice(null);
      return;
    }
    if (!ensureAuthoringPath('formula')) return;

    const result = applyInvertStartFromGoal(formulaOrientation);
    if (!result) return;

    const typeLabel = formatLevelFormulaTargetLabel(formulaTarget, rotationTargetLabel);
    const notice = result.seededGoal
      ? `已套用 ${typeLabel} 默认目标并逆推初始态（已自动捕获为初始）。请点击「校验」。`
      : `已按目标类型「${typeLabel}」逆推初始态（已自动捕获为初始）。请点击「校验」。`;

    setGuidanceFormulaText('');
    setAuthoringMode('formula');
    if (result.seededGoal) {
      setGoalStateMatrix(cloneStateMatrix(result.seededGoal));
      setGoalStateMatrices(undefined);
      setSelectedGoalVariantIndex(0);
      setGoalVariantLabels([defaultGoalLabel(0, formulaTarget, rotationTargetLabel)]);
    }
    setStartStateMatrix(cloneStateMatrix(result.start));
    setLiveStateMatrix(cloneStateMatrix(result.start));
    setPreviewMode('start');
    setFormulaAppliedOk(true);
    setFormulaVerifiedOk(false);
    setStartCapturedOk(true);
    setSaveNotice(notice);
  };

  const applyFormulaInBrightnessFlow = () => {
    const trimmed = formulaText.trim();
    if (!trimmed) {
      setSaveError('请先输入旋转公式。');
      setSaveNotice(null);
      return;
    }
    if (!goalStateMatrix) {
      setSaveError('请先「捕获为目标类型」，再应用公式。');
      setSaveNotice(null);
      return;
    }
    if (!ensureAuthoringPath('brightness')) return;

    const result = applyInvertStartFromGoal(formulaOrientation, { requireExistingGoal: true });
    if (!result) return;

    const typeLabel = formatLevelFormulaTargetLabel(formulaTarget, rotationTargetLabel);
    setAuthoringMode('brightness');
    setStartStateMatrix(cloneStateMatrix(result.start));
    setLiveStateMatrix(cloneStateMatrix(result.start));
    setPreviewMode('start');
    setFormulaAppliedOk(true);
    setFormulaVerifiedOk(false);
    setStartCapturedOk(true);
    setSaveError(null);
    setSaveNotice(
      `已按「${goalVariantLabels[selectedGoalVariantIndex] ?? typeLabel}」逆推并自动捕获为初始态。请点击「校验」。`,
    );
  };

  const verifyFormulaFromStart = (options?: { path?: AuthoringMode }) => {
    const path = options?.path ?? 'formula';
    const trimmed = formulaText.trim();
    if (!trimmed) {
      setSaveError('请先输入旋转公式。');
      setSaveNotice(null);
      return;
    }
    if (!startStateMatrix || !goalStateMatrix) {
      setSaveError('请先应用公式得到初始态，并确保已有目标态，再点校验。');
      setSaveNotice(null);
      return;
    }
    if (!formulaAppliedOk) {
      setSaveError('请先点「应用公式」生成初始态，再校验。');
      setSaveNotice(null);
      return;
    }
    try {
      const derived = deriveLevelDebugFormulaPreset(trimmed, formulaTarget, formulaOrientation);
      const result = applyTokensToState(startStateMatrix, derived.mappedTokens);
      const matched = allGoalVariants.some((goal) => stateMatricesEqual(result, goal));
      if (!matched) {
        setFormulaVerifiedOk(false);
        setStartCapturedOk(false);
        setSaveNotice(null);
        setSaveError('校验失败：从初始态执行公式后未能还原到目标态。请检查公式、朝向或目标。');
        setLiveStateMatrix(cloneStateMatrix(result));
        return;
      }

      const notice = path === 'brightness'
        ? '校验通过。初始态已自动捕获，可保存关卡。'
        : '校验通过：从初始态执行公式可还原到目标态。';
      setSaveError(null);
      setFormulaVerifiedOk(true);
      setAuthoringMode(path === 'brightness' ? 'brightness' : 'formula');
      setPreviewMode('start');
      setLiveStateMatrix(cloneStateMatrix(startStateMatrix));

      let moves: ReturnType<typeof expandTokenToLayerMoves> = [];
      try {
        moves = derived.mappedTokens.flatMap((token) => expandTokenToLayerMoves(token));
      } catch {
        moves = [];
      }

      if (moves.length > 0 && !playingRef.current) {
        pendingGuidancePreviewRef.current = result;
        pendingGuidancePreviewNoticeRef.current = notice;
        playCounterRef.current += 1;
        playingRef.current = true;
        setPlayRequest({ id: playCounterRef.current, moves });
        setSaveNotice(`${notice} 正在演示…`);
        return;
      }

      setLiveStateMatrix(cloneStateMatrix(result));
      setSaveNotice(notice);
    } catch (error) {
      setFormulaVerifiedOk(false);
      setSaveNotice(null);
      setSaveError(error instanceof Error ? error.message : String(error));
    }
  };

  const captureNamedGoalFromLive = (mode: 'replace' | 'add') => {
    if (!liveStateMatrix) {
      setSaveError('请先在上方 3D 调整到目标外观。');
      return;
    }
    if (formulaTarget === 'custom' && !rotationTargetLabel.trim()) {
      setSaveError('请先添加并选择自定义目标类型名称，再捕获。');
      return;
    }
    if (!ensureAuthoringPath('brightness')) return;

    const name = goalNameDraft.trim()
      || defaultGoalLabel(
        mode === 'add' ? allGoalVariants.length : selectedGoalVariantIndex,
        formulaTarget,
        rotationTargetLabel,
      );

    if (mode === 'add' && allGoalVariants.length > 0) {
      const list = allGoalVariants.map(cloneStateMatrix);
      list.push(cloneStateMatrix(liveStateMatrix));
      const labels = [...goalVariantLabels.slice(0, list.length - 1), name];
      while (labels.length < list.length) {
        labels.push(defaultGoalLabel(labels.length, formulaTarget, rotationTargetLabel));
      }
      syncGoalVariants(list, labels);
      setSelectedGoalVariantIndex(list.length - 1);
      setGoalNameDraft(defaultGoalLabel(list.length, formulaTarget, rotationTargetLabel));
    } else {
      const list = allGoalVariants.length > 0
        ? allGoalVariants.map(cloneStateMatrix)
        : [cloneStateMatrix(liveStateMatrix)];
      const index = allGoalVariants.length > 0 ? selectedGoalVariantIndex : 0;
      list[index] = cloneStateMatrix(liveStateMatrix);
      const labels = [...goalVariantLabels];
      while (labels.length < list.length) {
        labels.push(defaultGoalLabel(labels.length, formulaTarget, rotationTargetLabel));
      }
      labels[index] = name;
      syncGoalVariants(list, labels);
      setSelectedGoalVariantIndex(index);
      setGoalNameDraft(defaultGoalLabel(index + 1, formulaTarget, rotationTargetLabel));
    }

    setAuthoringMode('brightness');
    setPreviewMode('goal');
    invalidateFormulaProgress();
    setSaveError(null);
    setSaveNotice(
      `已捕获为目标类型「${formatLevelFormulaTargetLabel(formulaTarget, rotationTargetLabel)} / ${name}」。公式页已同步，可去写公式并应用。`,
    );
  };

  const selectedPhysicalFace = useMemo(() => {
    try {
      return gripFaceToPhysicalIndex(selectedGripFace, formulaOrientation);
    } catch {
      return gripFaceToPhysicalIndex(selectedGripFace, DEFAULT_LEVEL_DEBUG_ORIENTATION);
    }
  }, [formulaOrientation, selectedGripFace]);

  const selectedPhysicalFaceLabel = useMemo(() => {
    try {
      return gripFaceToPhysicalFace(selectedGripFace, formulaOrientation);
    } catch {
      return selectedGripFace;
    }
  }, [formulaOrientation, selectedGripFace]);

  const guidancePreviewText = useMemo(() => {
    const formula = guidanceFormulaText.trim();
    if (!formula) return '尚未配置推荐解法，关卡列表会标记为"缺解法"。';
    if (!level || !startStateMatrix || !goalStateMatrix) {
      return '请先设置初始状态，再设置目标状态，然后再校验推荐解法。';
    }
    const summary = getLevelGuidanceSummary({
      ...level,
      startStateMatrix,
      goalStateMatrix,
      goalStateMatrices: allGoalVariants.length > 1 ? allGoalVariants : undefined,
      brightnessMatrix,
      guidanceFormula: formula,
      formulaOrientation: { ...formulaOrientation },
    });
    return summary.status === 'ready' ? `校验通过，可生成 ${summary.stepCount} 步流水灯指引。` : summary.message;
  }, [
    guidanceFormulaText, level, startStateMatrix, goalStateMatrix, allGoalVariants,
    brightnessMatrix, formulaOrientation,
  ]);

  const applyGuidanceValidation = () => {
    const formula = guidanceFormulaText.trim();
    if (!formula) {
      setSaveError('请先输入推荐解法。');
      setSaveNotice(null);
      return;
    }
    if (!level || !startStateMatrix || !goalStateMatrix) {
      setSaveError('请先设置初始状态，再设置目标状态，然后再校验。');
      setSaveNotice(null);
      return;
    }
    if (!ensureAuthoringPath('brightness')) return;
    const summary = getLevelGuidanceSummary({
      ...level,
      startStateMatrix,
      goalStateMatrix,
      goalStateMatrices: allGoalVariants.length > 1 ? allGoalVariants : undefined,
      brightnessMatrix,
      guidanceFormula: formula,
      formulaOrientation: { ...formulaOrientation },
    });
    setAuthoringMode('brightness');
    if (summary.status === 'ready') {
      setSaveError(null);
      setSaveNotice(`校验通过，可生成 ${summary.stepCount} 步流水灯指引。`);
    } else {
      setSaveNotice(null);
      setSaveError(summary.message);
    }
  };

  const onGuidanceFailureThresholdChange = useCallback((threshold: LevelGuidanceFailureThreshold) => {
    setGuidanceFailureThreshold(threshold);
    if (level) {
      updateLevel(level.id, { guidanceFailureThreshold: threshold });
    }
  }, [level, updateLevel]);

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
    const labels = goalVariantLabels.filter((_, variantIndex) => variantIndex !== index);
    syncGoalVariants(list, labels);
    setSelectedGoalVariantIndex(Math.min(index, list.length - 1));
    invalidateFormulaProgress();
  };

  const goalVariantCount = allGoalVariants.length;

  const readBrightnessAtPreviewCell = useCallback((face: number, row: number, col: number): number => {
    const state = previewStateMatrix;
    if (!state) return 0;
    const stickerId = state[face][row][col];
    const home = findInitialPositionByStateId(stickerId);
    if (!home) return 0;
    return brightnessMatrix[home.face][home.row][home.col] ?? 0;
  }, [brightnessMatrix, previewStateMatrix]);

  const toggleBrightnessAtPreviewCell = useCallback((face: number, row: number, col: number) => {
    const state = previewStateMatrix;
    if (!state) return;
    const stickerId = state[face][row][col];
    const home = findInitialPositionByStateId(stickerId);
    if (!home) return;
    const next = cloneBrightness(brightnessMatrix);
    next[home.face][home.row][home.col] = next[home.face][home.row][home.col] > 0 ? 0 : 8;
    setBrightnessMatrix(next);
  }, [brightnessMatrix, previewStateMatrix]);

  const setPreviewFaceAllBrightness = useCallback((face: number, value: number) => {
    const state = previewStateMatrix;
    if (!state) return;
    const next = cloneBrightness(brightnessMatrix);
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        const stickerId = state[face][row][col];
        const home = findInitialPositionByStateId(stickerId);
        if (!home) continue;
        next[home.face][home.row][home.col] = value;
      }
    }
    setBrightnessMatrix(next);
  }, [brightnessMatrix, previewStateMatrix]);

  const gripFacePhysicalLabels = useMemo(() => {
    const map: Record<GripFaceName, string> = {
      U: 'U', L: 'L', F: 'F', R: 'R', B: 'B', D: 'D',
    };
    for (const name of FACE_NAMES) {
      try {
        map[name] = gripFaceToPhysicalFace(name, formulaOrientation);
      } catch {
        map[name] = name;
      }
    }
    return map;
  }, [formulaOrientation]);

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
      || (rotationTargetLabel.trim() || '') !== (level.rotationTargetLabel ?? '')
      || !orientationEquals(
        formulaOrientation,
        level.formulaOrientation ?? DEFAULT_LEVEL_DEBUG_ORIENTATION,
      )
      || guidanceFormulaText !== (level.guidanceFormula ?? '')
      || guidanceFailureThreshold !== resolveLevelGuidanceFailureThreshold(level.guidanceFailureThreshold)
      || JSON.stringify(startStateMatrix) !== JSON.stringify(level.startStateMatrix)
      || JSON.stringify(goalStateMatrix) !== JSON.stringify(level.goalStateMatrix)
      || JSON.stringify(goalStateMatrices ?? null) !== JSON.stringify(level.goalStateMatrices ?? null)
      || JSON.stringify(brightnessMatrix) !== JSON.stringify(level.brightnessMatrix)
    );
  }, [
    level, titleText, descriptionText, hintText, maxMovesText, star3Text, star2Text,
    formulaText, formulaTarget, rotationTargetLabel, formulaOrientation, guidanceFormulaText, guidanceFailureThreshold,
    startStateMatrix, goalStateMatrix, goalStateMatrices, brightnessMatrix,
  ]);

  const handleSave = async (mode: 'local' | 'remote' = 'local') => {
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
        deriveLevelDebugFormulaPreset(rotationFormula, formulaTarget, formulaOrientation);
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
      rotationTarget: (rotationFormula || goalStateMatrix) ? formulaTarget : undefined,
      rotationTargetLabel:
        formulaTarget === 'custom' && rotationTargetLabel.trim()
          ? rotationTargetLabel.trim()
          : undefined,
      formulaOrientation: { ...formulaOrientation },
      stateDefinitionMode: rotationFormula ? 'formula' : 'brightness',
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
      let remoteError: string | null = null;
      let savedLocalPath: string | null = null;
      try {
        if (mode === 'remote') {
          await pushAllRemote();
        } else {
          savedLocalPath = await saveLocal({ manageSync: false });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (mode === 'remote' && (message.includes('远程推送失败') || message.includes('推送'))) {
          remoteError = message;
        } else {
          throw error;
        }
      }
      setTitleText(updatedLevel.title);
      setDescriptionText(updatedLevel.description);
      setHintText(updatedLevel.hint ?? '');
      setMaxMovesText(String(updatedLevel.maxMoves));
      setStar3Text(String(updatedLevel.starThresholds[0]));
      setStar2Text(String(updatedLevel.starThresholds[1]));
      setFormulaText(updatedLevel.rotationFormula ?? '');
      setFormulaTarget(updatedLevel.rotationTarget ?? 'f2l');
      setRotationTargetLabel(updatedLevel.rotationTargetLabel ?? '');
      setCustomTargetNames(
        updatedLevel.rotationTarget === 'custom' && updatedLevel.rotationTargetLabel?.trim()
          ? [updatedLevel.rotationTargetLabel.trim()]
          : customTargetNames,
      );
      setFormulaOrientation({ ...(updatedLevel.formulaOrientation ?? DEFAULT_LEVEL_DEBUG_ORIENTATION) });
      setGuidanceFormulaText(updatedLevel.guidanceFormula ?? '');
      setGuidanceFailureThreshold(resolveLevelGuidanceFailureThreshold(updatedLevel.guidanceFailureThreshold));
      setStartStateMatrix(cloneStateMatrix(updatedLevel.startStateMatrix));
      setGoalStateMatrix(cloneStateMatrix(updatedLevel.goalStateMatrix));
      setGoalStateMatrices(updatedLevel.goalStateMatrices?.map(cloneStateMatrix) ?? undefined);
      setLiveStateMatrix(cloneStateMatrix(updatedLevel.startStateMatrix));
      setBrightnessMatrix(cloneBrightness(updatedLevel.brightnessMatrix));
      useUiStore.getState().clearAiTouched();
      if (remoteError) {
        setSaveError(remoteError);
        setSaveNotice(warnings.length > 0 ? `本地草稿已保留。${warnings.join(' ')}` : '本地草稿已保留。');
      } else {
        setSaveError(null);
        const syncHint = mode === 'remote'
          ? '已批量推送到远程（关卡 / 能力标签 / 推荐配置）。'
          : savedLocalPath
            ? `已保存到本地：${savedLocalPath}`
            : '已保存到本地（未推远程）。';
        setSaveNotice(warnings.length > 0 ? `${syncHint} ${warnings.join(' ')}` : syncHint);
      }
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
            className="btn titlebar-save"
            disabled={saving || (!hasEditorChanges && !hasUnsavedChanges)}
            onClick={() => void handleSave('local')}
            title="写入内存并落盘本地，不推 MySQL"
          >
            {saving ? <><span className="spinner" />保存中</> : '本地保存'}
          </button>
          <button
            type="button"
            className="btn btn-primary titlebar-save"
            disabled={saving}
            onClick={() => void handleSave('remote')}
            title="先落盘当前关卡草稿，再批量推送关卡 / 能力标签 / 推荐配置"
          >
            {saving ? <><span className="spinner" />推送中</> : '保存远程'}
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
            <div className="preview-state-segmented" role="tablist" aria-label="预览状态切换">
              <button
                type="button"
                role="tab"
                aria-selected={previewMode === 'start'}
                className={previewMode === 'start' ? 'is-active' : ''}
                onClick={handlePreviewStart}
              >
                初始
              </button>
              {allGoalVariants.length > 1 ? (
                allGoalVariants.map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    role="tab"
                    aria-selected={previewMode === 'goal' && selectedGoalVariantIndex === index}
                    className={previewMode === 'goal' && selectedGoalVariantIndex === index ? 'is-active' : ''}
                    onClick={() => handlePreviewGoal(index)}
                  >
                    {formatGoalVariantLabel(index)}
                  </button>
                ))
              ) : (
                <button
                  type="button"
                  role="tab"
                  aria-selected={previewMode === 'goal'}
                  className={previewMode === 'goal' ? 'is-active' : ''}
                  onClick={() => handlePreviewGoal(0)}
                >
                  目标
                </button>
              )}
            </div>
          </div>
          <CubePreview
            className="cube-preview cube-preview-editor cube-preview-resizable"
            stateMatrix={previewStateMatrix!}
            brightnessMatrix={brightnessMatrix}
            orientation={formulaOrientation}
            dimUnlitWithFaceColor
            playRequest={playRequest}
            onPlayComplete={handlePlayComplete}
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
            {(['meta', 'states', 'formula', 'brightness'] as Tab[]).map((tab) => (
              <button key={tab} className={`tab tab-${tab} ${activeTab === tab ? 'tab-active' : ''}`} onClick={() => setActiveTab(tab)}>
                {tab === 'meta' ? '基础信息' : tab === 'states' ? '状态编辑' : tab === 'formula' ? '自定义公式' : '点亮控制'}
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
              <strong>当前起终态路径：{authoringPathLabel(authoringMode)}</strong>
              {' '}初始/目标只能由一种方式定义：本页捕获、自定义公式，或点亮控制路径（二选一，勿混用）。
              捕获会清空旋转公式与推荐解法；3D 按当前握持朝向（顶色朝上、前色朝前）。
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

          <EditorMovePad onMove={applyManualToken} orientation={formulaOrientation} />

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
                    orientation={formulaOrientation}
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
          <OrientationMappingBlock
            orientation={formulaOrientation}
            orientationText={formulaOrientationText}
            frontOptions={frontOrientationOptions}
            onChange={applyOrientationChange}
          />
          <FormulaKeyboard
            value={formulaText}
            onChange={(next) => {
              setFormulaText(next);
              invalidateFormulaProgress();
            }}
            onTokenAppended={handleFormulaTokenAppended}
          />
          <div className="field-row">
            <button className="btn btn-primary" type="button" onClick={applyFormula}>应用公式</button>
            <button className="btn" type="button" onClick={() => verifyFormulaFromStart({ path: 'formula' })}>校验</button>
            <button className="btn" type="button" onClick={resetFormulaToSolved}>还原</button>
          </div>
          <div className="preview-card">{formulaPreviewText}</div>
          {startCapturedOk && startStateMatrix ? (
            <p className="formula-auto-capture-hint">初始态已自动捕获并展示在上方 3D（预览初始）。请点「校验」确认能否还原到目标。</p>
          ) : null}
          <EditorMovePad onMove={applyManualToken} orientation={formulaOrientation} />
          <GuidanceThresholdBlock
            threshold={guidanceFailureThreshold}
            onChange={onGuidanceFailureThresholdChange}
          />
        </div>
      )}

      {activeTab === 'brightness' && (
        <div className="tab-content tab-content-brightness">
          <div className="state-edit-banner">
            <p>
              <strong>点亮控制</strong>
              ：下方补充「目标类型」不影响原有点亮操作。手调亮度、推荐解法与指引条件保持可用。
            </p>
            {authoringMode === 'formula' ? (
              <div className="authoring-path-actions">
                <button type="button" className="btn btn-primary" onClick={() => switchToAuthoringPath('brightness')}>
                  改用点亮控制路径
                </button>
              </div>
            ) : null}
          </div>

          <OrientationMappingBlock
            orientation={formulaOrientation}
            orientationText={formulaOrientationText}
            frontOptions={frontOrientationOptions}
            onChange={applyOrientationChange}
          />

          <section className="brightness-workbench" aria-label="目标类型工作台（补充）">
            <div className="brightness-workbench-head">
              <h3 className="brightness-workbench-title">目标类型（补充）</h3>
              <p className="brightness-workbench-hint">选内置或添加自定义类型 → 点亮格子 → 捕获为目标类型（与公式页同步）</p>
            </div>

            <div className="brightness-type-bar" role="group" aria-label="目标类型">
              {LEVEL_FORMULA_BUILTIN_TARGETS.map((target) => (
                <button
                  key={target}
                  type="button"
                  className={`brightness-type-chip ${formulaTarget === target ? 'is-active' : ''}`}
                  onClick={() => selectBuiltinTarget(target)}
                >
                  {target.toUpperCase()}
                </button>
              ))}
              {customTargetNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`brightness-type-chip ${formulaTarget === 'custom' && rotationTargetLabel === name ? 'is-active' : ''}`}
                  onClick={() => selectCustomTarget(name)}
                >
                  {name}
                </button>
              ))}
            </div>

            <div className="brightness-type-add-row">
              <input
                className="text-input"
                value={customTargetDraft}
                onChange={(event) => setCustomTargetDraft(event.target.value)}
                placeholder="自定义类型名，如：十字"
              />
              <button type="button" className="btn" onClick={addCustomTargetType}>+ 添加类型</button>
            </div>

            <div className="brightness-capture-row">
              <input
                className="text-input"
                value={goalNameDraft}
                onChange={(event) => setGoalNameDraft(event.target.value)}
                placeholder={defaultGoalLabel(allGoalVariants.length, formulaTarget, rotationTargetLabel)}
              />
              <button type="button" className="btn btn-primary" onClick={() => captureNamedGoalFromLive('replace')}>
                捕获为目标类型
              </button>
              <button type="button" className="btn" onClick={() => captureNamedGoalFromLive('add')}>
                追加目标
              </button>
            </div>

            <div className="brightness-goal-rail" aria-label="已捕获目标类型">
              {allGoalVariants.length === 0 ? (
                <p className="brightness-workbench-hint">尚未捕获。转上方魔方并点亮后，点「捕获为目标类型」。</p>
              ) : (
                allGoalVariants.map((variant, index) => (
                  <button
                    key={`rail-goal-${index}`}
                    type="button"
                    className={`brightness-goal-rail-card ${selectedGoalVariantIndex === index ? 'is-selected' : ''}`}
                    onClick={() => {
                      setSelectedGoalVariantIndex(index);
                      handlePreviewGoal(index);
                      setGoalNameDraft(
                        goalVariantLabels[index]
                          ?? defaultGoalLabel(index, formulaTarget, rotationTargetLabel),
                      );
                    }}
                  >
                    <span className="brightness-goal-rail-name">
                      {goalVariantLabels[index] ?? defaultGoalLabel(index, formulaTarget, rotationTargetLabel)}
                    </span>
                    <span className="brightness-goal-rail-type">{currentTargetDisplayLabel}</span>
                    <CubePreview
                      className="cube-preview cube-preview-thumb"
                      stateMatrix={variant}
                      brightnessMatrix={brightnessMatrix}
                      orientation={formulaOrientation}
                      hideViewControls
                    />
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="brightness-panel" aria-label="点亮面编辑">
            <div className="brightness-panel-title">点亮面编辑</div>
            <p className="brightness-panel-map">
              按上方 3D 当前预览态编辑。当前握持 {selectedGripFace} → 物理 {selectedPhysicalFaceLabel}。
            </p>
            <div className="brightness-face-row" role="group" aria-label="选择面（握持）">
              {FACE_NAMES.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`brightness-face-chip ${selectedGripFace === name ? 'is-active' : ''}`}
                  title={`握持 ${name} → 物理 ${gripFacePhysicalLabels[name]}`}
                  onClick={() => setSelectedGripFace(name)}
                >
                  <span className="brightness-face-chip-main">{name}</span>
                </button>
              ))}
            </div>
            <div className="brightness-grid brightness-pad" role="grid" aria-label="当前面贴纸点亮">
              {[0, 1, 2].map((row) => (
                <div key={row} className="brightness-row" role="row">
                  {[0, 1, 2].map((col) => {
                    const value = readBrightnessAtPreviewCell(selectedPhysicalFace, row, col);
                    return (
                      <button
                        key={col}
                        type="button"
                        role="gridcell"
                        className={`brightness-cell ${value > 0 ? 'brightness-cell-on' : ''}`}
                        aria-label={value > 0 ? '已点亮' : '已熄灭'}
                        onClick={() => toggleBrightnessAtPreviewCell(selectedPhysicalFace, row, col)}
                      >
                        <span className="brightness-cell-dot" aria-hidden />
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="brightness-actions">
              <button type="button" className="btn" onClick={() => setPreviewFaceAllBrightness(selectedPhysicalFace, 8)}>全亮</button>
              <button type="button" className="btn" onClick={() => setPreviewFaceAllBrightness(selectedPhysicalFace, 0)}>全灭</button>
            </div>
            <EditorMovePad onMove={applyManualToken} orientation={formulaOrientation} />
          </section>

          <section className="brightness-formula-panel" aria-label="公式应用与校验（补充）">
            <div className="brightness-panel-title">公式 · 应用 / 校验（补充）</div>
            <p className="brightness-panel-map">
              当前类型「{currentTargetDisplayLabel}」。应用后自动捕获初始，请再点校验。不改手调点亮。
            </p>
            <FormulaKeyboard
              value={formulaText}
              onChange={(next) => {
                setFormulaText(next);
                invalidateFormulaProgress();
              }}
            />
            <div className="brightness-actions">
              <button type="button" className="btn btn-primary" onClick={applyFormulaInBrightnessFlow}>应用公式</button>
              <button type="button" className="btn" onClick={() => verifyFormulaFromStart({ path: 'brightness' })}>校验</button>
            </div>
            <div className="preview-card brightness-preview-card">
              {formulaAppliedOk
                ? (formulaVerifiedOk
                  ? '校验通过，可保存关卡。'
                  : '初始态已自动捕获，请点「校验」。')
                : '尚未应用公式。'}
            </div>
          </section>

          <section className="brightness-formula-panel" aria-label="推荐解法与指引">
            <div className="brightness-panel-title">推荐解法 / 指引开启</div>
            <p className="brightness-panel-map">
              原有能力：校验推荐解法能否从初始到达目标点亮区；配置指引开启条件。
            </p>
            <FormulaKeyboard value={guidanceFormulaText} onChange={setGuidanceFormulaText} />
            <div className="brightness-actions">
              <button type="button" className="btn" onClick={applyGuidanceValidation}>应用推荐解法</button>
            </div>
            <div className="preview-card brightness-preview-card">{guidancePreviewText}</div>
            <GuidanceThresholdBlock
              threshold={guidanceFailureThreshold}
              onChange={onGuidanceFailureThresholdChange}
            />
          </section>
        </div>
      )}
        </div>
      </div>
    </div>
    </>
  );
}
