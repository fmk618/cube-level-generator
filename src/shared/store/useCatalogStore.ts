import { create } from 'zustand';
import {
    buildLevelForChapter,
    deriveLevelFormulaPreset,
    exportLevelsToJSON,
    getMinimumStarThresholds,
    importLevelsFromJSON,
    normalizeLevelCatalogDocument,
    sortLevelsBySlotOrder,
    type LevelCatalogDocument,
    type LevelChapterConfig,
    type LevelChapterId,
    type LevelDefinition,
    type LevelFormulaTarget,
    type LevelId,
} from '@/core/levels';
import type { StateMatrix } from '@/core/cube';
import { useCloudSyncStore } from '@/shared/store/useCloudSyncStore';

export type LevelMoveDirection = 'up' | 'down';

export type AiLevelCreateInput = {
    title: string;
    description: string;
    hint?: string;
    rotationFormula: string;
    rotationTarget: LevelFormulaTarget;
    guidanceFormula?: string;
    maxMoves: number;
};

export type AiChapterCreateInput = {
    partName: string;
    title: string;
    description: string;
    capacity: number;
    levels?: AiLevelCreateInput[];
};

type CatalogState = {
    catalog: LevelCatalogDocument | null;
    savedCatalog: LevelCatalogDocument | null;
    levels: LevelDefinition[];
    chapters: LevelChapterConfig[];
    isLoaded: boolean;
    isLoading: boolean;
    hasUnsavedChanges: boolean;
    runtimeFilePath: string | null;
    loadError: string | null;

    refreshCatalog: (options?: { force?: boolean; persistLocal?: boolean }) => Promise<void>;
    importCatalogFromJSON: (json: string) => void;
    importFromDisk: () => Promise<boolean>;
    exportToDisk: () => Promise<string | null>;
    saveCatalog: () => Promise<string>;
    /** 仅写本地 runtime，不推远程 */
    saveLocal: (options?: { manageSync?: boolean }) => Promise<string>;
    /** 仅推当前内存目录到 MySQL */
    pushRemote: (options?: { manageSync?: boolean }) => Promise<void>;
    discardChanges: () => void;
    resetToDefault: () => Promise<void>;

    createChapter: (input: Pick<LevelChapterConfig, 'partName' | 'title' | 'description' | 'capacity'>) => LevelChapterConfig;
    updateChapter: (chapterId: LevelChapterId, partial: Partial<Pick<LevelChapterConfig, 'partName' | 'title' | 'description' | 'capacity'>>) => LevelChapterConfig | null;
    moveChapter: (chapterId: LevelChapterId, direction: LevelMoveDirection) => void;
    deleteChapter: (chapterId: LevelChapterId) => void;

    createLevelForChapter: (chapterId: LevelChapterId, insertOrder?: number) => LevelDefinition;
    duplicateLevel: (levelId: LevelId) => LevelDefinition;
    updateLevel: (levelId: LevelId, partial: Partial<LevelDefinition>) => LevelDefinition | null;
    moveLevel: (levelId: LevelId, direction: LevelMoveDirection) => void;
    deleteLevel: (levelId: LevelId) => void;
    getLevelById: (levelId: LevelId) => LevelDefinition | undefined;
    applyAiLevelProposals: (chapterId: LevelChapterId, proposals: AiLevelCreateInput[]) => string[];
    applyAiChapterProposals: (proposals: AiChapterCreateInput[]) => { chapterIds: string[]; levelIds: string[] };
};

const cloneStateMatrices = (matrices: StateMatrix[]): StateMatrix[] =>
    matrices.map((matrix) => matrix.map((face) => face.map((row) => [...row])));

const cloneCatalog = (catalog: LevelCatalogDocument): LevelCatalogDocument =>
    normalizeLevelCatalogDocument({
        version: catalog.version,
        chapters: catalog.chapters.map((chapter) => ({ ...chapter })),
        levels: catalog.levels.map((level) => ({
            ...level,
            startStateMatrix: level.startStateMatrix.map((face) => face.map((row) => [...row])),
            goalStateMatrix: level.goalStateMatrix.map((face) => face.map((row) => [...row])),
            goalStateMatrices: level.goalStateMatrices
                ? cloneStateMatrices(level.goalStateMatrices)
                : undefined,
            brightnessMatrix: level.brightnessMatrix.map((face) => face.map((row) => [...row])),
        })),
    });

const updateCatalogInMemory = (
    currentCatalog: LevelCatalogDocument,
    updater: (levels: LevelDefinition[]) => LevelDefinition[],
): LevelCatalogDocument => normalizeLevelCatalogDocument({
    version: currentCatalog.version,
    chapters: currentCatalog.chapters,
    levels: updater(currentCatalog.levels),
});

const updateChaptersInMemory = (
    currentCatalog: LevelCatalogDocument,
    updater: (chapters: LevelChapterConfig[]) => LevelChapterConfig[],
): LevelCatalogDocument => normalizeLevelCatalogDocument({
    version: currentCatalog.version,
    chapters: updater(currentCatalog.chapters),
    levels: currentCatalog.levels,
});

const createChapterId = (chapters: LevelChapterConfig[]): LevelChapterId => {
    let candidate = `part-${Date.now().toString(36)}`;
    let suffix = 1;
    const existingIds = new Set(chapters.map((chapter) => chapter.id));
    while (existingIds.has(candidate)) {
        candidate = `part-${Date.now().toString(36)}-${suffix}`;
        suffix += 1;
    }
    return candidate;
};

const insertLevelIntoChapter = (
    levels: LevelDefinition[],
    nextLevel: LevelDefinition,
    insertOrder: number,
): LevelDefinition[] => [
    ...levels.map((level) => (
        level.chapterId === nextLevel.chapterId && level.order >= insertOrder
            ? { ...level, order: level.order + 1 }
            : level
    )),
    { ...nextLevel, order: insertOrder },
];

const moveLevelInCatalogOrder = (
    levels: LevelDefinition[],
    chapters: LevelChapterConfig[],
    levelId: LevelId,
    direction: LevelMoveDirection,
): LevelDefinition[] => {
    const orderedLevels = sortLevelsBySlotOrder(levels, chapters);
    const currentLevel = orderedLevels.find((level) => level.id === levelId);
    if (!currentLevel) {
        throw new Error(`找不到要移动的关卡：${levelId}`);
    }

    const currentIndex = orderedLevels.findIndex((level) => level.id === levelId);
    const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    const swapTarget = orderedLevels[swapIndex];
    if (!swapTarget) return levels;

    return levels.map((level) => {
        if (level.id === currentLevel.id) {
            return { ...level, chapterId: swapTarget.chapterId, order: swapTarget.order };
        }
        if (level.id === swapTarget.id) {
            return { ...level, chapterId: currentLevel.chapterId, order: currentLevel.order };
        }
        return level;
    });
};

const applyCatalog = (
    set: (partial: Partial<CatalogState>) => void,
    catalog: LevelCatalogDocument,
    savedCatalog: LevelCatalogDocument | null,
    hasUnsavedChanges: boolean,
): void => {
    const normalizedCatalog = cloneCatalog(catalog);
    const normalizedSavedCatalog = !savedCatalog
        ? null
        : (!hasUnsavedChanges && savedCatalog === catalog ? normalizedCatalog : cloneCatalog(savedCatalog));

    set({
        catalog: normalizedCatalog,
        savedCatalog: normalizedSavedCatalog,
        levels: normalizedCatalog.levels,
        chapters: normalizedCatalog.chapters,
        isLoaded: true,
        hasUnsavedChanges,
    });
};

export const useCatalogStore = create<CatalogState>()((set, get) => ({
    catalog: null,
    savedCatalog: null,
    levels: [],
    chapters: [],
    isLoaded: false,
    isLoading: false,
    hasUnsavedChanges: false,
    runtimeFilePath: null,
    loadError: null,

    refreshCatalog: async (options) => {
        const force = options?.force === true;
        const persistLocal = options?.persistLocal === true;
        const state = get();
        if (!force && state.hasUnsavedChanges && state.catalog) return;

        set({ isLoading: true, loadError: null });
        try {
            let catalog: LevelCatalogDocument | null = null;
            let fromCloud = false;
            try {
                const cloud = await Promise.race([
                    window.api.db.pullCatalog(),
                    new Promise<null>((resolve) => {
                        window.setTimeout(() => resolve(null), 8000);
                    }),
                ]);
                if (cloud) {
                    catalog = normalizeLevelCatalogDocument(cloud);
                    fromCloud = true;
                }
            } catch {
                // 云端不可用时回退本地
            }

            if (!catalog) {
                if (force && persistLocal) {
                    throw new Error('无法从云端拉取关卡目录，请检查网络与数据库连接');
                }
                const runtimeJson = await window.api.catalog.loadRuntime();
                const json = runtimeJson ?? await window.api.catalog.loadDefault();
                catalog = importLevelsFromJSON(json);
            }

            const runtimeFilePath = persistLocal && fromCloud
                ? await window.api.catalog.saveRuntime(exportLevelsToJSON(catalog))
                : await window.api.catalog.getRuntimePath();
            // 异步拉取期间若用户已开始编辑，勿覆盖草稿
            if (!force && get().hasUnsavedChanges) {
                set({ isLoading: false });
                return;
            }
            applyCatalog(set, catalog, catalog, false);
            set({ isLoading: false, runtimeFilePath });
        } catch (error) {
            set({
                isLoading: false,
                loadError: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    },

    importCatalogFromJSON: (json) => {
        const catalog = importLevelsFromJSON(json);
        const savedCatalog = get().savedCatalog ?? get().catalog ?? null;
        applyCatalog(set, catalog, savedCatalog ? cloneCatalog(savedCatalog) : null, true);
    },

    importFromDisk: async () => {
        const result = await window.api.catalog.importFromDisk();
        if (!result) return false;
        get().importCatalogFromJSON(result.content);
        return true;
    },

    exportToDisk: async () => {
        const catalog = get().catalog;
        if (!catalog) return null;
        const json = exportLevelsToJSON(catalog);
        return window.api.catalog.exportToDisk(json, 'game_levels_english.json');
    },

    saveCatalog: async () => get().saveLocal(),

    saveLocal: async (options) => {
        const manageSync = options?.manageSync !== false;
        const catalog = get().catalog;
        if (!catalog) throw new Error('关卡目录尚未加载。');
        const sync = useCloudSyncStore.getState();
        if (manageSync) sync.beginLocal('正在保存关卡到本地…');
        const json = exportLevelsToJSON(catalog);
        const filePath = await window.api.catalog.saveRuntime(json);
        applyCatalog(set, catalog, catalog, false);
        set({ runtimeFilePath: filePath });
        if (manageSync) sync.finishOk('关卡已保存到本地（未推远程）');
        return filePath;
    },

    pushRemote: async (options) => {
        const manageSync = options?.manageSync !== false;
        const catalog = get().catalog;
        if (!catalog) throw new Error('关卡目录尚未加载。');
        const sync = useCloudSyncStore.getState();
        if (manageSync) sync.markCloud('正在上传关卡到云端…', 70);
        try {
            await window.api.db.pushCatalog(catalog);
            if (manageSync) sync.finishOk('关卡已推送到远程');
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (manageSync) sync.finishError(message, '关卡远程推送失败');
            throw new Error(`关卡远程推送失败：${message}`);
        }
    },

    discardChanges: () => {
        const savedCatalog = get().savedCatalog;
        if (!savedCatalog) return;
        applyCatalog(set, savedCatalog, savedCatalog, false);
    },

    resetToDefault: async () => {
        const json = await window.api.catalog.loadDefault();
        const catalog = importLevelsFromJSON(json);
        const savedCatalog = get().savedCatalog ?? get().catalog ?? null;
        applyCatalog(set, catalog, savedCatalog ? cloneCatalog(savedCatalog) : null, true);
    },

    createChapter: (input) => {
        const currentCatalog = get().catalog;
        if (!currentCatalog) throw new Error('关卡目录尚未加载。');
        const nextChapter: LevelChapterConfig = {
            id: createChapterId(currentCatalog.chapters),
            partNumber: currentCatalog.chapters.length + 1,
            partName: input.partName.trim(),
            title: input.title.trim(),
            description: input.description?.trim() || undefined,
            capacity: input.capacity,
        };
        if (!nextChapter.partName || !nextChapter.title || !Number.isInteger(nextChapter.capacity) || nextChapter.capacity < 1) {
            throw new Error('章节短名称、标题和正整数容量都是必填项。');
        }

        const nextCatalog = updateChaptersInMemory(currentCatalog, (chapters) => [...chapters, nextChapter]);
        const savedCatalog = get().savedCatalog ?? currentCatalog;
        applyCatalog(set, nextCatalog, savedCatalog, true);
        return nextCatalog.chapters.find((chapter) => chapter.id === nextChapter.id)!;
    },

    updateChapter: (chapterId, partial) => {
        const currentCatalog = get().catalog;
        if (!currentCatalog) throw new Error('关卡目录尚未加载。');
        const currentChapter = currentCatalog.chapters.find((chapter) => chapter.id === chapterId);
        if (!currentChapter) return null;

        const updatedChapter: LevelChapterConfig = {
            ...currentChapter,
            partName: partial.partName?.trim() ?? currentChapter.partName,
            title: partial.title?.trim() ?? currentChapter.title,
            description: Object.prototype.hasOwnProperty.call(partial, 'description')
                ? (partial.description?.trim() || undefined)
                : currentChapter.description,
            capacity: partial.capacity ?? currentChapter.capacity,
        };
        if (!updatedChapter.partName || !updatedChapter.title || !Number.isInteger(updatedChapter.capacity) || updatedChapter.capacity < 1) {
            throw new Error('章节短名称、标题和正整数容量都是必填项。');
        }

        const nextCatalog = updateChaptersInMemory(currentCatalog, (chapters) =>
            chapters.map((chapter) => (chapter.id === chapterId ? updatedChapter : chapter)));
        const savedCatalog = get().savedCatalog ?? currentCatalog;
        applyCatalog(set, nextCatalog, savedCatalog, true);
        return nextCatalog.chapters.find((chapter) => chapter.id === chapterId) ?? null;
    },

    moveChapter: (chapterId, direction) => {
        const currentCatalog = get().catalog;
        if (!currentCatalog) throw new Error('关卡目录尚未加载。');
        const currentIndex = currentCatalog.chapters.findIndex((chapter) => chapter.id === chapterId);
        const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        if (currentIndex < 0 || targetIndex < 0 || targetIndex >= currentCatalog.chapters.length) return;

        const nextCatalog = updateChaptersInMemory(currentCatalog, (chapters) => {
            const reordered = [...chapters];
            [reordered[currentIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[currentIndex]];
            return reordered;
        });
        const savedCatalog = get().savedCatalog ?? currentCatalog;
        applyCatalog(set, nextCatalog, savedCatalog, true);
    },

    deleteChapter: (chapterId) => {
        const currentCatalog = get().catalog;
        if (!currentCatalog) throw new Error('关卡目录尚未加载。');
        if (currentCatalog.chapters.length <= 1) throw new Error('至少需要保留一个章节。');
        if (currentCatalog.levels.some((level) => level.chapterId === chapterId)) {
            throw new Error('只能删除空章节，请先移动或删除其中的关卡。');
        }
        const nextCatalog = updateChaptersInMemory(currentCatalog, (chapters) =>
            chapters.filter((chapter) => chapter.id !== chapterId));
        const savedCatalog = get().savedCatalog ?? currentCatalog;
        applyCatalog(set, nextCatalog, savedCatalog, true);
    },

    createLevelForChapter: (chapterId, insertOrder) => {
        const currentCatalog = get().catalog;
        if (!currentCatalog) throw new Error('关卡目录尚未加载。');

        const chapterLevels = sortLevelsBySlotOrder(currentCatalog.levels, currentCatalog.chapters)
            .filter((level) => level.chapterId === chapterId);
        const nextOrder = Math.max(1, Math.min(insertOrder ?? chapterLevels.length + 1, chapterLevels.length + 1));

        const nextLevel = buildLevelForChapter(chapterId, nextOrder, currentCatalog.chapters);
        const nextCatalog = updateCatalogInMemory(currentCatalog, (levels) =>
            insertLevelIntoChapter(levels, nextLevel, nextOrder));
        const savedCatalog = get().savedCatalog ?? currentCatalog;
        applyCatalog(set, nextCatalog, savedCatalog, true);
        return nextCatalog.levels.find((level) => level.id === nextLevel.id)!;
    },

    duplicateLevel: (levelId) => {
        const currentCatalog = get().catalog;
        if (!currentCatalog) throw new Error('关卡目录尚未加载。');

        const sourceLevel = currentCatalog.levels.find((level) => level.id === levelId);
        if (!sourceLevel) throw new Error(`找不到要复制的关卡：${levelId}`);

        const draftLevel = buildLevelForChapter(sourceLevel.chapterId, sourceLevel.order + 1, currentCatalog.chapters);
        const duplicatedLevel: LevelDefinition = {
            ...sourceLevel,
            id: draftLevel.id,
            order: sourceLevel.order + 1,
            title: `${sourceLevel.title} 副本`,
            startStateMatrix: sourceLevel.startStateMatrix.map((face) => face.map((row) => [...row])),
            goalStateMatrix: sourceLevel.goalStateMatrix.map((face) => face.map((row) => [...row])),
            goalStateMatrices: sourceLevel.goalStateMatrices
                ? cloneStateMatrices(sourceLevel.goalStateMatrices)
                : undefined,
            brightnessMatrix: sourceLevel.brightnessMatrix.map((face) => face.map((row) => [...row])),
            starThresholds: [...sourceLevel.starThresholds],
        };

        const nextCatalog = updateCatalogInMemory(currentCatalog, (levels) =>
            insertLevelIntoChapter(levels, duplicatedLevel, duplicatedLevel.order));
        const savedCatalog = get().savedCatalog ?? currentCatalog;
        applyCatalog(set, nextCatalog, savedCatalog, true);
        return nextCatalog.levels.find((level) => level.id === duplicatedLevel.id)!;
    },

    updateLevel: (levelId, partial) => {
        const currentCatalog = get().catalog;
        if (!currentCatalog) throw new Error('关卡目录尚未加载。');

        const currentLevel = currentCatalog.levels.find((level) => level.id === levelId);
        if (!currentLevel) return null;

        if (partial.chapterId && partial.chapterId !== currentLevel.chapterId) {
            throw new Error('当前版本不支持在编辑器里修改章节，请回到关卡管理页调整。');
        }
        if (typeof partial.order === 'number' && partial.order !== currentLevel.order) {
            throw new Error('当前版本不支持在编辑器里修改顺序，请回到关卡管理页调整。');
        }

        const nextCatalog = updateCatalogInMemory(currentCatalog, (levels) =>
            levels.map((level) => (
                level.id === levelId
                    ? {
                        ...level,
                        ...partial,
                        id: currentLevel.id,
                        chapterId: currentLevel.chapterId,
                        order: currentLevel.order,
                        hint: Object.prototype.hasOwnProperty.call(partial, 'hint')
                            ? (partial.hint?.trim() || undefined)
                            : level.hint,
                        goalStateMatrices: Object.prototype.hasOwnProperty.call(partial, 'goalStateMatrices')
                            ? partial.goalStateMatrices
                            : level.goalStateMatrices,
                    }
                    : level
            )));
        const savedCatalog = get().savedCatalog ?? currentCatalog;
        applyCatalog(set, nextCatalog, savedCatalog, true);
        return nextCatalog.levels.find((level) => level.id === levelId) ?? null;
    },

    moveLevel: (levelId, direction) => {
        const currentCatalog = get().catalog;
        if (!currentCatalog) throw new Error('关卡目录尚未加载。');
        const nextCatalog = updateCatalogInMemory(currentCatalog, (levels) =>
            moveLevelInCatalogOrder(levels, currentCatalog.chapters, levelId, direction));
        const savedCatalog = get().savedCatalog ?? currentCatalog;
        applyCatalog(set, nextCatalog, savedCatalog, true);
    },

    deleteLevel: (levelId) => {
        const currentCatalog = get().catalog;
        if (!currentCatalog) throw new Error('关卡目录尚未加载。');
        const nextCatalog = updateCatalogInMemory(currentCatalog, (levels) =>
            levels.filter((level) => level.id !== levelId));
        const savedCatalog = get().savedCatalog ?? currentCatalog;
        applyCatalog(set, nextCatalog, savedCatalog, true);
    },

    getLevelById: (levelId) => get().catalog?.levels.find((level) => level.id === levelId),

    applyAiLevelProposals: (chapterId, proposals) => {
        const createdIds: string[] = [];
        for (const proposal of proposals) {
            const created = get().createLevelForChapter(chapterId);
            const maxMoves = proposal.maxMoves;
            const patch: Partial<LevelDefinition> = {
                title: proposal.title,
                description: proposal.description,
                hint: proposal.hint,
                maxMoves,
                starThresholds: getMinimumStarThresholds(maxMoves),
                rotationFormula: proposal.rotationFormula,
                rotationTarget: proposal.rotationTarget,
                guidanceFormula: proposal.guidanceFormula ?? proposal.rotationFormula,
            };
            try {
                const derived = deriveLevelFormulaPreset(proposal.rotationFormula, proposal.rotationTarget);
                patch.startStateMatrix = derived.startStateMatrix;
                patch.goalStateMatrix = derived.goalStateMatrix;
                patch.brightnessMatrix = derived.brightnessMatrix;
            } catch {
                // 公式无效时仍创建关卡元数据，作者可在编辑器修正
            }
            get().updateLevel(created.id, patch);
            createdIds.push(created.id);
        }
        return createdIds;
    },

    applyAiChapterProposals: (proposals) => {
        const chapterIds: string[] = [];
        const levelIds: string[] = [];
        for (const proposal of proposals) {
            const chapter = get().createChapter({
                partName: proposal.partName,
                title: proposal.title,
                description: proposal.description,
                capacity: proposal.capacity,
            });
            chapterIds.push(chapter.id);
            if (proposal.levels && proposal.levels.length > 0) {
                const created = get().applyAiLevelProposals(
                    chapter.id,
                    proposal.levels.slice(0, chapter.capacity),
                );
                levelIds.push(...created);
            }
        }
        return { chapterIds, levelIds };
    },
}));
