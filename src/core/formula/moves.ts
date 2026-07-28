import { resolveOrientationRecord } from './orientation';
import { type DevCustomColor, type DevCustomOrientation } from './types';
import { rotateStateMatrixLayer, type StateMatrix } from '../cube';

type FaceName = 'U' | 'D' | 'F' | 'B' | 'L' | 'R';
type FaceToColor = Record<FaceName, DevCustomColor>;
type ColorToFace = Record<DevCustomColor, FaceName>;

/**
 * 整体旋转的面循环顺序，方向定义：
 *   x = 与 R 转动同向：F→U→B→D→F（从 R 外侧看顺时针）
 *   y = 与 U 转动同向：F→R→B→L→F（从 U 外侧看顺时针，即从上往下看）
 *   z = 与 F 转动同向：U→R→D→L→U（从 F 外侧看顺时针）
 * 含义："F→U" 表示旋转后原本在 F 的颜色现在到了 U（即 newFace[U] = oldFace[F]）。
 */
const ROTATION_CYCLES: Record<'x' | 'y' | 'z', readonly FaceName[]> = {
    x: ['F', 'U', 'B', 'D'] as const,
    y: ['F', 'L', 'B', 'R'] as const,
    z: ['U', 'R', 'D', 'L'] as const,
};

type TurnDir = 1 | -1;
type Axis = 'x' | 'y' | 'z';

const FACE_TOKENS = new Set(['U', 'D', 'L', 'R', 'F', 'B']);
const WIDE_TOKENS = new Set(['u', 'd', 'l', 'r', 'f', 'b']);
const AXIS_TOKENS = new Set(['x', 'y', 'z']);
const SLICE_TOKENS = new Set(['M', 'E', 'S']);
const ALLOWED_BASE_TOKENS = new Set([
    ...FACE_TOKENS,
    ...WIDE_TOKENS,
    ...AXIS_TOKENS,
    ...SLICE_TOKENS,
]);

const invertModifier = (modifier: string): string => {
    if (modifier === '2') return '2';
    if (modifier === "'") return '';
    return "'";
};

/**
 * 展开公式中 `(group)N` 重复记号，例如 `(R U R' U')2` → `R U R' U' R U R' U'`。
 * 支持嵌套括号（递归展开最内层优先）。
 */
const expandGroupRepeats = (formula: string): string => {
    let result = formula;
    const PAREN_RE = /\(([^()]+)\)(\d)?/g;
    let prev = '';
    while (prev !== result) {
        prev = result;
        result = result.replace(PAREN_RE, (_match, group: string, repeatStr?: string) => {
            const repeat = repeatStr ? parseInt(repeatStr, 10) : 1;
            return Array.from({ length: repeat }, () => group).join(' ');
        });
    }
    return result;
};

export const parseFormulaTokens = (
    algorithm: string,
): { tokens: string[]; invalidTokens: string[]; displayTokens: string[] } => {
    const tokens: string[] = [];
    const invalidTokens: string[] = [];
    const displayTokens: string[] = [];
    const expanded = expandGroupRepeats(algorithm);
    const cleaned = expanded.replace(/[()［］\[\],，]/g, ' ');

    let index = 0;
    while (index < cleaned.length) {
        const char = cleaned[index];
        if (/\s/.test(char)) {
            index += 1;
            continue;
        }
        if (!/[A-Za-z]/.test(char)) {
            invalidTokens.push(char);
            index += 1;
            continue;
        }

        let token = char;
        let raw = char;
        index += 1;
        if (index < cleaned.length && cleaned[index] === '\'') {
            token += '\'';
            raw += '\'';
            index += 1;
            if (index < cleaned.length && cleaned[index] === '2') {
                token = token[0] + '2';
                raw += '2';
                index += 1;
            }
        } else if (index < cleaned.length && cleaned[index] === '2') {
            token += '2';
            raw += '2';
            index += 1;
        }

        if (!ALLOWED_BASE_TOKENS.has(token[0])) {
            invalidTokens.push(token);
            continue;
        }
        if (token.length > 2 || (token.length === 2 && token[1] !== '\'' && token[1] !== '2')) {
            invalidTokens.push(token);
            continue;
        }

        tokens.push(token);
        displayTokens.push(raw);
    }

    return { tokens, invalidTokens, displayTokens };
};

type LayerMove = { axis: Axis; index: -1 | 0 | 1; dir: TurnDir };

const expandBaseToken = (base: string, dir: TurnDir): LayerMove[] => {
    switch (base) {
        case 'U': return [{ axis: 'y', index: 1, dir }];
        case 'D': return [{ axis: 'y', index: -1, dir: (dir * -1) as TurnDir }];
        case 'F': return [{ axis: 'z', index: 1, dir }];
        case 'B': return [{ axis: 'z', index: -1, dir: (dir * -1) as TurnDir }];
        case 'L': return [{ axis: 'x', index: -1, dir: (dir * -1) as TurnDir }];
        case 'R': return [{ axis: 'x', index: 1, dir }];
        case 'u': return [{ axis: 'y', index: 1, dir }, { axis: 'y', index: 0, dir }];
        case 'd': return [{ axis: 'y', index: -1, dir: (dir * -1) as TurnDir }, { axis: 'y', index: 0, dir: (dir * -1) as TurnDir }];
        case 'f': return [{ axis: 'z', index: 1, dir }, { axis: 'z', index: 0, dir }];
        case 'b': return [{ axis: 'z', index: -1, dir: (dir * -1) as TurnDir }, { axis: 'z', index: 0, dir: (dir * -1) as TurnDir }];
        case 'l': return [{ axis: 'x', index: -1, dir: (dir * -1) as TurnDir }, { axis: 'x', index: 0, dir: (dir * -1) as TurnDir }];
        case 'r': return [{ axis: 'x', index: 1, dir }, { axis: 'x', index: 0, dir }];
        case 'x': return [{ axis: 'x', index: -1, dir }, { axis: 'x', index: 0, dir }, { axis: 'x', index: 1, dir }];
        case 'y': return [{ axis: 'y', index: -1, dir }, { axis: 'y', index: 0, dir }, { axis: 'y', index: 1, dir }];
        case 'z': return [{ axis: 'z', index: -1, dir }, { axis: 'z', index: 0, dir }, { axis: 'z', index: 1, dir }];
        case 'M': return [{ axis: 'x', index: 0, dir: (dir * -1) as TurnDir }];
        case 'E': return [{ axis: 'y', index: 0, dir: (dir * -1) as TurnDir }];
        case 'S': return [{ axis: 'z', index: 0, dir }];
        default:
            throw new Error(`Unsupported formula token: ${base}`);
    }
};

const expandToken = (token: string): LayerMove[] => {
    const base = token[0];
    const modifier = token.slice(1);
    const dir: TurnDir = modifier === '\'' ? 1 : -1;
    const repeat = modifier === '2' ? 2 : 1;
    return Array.from({ length: repeat }).flatMap(() => expandBaseToken(base, dir));
};

export const applyTokensToState = (stateMatrix: StateMatrix, tokens: string[]): StateMatrix =>
    tokens.reduce((current, token) => {
        const expanded = expandToken(token);
        return expanded.reduce(
            (next, move) => rotateStateMatrixLayer(next, move.axis, move.index, move.dir),
            current,
        );
    }, stateMatrix.map((face) => face.map((row) => [...row])) as StateMatrix);

export const invertReverseTokens = (tokens: string[]): string[] =>
    [...tokens].reverse().map((token) => `${token[0]}${invertModifier(token.slice(1))}`);

// 朝向旋转工具（用于 mapTokensByOrientation 沿公式推演 official 朝向）

const rotateFaceToColorOnce = (
    current: FaceToColor,
    axis: 'x' | 'y' | 'z',
    dir: 1 | -1,
): FaceToColor => {
    const cycle = ROTATION_CYCLES[axis];
    const next: FaceToColor = { ...current };
    for (let i = 0; i < 4; i += 1) {
        const from = cycle[i];
        const to = dir === 1 ? cycle[(i + 1) % 4] : cycle[(i + 3) % 4];
        next[to] = current[from];
    }
    return next;
};

const applyRotationToken = (
    current: FaceToColor,
    base: 'x' | 'y' | 'z',
    modifier: string,
): FaceToColor => {
    const dir: 1 | -1 = modifier === "'" ? -1 : 1;
    const repeat = modifier === '2' ? 2 : 1;
    let next = current;
    for (let i = 0; i < repeat; i += 1) {
        next = rotateFaceToColorOnce(next, base, dir);
    }
    return next;
};

/**
 * 切片转动 (M/E/S) → 「外层面 + 整体旋转」恒等式：
 *   M = L' R x'，E = U D' y'，S = F' B z
 * 纯切片在只有 6 面传感器的智能魔方上无法被追踪，必须改写成外层面转动。
 */
const SLICE_DECOMPOSITION: Record<'M' | 'E' | 'S', readonly string[]> = {
    M: ["L'", 'R', "x'"],
    E: ['U', "D'", "y'"],
    S: ["F'", 'B', 'z'],
};

const invertTokenModifier = (token: string): string =>
    `${token[0]}${invertModifier(token.slice(1))}`;

const expandSliceToken = (token: string): string[] => {
    const base = token[0] as 'M' | 'E' | 'S';
    const modifier = token.slice(1);
    const baseSeq = SLICE_DECOMPOSITION[base];
    if (modifier === '2') {
        const rev = [...baseSeq].reverse().map(invertTokenModifier);
        return [...rev, ...rev];
    }
    if (modifier === "'") return [...baseSeq].reverse().map(invertTokenModifier);
    return [...baseSeq];
};

/**
 * 与 mapTokensByOrientation 相同，但额外返回每个输出外层转的「来源 official token 下标」。
 */
export const mapTokensByOrientationWithSource = (
    tokens: string[],
    officialOrientation: DevCustomOrientation,
    runtimeOrientation: DevCustomOrientation,
): { mapped: string[]; sourceIndices: number[] } => {
    const runtime = resolveOrientationRecord(runtimeOrientation);
    const runtimeColorToFace: ColorToFace = runtime.colorToFace;

    let officialFaceToColor: FaceToColor = { ...resolveOrientationRecord(officialOrientation).faceToColor };

    const result: string[] = [];

    const processToken = (token: string): void => {
        const base = token[0];
        const modifier = token.slice(1);

        if (AXIS_TOKENS.has(base)) {
            officialFaceToColor = applyRotationToken(
                officialFaceToColor,
                base as 'x' | 'y' | 'z',
                modifier,
            );
            return;
        }

        if (FACE_TOKENS.has(base)) {
            const color = officialFaceToColor[base as FaceName];
            const runtimeFace = runtimeColorToFace[color];
            result.push(`${runtimeFace}${modifier}`);
            return;
        }

        if (WIDE_TOKENS.has(base)) {
            const WIDE_MOVE_INFO: Record<string, { axisBase: Axis; axisModifier: string; compensationFace: FaceName }> = {
                l: { axisBase: 'x', axisModifier: "'", compensationFace: 'R' },
                r: { axisBase: 'x', axisModifier: '', compensationFace: 'L' },
                d: { axisBase: 'y', axisModifier: "'", compensationFace: 'U' },
                u: { axisBase: 'y', axisModifier: '', compensationFace: 'D' },
                f: { axisBase: 'z', axisModifier: '', compensationFace: 'B' },
                b: { axisBase: 'z', axisModifier: "'", compensationFace: 'F' },
            };
            const info = WIDE_MOVE_INFO[base];
            const isInverse = modifier === "'";
            const repeat = modifier === '2' ? 2 : 1;
            const actualAxisModifier = isInverse ? invertModifier(info.axisModifier) : info.axisModifier;
            const faceModifier = isInverse ? "'" : '';
            for (let i = 0; i < repeat; i += 1) {
                officialFaceToColor = applyRotationToken(officialFaceToColor, info.axisBase, actualAxisModifier);
                const color = officialFaceToColor[info.compensationFace];
                const runtimeFace = runtimeColorToFace[color];
                result.push(`${runtimeFace}${faceModifier}`);
            }
            return;
        }

        if (SLICE_TOKENS.has(base)) {
            for (const sub of expandSliceToken(token)) {
                processToken(sub);
            }
            return;
        }

        throw new Error(`Unsupported formula token: ${token}`);
    };

    const sourceIndices: number[] = [];
    tokens.forEach((token, officialIndex) => {
        processToken(token);
        while (sourceIndices.length < result.length) {
            sourceIndices.push(officialIndex);
        }
    });

    return { mapped: result, sourceIndices };
};

export const mapTokensByOrientation = (
    tokens: string[],
    officialOrientation: DevCustomOrientation,
    runtimeOrientation: DevCustomOrientation,
): string[] => mapTokensByOrientationWithSource(tokens, officialOrientation, runtimeOrientation).mapped;

export const stringifyFormulaTokens = (tokens: string[]): string => tokens.join(' ');
