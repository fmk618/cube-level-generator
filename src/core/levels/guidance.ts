import { deriveLevelFormulaPreset, DEFAULT_LEVEL_FORMULA_ORIENTATION } from './formulaPreset';
import { deriveLevelDebugFormulaPreset, toPhysicalTokensFromGrip } from './debugFormulaOrientation';
import type {
    LevelDefinition,
    LevelGuidanceFailureThreshold,
} from './types';
import { resolveBuiltinFormulaTarget } from './types';
import { applyTokensToState, mapTokensByOrientationWithSource, parseFormulaTokens } from '../formula/moves';
import { notationToFace } from '../formula/notationToFace';
import { INITIAL_COLOR_MATRIX } from '../cube';
import { isFormulaLevelGoalReachedForLevel } from './goalStates';
import { resolveLevelGuidanceFailureThreshold } from './utils';

export type LevelGuidanceStatus = 'ready' | 'missing' | 'invalid';

export type LevelGuidanceExecutionStep = {
    notation: string;
    displayIndex: number;
};

export type LevelGuidancePresentationStep = {
    notation: string;
    displayIndex: number;
    physicalMoves: string[];
};

export type LevelGuidanceSummary = {
    status: LevelGuidanceStatus;
    formula: string | null;
    /** JSON 中的握持视角公式，用于公式面板与演示节拍。 */
    displayTokens: string[];
    /** 每个演示 onset 对应的物理动作；x/y/z 没有物理动作。 */
    presentationSteps: LevelGuidancePresentationStep[];
    /** 智能魔方实际上报并由 Game 校验的物理面动作。 */
    executionSteps: LevelGuidanceExecutionStep[];
    stepCount: number;
    message: string;
};

export const getLevelGuidanceFailureThreshold = (
    level: Pick<LevelDefinition, 'guidanceFailureThreshold'>,
): LevelGuidanceFailureThreshold => (
    resolveLevelGuidanceFailureThreshold(level.guidanceFailureThreshold)
);

/** -1 永不开启；0 进入即开；1-5 连续失败 N 次后解锁。解锁后均先音乐+演示再下发流水灯；0 次不重复写入 attempt。 */
export const getGuidanceFailuresRequiredToUnlock = (
    threshold: LevelGuidanceFailureThreshold,
): number | null => (
    threshold === -1 ? null : threshold
);

const expandQuarterTurns = (token: string): string[] => {
    if (!token.endsWith('2')) return [token];
    const base = token.slice(0, -1);
    return [base, base];
};

const buildGuidanceSteps = (
    normalizedDisplayTokens: string[],
    displayTokens: string[],
    mappedTokens: string[],
    mappedSourceIndices: number[],
): Pick<LevelGuidanceSummary, 'displayTokens' | 'presentationSteps' | 'executionSteps'> => {
    const executionByDisplayIndex = normalizedDisplayTokens.map(() => [] as string[]);
    mappedTokens.forEach((token, mappedIndex) => {
        const displayIndex = mappedSourceIndices[mappedIndex];
        if (displayIndex === undefined) return;
        executionByDisplayIndex[displayIndex].push(...expandQuarterTurns(token));
    });

    const executionSteps = executionByDisplayIndex.flatMap((notations, displayIndex) => (
        notations.map((notation) => ({ notation, displayIndex }))
    ));
    const presentationSteps = normalizedDisplayTokens.flatMap((token, displayIndex) => {
        const displayOnsets = expandQuarterTurns(token);
        const physicalMoves = executionByDisplayIndex[displayIndex];
        if (displayOnsets.length === physicalMoves.length) {
            return displayOnsets.map((notation, onsetIndex) => ({
                notation,
                displayIndex,
                physicalMoves: [physicalMoves[onsetIndex]],
            }));
        }
        return displayOnsets.map((notation, onsetIndex) => ({
            notation,
            displayIndex,
            physicalMoves: onsetIndex === 0 ? [...physicalMoves] : [],
        }));
    });

    return { displayTokens, presentationSteps, executionSteps };
};

/** 将含 x/y/z、切片、宽转的公式改写为硬件可提示的外层步骤；面字母按握持朝向映射到物理面 */
export const mapGuidanceFormulaToPhysicalTokens = (
    formula: string,
    orientation = DEFAULT_LEVEL_FORMULA_ORIENTATION,
): string[] => {
    const parsed = parseFormulaTokens(formula);
    if (parsed.invalidTokens.length > 0) {
        throw new Error(`无效动作：${parsed.invalidTokens.join(', ')}`);
    }
    const { mapped: gripTokens } = mapTokensByOrientationWithSource(
        parsed.tokens,
        orientation,
        orientation,
    );
    return toPhysicalTokensFromGrip(gripTokens, orientation);
};

/** 列表首屏用：只看有没有公式，不做矩阵推演（大批量关卡时避免卡死） */
export const peekLevelGuidanceSummary = (level: LevelDefinition): LevelGuidanceSummary => {
    const formula = level.guidanceFormula?.trim() || level.rotationFormula?.trim() || null;
    if (!formula) {
        return {
            status: 'missing',
            formula: null,
            displayTokens: [],
            presentationSteps: [],
            executionSteps: [],
            stepCount: 0,
            message: '缺少推荐解法',
        };
    }

    return {
        status: 'ready',
        formula,
        displayTokens: [],
        presentationSteps: [],
        executionSteps: [],
        stepCount: 0,
        message: '解法校验中…',
    };
};

export const getLevelGuidanceSummary = (level: LevelDefinition): LevelGuidanceSummary => {
    const guidanceFormula = level.guidanceFormula?.trim();
    const sourceFormula = level.guidanceSourceFormula?.trim()
        || (level.stateDefinitionMode === 'formula' ? level.rotationFormula?.trim() : undefined)
        || guidanceFormula;
    const formula = sourceFormula || level.rotationFormula?.trim();
    if (!formula) {
        return {
            status: 'missing',
            formula: null,
            displayTokens: [],
            presentationSteps: [],
            executionSteps: [],
            stepCount: 0,
            message: '缺少推荐解法',
        };
    }

    try {
        const orientation = level.formulaOrientation ?? DEFAULT_LEVEL_FORMULA_ORIENTATION;
        const parsed = parseFormulaTokens(formula);
        if (parsed.invalidTokens.length > 0) {
            throw new Error(`无效动作：${parsed.invalidTokens.join(', ')}`);
        }
        let mappedTokens: string[];
        let mappedSourceIndices: number[];
        if (sourceFormula) {
            const mapped = mapTokensByOrientationWithSource(
                parsed.tokens,
                orientation,
                orientation,
            );
            mappedTokens = toPhysicalTokensFromGrip(mapped.mapped, orientation);
            mappedSourceIndices = mapped.sourceIndices;
        } else {
            try {
                const preset = deriveLevelDebugFormulaPreset(
                    formula,
                    resolveBuiltinFormulaTarget(level.rotationTarget ?? 'f2l'),
                    orientation,
                );
                mappedTokens = preset.mappedTokens;
                mappedSourceIndices = preset.mappedSourceIndices;
            } catch {
                const preset = deriveLevelFormulaPreset(
                    formula,
                    resolveBuiltinFormulaTarget(level.rotationTarget),
                );
                mappedTokens = preset.mappedTokens;
                mappedSourceIndices = parsed.tokens.map((_, index) => index);
            }
        }
        const guidanceSteps = buildGuidanceSteps(
            parsed.tokens,
            parsed.displayTokens,
            mappedTokens,
            mappedSourceIndices,
        );
        if (guidanceSteps.executionSteps.length === 0) {
            throw new Error('推荐解法没有可执行步骤');
        }

        const unsupportedStep = guidanceSteps.executionSteps.find(
            (step) => notationToFace(step.notation) === null,
        );
        if (unsupportedStep) {
            throw new Error(`步骤 ${unsupportedStep.notation} 无法映射到硬件外层面`);
        }

        const result = applyTokensToState(level.startStateMatrix, mappedTokens);
        if (!isFormulaLevelGoalReachedForLevel(
            result,
            level,
            level.brightnessMatrix,
            INITIAL_COLOR_MATRIX,
        )) {
            throw new Error('推荐解法无法从当前起始状态完成点亮区域目标');
        }

        return {
            status: 'ready',
            formula,
            ...guidanceSteps,
            stepCount: guidanceSteps.executionSteps.length,
            message: `推荐解法 ${guidanceSteps.executionSteps.length} 步`,
        };
    } catch (error) {
        return {
            status: 'invalid',
            formula,
            displayTokens: [],
            presentationSteps: [],
            executionSteps: [],
            stepCount: 0,
            message: error instanceof Error ? error.message : '解法校验失败',
        };
    }
};
