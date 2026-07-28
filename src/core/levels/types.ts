import type { StateMatrix, BrightnessMatrix } from '../cube/types';

export type LevelId = string;
export type LevelChapterId = string;
export type LevelFormulaTarget = 'f2l' | 'oll' | 'pll';
export type LevelGuidanceFailureThreshold = 0 | 1 | 2 | 3;

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
    brightnessMatrix: BrightnessMatrix;
    maxMoves: number;
    starThresholds: [number, number];
    hint?: string;
    rotationFormula?: string;
    rotationTarget?: LevelFormulaTarget;
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
