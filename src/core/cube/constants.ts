/**
 * 魔方常量定义
 */
import type {
    Move, FlowingLightFace, MatrixIndex,
    ColorMatrix, StateMatrix, LocationMatrix, BrightnessArray, BrightnessMatrix,
} from './types';

// 旋转定义

/** 旋转索引: 0-5=正转(U D F B L R), 6-11=反转(U' D' F' B' L' R') */
export const MOVE_DEFINITIONS: Move[] = [
    // 0-5: 正转 (对应蓝牙协议 case 1-6)
    { axis: 'y', index: 1, dir: -1 },    // 0: U
    { axis: 'y', index: -1, dir: 1 },    // 1: D (反向)
    { axis: 'z', index: 1, dir: -1 },    // 2: F
    { axis: 'z', index: -1, dir: 1 },    // 3: B (反向)
    { axis: 'x', index: -1, dir: 1 },    // 4: L (反向)
    { axis: 'x', index: 1, dir: -1 },    // 5: R
    // 6-11: 反转 (对应蓝牙协议 case 7-12)
    { axis: 'y', index: 1, dir: 1 },     // 6: U'
    { axis: 'y', index: -1, dir: -1 },   // 7: D'
    { axis: 'z', index: 1, dir: 1 },     // 8: F'
    { axis: 'z', index: -1, dir: -1 },   // 9: B'
    { axis: 'x', index: -1, dir: -1 },   // 10: L'
    { axis: 'x', index: 1, dir: 1 },     // 11: R'
];

export const MOVE_INDEX_TO_NOTATION = [
    'U', 'D', 'F', 'B', 'L', 'R',
    "U'", "D'", "F'", "B'", "L'", "R'",
] as const;

/** 记法到索引映射 */
export const NOTATION_TO_INDEX: Record<string, number> = {
    'U': 0, 'D': 1, 'F': 2, 'B': 3, 'L': 4, 'R': 5,
};

// 流水灯

/**
 * 每个面旋转对应的 12 个相邻色块矩阵索引（顺时针顺序）
 * 格式: [face, row, col]
 */
export const FLOWING_LIGHT_MATRIX_INDICES: Record<Exclude<FlowingLightFace, null>, MatrixIndex[]> = {
    U: [
        [2, 0, 0], [2, 0, 1], [2, 0, 2],
        [3, 0, 0], [3, 0, 1], [3, 0, 2],
        [4, 0, 0], [4, 0, 1], [4, 0, 2],
        [1, 0, 0], [1, 0, 1], [1, 0, 2],
    ],
    D: [
        [2, 2, 0], [2, 2, 1], [2, 2, 2],
        [1, 2, 0], [1, 2, 1], [1, 2, 2],
        [4, 2, 0], [4, 2, 1], [4, 2, 2],
        [3, 2, 0], [3, 2, 1], [3, 2, 2],
    ],
    F: [
        [0, 2, 0], [0, 2, 1], [0, 2, 2],
        [3, 0, 0], [3, 1, 0], [3, 2, 0],
        [5, 0, 2], [5, 0, 1], [5, 0, 0],
        [1, 2, 2], [1, 1, 2], [1, 0, 2],
    ],
    B: [
        [0, 0, 2], [0, 0, 1], [0, 0, 0],
        [1, 0, 0], [1, 1, 0], [1, 2, 0],
        [5, 2, 0], [5, 2, 1], [5, 2, 2],
        [3, 2, 2], [3, 1, 2], [3, 0, 2],
    ],
    L: [
        [0, 0, 0], [0, 1, 0], [0, 2, 0],
        [2, 0, 0], [2, 1, 0], [2, 2, 0],
        [5, 0, 0], [5, 1, 0], [5, 2, 0],
        [4, 2, 2], [4, 1, 2], [4, 0, 2],
    ],
    R: [
        [0, 0, 2], [0, 1, 2], [0, 2, 2],
        [4, 2, 0], [4, 1, 0], [4, 0, 0],
        [5, 2, 2], [5, 1, 2], [5, 0, 2],
        [2, 0, 2], [2, 1, 2], [2, 2, 2],
    ],
};

/** 根据矩阵索引从 locationMatrix 获取实际的 Location ID 数组 */
export const getFlowingLightLocationIds = (
    face: Exclude<FlowingLightFace, null>,
    locationMatrix: number[][][]
): number[] => {
    const indices = FLOWING_LIGHT_MATRIX_INDICES[face];
    return indices.map(([f, r, c]) => locationMatrix[f]?.[r]?.[c] ?? 0);
};

/** 面名称到转动索引的映射 (用于检测对应转动) */
export const FACE_TO_MOVE_INDEX: Record<Exclude<FlowingLightFace, null>, number[]> = {
    U: [0, 6],
    D: [1, 7],
    F: [2, 8],
    B: [3, 9],
    L: [4, 10],
    R: [5, 11],
};

// 初始矩阵

/**
 * 颜色索引映射 (0-15):
 * 0=黑, 1=红, 2=橙, 3=黄, 4=黄绿, 5=绿,
 * 6=青绿, 7=青, 8=天蓝, 9=蓝, 10=紫, 11=紫红,
 * 12=品红, 13=粉, 14=浅蓝, 15=白
 */
export const INITIAL_COLOR_MATRIX: ColorMatrix = [
    [[15, 15, 15], [15, 15, 15], [15, 15, 15]],
    [[2, 2, 2], [2, 2, 2], [2, 2, 2]],
    [[5, 5, 5], [5, 5, 5], [5, 5, 5]],
    [[1, 1, 1], [1, 1, 1], [1, 1, 1]],
    [[9, 9, 9], [9, 9, 9], [9, 9, 9]],
    [[3, 3, 3], [3, 3, 3], [3, 3, 3]],
];

/** 初始状态矩阵，初始时与位置矩阵一致 */
export const INITIAL_STATE_MATRIX: StateMatrix = [
    [[3, 28, 6], [26, 48, 30], [0, 24, 9]],
    [[4, 27, 2], [42, 49, 41], [17, 39, 13]],
    [[1, 25, 11], [40, 50, 47], [14, 33, 22]],
    [[10, 31, 8], [46, 51, 45], [23, 35, 19]],
    [[7, 29, 5], [44, 52, 43], [20, 37, 16]],
    [[12, 32, 21], [38, 53, 34], [15, 36, 18]],
];

/** 初始位置矩阵，仅用于蓝牙通信 */
export const INITIAL_LOCATION_MATRIX: LocationMatrix = [
    [[3, 28, 6], [26, 48, 30], [0, 24, 9]],
    [[4, 27, 2], [42, 49, 41], [17, 39, 13]],
    [[1, 25, 11], [40, 50, 47], [14, 33, 22]],
    [[10, 31, 8], [46, 51, 45], [23, 35, 19]],
    [[7, 29, 5], [44, 52, 43], [20, 37, 16]],
    [[12, 32, 21], [38, 53, 34], [15, 36, 18]],
];

/**
 * 初始亮度数组
 * 范围: 0-10，对应 LED 亮度级别（0=关，10=最亮）
 * 默认值: 8 (亮度 0.8)
 */
export const INITIAL_BRIGHTNESS_ARRAY: BrightnessArray = Array(54).fill(8);

/**
 * 初始亮度矩阵 (6×3×3)
 * 与 ColorMatrix 算法一致：按 home position 索引
 * 范围: 0-10，默认值: 8
 */
export const INITIAL_BRIGHTNESS_MATRIX: BrightnessMatrix =
    Array.from({ length: 6 }, () => Array.from({ length: 3 }, () => Array(3).fill(8)));
