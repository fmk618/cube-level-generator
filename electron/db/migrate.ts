import type { Pool } from 'mysql2/promise';

const COLUMN_MIGRATIONS = [
  'ALTER TABLE chapters ADD COLUMN sync_uuid CHAR(36) NULL',
  'ALTER TABLE levels ADD COLUMN sync_uuid CHAR(36) NULL',
  'ALTER TABLE skills ADD COLUMN sync_uuid CHAR(36) NULL',
  'ALTER TABLE level_skill_bindings ADD COLUMN sync_uuid CHAR(36) NULL',
  'ALTER TABLE level_skill_bindings ADD COLUMN row_uuid CHAR(36) NULL',
  'ALTER TABLE level_skill_bindings ADD UNIQUE KEY uk_binding_row_uuid (row_uuid)',
  'ALTER TABLE skills ADD KEY idx_skills_sync_uuid (sync_uuid)',
  'ALTER TABLE levels ADD KEY idx_levels_sync_uuid (sync_uuid)',
  'ALTER TABLE chapters ADD KEY idx_chapters_sync_uuid (sync_uuid)',
  'ALTER TABLE level_skill_bindings ADD KEY idx_bindings_sync_uuid (sync_uuid)',
  // 自定义阶段 ID 可能超过 16 字符
  'ALTER TABLE skills MODIFY COLUMN stage VARCHAR(64) NOT NULL',
  'ALTER TABLE level_skill_bindings MODIFY COLUMN cfop_stage VARCHAR(64) NOT NULL',
  'ALTER TABLE levels ADD COLUMN goal_state_matrices JSON NULL',
];

function isIgnorableMigrationError(error: unknown): boolean {
  const errno = (error as { errno?: number }).errno;
  // 1060 duplicate column, 1061 duplicate key name
  return errno === 1060 || errno === 1061;
}

export async function runMigrations(pool: Pool): Promise<void> {
  for (const sql of COLUMN_MIGRATIONS) {
    try {
      await pool.query(sql);
    } catch (error) {
      if (!isIgnorableMigrationError(error)) throw error;
    }
  }
}
