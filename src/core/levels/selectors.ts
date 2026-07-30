import type { LevelChapterConfig, LevelDefinition } from './types';
import { LEVEL_LAYOUT_CHAPTERS } from './chapters';
import {
    buildLevelGroups,
    getConfiguredLevelsInSlotOrder,
} from './levelGroups';

export type LevelManagerFilter = 'all' | 'completed' | 'hidden';

export type LevelManagerItem = {
    key: string;
    kind: 'visible' | 'hidden';
    chapterId: string;
    chapterLabel: string;
    chapterOrder: number;
    orderLabel: string;
    level: LevelDefinition | null;
    isCompleted: boolean;
    isUnlocked: boolean;
    isHidden: boolean;
    hiddenIndex: number | null;
    canMoveUp: boolean;
    canMoveDown: boolean;
};

export type LevelManagerSection = {
    chapterId: string;
    chapterLabel: string;
    partNumber: number;
    partName: string;
    capacity: number;
    configuredCount: number;
    hiddenCount: number;
    canMoveUp: boolean;
    canMoveDown: boolean;
    items: LevelManagerItem[];
};

export type LevelManagerViewModel = {
    summary: {
        configuredCount: number;
        completedCount: number;
        hiddenCount: number;
    };
    sections: LevelManagerSection[];
    filteredCount: number;
};

const normalizeSearchValue = (value: string): string => (
    value
        .normalize('NFKC')
        .toLocaleLowerCase()
        .replace(/[\s_-]+/g, '')
);

const isSubsequence = (query: string, candidate: string): boolean => {
    let queryIndex = 0;
    for (const character of candidate) {
        if (character === query[queryIndex]) queryIndex += 1;
        if (queryIndex === query.length) return true;
    }
    return false;
};

const matchesFuzzySearch = (searchableText: string, searchTerm: string): boolean => {
    const normalizedCandidate = normalizeSearchValue(searchableText);
    const terms = searchTerm.trim().split(/\s+/).map(normalizeSearchValue).filter(Boolean);
    return terms.every((term) => (
        normalizedCandidate.includes(term)
        || (term.length >= 2 && isSubsequence(term, normalizedCandidate))
    ));
};

export function buildLevelManagerViewModel(
    levels: LevelDefinition[],
    completedLevelIds: string[],
    options: {
        searchTerm: string;
        filter: LevelManagerFilter;
        debugEnabled?: boolean;
        chapters?: LevelChapterConfig[];
    },
): LevelManagerViewModel {
    const groups = buildLevelGroups(levels, completedLevelIds, {
        unlockAll: options.debugEnabled ?? true,
        chapters: options.chapters,
    });
    const hasSearchTerm = options.searchTerm.trim().length > 0;
    const orderedLevels = getConfiguredLevelsInSlotOrder(levels, options.chapters);
    const globalIndexByLevelId = new Map(
        orderedLevels.map((level, index) => [level.id, index] as const),
    );

    const allSections = groups.map<LevelManagerSection>((group, groupIndex) => {
        const chapterLevels = [...group.slots.flatMap((slot) => (slot.level ? [slot.level] : [])), ...group.hiddenLevels.map((item) => item.level)]
            .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

        const configuredCount = chapterLevels.length;
        const hiddenCount = chapterLevels.filter((level) => level.hidden).length;
        const items: LevelManagerItem[] = [
            ...group.slots.flatMap((slot) => (
                !slot.level
                    ? []
                    : [{
                        key: `${slot.level.hidden ? 'hidden' : 'visible'}:${slot.slotId}`,
                        kind: slot.level.hidden ? 'hidden' as const : 'visible' as const,
                        chapterId: slot.chapterId,
                        chapterLabel: group.title,
                        chapterOrder: slot.chapterOrder,
                        orderLabel: `${group.partNumber}-${slot.chapterOrder}`,
                        level: slot.level,
                        isCompleted: slot.access.isCompleted,
                        isUnlocked: slot.access.isUnlocked,
                        isHidden: slot.level.hidden === true,
                        hiddenIndex: null,
                        canMoveUp: (globalIndexByLevelId.get(slot.level.id) ?? 0) > 0,
                        canMoveDown: (globalIndexByLevelId.get(slot.level.id) ?? orderedLevels.length - 1) < orderedLevels.length - 1,
                    }]
            )),
            ...group.hiddenLevels.map((hiddenLevel) => ({
                key: `${hiddenLevel.level.hidden ? 'hidden' : 'visible'}:${hiddenLevel.level.id}`,
                kind: hiddenLevel.level.hidden ? 'hidden' as const : 'visible' as const,
                chapterId: group.id,
                chapterLabel: group.title,
                chapterOrder: hiddenLevel.level.order,
                orderLabel: `${group.partNumber}-${hiddenLevel.level.order}`,
                level: hiddenLevel.level,
                isCompleted: hiddenLevel.access.isCompleted,
                isUnlocked: hiddenLevel.access.isUnlocked,
                isHidden: hiddenLevel.level.hidden === true,
                hiddenIndex: hiddenLevel.hiddenIndex,
                canMoveUp: (globalIndexByLevelId.get(hiddenLevel.level.id) ?? 0) > 0,
                canMoveDown: (globalIndexByLevelId.get(hiddenLevel.level.id) ?? orderedLevels.length - 1) < orderedLevels.length - 1,
            })),
        ];

        return {
            chapterId: group.id,
            chapterLabel: group.title,
            partNumber: group.partNumber,
            partName: group.partName,
            capacity: group.capacity,
            configuredCount,
            hiddenCount,
            canMoveUp: groupIndex > 0,
            canMoveDown: groupIndex < groups.length - 1,
            items,
        };
    });

    const filteredSections = allSections
        .map((section) => {
            const filteredItems = section.items.filter((item) => {
                if (options.filter === 'completed' && !item.isCompleted) return false;
                if (options.filter === 'hidden' && !item.isHidden) return false;

                if (!hasSearchTerm) return true;

                const searchableText = [
                    item.chapterLabel,
                    section.partName,
                    item.chapterOrder,
                    item.level?.id ?? '',
                    item.level?.title ?? '',
                    item.isHidden ? 'hidden level' : '',
                ].join(' ');
                return matchesFuzzySearch(searchableText, options.searchTerm);
            });

            return {
                ...section,
                items: filteredItems,
            };
        })
        .filter((section) => (
            section.items.length > 0
            || (!hasSearchTerm && options.filter === 'all')
        ));

    return {
        summary: {
            configuredCount: levels.length,
            completedCount: levels.filter((level) => completedLevelIds.includes(level.id)).length,
            hiddenCount: levels.filter((level) => level.hidden).length,
        },
        sections: filteredSections,
        filteredCount: filteredSections.reduce((total, section) => total + section.items.length, 0),
    };
}

export { LEVEL_LAYOUT_CHAPTERS };
