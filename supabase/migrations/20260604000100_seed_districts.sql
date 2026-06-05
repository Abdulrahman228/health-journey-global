-- ============================================================================
-- Phase 3 — Seed districts (level=3) with lat/lng for major Gulf + Egyptian
-- cities. Also adds missing city-level entries for Riyadh, Jeddah, Dubai,
-- Abu Dhabi, Doha, Kuwait City, Manama, Muscat, Amman so that districts can
-- attach beneath them.
--
-- Design notes:
--  * Governorates already exist (see 20260602100100_regions_seed.sql).
--  * Cairo/Giza/Alexandria already have "city" rows that — in this schema —
--    represent neighborhoods (Nasr City, Heliopolis, ...). Districts go
--    beneath those.
--  * For Gulf countries, the gov row is the emirate/region. We insert one
--    city row (the capital) per emirate, then districts beneath it.
--  * All inserts use slug-based parent lookup so the migration is
--    idempotent and resilient to UUID changes.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Districts under Cairo neighborhoods (Nasr City, Heliopolis, Maadi...)
-- ---------------------------------------------------------------------------
WITH p AS (SELECT id FROM public.regions WHERE slug = 'nasr-city' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, lat, lng, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, lat, lng, n
FROM p, (VALUES
  ('الحي الأول',      'District 1',      'nasr-city-d1',  30.0590, 31.3260, 1),
  ('الحي السادس',     'District 6',      'nasr-city-d6',  30.0664, 31.3535, 2),
  ('الحي السابع',     'District 7',      'nasr-city-d7',  30.0540, 31.3480, 3),
  ('الحي الثامن',     'District 8',      'nasr-city-d8',  30.0469, 31.3633, 4),
  ('الحي العاشر',     'District 10',     'nasr-city-d10', 30.0400, 31.3700, 5),
  ('مكرم عبيد',       'Makram Ebeid',    'makram-ebeid',  30.0571, 31.3445, 6),
  ('عباس العقاد',     'Abbas El-Akkad',  'abbas-el-akkad',30.0610, 31.3403, 7)
) AS v(name_ar, name_en, slug, lat, lng, n)
ON CONFLICT DO NOTHING;

WITH p AS (SELECT id FROM public.regions WHERE slug = 'heliopolis' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, lat, lng, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, lat, lng, n
FROM p, (VALUES
  ('الكوربة',         'Korba',           'korba',         30.0892, 31.3261, 1),
  ('الميرلاند',       'Merryland',       'merryland',     30.0848, 31.3238, 2),
  ('روكسي',           'Roxy',            'roxy',          30.0888, 31.3221, 3),
  ('الجولف',          'El Golf',         'el-golf',       30.0985, 31.3404, 4),
  ('شيراتون',         'Sheraton',        'sheraton-helio',30.1064, 31.3676, 5),
  ('ألماظة',          'Almaza',          'almaza',        30.0960, 31.3577, 6)
) AS v(name_ar, name_en, slug, lat, lng, n)
ON CONFLICT DO NOTHING;

WITH p AS (SELECT id FROM public.regions WHERE slug = 'maadi' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, lat, lng, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, lat, lng, n
FROM p, (VALUES
  ('المعادي القديمة',  'Old Maadi',       'old-maadi',     29.9626, 31.2497, 1),
  ('المعادي الجديدة',  'New Maadi',       'new-maadi',     29.9678, 31.2880, 2),
  ('دجلة',             'Degla',           'degla',         29.9559, 31.2742, 3),
  ('زهراء المعادي',     'Zahraa El Maadi', 'zahraa-maadi',  29.9462, 31.3060, 4),
  ('كورنيش المعادي',    'Maadi Corniche',  'maadi-corniche',29.9583, 31.2474, 5)
) AS v(name_ar, name_en, slug, lat, lng, n)
ON CONFLICT DO NOTHING;

WITH p AS (SELECT id FROM public.regions WHERE slug = 'fifth-settlement' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, lat, lng, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, lat, lng, n
FROM p, (VALUES
  ('التجمع الأول',     '1st Settlement',  '1st-settlement',30.0257, 31.4419, 1),
  ('التجمع الثالث',    '3rd Settlement',  '3rd-settlement',30.0123, 31.4540, 2),
  ('شارع 90',          'St. 90',          'street-90',     30.0298, 31.4886, 3),
  ('قطامية هايتس',     'Katameya Heights','katameya-heights',29.9942,31.4730, 4),
  ('بيت الوطن',        'Beit El Watan',   'beit-el-watan', 30.0511, 31.5015, 5),
  ('النرجس',           'El Narges',       'el-narges',     30.0335, 31.5040, 6)
) AS v(name_ar, name_en, slug, lat, lng, n)
ON CONFLICT DO NOTHING;

WITH p AS (SELECT id FROM public.regions WHERE slug = 'zamalek' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, lat, lng, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, lat, lng, n
FROM p, (VALUES
  ('شمال الزمالك',    'North Zamalek',   'north-zamalek', 30.0703, 31.2227, 1),
  ('جنوب الزمالك',    'South Zamalek',   'south-zamalek', 30.0537, 31.2237, 2)
) AS v(name_ar, name_en, slug, lat, lng, n)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) Districts under Giza neighborhoods
-- ---------------------------------------------------------------------------
WITH p AS (SELECT id FROM public.regions WHERE slug = 'mohandessin' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, lat, lng, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, lat, lng, n
FROM p, (VALUES
  ('شارع جامعة الدول', 'Arab League St.', 'arab-league-st',30.0590, 31.2068, 1),
  ('شارع شهاب',        'Shehab St.',      'shehab-st',     30.0584, 31.2014, 2),
  ('سفير',             'Sphinx',          'sphinx-square', 30.0568, 31.2099, 3),
  ('ميدان لبنان',      'Lebanon Sq.',     'lebanon-sq',    30.0625, 31.2108, 4)
) AS v(name_ar, name_en, slug, lat, lng, n)
ON CONFLICT DO NOTHING;

WITH p AS (SELECT id FROM public.regions WHERE slug = 'dokki' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, lat, lng, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, lat, lng, n
FROM p, (VALUES
  ('ميدان الدقي',      'Dokki Square',    'dokki-square',  30.0381, 31.2122, 1),
  ('شارع التحرير',     'Tahrir St.',      'dokki-tahrir',  30.0377, 31.2147, 2),
  ('شارع نادي الصيد',  'Nadi El-Sayd',    'nadi-elsayd',   30.0291, 31.2089, 3)
) AS v(name_ar, name_en, slug, lat, lng, n)
ON CONFLICT DO NOTHING;

WITH p AS (SELECT id FROM public.regions WHERE slug = '6th-of-october' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, lat, lng, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, lat, lng, n
FROM p, (VALUES
  ('الحي المتميز',     'Premium District','6oct-premium',  29.9342, 30.9311, 1),
  ('حدائق أكتوبر',     'October Gardens', '6oct-gardens',  29.9550, 30.9510, 2),
  ('دريم لاند',        'Dreamland',       'dreamland',     29.9722, 31.0070, 3),
  ('بفرلي هيلز',       'Beverly Hills',   'beverly-hills', 30.0210, 30.9610, 4),
  ('المعتمدية',        'El-Motamadeya',   'motamadeya',    29.9847, 31.0260, 5)
) AS v(name_ar, name_en, slug, lat, lng, n)
ON CONFLICT DO NOTHING;

WITH p AS (SELECT id FROM public.regions WHERE slug = 'sheikh-zayed' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, lat, lng, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, lat, lng, n
FROM p, (VALUES
  ('الحي الأول زايد',  'Zayed District 1','zayed-d1',      30.0644, 30.9783, 1),
  ('الحي السابع زايد', 'Zayed District 7','zayed-d7',      30.0596, 30.9621, 2),
  ('بيفرلي هيلز زايد',  'Beverly (Zayed)',  'zayed-beverly', 30.0712, 30.9712, 3),
  ('وست تاون',         'Westown',          'westown',       30.0546, 30.9869, 4)
) AS v(name_ar, name_en, slug, lat, lng, n)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3) Districts under Alexandria neighborhoods
-- ---------------------------------------------------------------------------
WITH p AS (SELECT id FROM public.regions WHERE slug = 'smouha' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, lat, lng, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, lat, lng, n
FROM p, (VALUES
  ('شارع فيكتور عمانويل','Victor Emmanuel','victor-emmanuel',31.2076,29.9450, 1),
  ('شارع جرين بلازا',   'Green Plaza',   'green-plaza',     31.2042,29.9501, 2),
  ('انطونيادس',         'Antoniadis',    'antoniadis',      31.2110,29.9437, 3)
) AS v(name_ar, name_en, slug, lat, lng, n)
ON CONFLICT DO NOTHING;

WITH p AS (SELECT id FROM public.regions WHERE slug = 'sidi-gaber' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, lat, lng, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, lat, lng, n
FROM p, (VALUES
  ('سيدي جابر البحرية','Sidi Gaber Bahari','sidi-gaber-bahari',31.2278,29.9476, 1),
  ('محطة الرمل',       'Raml Station',    'raml-station',     31.2042,29.9035, 2),
  ('سان ستيفانو',      'San Stefano',     'sidi-san-stefano', 31.2398,29.9543, 3)
) AS v(name_ar, name_en, slug, lat, lng, n)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4) Add capital cities for Gulf governorates + districts beneath them
-- ---------------------------------------------------------------------------

-- Riyadh city
WITH gov AS (SELECT id FROM public.regions WHERE code = 'SA-01' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, lat, lng, sort_order)
SELECT gov.id, 'city', 2, 'الرياض', 'Riyadh City', 'riyadh-city', 24.7136, 46.6753, 1
FROM gov ON CONFLICT DO NOTHING;

WITH p AS (SELECT id FROM public.regions WHERE slug = 'riyadh-city' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, lat, lng, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, lat, lng, n
FROM p, (VALUES
  ('العليا',           'Olaya',           'olaya',           24.6929, 46.6857, 1),
  ('الملز',            'Malaz',           'malaz',           24.6597, 46.7242, 2),
  ('الصحافة',          'Sahafa',          'sahafa',          24.7886, 46.6450, 3),
  ('الياسمين',         'Yasmin',          'yasmin',          24.8326, 46.6379, 4),
  ('النرجس',           'Narjis',          'narjis-riyadh',   24.8541, 46.6537, 5),
  ('الملقا',           'Mulqa',           'mulqa',           24.7833, 46.6069, 6),
  ('الورود',           'Wurud',           'wurud',           24.7286, 46.6881, 7),
  ('السليمانية',       'Sulaymaniyah',    'sulaymaniyah',    24.6927, 46.7038, 8),
  ('النخيل',           'Nakheel',         'nakheel-riyadh',  24.7657, 46.6336, 9),
  ('حطين',             'Hittin',          'hittin',          24.7642, 46.6034,10),
  ('الروضة',           'Rawdah',          'rawdah-riyadh',   24.7411, 46.7682,11),
  ('قرطبة',            'Qurtubah',        'qurtubah',        24.8014, 46.7770,12),
  ('الدرعية',          'Diriyah',         'diriyah',         24.7314, 46.5747,13),
  ('السفارات',         'Diplomatic Q.',   'diplomatic-quarter',24.6859,46.6203,14),
  ('الربوة',           'Rabwah',          'rabwah-riyadh',   24.7165, 46.7508,15)
) AS v(name_ar, name_en, slug, lat, lng, n)
ON CONFLICT DO NOTHING;

-- Jeddah city under Makkah governorate
WITH gov AS (SELECT id FROM public.regions WHERE code = 'SA-02' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, lat, lng, sort_order)
SELECT gov.id, 'city', 2, 'جدة', 'Jeddah', 'jeddah', 21.4858, 39.1925, 1
FROM gov ON CONFLICT DO NOTHING;

WITH p AS (SELECT id FROM public.regions WHERE slug = 'jeddah' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, lat, lng, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, lat, lng, n
FROM p, (VALUES
  ('الروضة',           'Rawdah',          'rawdah-jeddah',   21.5810, 39.1780, 1),
  ('الزهراء',          'Zahra',           'zahra-jeddah',    21.5656, 39.1602, 2),
  ('الحمراء',          'Hamra',           'hamra-jeddah',    21.5392, 39.1681, 3),
  ('الشاطئ',           'Shatea',          'shatea',          21.5963, 39.1290, 4),
  ('الصفا',            'Safa',            'safa-jeddah',     21.5230, 39.2107, 5),
  ('السلامة',          'Salama',          'salama-jeddah',   21.5763, 39.1465, 6),
  ('النعيم',           'Naeem',           'naeem-jeddah',    21.6050, 39.1378, 7),
  ('البساتين',         'Basateen',        'basateen-jeddah', 21.6234, 39.1690, 8),
  ('الخالدية',         'Khalidiyah',      'khalidiyah-jeddah',21.5544,39.1605, 9),
  ('بني مالك',         'Bani Malik',      'bani-malik',      21.5489, 39.2080,10),
  ('المروة',           'Marwa',           'marwa-jeddah',    21.6161, 39.1582,11),
  ('أبحر الشمالية',     'North Obhur',     'north-obhur',     21.7345, 39.0987,12)
) AS v(name_ar, name_en, slug, lat, lng, n)
ON CONFLICT DO NOTHING;

-- Makkah city
WITH gov AS (SELECT id FROM public.regions WHERE code = 'SA-02' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, lat, lng, sort_order)
SELECT gov.id, 'city', 2, 'مكة المكرمة', 'Makkah Al Mukarramah', 'makkah-city', 21.3891, 39.8579, 2
FROM gov ON CONFLICT DO NOTHING;

WITH p AS (SELECT id FROM public.regions WHERE slug = 'makkah-city' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, lat, lng, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, lat, lng, n
FROM p, (VALUES
  ('العزيزية',         'Aziziyah',        'aziziyah-makkah', 21.3950, 39.8930, 1),
  ('الششة',            'Shisha',          'shisha',          21.4145, 39.8462, 2),
  ('النسيم',           'Naseem',          'naseem-makkah',   21.4365, 39.8918, 3),
  ('الزاهر',           'Zaher',           'zaher',           21.4302, 39.8164, 4),
  ('الكعكية',          'Kakiya',          'kakiya',          21.3729, 39.8323, 5),
  ('الحجون',           'Hujun',           'hujun',           21.4230, 39.8290, 6)
) AS v(name_ar, name_en, slug, lat, lng, n)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5) UAE: Dubai, Abu Dhabi cities + districts
-- ---------------------------------------------------------------------------
WITH gov AS (SELECT id FROM public.regions WHERE code = 'AE-DU' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, lat, lng, sort_order)
SELECT gov.id, 'city', 2, 'دبي', 'Dubai City', 'dubai-city', 25.2048, 55.2708, 1
FROM gov ON CONFLICT DO NOTHING;

WITH p AS (SELECT id FROM public.regions WHERE slug = 'dubai-city' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, lat, lng, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, lat, lng, n
FROM p, (VALUES
  ('ديرة',             'Deira',           'deira',           25.2697, 55.3094, 1),
  ('بر دبي',           'Bur Dubai',       'bur-dubai',       25.2535, 55.2972, 2),
  ('جميرا',            'Jumeirah',        'jumeirah',        25.2048, 55.2407, 3),
  ('مرسى دبي',         'Dubai Marina',    'dubai-marina',    25.0805, 55.1403, 4),
  ('داون تاون دبي',     'Downtown Dubai',  'downtown-dubai',  25.1972, 55.2744, 5),
  ('الخليج التجاري',    'Business Bay',    'business-bay',    25.1864, 55.2769, 6),
  ('البرشاء',          'Al Barsha',       'al-barsha',       25.1095, 55.1928, 7),
  ('القرهود',          'Al Garhoud',      'al-garhoud',      25.2361, 55.3431, 8),
  ('قرية جميرا',       'Jumeirah Village','jvc',             25.0577, 55.2113, 9),
  ('نخلة جميرا',       'Palm Jumeirah',   'palm-jumeirah',   25.1124, 55.1390,10),
  ('مردف',             'Mirdif',          'mirdif',          25.2246, 55.4204,11),
  ('الراشدية',         'Rashidiya',       'rashidiya',       25.2412, 55.3854,12)
) AS v(name_ar, name_en, slug, lat, lng, n)
ON CONFLICT DO NOTHING;

WITH gov AS (SELECT id FROM public.regions WHERE code = 'AE-AZ' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, lat, lng, sort_order)
SELECT gov.id, 'city', 2, 'مدينة أبوظبي', 'Abu Dhabi City', 'abu-dhabi-city', 24.4539, 54.3773, 1
FROM gov ON CONFLICT DO NOTHING;

WITH p AS (SELECT id FROM public.regions WHERE slug = 'abu-dhabi-city' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, lat, lng, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, lat, lng, n
FROM p, (VALUES
  ('جزيرة ياس',         'Yas Island',      'yas-island',      24.4881, 54.6062, 1),
  ('جزيرة السعديات',    'Saadiyat Island', 'saadiyat-island', 24.5435, 54.4316, 2),
  ('الريم',             'Al Reem',         'al-reem',         24.4988, 54.4072, 3),
  ('الراحة',            'Al Raha',         'al-raha',         24.4170, 54.5700, 4),
  ('الخالدية',          'Khalidiya',       'khalidiya-ad',    24.4684, 54.3460, 5),
  ('المشرف',            'Mushrif',         'mushrif-ad',      24.4546, 54.3819, 6),
  ('الكرامة',           'Karama',          'karama-ad',       24.4708, 54.3602, 7),
  ('المرور',            'Muroor',          'muroor',          24.4541, 54.3779, 8),
  ('بطين',              'Bateen',          'bateen',          24.4544, 54.3320, 9),
  ('شاطئ الراحة',       'Al Raha Beach',   'raha-beach',      24.4115, 54.5860,10)
) AS v(name_ar, name_en, slug, lat, lng, n)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6) Qatar (Doha) — single-tier country, treat country as gov via slug
-- ---------------------------------------------------------------------------
WITH gov AS (SELECT id FROM public.regions WHERE slug = 'qatar' AND type = 'country' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, lat, lng, sort_order)
SELECT gov.id, 'governorate', 1, 'الدوحة', 'Doha Municipality', 'doha-mun', 25.2854, 51.5310, 1
FROM gov ON CONFLICT DO NOTHING;

WITH gov AS (SELECT id FROM public.regions WHERE slug = 'doha-mun' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, lat, lng, sort_order)
SELECT gov.id, 'city', 2, 'الدوحة', 'Doha', 'doha', 25.2854, 51.5310, 1
FROM gov ON CONFLICT DO NOTHING;

WITH p AS (SELECT id FROM public.regions WHERE slug = 'doha' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, lat, lng, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, lat, lng, n
FROM p, (VALUES
  ('اللؤلؤة',          'The Pearl',       'the-pearl',       25.3717, 51.5497, 1),
  ('الوكرة',           'Al Wakra',        'al-wakra',        25.1655, 51.6008, 2),
  ('الريان',           'Al Rayyan',       'al-rayyan',       25.2919, 51.4244, 3),
  ('الدفنة',           'West Bay',        'west-bay',        25.3225, 51.5310, 4),
  ('السد',             'Al Sadd',         'al-sadd',         25.2723, 51.5040, 5),
  ('بن محمود',          'Bin Mahmoud',     'bin-mahmoud',     25.2800, 51.5234, 6),
  ('فريج بن عمران',     'Fereej Bin Omran','bin-omran',       25.2854, 51.4988, 7),
  ('الغرافة',          'Gharrafa',        'gharrafa',        25.3428, 51.4459, 8)
) AS v(name_ar, name_en, slug, lat, lng, n)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7) Kuwait City + districts
-- ---------------------------------------------------------------------------
WITH gov AS (SELECT id FROM public.regions WHERE slug = 'kuwait' AND type = 'country' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, lat, lng, sort_order)
SELECT gov.id, 'governorate', 1, 'العاصمة', 'Capital Governorate', 'kuwait-capital', 29.3759, 47.9774, 1
FROM gov ON CONFLICT DO NOTHING;

WITH gov AS (SELECT id FROM public.regions WHERE slug = 'kuwait-capital' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, lat, lng, sort_order)
SELECT gov.id, 'city', 2, 'مدينة الكويت', 'Kuwait City', 'kuwait-city', 29.3759, 47.9774, 1
FROM gov ON CONFLICT DO NOTHING;

WITH p AS (SELECT id FROM public.regions WHERE slug = 'kuwait-city' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, lat, lng, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, lat, lng, n
FROM p, (VALUES
  ('السالمية',         'Salmiya',         'salmiya',         29.3331, 48.0759, 1),
  ('حولي',             'Hawally',         'hawally',         29.3328, 48.0290, 2),
  ('الشعب',            'Shaab',           'shaab',           29.3550, 48.0580, 3),
  ('الجابرية',         'Jabriya',         'jabriya',         29.3239, 48.0241, 4),
  ('الفروانية',        'Farwaniya',       'farwaniya',       29.2774, 47.9583, 5),
  ('السرة',            'Surra',           'surra',           29.3224, 47.9773, 6),
  ('بيان',             'Bayan',           'bayan',           29.3037, 48.0477, 7),
  ('مشرف',             'Mishref',         'mishref',         29.2882, 48.0678, 8)
) AS v(name_ar, name_en, slug, lat, lng, n)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 8) Bahrain — Manama city + districts
-- ---------------------------------------------------------------------------
WITH gov AS (SELECT id FROM public.regions WHERE slug = 'bahrain' AND type = 'country' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, lat, lng, sort_order)
SELECT gov.id, 'governorate', 1, 'العاصمة (المنامة)', 'Capital (Manama)', 'manama-cap', 26.2285, 50.5860, 1
FROM gov ON CONFLICT DO NOTHING;

WITH gov AS (SELECT id FROM public.regions WHERE slug = 'manama-cap' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, lat, lng, sort_order)
SELECT gov.id, 'city', 2, 'المنامة', 'Manama', 'manama', 26.2285, 50.5860, 1
FROM gov ON CONFLICT DO NOTHING;

WITH p AS (SELECT id FROM public.regions WHERE slug = 'manama' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, lat, lng, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, lat, lng, n
FROM p, (VALUES
  ('الجفير',           'Juffair',         'juffair',         26.2188, 50.6024, 1),
  ('السيف',            'Seef',            'seef',            26.2401, 50.5453, 2),
  ('العدلية',          'Adliya',          'adliya',          26.2226, 50.5876, 3),
  ('السنابس',          'Sanabis',         'sanabis',         26.2362, 50.5476, 4),
  ('قلالي',            'Galali',          'galali',          26.2654, 50.6515, 5),
  ('أم الحصم',         'Umm Al Hassam',   'umm-al-hassam',   26.2147, 50.5841, 6)
) AS v(name_ar, name_en, slug, lat, lng, n)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 9) Oman — Muscat
-- ---------------------------------------------------------------------------
WITH gov AS (SELECT id FROM public.regions WHERE slug = 'oman' AND type = 'country' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, lat, lng, sort_order)
SELECT gov.id, 'governorate', 1, 'محافظة مسقط', 'Muscat Governorate', 'muscat-gov', 23.5859, 58.4059, 1
FROM gov ON CONFLICT DO NOTHING;

WITH gov AS (SELECT id FROM public.regions WHERE slug = 'muscat-gov' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, lat, lng, sort_order)
SELECT gov.id, 'city', 2, 'مسقط', 'Muscat', 'muscat', 23.5859, 58.4059, 1
FROM gov ON CONFLICT DO NOTHING;

WITH p AS (SELECT id FROM public.regions WHERE slug = 'muscat' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, lat, lng, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, lat, lng, n
FROM p, (VALUES
  ('روي',              'Ruwi',            'ruwi',            23.5938, 58.5475, 1),
  ('القرم',            'Qurum',           'qurum',           23.6126, 58.4734, 2),
  ('شاطئ القرم',       'Qurum Beach',     'qurum-beach',     23.6189, 58.4720, 3),
  ('بوشر',             'Bawshar',         'bawshar',         23.5683, 58.4040, 4),
  ('الموالح',          'Mawaleh',         'mawaleh',         23.6151, 58.2399, 5),
  ('السيب',            'Seeb',            'seeb',            23.6701, 58.1893, 6),
  ('الخوض',            'Khoudh',          'khoudh',          23.5806, 58.1746, 7),
  ('غلا',              'Ghala',           'ghala',           23.5784, 58.3404, 8)
) AS v(name_ar, name_en, slug, lat, lng, n)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 10) Jordan — Amman
-- ---------------------------------------------------------------------------
WITH gov AS (SELECT id FROM public.regions WHERE slug = 'jordan' AND type = 'country' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, lat, lng, sort_order)
SELECT gov.id, 'governorate', 1, 'العاصمة', 'Amman Governorate', 'amman-gov', 31.9454, 35.9284, 1
FROM gov ON CONFLICT DO NOTHING;

WITH gov AS (SELECT id FROM public.regions WHERE slug = 'amman-gov' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, lat, lng, sort_order)
SELECT gov.id, 'city', 2, 'عمّان', 'Amman', 'amman', 31.9454, 35.9284, 1
FROM gov ON CONFLICT DO NOTHING;

WITH p AS (SELECT id FROM public.regions WHERE slug = 'amman' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, lat, lng, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, lat, lng, n
FROM p, (VALUES
  ('عبدون',            'Abdoun',          'abdoun',          31.9414, 35.8832, 1),
  ('الصويفية',         'Sweifieh',        'sweifieh',        31.9384, 35.8552, 2),
  ('الشميساني',        'Shmeisani',       'shmeisani',       31.9690, 35.9096, 3),
  ('الدوار السابع',    '7th Circle',      'seventh-circle',  31.9540, 35.8576, 4),
  ('الدوار الثامن',    '8th Circle',      'eighth-circle',   31.9405, 35.8410, 5),
  ('دابوق',            'Dabouq',          'dabouq',          31.9991, 35.8362, 6),
  ('خلدا',             'Khalda',          'khalda',          31.9723, 35.8477, 7),
  ('تلاع العلي',       'Tla Al Ali',      'tlaa-al-ali',     31.9907, 35.8545, 8),
  ('جبل عمان',         'Jabal Amman',     'jabal-amman',     31.9522, 35.9337, 9),
  ('جبل الحسين',       'Jabal Al Hussein','jabal-hussein',   31.9772, 35.9081,10)
) AS v(name_ar, name_en, slug, lat, lng, n)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Summary marker for verification
-- ============================================================================
-- After running this migration:
--   SELECT type, COUNT(*) FROM public.regions GROUP BY type ORDER BY type;
-- Expected: districts >= 150
