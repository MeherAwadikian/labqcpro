-- Validation Studies Migration
-- Run: wrangler d1 execute labqcpro-db --remote --file=schema_validation.sql

CREATE TABLE IF NOT EXISTS validation_studies (
  id            TEXT PRIMARY KEY,
  lab_id        TEXT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  analyte_id    TEXT REFERENCES analytes(id) ON DELETE SET NULL,
  study_type    TEXT NOT NULL, -- reagent_lot | calibrator_lot | new_instrument | method_comparison
  title         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft', -- draft | in_progress | complete | approved
  metadata      TEXT NOT NULL DEFAULT '{}',    -- JSON: lot numbers, instruments, limits, etc.
  start_date    TEXT NOT NULL,
  end_date      TEXT,
  approved_by   TEXT,
  approval_date TEXT,
  conclusion    TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS validation_samples (
  id               TEXT PRIMARY KEY,
  study_id         TEXT NOT NULL REFERENCES validation_studies(id) ON DELETE CASCADE,
  sample_id_label  TEXT NOT NULL,
  reference_value  REAL,
  method_a_value   REAL,
  method_b_value   REAL,
  replicate_number INTEGER NOT NULL DEFAULT 1,
  level_label      TEXT NOT NULL DEFAULT '',   -- low | mid | high (calibrator)
  run_date         TEXT NOT NULL DEFAULT '',
  operator         TEXT NOT NULL DEFAULT '',
  notes            TEXT NOT NULL DEFAULT '',
  sort_order       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS validation_stats (
  id               TEXT PRIMARY KEY,
  study_id         TEXT NOT NULL UNIQUE REFERENCES validation_studies(id) ON DELETE CASCADE,
  n                INTEGER NOT NULL DEFAULT 0,
  mean_a           REAL,
  mean_b           REAL,
  sd_a             REAL,
  sd_b             REAL,
  cv_a             REAL,
  cv_b             REAL,
  mean_difference  REAL,
  sd_difference    REAL,
  bias_percent     REAL,
  slope            REAL,
  intercept        REAL,
  r_value          REAL,
  r_squared        REAL,
  loa_upper        REAL,
  loa_lower        REAL,
  tea_limit        REAL,
  passed           INTEGER,
  extra_json       TEXT NOT NULL DEFAULT '{}',
  calculated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS linearity_points (
  id                  TEXT PRIMARY KEY,
  study_id            TEXT NOT NULL REFERENCES validation_studies(id) ON DELETE CASCADE,
  concentration_level INTEGER NOT NULL,
  expected_value      REAL NOT NULL,
  observed_value_1    REAL NOT NULL,
  observed_value_2    REAL,
  mean_observed       REAL NOT NULL,
  percent_deviation   REAL NOT NULL,
  within_limit        INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS validation_documents (
  id          TEXT PRIMARY KEY,
  study_id    TEXT NOT NULL REFERENCES validation_studies(id) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  r2_key      TEXT NOT NULL DEFAULT '',
  doc_type    TEXT NOT NULL DEFAULT 'result',
  uploaded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_validation_studies_lab    ON validation_studies(lab_id);
CREATE INDEX IF NOT EXISTS idx_validation_studies_status ON validation_studies(status);
CREATE INDEX IF NOT EXISTS idx_validation_samples_study  ON validation_samples(study_id);
CREATE INDEX IF NOT EXISTS idx_linearity_study           ON linearity_points(study_id);
