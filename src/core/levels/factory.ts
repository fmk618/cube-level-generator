import { INITIAL_STATE_MATRIX, type BrightnessMatrix, type StateMatrix } from '../cube';
import { getLevelChapterConfig } from './chapters';
import { formulaToStateMatrix, getMinimumStarThresholds } from './utils';
import type { LevelChapterConfig, LevelChapterId, LevelDefinition, LevelId } from './types';

const cloneStateMatrix = (matrix: StateMatrix): StateMatrix =>
    matrix.map((face) => face.map((row) => [...row]));

const createFullBrightnessMatrix = (): BrightnessMatrix =>
    Array.from({ length: 6 }, () => Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => 8)));

const createLevelId = (chapterId: LevelChapterId): LevelId => {
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    return `lvl-${chapterId}-${Date.now().toString(36)}-${randomSuffix}`;
};

export const buildLevelForChapter = (
    chapterId: LevelChapterId,
    order = 1,
    chapters: LevelChapterConfig[],
): LevelDefinition => {
    if (!getLevelChapterConfig(chapterId, chapters)) {
        throw new Error(`Invalid chapter: ${chapterId}`);
    }

    return {
        id: createLevelId(chapterId),
        chapterId,
        order,
        title: 'New level',
        description: 'Edit the goal and hint for this level.',
        startStateMatrix: cloneStateMatrix(INITIAL_STATE_MATRIX),
        goalStateMatrix: formulaToStateMatrix(''),
        brightnessMatrix: createFullBrightnessMatrix(),
        maxMoves: 8,
        starThresholds: getMinimumStarThresholds(8),
        hint: 'Set the initial and goal states in the editor.',
        guidanceFailureThreshold: 3,
    };
};
