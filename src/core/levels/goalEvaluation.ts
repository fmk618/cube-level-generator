import {
    findBrightnessByStateId,
    type BrightnessMatrix,
    type ColorMatrix,
    type StateMatrix,
} from '../cube';

export const isLevelGoalReached = (
    currentState: StateMatrix,
    goalState: StateMatrix,
    brightnessMatrix: BrightnessMatrix,
    _colorMatrix: ColorMatrix,
): boolean => {
    for (let face = 0; face < 6; face += 1) {
        for (let row = 0; row < 3; row += 1) {
            for (let col = 0; col < 3; col += 1) {
                const currentStickerId = currentState[face][row][col];
                const goalStickerId = goalState[face][row][col];
                const currentIsTarget = findBrightnessByStateId(currentStickerId, brightnessMatrix) > 0;
                const goalIsTarget = findBrightnessByStateId(goalStickerId, brightnessMatrix) > 0;

                // 目标贴纸不能只比较颜色：同色贴纸交换位置时颜色仍相同，
                // 但目标区域的实际位置已经错误。目标区域内外只要有目标
                // 贴纸发生位移，就不能判定完成。
                if ((currentIsTarget || goalIsTarget) && currentStickerId !== goalStickerId) {
                    return false;
                }
            }
        }
    }
    return true;
};
