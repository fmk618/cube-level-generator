import { applyTokensToState } from '../formula/moves';
import type { StateMatrix } from '../cube/types';
import type { LevelDefinition } from './types';
import { isLevelGoalReached } from './goalEvaluation';
import type { BrightnessMatrix, ColorMatrix } from '../cube';

const cloneStateMatrix = (matrix: StateMatrix): StateMatrix =>
    matrix.map((face) => face.map((row) => [...row]));

const matrixKey = (matrix: StateMatrix): string => JSON.stringify(matrix);

const dedupeStateMatrices = (matrices: StateMatrix[]): StateMatrix[] => {
    const seen = new Set<string>();
    const result: StateMatrix[] = [];
    for (const matrix of matrices) {
        const key = matrixKey(matrix);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(matrix);
    }
    return result;
};

/** 绕竖直轴（y）旋转 0°/90°/180°/270° 的四个等效目标态 */
export const buildYawEquivalentGoalStates = (goalState: StateMatrix): StateMatrix[] => {
    const variants: StateMatrix[] = [];
    let current = cloneStateMatrix(goalState);
    for (let turn = 0; turn < 4; turn += 1) {
        variants.push(cloneStateMatrix(current));
        current = applyTokensToState(current, ['y']);
    }
    return dedupeStateMatrices(variants);
};

/** 判断多目标列表是否为「主目标绕 Y 轴四向」自动生成的一组 */
export const isYawEquivalentGoalSet = (
    primary: StateMatrix,
    matrices: StateMatrix[],
): boolean => {
    if (matrices.length <= 1) return false;
    const expectedKeys = buildYawEquivalentGoalStates(primary).map(matrixKey).sort();
    const actualKeys = matrices.map(matrixKey).sort();
    return expectedKeys.length === actualKeys.length
        && expectedKeys.every((key, index) => key === actualKeys[index]);
};

export const resolveLevelGoalStates = (
    level: Pick<LevelDefinition, 'goalStateMatrix' | 'goalStateMatrices'>,
): StateMatrix[] => {
    const primary = level.goalStateMatrix;
    const extras = level.goalStateMatrices ?? [];
    if (extras.length === 0) return [primary];
    const merged = dedupeStateMatrices([primary, ...extras]);
    return merged.length > 0 ? merged : [primary];
};

export const normalizeLevelGoalStates = (
    level: Pick<LevelDefinition, 'goalStateMatrix' | 'goalStateMatrices'>,
): Pick<LevelDefinition, 'goalStateMatrix' | 'goalStateMatrices'> => {
    const primary = level.goalStateMatrix;
    const merged = resolveLevelGoalStates(level);
    if (merged.length <= 1) {
        return { goalStateMatrix: primary, goalStateMatrices: undefined };
    }
    return {
        goalStateMatrix: primary,
        goalStateMatrices: merged,
    };
};

export const isLevelGoalReachedForLevel = (
    currentState: StateMatrix,
    level: Pick<LevelDefinition, 'goalStateMatrix' | 'goalStateMatrices'>,
    brightnessMatrix: BrightnessMatrix,
    colorMatrix: ColorMatrix,
): boolean => {
    const goals = resolveLevelGoalStates(level);
    return goals.some((goal) =>
        isLevelGoalReached(currentState, goal, brightnessMatrix, colorMatrix),
    );
};
