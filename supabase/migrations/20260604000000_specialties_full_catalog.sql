-- =============================================================================
-- Full medical specialties catalog (67 specialties)
-- Adds the missing 55 specialties on top of the existing 12 from the
-- original specialties seed (general, pediatrics, cardiology, dermatology,
-- orthopedics, gynecology, ent, ophthalmology, dentistry, internal,
-- psychiatry, neurology). Uses ON CONFLICT (slug) DO NOTHING to be idempotent.
-- Icons reference lucide-react component names used by the frontend.
-- =============================================================================

INSERT INTO public.specialties (name_ar, name_en, slug, icon) VALUES
  -- 1) Internal-based clinical specialties
  ('طب الأسرة', 'Family Medicine', 'family-medicine', 'Users'),
  ('أمراض الصدر والجهاز التنفسي', 'Pulmonology', 'pulmonology', 'Wind'),
  ('الجهاز الهضمي والكبد', 'Gastroenterology & Hepatology', 'gastroenterology', 'Soup'),
  ('أمراض الكلى', 'Nephrology', 'nephrology', 'Droplets'),
  ('الغدد الصماء والسكر', 'Endocrinology & Diabetes', 'endocrinology', 'FlaskConical'),
  ('أمراض الدم', 'Hematology', 'hematology', 'Droplet'),
  ('الأورام (الباطني)', 'Medical Oncology', 'medical-oncology', 'Ribbon'),
  ('الروماتيزم والمناعة', 'Rheumatology', 'rheumatology', 'Bone'),
  ('الأمراض المعدية', 'Infectious Diseases', 'infectious-diseases', 'Bug'),
  ('الحساسية والمناعة', 'Allergy & Immunology', 'allergy-immunology', 'Shield'),
  ('طب المسنين', 'Geriatrics', 'geriatrics', 'PersonStanding'),

  -- 2) Pediatrics subspecialties
  ('حديثي الولادة', 'Neonatology', 'neonatology', 'Baby'),
  ('قلب الأطفال', 'Pediatric Cardiology', 'pediatric-cardiology', 'HeartPulse'),
  ('جراحة الأطفال', 'Pediatric Surgery', 'pediatric-surgery', 'Scissors'),

  -- 3) Surgical specialties
  ('الجراحة العامة', 'General Surgery', 'general-surgery', 'Scissors'),
  ('جراحة المخ والأعصاب', 'Neurosurgery', 'neurosurgery', 'Brain'),
  ('جراحة القلب والصدر', 'Cardiothoracic Surgery', 'cardiothoracic-surgery', 'Heart'),
  ('جراحة الأوعية الدموية', 'Vascular Surgery', 'vascular-surgery', 'GitBranch'),
  ('جراحة التجميل والحروق', 'Plastic & Reconstructive Surgery', 'plastic-surgery', 'Sparkles'),
  ('المسالك البولية', 'Urology', 'urology', 'Droplets'),
  ('جراحة الأورام', 'Surgical Oncology', 'surgical-oncology', 'Ribbon'),
  ('جراحة الكبد والبنكرياس', 'Hepatobiliary Surgery', 'hepatobiliary-surgery', 'Scissors'),
  ('زراعة الأعضاء', 'Transplant Surgery', 'transplant-surgery', 'HeartHandshake'),

  -- 4) Neuro & psychiatric
  ('طب نفسي للأطفال والمراهقين', 'Child & Adolescent Psychiatry', 'child-psychiatry', 'Brain'),
  ('علم النفس الإكلينيكي', 'Clinical Psychology', 'clinical-psychology', 'Brain'),

  -- 5) Senses & extremities (الأسنان والجلدية والعيون والأنف موجودين بالفعل)

  -- 6) Women & reproduction
  ('علاج العقم والإخصاب', 'Reproductive Medicine / IVF', 'reproductive-medicine', 'Baby'),
  ('أورام النساء', 'Gynecologic Oncology', 'gynecologic-oncology', 'Ribbon'),

  -- 7) Emergency & critical care
  ('طب الطوارئ', 'Emergency Medicine', 'emergency-medicine', 'Siren'),
  ('التخدير', 'Anesthesiology', 'anesthesiology', 'Syringe'),
  ('العناية المركزة', 'Critical Care', 'critical-care', 'Activity'),
  ('علاج الألم', 'Pain Management', 'pain-management', 'Zap'),

  -- 8) Diagnostic & laboratory
  ('الأشعة التشخيصية', 'Diagnostic Radiology', 'radiology', 'ScanLine'),
  ('الأشعة التداخلية', 'Interventional Radiology', 'interventional-radiology', 'ScanLine'),
  ('الطب النووي', 'Nuclear Medicine', 'nuclear-medicine', 'Atom'),
  ('الباثولوجي', 'Pathology', 'pathology', 'Microscope'),
  ('التحاليل الطبية', 'Clinical Pathology / Laboratory Medicine', 'laboratory-medicine', 'TestTube'),
  ('الميكروبيولوجي والمناعة', 'Microbiology & Immunology', 'microbiology', 'Microscope'),
  ('علم الوراثة الطبي', 'Medical Genetics', 'medical-genetics', 'Dna'),

  -- 9) Radiation oncology
  ('علاج الأورام بالأشعة', 'Radiation Oncology', 'radiation-oncology', 'Radiation'),

  -- 10) Rehab, prevention, community
  ('العلاج الطبيعي والتأهيل', 'Physical Medicine & Rehabilitation', 'physical-therapy', 'Dumbbell'),
  ('العلاج الوظيفي', 'Occupational Therapy', 'occupational-therapy', 'HandHelping'),
  ('التخاطب والنطق', 'Speech & Language Therapy', 'speech-therapy', 'Mic'),
  ('التغذية العلاجية', 'Clinical Nutrition', 'clinical-nutrition', 'Apple'),
  ('طب الرياضة', 'Sports Medicine', 'sports-medicine', 'Dumbbell'),
  ('الصحة العامة وطب المجتمع', 'Public Health', 'public-health', 'Users'),
  ('الطب المهني', 'Occupational Medicine', 'occupational-medicine', 'HardHat'),
  ('طب السفر', 'Travel Medicine', 'travel-medicine', 'Plane'),
  ('الطب الوقائي', 'Preventive Medicine', 'preventive-medicine', 'ShieldCheck'),

  -- 11) Modern subspecialties
  ('طب الأعصاب التداخلي', 'Interventional Neurology', 'interventional-neurology', 'Brain'),
  ('القسطرة القلبية', 'Interventional Cardiology', 'interventional-cardiology', 'HeartPulse'),
  ('اضطرابات النوم', 'Sleep Medicine', 'sleep-medicine', 'Moon'),
  ('الذكورة والصحة الجنسية', 'Andrology & Sexual Medicine', 'andrology', 'Mars'),
  ('الطب التلطيفي', 'Palliative Care', 'palliative-care', 'HeartHandshake'),
  ('الطب الشرعي', 'Forensic Medicine', 'forensic-medicine', 'FileSearch'),
  ('الطب التكاملي', 'Integrative Medicine', 'integrative-medicine', 'Leaf')
ON CONFLICT (slug) DO NOTHING;
