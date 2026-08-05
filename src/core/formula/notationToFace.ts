/**
 * 单步 notation → 硬件外层面 + 方向
 *
 * 映射规则:
 *  - U/D/F/B/L/R(±')               → 同名面
 *  - 宽转 u/d/f/b/l/r(±')          → 就近映射到外层大写面(硬件 LED 只有六个外层面)
 *  - 切片 M/E/S / 整转 x/y/z(±')   → null（需先经 mapTokensByOrientation 改写为外层）
 */
import type { FlowingLightFace } from '../cube/types';

export type HintFace = Exclude<FlowingLightFace, null>;
export type HintDir = 1 | -1;

export interface NotationHint {
    face: HintFace;
    dir: HintDir;
}

const WIDE_TO_FACE: Record<string, HintFace> = {
    u: 'U', d: 'D', f: 'F', b: 'B', l: 'L', r: 'R',
};

const FACE_SET: ReadonlySet<HintFace> = new Set<HintFace>(['U', 'D', 'F', 'B', 'L', 'R']);

export function normalizeNotationToken(notation: string): string {
    const token = notation.trim();
    if (!token) return '';
    return token.replace(/[''′`]/g, "'");
}

export function notationToFace(notation: string): NotationHint | null {
    const token = normalizeNotationToken(notation);
    if (!token) return null;

    const base = token[0];
    const inverted = token.endsWith("'");
    const dir: HintDir = inverted ? -1 : 1;

    if (FACE_SET.has(base as HintFace)) {
        return { face: base as HintFace, dir };
    }

    const wideFace = WIDE_TO_FACE[base];
    if (wideFace) {
        return { face: wideFace, dir };
    }

    return null;
}
