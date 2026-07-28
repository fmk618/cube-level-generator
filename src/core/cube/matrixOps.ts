/**
 * 纯矩阵操作函数
 */
import type {
    Axis, TurnDir, Vec3, Quat,
    ColorMatrix, StateMatrix, LocationMatrix, BrightnessMatrix, BrightnessArray,
    FaceRowCol,
} from './types';
import { applyMat3ToVec3, makeMat3, type Mat3 } from '../utils/matrix';

// 四元数运算

/** 四元数乘法 */
export const qMul = (a: Quat, b: Quat): Quat => {
    const [ax, ay, az, aw] = a;
    const [bx, by, bz, bw] = b;
    return [
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    ];
};

export const qFromAxisAngle = (axis: Axis, angle: number): Quat => {
    const half = angle / 2;
    const s = Math.sin(half);
    const c = Math.cos(half);
    if (axis === 'x') return [s, 0, 0, c];
    if (axis === 'y') return [0, s, 0, c];
    return [0, 0, s, c]; // z
};

// 预计算 90° 旋转四元数 (3 轴 × 2 方向 = 6 种)
export const ROT90_QUAT: Record<Axis, Record<TurnDir, Quat>> = {
    x: { 1: qFromAxisAngle('x', Math.PI / 2), '-1': qFromAxisAngle('x', -Math.PI / 2) },
    y: { 1: qFromAxisAngle('y', Math.PI / 2), '-1': qFromAxisAngle('y', -Math.PI / 2) },
    z: { 1: qFromAxisAngle('z', Math.PI / 2), '-1': qFromAxisAngle('z', -Math.PI / 2) },
};

// 预计算 90° 旋转矩阵
const ROTATION_MAT3: Record<Axis, Record<TurnDir, Mat3>> = {
    x: {
        1: makeMat3([1, 0, 0, 0, 0, -1, 0, 1, 0]),
        '-1': makeMat3([1, 0, 0, 0, 0, 1, 0, -1, 0]),
    },
    y: {
        1: makeMat3([0, 0, 1, 0, 1, 0, -1, 0, 0]),
        '-1': makeMat3([0, 0, -1, 0, 1, 0, 1, 0, 0]),
    },
    z: {
        1: makeMat3([0, -1, 0, 1, 0, 0, 0, 0, 1]),
        '-1': makeMat3([0, 1, 0, -1, 0, 0, 0, 0, 1]),
    },
};

// 使用缓存矩阵旋转网格坐标 90°
const rotatePos90 = (() => {
    const scratch: Vec3 = [0, 0, 0];
    return (p: Vec3, axis: Axis, dir: TurnDir): Vec3 => applyMat3ToVec3(ROTATION_MAT3[axis][dir], p, scratch);
})();

// 坐标转换

/** 将 (face, row, col) 转换为 3D 坐标 */
export const faceRowColToCoord = (face: number, row: number, col: number): Vec3 => {
    switch (face) {
        case 0: // Up (+Y)
            return [col - 1, 2, row - 1];
        case 1: // Left (-X)
            return [-2, 1 - row, col - 1];
        case 2: // Front (+Z)
            return [col - 1, 1 - row, 2];
        case 3: // Right (+X)
            return [2, 1 - row, 1 - col];
        case 4: // Back (-Z)
            return [1 - col, 1 - row, -2];
        case 5: // Down (-Y)
            return [col - 1, -2, 1 - row];
        default:
            return [0, 0, 0];
    }
};

export const coordToFaceRowCol = (coord: Vec3): FaceRowCol | null => {
    const [x, y, z] = coord.map((v) => Math.round(v)) as Vec3;
    const absX = Math.abs(x);
    const absY = Math.abs(y);
    const absZ = Math.abs(z);

    if (absY === 2) {
        return y > 0 ? { face: 0, row: z + 1, col: x + 1 } : { face: 5, row: 1 - z, col: x + 1 };
    }
    if (absX === 2) {
        return x < 0 ? { face: 1, row: 1 - y, col: z + 1 } : { face: 3, row: 1 - y, col: 1 - z };
    }
    if (absZ === 2) {
        return z > 0 ? { face: 2, row: 1 - y, col: x + 1 } : { face: 4, row: 1 - y, col: 1 - x };
    }

    return null;
};

// 克隆函数

export const clampColorValue = (value: number): number => {
    if (!Number.isFinite(value)) return 0;
    return Math.min(15, Math.max(0, Math.round(value)));
};

export const cloneColorMatrix = (matrix: ColorMatrix): ColorMatrix =>
    matrix.map((face) => face.map((row) => [...row]));

export const cloneLocationMatrix = (matrix: LocationMatrix): LocationMatrix =>
    matrix.map((face) => face.map((row) => [...row]));

export const cloneStateMatrix = (matrix: StateMatrix): StateMatrix =>
    matrix.map((face) => face.map((row) => [...row]));

export const cloneBrightnessArray = (array: BrightnessArray): BrightnessArray => [...array];

export const cloneBrightnessMatrix = (matrix: BrightnessMatrix): BrightnessMatrix =>
    matrix.map((face) => face.map((row) => [...row]));

export const cloneV = (v: Vec3): Vec3 => [v[0], v[1], v[2]];
export const cloneQ = (q: Quat): Quat => [q[0], q[1], q[2], q[3]];

// 工厂函数

export const makeBlankColorMatrix = (): ColorMatrix =>
    Array.from({ length: 6 }, () => Array.from({ length: 3 }, () => Array(3).fill(0)));

export const makeBlankLocationMatrix = (): LocationMatrix =>
    Array.from({ length: 6 }, () => Array.from({ length: 3 }, () => Array(3).fill(0)));

export const makeBlankStateMatrix = (): StateMatrix =>
    Array.from({ length: 6 }, () => Array.from({ length: 3 }, () => Array(3).fill(0)));

export const makeBlankBrightnessMatrix = (): BrightnessMatrix =>
    Array.from({ length: 6 }, () => Array.from({ length: 3 }, () => Array(3).fill(0)));

// 矩阵验证

export const sanitizeColorMatrix = (matrix: ColorMatrix, fallback: ColorMatrix): ColorMatrix => {
    const fallbackClone = cloneColorMatrix(fallback);

    if (!Array.isArray(matrix) || matrix.length !== 6) {
        return fallbackClone;
    }

    return Array.from({ length: 6 }, (_, faceIdx) => {
        const face = matrix[faceIdx];
        if (!Array.isArray(face) || face.length !== 3) {
            return fallbackClone[faceIdx].map((row) => [...row]);
        }

        return Array.from({ length: 3 }, (_, rowIdx) => {
            const row = face[rowIdx];
            if (!Array.isArray(row) || row.length !== 3) {
                return [...fallbackClone[faceIdx][rowIdx]];
            }

            return row.map((value, colIdx) => {
                const fallbackValue = fallbackClone[faceIdx][rowIdx][colIdx] ?? 0;
                const safeValue = Number.isFinite(value) ? value : fallbackValue;
                return clampColorValue(safeValue);
            });
        });
    });
};

// 矩阵旋转

// 预计算旋转映射表: ROTATION_LOOKUP[axis][index][dir] = 54 条 src→dst 映射
type RotationMapping = { sf: number; sr: number; sc: number; df: number; dr: number; dc: number }[];
const ROTATION_LOOKUP: Record<Axis, Record<-1 | 0 | 1, Record<TurnDir, RotationMapping>>> = (() => {
    const axes: Axis[] = ['x', 'y', 'z'];
    const indices: (-1 | 0 | 1)[] = [-1, 0, 1];
    const dirs: TurnDir[] = [1, -1];
    const result = {} as Record<Axis, Record<-1 | 0 | 1, Record<TurnDir, RotationMapping>>>;

    for (const axis of axes) {
        result[axis] = {} as Record<-1 | 0 | 1, Record<TurnDir, RotationMapping>>;
        for (const index of indices) {
            result[axis][index] = {} as Record<TurnDir, RotationMapping>;
            for (const dir of dirs) {
                const mapping: RotationMapping = [];
                for (let face = 0; face < 6; face++) {
                    for (let row = 0; row < 3; row++) {
                        for (let col = 0; col < 3; col++) {
                            const coord = faceRowColToCoord(face, row, col);
                            const axisValue = axis === 'x' ? coord[0] : axis === 'y' ? coord[1] : coord[2];
                            const axisSign = Math.sign(axisValue) as -1 | 0 | 1;
                            const rotatedCoord = axisSign === index
                                ? rotatePos90(coord, axis, dir)
                                : coord;
                            const dest = coordToFaceRowCol(rotatedCoord);
                            if (dest) {
                                mapping.push({ sf: face, sr: row, sc: col, df: dest.face, dr: dest.row, dc: dest.col });
                            }
                        }
                    }
                }
                result[axis][index][dir] = mapping;
            }
        }
    }
    return result;
})();

/** 通用矩阵层旋转函数 — 查表实现 */
const rotateMatrixLayer = <T extends number[][][]>(
    matrix: T,
    axis: Axis,
    index: -1 | 0 | 1,
    dir: TurnDir,
    makeBlank: () => T
): T => {
    const rotated = makeBlank();
    const mapping = ROTATION_LOOKUP[axis][index][dir];
    for (const { sf, sr, sc, df, dr, dc } of mapping) {
        rotated[df][dr][dc] = matrix[sf][sr][sc];
    }
    return rotated;
};

export const rotateColorMatrixLayer = (
    matrix: ColorMatrix,
    axis: Axis,
    index: -1 | 0 | 1,
    dir: TurnDir,
    fallback: ColorMatrix
): ColorMatrix => {
    const safe = sanitizeColorMatrix(matrix, fallback);
    return rotateMatrixLayer(safe, axis, index, dir, makeBlankColorMatrix);
};

export const rotateLocationMatrixLayer = (
    matrix: LocationMatrix,
    axis: Axis,
    index: -1 | 0 | 1,
    dir: TurnDir
): LocationMatrix => {
    return rotateMatrixLayer(matrix, axis, index, dir, makeBlankLocationMatrix);
};

export const rotateStateMatrixLayer = (
    matrix: StateMatrix,
    axis: Axis,
    index: -1 | 0 | 1,
    dir: TurnDir
): StateMatrix => {
    return rotateMatrixLayer(matrix, axis, index, dir, makeBlankStateMatrix);
};

// BrightnessMatrix ↔ BrightnessArray 转换

export const brightnessMatrixToArray = (
    matrix: BrightnessMatrix,
    initialStateMatrix: StateMatrix
): BrightnessArray => {
    const arr = new Array(54).fill(8);
    for (let face = 0; face < 6; face++) {
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                const stickerId = initialStateMatrix[face][row][col];
                arr[stickerId] = matrix[face]?.[row]?.[col] ?? 8;
            }
        }
    }
    return arr;
};

export const brightnessArrayToMatrix = (
    array: BrightnessArray,
    initialStateMatrix: StateMatrix
): BrightnessMatrix => {
    const matrix: BrightnessMatrix = Array.from({ length: 6 }, () =>
        Array.from({ length: 3 }, () => Array(3).fill(8))
    );
    for (let face = 0; face < 6; face++) {
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                const stickerId = initialStateMatrix[face][row][col];
                matrix[face][row][col] = array[stickerId] ?? 8;
            }
        }
    }
    return matrix;
};
