import { deriveLevelFormulaPreset, DEFAULT_LEVEL_FORMULA_ORIENTATION } from './formulaPreset';
import type {
    LevelDefinition,
    LevelGuidanceFailureThreshold,
} from './types';
import { applyTokensToState, mapTokensByOrientation, parseFormulaTokens } from '../formula/moves';
import { notationToFace } from '../formula/notationToFace';
import { INITIAL_COLOR_MATRIX } from '../cube';
import { isLevelGoalReached } from './goalEvaluation';
import { resolveLevelGuidanceFailureThreshold } from './utils';

export type LevelGuidanceStatus = 'ready' | 'missing' | 'invalid';

export type LevelGuidanceSummary = {
    status: LevelGuidanceStatus;
    formula: string | null;
    steps: string[];
    stepCount: number;
    message: string;
};

export const getLevelGuidanceFailureThreshold = (
    level: Pick<LevelDefinition, 'guidanceFailureThreshold'>,
): LevelGuidanceFailureThreshold => (
    resolveLevelGuidanceFailureThreshold(level.guidanceFailureThreshold)
);

/** -1 永不开启；0 进入即开；1-5 连续失败 N 次后解锁 */
export const getGuidanceFailuresRequiredToUnlock = (
    threshold: LevelGuidanceFailureThreshold,
): number | null => (
    threshold === -1 ? null : threshold
);

const expandGuidanceSteps = (tokens: string[]): string[] => tokens.flatMap((token) => {
    if (!token.endsWith('2')) return [token];
    const base = token.slice(0, -1);
    return [base, base];
});

/** 将含 x/y/z、切片、宽转的公式改写为硬件可提示的外层步骤 */
const toHardwareGuidanceTokens = (formula: string): string[] => {
    const parsed = parseFormulaTokens(formula);
    if (parsed.invalidTokens.length > 0) {
        throw new Error(`无效动作：${parsed.invalidTokens.join(', ')}`);
    }
    return mapTokensByOrientation(
        parsed.tokens,
        DEFAULT_LEVEL_FORMULA_ORIENTATION,
        DEFAULT_LEVEL_FORMULA_ORIENTATION,
    );
};

/** 列表首屏用：只看有没有公式，不做矩阵推演（大批量关卡时避免卡死） */
export const peekLevelGuidanceSummary = (level: LevelDefinition): LevelGuidanceSummary => {
    const formula = level.guidanceFormula?.trim() || level.rotationFormula?.trim() || null;
    if (!formula) {
        return {
            status: 'missing',
            formula: null,
            steps: [],
            stepCount: 0,
            message: '缺少推荐解法',
        };
    }

    return {
        status: 'ready',
        formula,
        steps: [],
        stepCount: 0,
        message: '解法校验中…',
    };
};

export const getLevelGuidanceSummary = (level: LevelDefinition): LevelGuidanceSummary => {
    const guidanceFormula = level.guidanceFormula?.trim();
    const formula = guidanceFormula || level.rotationFormula?.trim();
    if (!formula) {
        return {
            status: 'missing',
            formula: null,
            steps: [],
            stepCount: 0,
            message: '缺少推荐解法',
        };
    }

    try {
        // guidanceFormula 也需吸收整转 x/y/z：硬件只能提示 6 个外层面
        const mappedTokens = guidanceFormula
            ? toHardwareGuidanceTokens(guidanceFormula)
            : deriveLevelFormulaPreset(formula, level.rotationTarget ?? 'f2l').mappedTokens;
        const steps = expandGuidanceSteps(mappedTokens);
        if (steps.length === 0) {
            throw new Error('推荐解法没有可执行步骤（整转/切片改写后为空）');
        }

        const unsupportedStep = steps.find((step) => notationToFace(step) === null);
        if (unsupportedStep) {
            throw new Error(`步骤 ${unsupportedStep} 无法映射到硬件外层面`);
        }

        const result = applyTokensToState(level.startStateMatrix, mappedTokens);
        if (!isLevelGoalReached(
            result,
            level.goalStateMatrix,
            level.brightnessMatrix,
            INITIAL_COLOR_MATRIX,
        )) {
            throw new Error('推荐解法无法从当前起始状态完成点亮区域目标');
        }

        return {
            status: 'ready',
            formula,
            steps,
            stepCount: steps.length,
            message: `推荐解法 ${steps.length} 步`,
        };
    } catch (error) {
        return {
            status: 'invalid',
            formula,
            steps: [],
            stepCount: 0,
            message: error instanceof Error ? error.message : '解法校验失败',
        };
    }
};
