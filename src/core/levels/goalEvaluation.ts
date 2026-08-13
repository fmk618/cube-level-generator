import {
    findBrightnessByStateId,
    findColorByStateId,
    type BrightnessMatrix,
    type ColorMatrix,
    type StateMatrix,
} from '../cube';

export const isLevelGoalReached = (
    currentState: StateMatrix,
    goalState: StateMatrix,
    brightnessMatrix: BrightnessMatrix,
    colorMatrix: ColorMatrix,
): boolean => {
    for (let face = 0; face < 6; face += 1) {
        for (let row = 0; row < 3; row += 1) {
            for (let col = 0; col < 3; col += 1) {
                const currentStickerId = currentState[face][row][col];
                const goalStickerId = goalState[face][row][col];
                const currentIsTarget = findBrightnessByStateId(currentStickerId, brightnessMatrix) > 0;
                const goalIsTarget = findBrightnessByStateId(goalStickerId, brightnessMatrix) > 0;

                // 与 App 正式 Game 保持一致：比较玩家实际看到的完整灯光图案。
                // 亮暗布局不同直接失败；双方都熄灭时忽略；双方都点亮时比较颜色。
                if (currentIsTarget !== goalIsTarget) return false;
                if (!goalIsTarget) continue;
                if (
                    findColorByStateId(currentStickerId, colorMatrix)
                    !== findColorByStateId(goalStickerId, colorMatrix)
                ) return false;
            }
        }
    }
    return true;
};

/** 旧关卡推荐解法兼容校验：仅验证目标点颜色。 */
export const isFormulaLevelGoalReached = (
    currentState: StateMatrix,
    goalState: StateMatrix,
    brightnessMatrix: BrightnessMatrix,
    colorMatrix: ColorMatrix,
): boolean => {
    for (let face = 0; face < 6; face += 1) {
        for (let row = 0; row < 3; row += 1) {
            for (let col = 0; col < 3; col += 1) {
                const goalStickerId = goalState[face][row][col];
                if (findBrightnessByStateId(goalStickerId, brightnessMatrix) <= 0) continue;
                const currentStickerId = currentState[face][row][col];
                if (
                    findColorByStateId(currentStickerId, colorMatrix)
                    !== findColorByStateId(goalStickerId, colorMatrix)
                ) return false;
            }
        }
    }
    return true;
};
