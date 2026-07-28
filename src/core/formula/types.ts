import type { BrightnessMatrix, ColorMatrix, StateMatrix } from '../cube/types';

export const DEV_CUSTOM_COLOR_VALUES = {
    red: 1,
    orange: 2,
    yellow: 3,
    green: 5,
    blue: 9,
    white: 15,
} as const;

export type DevCustomColor = typeof DEV_CUSTOM_COLOR_VALUES[keyof typeof DEV_CUSTOM_COLOR_VALUES];

export type DevCustomOrientation = {
    topColor: DevCustomColor;
    frontColor: DevCustomColor;
};

export type DevCustomOrientationRecord = {
    topColor: DevCustomColor;
    frontColor: DevCustomColor;
    faceToColor: Record<'U' | 'D' | 'F' | 'B' | 'L' | 'R', DevCustomColor>;
    colorToFace: Record<DevCustomColor, 'U' | 'D' | 'F' | 'B' | 'L' | 'R'>;
};

export type DevCustomRuntimeCase = {
    officialTokens: string[];
    officialDisplayTokens: string[];
    mappedTokens: string[];
    mappedSourceIndices?: number[];
    mappedFormula: string;
    goalStateMatrix: StateMatrix;
    startStateMatrix: StateMatrix;
    brightnessMatrix: BrightnessMatrix;
    colorMatrix: ColorMatrix;
    maxMoves: number;
};
