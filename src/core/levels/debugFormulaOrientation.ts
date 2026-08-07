/**
 * 关卡编辑专用的公式朝向映射（握持坐标系）。
 *
 * 公式按「当前握持」书写：U = 所选顶色面，F = 所选前色面；
 * 再翻译成物理面字母供 stateMatrix 运算。colorMatrix 固定 INITIAL。
 */
import {
    buildF2LGoalStateMatrix,
    buildOLLGoalStateMatrix,
    buildPLLGoalStateMatrix,
} from '../formula/goalBuilders';
import {
    applyTokensToState,
    invertReverseTokens,
    mapTokensByOrientationWithSource,
    parseFormulaTokens,
} from '../formula/moves';
import {
    DEV_CUSTOM_OPPOSITE_COLOR,
    formatOrientationFaces,
    getFrontColorOptions,
    resolveOrientationRecord,
} from '../formula/orientation';
import {
    DEV_CUSTOM_COLOR_VALUES,
    type DevCustomColor,
    type DevCustomOrientation,
} from '../formula/types';
import { INITIAL_COLOR_MATRIX } from '../cube/constants';
import type { BrightnessMatrix, StateMatrix } from '../cube/types';
import {
    DEFAULT_LEVEL_FORMULA_ORIENTATION,
    type LevelFormulaPreset,
} from './formulaPreset';
import {
    buildF2LBrightnessMatrixForOrientation,
    buildOLLBrightnessMatrixForOrientation,
    buildPLLBrightnessMatrixForOrientation,
} from './orientationBrightness';
import type { LevelFormulaTarget } from './types';

type FaceName = 'U' | 'D' | 'F' | 'B' | 'L' | 'R';

const PHYSICAL_FACE_COLOR: Record<FaceName, DevCustomColor> = {
    U: DEV_CUSTOM_COLOR_VALUES.white,
    L: DEV_CUSTOM_COLOR_VALUES.orange,
    F: DEV_CUSTOM_COLOR_VALUES.green,
    R: DEV_CUSTOM_COLOR_VALUES.red,
    B: DEV_CUSTOM_COLOR_VALUES.blue,
    D: DEV_CUSTOM_COLOR_VALUES.yellow,
};

const COLOR_TO_PHYSICAL_FACE = Object.fromEntries(
    Object.entries(PHYSICAL_FACE_COLOR).map(([face, color]) => [color, face as FaceName]),
) as Record<DevCustomColor, FaceName>;

const FACE_LETTER = new Set<string>(['U', 'D', 'L', 'R', 'F', 'B']);

export const gripFaceToPhysicalFace = (
    gripFace: FaceName,
    runtimeOrientation: DevCustomOrientation,
): FaceName => {
    const { faceToColor } = resolveOrientationRecord(runtimeOrientation);
    const color = faceToColor[gripFace];
    const physical = COLOR_TO_PHYSICAL_FACE[color];
    if (!physical) {
        throw new Error(`No physical face for color ${color}`);
    }
    return physical;
};

export const toPhysicalTokensFromGrip = (
    gripTokens: string[],
    runtimeOrientation: DevCustomOrientation,
): string[] => gripTokens.map((token) => {
    const base = token[0];
    const modifier = token.slice(1);
    if (!FACE_LETTER.has(base.toUpperCase())) {
        return token;
    }
    const gripFace = base.toUpperCase() as FaceName;
    const physicalFace = gripFaceToPhysicalFace(gripFace, runtimeOrientation);
    return `${physicalFace}${modifier}`;
});

export const toRuntimeViewTokens = (
    physicalTokens: string[],
    runtimeOrientation: DevCustomOrientation,
): string[] => {
    const { colorToFace } = resolveOrientationRecord(runtimeOrientation);
    return physicalTokens.map((token) => {
        const base = token[0];
        const modifier = token.slice(1);
        if (!FACE_LETTER.has(base.toUpperCase())) {
            return token;
        }
        const face = base.toUpperCase() as FaceName;
        const color = PHYSICAL_FACE_COLOR[face];
        const viewFace = colorToFace[color];
        return `${viewFace}${modifier}`;
    });
};

export type DebugOrientationColorOption = {
    value: DevCustomColor;
    label: string;
    disabled?: boolean;
};

export const LEVEL_DEBUG_TOP_FACE_OPTIONS: DebugOrientationColorOption[] = [
    { value: DEV_CUSTOM_COLOR_VALUES.green, label: '绿顶' },
    { value: DEV_CUSTOM_COLOR_VALUES.white, label: '白顶' },
    { value: DEV_CUSTOM_COLOR_VALUES.yellow, label: '黄顶' },
    { value: DEV_CUSTOM_COLOR_VALUES.orange, label: '橙顶' },
    { value: DEV_CUSTOM_COLOR_VALUES.blue, label: '蓝顶' },
    { value: DEV_CUSTOM_COLOR_VALUES.red, label: '红顶' },
];

export const LEVEL_DEBUG_FRONT_FACE_OPTIONS: DebugOrientationColorOption[] = [
    { value: DEV_CUSTOM_COLOR_VALUES.red, label: '红前' },
    { value: DEV_CUSTOM_COLOR_VALUES.white, label: '白前' },
    { value: DEV_CUSTOM_COLOR_VALUES.orange, label: '橙前' },
    { value: DEV_CUSTOM_COLOR_VALUES.yellow, label: '黄前' },
    { value: DEV_CUSTOM_COLOR_VALUES.green, label: '绿前' },
    { value: DEV_CUSTOM_COLOR_VALUES.blue, label: '蓝前' },
];

export const isValidDebugFrontColor = (
    topColor: DevCustomColor,
    frontColor: DevCustomColor,
): boolean => (
    frontColor !== topColor && frontColor !== DEV_CUSTOM_OPPOSITE_COLOR[topColor]
);

export const resolveDebugFrontColor = (
    topColor: DevCustomColor,
    preferredFront: DevCustomColor,
): DevCustomColor => (
    isValidDebugFrontColor(topColor, preferredFront)
        ? preferredFront
        : getFrontColorOptions(topColor)[0].value
);

export const getDebugOrientationLabel = (
    orientation: DevCustomOrientation,
): { topLabel: string; frontLabel: string } => ({
    topLabel: LEVEL_DEBUG_TOP_FACE_OPTIONS.find((item) => item.value === orientation.topColor)?.label ?? '顶',
    frontLabel: LEVEL_DEBUG_FRONT_FACE_OPTIONS.find((item) => item.value === orientation.frontColor)?.label ?? '前',
});

export const formatLevelDebugOrientation = (orientation: DevCustomOrientation): string =>
    formatOrientationFaces(orientation);

const getTargetGoalStateMatrix = (target: LevelFormulaTarget): StateMatrix => {
    if (target === 'oll') return buildOLLGoalStateMatrix();
    if (target === 'pll') return buildPLLGoalStateMatrix();
    return buildF2LGoalStateMatrix();
};

const getTargetBrightnessMatrix = (
    target: LevelFormulaTarget,
    runtimeOrientation: DevCustomOrientation,
): BrightnessMatrix => {
    if (target === 'oll') return buildOLLBrightnessMatrixForOrientation(runtimeOrientation);
    if (target === 'pll') return buildPLLBrightnessMatrixForOrientation(runtimeOrientation);
    return buildF2LBrightnessMatrixForOrientation(runtimeOrientation);
};

export const deriveLevelDebugFormulaPreset = (
    formula: string,
    target: LevelFormulaTarget,
    runtimeOrientation: DevCustomOrientation = DEFAULT_LEVEL_FORMULA_ORIENTATION,
): LevelFormulaPreset => {
    const { tokens: officialTokens, invalidTokens, displayTokens: officialDisplayTokens } = parseFormulaTokens(formula);
    if (invalidTokens.length > 0) {
        throw new Error(`Invalid formula tokens: ${invalidTokens.join(', ')}`);
    }

    const { mapped: gripTokens, sourceIndices: mappedSourceIndices } = mapTokensByOrientationWithSource(
        officialTokens,
        runtimeOrientation,
        runtimeOrientation,
    );
    const mappedTokens = toPhysicalTokensFromGrip(gripTokens, runtimeOrientation);
    const goalStateMatrix = getTargetGoalStateMatrix(target);
    const startStateMatrix = applyTokensToState(goalStateMatrix, invertReverseTokens(mappedTokens));

    return {
        formula,
        target,
        officialTokens,
        officialDisplayTokens,
        mappedTokens,
        viewTokens: gripTokens,
        mappedSourceIndices,
        startStateMatrix,
        goalStateMatrix,
        brightnessMatrix: getTargetBrightnessMatrix(target, runtimeOrientation),
        colorMatrix: INITIAL_COLOR_MATRIX.map((face) => face.map((row) => [...row])),
    };
};

export const DEFAULT_LEVEL_DEBUG_ORIENTATION: DevCustomOrientation = {
    ...DEFAULT_LEVEL_FORMULA_ORIENTATION,
};

export const assertLevelDebugOrientation = (orientation: DevCustomOrientation): void => {
    resolveOrientationRecord(orientation);
};
