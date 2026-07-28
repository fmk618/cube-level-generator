import type { LevelChapterConfig, LevelDefinition, LevelId } from './types';
import {
    buildLevelSlotConfigs,
    LEVEL_LAYOUT_CHAPTERS,
    type LevelSlotConfig,
} from './chapters';
import { sortLevelsBySlotOrder } from './utils';

export type LevelAccess = {
    isCompleted: boolean;
    isUnlocked: boolean;
    isCurrent: boolean;
    isEmpty: boolean;
};

export type LevelGroupSlot = LevelSlotConfig & {
    displayOrder: number;
    chapterOrder: number;
    level: LevelDefinition | null;
    access: LevelAccess;
};

export type HiddenLevelGroupItem = {
    level: LevelDefinition;
    chapterOrder: number;
    hiddenIndex: number;
    access: LevelAccess;
};

export type LevelGroup = LevelChapterConfig & {
    kind: 'mapped';
    slots: LevelGroupSlot[];
    hiddenLevels: HiddenLevelGroupItem[];
};

const normalizeCompletedLevels = (completedLevels: string[]): string[] => (
    [...new Set(
        completedLevels.filter((levelId) => typeof levelId === 'string' && levelId.trim().length > 0),
    )].sort((a, b) => a.localeCompare(b))
);

export function getConfiguredLevelsInSlotOrder(
    levels: LevelDefinition[],
    chapters: LevelChapterConfig[] = LEVEL_LAYOUT_CHAPTERS,
): LevelDefinition[] {
    const levelsByChapterId = new Map<string, LevelDefinition[]>();
    for (const level of sortLevelsBySlotOrder(levels, chapters)) {
        const chapterLevels = levelsByChapterId.get(level.chapterId) ?? [];
        chapterLevels.push(level);
        levelsByChapterId.set(level.chapterId, chapterLevels);
    }

    return chapters.flatMap((chapter) => levelsByChapterId.get(chapter.id) ?? []);
}

export function buildLevelAccessMap(
    levels: LevelDefinition[],
    completedLevels: string[],
    options?: {
        unlockAll?: boolean;
        chapters?: LevelChapterConfig[];
    },
): Map<LevelId, LevelAccess> {
    const orderedLevels = getConfiguredLevelsInSlotOrder(levels, options?.chapters);
    const completedSet = new Set(normalizeCompletedLevels(completedLevels));
    const accessMap = new Map<LevelId, LevelAccess>();
    const unlockAll = options?.unlockAll ?? false;
    let allPreviousPassed = true;

    orderedLevels.forEach((level, index) => {
        const isCompleted = completedSet.has(level.id);
        const isUnlocked = unlockAll || index === 0 || allPreviousPassed || isCompleted;
        accessMap.set(level.id, {
            isCompleted,
            isUnlocked,
            isCurrent: isUnlocked && !isCompleted,
            isEmpty: false,
        });
        allPreviousPassed = allPreviousPassed && isCompleted;
    });

    return accessMap;
}

export function buildLevelGroups(
    levels: LevelDefinition[],
    completedLevels: string[],
    options?: {
        unlockAll?: boolean;
        chapters?: LevelChapterConfig[];
    },
): LevelGroup[] {
    const chapters = options?.chapters ?? LEVEL_LAYOUT_CHAPTERS;
    const accessMap = buildLevelAccessMap(levels, completedLevels, options);
    const levelsByChapterId = new Map<string, LevelDefinition[]>();

    for (const level of sortLevelsBySlotOrder(levels, chapters)) {
        const chapterLevels = levelsByChapterId.get(level.chapterId) ?? [];
        chapterLevels.push(level);
        levelsByChapterId.set(level.chapterId, chapterLevels);
    }

    const slots = buildLevelSlotConfigs(chapters);
    return chapters.map((chapter) => {
        const chapterLevels = levelsByChapterId.get(chapter.id) ?? [];
        const visibleLevels = chapterLevels.slice(0, chapter.capacity);
        const hiddenLevels = chapterLevels.slice(chapter.capacity);

        return {
            ...chapter,
            kind: 'mapped' as const,
            slots: slots
                .filter((slot) => slot.chapterId === chapter.id)
                .map((slot, index) => {
                    const level = visibleLevels[index] ?? null;
                    const access = level
                        ? accessMap.get(level.id) ?? {
                            isCompleted: false,
                            isUnlocked: false,
                            isCurrent: false,
                            isEmpty: false,
                        }
                        : {
                            isCompleted: false,
                            isUnlocked: false,
                            isCurrent: false,
                            isEmpty: true,
                        };

                    return {
                        ...slot,
                        displayOrder: slot.absoluteIndex + 1,
                        chapterOrder: index + 1,
                        level,
                        access,
                    };
                }),
            hiddenLevels: hiddenLevels.map((level, index) => ({
                level,
                chapterOrder: level.order,
                hiddenIndex: index + 1,
                access: accessMap.get(level.id) ?? {
                    isCompleted: completedLevels.includes(level.id),
                    isUnlocked: options?.unlockAll ?? false,
                    isCurrent: false,
                    isEmpty: false,
                },
            })),
        };
    });
}
