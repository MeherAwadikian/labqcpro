-- Reference Interval Published Library
-- Run: wrangler d1 execute labqcpro-db --remote --file=apps/worker/schema_ri_library.sql

CREATE TABLE IF NOT EXISTS ri_published_library (
  id TEXT PRIMARY KEY,
  analyte_name TEXT NOT NULL,
  analyte_aliases TEXT DEFAULT '',
  population_group TEXT NOT NULL DEFAULT 'adult',
  age_min REAL,
  age_max REAL,
  sex TEXT DEFAULT 'both',
  lower_limit REAL,
  upper_limit REAL,
  unit TEXT NOT NULL,
  percentile_used TEXT DEFAULT '95',
  one_sided INTEGER DEFAULT 0,
  source_name TEXT NOT NULL,
  source_type TEXT DEFAULT 'guideline',
  publication_year INTEGER,
  doi_or_url TEXT DEFAULT '',
  free_access INTEGER DEFAULT 1,
  instrument_platform TEXT DEFAULT '',
  method TEXT DEFAULT '',
  fasting_required INTEGER DEFAULT 2,
  sample_type TEXT DEFAULT 'serum',
  notes TEXT DEFAULT '',
  partition_notes TEXT DEFAULT '',
  region TEXT DEFAULT 'global'
);

CREATE TABLE IF NOT EXISTS lab_ri_library (
  id TEXT PRIMARY KEY,
  lab_id TEXT NOT NULL,
  ri_library_id TEXT NOT NULL,
  saved_at TEXT NOT NULL,
  UNIQUE(lab_id, ri_library_id)
);

CREATE INDEX IF NOT EXISTS idx_ri_lib_analyte ON ri_published_library(analyte_name);
CREATE INDEX IF NOT EXISTS idx_ri_lib_pop ON ri_published_library(population_group);
CREATE INDEX IF NOT EXISTS idx_lab_ri ON lab_ri_library(lab_id);

-- fasting_required: 0=No  1=Yes  2=Not specified
-- sample_type: whole_blood | serum | plasma | urine | csf | other
-- one_sided: 0=two-sided  1=one-sided (upper limit only or lower limit only)

-- ─── CBC ─────────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO ri_published_library VALUES
('ri-hgb-m','Hemoglobin','Hgb,Hb,HGB','adult',18,null,'male',13.0,17.5,'g/dL','95',0,'WHO Laboratory Manual 5th Edition','guideline',2011,'https://www.who.int/reproductivehealth/publications/infertility/9789241548120/en/',1,'','',0,'whole_blood','Values may vary ±5% by analyzer. High altitude increases values ~1 g/dL per 1000 m above 1500 m.','Sex partitioning required.','global'),
('ri-hgb-f','Hemoglobin','Hgb,Hb,HGB','adult',18,null,'female',12.0,15.5,'g/dL','95',0,'WHO Laboratory Manual 5th Edition','guideline',2011,'https://www.who.int/reproductivehealth/publications/infertility/9789241548120/en/',1,'','',0,'whole_blood','Pregnant: WHO defines anemia <11.0 g/dL. Postmenopausal: same range as adult female.','Sex partitioning required.','global'),
('ri-hgb-neo0','Hemoglobin','Hgb,Hb,HGB','neonatal',0,0.003,'both',14.0,24.0,'g/dL','95',0,'Harriet Lane Handbook 22nd Ed','consensus',2020,'https://pubmed.ncbi.nlm.nih.gov/',1,'','',0,'whole_blood','Day 0-1 cord/capillary blood. Very high at birth due to fetal hemoglobin. Rapid decline in first weeks.','Age partitioning critical in neonates.','global'),
('ri-hgb-neo7','Hemoglobin','Hgb,Hb,HGB','neonatal',0.003,0.02,'both',13.5,21.0,'g/dL','95',0,'Harriet Lane Handbook','consensus',2020,'https://pubmed.ncbi.nlm.nih.gov/',1,'','',0,'whole_blood','Days 1-7.','Age partitioning critical.','global'),
('ri-hgb-inf3','Hemoglobin','Hgb,Hb,HGB','pediatric',0.08,0.25,'both',9.5,13.5,'g/dL','95',0,'Harriet Lane Handbook','consensus',2020,'https://pubmed.ncbi.nlm.nih.gov/',1,'','',0,'whole_blood','1-3 months. Physiological nadir of hemoglobin.','Age partitioning critical.','global'),
('ri-hgb-ch26','Hemoglobin','Hgb,Hb,HGB','pediatric',1,6,'both',11.0,14.0,'g/dL','95',0,'WHO / CDC NHANES','guideline',2014,'https://www.cdc.gov/nchs/nhanes/',1,'','',0,'whole_blood','Ages 1-6 years.','Age partitioning required.','global'),
('ri-hgb-ch12','Hemoglobin','Hgb,Hb,HGB','pediatric',6,12,'both',11.5,15.0,'g/dL','95',0,'CDC NHANES','study',2014,'https://www.cdc.gov/nchs/nhanes/',1,'','',0,'whole_blood','Ages 6-12 years.','Age partitioning required.','USA'),
('ri-hgb-tm','Hemoglobin','Hgb,Hb,HGB','pediatric',12,18,'male',13.0,17.0,'g/dL','95',0,'CDC NHANES','study',2014,'https://www.cdc.gov/nchs/nhanes/',1,'','',0,'whole_blood','Ages 12-18 years male.','Age and sex partitioning required.','USA'),
('ri-hgb-tf','Hemoglobin','Hgb,Hb,HGB','pediatric',12,18,'female',12.0,16.0,'g/dL','95',0,'CDC NHANES','study',2014,'https://www.cdc.gov/nchs/nhanes/',1,'','',0,'whole_blood','Ages 12-18 years female.','Age and sex partitioning required.','USA');

INSERT OR IGNORE INTO ri_published_library VALUES
('ri-hct-m','Hematocrit','HCT,PCV,Packed Cell Volume','adult',18,null,'male',39.0,50.0,'%','95',0,'WHO Laboratory Manual 5th Edition','guideline',2011,'https://www.who.int/reproductivehealth/publications/infertility/9789241548120/en/',1,'','',0,'whole_blood','Varies with hydration and altitude.','Sex partitioning required.','global'),
('ri-hct-f','Hematocrit','HCT,PCV,Packed Cell Volume','adult',18,null,'female',35.0,47.0,'%','95',0,'WHO Laboratory Manual 5th Edition','guideline',2011,'https://www.who.int/reproductivehealth/publications/infertility/9789241548120/en/',1,'','',0,'whole_blood','','Sex partitioning required.','global');

INSERT OR IGNORE INTO ri_published_library VALUES
('ri-wbc','White Blood Cell Count','WBC,Leukocyte Count,WCC','adult',18,null,'both',4.0,11.0,'×10⁹/L','95',0,'WHO / NHANES / CLSI','consensus',2016,'https://www.cdc.gov/nchs/nhanes/',1,'','',0,'whole_blood','Blacks/African Americans average ~0.5×10⁹/L lower (benign ethnic neutropenia). Smokers may have higher WBC.','Consider ethnic partitioning.','global'),
('ri-wbc-ch','White Blood Cell Count','WBC,Leukocyte Count,WCC','pediatric',1,6,'both',6.0,17.0,'×10⁹/L','95',0,'Harriet Lane Handbook','consensus',2020,'https://pubmed.ncbi.nlm.nih.gov/',1,'','',0,'whole_blood','Ages 1-6 years. Wide variation with age.','Age partitioning required.','global');

INSERT OR IGNORE INTO ri_published_library VALUES
('ri-plt','Platelet Count','PLT,Thrombocytes','adult',18,null,'both',150.0,400.0,'×10⁹/L','95',0,'WHO / ICSH Guidelines','guideline',2014,'https://pubmed.ncbi.nlm.nih.gov/24283902/',1,'','',0,'whole_blood','Females ~10×10⁹/L higher than males on average. EDTA-dependent pseudothrombocytopenia possible — confirm with citrate tube.','Minor sex partitioning may be applied.','global'),
('ri-plt-neo','Platelet Count','PLT,Thrombocytes','neonatal',0,0.08,'both',150.0,400.0,'×10⁹/L','95',0,'Christensen Neonatal Reference Ranges','study',2009,'https://pubmed.ncbi.nlm.nih.gov/19576740/',1,'','',0,'whole_blood','<150 warrants evaluation in neonates.','','global');

INSERT OR IGNORE INTO ri_published_library VALUES
('ri-mcv','Mean Corpuscular Volume','MCV','adult',18,null,'both',80.0,100.0,'fL','95',0,'CLSI EP28-A3c / Manufacturer Inserts','consensus',2010,'https://clsi.org/standards/products/method-evaluation/documents/ep28/',0,'','',0,'whole_blood','<80 microcytic (iron def, thalassemia, chronic disease). >100 macrocytic (B12, folate, liver, alcohol).','','global'),
('ri-mch','Mean Corpuscular Hemoglobin','MCH','adult',18,null,'both',27.0,33.0,'pg','95',0,'CLSI / Manufacturer Inserts','consensus',2010,'https://clsi.org/',0,'','',0,'whole_blood','Highly correlated with MCV.','','global'),
('ri-mchc','Mean Corpuscular Hemoglobin Concentration','MCHC','adult',18,null,'both',32.0,36.0,'g/dL','95',0,'CLSI / Manufacturer Inserts','consensus',2010,'https://clsi.org/',0,'','',0,'whole_blood','MCHC >36.5: spherocytosis or machine error. Elevation may indicate hemolysis in sample.','','global'),
('ri-rdw','Red Cell Distribution Width','RDW,RDW-CV','adult',18,null,'both',11.5,14.5,'%','95',0,'CLSI / Manufacturer Inserts','consensus',2010,'https://clsi.org/',0,'','',0,'whole_blood','RDW >14.5: anisocytosis. Distinguishes iron deficiency (high RDW) from thalassemia trait (normal RDW).','','global');

INSERT OR IGNORE INTO ri_published_library VALUES
('ri-neut-abs','Neutrophils','ANC,Neutrophil Count,PMN,Segs','adult',18,null,'both',1.8,7.5,'×10⁹/L','95',0,'CLSI / Hematology Consensus','consensus',2018,'https://pubmed.ncbi.nlm.nih.gov/',1,'','',0,'whole_blood','ANC <1.5: neutropenia. ANC <0.5: severe neutropenia. Benign ethnic neutropenia: lower limit ~1.0 in some African/Middle Eastern populations.','Ethnic partitioning may be appropriate.','global'),
('ri-neut-pct','Neutrophils %','Neutrophil %,Segs %,NEUT%','adult',18,null,'both',50.0,70.0,'%','95',0,'CLSI / Hematology Consensus','consensus',2018,'https://pubmed.ncbi.nlm.nih.gov/',1,'','',0,'whole_blood','','','global'),
('ri-lymph-abs','Lymphocytes','Lymphocyte Count,Lymphs','adult',18,null,'both',1.0,4.8,'×10⁹/L','95',0,'CLSI / Hematology Consensus','consensus',2018,'https://pubmed.ncbi.nlm.nih.gov/',1,'','',0,'whole_blood','Lymphocytosis >4.8: viral infection, CLL. Lymphopenia <1.0: HIV, steroids, autoimmune.','','global'),
('ri-lymph-pct','Lymphocytes %','Lymphocyte %,Lymphs %,LYMPH%','adult',18,null,'both',20.0,40.0,'%','95',0,'CLSI / Hematology Consensus','consensus',2018,'https://pubmed.ncbi.nlm.nih.gov/',1,'','',0,'whole_blood','','','global'),
('ri-mono','Monocytes','Monocyte Count,MONO','adult',18,null,'both',0.2,0.8,'×10⁹/L','95',0,'CLSI / Hematology Consensus','consensus',2018,'https://pubmed.ncbi.nlm.nih.gov/',1,'','',0,'whole_blood','','','global'),
('ri-eos','Eosinophils','Eosinophil Count,Eos,EOS','adult',18,null,'both',0.0,0.5,'×10⁹/L','95',0,'CLSI / Hematology Consensus','consensus',2018,'https://pubmed.ncbi.nlm.nih.gov/',1,'','',0,'whole_blood','Eosinophilia >0.5: allergies, parasites, drug reactions, eosinophilic disorders.','','global'),
('ri-baso','Basophils','Basophil Count,Basos,BASO','adult',18,null,'both',0.0,0.1,'×10⁹/L','95',0,'CLSI / Hematology Consensus','consensus',2018,'https://pubmed.ncbi.nlm.nih.gov/',1,'','',0,'whole_blood','Basophilia >0.1: CML, polycythemia vera, myeloproliferative disorders.','','global');

-- ─── Electrolytes ────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO ri_published_library VALUES
('ri-na','Sodium','Na+,Serum Sodium','adult',18,null,'both',136.0,145.0,'mEq/L','95',0,'NHANES 2017-2020','study',2022,'https://www.cdc.gov/nchs/nhanes/',1,'','',0,'serum','Pseudohyponatremia with extreme hyperlipidemia or hyperproteinemia (indirect ISE). Hemolysis minimally affects sodium.','','USA'),
('ri-k','Potassium','K+,Serum Potassium','adult',18,null,'both',3.5,5.0,'mEq/L','95',0,'NHANES 2017-2020','study',2022,'https://www.cdc.gov/nchs/nhanes/',1,'','',0,'serum','Hemolysis causes false elevation. Serum ~0.3 mEq/L higher than plasma (platelet release). Tourniquet >1 min increases K+.','Serum vs plasma difference clinically significant.','USA'),
('ri-cl','Chloride','Cl-,Serum Chloride','adult',18,null,'both',98.0,107.0,'mEq/L','95',0,'NHANES 2017-2020','study',2022,'https://www.cdc.gov/nchs/nhanes/',1,'','',0,'serum','','','USA'),
('ri-bicarb','Bicarbonate','HCO3-,CO2 Content,Serum Bicarb','adult',18,null,'both',22.0,29.0,'mEq/L','95',0,'NHANES 2017-2020','study',2022,'https://www.cdc.gov/nchs/nhanes/',1,'','',0,'serum','Measured as total CO2 on most analyzers. Decreases with prolonged air exposure. ABG provides direct bicarbonate measurement.','','USA');

-- ─── Glucose & Metabolic ─────────────────────────────────────────────────────

INSERT OR IGNORE INTO ri_published_library VALUES
('ri-glu','Glucose','Blood Glucose,FBG,FPG,Fasting Glucose','adult',18,null,'both',70.0,99.0,'mg/dL','95',0,'ADA Standards of Medical Care 2024','guideline',2024,'https://diabetesjournals.org/care/issue/47/Supplement_1',1,'','enzymatic',1,'serum','ADA: <100 normal, 100-125 prediabetes, ≥126 diabetes (×2). 8+ hour fast required. Fluoride tube preferred for stability.','Fasting required.','global'),
('ri-glu-mmol','Glucose','Blood Glucose,FBG,FPG','adult',18,null,'both',3.9,5.5,'mmol/L','95',0,'WHO Diabetes Diagnostic Criteria 2023','guideline',2023,'https://www.who.int/publications/i/item/9789241548786',1,'','enzymatic',1,'serum','WHO: <6.1 mmol/L normal, 6.1-6.9 IFG, ≥7.0 diabetes.','','global'),
('ri-hba1c','Hemoglobin A1c','HbA1c,A1C,Glycated Hemoglobin,Glycohemoglobin','adult',18,null,'both',null,5.7,'%','95',1,'ADA Standards of Medical Care 2024','guideline',2024,'https://diabetesjournals.org/care/issue/47/Supplement_1',1,'','HPLC,immunoassay',2,'whole_blood','ADA: <5.7% normal, 5.7-6.4% prediabetes, ≥6.5% diabetes. IFCC-standardized methods recommended. Interference: hemoglobin variants, hemolytic anemia.','Standardization to IFCC/NGSP critical.','global');

-- ─── Renal ───────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO ri_published_library VALUES
('ri-creat-m','Creatinine','SCr,Serum Creatinine,Cr','adult',18,null,'male',0.74,1.35,'mg/dL','95',0,'NHANES / CKD-EPI Consortium','study',2021,'https://www.cdc.gov/nchs/nhanes/',1,'','enzymatic',0,'serum','⚠️ Method matters: enzymatic vs Jaffe differ by ~0.1-0.2 mg/dL. Jaffe has ketone interference. Use enzymatic for AKI staging per KDIGO. Values represent enzymatic method.','Sex partitioning required.','USA'),
('ri-creat-f','Creatinine','SCr,Serum Creatinine,Cr','adult',18,null,'female',0.59,1.04,'mg/dL','95',0,'NHANES / CKD-EPI Consortium','study',2021,'https://www.cdc.gov/nchs/nhanes/',1,'','enzymatic',0,'serum','Lower due to less muscle mass. Pregnancy lowers creatinine further (~0.4-0.8 mg/dL). Elderly: low muscle mass may mask reduced GFR.','Sex partitioning required.','USA'),
('ri-creat-ch','Creatinine','SCr,Serum Creatinine,Cr','pediatric',1,12,'both',0.3,0.7,'mg/dL','95',0,'NHANES Pediatric / Schwartz Reference Data','study',2012,'https://pubmed.ncbi.nlm.nih.gov/',1,'','enzymatic',0,'serum','Wide variation by age and body size. Use Schwartz formula for eGFR in children.','Age partitioning essential.','USA'),
('ri-bun','Blood Urea Nitrogen','BUN,Urea Nitrogen','adult',18,null,'both',7.0,25.0,'mg/dL','95',0,'NHANES 2017-2020','study',2022,'https://www.cdc.gov/nchs/nhanes/',1,'','',0,'serum','BUN/Cr ratio >20 suggests pre-renal azotemia. BUN affected by protein intake and catabolism.','','USA'),
('ri-urea','Urea','Blood Urea,Urea Nitrogen,BUN','adult',18,null,'both',2.5,8.9,'mmol/L','95',0,'UK/EU Clinical Chemistry Reference Ranges','consensus',2020,'https://pubmed.ncbi.nlm.nih.gov/',1,'','',0,'serum','UK/EU units. BUN (mg/dL) × 0.357 = Urea (mmol/L).','','EU'),
('ri-uric-m','Uric Acid','Urate,Serum Uric Acid','adult',18,null,'male',3.4,7.0,'mg/dL','95',0,'NHANES 2017-2020 / ACR Gout Guidelines','study',2020,'https://www.cdc.gov/nchs/nhanes/',1,'','enzymatic',0,'serum','Gout treatment target <6.0 mg/dL. Increases with age, BMI, renal disease, diuretics, alcohol.','Sex partitioning required.','USA'),
('ri-uric-f','Uric Acid','Urate,Serum Uric Acid','adult',18,null,'female',2.4,6.0,'mg/dL','95',0,'NHANES 2017-2020 / ACR Gout Guidelines','study',2020,'https://www.cdc.gov/nchs/nhanes/',1,'','enzymatic',0,'serum','Estrogen promotes urate excretion; values increase post-menopause.','Sex partitioning required. Post-menopause approaches male range.','USA');

-- ─── Liver Function Tests ─────────────────────────────────────────────────────

INSERT OR IGNORE INTO ri_published_library VALUES
('ri-alt-m','Alanine Aminotransferase','ALT,SGPT,Alanine Transaminase','adult',18,null,'male',null,45.0,'U/L','95',1,'AASLD / NHANES 2017-2020','guideline',2019,'https://www.cdc.gov/nchs/nhanes/',1,'','',0,'serum','AASLD recommends lower cutoffs: male <33, female <25 U/L for NAFLD screening (Prati 2002). BMI and ethnicity affect ALT.','Sex partitioning required. Lower cutoffs proposed for metabolic disease screening.','USA'),
('ri-alt-f','Alanine Aminotransferase','ALT,SGPT,Alanine Transaminase','adult',18,null,'female',null,35.0,'U/L','95',1,'AASLD / NHANES 2017-2020','guideline',2019,'https://www.cdc.gov/nchs/nhanes/',1,'','',0,'serum','One-sided upper limit. Oral contraceptives may modestly lower ALT.','Sex partitioning required.','USA'),
('ri-ast','Aspartate Aminotransferase','AST,SGOT,Aspartate Transaminase','adult',18,null,'both',10.0,40.0,'U/L','95',0,'NHANES / Clinical Chemistry','study',2022,'https://www.cdc.gov/nchs/nhanes/',1,'','',0,'serum','AST/ALT >2 suggests alcoholic liver disease. Also elevated in cardiac and muscle disease — less liver-specific than ALT.','','USA'),
('ri-alp','Alkaline Phosphatase','ALP,Alk Phos','adult',18,null,'both',44.0,147.0,'U/L','95',0,'NHANES / IFCC Harmonized Reference Ranges','consensus',2022,'https://www.cdc.gov/nchs/nhanes/',1,'','',0,'serum','📌 CLSI recommends age + sex partitioning. Pediatric values are 3-5× adult during growth. Pregnancy increases ALP (placental isoenzyme). Blood group B/O: intestinal isoenzyme contribution.','Age and sex partitioning strongly recommended.','global'),
('ri-alp-ped','Alkaline Phosphatase','ALP,Alk Phos','pediatric',1,12,'both',100.0,400.0,'U/L','95',0,'CALIPER Pediatric Reference Intervals','study',2012,'https://pubmed.ncbi.nlm.nih.gov/22326820/',1,'','',0,'serum','CALIPER study. Values 3-5× adult during rapid growth. Highly age-dependent.','Instrument-specific pediatric RIs strongly recommended.','global'),
('ri-alp-tm','Alkaline Phosphatase','ALP,Alk Phos','pediatric',12,18,'male',90.0,420.0,'U/L','95',0,'CALIPER Pediatric Reference Intervals','study',2012,'https://pubmed.ncbi.nlm.nih.gov/22326820/',1,'','',0,'serum','Peak ALP during pubertal bone growth. Males peak 12-15 years.','Age and sex partitioning required.','global'),
('ri-alp-tf','Alkaline Phosphatase','ALP,Alk Phos','pediatric',12,18,'female',35.0,280.0,'U/L','95',0,'CALIPER Pediatric Reference Intervals','study',2012,'https://pubmed.ncbi.nlm.nih.gov/22326820/',1,'','',0,'serum','Females peak earlier (10-12 years), drops toward adult range sooner.','Age and sex partitioning required.','global'),
('ri-ggt-m','Gamma-Glutamyl Transferase','GGT,Gamma-GT,γ-GT','adult',18,null,'male',null,65.0,'U/L','95',1,'NHANES / Clinical Chemistry Consensus','consensus',2020,'https://www.cdc.gov/nchs/nhanes/',1,'','',0,'serum','Elevated by alcohol, obesity, medications (phenytoin, barbiturates). Most sensitive marker for alcohol use.','Sex partitioning required.','USA'),
('ri-ggt-f','Gamma-Glutamyl Transferase','GGT,Gamma-GT,γ-GT','adult',18,null,'female',null,40.0,'U/L','95',1,'NHANES / Clinical Chemistry Consensus','consensus',2020,'https://www.cdc.gov/nchs/nhanes/',1,'','',0,'serum','','Sex partitioning required.','USA'),
('ri-tbili','Total Bilirubin','Total Bili,TBILI,Bilirubin','adult',18,null,'both',0.2,1.2,'mg/dL','95',0,'NHANES / Clinical Chemistry','study',2022,'https://www.cdc.gov/nchs/nhanes/',1,'','',0,'serum','Gilbert syndrome: benign unconjugated hyperbilirubinemia (1.2-3.0 mg/dL) with fasting. Light-sensitive — protect sample from light.','','USA'),
('ri-dbili','Direct Bilirubin','Conjugated Bilirubin,Direct Bili','adult',18,null,'both',0.0,0.3,'mg/dL','95',0,'Clinical Chemistry Consensus','consensus',2020,'https://pubmed.ncbi.nlm.nih.gov/',1,'','',0,'serum','Direct >20% of total bilirubin suggests hepatocellular or cholestatic disease.','','global'),
('ri-tbili-n1','Total Bilirubin','Neonatal Bilirubin,TSB','neonatal',0,0.003,'both',null,6.0,'mg/dL','95',1,'AAP Neonatal Hyperbilirubinemia Guidelines 2022','guideline',2022,'https://pubmed.ncbi.nlm.nih.gov/36114013/',1,'','',2,'serum','Day 0-1. Use AAP 2022 gestational-age-specific nomogram for phototherapy decisions.','AAP 2022 nomogram required.','USA'),
('ri-tbili-n3','Total Bilirubin','Neonatal Bilirubin,TSB','neonatal',0.08,0.12,'both',null,12.0,'mg/dL','95',1,'AAP Neonatal Hyperbilirubinemia Guidelines 2022','guideline',2022,'https://pubmed.ncbi.nlm.nih.gov/36114013/',1,'','',2,'serum','Days 2-3 of life. Physiological peak at 60-72 h. Use gestational-age-specific nomogram.','AAP 2022 nomogram required.','USA'),
('ri-tprot','Total Protein','TP,Total Serum Protein','adult',18,null,'both',6.3,8.2,'g/dL','95',0,'NHANES 2017-2020','study',2022,'https://www.cdc.gov/nchs/nhanes/',1,'','',0,'serum','Upright posture increases by ~0.5 g/dL vs supine (hemoconcentration). Decreases with malnutrition, liver disease, nephrotic syndrome.','','USA'),
('ri-alb','Albumin','Serum Albumin,ALB','adult',18,null,'both',3.5,5.0,'g/dL','95',0,'NHANES 2017-2020','study',2022,'https://www.cdc.gov/nchs/nhanes/',1,'','BCG,BCP',0,'serum','BCG overestimates in neonates; BCP more specific in CKD. Half-life ~20 days — late marker of nutritional status.','Method difference (BCG vs BCP) significant.','USA'),
('ri-ldh','Lactate Dehydrogenase','LDH,LD,Lactic Dehydrogenase','adult',18,null,'both',135.0,225.0,'U/L','95',0,'Clinical Chemistry Consensus','consensus',2020,'https://pubmed.ncbi.nlm.nih.gov/',1,'','',0,'serum','Highly susceptible to hemolysis (false elevation). Non-specific — elevated in hemolysis, liver necrosis, MI, malignancy, PE.','','global');

-- ─── Minerals ────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO ri_published_library VALUES
('ri-ca','Calcium','Total Calcium,Ca,Serum Calcium','adult',18,null,'both',8.6,10.2,'mg/dL','95',0,'NHANES 2017-2020','study',2022,'https://www.cdc.gov/nchs/nhanes/',1,'','',0,'serum','Total calcium drops ~0.8 mg/dL per 1 g/dL drop in albumin. Use ionized calcium or corrected calcium in hypoalbuminemia. Tourniquet causes false elevation.','Albumin correction needed in hypoalbuminemia.','USA'),
('ri-phos','Phosphorus','Phosphate,Inorganic Phosphorus,Pi,PO4','adult',18,null,'both',2.5,4.5,'mg/dL','95',0,'NHANES 2017-2020','study',2022,'https://www.cdc.gov/nchs/nhanes/',1,'','',0,'serum','Higher in children (up to 7 mg/dL). Decreases post-prandially. Hemolysis causes false elevation.','Age partitioning required.','USA'),
('ri-mg','Magnesium','Serum Magnesium,Mg','adult',18,null,'both',1.7,2.2,'mg/dL','95',0,'Clinical Chemistry Consensus','consensus',2020,'https://pubmed.ncbi.nlm.nih.gov/',1,'','',0,'serum','Most Mg is intracellular — serum level may not reflect body stores. Hemolysis causes false elevation.','','global');

-- ─── Inflammatory Markers ─────────────────────────────────────────────────────

INSERT OR IGNORE INTO ri_published_library VALUES
('ri-crp','C-Reactive Protein','CRP,Conventional CRP','adult',18,null,'both',null,5.0,'mg/L','95',1,'NHANES / Clinical Chemistry Consensus','consensus',2020,'https://www.cdc.gov/nchs/nhanes/',1,'','',0,'serum','Acute phase reactant — rises within hours of inflammation. Not used for CVD risk (use hs-CRP).','','global'),
('ri-hscrp','High-Sensitivity C-Reactive Protein','hs-CRP,hsCRP,High Sensitivity CRP','adult',18,null,'both',null,1.0,'mg/L','95',1,'ACC/AHA Cardiovascular Risk Guidelines 2019','guideline',2019,'https://www.ahajournals.org/doi/10.1161/CIR.0000000000000678',1,'','',0,'serum','CVD risk: <1.0 low, 1.0-3.0 average, >3.0 high. Values >10 mg/L suggest acute infection — not valid for CVD risk. Fasting preferred but not required.','','global');

-- ─── Lipids ──────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO ri_published_library VALUES
('ri-chol','Total Cholesterol','TC,Cholesterol Total','adult',18,null,'both',null,200.0,'mg/dL','95',1,'ACC/AHA Cholesterol Guidelines 2018','guideline',2018,'https://www.ahajournals.org/doi/10.1161/CIR.0000000000000625',1,'','enzymatic',1,'serum','Desirable <200, borderline high 200-239, high ≥240. 9-12 h fast recommended; non-fasting acceptable for screening.','','USA'),
('ri-ldlc','LDL Cholesterol','LDL-C,Low-Density Lipoprotein','adult',18,null,'both',null,100.0,'mg/dL','95',1,'ACC/AHA Cholesterol Guidelines 2018','guideline',2018,'https://www.ahajournals.org/doi/10.1161/CIR.0000000000000625',1,'','Friedewald,direct',1,'serum','Optimal <100, near-optimal 100-129, borderline 130-159, high 160-189, very high ≥190. High-risk target <70 mg/dL. Friedewald invalid if TG >400 mg/dL.','','USA'),
('ri-hdl-m','HDL Cholesterol','HDL-C,High-Density Lipoprotein','adult',18,null,'male',40.0,null,'mg/dL','95',1,'ACC/AHA / NCEP ATP III Guidelines','guideline',2018,'https://www.ahajournals.org/doi/10.1161/CIR.0000000000000625',1,'','direct homogeneous',1,'serum','One-sided lower limit. Low HDL <40 is independent CVD risk factor. >60 is cardioprotective.','Sex partitioning required.','USA'),
('ri-hdl-f','HDL Cholesterol','HDL-C,High-Density Lipoprotein','adult',18,null,'female',50.0,null,'mg/dL','95',1,'ACC/AHA / NCEP ATP III Guidelines','guideline',2018,'https://www.ahajournals.org/doi/10.1161/CIR.0000000000000625',1,'','direct homogeneous',1,'serum','Higher in females due to estrogen. Low <50 is CVD risk factor in women.','Sex partitioning required.','USA'),
('ri-trig','Triglycerides','TG,Triglyceride,Triacylglycerol','adult',18,null,'both',null,150.0,'mg/dL','95',1,'ACC/AHA / Endocrine Society','guideline',2018,'https://www.ahajournals.org/doi/10.1161/CIR.0000000000000625',1,'','enzymatic',1,'serum','Desirable <150, borderline high 150-199, high 200-499, very high ≥500 (pancreatitis risk). 9-12 h fast required.','Fasting required for accurate classification.','USA');

-- ─── Endocrine ───────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO ri_published_library VALUES
('ri-tsh','Thyroid-Stimulating Hormone','TSH,Thyrotropin','adult',18,null,'both',0.4,4.0,'mIU/L','95',0,'ATA Hypothyroidism Guidelines 2014','guideline',2014,'https://pubmed.ncbi.nlm.nih.gov/24151290/',1,'','immunoassay',0,'serum','Trimester-specific pregnancy ranges: T1 0.1-2.5, T2 0.2-3.0, T3 0.3-3.0 mIU/L. TSH rises with age in elderly. Subclinical hypothyroidism: TSH >4 with normal FT4.','Age and pregnancy partitioning important.','global'),
('ri-tsh-t1','Thyroid-Stimulating Hormone','TSH,Thyrotropin','pregnant',null,null,'female',0.1,2.5,'mIU/L','95',0,'ATA Thyroid in Pregnancy 2017','guideline',2017,'https://pubmed.ncbi.nlm.nih.gov/28056690/',1,'','immunoassay',0,'serum','1st trimester. hCG cross-stimulates TSH receptor, lowering TSH. ATA recommends lab-specific trimester-specific ranges.','Trimester and lab-specific RIs required.','global'),
('ri-tsh-t2','Thyroid-Stimulating Hormone','TSH,Thyrotropin','pregnant',null,null,'female',0.2,3.0,'mIU/L','95',0,'ATA Thyroid in Pregnancy 2017','guideline',2017,'https://pubmed.ncbi.nlm.nih.gov/28056690/',1,'','immunoassay',0,'serum','2nd trimester.','','global'),
('ri-tsh-t3','Thyroid-Stimulating Hormone','TSH,Thyrotropin','pregnant',null,null,'female',0.3,3.0,'mIU/L','95',0,'ATA Thyroid in Pregnancy 2017','guideline',2017,'https://pubmed.ncbi.nlm.nih.gov/28056690/',1,'','immunoassay',0,'serum','3rd trimester.','','global'),
('ri-ft4','Free Thyroxine','FT4,Free T4,fT4','adult',18,null,'both',0.8,1.8,'ng/dL','95',0,'ATA Guidelines / Manufacturer Inserts','guideline',2014,'https://pubmed.ncbi.nlm.nih.gov/24151290/',1,'','immunoassay',0,'serum','⚠️ HIGHLY PLATFORM-DEPENDENT. Immunoassay affected by albumin variants and binding protein anomalies. Equilibrium dialysis is reference method. Always use platform-specific RI from manufacturer insert.','HIGHLY platform-dependent — verify with manufacturer insert.','global'),
('ri-ft3','Free Triiodothyronine','FT3,Free T3,fT3','adult',18,null,'both',2.3,4.2,'pg/mL','95',0,'Manufacturer Inserts / Published Studies','manufacturer',2020,'https://pubmed.ncbi.nlm.nih.gov/',1,'','immunoassay',0,'serum','⚠️ HIGHLY PLATFORM-DEPENDENT. Less useful than FT4 per ATA. Values vary considerably between immunoassay platforms.','HIGHLY platform-dependent.','global'),
('ri-cort-am','Cortisol','Morning Cortisol,8am Cortisol,Serum Cortisol','adult',18,null,'both',6.0,23.0,'mcg/dL','95',0,'Endocrine Society Clinical Practice Guidelines','guideline',2016,'https://pubmed.ncbi.nlm.nih.gov/27552707/',1,'','immunoassay,LC-MS/MS',0,'serum','Morning draw 07:00-09:00. Significant diurnal variation. ACTH stimulation test preferred for adrenal insufficiency diagnosis. LC-MS/MS more specific than immunoassay.','Time of collection critical. Method affects values.','global'),
('ri-cort-pm','Cortisol','Afternoon Cortisol,4pm Cortisol,Serum Cortisol','adult',18,null,'both',2.0,11.0,'mcg/dL','95',0,'Endocrine Society Clinical Practice Guidelines','guideline',2016,'https://pubmed.ncbi.nlm.nih.gov/27552707/',1,'','immunoassay',0,'serum','Afternoon draw 15:00-17:00. PM ~50-60% of AM. Loss of diurnal variation: Cushing syndrome.','Time of collection critical.','global'),
('ri-insulin','Insulin','Fasting Insulin,Serum Insulin','adult',18,null,'both',2.6,24.9,'mcIU/mL','95',0,'ADA / NHANES Reference Data','study',2016,'https://www.cdc.gov/nchs/nhanes/',1,'','immunoassay',1,'serum','8+ h fasting required. Wide inter-assay variation. No international standard. Used for HOMA-IR calculation.','Fasting required. No international standard.','USA');

-- ─── Iron Studies ─────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO ri_published_library VALUES
('ri-ferr-m','Ferritin','Serum Ferritin','adult',18,null,'male',24.0,336.0,'ng/mL','95',0,'NHANES 2017-2020','study',2022,'https://www.cdc.gov/nchs/nhanes/',1,'','immunoassay',0,'serum','Acute phase reactant — elevated in inflammation, infection, liver disease, masking true iron status. Low ferritin (<12) is highly specific for iron deficiency.','Sex partitioning required.','USA'),
('ri-ferr-f','Ferritin','Serum Ferritin','adult',18,null,'female',11.0,307.0,'ng/mL','95',0,'NHANES 2017-2020','study',2022,'https://www.cdc.gov/nchs/nhanes/',1,'','immunoassay',0,'serum','Pre-menopausal lower due to menstrual losses. Post-menopausal approaches male range. Ferritin <30 with symptoms warrants iron therapy consideration.','Sex and menopausal status partitioning may be applied.','USA'),
('ri-iron','Serum Iron','Fe,Iron,TIBC Iron','adult',18,null,'both',60.0,170.0,'mcg/dL','95',0,'Clinical Chemistry Reference Ranges','consensus',2020,'https://pubmed.ncbi.nlm.nih.gov/',1,'','colorimetric',0,'serum','Diurnal variation: highest morning, lowest afternoon. Hemolysis causes false elevation. Should not be used alone for iron status.','Time of collection affects results.','global'),
('ri-tibc','Total Iron-Binding Capacity','TIBC','adult',18,null,'both',240.0,450.0,'mcg/dL','95',0,'Clinical Chemistry Reference Ranges','consensus',2020,'https://pubmed.ncbi.nlm.nih.gov/',1,'','colorimetric',0,'serum','Elevated in iron deficiency. Decreased in inflammation, liver disease, malnutrition. Related to transferrin concentration.','','global'),
('ri-tfsat','Transferrin Saturation','TSAT,TF Sat,Iron Saturation','adult',18,null,'both',20.0,50.0,'%','95',0,'Clinical Chemistry Consensus','consensus',2020,'https://pubmed.ncbi.nlm.nih.gov/',1,'','calculated',0,'serum','Calculated: (Serum Iron / TIBC) × 100. Low <20% suggests iron deficiency. High >50% in hemochromatosis.','','global');

-- ─── Coagulation ─────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO ri_published_library VALUES
('ri-pt','Prothrombin Time','PT,Pro Time','adult',18,null,'both',11.0,13.5,'seconds','95',0,'CLSI H47-A2 / Manufacturer Inserts','guideline',2008,'https://clsi.org/',0,'','',0,'plasma','⚠️ Platform-dependent. Each lab must establish own RI using their reagent-instrument combination. Citrate tube 9:1 ratio. Incorrect fill volume invalidates result.','Lab must establish own RI. Reagent and instrument specific.','global'),
('ri-aptt','Activated Partial Thromboplastin Time','aPTT,APTT,PTT','adult',18,null,'both',25.0,35.0,'seconds','95',0,'CLSI H47-A2 / Manufacturer Inserts','guideline',2008,'https://clsi.org/',0,'','',0,'plasma','⚠️ HIGHLY platform-dependent. Values vary by reagent (silica, kaolin, ellagic acid). Heparin monitoring requires lab-specific therapeutic range.','Lab must establish own RI.','global'),
('ri-inr','International Normalized Ratio','INR,PT-INR','adult',18,null,'both',0.8,1.2,'','95',0,'WHO / CLSI / ISTH','guideline',2012,'https://www.who.int/',1,'','',0,'plasma','Normal 0.8-1.2. Therapeutic anticoagulation 2.0-3.0 (most indications), 2.5-3.5 (mechanical mitral valve). Requires ISI calibration.','','global'),
('ri-fibrinogen','Fibrinogen','Clauss Fibrinogen,Factor I','adult',18,null,'both',200.0,400.0,'mg/dL','95',0,'CLSI H30-A2','guideline',2010,'https://clsi.org/',0,'','Clauss method',0,'plasma','Acute phase reactant — elevated in inflammation, pregnancy, CVD risk. Pregnancy: 400-600 mg/dL normal at term.','Pregnancy significantly elevates fibrinogen.','global'),
('ri-ddimer','D-Dimer','D-Dimer,FDP,Fibrin Degradation Products','adult',18,null,'both',null,0.5,'mg/L FEU','95',1,'ISTH / ADJUST-PE Study','guideline',2015,'https://pubmed.ncbi.nlm.nih.gov/',1,'','immunoassay',0,'plasma','Age-adjusted cutoff: age × 0.01 mg/L FEU for patients >50 years. High sensitivity (>95%) for VTE exclusion. Elevated in PE, DVT, DIC, pregnancy, post-op, malignancy.','Age-adjusted cutoff recommended for patients >50.','global');

-- ─── Cardiac Biomarkers ───────────────────────────────────────────────────────

INSERT OR IGNORE INTO ri_published_library VALUES
('ri-tropi','Troponin I','cTnI,Cardiac Troponin I,hs-TnI','adult',18,null,'both',null,0.04,'ng/mL','99',1,'ESC / ACC / Manufacturer Inserts','guideline',2020,'https://pubmed.ncbi.nlm.nih.gov/',1,'','immunoassay',0,'serum','⚠️ HIGHLY PLATFORM-DEPENDENT — Always use the 99th percentile URL from your specific manufacturer insert. Troponin I and Troponin T are NOT interchangeable across manufacturers. Published universal cutoffs do NOT apply across platforms. High-sensitivity assays use sex-specific cutoffs.','MANDATORY: Use manufacturer-specific 99th percentile URL. Highly platform-dependent.','global'),
('ri-tropt','Troponin T','cTnT,Cardiac Troponin T,hs-TnT','adult',18,null,'both',null,0.01,'ng/mL','99',1,'ESC 2020 NSTEMI Guidelines / Roche','guideline',2020,'https://pubmed.ncbi.nlm.nih.gov/32860058/',1,'Roche Elecsys','electrochemiluminescence',0,'serum','Roche hs-TnT: sex-specific 99th percentile male 22 ng/L, female 14 ng/L. ⚠️ Always use manufacturer-specific, sex-specific cutoff. This is a Roche-specific value.','Sex-specific cutoffs for hs assays. HIGHLY platform-dependent.','global'),
('ri-bnp','B-type Natriuretic Peptide','BNP,Brain Natriuretic Peptide','adult',18,null,'both',null,100.0,'pg/mL','95',1,'ACC/AHA Heart Failure Guidelines 2022','guideline',2022,'https://www.ahajournals.org/doi/10.1161/CIR.0000000000001063',1,'','immunoassay',0,'plasma','HF unlikely <100 pg/mL (NPV ~90%), likely >400 pg/mL. 100-400 gray zone. Elevated by age, renal dysfunction, atrial fibrillation. Obesity lowers BNP.','Age, BMI, renal function affect BNP.','global'),
('ri-ntbnp','NT-proBNP','NT-pro-BNP,N-terminal proBNP','adult',18,50,'both',null,450.0,'pg/mL','95',1,'ESC Heart Failure Guidelines 2021','guideline',2021,'https://pubmed.ncbi.nlm.nih.gov/33860409/',1,'','immunoassay',0,'serum','Age <50: <450 pg/mL. Age 50-75: <900 pg/mL. Age >75: <1800 pg/mL. Acute HF rule-out: <300 pg/mL (all ages). Stable: <125 pg/mL.','Age-stratified cutoffs required.','global'),
('ri-psa-40','Prostate-Specific Antigen','PSA,Total PSA,tPSA','adult',40,49,'male',null,2.5,'ng/mL','95',1,'AUA / NCCN PSA Guidelines','guideline',2022,'https://www.auanet.org/',1,'','immunoassay',0,'serum','Age 40-49 years. AUA: age-specific thresholds preferred over a single cutoff.','Age-specific thresholds required.','USA'),
('ri-psa-50','Prostate-Specific Antigen','PSA,Total PSA,tPSA','adult',50,59,'male',null,3.5,'ng/mL','95',1,'AUA PSA Guidelines','guideline',2022,'https://www.auanet.org/',1,'','immunoassay',0,'serum','Age 50-59 years.','Age-specific thresholds.','USA'),
('ri-psa-60','Prostate-Specific Antigen','PSA,Total PSA,tPSA','adult',60,69,'male',null,4.5,'ng/mL','95',1,'AUA PSA Guidelines','guideline',2022,'https://www.auanet.org/',1,'','immunoassay',0,'serum','Age 60-69 years.','Age-specific thresholds.','USA'),
('ri-psa-70','Prostate-Specific Antigen','PSA,Total PSA,tPSA','adult',70,null,'male',null,6.5,'ng/mL','95',1,'AUA PSA Guidelines','guideline',2022,'https://www.auanet.org/',1,'','immunoassay',0,'serum','Age 70+ years. Clinical context essential.','Age-specific thresholds.','USA');

-- ─── Urinalysis ───────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO ri_published_library VALUES
('ri-ucreat','Urine Creatinine','24h Urine Creatinine,Urinary Creatinine','adult',18,null,'both',500.0,2000.0,'mg/24hr','95',0,'Clinical Chemistry Reference Ranges','consensus',2020,'https://pubmed.ncbi.nlm.nih.gov/',1,'','',2,'urine','Used to assess adequacy of 24h collection. Males excrete more than females (muscle mass). Spot creatinine used for urine protein/creatinine ratios.','Sex-specific ranges may be applied.','global'),
('ri-uprot','Urine Protein','24h Urine Protein,Proteinuria','adult',18,null,'both',null,150.0,'mg/24hr','95',1,'KDIGO CKD Guidelines 2022','guideline',2022,'https://kdigo.org/guidelines/ckd-evaluation-and-management/',1,'','',2,'urine','Proteinuria >150 mg/24h pathological. Nephrotic range >3500 mg/24h. Exercise and fever cause transient increase.','','global'),
('ri-malb','Urine Microalbumin','Microalbuminuria,Albumin-Creatinine Ratio,ACR','adult',18,null,'both',null,30.0,'mg/g creatinine','95',1,'KDIGO / ADA Diabetic Kidney Disease Guidelines','guideline',2022,'https://kdigo.org/',1,'','immunoassay',2,'urine','ACR <30 normal (A1), 30-300 moderately increased (A2), >300 severely increased (A3). First morning void preferred. Confirm with 2 of 3 samples over 3-6 months.','','global'),
('ri-uosm','Urine Osmolality','Urinary Osmolality,Urine Osmol','adult',18,null,'both',50.0,1200.0,'mOsm/kg','95',0,'Clinical Reference Ranges','consensus',2020,'https://pubmed.ncbi.nlm.nih.gov/',1,'','freezing point depression',0,'urine','Wide range reflects kidney concentrating/diluting ability. Fixed isosthenuria (~300 mOsm/kg) in CKD.','','global');

-- ─── CSF ─────────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO ri_published_library VALUES
('ri-csfglu','CSF Glucose','Cerebrospinal Fluid Glucose','adult',18,null,'both',50.0,80.0,'mg/dL','95',0,'CSF Analysis Consensus','consensus',2020,'https://pubmed.ncbi.nlm.nih.gov/',1,'','enzymatic',2,'csf','Normal CSF glucose is 60-70% of simultaneous serum glucose. Bacterial meningitis typically <40 mg/dL. Always compare with simultaneous serum level.','Always compare with simultaneous serum glucose.','global'),
('ri-csfprot','CSF Protein','Cerebrospinal Fluid Protein','adult',18,null,'both',15.0,45.0,'mg/dL','95',0,'CSF Analysis Consensus','consensus',2020,'https://pubmed.ncbi.nlm.nih.gov/',1,'','colorimetric,turbidimetric',2,'csf','LP site matters: lumbar (higher) vs cisternal (lower). Traumatic tap: 1 mg/dL protein per 1000 RBCs. Xanthochromia suggests subarachnoid hemorrhage.','','global'),
('ri-csfwbc','CSF White Blood Cell Count','CSF WBC,CSF Cell Count,Pleocytosis','adult',18,null,'both',0.0,5.0,'cells/mcL','95',0,'CSF Analysis Consensus','consensus',2020,'https://pubmed.ncbi.nlm.nih.gov/',1,'','manual count',2,'csf','>5 cells/mcL: pleocytosis. Bacterial meningitis: >1000 PMN predominant. Viral: 10-500 lymphocyte predominant. Traumatic tap: subtract 1 WBC per 700 RBCs.','','global');
