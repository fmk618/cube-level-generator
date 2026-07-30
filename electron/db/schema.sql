-- 参考 DDL（应用启动时会自动建表并迁移 sync_uuid / row_uuid 列）

-- 关卡章节
CREATE TABLE IF NOT EXISTS chapters (
  id VARCHAR(64) NOT NULL,
  part_number INT NOT NULL,
  part_name VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  capacity INT NOT NULL,
  sync_uuid CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_chapters_part_number (part_number),
  KEY idx_chapters_sync_uuid (sync_uuid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 关卡
CREATE TABLE IF NOT EXISTS levels (
  id VARCHAR(64) NOT NULL,
  chapter_id VARCHAR(64) NOT NULL,
  level_order INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  start_state_matrix JSON NOT NULL,
  goal_state_matrix JSON NOT NULL,
  brightness_matrix JSON NOT NULL,
  max_moves INT NOT NULL,
  star_thresholds JSON NOT NULL,
  hint TEXT NULL,
  rotation_formula TEXT NULL,
  rotation_target VARCHAR(16) NULL,
  guidance_formula TEXT NULL,
  guidance_failure_threshold TINYINT NULL,
  hidden TINYINT(1) NOT NULL DEFAULT 0,
  sync_uuid CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_levels_chapter (chapter_id),
  KEY idx_levels_order (chapter_id, level_order),
  KEY idx_levels_sync_uuid (sync_uuid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 技能
CREATE TABLE IF NOT EXISTS skills (
  id VARCHAR(64) NOT NULL,
  stage VARCHAR(16) NOT NULL,
  display_name_zh VARCHAR(255) NOT NULL,
  display_name_en VARCHAR(255) NOT NULL,
  goal TEXT NOT NULL,
  prerequisites JSON NOT NULL,
  mastery_standard VARCHAR(64) NOT NULL,
  skill_order INT NOT NULL,
  draft TINYINT(1) NOT NULL DEFAULT 0,
  sync_uuid CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_skills_stage (stage),
  KEY idx_skills_sync_uuid (sync_uuid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 关卡-技能绑定（row_uuid 由 levelId+skillId 稳定生成）
CREATE TABLE IF NOT EXISTS level_skill_bindings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  row_uuid CHAR(36) NULL,
  level_id VARCHAR(64) NOT NULL,
  skill_id VARCHAR(64) NOT NULL,
  cfop_stage VARCHAR(16) NOT NULL,
  teach_mode VARCHAR(32) NOT NULL,
  formula_difficulty INT NOT NULL,
  sync_uuid CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_level_skill (level_id, skill_id),
  UNIQUE KEY uk_binding_row_uuid (row_uuid),
  KEY idx_bindings_skill (skill_id),
  KEY idx_bindings_sync_uuid (sync_uuid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 文档元数据（版本号、最近 sync_uuid 等）
CREATE TABLE IF NOT EXISTS app_meta (
  meta_key VARCHAR(64) NOT NULL,
  meta_value TEXT NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (meta_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
