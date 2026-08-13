/**
 * 桌面导出契约冒烟：确保 App 需要的字段会出现在 JSON 里。
 * 运行: npx tsx src/core/levels/exportContract.smoke.ts
 */
import { INITIAL_BRIGHTNESS_MATRIX, INITIAL_COLOR_MATRIX, INITIAL_STATE_MATRIX } from '../cube/constants';
import { DEV_CUSTOM_COLOR_VALUES } from '../formula/types';
import { LEVEL_LAYOUT_CHAPTERS } from './chapters';
import { exportLevelsToJSON, importLevelsFromJSON, normalizeLevelCatalogDocument } from './utils';
import type { LevelCatalogDocument, LevelDefinition } from './types';
import { isLevelGoalReached } from './goalEvaluation';

const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

const createLevel = (partial: Partial<LevelDefinition> = {}): LevelDefinition => ({
  id: 'contract-custom-1',
  chapterId: 'part1',
  order: 1,
  title: 'Custom cross',
  description: 'Desktop custom target export smoke',
  startStateMatrix: INITIAL_STATE_MATRIX,
  goalStateMatrix: INITIAL_STATE_MATRIX,
  brightnessMatrix: INITIAL_BRIGHTNESS_MATRIX,
  maxMoves: 8,
  starThresholds: [3, 5],
  rotationFormula: "R U R' U'",
  rotationTarget: 'custom',
  rotationTargetLabel: '十字',
  formulaOrientation: {
    topColor: DEV_CUSTOM_COLOR_VALUES.green,
    frontColor: DEV_CUSTOM_COLOR_VALUES.red,
  },
  guidanceFailureThreshold: 3,
  ...partial,
});

const catalog: LevelCatalogDocument = {
  version: 2,
  chapters: LEVEL_LAYOUT_CHAPTERS.slice(0, 1),
  levels: [createLevel()],
};

const json = exportLevelsToJSON(catalog);
const parsed = JSON.parse(json) as LevelCatalogDocument;
assert(parsed.version === 2, 'version must be 2');
assert(parsed.levels[0].rotationTarget === 'custom', 'custom target retained');
assert(parsed.levels[0].rotationTargetLabel === '十字', 'label retained');
assert(parsed.levels[0].stateDefinitionMode === 'formula', 'stateDefinitionMode inferred/exported');
assert(
  parsed.levels[0].formulaOrientation?.topColor === DEV_CUSTOM_COLOR_VALUES.green,
  'formulaOrientation retained',
);

const roundTrip = importLevelsFromJSON(json);
assert(roundTrip.levels[0].stateDefinitionMode === 'formula', 'round-trip mode');
assert(roundTrip.levels[0].rotationTargetLabel === '十字', 'round-trip label');

const brightnessOnly = normalizeLevelCatalogDocument({
  version: 2,
  chapters: LEVEL_LAYOUT_CHAPTERS.slice(0, 1),
  levels: [createLevel({ rotationFormula: undefined, stateDefinitionMode: undefined })],
});
assert(brightnessOnly.levels[0].stateDefinitionMode === 'brightness', 'no formula → brightness');

const visibleEquivalent = INITIAL_STATE_MATRIX.map((face) => face.map((row) => [...row]));
[visibleEquivalent[0][0][1], visibleEquivalent[0][1][1]] = [
  visibleEquivalent[0][1][1],
  visibleEquivalent[0][0][1],
];
const bothLit = INITIAL_BRIGHTNESS_MATRIX.map((face) => face.map((row) => row.map(() => 0)));
bothLit[0][0][1] = 8;
bothLit[0][1][1] = 8;
assert(
  isLevelGoalReached(visibleEquivalent, INITIAL_STATE_MATRIX, bothLit, INITIAL_COLOR_MATRIX),
  'same visible pattern must ignore same-color sticker ID',
);
const oneLit = INITIAL_BRIGHTNESS_MATRIX.map((face) => face.map((row) => row.map(() => 0)));
oneLit[0][1][1] = 8;
assert(
  !isLevelGoalReached(visibleEquivalent, INITIAL_STATE_MATRIX, oneLit, INITIAL_COLOR_MATRIX),
  'different visible brightness layout must fail',
);

console.log('exportContract.smoke: ok');
