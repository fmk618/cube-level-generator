/**
 * 颜色/亮度查找、求解检测、公式解析
 */
import type {
    Vec3, Move, Axis, TurnDir,
    ColorMatrix, StateMatrix, BrightnessMatrix,
    FaceRowCol,
} from './types';
import { INITIAL_STATE_MATRIX, MOVE_DEFINITIONS, MOVE_INDEX_TO_NOTATION, NOTATION_TO_INDEX } from './constants';

// 位置查找

let STATE_ID_TO_POSITION: Map<number, FaceRowCol> | null = null;

export const getStateIdToPositionMap = (): Map<number, FaceRowCol> => {
    if (STATE_ID_TO_POSITION === null) {
        STATE_ID_TO_POSITION = new Map();
        for (let face = 0; face < 6; face++) {
            for (let row = 0; row < 3; row++) {
                for (let col = 0; col < 3; col++) {
                    STATE_ID_TO_POSITION.set(INITIAL_STATE_MATRIX[face][row][col], { face, row, col });
                }
            }
        }
    }
    return STATE_ID_TO_POSITION;
};

/** 根据 stateId 查找初始位置 (O(1) 查找) */
export const findInitialPositionByStateId = (stateId: number): FaceRowCol | null => {
    return getStateIdToPositionMap().get(stateId) ?? null;
};

// 颜色工具

/** 颜色索引 (0-15) → 十六进制颜色 */
export const colorIndexToHex = (index: number): string => {
    const colors = [
        '#1E293B', '#EF4444', '#F97316', '#FACC15', '#22C55E',
        '#16A34A', '#20D9A0', '#33E5E5', '#60A5FA', '#2563EB',
        '#9944FF', '#FF44FF', '#FF3388', '#FF99CC', '#99CCFF',
        '#F8FAFC'
    ];
    return colors[index] || '#F8FAFC';
};

/** 根据 stateId 从 colorMatrix 查找颜色索引 (O(1) 查找) */
export const findColorByStateId = (stateId: number, colorMatrix: number[][][]): number => {
    const pos = getStateIdToPositionMap().get(stateId);
    if (!pos) return 0;
    return colorMatrix[pos.face]?.[pos.row]?.[pos.col] ?? 0;
};

/** 根据 stateId 从 brightnessMatrix 查找亮度 (O(1) 查找) */
export const findBrightnessByStateId = (stateId: number, brightnessMatrix: BrightnessMatrix): number => {
    const pos = getStateIdToPositionMap().get(stateId);
    if (!pos) return 8;
    return brightnessMatrix[pos.face]?.[pos.row]?.[pos.col] ?? 8;
};

// 求解检测

export const computeCubeStatus = (
    stateMatrix: StateMatrix,
    colorMatrix: ColorMatrix
): 'solved' | 'scrambled' | 'partial' => {
    let solvedFaces = 0;

    for (let face = 0; face < 6; face++) {
        const firstColor = findColorByStateId(stateMatrix[face][0][0], colorMatrix);
        let uniform = true;
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                if (row === 0 && col === 0) continue;
                if (findColorByStateId(stateMatrix[face][row][col], colorMatrix) !== firstColor) {
                    uniform = false;
                    break;
                }
            }
            if (!uniform) break;
        }
        if (uniform) solvedFaces++;
    }

    if (solvedFaces === 6) return 'solved';
    if (solvedFaces <= 1) return 'scrambled';
    return 'partial';
};

// 面颜色查找

/** 根据 cubelet 位置从矩阵读取六个面的颜色 */
export const getFaceColorsFromMatrices = (
    pos: Vec3,
    stateMatrix: StateMatrix,
    colorMatrix: ColorMatrix,
    step: number
): string[] => {
    const gridX = Math.round(pos[0] / step) as -1 | 0 | 1;
    const gridY = Math.round(pos[1] / step) as -1 | 0 | 1;
    const gridZ = Math.round(pos[2] / step) as -1 | 0 | 1;

    const getColorForFace = (face: number): number => {
        let row = -1;
        let col = -1;

        switch (face) {
            case 0: // Up (+Y)
                if (gridY !== 1) return -1;
                row = gridZ + 1;
                col = gridX + 1;
                break;
            case 1: // Left (-X)
                if (gridX !== -1) return -1;
                row = 1 - gridY;
                col = gridZ + 1;
                break;
            case 2: // Front (+Z)
                if (gridZ !== 1) return -1;
                row = 1 - gridY;
                col = gridX + 1;
                break;
            case 3: // Right (+X)
                if (gridX !== 1) return -1;
                row = 1 - gridY;
                col = 1 - gridZ;
                break;
            case 4: // Back (-Z)
                if (gridZ !== -1) return -1;
                row = 1 - gridY;
                col = 1 - gridX;
                break;
            case 5: // Down (-Y)
                if (gridY !== -1) return -1;
                row = 1 - gridZ;
                col = gridX + 1;
                break;
        }

        if (row >= 0 && row < 3 && col >= 0 && col < 3) {
            const stateId = stateMatrix[face]?.[row]?.[col] ?? 0;
            return findColorByStateId(stateId, colorMatrix);
        }
        return -1;
    };

    const upColor = getColorForFace(0);
    const downColor = getColorForFace(5);
    const rightColor = getColorForFace(3);
    const leftColor = getColorForFace(1);
    const frontColor = getColorForFace(2);
    const backColor = getColorForFace(4);

    return [
        colorIndexToHex(upColor >= 0 ? upColor : 3),
        colorIndexToHex(downColor >= 0 ? downColor : 15),
        colorIndexToHex(rightColor >= 0 ? rightColor : 5),
        colorIndexToHex(leftColor >= 0 ? leftColor : 9),
        colorIndexToHex(frontColor >= 0 ? frontColor : 1),
        colorIndexToHex(backColor >= 0 ? backColor : 2),
    ];
};

// 贴纸 ID 查找

/**
 * 获取 cubelet 各面对应的贴纸 ID (stateMatrix 值)
 * 返回 [up, down, right, left, front, back]，不在该面上的返回 -1
 */
export const getStickerIdsForPosition = (
    pos: Vec3,
    stateMatrix: StateMatrix,
    step: number
): number[] => {
    const gridX = Math.round(pos[0] / step) as -1 | 0 | 1;
    const gridY = Math.round(pos[1] / step) as -1 | 0 | 1;
    const gridZ = Math.round(pos[2] / step) as -1 | 0 | 1;

    const getStickerId = (face: number): number => {
        let row = -1;
        let col = -1;
        switch (face) {
            case 0: if (gridY !== 1) return -1; row = gridZ + 1; col = gridX + 1; break;
            case 1: if (gridX !== -1) return -1; row = 1 - gridY; col = gridZ + 1; break;
            case 2: if (gridZ !== 1) return -1; row = 1 - gridY; col = gridX + 1; break;
            case 3: if (gridX !== 1) return -1; row = 1 - gridY; col = 1 - gridZ; break;
            case 4: if (gridZ !== -1) return -1; row = 1 - gridY; col = 1 - gridX; break;
            case 5: if (gridY !== -1) return -1; row = 1 - gridZ; col = gridX + 1; break;
        }
        if (row >= 0 && row < 3 && col >= 0 && col < 3) {
            return stateMatrix[face]?.[row]?.[col] ?? -1;
        }
        return -1;
    };

    return [
        getStickerId(0),
        getStickerId(5),
        getStickerId(3),
        getStickerId(1),
        getStickerId(2),
        getStickerId(4),
    ];
};

// 逐面亮度查找

export const getBrightnessArrayForPosition = (
    pos: Vec3,
    stateMatrix: StateMatrix,
    brightnessMatrix: BrightnessMatrix,
    step: number
): number[] => {
    const stickerIds = getStickerIdsForPosition(pos, stateMatrix, step);
    return stickerIds.map(id => {
        if (id < 0) return 0.0;
        const raw = findBrightnessByStateId(id, brightnessMatrix);
        return (raw / 10) * 0.8;
    });
};

// 公式解析

/** 解析魔方公式 (如 "U R' F2") */
const EXPANDABLE_LAYER_MOVES: Record<string, { axis: Axis; index: -1 | 0 | 1; dir: TurnDir }[]> = {
    // 切片
    M: [{ axis: 'x', index: 0, dir: 1 }],
    E: [{ axis: 'y', index: 0, dir: 1 }],
    S: [{ axis: 'z', index: 0, dir: -1 }],
    // 宽转（外层面 + 相邻中层）
    r: [{ axis: 'x', index: 1, dir: -1 }, { axis: 'x', index: 0, dir: -1 }],
    l: [{ axis: 'x', index: -1, dir: 1 }, { axis: 'x', index: 0, dir: 1 }],
    u: [{ axis: 'y', index: 1, dir: -1 }, { axis: 'y', index: 0, dir: -1 }],
    d: [{ axis: 'y', index: -1, dir: 1 }, { axis: 'y', index: 0, dir: 1 }],
    f: [{ axis: 'z', index: 1, dir: -1 }, { axis: 'z', index: 0, dir: -1 }],
    b: [{ axis: 'z', index: -1, dir: 1 }, { axis: 'z', index: 0, dir: 1 }],
    // 整体旋转（三层同向）
    x: [{ axis: 'x', index: -1, dir: -1 }, { axis: 'x', index: 0, dir: -1 }, { axis: 'x', index: 1, dir: -1 }],
    y: [{ axis: 'y', index: -1, dir: -1 }, { axis: 'y', index: 0, dir: -1 }, { axis: 'y', index: 1, dir: -1 }],
    z: [{ axis: 'z', index: -1, dir: -1 }, { axis: 'z', index: 0, dir: -1 }, { axis: 'z', index: 1, dir: -1 }],
};

export const parseNotation = (notation: string): Move[] => {
    const moves: Move[] = [];
    const tokens = notation.trim().split(/\s+/);

    for (const token of tokens) {
        if (!token) continue;

        const base = token[0];
        const modifier = token.slice(1);
        const count = modifier === "2" ? 2 : 1;

        const baseIndex = NOTATION_TO_INDEX[base];
        if (baseIndex !== undefined) {
            const moveIndex = modifier === "'" ? baseIndex + 6 : baseIndex;
            for (let i = 0; i < count; i++) {
                moves.push({ ...MOVE_DEFINITIONS[moveIndex], notation: MOVE_INDEX_TO_NOTATION[moveIndex] });
            }
            continue;
        }

        const layerMoves = EXPANDABLE_LAYER_MOVES[base];
        if (layerMoves) {
            const inverted = modifier === "'";
            for (let i = 0; i < count; i++) {
                for (const lm of layerMoves) {
                    moves.push({
                        axis: lm.axis,
                        index: lm.index,
                        dir: (inverted ? (lm.dir * -1) : lm.dir) as TurnDir,
                        notation: token,
                    });
                }
            }
            continue;
        }

        console.warn(`[cube] Unknown notation: ${token}`);
    }

    return moves;
};
