import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool } from './pool.ts';
import { ensureSchema } from './schema.ts';
import { resolveDbConfig } from './config.ts';
import type {
  CloudCatalogDocument,
  CloudLevelSkillMap,
  CloudSkillGraphDocument,
  DbPingResult,
} from './types.ts';

type Queryable = {
  query: PoolConnection['query'];
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
  await ensureSchema();
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM levels');
    await conn.query('DELETE FROM chapters');

    for (const chapter of doc.chapters) {
      await conn.query(
        `INSERT INTO chapters (id, part_number, part_name, title, description, capacity)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          chapter.id,
          chapter.partNumber,
          chapter.partName,
          chapter.title,
          chapter.description ?? null,
          chapter.capacity,
        ],
      );
    }

    for (const level of doc.levels) {
      await conn.query(
        `INSERT INTO levels (
          id, chapter_id, level_order, title, description,
          start_state_matrix, goal_state_matrix, brightness_matrix,
          max_moves, star_thresholds, hint, rotation_formula, rotation_target,
          guidance_formula, guidance_failure_threshold, hidden
        ) VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), ?, CAST(? AS JSON), ?, ?, ?, ?, ?, ?)`,
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
        ],
      );
    }

    await setMeta(conn, 'catalog_version', String(doc.version));
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
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
  await ensureSchema();
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM skills');
    for (const skill of doc.skills) {
      await conn.query(
        `INSERT INTO skills (
          id, stage, display_name_zh, display_name_en, goal,
          prerequisites, mastery_standard, skill_order, draft
        ) VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?)`,
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
        ],
      );
    }
    await setMeta(conn, 'skill_graph_version', String(doc.version));
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
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

  const versionRaw = await getMeta('skill_graph_version');
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
  };
}

export async function pushLevelSkillMap(map: CloudLevelSkillMap): Promise<void> {
  await ensureSchema();
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM level_skill_bindings');
    for (const [levelId, entry] of Object.entries(map.mappings) as Array<
      [string, CloudLevelSkillMap['mappings'][string]]
    >) {
      for (const binding of entry.skills) {
        await conn.query(
          `INSERT INTO level_skill_bindings (
            level_id, skill_id, cfop_stage, teach_mode, formula_difficulty
          ) VALUES (?, ?, ?, ?, ?)`,
          [
            levelId,
            binding.skillId,
            binding.cfopStage,
            binding.teachMode,
            binding.formulaDifficulty,
          ],
        );
      }
    }
    await setMeta(conn, 'level_skill_map_version', String(map.version));
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function pullLevelSkillMap(): Promise<CloudLevelSkillMap | null> {
  await ensureSchema();
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT level_id, skill_id, cfop_stage, teach_mode, formula_difficulty
     FROM level_skill_bindings
     ORDER BY level_id ASC, id ASC`,
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
