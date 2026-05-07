-- Reference Interval Study Tables
-- Run: wrangler d1 execute labqcpro-db --remote --file=apps/worker/schema_ri_studies.sql

CREATE TABLE IF NOT EXISTS ri_direct_studies (
  id TEXT PRIMARY KEY,
  lab_id TEXT NOT NULL,
  analyte_name TEXT NOT NULL,
  population_group TEXT DEFAULT 'adult',
  sex TEXT DEFAULT 'both',
  age_min REAL,
  age_max REAL,
  sample_type TEXT DEFAULT 'serum',
  unit TEXT NOT NULL,
  method TEXT DEFAULT '',
  instrument TEXT DEFAULT '',
  n_subjects INTEGER DEFAULT 0,
  lower_limit REAL,
  upper_limit REAL,
  lower_ci_lo REAL,
  lower_ci_hi REAL,
  upper_ci_lo REAL,
  upper_ci_hi REAL,
  mean_val REAL,
  sd_val REAL,
  cv_pct REAL,
  median_val REAL,
  skewness REAL,
  distribution_type TEXT DEFAULT 'unknown',
  method_used TEXT DEFAULT '',
  outliers_removed INTEGER DEFAULT 0,
  status TEXT DEFAULT 'in_progress',
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ri_study_data (
  id TEXT PRIMARY KEY,
  study_id TEXT NOT NULL REFERENCES ri_direct_studies(id) ON DELETE CASCADE,
  lab_id TEXT NOT NULL,
  value REAL NOT NULL,
  excluded INTEGER DEFAULT 0,
  exclude_reason TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ri_transference_studies (
  id TEXT PRIMARY KEY,
  lab_id TEXT NOT NULL,
  analyte_name TEXT NOT NULL,
  source_name TEXT NOT NULL,
  lower_limit REAL NOT NULL,
  upper_limit REAL NOT NULL,
  unit TEXT NOT NULL,
  sample_type TEXT DEFAULT 'serum',
  n_samples INTEGER DEFAULT 0,
  n_within INTEGER DEFAULT 0,
  pct_within REAL,
  result TEXT DEFAULT 'pending',
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ri_transference_samples (
  id TEXT PRIMARY KEY,
  study_id TEXT NOT NULL REFERENCES ri_transference_studies(id) ON DELETE CASCADE,
  lab_id TEXT NOT NULL,
  sample_number INTEGER NOT NULL,
  measured_value REAL NOT NULL,
  within_ri INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ri_direct_lab ON ri_direct_studies(lab_id);
CREATE INDEX IF NOT EXISTS idx_ri_data_study ON ri_study_data(study_id);
CREATE INDEX IF NOT EXISTS idx_ri_trans_lab ON ri_transference_studies(lab_id);
CREATE INDEX IF NOT EXISTS idx_ri_trans_samples ON ri_transference_samples(study_id);
