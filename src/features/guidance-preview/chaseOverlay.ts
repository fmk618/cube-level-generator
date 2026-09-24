import {
  FLOWING_LIGHT_MATRIX_INDICES,
  type BrightnessMatrix,
  type FlowingLightFace,
  type MatrixIndex,
} from '@/core/cube';
import type { HintFace } from '@/core/formula';

const cloneBrightness = (matrix: BrightnessMatrix): BrightnessMatrix => (
  matrix.map((face) => face.map((row) => [...row]))
);

/** 在关卡亮度底图上，按环路径点亮前 litCount 格（流水灯预览） */
export const buildChaseOverlayBrightness = (
  base: BrightnessMatrix,
  face: HintFace,
  litCount: number,
  peakBrightness = 10,
): BrightnessMatrix => {
  const next = cloneBrightness(base);
  const ring = FLOWING_LIGHT_MATRIX_INDICES[face as Exclude<FlowingLightFace, null>] as MatrixIndex[];
  const count = Math.max(0, Math.min(ring.length, Math.floor(litCount)));
  for (let i = 0; i < count; i += 1) {
    const [f, r, c] = ring[i];
    next[f][r][c] = peakBrightness;
  }
  return next;
};

export const getChaseRingLength = (face: HintFace): number => (
  FLOWING_LIGHT_MATRIX_INDICES[face as Exclude<FlowingLightFace, null>]?.length ?? 0
);

/** 按任意矩阵路径逐步点亮（贴纸路径流水灯预览） */
export const buildChaseOverlayFromPath = (
  base: BrightnessMatrix,
  path: readonly MatrixIndex[],
  litCount: number,
  peakBrightness = 10,
): BrightnessMatrix => {
  const next = cloneBrightness(base);
  const count = Math.max(0, Math.min(path.length, Math.floor(litCount)));
  for (let i = 0; i < count; i += 1) {
    const [f, r, c] = path[i];
    next[f][r][c] = peakBrightness;
  }
  return next;
};
