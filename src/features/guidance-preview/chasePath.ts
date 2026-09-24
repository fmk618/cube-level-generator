import {
    INITIAL_STATE_MATRIX,
    MOVE_DEFINITIONS,
} from '@/core/cube';
import {
    faceRowColToCoord,
    rotateStateMatrixLayer,
} from '@/core/cube';
import type {
    Axis,
    FlowingLightFace,
    MatrixIndex,
    Move,
    StateMatrix,
} from '@/core/cube';

export type ChaseFace = Exclude<FlowingLightFace, null>;

const CHASE_FACES: readonly ChaseFace[] = ['U', 'D', 'F', 'B', 'L', 'R'];
/** 记谱面 → MOVE_DEFINITIONS 下标（U D F B L R） */
const FACE_TO_MOVE_INDEX: Record<ChaseFace, number> = {
    U: 0,
    D: 1,
    F: 2,
    B: 3,
    L: 4,
    R: 5,
};
/** 记谱面 → stateMatrix 面下标（U L F R B D） */
const FACE_TO_MATRIX_INDEX: Record<ChaseFace, number> = {
    U: 0,
    L: 1,
    F: 2,
    R: 3,
    B: 4,
    D: 5,
};
const AXIS_COMPONENT: Record<Axis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 };
const SORT_PLANE: Record<Axis, readonly [0 | 1 | 2, 0 | 1 | 2]> = {
    x: [1, 2],
    y: [2, 0],
    z: [0, 1],
};

const findStateId = (matrix: StateMatrix, stateId: number): MatrixIndex | null => {
    for (let face = 0; face < 6; face += 1) {
        for (let row = 0; row < 3; row += 1) {
            for (let col = 0; col < 3; col += 1) {
                if (matrix[face][row][col] === stateId) return [face, row, col];
            }
        }
    }
    return null;
};

const sameIndex = (left: MatrixIndex, right: MatrixIndex): boolean => (
    left[0] === right[0] && left[1] === right[1] && left[2] === right[2]
);

const rotateSequence = (sequence: MatrixIndex[], startIndex: number): MatrixIndex[] => (
    [...sequence.slice(startIndex), ...sequence.slice(0, startIndex)]
);

/**
 * 从物理贴纸坐标生成目标层外围 12 格，并用真实矩阵转动校准正转方向。
 * 这样 U/D/F/B/L/R 共用同一套几何规则，不再分别维护容易互相矛盾的手写路径。
 */
export const buildChaseSequence = (face: ChaseFace): readonly MatrixIndex[] => {
    const move = MOVE_DEFINITIONS[FACE_TO_MOVE_INDEX[face]] as Move;
    const axisComponent = AXIS_COMPONENT[move.axis];
    const [planeX, planeY] = SORT_PLANE[move.axis];
    let sequence: MatrixIndex[] = [];

    for (let candidateFace = 0; candidateFace < 6; candidateFace += 1) {
        for (let row = 0; row < 3; row += 1) {
            for (let col = 0; col < 3; col += 1) {
                const coord = faceRowColToCoord(candidateFace, row, col);
                const layerCoordinate = Math.max(-1, Math.min(1, coord[axisComponent]));
                const belongsToTurningFace = coord[axisComponent] === move.index * 2;
                if (layerCoordinate === move.index && !belongsToTurningFace) {
                    sequence.push([candidateFace, row, col]);
                }
            }
        }
    }

    sequence.sort((left, right) => {
        const leftCoord = faceRowColToCoord(...left);
        const rightCoord = faceRowColToCoord(...right);
        return Math.atan2(leftCoord[planeY], leftCoord[planeX])
            - Math.atan2(rightCoord[planeY], rightCoord[planeX]);
    });

    if (sequence.length !== 12) {
        throw new Error(`Invalid ${face} chase ring: expected 12 positions, got ${sequence.length}`);
    }

    const rotated = rotateStateMatrixLayer(
        INITIAL_STATE_MATRIX,
        move.axis,
        move.index,
        move.dir,
    );
    const sourceId = INITIAL_STATE_MATRIX[sequence[0][0]][sequence[0][1]][sequence[0][2]];
    const destination = findStateId(rotated, sourceId);
    const destinationIndex = destination
        ? sequence.findIndex((candidate) => sameIndex(candidate, destination))
        : -1;
    if (destinationIndex === 9) {
        sequence = [sequence[0], ...sequence.slice(1).reverse()];
    } else if (destinationIndex !== 3) {
        throw new Error(`Invalid ${face} chase direction: expected a three-position turn, got ${destinationIndex}`);
    }

    // U/D/L/R 从物理 F 面开始，F/B 从物理 U 面开始，入口位置与用户观察锚点稳定一致。
    const preferredStartFace = face === 'F' || face === 'B' ? 0 : 2;
    const preferredStartIndex = sequence.findIndex((candidate, index) => (
        candidate[0] === preferredStartFace
        && sequence[(index + sequence.length - 1) % sequence.length][0] !== preferredStartFace
    ));
    if (preferredStartIndex >= 0) {
        sequence = rotateSequence(sequence, preferredStartIndex);
    }

    return sequence;
};

/**
 * 被转面自身外圈 8 格（不含中心），正转方向与真实层转一致。
 * 用于通关下一关提示：顶面走 U 流水灯，而非侧面外层 12 环。
 */
export const buildFaceRingChaseSequence = (face: ChaseFace): readonly MatrixIndex[] => {
    const move = MOVE_DEFINITIONS[FACE_TO_MOVE_INDEX[face]] as Move;
    const matrixFace = FACE_TO_MATRIX_INDEX[face];
    const [planeX, planeY] = SORT_PLANE[move.axis];
    let sequence: MatrixIndex[] = [];

    for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 3; col += 1) {
            if (row === 1 && col === 1) continue;
            sequence.push([matrixFace, row, col]);
        }
    }

    sequence.sort((left, right) => {
        const leftCoord = faceRowColToCoord(...left);
        const rightCoord = faceRowColToCoord(...right);
        return Math.atan2(leftCoord[planeY], leftCoord[planeX])
            - Math.atan2(rightCoord[planeY], rightCoord[planeX]);
    });

    if (sequence.length !== 8) {
        throw new Error(`Invalid ${face} face-ring: expected 8 positions, got ${sequence.length}`);
    }

    const rotated = rotateStateMatrixLayer(
        INITIAL_STATE_MATRIX,
        move.axis,
        move.index,
        move.dir,
    );
    const sourceId = INITIAL_STATE_MATRIX[sequence[0][0]][sequence[0][1]][sequence[0][2]];
    const destination = findStateId(rotated, sourceId);
    const destinationIndex = destination
        ? sequence.findIndex((candidate) => sameIndex(candidate, destination))
        : -1;
    // 8 环上 90° 正转应前进 2 格；若落到 6 则序向反了
    if (destinationIndex === 6) {
        sequence = [sequence[0], ...sequence.slice(1).reverse()];
    } else if (destinationIndex !== 2) {
        throw new Error(
            `Invalid ${face} face-ring direction: expected a two-position turn, got ${destinationIndex}`,
        );
    }

    // 优先从前棱中点切入（U/D 的 F 侧；F/B 的 U 侧；L/R 的 F 侧）
    const preferredStart: MatrixIndex = face === 'F' || face === 'B'
        ? [matrixFace, 0, 1]
        : face === 'L'
            ? [matrixFace, 1, 2]
            : face === 'R'
                ? [matrixFace, 1, 0]
                : [matrixFace, 2, 1];
    const preferredStartIndex = sequence.findIndex((candidate) => sameIndex(candidate, preferredStart));
    if (preferredStartIndex >= 0) {
        sequence = rotateSequence(sequence, preferredStartIndex);
    }

    return sequence;
};

export const GUIDANCE_CHASE_SEQUENCE: Readonly<Record<ChaseFace, readonly MatrixIndex[]>> = (
    Object.fromEntries(CHASE_FACES.map((face) => [face, buildChaseSequence(face)]))
) as Record<ChaseFace, readonly MatrixIndex[]>;

export const FACE_RING_CHASE_SEQUENCE: Readonly<Record<ChaseFace, readonly MatrixIndex[]>> = (
    Object.fromEntries(CHASE_FACES.map((face) => [face, buildFaceRingChaseSequence(face)]))
) as Record<ChaseFace, readonly MatrixIndex[]>;

export type GuidanceStickerEndpoint = {
    stickerId: number;
    from: MatrixIndex;
    to: MatrixIndex;
};

const indexKey = (index: MatrixIndex): string => `${index[0]}:${index[1]}:${index[2]}`;

/** 同面四邻 + 跨棱邻格（3D 距离²=2）。 */
const listSurfaceNeighbors = (index: MatrixIndex): MatrixIndex[] => {
    const [face, row, col] = index;
    const neighbors: MatrixIndex[] = [];
    const deltas: readonly [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of deltas) {
        const nr = row + dr;
        const nc = col + dc;
        if (nr >= 0 && nr < 3 && nc >= 0 && nc < 3) {
            neighbors.push([face, nr, nc]);
        }
    }
    const origin = faceRowColToCoord(face, row, col);
    for (let otherFace = 0; otherFace < 6; otherFace += 1) {
        if (otherFace === face) continue;
        for (let r = 0; r < 3; r += 1) {
            for (let c = 0; c < 3; c += 1) {
                const other = faceRowColToCoord(otherFace, r, c);
                const dx = origin[0] - other[0];
                const dy = origin[1] - other[1];
                const dz = origin[2] - other[2];
                if (dx * dx + dy * dy + dz * dz === 2) {
                    neighbors.push([otherFace, r, c]);
                }
            }
        }
    }
    return neighbors;
};

/**
 * blinkMask ∩ brightness 教学贴纸：当前物理位 → goal 物理位。
 * 已到位的跳过；调用方通常取第一条做流水灯。
 */
export const resolveGuidanceStickerEndpoints = (
    blinkMaskMatrix: number[][][],
    brightnessMatrix: number[][][],
    goalStateMatrix: StateMatrix,
    currentStateMatrix: StateMatrix,
): GuidanceStickerEndpoint[] => {
    const endpoints: GuidanceStickerEndpoint[] = [];
    for (let face = 0; face < 6; face += 1) {
        for (let row = 0; row < 3; row += 1) {
            for (let col = 0; col < 3; col += 1) {
                if ((blinkMaskMatrix[face]?.[row]?.[col] ?? 0) <= 0) continue;
                if ((brightnessMatrix[face]?.[row]?.[col] ?? 0) <= 0) continue;
                const stickerId = INITIAL_STATE_MATRIX[face][row][col];
                const from = findStateId(currentStateMatrix, stickerId);
                const to = findStateId(goalStateMatrix, stickerId);
                if (!from || !to) continue;
                if (sameIndex(from, to)) continue;
                endpoints.push({ stickerId, from, to });
            }
        }
    }
    return endpoints;
};

/**
 * 贴纸表面最短路径（含起终点）。不可达时退化为 [from, to]。
 * 仅作异常兜底；正常「初始→目标」应走公式转层环弧。
 */
export const buildSurfaceChasePath = (
    from: MatrixIndex,
    to: MatrixIndex,
): MatrixIndex[] => {
    if (sameIndex(from, to)) return [from];

    const queue: MatrixIndex[] = [from];
    const cameFrom = new Map<string, string | null>();
    cameFrom.set(indexKey(from), null);
    let found = false;

    while (queue.length > 0) {
        const current = queue.shift()!;
        if (sameIndex(current, to)) {
            found = true;
            break;
        }
        for (const next of listSurfaceNeighbors(current)) {
            const key = indexKey(next);
            if (cameFrom.has(key)) continue;
            cameFrom.set(key, indexKey(current));
            queue.push(next);
        }
    }

    if (!found) return [from, to];

    const path: MatrixIndex[] = [];
    let cursor: string | null = indexKey(to);
    while (cursor) {
        const [f, r, c] = cursor.split(':').map(Number) as [number, number, number];
        path.push([f, r, c]);
        cursor = cameFrom.get(cursor) ?? null;
    }
    path.reverse();
    return path;
};

/**
 * 在公式转层 12 环上按 dir 从 from 走到 to（含起终点）。
 * 任一点不在该环上则返回 null。
 */
export const buildLayerRingChasePath = (
    from: MatrixIndex,
    to: MatrixIndex,
    face: ChaseFace,
    dir: 1 | -1,
): MatrixIndex[] | null => {
    const sequence = GUIDANCE_CHASE_SEQUENCE[face];
    if (sameIndex(from, to)) {
        const onRing = sequence.some((cell) => sameIndex(cell, from));
        return onRing ? [from] : null;
    }

    const startIdx = sequence.findIndex((cell) => sameIndex(cell, from));
    const endIdx = sequence.findIndex((cell) => sameIndex(cell, to));
    if (startIdx < 0 || endIdx < 0) return null;

    const n = sequence.length;
    const path: MatrixIndex[] = [];
    let idx = startIdx;
    for (let step = 0; step <= n; step += 1) {
        path.push([sequence[idx][0], sequence[idx][1], sequence[idx][2]]);
        if (idx === endIdx) return path;
        idx = ((idx + dir) % n + n) % n;
    }
    return null;
};

/**
 * 取第一条未到位教学贴纸路径。
 * 有 face/dir 时强制沿公式转层环弧；仅环上不可用时回退表面 BFS。
 */
export const buildGuidanceStickerChasePath = (
    blinkMaskMatrix: number[][][],
    brightnessMatrix: number[][][],
    goalStateMatrix: StateMatrix,
    currentStateMatrix: StateMatrix,
    preferredFace?: ChaseFace | null,
    preferredDir: 1 | -1 = 1,
): MatrixIndex[] | null => {
    const endpoints = resolveGuidanceStickerEndpoints(
        blinkMaskMatrix,
        brightnessMatrix,
        goalStateMatrix,
        currentStateMatrix,
    );
    const first = endpoints[0];
    if (!first) return null;

    if (preferredFace) {
        const ringPath = buildLayerRingChasePath(
            first.from,
            first.to,
            preferredFace,
            preferredDir,
        );
        if (ringPath && ringPath.length > 0) return ringPath;
    }

    return buildSurfaceChasePath(first.from, first.to);
};
