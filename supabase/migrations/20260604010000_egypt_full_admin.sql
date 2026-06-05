-- ============================================================================
-- Egypt — full administrative seed
--   • Markaz/Cities under each of the 24 governorates that were missing them
--   • Districts/Neighborhoods under the major cities of each governorate
-- Idempotent: parent lookups by slug, ON CONFLICT DO NOTHING throughout.
-- Streets are intentionally NOT seeded (use Google Places autocomplete in
-- clinic forms for street/building level).
-- ============================================================================

-- ===== Helper macro pattern =====
-- Cities under a governorate (parent looked up by code):
--   WITH p AS (SELECT id FROM regions WHERE code='EG-XX' LIMIT 1)
--   INSERT INTO regions(parent_id,type,level,name_ar,name_en,slug,sort_order)
--   SELECT p.id,'city',2,n_ar,n_en,sl,n FROM p,(VALUES (...)) v(...) ;
-- Districts under a city (parent looked up by slug):
--   WITH p AS (SELECT id FROM regions WHERE slug='mansoura' LIMIT 1)
--   INSERT INTO regions(parent_id,type,level,name_ar,name_en,slug,sort_order)
--   SELECT p.id,'district',3,...

-- ===========================================================================
-- 4) DAKAHLIA (الدقهلية) — 18 markaz
-- ===========================================================================
WITH p AS (SELECT id FROM public.regions WHERE code = 'EG-DK' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'city', 2, name_ar, name_en, slug, n FROM p, (VALUES
  ('المنصورة',        'Mansoura',         'mansoura',           1),
  ('طلخا',           'Talkha',            'talkha',             2),
  ('ميت غمر',         'Mit Ghamr',         'mit-ghamr',          3),
  ('دكرنس',          'Dekernes',          'dekernes',           4),
  ('شربين',          'Sherbin',           'sherbin',            5),
  ('أجا',            'Aga',               'aga',                6),
  ('السنبلاوين',      'Senbellawein',      'senbellawein',       7),
  ('بلقاس',          'Belqas',            'belqas',             8),
  ('المنزلة',         'Manzala',           'manzala',            9),
  ('ميت سلسيل',       'Mit Salsil',        'mit-salsil',        10),
  ('الجمالية',        'Gamalia',           'gamalia',           11),
  ('نبروه',          'Nabaroh',           'nabaroh',           12),
  ('محلة دمنة',       'Mahallat Damana',   'mahallat-damana',   13),
  ('تمي الأمديد',      'Tami al-Amdid',     'tami-al-amdid',     14),
  ('الكردي',         'El Kurdi',          'el-kurdi',          15),
  ('منية النصر',      'Menyet El Nasr',    'menyet-el-nasr',    16),
  ('بني عبيد',        'Bani Ubaid',        'bani-ubaid',        17),
  ('جمصة',           'Gamasa',            'gamasa',            18)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

-- Districts under Mansoura (top neighborhoods)
WITH p AS (SELECT id FROM public.regions WHERE slug = 'mansoura' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, n FROM p, (VALUES
  ('توريل',          'Toril',             'mansoura-toril',          1),
  ('محرم بك',         'Muharram Bek',      'mansoura-muharram-bek',   2),
  ('الجامعة',         'University Area',   'mansoura-university',     3),
  ('ميت حدر',         'Mit Hadar',         'mansoura-mit-hadar',      4),
  ('المختلط',         'El-Mokhtalat',      'mansoura-mokhtalat',      5),
  ('المشاية',         'El-Mashaya',        'mansoura-mashaya',        6),
  ('وسط البلد',        'Downtown',          'mansoura-downtown',       7)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

-- ===========================================================================
-- 5) SHARQIA (الشرقية) — 16 markaz
-- ===========================================================================
WITH p AS (SELECT id FROM public.regions WHERE code = 'EG-SHR' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'city', 2, name_ar, name_en, slug, n FROM p, (VALUES
  ('الزقازيق',        'Zagazig',            'zagazig',             1),
  ('العاشر من رمضان',  '10th of Ramadan',    '10th-of-ramadan',     2),
  ('منيا القمح',      'Minya al-Qamh',     'minya-al-qamh',       3),
  ('ههيا',           'Hihya',              'hihya',                4),
  ('أبو حماد',        'Abu Hammad',         'abu-hammad',          5),
  ('القرين',          'El Qurain',          'el-qurain',           6),
  ('ديرب نجم',        'Diyarb Negm',        'diyarb-negm',         7),
  ('كفر صقر',         'Kafr Saqr',          'kafr-saqr',           8),
  ('أبو كبير',        'Abu Kebir',          'abu-kebir',           9),
  ('الإبراهيمية',      'Ibrahimiyah',        'ibrahimiyah',        10),
  ('فاقوس',          'Faqous',             'faqous',             11),
  ('الحسينية',        'Husseiniya',         'husseiniya',         12),
  ('صان الحجر',        'San El Hagar',       'san-el-hagar',       13),
  ('مشتول السوق',     'Mashtoul El Souq',   'mashtoul-el-souq',   14),
  ('بلبيس',          'Bilbeis',            'bilbeis',            15),
  ('القنايات',        'Qenayat',            'qenayat',            16)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

WITH p AS (SELECT id FROM public.regions WHERE slug = 'zagazig' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, n FROM p, (VALUES
  ('القومية',         'Qawmiya',           'zagazig-qawmiya',     1),
  ('شيبة',           'Sheba',              'zagazig-sheba',       2),
  ('المهدي',          'El-Mahdi',           'zagazig-mahdi',       3),
  ('الجامعة',         'University',         'zagazig-university',  4),
  ('وسط البلد',        'Downtown',           'zagazig-downtown',    5)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

-- ===========================================================================
-- 6) GHARBIA (الغربية) — 8 markaz
-- ===========================================================================
WITH p AS (SELECT id FROM public.regions WHERE code = 'EG-GH' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'city', 2, name_ar, name_en, slug, n FROM p, (VALUES
  ('طنطا',           'Tanta',              'tanta',                1),
  ('المحلة الكبرى',    'El-Mahalla El-Kubra','mahalla-el-kubra',    2),
  ('كفر الزيات',      'Kafr El Zayat',      'kafr-el-zayat',       3),
  ('زفتى',           'Zefta',              'zefta',                4),
  ('السنطة',         'El Santa',           'el-santa',             5),
  ('قطور',           'Qutour',             'qutour',               6),
  ('بسيون',          'Basyoun',            'basyoun',              7),
  ('سمنود',          'Samannoud',          'samannoud',            8)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

WITH p AS (SELECT id FROM public.regions WHERE slug = 'tanta' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, n FROM p, (VALUES
  ('سيجر',           'Seger',              'tanta-seger',         1),
  ('المساكن',         'El-Masaken',         'tanta-masaken',       2),
  ('البحر',           'El-Bahr',            'tanta-bahr',          3),
  ('وسط البلد',        'Downtown',           'tanta-downtown',      4),
  ('الجامعة',         'University',         'tanta-university',    5),
  ('طنطا الجديدة',     'New Tanta',          'tanta-new',           6)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

WITH p AS (SELECT id FROM public.regions WHERE slug = 'mahalla-el-kubra' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, n FROM p, (VALUES
  ('نمرة 6',          'Numra 6',            'mahalla-numra-6',     1),
  ('نمرة 7',          'Numra 7',            'mahalla-numra-7',     2),
  ('وسط المدينة',      'Downtown',           'mahalla-downtown',    3),
  ('شارع البحر',      'Bahr Street',        'mahalla-bahr-street', 4)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

-- ===========================================================================
-- 7) MONUFIA (المنوفية) — 9 markaz
-- ===========================================================================
WITH p AS (SELECT id FROM public.regions WHERE code = 'EG-MNF' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'city', 2, name_ar, name_en, slug, n FROM p, (VALUES
  ('شبين الكوم',      'Shibin El Kom',      'shibin-el-kom',       1),
  ('منوف',           'Menouf',             'menouf',               2),
  ('تلا',            'Tala',               'tala',                 3),
  ('أشمون',          'Ashmoun',            'ashmoun',              4),
  ('الشهداء',         'El-Shohada',         'el-shohada',          5),
  ('السادات',         'Sadat City',         'sadat-city',          6),
  ('بركة السبع',      'Berket El Sabaa',    'berket-el-sabaa',     7),
  ('قويسنا',         'Quwaisna',           'quwaisna',            8),
  ('الباجور',         'El Bagour',          'el-bagour',           9)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

WITH p AS (SELECT id FROM public.regions WHERE slug = 'shibin-el-kom' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, n FROM p, (VALUES
  ('وسط البلد',        'Downtown',           'shibin-downtown',     1),
  ('الجامعة',         'University',         'shibin-university',   2),
  ('عشرين',           'Eshreen St.',        'shibin-eshreen',      3),
  ('المستشفى',        'Hospital Area',      'shibin-hospital',     4)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

-- ===========================================================================
-- 8) QALYUBIA (القليوبية) — 11 markaz
-- ===========================================================================
WITH p AS (SELECT id FROM public.regions WHERE code = 'EG-QH' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'city', 2, name_ar, name_en, slug, n FROM p, (VALUES
  ('بنها',           'Banha',              'banha',                1),
  ('شبرا الخيمة',     'Shubra El-Kheima',   'shubra-el-kheima',    2),
  ('القناطر الخيرية', 'El Qanater El Khayreya','qanater-khayreya',  3),
  ('الخانكة',         'El Khanka',          'el-khanka',           4),
  ('قلوب',           'Qalyub',             'qalyub',               5),
  ('طوخ',            'Toukh',              'toukh',                6),
  ('قها',            'Qaha',               'qaha',                 7),
  ('كفر شكر',         'Kafr Shukr',         'kafr-shukr',          8),
  ('العبور',          'Obour',              'obour',                9),
  ('الخصوص',         'El Khusus',          'el-khusus',          10),
  ('شبين القناطر',    'Shibin El-Qanater',  'shibin-el-qanater',  11)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

WITH p AS (SELECT id FROM public.regions WHERE slug = 'banha' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, n FROM p, (VALUES
  ('وسط البلد',        'Downtown',           'banha-downtown',      1),
  ('الجامعة',         'University',         'banha-university',    2),
  ('بنها الجديدة',     'New Banha',          'banha-new',           3)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

-- ===========================================================================
-- 9) KAFR EL SHEIKH (كفر الشيخ) — 11 markaz
-- ===========================================================================
WITH p AS (SELECT id FROM public.regions WHERE code = 'EG-KFS' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'city', 2, name_ar, name_en, slug, n FROM p, (VALUES
  ('كفر الشيخ',       'Kafr El Sheikh',     'kafr-el-sheikh-city', 1),
  ('دسوق',           'Desouk',             'desouk',               2),
  ('فوة',            'Fuwa',               'fuwa',                 3),
  ('مطوبس',          'Metoubas',           'metoubas',             4),
  ('البرلس',          'Burullus',           'burullus',            5),
  ('بيلا',           'Beila',              'beila',                6),
  ('الحامول',         'Al Hamoul',          'al-hamoul',           7),
  ('الرياض',          'Riyad',              'riyad-kfs',           8),
  ('قلين',           'Qallin',             'qallin',               9),
  ('سيدي سالم',       'Sidi Salem',         'sidi-salem',         10),
  ('بلطيم',          'Baltim',             'baltim',             11)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

-- ===========================================================================
-- 10) BEHEIRA (البحيرة) — 16 markaz
-- ===========================================================================
WITH p AS (SELECT id FROM public.regions WHERE code = 'EG-BH' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'city', 2, name_ar, name_en, slug, n FROM p, (VALUES
  ('دمنهور',         'Damanhour',          'damanhour',           1),
  ('كفر الدوار',      'Kafr El Dawwar',     'kafr-el-dawwar',     2),
  ('رشيد',           'Rosetta',            'rosetta',             3),
  ('إدكو',           'Edku',               'edku',                4),
  ('أبو حمص',         'Abu Homs',           'abu-homs',           5),
  ('الدلنجات',        'Delengat',           'delengat',           6),
  ('المحمودية',       'Mahmoudia',          'mahmoudia',          7),
  ('الرحمانية',       'Rahmaniya',          'rahmaniya',          8),
  ('إيتاي البارود',   'Itay El Barud',      'itay-el-barud',      9),
  ('حوش عيسى',       'Hosh Issa',          'hosh-issa',         10),
  ('شبراخيت',        'Shubrakhit',         'shubrakhit',        11),
  ('كوم حمادة',       'Kom Hamada',         'kom-hamada',        12),
  ('بدر',            'Badr',               'badr-bh',           13),
  ('وادي النطرون',    'Wadi El Natrun',     'wadi-el-natrun',    14),
  ('النوبارية',       'Noubaria',           'noubaria',          15),
  ('أبو المطامير',    'Abu El Matamir',     'abu-el-matamir',    16)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

WITH p AS (SELECT id FROM public.regions WHERE slug = 'damanhour' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, n FROM p, (VALUES
  ('وسط البلد',        'Downtown',           'damanhour-downtown',  1),
  ('شارع الجيش',      'Geish Street',       'damanhour-geish',     2),
  ('الجامعة',         'University',         'damanhour-university',3)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

-- ===========================================================================
-- 11) ISMAILIA (الإسماعيلية) — 7 markaz
-- ===========================================================================
WITH p AS (SELECT id FROM public.regions WHERE code = 'EG-IS' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'city', 2, name_ar, name_en, slug, n FROM p, (VALUES
  ('الإسماعيلية',      'Ismailia City',      'ismailia-city',       1),
  ('فايد',           'Fayed',              'fayed',                2),
  ('القنطرة شرق',     'Qantara East',       'qantara-east',        3),
  ('القنطرة غرب',     'Qantara West',       'qantara-west',        4),
  ('التل الكبير',     'Tell El Kebir',      'tell-el-kebir',       5),
  ('القصاصين',        'Qassasin',           'qassasin',            6),
  ('أبو صوير',        'Abu Suwayr',         'abu-suwayr',          7)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

WITH p AS (SELECT id FROM public.regions WHERE slug = 'ismailia-city' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, n FROM p, (VALUES
  ('الشيخ زايد',      'Sheikh Zayed',       'ismailia-sheikh-zayed', 1),
  ('التمساح',         'El Timsah',          'ismailia-timsah',     2),
  ('السلام',          'El Salam',           'ismailia-salam',      3),
  ('وسط البلد',        'Downtown',           'ismailia-downtown',   4),
  ('الجامعة',         'University',         'ismailia-university', 5)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

-- ===========================================================================
-- 12) PORT SAID (بورسعيد) — 7 districts (no markaz; it's a city-governorate)
-- ===========================================================================
WITH p AS (SELECT id FROM public.regions WHERE code = 'EG-PTS' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'city', 2, name_ar, name_en, slug, n FROM p, (VALUES
  ('العرب',           'Arab',               'pts-arab',            1),
  ('الزهور',          'Zohour',             'pts-zohour',          2),
  ('الضواحي',         'Dawahi',             'pts-dawahi',          3),
  ('الشرق',           'Sharq',              'pts-sharq',           4),
  ('المناخ',          'Manakh',             'pts-manakh',          5),
  ('بورفؤاد',         'Port Fouad',         'port-fouad',          6),
  ('جنوب بورسعيد',    'South Port Said',    'pts-south',           7)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

-- ===========================================================================
-- 13) SUEZ (السويس) — 5 districts (city-governorate)
-- ===========================================================================
WITH p AS (SELECT id FROM public.regions WHERE code = 'EG-SUZ' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'city', 2, name_ar, name_en, slug, n FROM p, (VALUES
  ('السويس',          'Suez Center',        'suez-center',         1),
  ('الأربعين',         'Arbaeen',            'suez-arbaeen',        2),
  ('عتاقة',           'Ataqa',              'suez-ataqa',          3),
  ('فيصل',           'Faisal',             'suez-faisal',         4),
  ('الجناين',         'Ganayen',            'suez-ganayen',        5)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

-- ===========================================================================
-- 14) DAMIETTA (دمياط) — 8 markaz
-- ===========================================================================
WITH p AS (SELECT id FROM public.regions WHERE code = 'EG-DT' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'city', 2, name_ar, name_en, slug, n FROM p, (VALUES
  ('دمياط',          'Damietta City',      'damietta-city',       1),
  ('فارسكور',         'Faraskour',          'faraskour',          2),
  ('الزرقا',          'Zarqa',              'zarqa',               3),
  ('السرو',           'Sarw',               'sarw',                4),
  ('كفر سعد',         'Kafr Saad',          'kafr-saad',          5),
  ('ميت أبو غالب',    'Mit Abu Ghalib',     'mit-abu-ghalib',     6),
  ('كفر البطيخ',      'Kafr El Battikh',    'kafr-el-battikh',    7),
  ('رأس البر',        'Ras El Bar',         'ras-el-bar',         8)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

-- ===========================================================================
-- 15) FAIYUM (الفيوم) — 6 markaz
-- ===========================================================================
WITH p AS (SELECT id FROM public.regions WHERE code = 'EG-FYM' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'city', 2, name_ar, name_en, slug, n FROM p, (VALUES
  ('الفيوم',         'Faiyum City',        'faiyum-city',         1),
  ('طامية',          'Tamiya',             'tamiya',               2),
  ('سنورس',          'Sinnuris',           'sinnuris',             3),
  ('إطسا',           'Etsa',               'etsa',                 4),
  ('إبشواي',          'Ibsheway',           'ibsheway',             5),
  ('يوسف الصديق',     'Yusuf El Seddik',    'yusuf-el-seddik',     6)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

-- ===========================================================================
-- 16) BENI SUEF (بني سويف) — 8 markaz
-- ===========================================================================
WITH p AS (SELECT id FROM public.regions WHERE code = 'EG-BNS' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'city', 2, name_ar, name_en, slug, n FROM p, (VALUES
  ('بني سويف',        'Beni Suef City',     'beni-suef-city',      1),
  ('الواسطى',         'Wasta',              'wasta',                2),
  ('ناصر',           'Naser',              'naser-bns',           3),
  ('إهناسيا',         'Ihnasia',            'ihnasia',             4),
  ('ببا',            'Beba',               'beba',                 5),
  ('سمسطا',          'Sumusta',            'sumusta',             6),
  ('الفشن',          'Fashn',              'fashn',                7),
  ('بني سويف الجديدة','New Beni Suef',      'new-beni-suef',       8)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

-- ===========================================================================
-- 17) MINYA (المنيا) — 9 markaz
-- ===========================================================================
WITH p AS (SELECT id FROM public.regions WHERE code = 'EG-MN' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'city', 2, name_ar, name_en, slug, n FROM p, (VALUES
  ('المنيا',         'Minya City',         'minya-city',          1),
  ('العدوة',         'Adwa',               'adwa',                 2),
  ('مغاغة',          'Maghagha',           'maghagha',            3),
  ('بني مزار',        'Beni Mazar',         'beni-mazar',         4),
  ('مطاي',           'Matai',              'matai',                5),
  ('سمالوط',         'Samalut',            'samalut',             6),
  ('أبو قرقاص',       'Abu Qirqas',         'abu-qirqas',          7),
  ('ملوي',           'Mallawi',            'mallawi',             8),
  ('دير مواس',        'Deir Mawas',         'deir-mawas',          9)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

WITH p AS (SELECT id FROM public.regions WHERE slug = 'minya-city' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, n FROM p, (VALUES
  ('وسط البلد',        'Downtown',           'minya-downtown',      1),
  ('الجامعة',         'University',         'minya-university',    2),
  ('المنيا الجديدة',   'New Minya',          'minya-new',           3),
  ('الكورنيش',        'Corniche',           'minya-corniche',      4)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

-- ===========================================================================
-- 18) ASYUT (أسيوط) — 11 markaz
-- ===========================================================================
WITH p AS (SELECT id FROM public.regions WHERE code = 'EG-AST' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'city', 2, name_ar, name_en, slug, n FROM p, (VALUES
  ('أسيوط',          'Asyut City',         'asyut-city',          1),
  ('ديروط',          'Dirout',             'dirout',              2),
  ('القوصية',         'Qousiya',            'qousiya',             3),
  ('منفلوط',         'Manfalout',          'manfalout',           4),
  ('أبنوب',          'Abnoub',             'abnoub',              5),
  ('الفتح',          'Fath',               'fath-ast',           6),
  ('البداري',         'Badari',             'badari',             7),
  ('ساحل سليم',       'Sahel Selim',        'sahel-selim',        8),
  ('الغنايم',         'Ghanayem',           'ghanayem',           9),
  ('صدفا',           'Sidfa',              'sidfa',              10),
  ('أسيوط الجديدة',   'New Asyut',          'new-asyut',         11)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

WITH p AS (SELECT id FROM public.regions WHERE slug = 'asyut-city' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, n FROM p, (VALUES
  ('وسط البلد',        'Downtown',           'asyut-downtown',      1),
  ('الجامعة',         'University',         'asyut-university',    2),
  ('الفتح',           'Fath',              'asyut-fath',          3),
  ('الوليدية',        'Walidiya',           'asyut-walidiya',      4)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

-- ===========================================================================
-- 19) SOHAG (سوهاج) — 12 markaz
-- ===========================================================================
WITH p AS (SELECT id FROM public.regions WHERE code = 'EG-SHG' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'city', 2, name_ar, name_en, slug, n FROM p, (VALUES
  ('سوهاج',          'Sohag City',         'sohag-city',          1),
  ('ساقلتة',         'Saqulta',            'saqulta',             2),
  ('طما',            'Tama',               'tama',                3),
  ('طهطا',           'Tahta',              'tahta',               4),
  ('جهينة',          'Juhayna',            'juhayna',             5),
  ('البلينا',         'Baliana',            'baliana',             6),
  ('المراغة',         'Maragha',            'maragha',             7),
  ('جرجا',           'Girga',              'girga',               8),
  ('دار السلام',      'Dar El Salam',       'dar-el-salam-shg',    9),
  ('أخميم',          'Akhmim',             'akhmim',              10),
  ('المنشأة',         'El Monsha',          'el-monsha',          11),
  ('سوهاج الجديدة',   'New Sohag',          'new-sohag',         12)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

-- ===========================================================================
-- 20) QENA (قنا) — 9 markaz
-- ===========================================================================
WITH p AS (SELECT id FROM public.regions WHERE code = 'EG-QNA' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'city', 2, name_ar, name_en, slug, n FROM p, (VALUES
  ('قنا',            'Qena City',          'qena-city',           1),
  ('نجع حمادي',       'Nag Hammadi',        'nag-hammadi',         2),
  ('دشنا',           'Deshna',             'deshna',              3),
  ('قفط',            'Qift',               'qift',                4),
  ('قوص',            'Qous',               'qous',                5),
  ('نقادة',          'Naqada',             'naqada',              6),
  ('أبو تشت',         'Abu Tesht',          'abu-tesht',           7),
  ('فرشوط',          'Farshout',           'farshout',           8),
  ('الوقف',          'Waqf',               'waqf',                9)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

-- ===========================================================================
-- 21) LUXOR (الأقصر) — 7 markaz
-- ===========================================================================
WITH p AS (SELECT id FROM public.regions WHERE code = 'EG-LX' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'city', 2, name_ar, name_en, slug, n FROM p, (VALUES
  ('الأقصر',         'Luxor City',         'luxor-city',          1),
  ('إسنا',           'Esna',               'esna',                2),
  ('أرمنت',          'Armant',             'armant',              3),
  ('القرنة',          'Qurna',              'qurna',               4),
  ('البياضية',        'Bayadiya',           'bayadiya',            5),
  ('الزينية',         'Zeniya',             'zeniya',              6),
  ('الطود',           'Tod',                'tod',                 7)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

WITH p AS (SELECT id FROM public.regions WHERE slug = 'luxor-city' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, n FROM p, (VALUES
  ('الكرنك',          'Karnak',             'luxor-karnak',        1),
  ('الأقصر الجديدة',   'New Luxor',          'luxor-new',           2),
  ('الكورنيش',        'Corniche',           'luxor-corniche',      3),
  ('وسط البلد',        'Downtown',           'luxor-downtown',      4)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

-- ===========================================================================
-- 22) ASWAN (أسوان) — 6 markaz
-- ===========================================================================
WITH p AS (SELECT id FROM public.regions WHERE code = 'EG-ASN' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'city', 2, name_ar, name_en, slug, n FROM p, (VALUES
  ('أسوان',          'Aswan City',         'aswan-city',          1),
  ('إدفو',           'Edfu',               'edfu',                2),
  ('كوم أمبو',        'Kom Ombo',           'kom-ombo',            3),
  ('دراو',           'Daraw',              'daraw',                4),
  ('نصر النوبة',      'Nasr El Nuba',       'nasr-el-nuba',        5),
  ('كلابشة',         'Kalabsha',           'kalabsha',            6)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

-- ===========================================================================
-- 23) RED SEA (البحر الأحمر) — 7 markaz
-- ===========================================================================
WITH p AS (SELECT id FROM public.regions WHERE code = 'EG-RS' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'city', 2, name_ar, name_en, slug, n FROM p, (VALUES
  ('الغردقة',         'Hurghada',           'hurghada',            1),
  ('سفاجا',          'Safaga',             'safaga',              2),
  ('القصير',          'Quseer',             'quseer',              3),
  ('مرسى علم',        'Marsa Alam',         'marsa-alam',          4),
  ('شلاتين',          'Shalateen',          'shalateen',          5),
  ('حلايب',          'Halaib',             'halaib',              6),
  ('رأس غارب',        'Ras Gharib',         'ras-gharib',          7)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

WITH p AS (SELECT id FROM public.regions WHERE slug = 'hurghada' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, n FROM p, (VALUES
  ('السقالة',         'Sakkala',            'hurghada-sakkala',    1),
  ('الكوثر',          'Kawthar',            'hurghada-kawthar',    2),
  ('الدهار',          'Dahar',              'hurghada-dahar',      3),
  ('الممشى',          'Mamsha',             'hurghada-mamsha',     4),
  ('سهل حشيش',        'Sahl Hasheesh',      'sahl-hasheesh',       5),
  ('الجونة',          'El Gouna',           'el-gouna',            6),
  ('مكادي باي',        'Makadi Bay',         'makadi-bay',          7)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

-- ===========================================================================
-- 24) NEW VALLEY (الوادي الجديد) — 5 markaz
-- ===========================================================================
WITH p AS (SELECT id FROM public.regions WHERE code = 'EG-WAD' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'city', 2, name_ar, name_en, slug, n FROM p, (VALUES
  ('الخارجة',         'Kharga',             'kharga',              1),
  ('الداخلة',         'Dakhla',             'dakhla',              2),
  ('باريس',          'Paris',              'paris-eg',            3),
  ('بلاط',           'Balat',              'balat',                4),
  ('الفرافرة',        'Farafra',            'farafra',             5)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

-- ===========================================================================
-- 25) MATROUH (مطروح) — 8 markaz
-- ===========================================================================
WITH p AS (SELECT id FROM public.regions WHERE code = 'EG-MT' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'city', 2, name_ar, name_en, slug, n FROM p, (VALUES
  ('مرسى مطروح',      'Marsa Matrouh',      'marsa-matrouh',       1),
  ('الحمام',          'Hammam',             'hammam',               2),
  ('العلمين',         'El Alamein',         'el-alamein',          3),
  ('الضبعة',          'Dabaa',              'dabaa',                4),
  ('النجيلة',         'Nagila',             'nagila',               5),
  ('براني',           'Barani',             'barani',               6),
  ('السلوم',          'Salloum',            'salloum',             7),
  ('سيوة',           'Siwa',               'siwa',                 8)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

WITH p AS (SELECT id FROM public.regions WHERE slug = 'el-alamein' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, n FROM p, (VALUES
  ('العلمين الجديدة',  'New Alamein',        'new-alamein',         1),
  ('مارينا',          'Marina',             'marina',              2),
  ('سيدي عبد الرحمن', 'Sidi Abdel Rahman',  'sidi-abdel-rahman',   3)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

-- ===========================================================================
-- 26) NORTH SINAI (شمال سيناء) — 7 markaz
-- ===========================================================================
WITH p AS (SELECT id FROM public.regions WHERE code = 'EG-SIN' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'city', 2, name_ar, name_en, slug, n FROM p, (VALUES
  ('العريش',          'Arish',              'arish',               1),
  ('الشيخ زويد',      'Sheikh Zuwaid',      'sheikh-zuwaid',      2),
  ('رفح',            'Rafah',              'rafah',                3),
  ('بئر العبد',       'Bir El Abd',         'bir-el-abd',          4),
  ('نخل',            'Nakhl',              'nakhl',                5),
  ('الحسنة',          'Hasana',             'hasana',              6),
  ('ربعة',           'Rabaa',              'rabaa-sin',           7)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

-- ===========================================================================
-- 27) SOUTH SINAI (جنوب سيناء) — 9 markaz
-- ===========================================================================
WITH p AS (SELECT id FROM public.regions WHERE code = 'EG-JS' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'city', 2, name_ar, name_en, slug, n FROM p, (VALUES
  ('الطور',           'Tor',                'tor',                  1),
  ('شرم الشيخ',       'Sharm El Sheikh',    'sharm-el-sheikh',     2),
  ('دهب',            'Dahab',              'dahab',                3),
  ('نويبع',          'Nuweiba',            'nuweiba',             4),
  ('طابا',           'Taba',               'taba',                 5),
  ('سانت كاترين',    'Saint Catherine',    'saint-catherine',     6),
  ('أبو رديس',        'Abu Rudeis',         'abu-rudeis',          7),
  ('أبو زنيمة',       'Abu Zenima',         'abu-zenima',          8),
  ('رأس سدر',         'Ras Sedr',           'ras-sedr',            9)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

WITH p AS (SELECT id FROM public.regions WHERE slug = 'sharm-el-sheikh' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, n FROM p, (VALUES
  ('نعمة باي',        'Naama Bay',          'naama-bay',           1),
  ('نبق',            'Nabq',               'nabq',                 2),
  ('الهضبة',          'Hadaba',             'hadaba',              3),
  ('الخليج',          'Khaleeg',            'sharm-khaleeg',       4),
  ('شاطئ المرجان',     'Coral Beach',        'coral-beach',         5),
  ('السلام',          'Salam',              'sharm-salam',         6),
  ('الحي العالمي',     'International',      'sharm-international', 7),
  ('رويسات',          'Roueissat',          'sharm-roueissat',     8)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

-- ===========================================================================
-- BONUS: extra districts under existing Cairo/Giza/Alexandria neighborhoods
--        that didn't get them in the earlier districts seed.
-- ===========================================================================
WITH p AS (SELECT id FROM public.regions WHERE slug = 'mohandessin' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, n FROM p, (VALUES
  ('شارع جامعة الدول', 'Game3et El Dewal',   'game3et-el-dewal',    1),
  ('شارع شهاب',       'Shehab Street',      'shehab-street',       2),
  ('السودان',         'Sudan Street',       'sudan-street',        3),
  ('ميدان لبنان',     'Lebanon Square',     'lebanon-square',      4),
  ('شارع جزيرة العرب','Gazirat El Arab',     'gazirat-el-arab',     5)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

WITH p AS (SELECT id FROM public.regions WHERE slug = 'sheikh-zayed' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, n FROM p, (VALUES
  ('الحي الأول',      'District 1',         'sz-d1',               1),
  ('الحي الثاني',     'District 2',         'sz-d2',               2),
  ('الحي الثالث',     'District 3',         'sz-d3',               3),
  ('الحي الرابع',     'District 4',         'sz-d4',               4),
  ('بياديا',          'Beverly Hills',      'sz-beverly',          5),
  ('الكروان',         'El Karawan',         'sz-karawan',          6),
  ('الراحة',          'El Raha',            'sz-raha',             7)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

WITH p AS (SELECT id FROM public.regions WHERE slug = '6th-of-october' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, n FROM p, (VALUES
  ('الحي الأول',      'District 1',         'oct-d1',              1),
  ('الحي السابع',     'District 7',         'oct-d7',              2),
  ('الحي الثامن',     'District 8',         'oct-d8',              3),
  ('الحي الحادي عشر', 'District 11',        'oct-d11',             4),
  ('الحي الثاني عشر', 'District 12',        'oct-d12',             5),
  ('المحور المركزي',  'Central Axis',       'oct-central-axis',    6),
  ('الحصري',          'Hosary',             'oct-hosary',          7),
  ('دريم لاند',       'Dreamland',          'oct-dreamland',       8)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

WITH p AS (SELECT id FROM public.regions WHERE slug = 'haram' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, n FROM p, (VALUES
  ('شارع الهرم',      'Haram Street',       'haram-street',        1),
  ('فيصل',           'Faisal',             'haram-faisal',        2),
  ('المريوطية',       'Mariotia',           'mariotia',            3),
  ('أرض اللواء',      'Ard El Lewa',        'ard-el-lewa',         4),
  ('الطالبية',        'Talbeya',            'talbeya',             5)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

WITH p AS (SELECT id FROM public.regions WHERE slug = 'fifth-settlement' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, n FROM p, (VALUES
  ('الياسمين',        'Yasmin',             '5th-yasmin',          1),
  ('بيت الوطن',       'Beit El Watan',      '5th-beit-el-watan',   2),
  ('شويفات',          'Choueifat',          '5th-choueifat',       3),
  ('النرجس',          'Narges',             '5th-narges',          4),
  ('اللوتس',          'Lotus',              '5th-lotus',           5),
  ('الجولف',          'Golf',               '5th-golf',            6),
  ('سوديك',          'Sodic',              '5th-sodic',           7),
  ('الأندلس',         'Andalous',           '5th-andalous',        8),
  ('شمال الرحاب',     'North Rehab',        '5th-north-rehab',     9),
  ('التسعين',         'Tisaeen',            '5th-tisaeen',        10)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

WITH p AS (SELECT id FROM public.regions WHERE slug = 'smouha' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, n FROM p, (VALUES
  ('فيكتور عمانويل',  'Victor Emmanuel',    'smouha-victor',       1),
  ('14 مايو',         '14th of May',        'smouha-14-may',       2),
  ('فوزي معاذ',       'Fawzi Moaz',         'smouha-fawzi',        3),
  ('جامعة الإسكندرية','Alex University',    'smouha-university',   4)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;

WITH p AS (SELECT id FROM public.regions WHERE slug = 'sidi-gaber' LIMIT 1)
INSERT INTO public.regions (parent_id, type, level, name_ar, name_en, slug, sort_order)
SELECT p.id, 'district', 3, name_ar, name_en, slug, n FROM p, (VALUES
  ('سيدي جابر البحري', 'Sidi Gaber El Bahari','sidi-gaber-bahari',  1),
  ('سيدي جابر القبلي', 'Sidi Gaber El Qibly', 'sidi-gaber-qibly',   2),
  ('شارع المشير',     'Mosheer Street',     'mosheer-street',      3),
  ('شارع أبو قير',    'Abu Qir Street',     'abu-qir-street',      4)
) AS v(name_ar, name_en, slug, n)
ON CONFLICT DO NOTHING;
