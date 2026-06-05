-- ============================================================================
-- Seed regions: Egypt + Gulf countries → governorates
-- (Cities/districts seeded on demand or via separate scripts)
-- ============================================================================

-- ---------- Countries ----------
INSERT INTO public.regions (id, parent_id, type, level, code, name_ar, name_en, slug, sort_order)
VALUES
  ('11111111-1111-1111-1111-000000000001', NULL, 'country', 0, 'EG', 'مصر',          'Egypt',                 'egypt',          1),
  ('11111111-1111-1111-1111-000000000002', NULL, 'country', 0, 'SA', 'السعودية',     'Saudi Arabia',          'saudi-arabia',   2),
  ('11111111-1111-1111-1111-000000000003', NULL, 'country', 0, 'AE', 'الإمارات',     'United Arab Emirates',  'uae',            3),
  ('11111111-1111-1111-1111-000000000004', NULL, 'country', 0, 'QA', 'قطر',          'Qatar',                 'qatar',          4),
  ('11111111-1111-1111-1111-000000000005', NULL, 'country', 0, 'KW', 'الكويت',       'Kuwait',                'kuwait',         5),
  ('11111111-1111-1111-1111-000000000006', NULL, 'country', 0, 'BH', 'البحرين',      'Bahrain',               'bahrain',        6),
  ('11111111-1111-1111-1111-000000000007', NULL, 'country', 0, 'OM', 'عُمان',         'Oman',                  'oman',           7),
  ('11111111-1111-1111-1111-000000000008', NULL, 'country', 0, 'JO', 'الأردن',       'Jordan',                'jordan',         8)
ON CONFLICT (id) DO NOTHING;

-- ---------- Egypt: 27 governorates ----------
INSERT INTO public.regions (parent_id, type, level, code, name_ar, name_en, slug, lat, lng, sort_order)
VALUES
  ('11111111-1111-1111-1111-000000000001', 'governorate', 1, 'EG-C',  'القاهرة',           'Cairo',          'cairo',           30.0444, 31.2357,  1),
  ('11111111-1111-1111-1111-000000000001', 'governorate', 1, 'EG-GZ', 'الجيزة',            'Giza',           'giza',            30.0131, 31.2089,  2),
  ('11111111-1111-1111-1111-000000000001', 'governorate', 1, 'EG-ALX','الإسكندرية',        'Alexandria',     'alexandria',      31.2001, 29.9187,  3),
  ('11111111-1111-1111-1111-000000000001', 'governorate', 1, 'EG-DK', 'الدقهلية',          'Dakahlia',       'dakahlia',        31.0364, 31.3807,  4),
  ('11111111-1111-1111-1111-000000000001', 'governorate', 1, 'EG-SHR','الشرقية',           'Sharqia',        'sharqia',         30.7327, 31.7195,  5),
  ('11111111-1111-1111-1111-000000000001', 'governorate', 1, 'EG-GH', 'الغربية',           'Gharbia',        'gharbia',         30.8754, 31.0335,  6),
  ('11111111-1111-1111-1111-000000000001', 'governorate', 1, 'EG-MNF','المنوفية',          'Monufia',        'monufia',         30.5972, 30.9876,  7),
  ('11111111-1111-1111-1111-000000000001', 'governorate', 1, 'EG-QH', 'القليوبية',         'Qalyubia',       'qalyubia',        30.3292, 31.2168,  8),
  ('11111111-1111-1111-1111-000000000001', 'governorate', 1, 'EG-KFS','كفر الشيخ',         'Kafr El Sheikh', 'kafr-el-sheikh',  31.1107, 30.9388,  9),
  ('11111111-1111-1111-1111-000000000001', 'governorate', 1, 'EG-BH', 'البحيرة',           'Beheira',        'beheira',         30.8481, 30.3436, 10),
  ('11111111-1111-1111-1111-000000000001', 'governorate', 1, 'EG-IS', 'الإسماعيلية',       'Ismailia',       'ismailia',        30.5965, 32.2715, 11),
  ('11111111-1111-1111-1111-000000000001', 'governorate', 1, 'EG-PTS','بورسعيد',           'Port Said',      'port-said',       31.2653, 32.3018, 12),
  ('11111111-1111-1111-1111-000000000001', 'governorate', 1, 'EG-SUZ','السويس',            'Suez',           'suez',            29.9737, 32.5263, 13),
  ('11111111-1111-1111-1111-000000000001', 'governorate', 1, 'EG-DT', 'دمياط',             'Damietta',       'damietta',        31.4165, 31.8133, 14),
  ('11111111-1111-1111-1111-000000000001', 'governorate', 1, 'EG-FYM','الفيوم',            'Faiyum',         'faiyum',          29.3084, 30.8428, 15),
  ('11111111-1111-1111-1111-000000000001', 'governorate', 1, 'EG-BNS','بني سويف',          'Beni Suef',      'beni-suef',       29.0661, 31.0994, 16),
  ('11111111-1111-1111-1111-000000000001', 'governorate', 1, 'EG-MN', 'المنيا',            'Minya',          'minya',           28.0871, 30.7618, 17),
  ('11111111-1111-1111-1111-000000000001', 'governorate', 1, 'EG-AST','أسيوط',             'Asyut',          'asyut',           27.1809, 31.1837, 18),
  ('11111111-1111-1111-1111-000000000001', 'governorate', 1, 'EG-SHG','سوهاج',             'Sohag',          'sohag',           26.5569, 31.6948, 19),
  ('11111111-1111-1111-1111-000000000001', 'governorate', 1, 'EG-QNA','قنا',               'Qena',           'qena',            26.1551, 32.7160, 20),
  ('11111111-1111-1111-1111-000000000001', 'governorate', 1, 'EG-LX', 'الأقصر',            'Luxor',          'luxor',           25.6872, 32.6396, 21),
  ('11111111-1111-1111-1111-000000000001', 'governorate', 1, 'EG-ASN','أسوان',             'Aswan',          'aswan',           24.0889, 32.8998, 22),
  ('11111111-1111-1111-1111-000000000001', 'governorate', 1, 'EG-RS', 'البحر الأحمر',      'Red Sea',        'red-sea',         26.0975, 33.7943, 23),
  ('11111111-1111-1111-1111-000000000001', 'governorate', 1, 'EG-WAD','الوادي الجديد',     'New Valley',     'new-valley',      25.4477, 30.5564, 24),
  ('11111111-1111-1111-1111-000000000001', 'governorate', 1, 'EG-MT', 'مطروح',             'Matrouh',        'matrouh',         31.3543, 27.2373, 25),
  ('11111111-1111-1111-1111-000000000001', 'governorate', 1, 'EG-SIN','شمال سيناء',        'North Sinai',    'north-sinai',     30.5852, 33.7977, 26),
  ('11111111-1111-1111-1111-000000000001', 'governorate', 1, 'EG-JS', 'جنوب سيناء',        'South Sinai',    'south-sinai',     28.7700, 34.2750, 27)
ON CONFLICT DO NOTHING;

-- ---------- Major cities for Cairo (top 10 districts/areas) ----------
WITH cairo AS (
  SELECT id FROM public.regions WHERE code = 'EG-C' LIMIT 1
)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, lat, lng, sort_order)
SELECT cairo.id, 'city', 2, name_ar, name_en, slug, lat, lng, sort_order
FROM cairo,
(VALUES
  ('مدينة نصر',        'Nasr City',         'nasr-city',         30.0511, 31.3656,  1),
  ('مصر الجديدة',       'Heliopolis',        'heliopolis',        30.0808, 31.3220,  2),
  ('المعادي',          'Maadi',             'maadi',             29.9626, 31.2497,  3),
  ('وسط البلد',         'Downtown',          'downtown-cairo',    30.0444, 31.2357,  4),
  ('الزمالك',          'Zamalek',           'zamalek',           30.0617, 31.2197,  5),
  ('شبرا',             'Shubra',            'shubra',            30.1097, 31.2497,  6),
  ('عين شمس',          'Ain Shams',         'ain-shams',         30.1290, 31.3327,  7),
  ('حلوان',            'Helwan',            'helwan',            29.8425, 31.3445,  8),
  ('التجمع الخامس',     'Fifth Settlement',  'fifth-settlement',  30.0287, 31.4983,  9),
  ('الرحاب',           'Rehab',             'rehab',             30.0589, 31.4923, 10)
) AS v(name_ar, name_en, slug, lat, lng, sort_order)
ON CONFLICT DO NOTHING;

-- ---------- Major cities for Giza ----------
WITH giza AS (
  SELECT id FROM public.regions WHERE code = 'EG-GZ' LIMIT 1
)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, lat, lng, sort_order)
SELECT giza.id, 'city', 2, name_ar, name_en, slug, lat, lng, sort_order
FROM giza,
(VALUES
  ('الدقي',            'Dokki',         'dokki',         30.0381, 31.2122, 1),
  ('المهندسين',         'Mohandessin',   'mohandessin',   30.0626, 31.2003, 2),
  ('العجوزة',          'Agouza',        'agouza',        30.0653, 31.2106, 3),
  ('الهرم',            'Haram',         'haram',         29.9875, 31.1313, 4),
  ('فيصل',             'Faisal',        'faisal',        29.9933, 31.1530, 5),
  ('6 أكتوبر',         '6 October',     '6th-of-october',29.9097, 30.9746, 6),
  ('الشيخ زايد',        'Sheikh Zayed',  'sheikh-zayed',  30.0626, 30.9746, 7),
  ('بولاق الدكرور',     'Boulaq',        'boulaq-dakrour',30.0394, 31.1972, 8)
) AS v(name_ar, name_en, slug, lat, lng, sort_order)
ON CONFLICT DO NOTHING;

-- ---------- Major cities for Alexandria ----------
WITH alex AS (
  SELECT id FROM public.regions WHERE code = 'EG-ALX' LIMIT 1
)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, lat, lng, sort_order)
SELECT alex.id, 'city', 2, name_ar, name_en, slug, lat, lng, sort_order
FROM alex,
(VALUES
  ('سموحة',            'Smouha',          'smouha',          31.2001, 29.9466, 1),
  ('المنشية',          'Manshia',         'manshia',         31.1986, 29.9007, 2),
  ('سيدي جابر',         'Sidi Gaber',      'sidi-gaber',      31.2238, 29.9426, 3),
  ('سان ستيفانو',       'San Stefano',     'san-stefano',     31.2398, 29.9543, 4),
  ('المنتزة',          'Montaza',         'montaza',         31.2891, 30.0204, 5),
  ('العصافرة',         'Asafra',          'asafra',          31.2655, 29.9873, 6),
  ('ميامي',            'Miami',           'miami-alex',      31.2553, 29.9757, 7),
  ('العجمي',           'Agami',           'agami',           31.0898, 29.7717, 8),
  ('برج العرب',         'Borg El Arab',    'borg-el-arab',    30.9286, 29.5630, 9)
) AS v(name_ar, name_en, slug, lat, lng, sort_order)
ON CONFLICT DO NOTHING;

-- ---------- Saudi Arabia: 13 regions (key ones) ----------
INSERT INTO public.regions (parent_id, type, level, code, name_ar, name_en, slug, lat, lng, sort_order)
VALUES
  ('11111111-1111-1111-1111-000000000002', 'governorate', 1, 'SA-01', 'الرياض',         'Riyadh',         'riyadh',          24.7136, 46.6753, 1),
  ('11111111-1111-1111-1111-000000000002', 'governorate', 1, 'SA-02', 'مكة المكرمة',     'Makkah',         'makkah',          21.3891, 39.8579, 2),
  ('11111111-1111-1111-1111-000000000002', 'governorate', 1, 'SA-03', 'المدينة المنورة', 'Madinah',        'madinah',         24.5247, 39.5692, 3),
  ('11111111-1111-1111-1111-000000000002', 'governorate', 1, 'SA-04', 'الشرقية',         'Eastern',        'eastern-province',26.4207, 50.0888, 4),
  ('11111111-1111-1111-1111-000000000002', 'governorate', 1, 'SA-05', 'القصيم',          'Qassim',         'qassim',          26.3260, 43.9750, 5),
  ('11111111-1111-1111-1111-000000000002', 'governorate', 1, 'SA-06', 'حائل',            'Hail',           'hail',            27.5219, 41.6946, 6),
  ('11111111-1111-1111-1111-000000000002', 'governorate', 1, 'SA-07', 'تبوك',            'Tabuk',          'tabuk',           28.3838, 36.5550, 7),
  ('11111111-1111-1111-1111-000000000002', 'governorate', 1, 'SA-08', 'عسير',            'Asir',           'asir',            18.2164, 42.5053, 8),
  ('11111111-1111-1111-1111-000000000002', 'governorate', 1, 'SA-09', 'الباحة',          'Bahah',          'bahah',           20.0129, 41.4677, 9),
  ('11111111-1111-1111-1111-000000000002', 'governorate', 1, 'SA-10', 'نجران',           'Najran',         'najran',          17.4926, 44.1277,10),
  ('11111111-1111-1111-1111-000000000002', 'governorate', 1, 'SA-11', 'جازان',           'Jazan',          'jazan',           16.8892, 42.5611,11),
  ('11111111-1111-1111-1111-000000000002', 'governorate', 1, 'SA-12', 'الجوف',           'Jouf',           'jouf',            29.7859, 40.2186,12),
  ('11111111-1111-1111-1111-000000000002', 'governorate', 1, 'SA-13', 'الحدود الشمالية', 'Northern Borders','northern-borders',30.9753, 41.0174,13)
ON CONFLICT DO NOTHING;

-- ---------- UAE: 7 emirates ----------
INSERT INTO public.regions (parent_id, type, level, code, name_ar, name_en, slug, lat, lng, sort_order)
VALUES
  ('11111111-1111-1111-1111-000000000003', 'governorate', 1, 'AE-AZ', 'أبوظبي',     'Abu Dhabi',       'abu-dhabi',      24.4539, 54.3773, 1),
  ('11111111-1111-1111-1111-000000000003', 'governorate', 1, 'AE-DU', 'دبي',        'Dubai',           'dubai',          25.2048, 55.2708, 2),
  ('11111111-1111-1111-1111-000000000003', 'governorate', 1, 'AE-SH', 'الشارقة',    'Sharjah',         'sharjah',        25.3463, 55.4209, 3),
  ('11111111-1111-1111-1111-000000000003', 'governorate', 1, 'AE-AJ', 'عجمان',      'Ajman',           'ajman',          25.4052, 55.5136, 4),
  ('11111111-1111-1111-1111-000000000003', 'governorate', 1, 'AE-FU', 'الفجيرة',    'Fujairah',        'fujairah',       25.1288, 56.3265, 5),
  ('11111111-1111-1111-1111-000000000003', 'governorate', 1, 'AE-RK', 'رأس الخيمة', 'Ras Al Khaimah',  'ras-al-khaimah', 25.7895, 55.9432, 6),
  ('11111111-1111-1111-1111-000000000003', 'governorate', 1, 'AE-UQ', 'أم القيوين', 'Umm Al Quwain',   'umm-al-quwain',  25.5647, 55.5552, 7)
ON CONFLICT DO NOTHING;
