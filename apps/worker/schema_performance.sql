-- Performance Testing & External QC module schema
-- Run: npx wrangler d1 execute labqcpro-db --remote --file=apps/worker/schema_performance.sql

CREATE TABLE IF NOT EXISTS carryover_studies (
  id TEXT PRIMARY KEY,
  lab_id TEXT NOT NULL,
  analyte_id TEXT REFERENCES analytes(id),
  instrument TEXT NOT NULL,
  operator TEXT NOT NULL,
  study_date TEXT NOT NULL,
  sample_description TEXT,
  h1 REAL, h2 REAL, h3 REAL,
  b1 REAL, b2 REAL, b3 REAL,
  carryover_percent REAL,
  manufacturer_limit REAL NOT NULL,
  passed INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_carryover_lab     ON carryover_studies(lab_id);
CREATE INDEX IF NOT EXISTS idx_carryover_analyte ON carryover_studies(analyte_id);

CREATE TABLE IF NOT EXISTS precision_studies (
  id TEXT PRIMARY KEY,
  lab_id TEXT NOT NULL,
  analyte_id TEXT REFERENCES analytes(id),
  study_name TEXT,
  instrument TEXT NOT NULL,
  operator TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'low',
  study_start_date TEXT NOT NULL,
  manufacturer_cv_within REAL,
  manufacturer_cv_total REAL,
  acceptance_multiplier REAL NOT NULL DEFAULT 1.5,
  status TEXT NOT NULL DEFAULT 'in_progress',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_precision_lab     ON precision_studies(lab_id);
CREATE INDEX IF NOT EXISTS idx_precision_analyte ON precision_studies(analyte_id);

CREATE TABLE IF NOT EXISTS precision_replicates (
  id TEXT PRIMARY KEY,
  study_id TEXT NOT NULL REFERENCES precision_studies(id) ON DELETE CASCADE,
  day_number INTEGER NOT NULL,
  replicate_number INTEGER NOT NULL,
  value REAL,
  run_date TEXT,
  operator TEXT
);
CREATE INDEX IF NOT EXISTS idx_precision_reps ON precision_replicates(study_id);

CREATE TABLE IF NOT EXISTS precision_stats (
  id TEXT PRIMARY KEY,
  study_id TEXT NOT NULL REFERENCES precision_studies(id) ON DELETE CASCADE,
  n INTEGER,
  grand_mean REAL,
  within_run_sd REAL,
  within_run_cv REAL,
  between_run_sd REAL,
  between_run_cv REAL,
  total_sd REAL,
  total_cv REAL,
  manufacturer_cv REAL,
  passed INTEGER,
  calculated_at TEXT
);

CREATE TABLE IF NOT EXISTS pt_events (
  id TEXT PRIMARY KEY,
  lab_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'CAP',
  program_name TEXT NOT NULL,
  event_code TEXT,
  shipment_date TEXT,
  due_date TEXT,
  submission_date TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pt_events_lab ON pt_events(lab_id);

CREATE TABLE IF NOT EXISTS pt_results (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES pt_events(id) ON DELETE CASCADE,
  analyte_id TEXT REFERENCES analytes(id),
  sample_number INTEGER NOT NULL,
  lab_result REAL,
  peer_mean REAL,
  peer_sd REAL,
  sdi_value REAL,
  target_value REAL,
  tea_limit REAL,
  deviation_percent REAL,
  score TEXT DEFAULT 'pending',
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_pt_results_event ON pt_results(event_id);

CREATE TABLE IF NOT EXISTS pt_event_summary (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES pt_events(id) ON DELETE CASCADE,
  analyte_id TEXT REFERENCES analytes(id),
  samples_tested INTEGER DEFAULT 0,
  samples_passed INTEGER DEFAULT 0,
  score_percent REAL,
  overall_pass INTEGER DEFAULT 0,
  consecutive_failures INTEGER DEFAULT 0,
  reviewed_by TEXT,
  reviewed_at TEXT
);

CREATE TABLE IF NOT EXISTS eqc_peer_comparisons (
  id TEXT PRIMARY KEY,
  lab_id TEXT NOT NULL,
  analyte_id TEXT REFERENCES analytes(id),
  program_name TEXT NOT NULL,
  comparison_period TEXT NOT NULL,
  lab_mean REAL,
  peer_mean REAL,
  peer_sd REAL,
  sdi REAL,
  peer_group_n INTEGER,
  percentile_rank REAL,
  bias_from_peer REAL,
  accepted INTEGER DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_eqc_lab     ON eqc_peer_comparisons(lab_id);
CREATE INDEX IF NOT EXISTS idx_eqc_analyte ON eqc_peer_comparisons(analyte_id);

CREATE TABLE IF NOT EXISTS pt_corrective_actions (
  id TEXT PRIMARY KEY,
  event_id TEXT REFERENCES pt_events(id),
  lab_id TEXT NOT NULL,
  root_cause TEXT,
  corrective_action TEXT,
  implemented_by TEXT,
  implementation_date TEXT,
  effectiveness_check_date TEXT,
  resolved INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);
