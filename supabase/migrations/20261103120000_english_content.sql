-- English content (docs/COPY-GUIDE.md).
--
-- Makes the user-facing text that lives in the database English:
--   A. Deep Talk packs, levels and questions, updated in place. Ids, counts,
--      sort order and every couple's progress stay as they are.
--   B. Public functions re-created with English strings. Each body is the live
--      definition (pg_get_functiondef) with only the words inside string
--      literals changed: same signature, logic, volatility, SECURITY DEFINER,
--      search_path, SQLSTATEs and hints (scripts/verify/sql-preserve.mjs).
--   C. Text that triggers and an earlier migration already wrote into rows:
--      activity feed lines and the "Saldo awal" opening deposit note.
--
-- Client matchers: read_letter says "locked" and "not found", perform_pet_care
-- keeps the word "cooldown". Re-runnable: every update matches a stable key or
-- the old Indonesian text, so a second run changes nothing.

-- ============================================================
-- A. Deep Talk content
-- ============================================================

update public.deep_talk_packs p
set title = v.title, description = v.description, updated_at = now()
from (values
  ('cerita-awal-kita',  'How We Started',     'From first impressions to where we are now.'),
  ('akar-keluarga',     'Family Roots',       'Where you grew up and what you brought with you.'),
  ('uang-kita',         'Our Money',          'Honest talk about money, without judging each other.'),
  ('menuju-pelaminan',  'Before the Wedding', 'What you expect from marriage, and how ready you both feel.'),
  ('rumah-dan-anak',    'Home & Future Kids', 'Picturing the home you''ll share and the parents you might become.'),
  ('saat-kita-berbeda', 'When We Disagree',   'How we fight, and how we make up.'),
  ('bahasa-sayang',     'How We Show Love',   'How each of you gives and receives love.'),
  ('mimpi-berdua',      'Shared Dreams',      'The goals and adventures you want to chase together.'),
  ('iman-dan-nilai',    'Faith & Values',     'What you believe and what matters most to you both.'),
  ('seru-aja',          'Just for Fun',       'Light, random questions to laugh about together.')
) as v(slug, title, description)
where p.slug = v.slug
  and (p.title, p.description) is distinct from (v.title, v.description);

update public.deep_talk_levels l
set title = v.title, description = v.description
from (values
  ('cerita-awal-kita',  1, 'First Impressions',     'Nostalgia that makes you smile.'),
  ('cerita-awal-kita',  2, 'Turning Points',        'The moments that brought us this far.'),
  ('cerita-awal-kita',  3, 'Where We Are Now',      'Look back, then look ahead.'),
  ('akar-keluarga',     1, 'Childhood',             'Warm memories from home.'),
  ('akar-keluarga',     2, 'How Home Worked',       'How our families did things, day to day.'),
  ('akar-keluarga',     3, 'What We Carry',         'What to keep, and what to let go.'),
  ('uang-kita',         1, 'Spending Habits',       'Shopping styles and pocket money stories.'),
  ('uang-kita',         2, 'Money as a Couple',     'How we each think about shared money.'),
  ('uang-kita',         3, 'Big Plans',             'The goals that make the future feel safe.'),
  ('menuju-pelaminan',  1, 'Picturing the Wedding', 'The big day and the life after it.'),
  ('menuju-pelaminan',  2, 'Roles & Expectations',  'Who does what, and where the lines are.'),
  ('menuju-pelaminan',  3, 'Being Ready',           'Wanting it is one thing. Being ready is another.'),
  ('rumah-dan-anak',    1, 'Dream Home',            'Everyday life in our future home.'),
  ('rumah-dan-anak',    2, 'About Kids',            'Plans and hopes about having children.'),
  ('rumah-dan-anak',    3, 'Becoming Parents',      'Values, and how we''d raise our kids.'),
  ('saat-kita-berbeda', 1, 'Know Yourself',         'How each of us acts when emotions run high.'),
  ('saat-kita-berbeda', 2, 'Our Patterns',          'What tends to happen when we argue.'),
  ('saat-kita-berbeda', 3, 'Making Peace',          'Ground rules so a fight brings us closer.'),
  ('bahasa-sayang',     1, 'Every Day',             'Small things that feel big.'),
  ('bahasa-sayang',     2, 'Reading Each Other',    'When love gets lost on the way.'),
  ('bahasa-sayang',     3, 'Closer',                'Letting each other all the way in.'),
  ('mimpi-berdua',      1, 'Small Dreams',          'Wishes that get you excited.'),
  ('mimpi-berdua',      2, 'Direction',             'Where work fits in, and what success means to you.'),
  ('mimpi-berdua',      3, 'Legacy',                'The life you want to be remembered for.'),
  ('iman-dan-nilai',    1, 'Principles',            'The values we hold on to.'),
  ('iman-dan-nilai',    2, 'Faith & Belief',        'Spirituality in our life together.'),
  ('iman-dan-nilai',    3, 'A Meaningful Life',     'What gives life meaning, and how we give back.'),
  ('seru-aja',          1, 'Silly Starters',        'Laugh first, think later.'),
  ('seru-aja',          2, 'Pick One',              'Hard choices that are fun to argue about.'),
  ('seru-aja',          3, 'Random but Deep',       'Light on the surface, deep underneath.')
) as v(slug, level_number, title, description)
join public.deep_talk_packs p on p.slug = v.slug
where l.pack_id = p.id
  and l.level_number = v.level_number
  and (l.title, l.description) is distinct from (v.title, v.description);

-- Questions have generated ids, so each row is matched by pack, level and its
-- exact old text. The deep_talk_questions_sync_count trigger recounts, same totals.
update public.deep_talk_questions q
set question_text = v.new_text, updated_at = now()
from (values
  -- How We Started
  ('cerita-awal-kita', 1, 'Apa hal pertama yang kamu perhatikan dariku waktu pertama kali ketemu?',
                          'What''s the first thing you noticed about me when we met?'),
  ('cerita-awal-kita', 1, 'Kamu ingat obrolan pertama kita soal apa?',
                          'Do you remember what our first conversation was about?'),
  ('cerita-awal-kita', 1, 'Waktu itu kamu langsung merasa cocok, atau butuh waktu?',
                          'Did you feel we clicked right away, or did it take a while?'),
  ('cerita-awal-kita', 1, 'Apa yang kamu ceritakan ke temanmu tentang aku di awal-awal?',
                          'What did you tell your friends about me in the early days?'),
  ('cerita-awal-kita', 1, 'Momen kencan awal mana yang paling kamu ingat sampai sekarang?',
                          'Which of our early dates do you still remember best?'),
  ('cerita-awal-kita', 1, 'Ada kesan tentang aku di awal yang ternyata beda jauh dari kenyataannya?',
                          'Was there a first impression of me that turned out to be way off?'),
  ('cerita-awal-kita', 2, 'Kapan kamu pertama kali sadar, "oke, aku sayang orang ini"?',
                          'When did it first hit you: "okay, I love this person"?'),
  ('cerita-awal-kita', 2, 'Momen apa yang bikin hubungan kita naik level?',
                          'What moment took us to the next level?'),
  ('cerita-awal-kita', 2, 'Apa ketakutan terbesarmu di bulan-bulan awal kita jalan?',
                          'What was your biggest fear in our first few months together?'),
  ('cerita-awal-kita', 2, 'Pernah nggak kamu ragu sama kita? Apa yang bikin kamu tetap bertahan?',
                          'Have you ever had doubts about us? What made you stay?'),
  ('cerita-awal-kita', 2, 'Masalah pertama yang kita hadapi bareng itu apa, dan apa yang kamu pelajari?',
                          'What was the first real problem we faced together, and what did you learn from it?'),
  ('cerita-awal-kita', 2, 'Kebiasaanku mana yang dulu bikin kamu bingung, tapi sekarang kamu mengerti?',
                          'Which of my habits used to confuse you but makes sense to you now?'),
  ('cerita-awal-kita', 3, 'Apa yang paling berubah dari dirimu sejak kita bersama?',
                          'What has changed most about you since we got together?'),
  ('cerita-awal-kita', 3, 'Bagian cerita kita mana yang paling ingin kamu ceritakan ke anak cucu nanti?',
                          'Which part of our story would you most want to tell our grandkids one day?'),
  ('cerita-awal-kita', 3, 'Apa yang kamu syukuri dari perjalanan kita yang nggak selalu mulus?',
                          'What are you thankful for in our story, bumps and all?'),
  ('cerita-awal-kita', 3, 'Kalau bisa kembali ke awal, satu hal apa yang ingin kamu lakukan dengan cara berbeda?',
                          'If you could go back to the start, what''s one thing you''d do differently?'),
  ('cerita-awal-kita', 3, 'Janji kecil apa yang ingin kamu pegang untuk babak kita berikutnya?',
                          'What small promise do you want to keep for our next chapter?'),
  ('cerita-awal-kita', 3, 'Menurutmu, apa yang membuat kita masih memilih satu sama lain sampai hari ini?',
                          'Why do you think we still choose each other, even now?'),
  -- Family Roots
  ('akar-keluarga', 1, 'Kenangan masa kecil apa yang paling bikin kamu merasa hangat?',
                       'Which childhood memory makes you feel the warmest?'),
  ('akar-keluarga', 1, 'Siapa orang dewasa yang paling dekat denganmu waktu kecil?',
                       'Which adult were you closest to as a kid?'),
  ('akar-keluarga', 1, 'Tradisi keluarga apa yang paling kamu suka, entah saat hari raya, liburan, atau makan bareng?',
                       'Which family tradition do you love most, from Lebaran or Christmas to trips and big family meals?'),
  ('akar-keluarga', 1, 'Waktu kecil kamu anak yang seperti apa: pendiam, bandel, penurut, atau yang lain?',
                       'What kind of kid were you: quiet, naughty, obedient, or something else?'),
  ('akar-keluarga', 1, 'Masakan rumah apa yang selalu bikin kamu kangen pulang?',
                       'What dish from home always makes you homesick?'),
  ('akar-keluarga', 1, 'Apa mainan atau hobi favoritmu waktu kecil?',
                       'What toy or hobby did you love most as a kid?'),
  ('akar-keluarga', 2, 'Bagaimana orang tuamu menyelesaikan pertengkaran di depan anak-anak?',
                       'How did your parents handle fights in front of the kids?'),
  ('akar-keluarga', 2, 'Bagaimana keluargamu menunjukkan rasa sayang: lewat kata-kata, pelukan, atau perbuatan?',
                       'How did your family show love: with words, hugs, or by doing things for each other?'),
  ('akar-keluarga', 2, 'Topik apa yang dulu tabu dibahas di rumahmu?',
                       'What topics did nobody talk about at home when you were growing up?'),
  ('akar-keluarga', 2, 'Peran apa yang kamu ambil di keluarga: penengah, pelindung, si bungsu manja, atau yang lain?',
                       'What role did you play in your family: the peacemaker, the protector, the spoiled youngest, or something else?'),
  ('akar-keluarga', 2, 'Bagaimana keluargamu memperlakukan uang: hemat, longgar, atau sering jadi sumber ribut?',
                       'How did your family deal with money: careful, relaxed, or a regular cause of fights?'),
  ('akar-keluarga', 2, 'Aturan rumah apa yang dulu kamu benci tapi sekarang kamu pahami?',
                       'Which house rule did you hate back then but understand now?'),
  ('akar-keluarga', 3, 'Luka kecil dari masa kecil apa yang kadang masih terasa sampai sekarang?',
                       'Is there a small hurt from childhood that still stings sometimes?'),
  ('akar-keluarga', 3, 'Kebiasaan keluargamu mana yang ingin kamu teruskan di keluarga kita nanti?',
                       'Which of your family''s habits do you want to carry into our own family?'),
  ('akar-keluarga', 3, 'Kebiasaan keluargamu mana yang ingin kamu putus dan tidak diulang?',
                       'Which of your family''s habits do you want to end with you?'),
  ('akar-keluarga', 3, 'Kapan kamu pernah merasa paling tidak dimengerti oleh keluargamu?',
                       'When did you feel most misunderstood by your family?'),
  ('akar-keluarga', 3, 'Apa yang ingin kamu dengar dari orang tuamu tapi belum pernah terucap?',
                       'What have you always wanted to hear from your parents that they''ve never said?'),
  ('akar-keluarga', 3, 'Bagaimana aku bisa membantumu saat pola lama dari rumah itu muncul lagi?',
                       'How can I help when those old patterns from home show up again?'),
  -- Our Money
  ('uang-kita', 1, 'Barang apa yang terakhir kamu beli dan bikin kamu senang banget?',
                   'What''s the last thing you bought that made you really happy?'),
  ('uang-kita', 1, 'Kamu tipe yang langsung beli, atau mikir lama sebelum checkout?',
                   'Do you buy things right away, or think it over for ages before checkout?'),
  ('uang-kita', 1, 'Pengeluaran kecil apa yang paling susah kamu kurangi?',
                   'What small expense is hardest for you to cut back on?'),
  ('uang-kita', 1, 'Waktu kecil kamu dapat uang jajan? Biasanya dipakai buat apa?',
                   'Did you get pocket money as a kid? What did you usually spend it on?'),
  ('uang-kita', 1, 'Kalau tiba-tiba dapat 10 juta, apa yang pertama kamu lakukan?',
                   'If you suddenly got Rp 10.000.000, what''s the first thing you''d do?'),
  ('uang-kita', 1, 'Hal apa yang menurutmu layak dibayar mahal?',
                   'What do you think is worth paying a lot for?'),
  ('uang-kita', 2, 'Menurutmu uang paling penting untuk apa: rasa aman, kebebasan, atau kenyamanan?',
                   'What matters most to you about money: feeling safe, freedom, or comfort?'),
  ('uang-kita', 2, 'Bagaimana perasaanmu soal utang, cicilan, dan paylater?',
                   'How do you feel about debt, paying in installments and paylater?'),
  ('uang-kita', 2, 'Belanja di atas berapa yang menurutmu perlu didiskusikan dulu dengan pasangan?',
                   'How big does a purchase have to be before we talk it over first?'),
  ('uang-kita', 2, 'Bagaimana pendapatmu soal membantu keuangan orang tua atau saudara?',
                   'How do you feel about helping your parents or siblings out with money?'),
  ('uang-kita', 2, 'Kamu lebih nyaman keuangan digabung, dipisah, atau campuran?',
                   'Would you rather we combine our money, keep it separate, or do a bit of both?'),
  ('uang-kita', 2, 'Kebiasaan uangku mana yang bikin kamu khawatir? Sampaikan dengan lembut ya.',
                   'Which of my money habits worry you? Be gentle with me.'),
  ('uang-kita', 3, 'Apa ketakutan terbesarmu soal uang di masa depan?',
                   'What''s your biggest worry about money in the future?'),
  ('uang-kita', 3, 'Target keuangan apa yang ingin kita capai dalam lima tahun ke depan?',
                   'What money goals do you want us to reach in the next five years?'),
  ('uang-kita', 3, 'Kalau salah satu dari kita kehilangan pekerjaan, apa rencana kita?',
                   'If one of us lost their job, what would our plan be?'),
  ('uang-kita', 3, 'Seberapa penting punya rumah sendiri buatmu, dan kapan?',
                   'How important is owning a home to you, and by when?'),
  ('uang-kita', 3, 'Bagaimana kita memutuskan kalau pendapat kita soal uang beda jauh?',
                   'How should we decide when we see a money question very differently?'),
  ('uang-kita', 3, 'Selain harta, apa yang ingin kita wariskan?',
                   'Apart from money and property, what do you want us to leave behind?'),
  -- Before the Wedding
  ('menuju-pelaminan', 1, 'Pernikahan impianmu seperti apa: sederhana, adat, atau besar-besaran?',
                          'What''s your dream wedding: simple, a full adat ceremony, or a huge celebration?'),
  ('menuju-pelaminan', 1, 'Pernikahan siapa yang pernah kamu lihat dan bikin kamu terinspirasi?',
                          'Whose wedding have you seen that inspired you?'),
  ('menuju-pelaminan', 1, 'Apa yang paling kamu tunggu dari hidup setelah menikah?',
                          'What are you most looking forward to about married life?'),
  ('menuju-pelaminan', 1, 'Setelah menikah kamu ingin tinggal di mana: dekat keluarga atau mandiri?',
                          'Where do you want to live after we marry: close to family, or on our own?'),
  ('menuju-pelaminan', 1, 'Bagian persiapan nikah mana yang paling kamu khawatirkan?',
                          'Which part of planning a wedding worries you most?'),
  ('menuju-pelaminan', 1, 'Lagu apa yang ingin kamu putar di hari pernikahan kita?',
                          'What song do you want played at our wedding?'),
  ('menuju-pelaminan', 2, 'Pekerjaan rumah apa yang kamu suka, dan mana yang paling kamu hindari?',
                          'Which chores do you actually like, and which do you avoid most?'),
  ('menuju-pelaminan', 2, 'Menurutmu, bagaimana kita sebaiknya mengambil keputusan besar di rumah tangga?',
                          'How do you think we should make big decisions as a household?'),
  ('menuju-pelaminan', 2, 'Seberapa sering kamu ingin kita berkunjung ke keluarga masing-masing?',
                          'How often do you want us to visit each other''s families?'),
  ('menuju-pelaminan', 2, 'Bagaimana kita menyikapi campur tangan keluarga besar dalam keputusan kita?',
                          'How should we handle it when the extended family weighs in on our decisions?'),
  ('menuju-pelaminan', 2, 'Seberapa banyak waktu sendiri yang kamu butuhkan setelah menikah?',
                          'How much time alone will you need once we''re married?'),
  ('menuju-pelaminan', 2, 'Batasan apa yang ingin kita jaga soal pertemanan dengan lawan jenis?',
                          'What boundaries do you want us to keep around friendships with the opposite sex?'),
  ('menuju-pelaminan', 3, 'Menurutmu, apa tanda kita benar-benar siap menikah, bukan cuma ingin?',
                          'How will we know we''re really ready to get married, beyond wanting to?'),
  ('menuju-pelaminan', 3, 'Apa yang paling kamu takutkan dari komitmen seumur hidup?',
                          'What scares you most about committing for life?'),
  ('menuju-pelaminan', 3, 'Kalau suatu hari kita merasa jauh, apa yang mau kita lakukan sebelum terlambat?',
                          'If we ever start to feel distant, what should we do before it''s too late?'),
  ('menuju-pelaminan', 3, 'Apakah kamu terbuka untuk konseling pranikah, atau konseling pernikahan nanti?',
                          'Would you be open to premarital counseling now, or marriage counseling later on?'),
  ('menuju-pelaminan', 3, 'Janji pernikahan apa yang paling ingin kamu ucapkan dengan sungguh-sungguh?',
                          'Which wedding vow do you most want to say and truly mean?'),
  ('menuju-pelaminan', 3, 'Apa yang ingin kamu dengar dariku sebelum kita melangkah ke pelaminan?',
                          'What do you need to hear from me before we walk down the aisle?'),
  -- Home & Future Kids
  ('rumah-dan-anak', 1, 'Rumah impianmu seperti apa: rumah tapak, apartemen, atau jauh dari kota?',
                        'What''s your dream home: a house with a yard, an apartment, or somewhere far from the city?'),
  ('rumah-dan-anak', 1, 'Ruangan apa yang paling penting buatmu di rumah?',
                        'Which room matters most to you in a home?'),
  ('rumah-dan-anak', 1, 'Kamu ingin punya hewan peliharaan di rumah? Apa?',
                        'Do you want a pet at home? What kind?'),
  ('rumah-dan-anak', 1, 'Pagi hari yang ideal di rumah kita seperti apa?',
                        'What does a perfect morning at our place look like?'),
  ('rumah-dan-anak', 1, 'Tradisi kecil apa yang ingin kita punya di rumah, misalnya makan malam bareng atau movie night?',
                        'What little rituals do you want us to have at home, like dinner together or movie night?'),
  ('rumah-dan-anak', 1, 'Kamu ingin rumah kita sering kedatangan tamu, atau lebih tenang?',
                        'Do you want a home where guests drop by often, or somewhere quieter?'),
  ('rumah-dan-anak', 2, 'Kamu ingin punya anak? Kalau iya, berapa dan kapan?',
                        'Do you want kids? If so, how many and when?'),
  ('rumah-dan-anak', 2, 'Apa yang kamu bayangkan saat jadi ayah atau ibu?',
                        'What do you picture when you think about becoming a parent?'),
  ('rumah-dan-anak', 2, 'Nilai apa yang paling ingin kamu tanamkan ke anak kita?',
                        'What value do you most want to pass on to our kids?'),
  ('rumah-dan-anak', 2, 'Bagaimana pendapatmu soal pendidikan anak: sekolah negeri, swasta, atau homeschooling?',
                        'Where do you stand on schooling for our kids: public, private, or homeschooling?'),
  ('rumah-dan-anak', 2, 'Bagaimana kita membagi peran mengasuh anak, termasuk saat harus bangun tengah malam?',
                        'How would we split looking after the kids, including who gets up in the middle of the night?'),
  ('rumah-dan-anak', 2, 'Kalau ternyata kita sulit punya anak, apa yang ingin kita lakukan?',
                        'If it turns out we struggle to have kids, what would we want to do?'),
  ('rumah-dan-anak', 3, 'Cara mendidik orang tuamu mana yang ingin kamu tiru, dan mana yang tidak?',
                        'What would you copy from the way your parents raised you, and what would you leave out?'),
  ('rumah-dan-anak', 3, 'Bagaimana kita akan mendisiplinkan anak tanpa kekerasan?',
                        'How will we discipline our kids without hitting or harsh words?'),
  ('rumah-dan-anak', 3, 'Apa yang kamu khawatirkan tentang dirimu sendiri sebagai orang tua?',
                        'What worries you about yourself as a future parent?'),
  ('rumah-dan-anak', 3, 'Bagaimana kita tetap jadi pasangan, bukan cuma rekan mengurus anak?',
                        'How do we keep being a couple once we''re also a parenting team?'),
  ('rumah-dan-anak', 3, 'Seberapa besar peran kakek dan nenek yang kamu harapkan dalam mengasuh anak kita?',
                        'How involved do you want the grandparents to be in raising our kids?'),
  ('rumah-dan-anak', 3, 'Kalau anak kita nanti memilih jalan hidup yang beda dari harapan kita, bagaimana sikap kita?',
                        'If our kids choose a path we didn''t hope for, how will we respond?'),
  -- When We Disagree
  ('saat-kita-berbeda', 1, 'Kalau lagi kesal, tanda-tanda apa yang biasanya muncul darimu?',
                           'When you''re annoyed, what are the signs I should look out for?'),
  ('saat-kita-berbeda', 1, 'Saat marah, kamu butuh ngomong langsung atau butuh waktu tenang dulu?',
                           'When you''re angry, do you need to talk it out right away, or cool down first?'),
  ('saat-kita-berbeda', 1, 'Hal kecil apa yang paling gampang bikin kamu bete?',
                           'What little thing puts you in a bad mood the fastest?'),
  ('saat-kita-berbeda', 1, 'Bagaimana caramu biasanya menenangkan diri?',
                           'How do you usually calm yourself down?'),
  ('saat-kita-berbeda', 1, 'Kata-kata apa yang paling bikin kamu merasa diserang saat berdebat?',
                           'What words make you feel most attacked in an argument?'),
  ('saat-kita-berbeda', 1, 'Kamu lebih susah minta maaf, atau memaafkan?',
                           'Which is harder for you: saying sorry, or forgiving?'),
  ('saat-kita-berbeda', 2, 'Pertengkaran kita yang mana yang paling membekas buatmu?',
                           'Which of our fights has stayed with you the most?'),
  ('saat-kita-berbeda', 2, 'Topik apa yang paling sering bikin kita salah paham?',
                           'What topic do we misunderstand each other on most often?'),
  ('saat-kita-berbeda', 2, 'Waktu kita bertengkar, apa yang sebenarnya paling kamu butuhkan dariku?',
                           'When we fight, what do you really need from me?'),
  ('saat-kita-berbeda', 2, 'Adakah hal yang selama ini kamu pendam supaya kita tidak ribut?',
                           'Is there anything you''ve kept to yourself so we wouldn''t fight?'),
  ('saat-kita-berbeda', 2, 'Cara minta maaf seperti apa yang paling terasa tulus buatmu?',
                           'What kind of apology feels most sincere to you?'),
  ('saat-kita-berbeda', 2, 'Kebiasaanku saat konflik mana yang membuat suasana jadi lebih buruk?',
                           'What do I do in a fight that makes things worse?'),
  ('saat-kita-berbeda', 3, 'Bisakah kita sepakat satu kata kode untuk jeda saat debat mulai panas?',
                           'Can we agree on a code word for taking a break when an argument heats up?'),
  ('saat-kita-berbeda', 3, 'Masalah apa yang menurutmu belum benar-benar selesai di antara kita?',
                           'What issue between us do you feel isn''t really settled yet?'),
  ('saat-kita-berbeda', 3, 'Kapan kamu merasa paling aman untuk jujur kepadaku, bahkan soal hal yang menyakitkan?',
                           'When do you feel safest being honest with me, even about things that hurt?'),
  ('saat-kita-berbeda', 3, 'Aturan bertengkar sehat apa yang ingin kita pegang berdua?',
                           'What rules for fighting fair do you want us both to stick to?'),
  ('saat-kita-berbeda', 3, 'Bagaimana kita tahu kapan butuh bantuan orang ketiga, seperti konselor?',
                           'How will we know when we need outside help, like a counselor?'),
  ('saat-kita-berbeda', 3, 'Apa yang ingin kamu katakan tentang pertengkaran terakhir kita yang belum sempat terucap?',
                           'Is there something about our last fight you never got to say?'),
  -- How We Show Love
  ('bahasa-sayang', 1, 'Hal kecil apa yang aku lakukan yang paling bikin kamu merasa disayang?',
                       'What little thing do I do that makes you feel most loved?'),
  ('bahasa-sayang', 1, 'Kamu lebih suka dipuji, dipeluk, dibantu, diberi hadiah, atau ditemani?',
                       'What do you like most: compliments, hugs, a helping hand, gifts, or just time together?'),
  ('bahasa-sayang', 1, 'Pesan seperti apa dariku yang paling bikin harimu lebih baik?',
                       'What kind of message from me makes your day better?'),
  ('bahasa-sayang', 1, 'Hadiah paling sederhana tapi paling berkesan yang pernah kamu terima?',
                       'What''s the simplest gift you''ve ever received that meant the most?'),
  ('bahasa-sayang', 1, 'Kapan kamu paling butuh pelukan?',
                       'When do you need a hug the most?'),
  ('bahasa-sayang', 1, 'Panggilan sayang apa yang paling kamu suka?',
                       'Which pet name do you like best?'),
  ('bahasa-sayang', 2, 'Kapan terakhir kali kamu merasa kurang diperhatikan olehku?',
                       'When did you last feel I wasn''t paying you enough attention?'),
  ('bahasa-sayang', 2, 'Caraku menunjukkan sayang yang mana yang kadang tidak sampai ke kamu?',
                       'Which of the ways I show love sometimes don''t reach you?'),
  ('bahasa-sayang', 2, 'Apa bedanya caramu memberi cinta dengan cara kamu ingin menerimanya?',
                       'How is the way you give love different from the way you like to receive it?'),
  ('bahasa-sayang', 2, 'Kalau kamu lagi capek, bentuk perhatian apa yang paling kamu butuhkan?',
                       'When you''re worn out, what kind of care do you need most?'),
  ('bahasa-sayang', 2, 'Apa yang bikin kamu merasa dihargai di depan orang lain?',
                       'What makes you feel appreciated when we''re around other people?'),
  ('bahasa-sayang', 2, 'Hal apa yang ingin lebih sering kita lakukan berdua?',
                       'What do you wish we did together more often?'),
  ('bahasa-sayang', 3, 'Kapan kamu merasa paling dekat secara emosional denganku?',
                       'When do you feel closest to me emotionally?'),
  ('bahasa-sayang', 3, 'Apa yang kamu butuhkan supaya merasa aman jadi dirimu sepenuhnya di depanku?',
                       'What do you need from me to feel safe being completely yourself?'),
  ('bahasa-sayang', 3, 'Pernahkah kamu merasa kesepian padahal kita sedang bersama? Ceritakan.',
                       'Have you ever felt lonely even when we were together? Tell me about it.'),
  ('bahasa-sayang', 3, 'Bagian dirimu yang mana yang paling ingin kamu kenalkan lebih dalam kepadaku?',
                       'What part of yourself do you most want me to get to know better?'),
  ('bahasa-sayang', 3, 'Apa arti setia buatmu, di luar urusan orang ketiga?',
                       'What does being faithful mean to you, beyond not cheating?'),
  ('bahasa-sayang', 3, 'Kalau cinta kita adalah sebuah rumah, bagian mana yang perlu kita rawat lebih?',
                       'If our love were a house, which part needs more looking after?'),
  -- Shared Dreams
  ('mimpi-berdua', 1, 'Kalau uang bukan masalah, kamu mau kerja apa?',
                      'If money didn''t matter, what work would you do?'),
  ('mimpi-berdua', 1, 'Satu keahlian baru apa yang ingin kamu kuasai tahun ini?',
                      'What''s one new skill you want to learn this year?'),
  ('mimpi-berdua', 1, 'Negara atau kota mana yang paling ingin kamu kunjungi?',
                      'Which country or city do you most want to visit?'),
  ('mimpi-berdua', 1, 'Pengalaman seru apa yang ingin kita coba bareng minimal sekali seumur hidup?',
                      'What''s something exciting you want us to try together at least once?'),
  ('mimpi-berdua', 1, 'Pencapaian apa yang paling kamu banggakan sejauh ini?',
                      'What are you proudest of so far?'),
  ('mimpi-berdua', 1, 'Waktu kecil, kamu bercita-cita jadi apa?',
                      'What did you want to be when you grew up?'),
  ('mimpi-berdua', 2, 'Lima tahun lagi, kamu ingin hidupmu seperti apa?',
                      'What do you want your life to look like five years from now?'),
  ('mimpi-berdua', 2, 'Seberapa penting karier buatmu dibanding waktu bersama keluarga?',
                      'How much does your career matter to you compared with family time?'),
  ('mimpi-berdua', 2, 'Mimpi apa yang pernah kamu kubur karena takut atau keadaan?',
                      'Is there a dream you gave up on because of fear or circumstances?'),
  ('mimpi-berdua', 2, 'Bagaimana aku bisa lebih mendukung mimpimu?',
                      'How can I back your dreams better?'),
  ('mimpi-berdua', 2, 'Kalau ada peluang kerja di kota atau negara lain, apa yang akan kita pertimbangkan?',
                      'If a job came up in another city or country, what would we weigh up?'),
  ('mimpi-berdua', 2, 'Apa arti sukses buatmu?',
                      'What does success mean to you?'),
  ('mimpi-berdua', 3, 'Apa yang ingin orang ingat tentang dirimu nanti?',
                      'What do you want people to remember about you?'),
  ('mimpi-berdua', 3, 'Mimpi apa yang ingin kita capai sebagai pasangan, bukan sendiri-sendiri?',
                      'What dream do you want us to reach as a couple, rather than each on our own?'),
  ('mimpi-berdua', 3, 'Kalau hidup tinggal satu tahun lagi, apa yang akan kamu lakukan?',
                      'If you had one year left to live, what would you do with it?'),
  ('mimpi-berdua', 3, 'Kegagalan apa yang paling banyak mengajarimu?',
                      'Which failure taught you the most?'),
  ('mimpi-berdua', 3, 'Apa yang rela kamu korbankan demi mimpi kita berdua, dan apa yang tidak?',
                      'What would you give up for our shared dreams, and what wouldn''t you?'),
  ('mimpi-berdua', 3, 'Di usia 70, kamu ingin kita sedang melakukan apa?',
                      'When we''re 70, what do you picture us doing?'),
  -- Faith & Values
  ('iman-dan-nilai', 1, 'Tiga nilai apa yang paling penting dalam hidupmu?',
                        'What three values matter most in your life?'),
  ('iman-dan-nilai', 1, 'Siapa sosok yang paling memengaruhi cara pandangmu tentang hidup?',
                        'Who shaped the way you see life the most?'),
  ('iman-dan-nilai', 1, 'Kebaikan kecil dari orang asing apa yang paling berkesan buatmu?',
                        'What small kindness from a stranger has stayed with you?'),
  ('iman-dan-nilai', 1, 'Hal apa yang menurutmu tidak bisa ditawar dalam hidup?',
                        'What will you never compromise on in life?'),
  ('iman-dan-nilai', 1, 'Kapan kamu merasa paling damai?',
                        'When do you feel most at peace?'),
  ('iman-dan-nilai', 1, 'Kebiasaan baik apa yang ingin kita bangun bareng?',
                        'What good habit do you want us to build together?'),
  ('iman-dan-nilai', 2, 'Bagaimana peran iman atau spiritualitas dalam hidupmu sehari-hari?',
                        'What part does faith or spirituality play in your everyday life?'),
  ('iman-dan-nilai', 2, 'Momen apa yang pernah menguji keyakinanmu?',
                        'What moment has tested your faith?'),
  ('iman-dan-nilai', 2, 'Bagaimana kita mau menjalani ibadah atau kehidupan spiritual sebagai pasangan?',
                        'How do we want to worship or live out our faith as a couple?'),
  ('iman-dan-nilai', 2, 'Bagaimana kita menyikapi kalau keyakinan kita, atau keyakinan keluarga kita, berbeda?',
                        'How do we handle it if our beliefs, or our families'' beliefs, are different?'),
  ('iman-dan-nilai', 2, 'Nilai spiritual apa yang ingin kita tanamkan di rumah tangga kita?',
                        'What spiritual values do you want at the heart of our home?'),
  ('iman-dan-nilai', 2, 'Apa yang biasanya kamu doakan atau harapkan untuk kita?',
                        'What do you usually pray or hope for, for the two of us?'),
  ('iman-dan-nilai', 3, 'Apa yang membuat hidup terasa bermakna buatmu?',
                        'What makes life feel meaningful to you?'),
  ('iman-dan-nilai', 3, 'Bagaimana kita bisa berbagi atau memberi dampak untuk orang lain bersama-sama?',
                        'How could we give back or make a difference for others, together?'),
  ('iman-dan-nilai', 3, 'Keputusan sulit apa yang pernah kamu ambil karena memegang prinsip?',
                        'What hard decision have you made to stay true to your principles?'),
  ('iman-dan-nilai', 3, 'Bagaimana kamu memaknai masa-masa berat dalam hidup?',
                        'How do you make sense of the hard seasons in life?'),
  ('iman-dan-nilai', 3, 'Kalau kita berbeda pendapat soal hal moral yang penting, bagaimana kita menghadapinya?',
                        'If we disagree on an important moral question, how do we work through it?'),
  ('iman-dan-nilai', 3, 'Apa yang ingin kamu syukuri hari ini, dan ingin terus kita syukuri bersama?',
                        'What are you grateful for today, and what do you hope we''ll always be grateful for together?'),
  -- Just for Fun
  ('seru-aja', 1, 'Kalau kita jadi karakter kartun, kita jadi siapa?',
                  'If we were cartoon characters, who would we be?'),
  ('seru-aja', 1, 'Makanan apa yang bisa kamu makan tiap hari tanpa bosan?',
                  'What food could you eat every day without getting sick of it?'),
  ('seru-aja', 1, 'Lebih pilih mana: liburan ke pantai atau ke gunung?',
                  'Which would you pick: a trip to the beach or to the mountains?'),
  ('seru-aja', 1, 'Kebiasaan anehku apa yang paling kamu hafal?',
                  'Which of my weird habits do you know by heart?'),
  ('seru-aja', 1, 'Kalau bisa punya satu kekuatan super, kamu pilih apa?',
                  'If you could have one superpower, which would you choose?'),
  ('seru-aja', 1, 'Lagu apa yang pasti kamu nyanyikan di karaoke?',
                  'What''s your go-to karaoke song?'),
  ('seru-aja', 2, 'Lebih pilih mana: seminggu tanpa HP, atau seminggu tanpa nasi?',
                  'Would you rather go a week without your phone, or a week without rice?'),
  ('seru-aja', 2, 'Lebih pilih mana: tahu masa depan kita, atau bisa mengulang satu hari di masa lalu?',
                  'Would you rather know our future, or get to relive one day from the past?'),
  ('seru-aja', 2, 'Kalau kita dapat satu hari bebas tanpa jadwal, kamu mau ngapain?',
                  'If we got one whole day with nothing planned, what would you want to do?'),
  ('seru-aja', 2, 'Siapa di antara kita yang lebih mungkin nyasar padahal sudah pakai Maps?',
                  'Which of us is more likely to get lost even with Maps open?'),
  ('seru-aja', 2, 'Siapa yang lebih mungkin nangis nonton film sedih?',
                  'Who''s more likely to cry at a sad movie?'),
  ('seru-aja', 2, 'Kalau hidup kita dijadikan film, judulnya apa dan siapa pemerannya?',
                  'If our life were a movie, what would it be called and who would play us?'),
  ('seru-aja', 3, 'Kejadian paling memalukan apa yang pernah terjadi waktu kita jalan bareng?',
                  'What''s the most embarrassing thing that''s happened while we were out together?'),
  ('seru-aja', 3, 'Kalau bisa ngobrol dengan dirimu 10 tahun lalu, kamu mau bilang apa?',
                  'If you could talk to yourself from 10 years ago, what would you say?'),
  ('seru-aja', 3, 'Apa yang bakal kamu rindukan dariku kalau kita LDR sebulan?',
                  'If we had to do long distance for a month, what would you miss most about me?'),
  ('seru-aja', 3, 'Satu hal apa yang selalu bikin kamu ketawa tiap ingat aku?',
                  'What''s one thing about me that always makes you laugh when you think of it?'),
  ('seru-aja', 3, 'Kalau kita bikin bisnis bareng, bisnis apa dan siapa bosnya?',
                  'If we started a business together, what would it be and who''d be the boss?'),
  ('seru-aja', 3, 'Tantangan kecil apa yang mau kita coba minggu ini? Sepakati dan lakukan!',
                  'What small challenge should we try this week? Pick one and actually do it.')
) as v(slug, level_number, old_text, new_text)
join public.deep_talk_packs p on p.slug = v.slug
join public.deep_talk_levels l on l.pack_id = p.id and l.level_number = v.level_number
where q.level_id = l.id
  and q.question_text = v.old_text;

-- ============================================================
-- B. Functions (live definitions, English strings only)
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_clear_llm_key()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change the AI settings' using errcode = '42501';
  end if;
  delete from vault.secrets where name = 'llm_api_key';
  update public.llm_settings
  set key_last4 = null, key_set_at = null, key_set_by = auth.uid(),
      tested_at = null, test_ok = null, test_message = null, updated_at = now()
  where id;
  return public.admin_llm_status();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_llm_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s public.llm_settings;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can view the AI settings' using errcode = '42501';
  end if;
  select * into s from public.llm_settings where id;
  return jsonb_build_object(
    'key_set', exists (select 1 from vault.secrets where name = 'llm_api_key'),
    'key_last4', s.key_last4,
    'key_set_at', s.key_set_at,
    'model', s.model,
    'tested_at', s.tested_at,
    'test_ok', s.test_ok,
    'test_message', s.test_message
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_set_llm_key(p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  -- Pasted keys often carry a trailing newline or tab, not just spaces.
  v_key text := btrim(coalesce(p_key, ''), E' \t\r\n');
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change the AI settings' using errcode = '42501';
  end if;
  -- OpenRouter keys look like sk-or-v1-<hex>; accept any token-like string.
  -- (Length checked separately: Postgres regex repetition counts max out at 255.)
  if char_length(v_key) not between 20 and 300 or v_key !~ '^[A-Za-z0-9._:-]+$' then
    raise exception 'Unknown key format. Paste the full key from openrouter.ai/keys.';
  end if;

  select id into v_id from vault.secrets where name = 'llm_api_key';
  if v_id is null then
    perform vault.create_secret(v_key, 'llm_api_key', 'OpenRouter API key for the AI features');
  else
    perform vault.update_secret(v_id, v_key);
  end if;

  update public.llm_settings
  set key_last4 = right(v_key, 4), key_set_at = now(), key_set_by = auth.uid(),
      tested_at = null, test_ok = null, test_message = null, updated_at = now()
  where id;
  return public.admin_llm_status();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_set_llm_model(p_model text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_model text := nullif(btrim(coalesce(p_model, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change the AI settings' using errcode = '42501';
  end if;
  if v_model is not null and v_model !~ '^[A-Za-z0-9._~:/-]{3,100}$' then
    raise exception 'That model ID isn''t valid. Example: openai/gpt-6-luna';
  end if;
  update public.llm_settings
  set model = v_model, tested_at = null, test_ok = null, test_message = null, updated_at = now()
  where id;
  return public.admin_llm_status();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.check_goal_not_negative()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.goal_id is not null
     and exists (select 1 from public.savings_goals where id = old.goal_id)
     and coalesce((select sum(amount) from public.couple_transactions where goal_id = old.goal_id), 0) < 0 then
    raise exception 'The savings balance would drop below zero. Edit or delete the withdrawal first.';
  end if;
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.check_moment_photo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  moment_couple uuid;
begin
  select couple_id into moment_couple from public.moments where id = new.moment_id for update;
  if moment_couple is null or moment_couple <> new.couple_id then
    raise exception 'This photo doesn''t belong to this moment' using errcode = 'check_violation';
  end if;
  if new.storage_path not like new.couple_id::text || '/' || new.moment_id::text || '/%' then
    raise exception 'The photo''s file path isn''t valid' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' and
     (select count(*) from public.moment_photos where moment_id = new.moment_id) >= 7 then
    raise exception 'Up to 7 photos per moment' using errcode = 'check_violation';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.complete_deep_talk_level(p_pack_id uuid, p_level_number integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_couple uuid := public.get_my_couple_id();
  v_before integer[];
  v_after integer[];
  v_playable integer[];
begin
  if v_couple is null then
    raise exception 'You''re not connected with a partner yet';
  end if;

  select completed_levels into v_before from public.deep_talk_progress
  where couple_id = v_couple and pack_id = p_pack_id
  for update;

  v_after := (
    select array_agg(distinct x order by x)
    from unnest(coalesce(v_before, '{}') || p_level_number) x
  );
  v_playable := (
    select coalesce(array_agg(level_number order by level_number), '{}')
    from public.deep_talk_levels
    where pack_id = p_pack_id and coalesce(question_count, 0) > 0
  );

  insert into public.deep_talk_progress
    (couple_id, pack_id, level_number, current_question_index, completed_levels, is_completed, last_played_at)
  values
    (v_couple, p_pack_id, p_level_number, 0, v_after, v_playable <@ v_after, now())
  on conflict (couple_id, pack_id) do update
    set completed_levels = excluded.completed_levels,
        is_completed = excluded.is_completed,
        last_played_at = now();

  return not (p_level_number = any (coalesce(v_before, '{}')));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_couple()
 RETURNS couples
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_couple public.couples;
begin
  if v_uid is null then
    raise exception 'You''re not logged in' using errcode = '28000';
  end if;

  select c.* into v_couple
  from public.couples c join public.couple_members m on m.couple_id = c.id
  where m.profile_id = v_uid
  for update of c;
  if found then
    if v_couple.closed_at is null
       and v_couple.invite_expires_at < now()
       and (select count(*) from public.couple_members where couple_id = v_couple.id) < 2 then
      update public.couples
      set invite_code = public.generate_invite_code(), invite_expires_at = now() + interval '7 days'
      where id = v_couple.id
      returning * into v_couple;
    end if;
    return v_couple;
  end if;

  for attempt in 1..5 loop
    insert into public.couples (created_by, invite_code)
    values (v_uid, public.generate_invite_code())
    on conflict (invite_code) do nothing
    returning * into v_couple;
    exit when found;
  end loop;
  if v_couple.id is null then
    raise exception 'Couldn''t create an invite code. Try again.';
  end if;

  insert into public.couple_members (couple_id, profile_id) values (v_couple.id, v_uid);
  return v_couple;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_default_deep_talk_levels()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.deep_talk_levels (pack_id, level_number, title)
  values (new.id, 1, 'Light'), (new.id, 2, 'Deeper'), (new.id, 3, 'Deepest')
  on conflict (pack_id, level_number) do nothing;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_couple_size()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Lock the couple so two concurrent joins can't both see one member.
  perform 1 from public.couples where id = new.couple_id for update;
  if (select count(*) from public.couple_members where couple_id = new.couple_id) >= 2 then
    raise exception 'This couple is already full' using errcode = 'check_violation';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_kangen_limits()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_day_start timestamptz := date_trunc('day', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta';
begin
  if exists (
    select 1 from public.miss_you
    where sender_id = new.sender_id and created_at > now() - interval '30 minutes'
  ) then
    raise exception 'Wait a bit before sending another Kangen';
  end if;
  if (select count(*) from public.miss_you where sender_id = new.sender_id and created_at >= v_day_start) >= 10 then
    raise exception 'You''ve sent all your Kangen for today. Try again tomorrow.';
  end if;
  new.created_at := now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_invite_code()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_code text;
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  for attempt in 1..10 loop
    select string_agg(substr(alphabet, 1 + (get_byte(b, i) % 32), 1), '')
      into v_code
      from (select extensions.gen_random_bytes(8) as b) r, generate_series(0, 7) i;
    if not exists (select 1 from public.couples where invite_code = v_code) then
      return v_code;
    end if;
  end loop;
  raise exception 'Couldn''t create an invite code. Try again.';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.join_couple(p_code text, p_discard boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_target public.couples;
  v_current uuid;
begin
  if v_uid is null then
    raise exception 'You''re not logged in' using errcode = '28000';
  end if;

  select * into v_target from public.couples
  where invite_code = upper(btrim(coalesce(p_code, '')));
  if v_target.id is null then
    raise exception 'Invite code not found';
  end if;

  select couple_id into v_current from public.couple_members where profile_id = v_uid;
  if v_current = v_target.id then
    return v_target.id;
  end if;

  -- Lock both couples in a fixed order, then re-read under the lock.
  perform 1 from public.couples
  where id in (v_target.id, coalesce(v_current, v_target.id))
  order by id
  for update;
  select * into v_target from public.couples where id = v_target.id;
  select couple_id into v_current from public.couple_members where profile_id = v_uid;

  if v_target.closed_at is not null then
    raise exception 'This code no longer works because that couple has been closed';
  end if;
  if (select count(*) from public.couple_members where couple_id = v_target.id) >= 2 then
    raise exception 'This couple is already full';
  end if;
  if v_target.invite_expires_at < now() then
    raise exception 'This invite code has expired. Ask your partner to make a new one.';
  end if;

  if v_current is not null then
    if (select count(*) from public.couple_members where couple_id = v_current) > 1 then
      raise exception 'You''re already connected with someone else';
    end if;
    if not p_discard and public.couple_has_data(v_current) then
      raise exception 'Your current couple still has memories saved. Joining will delete all of them.'
        using hint = 'COUPLE_HAS_DATA';
    end if;
    delete from public.couples where id = v_current;
  end if;

  insert into public.couple_members (couple_id, profile_id) values (v_target.id, v_uid);
  return v_target.id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.leave_couple()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_couple uuid;
  v_left integer;
begin
  if v_uid is null then
    raise exception 'You''re not logged in' using errcode = '28000';
  end if;
  select couple_id into v_couple from public.couple_members where profile_id = v_uid;
  if v_couple is null then
    raise exception 'You''re not connected with a partner yet';
  end if;
  perform 1 from public.couples where id = v_couple for update;

  -- The leaver's own test results go with them, not with the archive.
  update public.assessment_results set couple_id = null where profile_id = v_uid and couple_id = v_couple;
  update public.mbti_results set couple_id = null where profile_id = v_uid and couple_id = v_couple;
  update public.spending_results set couple_id = null where profile_id = v_uid and couple_id = v_couple;
  delete from public.pet_care_roles where couple_id = v_couple and profile_id = v_uid;
  delete from public.couple_members where couple_id = v_couple and profile_id = v_uid;

  select count(*) into v_left from public.couple_members where couple_id = v_couple;
  if v_left = 0 then
    delete from public.couples where id = v_couple;
    return jsonb_build_object('couple_id', v_couple, 'deleted', true);
  end if;

  update public.couples
  set closed_at = now(), invite_expires_at = now()
  where id = v_couple;
  insert into public.activities (couple_id, actor_id, kind, summary, url)
  values (v_couple, v_uid, 'left', 'left this couple', '/app/profile');
  return jsonb_build_object('couple_id', v_couple, 'deleted', false);
end;
$function$
;

-- Activity lines read "<actor> <summary>", e.g. "Raka added the moment ...".
-- The mood line used to print the stored mood key (senang, capek, ...), which
-- is Indonesian; the English line leaves it out and format() ignores the
-- unused argument, so the call itself stays as it was.
CREATE OR REPLACE FUNCTION public.log_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_title text;
begin
  case tg_table_name
    when 'moments' then
      insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
      values (new.couple_id, new.created_by, 'moment', new.id,
              format('added the moment "%s"', left(new.title, 60)), '/app/moments/' || new.id);
    when 'moment_comments' then
      select title into v_title from public.moments where id = new.moment_id;
      insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
      values (new.couple_id, new.profile_id, 'comment', new.moment_id,
              format('commented on the moment "%s"', left(coalesce(v_title, ''), 60)), '/app/moments/' || new.moment_id);
    when 'moment_reactions' then
      if tg_op = 'INSERT' then
        select title into v_title from public.moments where id = new.moment_id;
        insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
        values (new.couple_id, new.profile_id, 'reaction', new.moment_id,
                format('reacted %s to the moment "%s"', new.emoji, left(coalesce(v_title, ''), 60)), '/app/moments/' || new.moment_id);
      end if;
    when 'mood_checkins' then
      if tg_op = 'INSERT' or new.mood is distinct from old.mood then
        insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
        values (new.couple_id, new.profile_id, 'mood', new.id,
                format('shared today''s mood', new.mood), '/app/mood');
      end if;
    when 'bucket_items' then
      if tg_op = 'INSERT' then
        insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
        values (new.couple_id, new.created_by, 'bucket_add', new.id,
                format('added "%s" to the bucket list', left(new.title, 60)), '/app/bucket-list');
      elsif new.is_done and not old.is_done then
        insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
        values (new.couple_id, auth.uid(), 'bucket_done', new.id,
                format('checked off "%s" on the bucket list', left(new.title, 60)), '/app/bucket-list');
      end if;
    when 'gratitude_notes' then
      insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
      values (new.couple_id, new.from_id, 'gratitude', new.id,
              'left a note of thanks in the Toples', '/app/toples');
    when 'letters' then
      insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
      values (new.couple_id, new.sender_id, 'letter', new.id,
              'wrote a letter', '/app/letters');
    when 'couple_events' then
      if coalesce(new.event_scope, 'couple') <> 'personal' and new.created_by is not null then
        insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
        values (new.couple_id, new.created_by, 'event', new.id,
                format('added "%s" to the calendar', left(new.title, 60)), '/app/calendar');
      end if;
    when 'couple_transactions' then
      insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
      values (new.couple_id, new.created_by, 'saving', new.id,
              case when new.amount >= 0
                then format('saved Rp %s', replace(to_char(new.amount, 'FM999,999,999,990'), ',', '.'))
                else format('took Rp %s out of savings', replace(to_char(abs(new.amount), 'FM999,999,999,990'), ',', '.'))
              end, '/app/finance');
    when 'daily_responses' then
      insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
      values (new.couple_id, new.profile_id, 'daily', new.id,
              'answered today''s question', '/app/home');
    else
      null;
  end case;
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.perform_pet_care(p_pet_id uuid, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_rules jsonb := public.pet_care_rules();
  v_rule jsonb := v_rules -> 'actions' -> p_action;
  v_pet public.couple_pets;
  v_mood public.pet_mood_state;
  v_last timestamptz;
  v_decay integer;
  h integer; ha integer; c integer;
  v_before text; v_after text;
  v_stat text;
  v_restore integer;
begin
  if v_rule is null then
    raise exception 'Unknown care action';
  end if;
  v_stat := v_rule ->> 'stat';
  v_restore := (v_rule ->> 'restore')::integer;

  -- Lock the pet: serialises two taps / two devices.
  select * into v_pet from public.couple_pets where id = p_pet_id for update;
  if not found or not public.is_couple_member(v_pet.couple_id) then
    raise exception 'Pet not found';
  end if;

  -- Role: members with role rows may only do their own actions.
  if exists (select 1 from public.pet_care_roles where pet_id = p_pet_id and profile_id = v_uid)
     and not exists (
       select 1 from public.pet_care_roles
       where pet_id = p_pet_id and profile_id = v_uid and p_action = any (actions)
     ) then
    raise exception 'That''s your partner''s job';
  end if;

  select max(done_at) into v_last
  from public.pet_care_logs where pet_id = p_pet_id and action_type = p_action;
  if v_last is not null
     and v_last + make_interval(mins => (v_rule ->> 'cooldown_minutes')::integer) > now() then
    raise exception 'Still on cooldown. Try again later.';
  end if;

  select * into v_mood from public.pet_mood_state where pet_id = p_pet_id for update;
  if not found then
    insert into public.pet_mood_state (pet_id) values (p_pet_id) returning * into v_mood;
  end if;

  v_decay := greatest(0, floor(
    extract(epoch from (now() - coalesce(v_mood.updated_at, now()))) / 3600
    * (v_rules ->> 'decay_per_hour')::numeric
  ))::integer;
  h  := greatest(0, v_mood.hunger - v_decay);
  ha := greatest(0, v_mood.happiness - v_decay);
  c  := greatest(0, v_mood.cleanliness - v_decay);
  v_before := public.pet_mood_of(h, ha, c);

  if v_stat = 'hunger' then h := least(100, h + v_restore);
  elsif v_stat = 'happiness' then ha := least(100, ha + v_restore);
  else c := least(100, c + v_restore);
  end if;
  v_after := public.pet_mood_of(h, ha, c);

  update public.pet_mood_state set
    hunger = h, happiness = ha, cleanliness = c, mood = v_after,
    thriving_since = case
      when v_after <> 'thriving' then null
      when v_before = 'thriving' and v_mood.thriving_since is not null then v_mood.thriving_since
      else now()
    end,
    updated_at = now()
  where id = v_mood.id;

  insert into public.pet_care_logs (pet_id, action_type, done_by) values (p_pet_id, p_action, v_uid);

  update public.couple_pets set
    xp = xp + (v_rules ->> 'xp_per_action')::integer,
    level = (xp + (v_rules ->> 'xp_per_action')::integer) / (v_rules ->> 'xp_per_level')::integer + 1
  where id = p_pet_id;

  return jsonb_build_object('hunger', h, 'happiness', ha, 'cleanliness', c, 'mood', v_after);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_goal_overdraw()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.goal_id is not null and new.amount < 0 then
    perform 1 from public.savings_goals where id = new.goal_id for update;
    if coalesce((select sum(amount) from public.couple_transactions where goal_id = new.goal_id), 0) + new.amount < 0 then
      raise exception 'The savings balance is too low for this withdrawal';
    end if;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.read_letter(p_letter_id uuid)
 RETURNS TABLE(id uuid, content text, is_opened boolean, opened_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_letter public.letters;
begin
  select * into v_letter from public.letters l where l.id = p_letter_id;
  if not found or not public.is_couple_member(v_letter.couple_id)
     or auth.uid() not in (v_letter.sender_id, v_letter.receiver_id) then
    raise exception 'Letter not found';
  end if;
  if v_letter.sender_id <> auth.uid() and v_letter.unlock_date > now() then
    raise exception 'This letter is still locked';
  end if;
  if v_letter.receiver_id = auth.uid() and not coalesce(v_letter.is_opened, false) then
    update public.letters set is_opened = true, opened_at = now()
    where letters.id = p_letter_id
    returning * into v_letter;
  end if;
  return query select v_letter.id, v_letter.content, v_letter.is_opened, v_letter.opened_at;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.regenerate_invite_code()
 RETURNS couples
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_couple uuid := public.get_my_couple_id();
  v_row public.couples;
begin
  if v_couple is null then
    raise exception 'You''re not connected with a partner yet';
  end if;
  select * into v_row from public.couples where id = v_couple for update;
  if v_row.closed_at is not null then
    raise exception 'This couple was closed when your partner left. Start a new couple space to invite someone else.';
  end if;
  if (select count(*) from public.couple_members where couple_id = v_couple) >= 2 then
    raise exception 'Your partner is already connected, so you don''t need an invite code anymore';
  end if;
  update public.couples
  set invite_code = public.generate_invite_code(), invite_expires_at = now() + interval '7 days'
  where id = v_couple
  returning * into v_row;
  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'You''re not logged in' using errcode = '28000';
  end if;
  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth_key)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth_key)
  on conflict (endpoint) do update
    set profile_id = excluded.profile_id,
        p256dh = excluded.p256dh,
        auth_key = excluded.auth_key,
        created_at = now();
end;
$function$
;

-- ============================================================
-- C. Text already written into rows
-- ============================================================

-- Activity feed lines written by log_activity() and leave_couple() before this
-- migration. Each update is anchored on the old template for that kind, so a
-- moment or bucket title inside the quotes is carried over untouched.
update public.activities set summary = regexp_replace(summary, '^menambahkan moment "(.*)"$', 'added the moment "\1"')
where kind = 'moment' and summary ~ '^menambahkan moment "(.*)"$';

update public.activities set summary = regexp_replace(summary, '^mengomentari moment "(.*)"$', 'commented on the moment "\1"')
where kind = 'comment' and summary ~ '^mengomentari moment "(.*)"$';

update public.activities set summary = regexp_replace(summary, '^memberi (\S+) di moment "(.*)"$', 'reacted \1 to the moment "\2"')
where kind = 'reaction' and summary ~ '^memberi (\S+) di moment "(.*)"$';

update public.activities set summary = 'shared today''s mood'
where kind = 'mood' and summary ~ '^lagi merasa .* hari ini$';

update public.activities set summary = regexp_replace(summary, '^menambahkan "(.*)" ke bucket list$', 'added "\1" to the bucket list')
where kind = 'bucket_add' and summary ~ '^menambahkan "(.*)" ke bucket list$';

update public.activities set summary = regexp_replace(summary, '^mencentang "(.*)" di bucket list$', 'checked off "\1" on the bucket list')
where kind = 'bucket_done' and summary ~ '^mencentang "(.*)" di bucket list$';

update public.activities set summary = 'left a note of thanks in the Toples'
where kind = 'gratitude' and summary = 'menaruh apresiasi baru di toples';

update public.activities set summary = 'wrote a letter'
where kind = 'letter' and summary = 'menulis surat rahasia';

update public.activities set summary = regexp_replace(summary, '^menambahkan "(.*)" ke kalender$', 'added "\1" to the calendar')
where kind = 'event' and summary ~ '^menambahkan "(.*)" ke kalender$';

update public.activities set summary = regexp_replace(summary, '^menabung Rp (.*)$', 'saved Rp \1')
where kind = 'saving' and summary ~ '^menabung Rp (.*)$';

update public.activities set summary = regexp_replace(summary, '^menarik Rp (.*) dari tabungan$', 'took Rp \1 out of savings')
where kind = 'saving' and summary ~ '^menarik Rp (.*) dari tabungan$';

update public.activities set summary = 'answered today''s question'
where kind = 'daily' and summary = 'menjawab pertanyaan hari ini';

update public.activities set summary = 'left this couple'
where kind = 'left' and summary = 'keluar dari pasangan ini';

-- Opening deposits written as "Saldo awal" by 20261026160000_server_rules.sql
-- (and by the savings wizard). Only the note changes, so balances stay equal;
-- the guard skips any goal whose balance is already below zero, where the
-- check_goal_not_negative trigger would refuse the update.
update public.couple_transactions t
set note = 'Opening balance'
where t.note = 'Saldo awal'
  and t.type = 'deposit'
  and coalesce((select sum(x.amount) from public.couple_transactions x where x.goal_id = t.goal_id), 0) >= 0;
