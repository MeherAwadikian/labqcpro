-- CAP Standards Library Seed Data
-- Run after schema.sql: wrangler d1 execute labqcpro-db --file=schema_seed.sql

INSERT OR IGNORE INTO cap_standards_library (id, cap_question_id, section, subsection, requirement_text, applicable_tests, clia_reference, last_updated, source_version) VALUES

-- GEN: General
('csl-1',  'GEN.20316', 'GEN', 'QC Documentation',    'QC frequency is documented for each test system and meets minimum CLIA requirements', '["all"]', '42 CFR 493.1256', '2024-01-01', '2024'),
('csl-2',  'GEN.20320', 'GEN', 'QC Review',           'QC records are reviewed by the laboratory director at defined intervals', '["all"]', '42 CFR 493.1407', '2024-01-01', '2024'),
('csl-3',  'GEN.41096', 'GEN', 'Reagent Labeling',    'All reagents, calibrators, and controls are properly labeled with lot number and expiration date', '["all"]', '42 CFR 493.1252', '2024-01-01', '2024'),
('csl-4',  'GEN.41302', 'GEN', 'Calibration Traceability', 'Calibration is traceable to reference materials or defined reference methods', '["all"]', '42 CFR 493.1255', '2024-01-01', '2024'),
('csl-5',  'GEN.55500', 'GEN', 'Proficiency Testing', 'Laboratory participates in an approved PT program for all regulated analytes', '["all"]', '42 CFR 493.801', '2024-01-01', '2024'),
('csl-6',  'GEN.62000', 'GEN', 'Personnel Competency', 'Personnel competency is assessed at least annually for each procedure performed', '["all"]', '42 CFR 493.1451', '2024-01-01', '2024'),
('csl-7',  'GEN.72730', 'GEN', 'IQCP Documentation',  'IQCP includes a risk assessment, QC plan, and quality assessment component', '["all"]', '42 CFR 493.1256(d)', '2024-01-01', '2024'),

-- COM: Chemistry
('csl-8',  'COM.01300', 'COM', 'Reagent Verification', 'New reagent lots are verified before or concurrent with being placed in service', '["chemistry","hematology"]', '42 CFR 493.1252', '2024-01-01', '2024'),
('csl-9',  'COM.01600', 'COM', 'AMR Verification',    'The analytical measurement range (AMR) is verified at least every 6 months and when reagent lots change', '["chemistry"]', '42 CFR 493.1253', '2024-01-01', '2024'),
('csl-10', 'COM.01700', 'COM', 'Linearity',           'Linearity/AMR verification is performed using at least 5 concentrations spanning the full range', '["chemistry"]', '42 CFR 493.1253', '2024-01-01', '2024'),
('csl-11', 'COM.30000', 'COM', 'Reference Intervals', 'Reference intervals are verified or established for each patient population', '["chemistry","hematology"]', '42 CFR 493.1253', '2024-01-01', '2024'),
('csl-12', 'COM.30250', 'COM', 'Critical Values',     'Critical values are defined and a policy exists for timely notification', '["chemistry","hematology"]', '42 CFR 493.1291', '2024-01-01', '2024'),
('csl-13', 'COM.40400', 'COM', 'Method Comparison',   'Method comparison is performed when a new instrument/method is introduced', '["chemistry"]', '42 CFR 493.1253', '2024-01-01', '2024'),

-- HEM: Hematology
('csl-14', 'HEM.01000', 'HEM', 'CBC QC',              'CBC analyzers run at least 2 levels of QC each day of testing', '["cbc","hematology"]', '42 CFR 493.1256', '2024-01-01', '2024'),
('csl-15', 'HEM.01550', 'HEM', 'Differential QC',     'Differential QC is performed using at least one level of control each day of testing', '["differential"]', '42 CFR 493.1256', '2024-01-01', '2024'),
('csl-16', 'HEM.02000', 'HEM', 'Coagulation QC',      'Coagulation instruments run 2 levels of QC each day of PT/INR testing', '["coagulation","pt","inr","aptt"]', '42 CFR 493.1256', '2024-01-01', '2024'),
('csl-17', 'HEM.24900', 'HEM', 'Hematology Critical Values', 'Critical values for platelets (<50,000 and >1,000,000) and hemoglobin (<7.0 and >20.0) are defined', '["cbc","platelet","hemoglobin"]', '42 CFR 493.1291', '2024-01-01', '2024'),

-- MIC: Microbiology
('csl-18', 'MIC.11000', 'MIC', 'Organism Stock Controls', 'Stock organism cultures are properly maintained and subcultured per defined schedule', '["microbiology","culture"]', '42 CFR 493.1256', '2024-01-01', '2024'),
('csl-19', 'MIC.21950', 'MIC', 'Susceptibility QC',   'Antimicrobial susceptibility testing uses ATCC reference strains as QC', '["susceptibility","ast"]', '42 CFR 493.1256', '2024-01-01', '2024'),

-- URN: Urinalysis
('csl-20', 'URN.11000', 'URN', 'Dipstick QC',         'Urine dipstick analyzer QC is performed each day of testing using positive and negative controls', '["urinalysis","dipstick"]', '42 CFR 493.1256', '2024-01-01', '2024'),
('csl-21', 'URN.28000', 'URN', 'Microscopy QC',       'Urine microscopy has a defined QC protocol when performed', '["urinalysis","microscopy"]', '42 CFR 493.1256', '2024-01-01', '2024');
