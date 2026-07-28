import {
    buildF2LGoalStateMatrix,
    buildF2LBrightnessMatrix,
    buildOLLGoalStateMatrix,
    buildOLLBrightnessMatrix,
    buildPLLGoalStateMatrix,
    buildPLLBrightnessMatrix,
} from '../formula/goalBuilders';
import { applyTokensToState, invertReverseTokens, mapTokensByOrientationWithSource, parseFormulaTokens } from '../formula/moves';
import { buildOrientationColorMatrix } from '../formula/orientation';
import { DEV_CUSTOM_COLOR_VALUES, type DevCustomOrientation } from '../formula/types';
import type { BrightnessMatrix, ColorMatrix, StateMatrix } from '../cube/types';
import type { LevelFormulaTarget } from './types';

export const DEFAULT_LEVEL_FORMULA_ORIENTATION: DevCustomOrientation = {
    topColor: DEV_CUSTOM_COLOR_VALUES.white,
    frontColor: DEV_CUSTOM_COLOR_VALUES.green,
} as const;

export type LevelFormulaPreset = {
    formula: string;
    target: LevelFormulaTarget;
    officialTokens: string[];
    officialDisplayTokens: string[];
    mappedTokens: string[];
    mappedSourceIndices: number[];
    startStateMatrix: StateMatrix;
    goalStateMatrix: StateMatrix;
    brightnessMatrix: BrightnessMatrix;
    colorMatrix: ColorMatrix;
};

const getTargetGoalStateMatrix = (target: LevelFormulaTarget): StateMatrix => {
    if (target === 'oll') return buildOLLGoalStateMatrix();
    if (target === 'pll') return buildPLLGoalStateMatrix();
    return buildF2LGoalStateMatrix();
};

const getTargetBrightnessMatrix = (target: LevelFormulaTarget): BrightnessMatrix => {
    if (target === 'oll') return buildOLLBrightnessMatrix();
    if (target === 'pll') return buildPLLBrightnessMatrix();
    return buildF2LBrightnessMatrix();
};

export const deriveLevelFormulaPreset = (
    formula: string,
    target: LevelFormulaTarget,
    officialOrientation: DevCustomOrientation = DEFAULT_LEVEL_FORMULA_ORIENTATION,
    runtimeOrientation: DevCustomOrientation = DEFAULT_LEVEL_FORMULA_ORIENTATION,
): LevelFormulaPreset => {
    const { tokens: officialTokens, invalidTokens, displayTokens: officialDisplayTokens } = parseFormulaTokens(formula);
    if (invalidTokens.length > 0) {
        throw new Error(`Invalid formula tokens: ${invalidTokens.join(', ')}`);
    }

    const { mapped: mappedTokens, sourceIndices: mappedSourceIndices } = mapTokensByOrientationWithSource(
        officialTokens,
        officialOrientation,
        runtimeOrientation,
    );
    const goalStateMatrix = getTargetGoalStateMatrix(target);
    const startStateMatrix = applyTokensToState(goalStateMatrix, invertReverseTokens(mappedTokens));

    return {
        formula,
        target,
        officialTokens,
        officialDisplayTokens,
        mappedTokens,
        mappedSourceIndices,
        startStateMatrix,
        goalStateMatrix,
        brightnessMatrix: getTargetBrightnessMatrix(target),
        colorMatrix: buildOrientationColorMatrix(runtimeOrientation),
    };
};
