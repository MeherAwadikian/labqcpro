-- LabQC Pro — D1 Schema
-- Run: wrangler d1 execute labqcpro-db --file=schema.sql

PRAGMA foreign_keys = ON;

-- ─── CORE ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS labs (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  country    TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  lab_id        TEXT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'tech',   -- admin | director | tech | viewer
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id         TEXT PRIMARY KEY,
  lab_id     TEXT NOT NULL UNIQUE REFERENCES labs(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'trial',     -- trial | active | grace | expired
  trial_end  TEXT NOT NULL,
  paid_until TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_records (
  id               TEXT PRIMARY KEY,
  lab_id           TEXT NOT NULL REFERENCES labs(id),
  nowpayments_id   TEXT NOT NULL,
  plan             TEXT NOT NULL,
  amount_usd       REAL NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending',
  created_at       TEXT NOT NULL,
  updated_at       TEXT
);

-- ─── ANALYTES ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS analytes (
  id         TEXT PRIMARY KEY,
  lab_id     TEXT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  unit       TEXT NOT NULL,
  method     TEXT NOT NULL DEFAULT '',
  instrument TEXT NOT NULL DEFAULT '',
  amr_lower  REAL,
  amr_upper  REAL,
  tea        REAL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reference_ranges (
  id          TEXT PRIMARY KEY,
  analyte_id  TEXT NOT NULL REFERENCES analytes(id) ON DELETE CASCADE,
  age_group   TEXT NOT NULL,
  sex         TEXT NOT NULL,
  lower_limit REAL NOT NULL,
  upper_limit REAL NOT NULL,
  source      TEXT NOT NULL DEFAULT 'Lab'
);

-- ─── QC RUNS ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS qc_runs (
  id          TEXT PRIMARY KEY,
  analyte_id  TEXT NOT NULL REFERENCES analytes(id) ON DELETE CASCADE,
  level       TEXT NOT NULL,      -- normal | abnormal
  value       REAL NOT NULL,
  run_date    TEXT NOT NULL,      -- YYYY-MM-DD
  operator    TEXT NOT NULL,
  lot_number  TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS westgard_violations (
  id         TEXT PRIMARY KEY,
  qc_run_id  TEXT NOT NULL REFERENCES qc_runs(id) ON DELETE CASCADE,
  rule       TEXT NOT NULL,
  severity   TEXT NOT NULL,       -- warning | reject
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS control_stats (
  id            TEXT PRIMARY KEY,
  analyte_id    TEXT NOT NULL REFERENCES analytes(id) ON DELETE CASCADE,
  level         TEXT NOT NULL,
  mean          REAL NOT NULL,
  sd            REAL NOT NULL,
  cv            REAL NOT NULL,
  n             INTEGER NOT NULL,
  calculated_at TEXT NOT NULL,
  UNIQUE(analyte_id, level)
);

-- ─── AI / MANUALS ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS uploaded_manuals (
  id          TEXT PRIMARY KEY,
  lab_id      TEXT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  r2_key      TEXT NOT NULL UNIQUE,
  size_bytes  INTEGER NOT NULL,
  uploaded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS manual_analyses (
  id                 TEXT PRIMARY KEY,
  manual_id          TEXT NOT NULL UNIQUE REFERENCES uploaded_manuals(id) ON DELETE CASCADE,
  lab_id             TEXT NOT NULL,
  summary            TEXT NOT NULL,
  extracted_ranges   TEXT NOT NULL DEFAULT '[]',   -- JSON
  key_procedures     TEXT NOT NULL DEFAULT '[]',   -- JSON
  analytes_mentioned TEXT NOT NULL DEFAULT '[]',   -- JSON
  created_at         TEXT NOT NULL
);

-- ─── IQCP: RISK ASSESSMENT ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS iqcp_risk_assessments (
  id               TEXT PRIMARY KEY,
  lab_id           TEXT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  analyte_id       TEXT REFERENCES analytes(id) ON DELETE SET NULL,
  risk_category    TEXT NOT NULL,
  risk_description TEXT NOT NULL,
  likelihood       INTEGER NOT NULL CHECK(likelihood BETWEEN 1 AND 5),
  severity         INTEGER NOT NULL CHECK(severity BETWEEN 1 AND 5),
  risk_score       INTEGER GENERATED ALWAYS AS (likelihood * severity) STORED,
  mitigation       TEXT NOT NULL DEFAULT '',
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

-- ─── IQCP: QC PLANS ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS iqcp_qc_plans (
  id                    TEXT PRIMARY KEY,
  lab_id                TEXT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  analyte_id            TEXT NOT NULL REFERENCES analytes(id) ON DELETE CASCADE,
  qc_frequency          TEXT NOT NULL,    -- per_run | daily | per_shift | weekly
  qc_levels             INTEGER NOT NULL DEFAULT 2,
  acceptance_criteria   TEXT NOT NULL DEFAULT '[]',   -- JSON: Westgard rules
  tea_source            TEXT NOT NULL DEFAULT 'CLIA', -- CLIA | CAP | manufacturer | lab
  tea_value             REAL,
  corrective_action_plan TEXT NOT NULL DEFAULT '',
  review_cycle          INTEGER NOT NULL DEFAULT 12,  -- months
  review_date           TEXT NOT NULL,
  approved_by           TEXT,
  approval_date         TEXT,
  status                TEXT NOT NULL DEFAULT 'draft', -- draft | active | review
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  UNIQUE(lab_id, analyte_id)
);

-- ─── REAGENT LOTS ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reagent_lots (
  id                      TEXT PRIMARY KEY,
  lab_id                  TEXT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  analyte_id              TEXT REFERENCES analytes(id) ON DELETE SET NULL,
  reagent_name            TEXT NOT NULL,
  manufacturer            TEXT NOT NULL,
  lot_number              TEXT NOT NULL,
  received_date           TEXT NOT NULL,
  open_date               TEXT,
  expiry_date             TEXT NOT NULL,
  extended_expiry_date    TEXT,
  extension_justification TEXT,
  extension_approved_by   TEXT,
  status                  TEXT NOT NULL DEFAULT 'active', -- active | expired | extended | quarantine
  verification_status     TEXT NOT NULL DEFAULT 'pending', -- pending | passed | failed
  created_at              TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reagent_verification_results (
  id                  TEXT PRIMARY KEY,
  reagent_lot_id      TEXT NOT NULL REFERENCES reagent_lots(id) ON DELETE CASCADE,
  test_performed      TEXT NOT NULL,
  result_value        REAL NOT NULL,
  acceptance_criteria TEXT NOT NULL,
  passed              INTEGER NOT NULL DEFAULT 0,
  tested_by           TEXT NOT NULL,
  tested_at           TEXT NOT NULL,
  notes               TEXT NOT NULL DEFAULT ''
);

-- ─── CALIBRATOR LOTS ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS calibrator_lots (
  id                    TEXT PRIMARY KEY,
  lab_id                TEXT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  analyte_id            TEXT REFERENCES analytes(id) ON DELETE SET NULL,
  calibrator_name       TEXT NOT NULL,
  manufacturer          TEXT NOT NULL,
  lot_number            TEXT NOT NULL,
  received_date         TEXT NOT NULL,
  open_date             TEXT,
  expiry_date           TEXT NOT NULL,
  open_stability_days   INTEGER,
  traceability_statement TEXT NOT NULL DEFAULT '',
  si_unit_traceable     INTEGER NOT NULL DEFAULT 0,
  r2_key_coa            TEXT,         -- R2 key for Certificate of Analysis
  verification_status   TEXT NOT NULL DEFAULT 'pending',
  status                TEXT NOT NULL DEFAULT 'active',
  created_at            TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS calibrator_verification_results (
  id                  TEXT PRIMARY KEY,
  calibrator_lot_id   TEXT NOT NULL REFERENCES calibrator_lots(id) ON DELETE CASCADE,
  analyte_id          TEXT NOT NULL REFERENCES analytes(id),
  expected_value      REAL NOT NULL,
  obtained_value      REAL NOT NULL,
  percent_difference  REAL NOT NULL,
  acceptance_limit    REAL NOT NULL DEFAULT 5.0,
  passed              INTEGER NOT NULL DEFAULT 0,
  verified_by         TEXT NOT NULL,
  verified_at         TEXT NOT NULL
);

-- ─── EXPIRED REAGENT EXTENSIONS ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS expired_reagent_extensions (
  id                    TEXT PRIMARY KEY,
  reagent_lot_id        TEXT NOT NULL REFERENCES reagent_lots(id),
  original_expiry       TEXT NOT NULL,
  requested_extension_date TEXT NOT NULL,
  justification         TEXT NOT NULL,
  supporting_data       TEXT NOT NULL DEFAULT '',
  regulatory_basis      TEXT NOT NULL DEFAULT '',
  approved_by           TEXT,
  approval_date         TEXT,
  status                TEXT NOT NULL DEFAULT 'pending', -- pending | approved | denied
  created_at            TEXT NOT NULL
);

-- ─── CAP STANDARDS LIBRARY ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cap_standards_library (
  id               TEXT PRIMARY KEY,
  cap_question_id  TEXT NOT NULL UNIQUE,
  section          TEXT NOT NULL,   -- GEN | COM | HEM | MIC | URN
  subsection       TEXT NOT NULL DEFAULT '',
  requirement_text TEXT NOT NULL,
  applicable_tests TEXT NOT NULL DEFAULT '[]',   -- JSON
  clia_reference   TEXT NOT NULL DEFAULT '',
  last_updated     TEXT NOT NULL,
  source_version   TEXT NOT NULL DEFAULT '2024'
);

-- ─── CAP CHECKLIST (per lab) ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cap_checklist_items (
  id                TEXT PRIMARY KEY,
  lab_id            TEXT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  analyte_id        TEXT REFERENCES analytes(id) ON DELETE SET NULL,
  cap_question_id   TEXT NOT NULL REFERENCES cap_standards_library(cap_question_id),
  compliance_status TEXT NOT NULL DEFAULT 'pending', -- compliant | non-compliant | na | pending
  evidence          TEXT NOT NULL DEFAULT '',
  deficiency_note   TEXT NOT NULL DEFAULT '',
  corrected_at      TEXT,
  inspector_note    TEXT NOT NULL DEFAULT '',
  last_reviewed     TEXT,
  r2_evidence_key   TEXT,   -- R2 key for attached evidence PDF
  created_at        TEXT NOT NULL,
  UNIQUE(lab_id, cap_question_id)
);

-- ─── IQCP AI UPDATES ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS iqcp_ai_updates (
  id                TEXT PRIMARY KEY,
  lab_id            TEXT,    -- NULL = global update
  update_type       TEXT NOT NULL,   -- regulatory | cap | clia | clsi | iqcp
  summary           TEXT NOT NULL,
  full_content      TEXT NOT NULL,
  source_references TEXT NOT NULL DEFAULT '[]',   -- JSON
  generated_at      TEXT NOT NULL,
  applied           INTEGER NOT NULL DEFAULT 0
);

-- ─── COMPLIANCE ALERTS ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS compliance_alerts (
  id          TEXT PRIMARY KEY,
  lab_id      TEXT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  alert_type  TEXT NOT NULL,
  severity    TEXT NOT NULL DEFAULT 'major',  -- critical | major | minor
  description TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  due_date    TEXT,
  resolved_at TEXT,
  created_at  TEXT NOT NULL
);

-- ─── INDEXES ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_qc_runs_analyte_level   ON qc_runs(analyte_id, level);
CREATE INDEX IF NOT EXISTS idx_qc_runs_run_date        ON qc_runs(run_date);
CREATE INDEX IF NOT EXISTS idx_violations_qc_run       ON westgard_violations(qc_run_id);
CREATE INDEX IF NOT EXISTS idx_analytes_lab            ON analytes(lab_id);
CREATE INDEX IF NOT EXISTS idx_reagent_lots_lab        ON reagent_lots(lab_id);
CREATE INDEX IF NOT EXISTS idx_calibrator_lots_lab     ON calibrator_lots(lab_id);
CREATE INDEX IF NOT EXISTS idx_cap_checklist_lab       ON cap_checklist_items(lab_id);
CREATE INDEX IF NOT EXISTS idx_compliance_alerts_lab   ON compliance_alerts(lab_id);
CREATE INDEX IF NOT EXISTS idx_iqcp_risk_lab           ON iqcp_risk_assessments(lab_id);
CREATE INDEX IF NOT EXISTS idx_iqcp_plans_lab          ON iqcp_qc_plans(lab_id);
