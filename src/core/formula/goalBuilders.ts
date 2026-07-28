import { INITIAL_STATE_MATRIX, type BrightnessMatrix, type StateMatrix } from '../cube';

const cloneState = (matrix: StateMatrix): StateMatrix =>
    matrix.map((face) => face.map((row) => [...row]));

export const buildF2LGoalStateMatrix = (): StateMatrix => cloneState(INITIAL_STATE_MATRIX);

export const buildF2LBrightnessMatrix = (): BrightnessMatrix =>
    Array.from({ length: 6 }, (_, face) =>
        Array.from({ length: 3 }, (_, row) =>
            Array.from({ length: 3 }, (_, col) => {
                if (face === 0) return row === 1 && col === 1 ? 8 : 0;
                if (face === 5) return 8;
                return row === 0 ? 0 : 8;
            }),
        ),
    ) as BrightnessMatrix;

export const buildOLLGoalStateMatrix = (): StateMatrix => cloneState(INITIAL_STATE_MATRIX);

/**
 * OLL：U 面全亮 + D 面全亮 + 4 个侧面（F/B/L/R）的顶行（row=0）共 12 块熄灭，
 * 其余两行亮。表达「下两层已完成、顶层贴色未归位、关注 U 面朝向」的语义。
 */
export const buildOLLBrightnessMatrix = (): BrightnessMatrix =>
    Array.from({ length: 6 }, (_, face) =>
        Array.from({ length: 3 }, (_, row) =>
            Array.from({ length: 3 }, () => {
                if (face === 0 || face === 5) return 8;
                return row === 0 ? 0 : 8;
            }),
        ),
    ) as BrightnessMatrix;

export const buildPLLGoalStateMatrix = (): StateMatrix => cloneState(INITIAL_STATE_MATRIX);

/** PLL：OLL 已完成，所有 sticker 颜色都正确，只是位置错——六面全亮。 */
export const buildPLLBrightnessMatrix = (): BrightnessMatrix =>
    Array.from({ length: 6 }, () =>
        Array.from({ length: 3 }, () =>
            Array.from({ length: 3 }, () => 8),
        ),
    ) as BrightnessMatrix;
