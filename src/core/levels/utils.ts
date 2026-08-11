/**
 * 关卡工具函数
 */

import {
    parseNotation,
    rotateStateMatrixLayer,
    INITIAL_STATE_MATRIX,
    type StateMatrix,
    type BrightnessMatrix,
} from '../cube';
import { resolveOrientationRecord } from '../formula/orientation';
import type { DevCustomOrientation } from '../formula/types';
import { LEVEL_LAYOUT_CHAPTERS } from './chapters';
import { normalizeLevelGoalStates } from './goalStates';
import type {
    LevelCatalogDocument,
    LevelChapterConfig,
    LevelDefinition,
    LevelFileFormat,
    LevelChapterId,
    LevelFormulaTarget,
    LevelGuidanceFailureThreshold,
    LevelStateDefinitionMode,
} from './types';

/**
 * 将魔方公式应用到初始状态矩阵，生成目标 stateMatrix
 * @param formula - 公式字符串，如 "R U R' U'"，空字符串返回初始状态（复原态）
 */
export const formulaToStateMatrix = (formula: string): StateMatrix => {
    if (!formula.trim()) {
        return INITIAL_STATE_MATRIX.map((face) => face.map((row) => [...row]));
    }

    const moves = parseNotation(formula);
    let matrix: StateMatrix = INITIAL_STATE_MATRIX.map((face) => face.map((row) => [...row]));

    for (const move of moves) {
        matrix = rotateStateMatrixLayer(matrix, move.axis, move.index, move.dir);
    }

    return matrix;
};

/**
 * 根据高亮贴纸 ID 列表生成 6×3×3 亮度矩阵
 * 指定 sticker ID 亮（8），其余灭（0）
 */
export const makeBrightnessForStickers = (stickerIds: number[]): BrightnessMatrix => {
    const idSet = new Set(stickerIds);
    return Array.from({ length: 6 }, (_, face) =>
        Array.from({ length: 3 }, (_, row) =>
            Array.from({ length: 3 }, (_, col) => {
                const stickerId = INITIAL_STATE_MATRIX[face][row][col];
                return idSet.has(stickerId) ? 8 : 0;
            }),
        ),
    );
};

export const getMinimumStarThresholds = (maxMoves: number): [number, number] => {
    const normalizedMaxMoves = Math.max(1, Math.floor(maxMoves));
    const threeStar = Math.max(1, Math.floor(normalizedMaxMoves * 0.5));
    const twoStar = Math.max(threeStar, Math.floor(normalizedMaxMoves * 0.75));
    return [threeStar, twoStar];
};

export const resolveStarThresholds = (
    maxMoves: number,
    configuredThresholds: [number, number],
): [number, number] => {
    const [minimumThreeStar, minimumTwoStar] = getMinimumStarThresholds(maxMoves);
    const threeStar = Math.max(configuredThresholds[0], minimumThreeStar);
    const twoStar = Math.max(configuredThresholds[1], minimumTwoStar, threeStar);
    return [Math.min(threeStar, maxMoves), Math.min(twoStar, maxMoves)];
};

/**
 * 配置可以放宽奖励，但至少保证用掉不超过 50% / 75% 步数时获得 3 / 2 星。
 */
export const calculateStars = (
    moveCount: number,
    starThresholds: [number, number],
    maxMoves: number,
): number => {
    const [threeStar, twoStar] = resolveStarThresholds(maxMoves, starThresholds);
    if (moveCount <= threeStar) return 3;
    if (moveCount <= twoStar) return 2;
    return 1;
};

const LEVEL_FILE_VERSION = 2;
const MIN_STICKER_ID = 0;
const MAX_STICKER_ID = 53;
export const DEFAULT_LEVEL_GUIDANCE_FAILURE_THRESHOLD: LevelGuidanceFailureThreshold = 3;

export const LEVEL_GUIDANCE_FAILURE_THRESHOLD_OPTIONS: LevelGuidanceFailureThreshold[] = [
    -1, 0, 1, 2, 3, 4, 5,
];

const isGuidanceFailureThreshold = (value: unknown): value is LevelGuidanceFailureThreshold =>
    value === -1
    || value === 0
    || value === 1
    || value === 2
    || value === 3
    || value === 4
    || value === 5;

/** v1：0=永久关闭，N=失败 N-1 次后开 → v2：-1=关闭，N=失败 N 次后开 */
const migrateGuidanceFailureThresholdFromV1 = (
    value: unknown,
): LevelGuidanceFailureThreshold => {
    if (value === 0) return -1;
    if (value === 1) return 0;
    if (value === 2) return 1;
    if (value === 3) return 2;
    return DEFAULT_LEVEL_GUIDANCE_FAILURE_THRESHOLD;
};

export const resolveLevelGuidanceFailureThreshold = (
    value: unknown,
): LevelGuidanceFailureThreshold => (
    isGuidanceFailureThreshold(value) ? value : DEFAULT_LEVEL_GUIDANCE_FAILURE_THRESHOLD
);

export const formatGuidanceFailureThresholdLabel = (
    value: unknown,
): string => {
    const threshold = resolveLevelGuidanceFailureThreshold(value);
    if (threshold === -1) return '不开启指引';
    if (threshold === 0) return '进入即开指引';
    return `失败 ${threshold} 次解锁`;
};

/** 指引开启后的统一播放流程（与 App 一致；0/1/2… 次共用） */
export const GUIDANCE_UNLOCK_PLAYBACK_FLOW_STEPS = [
    '进入关卡或解锁指引后，先播放音乐。',
    '同时播放 3D 转动、箭头和公式提示。',
    '音乐/箭头演示阶段不会下发流水灯给硬件魔方。',
    '音乐结束后，才启动硬件流水灯。',
    '0 次、1 次、2 次… 都使用同一套流程。',
] as const;

export const GUIDANCE_UNLOCK_PLAYBACK_FLOW = GUIDANCE_UNLOCK_PLAYBACK_FLOW_STEPS.join(' ');

export const describeGuidanceFailureThreshold = (
    value: unknown,
): string => {
    const threshold = resolveLevelGuidanceFailureThreshold(value);
    if (threshold === -1) {
        return '不开启：本关永不播放音乐/箭头/公式演示，也不下发流水灯指引。';
    }
    if (threshold === 0) {
        return [
            '0 次：进入本关即自动开启指引。',
            GUIDANCE_UNLOCK_PLAYBACK_FLOW,
            '0 次自动开启时不会重复创建第二个关卡记录。',
        ].join(' ');
    }
    return [
        `${threshold} 次：连续失败 ${threshold} 次后解锁指引。`,
        GUIDANCE_UNLOCK_PLAYBACK_FLOW,
    ].join(' ');
};

const isPositiveInteger = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value > 0;

const isNonEmptyString = (value: unknown): value is string =>
    typeof value === 'string' && value.trim().length > 0;

const cloneDefaultChapters = (): LevelChapterConfig[] =>
    LEVEL_LAYOUT_CHAPTERS.map((chapter) => ({ ...chapter }));

const normalizeChapters = (chapters: LevelChapterConfig[]): LevelChapterConfig[] =>
    chapters.map((chapter, index) => ({
        ...chapter,
        id: chapter.id.trim(),
        partNumber: index + 1,
        partName: chapter.partName.trim(),
        title: chapter.title.trim(),
        description: chapter.description?.trim() || undefined,
        capacity: chapter.capacity,
    }));

export const sortLevelsBySlotOrder = (
    levels: LevelDefinition[],
    chapters: LevelChapterConfig[] = LEVEL_LAYOUT_CHAPTERS,
): LevelDefinition[] => {
    const chapterOrderById = new Map(
        chapters.map((chapter, index) => [chapter.id, index] as const),
    );

    return [...levels].sort((a, b) => {
        const chapterOrderDiff =
            (chapterOrderById.get(a.chapterId) ?? Number.MAX_SAFE_INTEGER)
            - (chapterOrderById.get(b.chapterId) ?? Number.MAX_SAFE_INTEGER);
        if (chapterOrderDiff !== 0) return chapterOrderDiff;
        const levelOrderDiff = a.order - b.order;
        if (levelOrderDiff !== 0) return levelOrderDiff;
        return a.id.localeCompare(b.id);
    });
};

const normalizeChapterOrders = (
    levels: LevelDefinition[],
    chapters: LevelChapterConfig[],
): LevelDefinition[] => {
    const normalizedOrdersById = new Map<string, number>();
    const levelsByChapterId = new Map<LevelChapterId, LevelDefinition[]>();

    for (const level of sortLevelsBySlotOrder(levels, chapters)) {
        const chapterLevels = levelsByChapterId.get(level.chapterId) ?? [];
        chapterLevels.push(level);
        levelsByChapterId.set(level.chapterId, chapterLevels);
    }

    for (const chapter of chapters) {
        const chapterLevels = levelsByChapterId.get(chapter.id) ?? [];
        chapterLevels.forEach((level, index) => {
            normalizedOrdersById.set(level.id, index + 1);
        });
    }

    return sortLevelsBySlotOrder(levels, chapters).map((level) => ({
        ...level,
        order: normalizedOrdersById.get(level.id) ?? level.order,
    }));
};

export const normalizeLevelCatalogDocument = (
    document: LevelCatalogDocument,
): LevelCatalogDocument => {
    const sourceVersion = typeof document.version === 'number' ? document.version : 1;
    const sourceLevels = sourceVersion < 2
        ? document.levels.map((level) => ({
            ...level,
            guidanceFailureThreshold: migrateGuidanceFailureThresholdFromV1(
                level.guidanceFailureThreshold,
            ),
        }))
        : document.levels;

    const chapters = normalizeChapters(document.chapters);
    return {
        version: LEVEL_FILE_VERSION,
        chapters,
        levels: normalizeChapterOrders(sourceLevels, chapters).map((level) => {
            const normalizedGoals = normalizeLevelGoalStates(level);
            const stateDefinitionMode: LevelStateDefinitionMode = level.stateDefinitionMode
                ?? (level.rotationFormula?.trim() ? 'formula' : 'brightness');
            return {
                ...level,
                ...normalizedGoals,
                id: level.id.trim(),
                chapterId: level.chapterId.trim(),
                order: level.order,
                title: level.title.trim(),
                description: level.description.trim(),
                starThresholds: resolveStarThresholds(level.maxMoves, level.starThresholds),
                hint: level.hint?.trim() || undefined,
                rotationFormula: level.rotationFormula?.trim() || undefined,
                rotationTarget: level.rotationTarget as LevelFormulaTarget | undefined,
                rotationTargetLabel: level.rotationTargetLabel?.trim() || undefined,
                formulaOrientation: level.formulaOrientation
                    ? { ...level.formulaOrientation }
                    : undefined,
                stateDefinitionMode,
                guidanceFormula: level.guidanceFormula?.trim() || undefined,
                guidanceFailureThreshold: resolveLevelGuidanceFailureThreshold(
                    level.guidanceFailureThreshold,
                ),
                hidden: level.hidden === true ? true : undefined,
            };
        }),
    };
};

/**
 * 将关卡目录序列化为 JSON 字符串
 */
export const exportLevelsToJSON = (document: LevelCatalogDocument): string => {
    const file: LevelFileFormat = normalizeLevelCatalogDocument({
        version: LEVEL_FILE_VERSION,
        chapters: document.chapters,
        levels: document.levels,
    });
    return JSON.stringify(file, null, 2);
};

/**
 * 从 JSON 字符串反序列化关卡目录
 * @returns 校验通过的关卡目录，校验失败抛出 Error
 */
export const importLevelsFromJSON = (json: string): LevelCatalogDocument => {
    const parsed = JSON.parse(json) as LevelFileFormat;

    if (!parsed || typeof parsed.version !== 'number') {
        throw new Error('Invalid level file format: missing version field');
    }
    if (parsed.version !== 1 && parsed.version !== LEVEL_FILE_VERSION) {
        throw new Error(`Unsupported file version: ${parsed.version}, current supported: 1-${LEVEL_FILE_VERSION}`);
    }
    if (!Array.isArray(parsed.levels)) {
        throw new Error('No levels array in level file');
    }

    const chapters = parsed.chapters === undefined
        ? cloneDefaultChapters()
        : parsed.chapters;
    validateChapterConfigs(chapters);
    const normalizedChapters = normalizeChapters(chapters);
    const chapterById = new Map(
        normalizedChapters.map((chapter) => [chapter.id, chapter] as const),
    );

    const idSet = new Set<string>();
    const chapterOrderSet = new Set<string>();

    for (const level of parsed.levels) {
        validateLevelDefinition(level, chapterById);
        if (idSet.has(level.id)) {
            throw new Error(`Duplicate ID in level file: ${level.id}`);
        }
        const chapterOrderKey = `${level.chapterId}::${level.order}`;
        if (chapterOrderSet.has(chapterOrderKey)) {
            throw new Error(`Duplicate chapter order in level file: ${level.chapterId} #${level.order}`);
        }
        idSet.add(level.id);
        chapterOrderSet.add(chapterOrderKey);
    }

    return normalizeLevelCatalogDocument({
        version: parsed.version,
        chapters: normalizedChapters,
        levels: parsed.levels,
    });
};

const validateChapterConfigs = (chapters: LevelChapterConfig[]): void => {
    if (!Array.isArray(chapters) || chapters.length === 0) {
        throw new Error('Level file must contain at least one chapter');
    }

    const idSet = new Set<string>();
    for (const chapter of chapters) {
        if (!isNonEmptyString(chapter.id)) {
            throw new Error(`Invalid chapter ID: ${String(chapter.id)}`);
        }
        if (idSet.has(chapter.id.trim())) {
            throw new Error(`Duplicate chapter ID: ${chapter.id}`);
        }
        if (!isNonEmptyString(chapter.partName)) {
            throw new Error(`Chapter ${chapter.id}: invalid partName`);
        }
        if (!isNonEmptyString(chapter.title)) {
            throw new Error(`Chapter ${chapter.id}: invalid title`);
        }
        if (chapter.description !== undefined && !isNonEmptyString(chapter.description)) {
            throw new Error(`Chapter ${chapter.id}: invalid description`);
        }
        if (!isPositiveInteger(chapter.capacity)) {
            throw new Error(`Chapter ${chapter.id}: invalid capacity`);
        }
        idSet.add(chapter.id.trim());
    }
};

const validateStateMatrix = (
    level: LevelDefinition,
    matrixLabel: string,
    matrix: StateMatrix,
): void => {
    const stickerIds: number[] = [];
    if (!Array.isArray(matrix) || matrix.length !== 6) {
        throw new Error(`Level ${level.id}: ${matrixLabel} must be a 6x3x3 array`);
    }
    for (let face = 0; face < 6; face += 1) {
        if (!Array.isArray(matrix[face]) || matrix[face].length !== 3) {
            throw new Error(`Level ${level.id}: ${matrixLabel}[${face}] must be a 3x3 array`);
        }
        for (let row = 0; row < 3; row += 1) {
            if (!Array.isArray(matrix[face][row]) || matrix[face][row].length !== 3) {
                throw new Error(`Level ${level.id}: ${matrixLabel}[${face}][${row}] must have 3 elements`);
            }
            for (let col = 0; col < 3; col += 1) {
                const value = matrix[face][row][col];
                if (!Number.isInteger(value) || value < MIN_STICKER_ID || value > MAX_STICKER_ID) {
                    throw new Error(`Level ${level.id}: ${matrixLabel}[${face}][${row}][${col}] invalid sticker ID`);
                }
                stickerIds.push(value);
            }
        }
    }
    if (stickerIds.length !== 54 || new Set(stickerIds).size !== 54) {
        throw new Error(`Level ${level.id}: ${matrixLabel} must contain 54 unique sticker IDs`);
    }
};

/**
 * 校验单个关卡定义的数据完整性
 */
const validateLevelDefinition = (
    level: LevelDefinition,
    chapterById: Map<string, LevelChapterConfig>,
): void => {
    if (!isNonEmptyString(level.id)) {
        throw new Error(`Invalid level ID: ${String(level.id)}`);
    }
    if (!isNonEmptyString(level.chapterId)) {
        throw new Error(`Level ${level.id}: invalid chapterId`);
    }
    const chapter = chapterById.get(level.chapterId);
    if (!chapter) {
        throw new Error(`Level ${level.id}: chapterId ${level.chapterId} does not exist`);
    }
    if (!isPositiveInteger(level.order)) {
        throw new Error(`Level ${level.id}: invalid order`);
    }
    if (!level.title?.trim() || !level.description?.trim()) {
        throw new Error(`Level ${level.id}: missing title or description`);
    }
    if (level.rotationTarget !== undefined) {
        const allowed = ['f2l', 'oll', 'pll', 'custom'];
        if (!allowed.includes(level.rotationTarget)) {
            throw new Error(`Level ${level.id}: invalid rotationTarget`);
        }
        if (level.rotationTarget === 'custom' && !level.rotationTargetLabel?.trim()) {
            throw new Error(`Level ${level.id}: custom rotationTarget requires rotationTargetLabel`);
        }
    }
    if (
        level.rotationTargetLabel !== undefined
        && typeof level.rotationTargetLabel === 'string'
        && !level.rotationTargetLabel.trim()
    ) {
        throw new Error(`Level ${level.id}: invalid rotationTargetLabel`);
    }
    if (level.formulaOrientation !== undefined) {
        try {
            resolveOrientationRecord(level.formulaOrientation as DevCustomOrientation);
        } catch {
            throw new Error(`Level ${level.id}: invalid formulaOrientation`);
        }
    }
    if (
        level.stateDefinitionMode !== undefined
        && !['formula', 'brightness'].includes(level.stateDefinitionMode)
    ) {
        throw new Error(`Level ${level.id}: invalid stateDefinitionMode`);
    }
    if (level.guidanceFormula !== undefined && !isNonEmptyString(level.guidanceFormula)) {
        throw new Error(`Level ${level.id}: invalid guidanceFormula`);
    }
    if (
        level.guidanceFailureThreshold !== undefined
        && !isGuidanceFailureThreshold(level.guidanceFailureThreshold)
    ) {
        throw new Error(`Level ${level.id}: invalid guidanceFailureThreshold`);
    }

    for (const matrixName of ['startStateMatrix', 'goalStateMatrix'] as const) {
        validateStateMatrix(level, matrixName, level[matrixName]);
    }

    if (level.goalStateMatrices !== undefined) {
        if (!Array.isArray(level.goalStateMatrices) || level.goalStateMatrices.length === 0) {
            throw new Error(`Level ${level.id}: goalStateMatrices must be a non-empty array`);
        }
        level.goalStateMatrices.forEach((matrix, index) => {
            validateStateMatrix(level, `goalStateMatrices[${index}]`, matrix);
        });
    }

    if (!Array.isArray(level.brightnessMatrix) || level.brightnessMatrix.length !== 6) {
        throw new Error(`Level ${level.id}: brightnessMatrix must be a 6x3x3 array`);
    }
    for (let face = 0; face < 6; face += 1) {
        if (!Array.isArray(level.brightnessMatrix[face]) || level.brightnessMatrix[face].length !== 3) {
            throw new Error(`Level ${level.id}: brightnessMatrix[${face}] must be a 3x3 array`);
        }
        for (let row = 0; row < 3; row += 1) {
            if (!Array.isArray(level.brightnessMatrix[face][row]) || level.brightnessMatrix[face][row].length !== 3) {
                throw new Error(`Level ${level.id}: brightnessMatrix[${face}][${row}] must have 3 elements`);
            }
            for (let col = 0; col < 3; col += 1) {
                const value = level.brightnessMatrix[face][row][col];
                if (!Number.isInteger(value) || value < 0 || value > 10) {
                    throw new Error(`Level ${level.id}: brightnessMatrix[${face}][${row}][${col}] invalid brightness`);
                }
            }
        }
    }

    if (!isPositiveInteger(level.maxMoves)) {
        throw new Error(`Level ${level.id}: invalid maxMoves`);
    }
    if (!Array.isArray(level.starThresholds) || level.starThresholds.length !== 2) {
        throw new Error(`Level ${level.id}: starThresholds must be [number, number]`);
    }
    const [threeStar, twoStar] = level.starThresholds;
    if (
        !isPositiveInteger(threeStar) ||
        !isPositiveInteger(twoStar) ||
        threeStar > twoStar ||
        twoStar > level.maxMoves
    ) {
        throw new Error(`Level ${level.id}: starThresholds must satisfy 1 <= 3-star <= 2-star <= maxMoves`);
    }
};
