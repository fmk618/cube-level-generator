import type { StateMatrix, BrightnessMatrix } from '../cube/types';
import type { DevCustomOrientation } from '../formula/types';

export type LevelId = string;
export type LevelChapterId = string;
/** 内置 CFOP 阶段，或 custom（需配合 rotationTargetLabel） */
export type LevelFormulaTarget = 'f2l' | 'oll' | 'pll' | 'custom';
export const LEVEL_FORMULA_BUILTIN_TARGETS = ['f2l', 'oll', 'pll'] as const;
export type LevelFormulaBuiltinTarget = (typeof LEVEL_FORMULA_BUILTIN_TARGETS)[number];

/** 推导 preset / 默认亮度时：custom 回落到 f2l 仅作映射占位，不表示用户目标是 F2L */
export const resolveBuiltinFormulaTarget = (
    target: LevelFormulaTarget | undefined,
): LevelFormulaBuiltinTarget => {
    if (target === 'oll' || target === 'pll' || target === 'f2l') return target;
    return 'f2l';
};

export const formatLevelFormulaTargetLabel = (
    target: LevelFormulaTarget | undefined,
    label?: string,
): string => {
    if (target === 'custom') {
        const trimmed = label?.trim();
        return trimmed || '自定义';
    }
    return (target ?? 'f2l').toUpperCase();
};
/** -1=永不开启指引；0=进入即开；1-5=连续失败 N 次后开启。开启后 0/1/2… 共用同一流程：先音乐+3D转动/箭头/公式（不下发流水灯），音乐结束后再启动硬件流水灯；0 次自动开启不重复创建第二个关卡记录。 */
export type LevelGuidanceFailureThreshold = -1 | 0 | 1 | 2 | 3 | 4 | 5;

export interface LevelChapterConfig {
    id: LevelChapterId;
    partNumber: number;
    partName: string;
    title: string;
    description?: string;
    capacity: number;
}

export interface LevelDefinition {
    id: LevelId;
    chapterId: LevelChapterId;
    order: number;
    title: string;
    description: string;
    startStateMatrix: StateMatrix;
    goalStateMatrix: StateMatrix;
    /** 多个等效目标态（如绕 Y 轴四向）；命中任一即过关 */
    goalStateMatrices?: StateMatrix[];
    brightnessMatrix: BrightnessMatrix;
    maxMoves: number;
    starThresholds: [number, number];
    hint?: string;
    rotationFormula?: string;
    rotationTarget?: LevelFormulaTarget;
    /** 当 rotationTarget 为 custom 时的显示名（如「十字」） */
    rotationTargetLabel?: string;
    /** 公式源默认白顶绿前；特殊关卡可保存自己的顶面/前面组合 */
    formulaOrientation?: DevCustomOrientation;
    guidanceFormula?: string;
    guidanceFailureThreshold?: LevelGuidanceFailureThreshold;
    hidden?: boolean;
}

export interface LevelCatalogDocument {
    version: number;
    chapters: LevelChapterConfig[];
    levels: LevelDefinition[];
}

// chapters 在旧版 v1 文件中不存在；导入时会自动补为内置默认章节。
export type LevelFileFormat = Omit<LevelCatalogDocument, 'chapters'> & {
    chapters?: LevelChapterConfig[];
};
