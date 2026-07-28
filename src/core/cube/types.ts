/**
 * 魔方核心类型定义
 *
 * 坐标系: X(左→右), Y(下→上), Z(后→前)
 * 面编号: 0=Up, 1=Left, 2=Front, 3=Right, 4=Back, 5=Down
 */

export type Axis = 'x' | 'y' | 'z';
export type TurnDir = 1 | -1; // +90 or -90
export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number]; // [x,y,z,w]

/** ColorMatrix: 颜色配置 (6×3×3), 值 0-15, 不随旋转变化 */
export type ColorMatrix = number[][][];

/** StateMatrix: 视觉状态 (6×3×3), 值 0-53, 旋转时更新 */
export type StateMatrix = number[][][];

/** LocationMatrix: 物理位置 (6×3×3), 值 0-53, 仅用于蓝牙通信 */
export type LocationMatrix = number[][][];

/** BrightnessMatrix: LED 亮度 (6×3×3), 值 0-10, 按 home position 索引（与 ColorMatrix 一致） */
export type BrightnessMatrix = number[][][];

/** BrightnessArray: LED 亮度 [54], 值 0-10, 按位置索引（兼容旧接口） */
export type BrightnessArray = number[];

export type Cubelet = {
    id: number;       // 0..26
    pos: Vec3;        // 网格上的逻辑位置 (按 step 缩放)
    quat: Quat;       // 朝向 (四元数)
    faceColors: string[]; // [Up, Down, Right, Left, Front, Back] 六个面的颜色
    stickerIds: number[]; // [Up, Down, Right, Left, Front, Back] 贴纸 ID (-1=无)
};

export type Move = { axis: Axis; index: -1 | 0 | 1; dir: TurnDir; notation?: string };

export type ActiveTurn = {
    axis: Axis;
    index: -1 | 0 | 1;
    dir: TurnDir;
    notation?: string;
    startMs: number;
    durationMs: number;
    affectedIds: number[];
    snapshot: Record<number, {
        pos: Vec3;
        quat: Quat;
        faceColors: string[];
        stickerIds: number[];
    }>;
};

export type TurnSnapshot = ActiveTurn['snapshot'];

/** 流水灯面类型 */
export type FlowingLightFace = 'U' | 'D' | 'F' | 'B' | 'L' | 'R' | null;

/** 矩阵位置索引类型 [face, row, col] */
export type MatrixIndex = [number, number, number];

/** 面/行/列坐标 */
export type FaceRowCol = { face: number; row: number; col: number };
