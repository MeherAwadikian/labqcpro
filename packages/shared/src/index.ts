// ─── Enums ────────────────────────────────────────────────────────────────────
export type QCLevel = 'normal' | 'abnormal'
export type ViolationSeverity = 'warning' | 'reject'
export type ProductStatus = 'testing' | 'scaling' | 'killed' | 'winner'
export type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'grace'
export type UserRole = 'admin' | 'operator' | 'viewer'

// ─── Auth ─────────────────────────────────────────────────────────────────────
export interface User {
  id: string
  email: string
  lab_id: string
  role: UserRole
  created_at: string
}

export interface Lab {
  id: string
  name: string
  country: string
  created_at: string
}

export interface Subscription {
  id: string
  lab_id: string
  status: SubscriptionStatus
  trial_end: string
  paid_until: string | null
  updated_at: string
}

// ─── Analytes ─────────────────────────────────────────────────────────────────
export interface Analyte {
  id: string
  lab_id: string
  name: string
  unit: string
  method: string
  instrument: string
  amr_lower?: number
  amr_upper?: number
  tea?: number // allowable total error %
  created_at: string
}

export interface ControlStats {
  id: string
  analyte_id: string
  level: QCLevel
  mean: number
  sd: number
  cv: number
  n: number
  calculated_at: string
}

export interface ReferenceRange {
  id: string
  analyte_id: string
  age_group: string
  sex: 'M' | 'F' | 'all'
  lower_limit: number
  upper_limit: number
  source: string
}

// ─── QC Runs ──────────────────────────────────────────────────────────────────
export interface QCRun {
  id: string
  analyte_id: string
  level: QCLevel
  value: number
  run_date: string
  operator: string
  lot_number: string
  created_at: string
}

export interface WestgardViolation {
  id: string
  qc_run_id: string
  rule: WestgardRule
  severity: ViolationSeverity
  created_at: string
}

export type WestgardRule = '1_2s' | '1_3s' | '2_2s' | 'R_4s' | '4_1s' | '10x'

export interface WestgardResult {
  rule: WestgardRule
  severity: ViolationSeverity
  description: string
}

// ─── Manuals ──────────────────────────────────────────────────────────────────
export interface UploadedManual {
  id: string
  lab_id: string
  filename: string
  r2_key: string
  analysis_result: ManualAnalysis | null
  uploaded_at: string
}

export interface ManualAnalysis {
  amr: { parameter: string; lower: number; upper: number; unit: string }[]
  tea: { parameter: string; value: number; unit: string }[]
  cv_limits: { parameter: string; value: number }[]
  carryover_limits: { parameter: string; value: number }[]
  calibration_frequency: string
  qc_frequency: string
  critical_limits: { parameter: string; low?: number; high?: number; unit: string }[]
}

// ─── API response wrappers ────────────────────────────────────────────────────
export interface ApiResponse<T> {
  data?: T
  error?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}
