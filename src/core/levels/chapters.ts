import type { LevelChapterConfig } from './types';

export type { LevelChapterConfig } from './types';

export type LevelSlotConfig = {
    slotId: string;
    chapterId: string;
    partNumber: number;
    partName: string;
    chapterTitle: string;
    slotIndex: number;
    absoluteIndex: number;
};

export const LEVEL_LAYOUT_CHAPTERS: LevelChapterConfig[] = [
    {
        id: 'part1',
        partNumber: 1,
        partName: 'Part1',
        title: 'Sandwich Pattern',
        description: 'Build basic turn control and learn how target stickers are recognized.',
        capacity: 7,
    },
    {
        id: 'part2',
        partNumber: 2,
        partName: 'Part2',
        title: 'Edge Control',
        description: 'Recognize edge pieces, match their colors, and control their orientation.',
        capacity: 6,
    },
    {
        id: 'part3',
        partNumber: 3,
        partName: 'Part3',
        title: 'Corner Mastery',
        description: 'Locate corner pieces and place them without breaking completed structures.',
        capacity: 6,
    },
    {
        id: 'part4',
        partNumber: 4,
        partName: 'Part4',
        title: 'Advanced Moves',
        description: 'Combine short formulas and transitions to solve more complex targets.',
        capacity: 6,
    },
    {
        id: 'part5',
        partNumber: 5,
        partName: 'Part5',
        title: 'Speed Techniques',
        description: 'Reduce pauses, improve move flow, and complete targets efficiently.',
        capacity: 6,
    },
    {
        id: 'part6',
        partNumber: 6,
        partName: 'Part6',
        title: 'Final Challenge',
        description: 'Bring every learned skill together in the final hardware cube challenge.',
        capacity: 1,
    },
];

export const buildLevelSlotConfigs = (chapters: LevelChapterConfig[]): LevelSlotConfig[] =>
    chapters.flatMap(
        (chapter, chapterIndex) => Array.from({ length: chapter.capacity }, (_, slotIndex) => ({
            slotId: `${chapter.id}-${String(slotIndex + 1).padStart(2, '0')}`,
            chapterId: chapter.id,
            partNumber: chapter.partNumber,
            partName: chapter.partName,
            chapterTitle: chapter.title,
            slotIndex: slotIndex + 1,
            absoluteIndex:
                chapters.slice(0, chapterIndex).reduce(
                    (total, currentChapter) => total + currentChapter.capacity,
                    0,
                ) + slotIndex,
        })),
    );

export const LEVEL_SLOT_CONFIGS: LevelSlotConfig[] = buildLevelSlotConfigs(LEVEL_LAYOUT_CHAPTERS);

export const LEVEL_SLOT_IDS = LEVEL_SLOT_CONFIGS.map((slot) => slot.slotId);
export const LEVEL_SLOT_ID_SET = new Set(LEVEL_SLOT_IDS);
export const LEVEL_SLOT_CONFIG_BY_ID = new Map(
    LEVEL_SLOT_CONFIGS.map((slot) => [slot.slotId, slot] as const),
);
export const LEVEL_CHAPTER_BY_ID = new Map(
    LEVEL_LAYOUT_CHAPTERS.map((chapter) => [chapter.id, chapter] as const),
);
export const LEVEL_SLOT_INDEX_BY_ID = new Map(
    LEVEL_SLOT_CONFIGS.map((slot, index) => [slot.slotId, index] as const),
);

export const getLevelSlotConfig = (slotId: string): LevelSlotConfig | undefined =>
    LEVEL_SLOT_CONFIG_BY_ID.get(slotId);

export const getLevelChapterConfig = (
    chapterId: string,
    chapters: LevelChapterConfig[] = LEVEL_LAYOUT_CHAPTERS,
): LevelChapterConfig | undefined => chapters.find((chapter) => chapter.id === chapterId);

export const getSlotAbsoluteOrder = (slotId: string): number =>
    LEVEL_SLOT_INDEX_BY_ID.get(slotId) ?? Number.MAX_SAFE_INTEGER;

export const getChapterSlots = (chapterId: string): LevelSlotConfig[] =>
    LEVEL_SLOT_CONFIGS.filter((slot) => slot.chapterId === chapterId);

export const formatChapterLevelOrder = (
    chapterId: string,
    levelOrder: number,
    chapters: LevelChapterConfig[] = LEVEL_LAYOUT_CHAPTERS,
): string => {
    const chapter = getLevelChapterConfig(chapterId, chapters);
    if (!chapter) {
        return String(levelOrder);
    }
    return `${chapter.partNumber}-${levelOrder}`;
};
