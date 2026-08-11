/**
 * 关卡编辑器专用：按 runtime 握持朝向计算 F2L / OLL / PLL 熄灭区；
 * 改朝向时只按握持格子搬 brightness，不改写 state（对齐 App LED：颜色由配色漆面）。
 */
import { findInitialPositionByStateId } from '../cube/colorUtils';
import { INITIAL_COLOR_MATRIX } from '../cube/constants';
import type { BrightnessMatrix, ColorMatrix, StateMatrix } from '../cube/types';
import { resolveOrientationRecord } from '../formula/orientation';
import {
    DEV_CUSTOM_COLOR_VALUES,
    type DevCustomColor,
    type DevCustomOrientation,
} from '../formula/types';

type GripFaceName = 'U' | 'L' | 'F' | 'R' | 'B' | 'D';
const GRIP_FACE_NAMES: GripFaceName[] = ['U', 'L', 'F', 'R', 'B', 'D'];

type Vec3 = readonly [number, number, number];

const COLOR_TO_VECTOR: Record<DevCustomColor, Vec3> = {
    [DEV_CUSTOM_COLOR_VALUES.white]: [0, 1, 0],
    [DEV_CUSTOM_COLOR_VALUES.yellow]: [0, -1, 0],
    [DEV_CUSTOM_COLOR_VALUES.green]: [0, 0, 1],
    [DEV_CUSTOM_COLOR_VALUES.blue]: [0, 0, -1],
    [DEV_CUSTOM_COLOR_VALUES.red]: [1, 0, 0],
    [DEV_CUSTOM_COLOR_VALUES.orange]: [-1, 0, 0],
};

const COLOR_TO_PHYSICAL_FACE: Record<DevCustomColor, number> = {
    [DEV_CUSTOM_COLOR_VALUES.white]: 0,
    [DEV_CUSTOM_COLOR_VALUES.orange]: 1,
    [DEV_CUSTOM_COLOR_VALUES.green]: 2,
    [DEV_CUSTOM_COLOR_VALUES.red]: 3,
    [DEV_CUSTOM_COLOR_VALUES.blue]: 4,
    [DEV_CUSTOM_COLOR_VALUES.yellow]: 5,
};

const OPPOSITE_COLOR: Record<DevCustomColor, DevCustomColor> = {
    [DEV_CUSTOM_COLOR_VALUES.white]: DEV_CUSTOM_COLOR_VALUES.yellow,
    [DEV_CUSTOM_COLOR_VALUES.yellow]: DEV_CUSTOM_COLOR_VALUES.white,
    [DEV_CUSTOM_COLOR_VALUES.red]: DEV_CUSTOM_COLOR_VALUES.orange,
    [DEV_CUSTOM_COLOR_VALUES.orange]: DEV_CUSTOM_COLOR_VALUES.red,
    [DEV_CUSTOM_COLOR_VALUES.blue]: DEV_CUSTOM_COLOR_VALUES.green,
    [DEV_CUSTOM_COLOR_VALUES.green]: DEV_CUSTOM_COLOR_VALUES.blue,
};

const positionToGrid = (face: number, row: number, col: number): Vec3 => {
    switch (face) {
        case 0: return [col - 1, 1, row - 1];
        case 1: return [-1, 1 - row, col - 1];
        case 2: return [col - 1, 1 - row, 1];
        case 3: return [1, 1 - row, 1 - col];
        case 4: return [1 - col, 1 - row, -1];
        case 5: return [col - 1, -1, 1 - row];
        default: throw new Error(`Invalid physical face index: ${face}`);
    }
};

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const makeFullBrightMatrix = (value: number): BrightnessMatrix =>
    Array.from({ length: 6 }, () =>
        Array.from({ length: 3 }, () => Array(3).fill(value)),
    ) as BrightnessMatrix;

function getOppositeColor(color: DevCustomColor): DevCustomColor {
    const opposite = OPPOSITE_COLOR[color];
    if (opposite === undefined) {
        throw new Error(`No opposite color defined for: ${color}`);
    }
    return opposite;
}

export const getPhysicalFaceForColor = (color: DevCustomColor): number => {
    const face = COLOR_TO_PHYSICAL_FACE[color];
    if (face === undefined) {
        throw new Error(`Unknown DevCustomColor: ${color}`);
    }
    return face;
};

const gripFaceToPhysicalIndex = (
    gripFace: GripFaceName,
    orientation: DevCustomOrientation,
): number => {
    const { faceToColor } = resolveOrientationRecord(orientation);
    return getPhysicalFaceForColor(faceToColor[gripFace]);
};

/**
 * 仿 App LED：按物理面索引漆朝向色（顶色面整面为顶色）。
 * 预览需配合按当前 state 格子取色，而非贴纸 home 查色。
 */
export const buildPhysicalOrientationColorMatrix = (
    orientation: DevCustomOrientation,
): ColorMatrix => {
    const { faceToColor } = resolveOrientationRecord(orientation);
    const matrix = Array.from({ length: 6 }, () =>
        Array.from({ length: 3 }, () => Array(3).fill(0)),
    ) as ColorMatrix;
    for (const gripFace of GRIP_FACE_NAMES) {
        const phys = gripFaceToPhysicalIndex(gripFace, orientation);
        const color = faceToColor[gripFace];
        for (let row = 0; row < 3; row += 1) {
            for (let col = 0; col < 3; col += 1) {
                matrix[phys][row][col] = color;
            }
        }
    }
    return matrix;
};

/**
 * 只读 state：把旧握持物理面格子上贴纸的亮度，搬到新握持同格当前贴纸的 home 槽。
 * 不改写 state（打乱位置保持）。
 */
export const remapBrightnessByGripSlots = (
    state: StateMatrix,
    brightness: BrightnessMatrix,
    fromOrientation: DevCustomOrientation,
    toOrientation: DevCustomOrientation,
): BrightnessMatrix => {
    const nextBright = makeFullBrightMatrix(0);

    for (const gripFace of GRIP_FACE_NAMES) {
        const physOld = gripFaceToPhysicalIndex(gripFace, fromOrientation);
        const physNew = gripFaceToPhysicalIndex(gripFace, toOrientation);
        for (let row = 0; row < 3; row += 1) {
            for (let col = 0; col < 3; col += 1) {
                const oldHome = findInitialPositionByStateId(state[physOld][row][col]);
                const newHome = findInitialPositionByStateId(state[physNew][row][col]);
                if (!oldHome || !newHome) continue;
                nextBright[newHome.face][newHome.row][newHome.col] =
                    brightness[oldHome.face][oldHome.row][oldHome.col] ?? 0;
            }
        }
    }

    return nextBright;
};

export const buildF2LBrightnessMatrixForOrientation = (
    orientation: DevCustomOrientation,
): BrightnessMatrix => {
    const uVec = COLOR_TO_VECTOR[orientation.topColor];
    const runtimeUFace = getPhysicalFaceForColor(orientation.topColor);
    const brightness = makeFullBrightMatrix(8);

    for (let face = 0; face < 6; face += 1) {
        for (let row = 0; row < 3; row += 1) {
            for (let col = 0; col < 3; col += 1) {
                const grid = positionToGrid(face, row, col);
                if (dot(grid, uVec) === 1) {
                    brightness[face][row][col] = 0;
                }
            }
        }
    }

    brightness[runtimeUFace][1][1] = 8;
    return brightness;
};

export const buildOLLBrightnessMatrixForOrientation = (
    orientation: DevCustomOrientation,
): BrightnessMatrix => {
    const uVec = COLOR_TO_VECTOR[orientation.topColor];
    const runtimeUFace = getPhysicalFaceForColor(orientation.topColor);
    const oppositeColor = getOppositeColor(orientation.topColor);
    const runtimeDFace = getPhysicalFaceForColor(oppositeColor);
    const brightness = makeFullBrightMatrix(8);

    for (let face = 0; face < 6; face += 1) {
        if (face === runtimeUFace || face === runtimeDFace) continue;

        for (let row = 0; row < 3; row += 1) {
            for (let col = 0; col < 3; col += 1) {
                const grid = positionToGrid(face, row, col);
                if (dot(grid, uVec) === 1) {
                    brightness[face][row][col] = 0;
                }
            }
        }
    }

    return brightness;
};

export const buildPLLBrightnessMatrixForOrientation = (
    _orientation: DevCustomOrientation,
): BrightnessMatrix => makeFullBrightMatrix(8);

export const assertColorMatrixConsistency = (): void => {
    for (let face = 0; face < 6; face += 1) {
        const color = INITIAL_COLOR_MATRIX[face][0][0] as DevCustomColor;
        if (COLOR_TO_PHYSICAL_FACE[color] !== face) {
            throw new Error(
                `INITIAL_COLOR_MATRIX face ${face} color=${color} but COLOR_TO_PHYSICAL_FACE maps it to ${COLOR_TO_PHYSICAL_FACE[color]}`,
            );
        }
    }
};
