/**
 * 目标态删除后保存不应残留旧 goalStateMatrices。
 * 运行: npx tsx src/core/levels/goalDelete.smoke.ts
 */
import { INITIAL_STATE_MATRIX } from '../cube/constants';
import { applyTokensToState } from '../formula/moves';
import { LEVEL_LAYOUT_CHAPTERS } from './chapters';
import {
  buildYawEquivalentGoalStates,
  normalizeLevelGoalStates,
  resolveLevelGoalStates,
} from './goalStates';
import { exportLevelsToJSON, normalizeLevelCatalogDocument } from './utils';
import type { LevelCatalogDocument, LevelDefinition } from './types';

const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

const clone = (m: typeof INITIAL_STATE_MATRIX) =>
  m.map((face) => face.map((row) => [...row]));

const yaw = buildYawEquivalentGoalStates(INITIAL_STATE_MATRIX);
assert(yaw.length === 4, `expected 4 yaw variants, got ${yaw.length}`);

// 1) 删目标4 → 剩 3
{
  const remaining = yaw.slice(0, 3);
  const normalized = normalizeLevelGoalStates({
    goalStateMatrix: remaining[0],
    goalStateMatrices: remaining,
  });
  const resolved = resolveLevelGoalStates(normalized);
  assert(resolved.length === 3, `delete #4 should leave 3, got ${resolved.length}`);
  assert(normalized.goalStateMatrices?.length === 3, 'matrices length 3');
}

// 2) 删到只剩 1 → 必须显式清掉 goalStateMatrices
{
  const normalized = normalizeLevelGoalStates({
    goalStateMatrix: yaw[0],
    goalStateMatrices: [yaw[0]],
  });
  assert(normalized.goalStateMatrices === undefined, 'single goal must clear matrices');
  assert(
    Object.prototype.hasOwnProperty.call(normalized, 'goalStateMatrices'),
    'clear must be an own key so spread merge can overwrite',
  );
}

// 3) catalog normalize 不得把旧四目标从 ...level 残留回来
{
  const stale: LevelDefinition = {
    id: 'goal-delete-1',
    chapterId: 'part1',
    order: 1,
    title: 'Goal delete',
    description: 'regression',
    startStateMatrix: clone(INITIAL_STATE_MATRIX),
    goalStateMatrix: clone(yaw[0]),
    // 模拟旧数据仍挂着四向
    goalStateMatrices: yaw.map(clone),
    brightnessMatrix: Array.from({ length: 6 }, () =>
      Array.from({ length: 3 }, () => Array(3).fill(8)),
    ) as LevelDefinition['brightnessMatrix'],
    maxMoves: 8,
    starThresholds: [3, 5],
  };

  // 先按「只保留主目标」写出再整目录 normalize（模拟 updateLevel 合并后）
  const cleared = {
    ...stale,
    ...normalizeLevelGoalStates({
      goalStateMatrix: stale.goalStateMatrix,
      goalStateMatrices: undefined,
    }),
  };
  const doc: LevelCatalogDocument = {
    version: 2,
    chapters: LEVEL_LAYOUT_CHAPTERS.slice(0, 1),
    levels: [cleared],
  };
  const normalizedDoc = normalizeLevelCatalogDocument(doc);
  assert(
    normalizedDoc.levels[0].goalStateMatrices === undefined,
    'catalog normalize must not revive stale goalStateMatrices',
  );

  const json = exportLevelsToJSON(normalizedDoc);
  const parsed = JSON.parse(json) as LevelCatalogDocument;
  assert(
    !Object.prototype.hasOwnProperty.call(parsed.levels[0], 'goalStateMatrices')
      || parsed.levels[0].goalStateMatrices === undefined,
    'exported JSON must not keep multi-goal array for single goal',
  );
}

// 4) 删目标4 后 catalog 长度保持 3（含主目标去重）
{
  const remaining = [yaw[0], yaw[1], yaw[2]].map(clone);
  // 故意再塞一个「绕 y」第四向作残留干扰
  const withStaleFourth: LevelDefinition = {
    id: 'goal-delete-2',
    chapterId: 'part1',
    order: 1,
    title: 'Goal delete 2',
    description: 'regression',
    startStateMatrix: clone(INITIAL_STATE_MATRIX),
    goalStateMatrix: remaining[0],
    goalStateMatrices: [...remaining, applyTokensToState(yaw[0], ['y', 'y', 'y'])],
    brightnessMatrix: Array.from({ length: 6 }, () =>
      Array.from({ length: 3 }, () => Array(3).fill(8)),
    ) as LevelDefinition['brightnessMatrix'],
    maxMoves: 8,
    starThresholds: [3, 5],
  };
  // 保存时应按 UI 当前 3 个写入
  const patched = {
    ...withStaleFourth,
    ...normalizeLevelGoalStates({
      goalStateMatrix: remaining[0],
      goalStateMatrices: remaining,
    }),
  };
  const doc = normalizeLevelCatalogDocument({
    version: 2,
    chapters: LEVEL_LAYOUT_CHAPTERS.slice(0, 1),
    levels: [patched],
  });
  assert(
    resolveLevelGoalStates(doc.levels[0]).length === 3,
    'saving 3 goals must keep 3 after catalog normalize',
  );
}

console.log('goalDelete.smoke: ok');
