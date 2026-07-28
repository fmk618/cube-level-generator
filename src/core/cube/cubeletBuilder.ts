/**
 * Cubelet 构建与操作
 */
import type {
    Axis, TurnDir, Vec3, Quat,
    Cubelet, TurnSnapshot,
    ColorMatrix, StateMatrix,
} from './types';
import { INITIAL_COLOR_MATRIX, INITIAL_STATE_MATRIX } from './constants';
import { ROT90_QUAT, cloneV, cloneQ, qMul } from './matrixOps';
import { getFaceColorsFromMatrices, getStickerIdsForPosition } from './colorUtils';
import { applyMat3ToVec3, makeMat3 } from '../utils/matrix';

const ROTATION_MAT3_LOCAL: Record<Axis, Record<TurnDir, ReturnType<typeof makeMat3>>> = {
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

const rotatePos90Local = (() => {
    const scratch: Vec3 = [0, 0, 0];
    return (p: Vec3, axis: Axis, dir: TurnDir): Vec3 =>
        applyMat3ToVec3(ROTATION_MAT3_LOCAL[axis][dir], p, scratch);
})();

export const getAffectedCubeletIds = (cubelets: Cubelet[], step: number, axis: Axis, index: -1 | 0 | 1): number[] =>
    cubelets
        .filter((cubelet) => {
            const coord = axis === 'x' ? cubelet.pos[0] : axis === 'y' ? cubelet.pos[1] : cubelet.pos[2];
            const grid = Math.round(coord / step) as -1 | 0 | 1;
            return grid === index;
        })
        .map((cubelet) => cubelet.id);

export const createTurnSnapshot = (cubelets: Cubelet[], affectedIds: number[]): TurnSnapshot => {
    const snapshot: TurnSnapshot = {};

    for (const id of affectedIds) {
        const cubelet = cubelets.find((candidate) => candidate.id === id);
        if (!cubelet) continue;

        snapshot[id] = {
            pos: cloneV(cubelet.pos),
            quat: cloneQ(cubelet.quat),
            faceColors: [...cubelet.faceColors],
            stickerIds: [...cubelet.stickerIds],
        };
    }

    return snapshot;
};

export const applyTurnToCubelets = (
    cubelets: Cubelet[],
    step: number,
    axis: Axis,
    dir: TurnDir,
    affectedIds: number[],
    snapshot: TurnSnapshot
): Cubelet[] => {
    const rot90 = ROT90_QUAT[axis][dir];

    return cubelets.map((cubelet) => {
        if (!affectedIds.includes(cubelet.id)) return cubelet;

        const pre = snapshot[cubelet.id];
        if (!pre) return cubelet;

        const gx = Math.round(pre.pos[0] / step);
        const gy = Math.round(pre.pos[1] / step);
        const gz = Math.round(pre.pos[2] / step);
        const rotatedGrid = rotatePos90Local([gx, gy, gz], axis, dir);
        const bakedPos: Vec3 = [rotatedGrid[0] * step, rotatedGrid[1] * step, rotatedGrid[2] * step];
        const bakedQuat = qMul(rot90, pre.quat);

        return { ...cubelet, pos: bakedPos, quat: bakedQuat, faceColors: pre.faceColors, stickerIds: pre.stickerIds };
    });
};

// Cubelet 构建

export const makeInitialCube = (step = 0.54, colorMatrix?: ColorMatrix, stateMatrix?: StateMatrix): { cubelets: Cubelet[]; stepUsed: number } => {
    const list: Cubelet[] = [];
    let id = 0;
    const qI: Quat = [0, 0, 0, 1];
    const cMatrix = colorMatrix || INITIAL_COLOR_MATRIX;
    const sMatrix = stateMatrix || INITIAL_STATE_MATRIX;
    for (const X of [-1, 0, 1])
        for (const Y of [-1, 0, 1])
            for (const Z of [-1, 0, 1]) {
                const pos: Vec3 = [X * step, Y * step, Z * step];
                const faceColors = getFaceColorsFromMatrices(pos, sMatrix, cMatrix, step);
                const stickerIds = getStickerIdsForPosition(pos, sMatrix, step);
                list.push({ id: id++, pos, quat: [...qI], faceColors, stickerIds });
            }
    return { cubelets: list, stepUsed: step };
};

export const getInitialCube = () => makeInitialCube();
