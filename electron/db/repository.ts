import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool } from './pool.ts';
import { ensureSchema } from './schema.ts';
import { resolveDbConfig } from './config.ts';
import { withDeadlockRetry, withWriteLock } from './writeLock.ts';
import { bindingRowUuid, newSyncUuid } from './uuid.ts';
import type {
  CloudCatalogDocument,
  CloudLevelSkillMap,
  CloudSkillGraphDocument,
  DbPingResult,
} from './types.ts';

type Queryable = {
  query: PoolConnection['query'];
};

const BATCH_SIZE = 40;

type BindingRow = {
  levelId: string;
  skillId: string;
  cfopStage: string;
  teachMode: string;
  formulaDifficulty: number;
  rowUuid: string;
};

function parseJsonField<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

async function setMeta(db: Queryable, key: string, value: string): Promise<void> {
  await db.query(
    `INSERT INTO app_meta (meta_key, meta_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE meta_value = VALUES(meta_value)`,
    [key, value],
  );
}

async function getMeta(key: string): Promise<string | null> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT meta_value FROM app_meta WHERE meta_key = ? LIMIT 1',
    [key],
  );
  return rows[0]?.meta_value != null ? String(rows[0].meta_value) : null;
}

async function runWriteTransaction(run: (conn: PoolConnection) => Promise<void>): Promise<void> {
  await withWriteLock(() =>
    withDeadlockRetry(async () => {
      await ensureSchema();
      const pool = getPool();
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await run(conn);
        await conn.commit();
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
    }),
  );
}

export async function pingDb(): Promise<DbPingResult> {
  const config = resolveDbConfig();
  try {
    await ensureSchema();
    const pool = getPool();
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT DATABASE() AS db, VERSION() AS version, CURRENT_USER() AS user',
    );
    const row = rows[0];
    return {
      ok: true,
      database: String(row?.db ?? config.database),
      version: String(row?.version ?? ''),
      user: String(row?.user ?? ''),
      host: config.host,
    };
  } catch (error) {
    return {
      ok: false,
      database: config.database,
      version: '',
      user: '',
      host: config.host,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function pushCatalog(doc: CloudCatalogDocument): Promise<void> {
  const syncUuid = newSyncUuid();

  await runWriteTransaction(async (conn) => {
    for (const chapter of doc.chapters) {
      await conn.query(
        `INSERT INTO chapters (id, part_number, part_name, title, description, capacity, sync_uuid)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           part_number = VALUES(part_number),
           part_name = VALUES(part_name),
           title = VALUES(title),
           description = VALUES(description),
           capacity = VALUES(capacity),
           sync_uuid = VALUES(sync_uuid)`,
        [
          chapter.id,
          chapter.partNumber,
          chapter.partName,
          chapter.title,
          chapter.description ?? null,
          chapter.capacity,
          syncUuid,
        ],
      );
    }

    for (let i = 0; i < doc.levels.length; i += BATCH_SIZE) {
      const chunk = doc.levels.slice(i, i + BATCH_SIZE);
      for (const level of chunk) {
        await conn.query(
          `INSERT INTO levels (
            id, chapter_id, level_order, title, description,
            start_state_matrix, goal_state_matrix, brightness_matrix,
            max_moves, star_thresholds, hint, rotation_formula, rotation_target,
            guidance_formula, guidance_failure_threshold, hidden, sync_uuid
          ) VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), ?, CAST(? AS JSON), ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            chapter_id = VALUES(chapter_id),
            level_order = VALUES(level_order),
            title = VALUES(title),
            description = VALUES(description),
            start_state_matrix = VALUES(start_state_matrix),
            goal_state_matrix = VALUES(goal_state_matrix),
            brightness_matrix = VALUES(brightness_matrix),
            max_moves = VALUES(max_moves),
            star_thresholds = VALUES(star_thresholds),
            hint = VALUES(hint),
            rotation_formula = VALUES(rotation_formula),
            rotation_target = VALUES(rotation_target),
            guidance_formula = VALUES(guidance_formula),
            guidance_failure_threshold = VALUES(guidance_failure_threshold),
            hidden = VALUES(hidden),
            sync_uuid = VALUES(sync_uuid)`,
          [
            level.id,
            level.chapterId,
            level.order,
            level.title,
            level.description,
            JSON.stringify(level.startStateMatrix),
            JSON.stringify(level.goalStateMatrix),
            JSON.stringify(level.brightnessMatrix),
            level.maxMoves,
            JSON.stringify(level.starThresholds),
            level.hint ?? null,
            level.rotationFormula ?? null,
            level.rotationTarget ?? null,
            level.guidanceFormula ?? null,
            level.guidanceFailureThreshold ?? null,
            level.hidden ? 1 : 0,
            syncUuid,
          ],
        );
      }
    }

    await conn.query('DELETE FROM levels WHERE sync_uuid IS NULL OR sync_uuid <> ?', [syncUuid]);
    await conn.query('DELETE FROM chapters WHERE sync_uuid IS NULL OR sync_uuid <> ?', [syncUuid]);
    await setMeta(conn, 'catalog_version', String(doc.version));
    await setMeta(conn, 'catalog_sync_uuid', syncUuid);
  });
}

export async function pullCatalog(): Promise<CloudCatalogDocument | null> {
  await ensureSchema();
  const pool = getPool();
  const [chapterRows] = await pool.query<RowDataPacket[]>(
    'SELECT id, part_number, part_name, title, description, capacity FROM chapters ORDER BY part_number ASC',
  );
  const [levelRows] = await pool.query<RowDataPacket[]>(
    `SELECT id, chapter_id, level_order, title, description,
            start_state_matrix, goal_state_matrix, brightness_matrix,
            max_moves, star_thresholds, hint, rotation_formula, rotation_target,
            guidance_formula, guidance_failure_threshold, hidden
     FROM levels
     ORDER BY chapter_id ASC, level_order ASC`,
  );

  if (chapterRows.length === 0 && levelRows.length === 0) return null;

  const versionRaw = await getMeta('catalog_version');
  return {
    version: Number(versionRaw ?? 1),
    chapters: chapterRows.map((row: RowDataPacket) => ({
      id: String(row.id),
      partNumber: Number(row.part_number),
      partName: String(row.part_name),
      title: String(row.title),
      description: row.description != null ? String(row.description) : undefined,
      capacity: Number(row.capacity),
    })),
    levels: levelRows.map((row: RowDataPacket) => ({
      id: String(row.id),
      chapterId: String(row.chapter_id),
      order: Number(row.level_order),
      title: String(row.title),
      description: String(row.description ?? ''),
      startStateMatrix: parseJsonField(row.start_state_matrix, []),
      goalStateMatrix: parseJsonField(row.goal_state_matrix, []),
      brightnessMatrix: parseJsonField(row.brightness_matrix, []),
      maxMoves: Number(row.max_moves),
      starThresholds: parseJsonField<[number, number]>(row.star_thresholds, [0, 0]),
      hint: row.hint != null ? String(row.hint) : undefined,
      rotationFormula: row.rotation_formula != null ? String(row.rotation_formula) : undefined,
      rotationTarget: row.rotation_target != null ? String(row.rotation_target) : undefined,
      guidanceFormula: row.guidance_formula != null ? String(row.guidance_formula) : undefined,
      guidanceFailureThreshold:
        row.guidance_failure_threshold != null ? Number(row.guidance_failure_threshold) : undefined,
      hidden: Boolean(row.hidden),
    })),
  };
}

export async function pushSkills(doc: CloudSkillGraphDocument): Promise<void> {
  const syncUuid = newSyncUuid();
  const stages = Array.isArray(doc.stages)
    ? doc.stages.filter((stage) => stage && typeof stage.id === 'string' && stage.id.trim())
    : [];

  await runWriteTransaction(async (conn) => {
    for (const stage of stages) {
      await conn.query(
        `INSERT INTO skill_stages (id, label, stage_order, sync_uuid)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           label = VALUES(label),
           stage_order = VALUES(stage_order),
           sync_uuid = VALUES(sync_uuid)`,
        [
          String(stage.id).trim(),
          String(stage.label ?? stage.id).trim() || String(stage.id).trim(),
          Number(stage.order) || 0,
          syncUuid,
        ],
      );
    }

    for (let i = 0; i < doc.skills.length; i += BATCH_SIZE) {
      const chunk = doc.skills.slice(i, i + BATCH_SIZE);
      for (const skill of chunk) {
        await conn.query(
          `INSERT INTO skills (
            id, stage, display_name_zh, display_name_en, goal,
            prerequisites, mastery_standard, skill_order, draft, sync_uuid
          ) VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            stage = VALUES(stage),
            display_name_zh = VALUES(display_name_zh),
            display_name_en = VALUES(display_name_en),
            goal = VALUES(goal),
            prerequisites = VALUES(prerequisites),
            mastery_standard = VALUES(mastery_standard),
            skill_order = VALUES(skill_order),
            draft = VALUES(draft),
            sync_uuid = VALUES(sync_uuid)`,
          [
            skill.id,
            skill.stage,
            skill.displayNameZh,
            skill.displayNameEn,
            skill.goal,
            JSON.stringify(skill.prerequisites ?? []),
            skill.masteryStandard,
            skill.order,
            skill.draft ? 1 : 0,
            syncUuid,
          ],
        );
      }
    }

    await conn.query('DELETE FROM skills WHERE sync_uuid IS NULL OR sync_uuid <> ?', [syncUuid]);
    await conn.query('DELETE FROM skill_stages WHERE sync_uuid IS NULL OR sync_uuid <> ?', [syncUuid]);
    await setMeta(conn, 'skill_graph_version', String(doc.version));
    await setMeta(conn, 'skill_graph_sync_uuid', syncUuid);
  });
}

export async function pullSkills(): Promise<CloudSkillGraphDocument | null> {
  await ensureSchema();
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, stage, display_name_zh, display_name_en, goal,
            prerequisites, mastery_standard, skill_order, draft
     FROM skills
     ORDER BY stage ASC, skill_order ASC`,
  );
  if (rows.length === 0) return null;

  const [stageRows] = await pool.query<RowDataPacket[]>(
    `SELECT id, label, stage_order
     FROM skill_stages
     ORDER BY stage_order ASC, id ASC`,
  );

  const versionRaw = await getMeta('skill_graph_version');
  const stages = stageRows.map((row: RowDataPacket) => ({
    id: String(row.id),
    label: String(row.label ?? row.id),
    order: Number(row.stage_order) || 0,
  }));

  return {
    version: Number(versionRaw ?? 1),
    skills: rows.map((row: RowDataPacket) => ({
      id: String(row.id),
      stage: String(row.stage),
      displayNameZh: String(row.display_name_zh),
      displayNameEn: String(row.display_name_en),
      goal: String(row.goal ?? ''),
      prerequisites: parseJsonField<string[]>(row.prerequisites, []),
      masteryStandard: String(row.mastery_standard),
      order: Number(row.skill_order),
      draft: Boolean(row.draft),
    })),
    ...(stages.length > 0 ? { stages } : {}),
  };
}

export async function pushLevelSkillMap(map: CloudLevelSkillMap): Promise<void> {
  const syncUuid = newSyncUuid();
  const rows: BindingRow[] = [];

  for (const [levelId, entry] of Object.entries(map.mappings) as Array<
    [string, CloudLevelSkillMap['mappings'][string]]
  >) {
    const binding = entry.skills[0];
    if (!binding) continue;
    rows.push({
      levelId,
      skillId: binding.skillId,
      cfopStage: binding.cfopStage,
      teachMode: binding.teachMode,
      formulaDifficulty: binding.formulaDifficulty,
      rowUuid: bindingRowUuid(levelId, binding.skillId),
    });
  }

  await runWriteTransaction(async (conn) => {
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const chunk = rows.slice(i, i + BATCH_SIZE);
      for (const row of chunk) {
        await conn.query(
          `INSERT INTO level_skill_bindings (
            row_uuid, level_id, skill_id, cfop_stage, teach_mode, formula_difficulty, sync_uuid
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            row_uuid = VALUES(row_uuid),
            cfop_stage = VALUES(cfop_stage),
            teach_mode = VALUES(teach_mode),
            formula_difficulty = VALUES(formula_difficulty),
            sync_uuid = VALUES(sync_uuid)`,
          [
            row.rowUuid,
            row.levelId,
            row.skillId,
            row.cfopStage,
            row.teachMode,
            row.formulaDifficulty,
            syncUuid,
          ],
        );
      }
    }

    await conn.query(
      'DELETE FROM level_skill_bindings WHERE sync_uuid IS NULL OR sync_uuid <> ?',
      [syncUuid],
    );
    await setMeta(conn, 'level_skill_map_version', String(map.version));
    await setMeta(conn, 'level_skill_map_sync_uuid', syncUuid);
  });
}

export async function pullLevelSkillMap(): Promise<CloudLevelSkillMap | null> {
  await ensureSchema();
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT level_id, skill_id, cfop_stage, teach_mode, formula_difficulty
     FROM level_skill_bindings
     ORDER BY level_id ASC, row_uuid ASC, id ASC`,
  );
  if (rows.length === 0) {
    const versionRaw = await getMeta('level_skill_map_version');
    if (versionRaw == null) return null;
    return { version: Number(versionRaw), mappings: {} };
  }

  const mappings: CloudLevelSkillMap['mappings'] = {};
  for (const row of rows) {
    const levelId = String(row.level_id);
    if (!mappings[levelId]) mappings[levelId] = { skills: [] };
    mappings[levelId].skills.push({
      skillId: String(row.skill_id),
      cfopStage: String(row.cfop_stage),
      teachMode: String(row.teach_mode),
      formulaDifficulty: Number(row.formula_difficulty),
    });
  }

  const versionRaw = await getMeta('level_skill_map_version');
  return {
    version: Number(versionRaw ?? 2),
    mappings,
  };
}

export async function countRows(): Promise<{
  chapters: number;
  levels: number;
  skills: number;
  bindings: number;
}> {
  await ensureSchema();
  const pool = getPool();
  const count = async (table: string): Promise<number> => {
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS c FROM ${table}`);
    return Number(rows[0]?.c ?? 0);
  };
  return {
    chapters: await count('chapters'),
    levels: await count('levels'),
    skills: await count('skills'),
    bindings: await count('level_skill_bindings'),
  };
}
