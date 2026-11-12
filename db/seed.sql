-- LEED 26 judging system: starting data
-- Run after schema.sql. Safe to re-run (existing rows are left alone).

-- ---------------------------------------------------------------------------
-- 1. Competitions (awards) and their rubrics
--    Best Stall, Best Marketing Video and Business Pitching Idea use the BIT21603
--    Component B, D and C rubrics (levels 0 to 5; a level is worth level x marks / 5).
--    Innovation Product has a PROVISIONAL rubric: replace it before judging opens.
--    The Customer Choice Award is decided by visitor votes (customer_votes), not judges.
--
--    Generated from lib/awards.ts. Re-running this file refreshes names, descriptions
--    and rubrics only for competitions that have no scores yet.
-- ---------------------------------------------------------------------------
INSERT INTO competitions (slug, name, description, position, scale_min, scale_max) VALUES
  ('stall', 'Best Stall', 'Judged at the stall on 9 December, 12:00 pm to 5:00 pm. Rubric: BIT21603 Component B (Practical Implementation); customer service is marked in class, not here.', 1, 0, 5),
  ('video-marketing', 'Best Marketing Video', 'Each group may post up to 3 videos; give one set of marks covering all of them. The links are on this sheet. Rubric: BIT21603 Component D.', 2, 0, 5),
  ('innovation-product', 'Innovation Product', 'Provisional rubric: no rubric was given for this award yet. Replace these criteria before judging opens.', 3, 0, 5),
  ('business-pitch', 'Business Pitching Idea', 'Score the 2 to 3 minute pitch video (link on this sheet). Rubric: BIT21603 Component C, including UN SDG 8 (Decent Work and Economic Growth).', 4, 0, 5)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name, description = EXCLUDED.description, position = EXCLUDED.position,
    scale_min = EXCLUDED.scale_min, scale_max = EXCLUDED.scale_max
WHERE NOT EXISTS (SELECT 1 FROM submissions s WHERE s.competition_id = competitions.id);

-- Replace rubrics of competitions nobody has scored yet.
DELETE FROM criteria k
WHERE NOT EXISTS (SELECT 1 FROM submissions s WHERE s.competition_id = k.competition_id);

INSERT INTO criteria (competition_id, position, name, description, weight, levels)
SELECT c.id, v.position, v.name, v.description, v.marks / 5.0, v.levels
FROM (VALUES
  ('stall', 1, 'Product / Service', 'Creativity, quality and attractive presentation.', 4, ARRAY['No implementation.', 'Very poor quality, messy.', 'Poor quality, weak presentation.', 'Adequate quality and presentation.', 'Creative, good quality, neat presentation.', 'Highly creative, superior quality, attractive.']),
  ('stall', 2, 'Price Strategy', 'Competitive pricing grounded in at least 2 competitor benchmarks.', 5, ARRAY['No implementation.', 'Inappropriate pricing model.', 'Overpriced, or no competitors compared.', 'Reasonable, minimal competitor reference.', 'Competitive, 1 to 2 competitor comparisons.', 'Highly competitive, affordable, 2 or more competitors compared.']),
  ('stall', 3, 'Place (Targeting)', 'Strategic alignment between target market and channels.', 4, ARRAY['No implementation.', 'Incorrect or missing audience definition.', 'Vague audience; mismatched platform.', 'Target audience identified; standard choice.', 'Clear target audience; strong channel rationale.', 'Deep, data-backed audience insight; channel aligned.']),
  ('stall', 4, 'Promotion', 'Visual appeal, campaign reach and promotional engagement.', 5, ARRAY['No implementation.', 'Poor visuals; no promotional effort.', 'Weak visuals; ineffective campaign.', 'Acceptable visuals; predictable campaign.', 'Attractive visuals and effective campaign.', 'Attractive visuals, high reach and engagement.']),
  ('video-marketing', 1, 'Promotional Engagement', 'Creativity and capacity to motivate consumer action.', 5, ARRAY['No submission.', 'Ineffective; fails its engagement purpose.', 'Low engagement; weak call to action.', 'Moderate engagement; achieves the basic objective.', 'Engaging content that motivates viewer action.', 'Highly engaging, creative, strongly drives viewer action.']),
  ('video-marketing', 2, 'Core Value Points', 'Clear communication of core selling points (3 or more USPs).', 5, ARRAY['No submission.', 'Complete lack of message clarity or selling points.', 'Unclear message; minimal value highlights.', 'Fair clarity, highlighting 1 core selling proposition.', 'Clear message highlighting 2 core selling propositions.', 'Exceptional clarity; highlights 3 or more unique selling propositions.']),
  ('video-marketing', 3, 'Visual Impact & Branding', 'Visual aesthetics, graphic quality and brand alignment.', 5, ARRAY['No submission.', 'No visual branding elements.', 'Weak, distracting or unpolished visuals.', 'Minimal visual graphics; partial brand support.', 'High-quality visuals that support brand presentation.', 'Superior brand visuals, graphics and aesthetic appeal.']),
  ('video-marketing', 4, 'Audio Quality & Balance', 'Clarity, volume balance and soundtrack coordination.', 5, ARRAY['No submission.', 'Unusable audio quality.', 'Poor audio coordination or background noise.', 'Adequate audio with minor volume imbalance.', 'Clear, well-balanced audio tracking.', 'Crystal clear audio, balanced mix, complements the video.']),
  ('video-marketing', 5, 'Editing & Production', 'Camera stability, scene transitions and production polish.', 5, ARRAY['No submission.', 'Substandard editing and camera control.', 'Unsteady footage; weak scene transitions.', 'Adequate camera focus with basic editing.', 'Steady camera work with effective scene transitions.', 'Sharp, steady camera work with professional transitions.']),
  ('innovation-product', 1, 'Novelty', 'Provisional. How original the product or service is.', 5, ARRAY['No submission.', 'Copies an existing product with no change.', 'Small change to an existing product.', 'Some original elements.', 'Clearly original idea with a distinct twist.', 'Highly original; nothing like it on campus.']),
  ('innovation-product', 2, 'Use of Technology', 'Provisional. How well technology is used in the product, its making or its selling.', 5, ARRAY['No submission.', 'No technology involved.', 'Technology mentioned but barely used.', 'Basic, sensible use of technology.', 'Good technology use that adds value.', 'Technology is central and well executed.']),
  ('innovation-product', 3, 'Problem Solved', 'Provisional. How clearly it meets a real need for its customers.', 5, ARRAY['No submission.', 'No clear need.', 'Weak or unclear need.', 'A real but minor need.', 'A clear need, well addressed.', 'An important need, convincingly solved.']),
  ('innovation-product', 4, 'Market Potential', 'Provisional. How likely it is to sell beyond LEED.', 5, ARRAY['No submission.', 'No market beyond the event.', 'Very small or unclear market.', 'Some market, limited growth.', 'Clear market with growth potential.', 'Strong, scalable market opportunity.']),
  ('business-pitch', 1, 'Concept & Innovation', 'Uniqueness of the value proposition, technological integration and original product or service solution.', 5, ARRAY['No submission.', 'Poor concept; no technological link.', 'Weak concept; minimal tech integration.', 'Adequate concept with a basic tech link.', 'Creative, trend-aligned, with good technology application.', 'Highly unique, trend-aligned, strong tech integration.']),
  ('business-pitch', 2, 'Presentation & Demonstration', 'Engaging pitch narrative, crisp visual quality, clear product demonstration and professional editing.', 5, ARRAY['No submission.', 'Poor visual quality; no product demo.', 'Weak visuals; unclear product demo.', 'Adequate visual presentation and basic demo.', 'Engaging narrative with clear visuals and product demo.', 'Highly engaging narrative, crisp visuals, effective demo.']),
  ('business-pitch', 3, 'Feasibility & SDG 8 Alignment', 'Realism of the business model, market opportunity, financial viability and explicit UN SDG 8 alignment.', 5, ARRAY['No submission.', 'Unrealistic model; no market demand or SDG 8 alignment.', 'Weak model; vague market and superficial SDG 8 link.', 'Adequate model with basic SDG 8 and market understanding.', 'Realistic model with clear SDG 8 relevance and market demand.', 'Robust model; exceptional SDG 8 integration (decent work and economic growth).'])
) AS v(slug, position, name, description, marks, levels)
JOIN competitions c ON c.slug = v.slug
ON CONFLICT (competition_id, position) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Panel of judges (event proposal, Lampiran 3) and judging unit (Lampiran 2).
-- They are created SWITCHED OFF with placeholder emails and no usable PIN.
-- Give each one a real email and PIN in the admin console (Judges and admins >
-- Import from CSV, or edit one by one); that also switches them on.
-- ---------------------------------------------------------------------------
INSERT INTO users (name, email, pin_hash, role, is_active) VALUES
  ('Prof. Madya Dr Noorhaniza binti Wahid', 'juri01@pending.leed26.local', crypt(gen_random_uuid()::text, gen_salt('bf')), 'judge', FALSE),
  ('Dr Rahayu binti A.Hamid', 'juri02@pending.leed26.local', crypt(gen_random_uuid()::text, gen_salt('bf')), 'judge', FALSE),
  ('Dr Norhanifah binti Murli', 'juri03@pending.leed26.local', crypt(gen_random_uuid()::text, gen_salt('bf')), 'judge', FALSE),
  ('Dr Che Samihah binti Che Dalim', 'juri04@pending.leed26.local', crypt(gen_random_uuid()::text, gen_salt('bf')), 'judge', FALSE),
  ('En. Muhamad Fakri bin Othman', 'juri05@pending.leed26.local', crypt(gen_random_uuid()::text, gen_salt('bf')), 'judge', FALSE),
  ('Dr Nur Arifin bin Mohd Zin', 'juri06@pending.leed26.local', crypt(gen_random_uuid()::text, gen_salt('bf')), 'judge', FALSE),
  ('Dr Mohamad Zanes bin Shahid', 'juri07@pending.leed26.local', crypt(gen_random_uuid()::text, gen_salt('bf')), 'judge', FALSE),
  ('Dr Mohamad Hamdi Irwan bin Hamzah', 'juri08@pending.leed26.local', crypt(gen_random_uuid()::text, gen_salt('bf')), 'judge', FALSE),
  ('PM Dr Noraini binti Ibrahim', 'juri09@pending.leed26.local', crypt(gen_random_uuid()::text, gen_salt('bf')), 'judge', FALSE),
  ('Puan Norhanim binti Selamat', 'juri10@pending.leed26.local', crypt(gen_random_uuid()::text, gen_salt('bf')), 'judge', FALSE),
  ('Dr Shahdatunnaim binti Azmi', 'juri11@pending.leed26.local', crypt(gen_random_uuid()::text, gen_salt('bf')), 'judge', FALSE),
  ('Dr Mazidah binti Rejab', 'juri12@pending.leed26.local', crypt(gen_random_uuid()::text, gen_salt('bf')), 'judge', FALSE),
  ('Dr Rabatul Aduni binti Sulaiman', 'juri13@pending.leed26.local', crypt(gen_random_uuid()::text, gen_salt('bf')), 'judge', FALSE),
  ('Dr Nurezayana binti Zainal', 'juri14@pending.leed26.local', crypt(gen_random_uuid()::text, gen_salt('bf')), 'judge', FALSE),
  ('Puan Norlida binti Hassan', 'juri15@pending.leed26.local', crypt(gen_random_uuid()::text, gen_salt('bf')), 'judge', FALSE),
  ('Dr Yana Mazwin binti Mohmad Hassim', 'juri16@pending.leed26.local', crypt(gen_random_uuid()::text, gen_salt('bf')), 'judge', FALSE),
  ('Prof Madya Dr Isredza Rahmi binti Hamid', 'juri17@pending.leed26.local', crypt(gen_random_uuid()::text, gen_salt('bf')), 'judge', FALSE),
  ('Ts. Dr Suziyanti binti Marjudi Hassan', 'juri18@pending.leed26.local', crypt(gen_random_uuid()::text, gen_salt('bf')), 'judge', FALSE),
  ('Dr Radiah binti Mohamad', 'juri19@pending.leed26.local', crypt(gen_random_uuid()::text, gen_salt('bf')), 'judge', FALSE),
  ('Prof Madya Dr Shahreen binti Kassim', 'juri20@pending.leed26.local', crypt(gen_random_uuid()::text, gen_salt('bf')), 'judge', FALSE),
  ('Dr Nurul Hidayah binti Ab. Rahman', 'juri21@pending.leed26.local', crypt(gen_random_uuid()::text, gen_salt('bf')), 'judge', FALSE),
  ('Dr Mohamad Firdaus bin Ab Aziz', 'juri22@pending.leed26.local', crypt(gen_random_uuid()::text, gen_salt('bf')), 'judge', FALSE),
  ('Pn Ruhaya binti Ab Aziz', 'juri23@pending.leed26.local', crypt(gen_random_uuid()::text, gen_salt('bf')), 'judge', FALSE),
  ('Pn Rozlini binti Mohamed', 'juri24@pending.leed26.local', crypt(gen_random_uuid()::text, gen_salt('bf')), 'judge', FALSE),
  ('Dr Norhamreeza binti Abdul Hamid', 'juri25@pending.leed26.local', crypt(gen_random_uuid()::text, gen_salt('bf')), 'judge', FALSE),
  ('Puan Zuraida binti Bosri', 'juri26@pending.leed26.local', crypt(gen_random_uuid()::text, gen_salt('bf')), 'judge', FALSE),
  ('Dr Mohamad Aizi bin Salamat', 'juri27@pending.leed26.local', crypt(gen_random_uuid()::text, gen_salt('bf')), 'judge', FALSE),
  ('En Muhammad Shukri bin Che Lah', 'juri28@pending.leed26.local', crypt(gen_random_uuid()::text, gen_salt('bf')), 'judge', FALSE),
  ('En Khairul Amin bin Mohamad Sukri', 'juri29@pending.leed26.local', crypt(gen_random_uuid()::text, gen_salt('bf')), 'judge', FALSE),
  ('Ts Dr Mohd Norasri bin Ismail', 'juri30@pending.leed26.local', crypt(gen_random_uuid()::text, gen_salt('bf')), 'judge', FALSE),
  ('Dr Ezak Fadzrin bin Ahmad Shaubari', 'penjurian01@pending.leed26.local', crypt(gen_random_uuid()::text, gen_salt('bf')), 'admin', FALSE),
  ('Ts Dr Mohd Amin bin Mohd Yunus', 'penjurian02@pending.leed26.local', crypt(gen_random_uuid()::text, gen_salt('bf')), 'admin', FALSE),
  ('Ts Dr Deden Witarsyah', 'penjurian03@pending.leed26.local', crypt(gen_random_uuid()::text, gen_salt('bf')), 'admin', FALSE)
ON CONFLICT (email) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 2. Stalls 1 to 40 (matches the tent layout)
--    Names, groups and clusters are filled in from the admin console.
--    Canopy colours are PROVISIONAL (blocks of eight); correct them in the console.
-- ---------------------------------------------------------------------------
INSERT INTO stalls (number, name, colour)
SELECT n,
       'Stall ' || lpad(n::text, 2, '0'),
       (ARRAY['pink', 'blue', 'green', 'yellow', 'red'])[(n - 1) / 8 + 1]
FROM generate_series(1, 40) AS n
ON CONFLICT (number) DO NOTHING;

-- Results stay private until an admin publishes them.
INSERT INTO settings (key, value) VALUES ('results_published', 'false'), ('voting_open', 'true')
ON CONFLICT (key) DO NOTHING;

-- Stall teams sign in with their stall number and a team PIN. No PINs are seeded:
-- create them in the admin console (Stalls > Create team PINs) and hand them out.

-- ---------------------------------------------------------------------------
-- 3. Accounts
--    CHANGE THESE PINS before the event (see db/queries.sql, section 2).
--      admin@leed26.local   PIN change-me-26
--      judge1@leed26.local  PIN 111111
--      judge2@leed26.local  PIN 222222
--      judge3@leed26.local  PIN 333333
-- ---------------------------------------------------------------------------
INSERT INTO users (name, email, pin_hash, role) VALUES
  ('LEED 26 Admin', 'admin@leed26.local',  crypt('change-me-26', gen_salt('bf')), 'admin'),
  ('Sample Judge 1', 'judge1@leed26.local', crypt('111111', gen_salt('bf')), 'judge'),
  ('Sample Judge 2', 'judge2@leed26.local', crypt('222222', gen_salt('bf')), 'judge'),
  ('Sample Judge 3', 'judge3@leed26.local', crypt('333333', gen_salt('bf')), 'judge')
ON CONFLICT (email) DO NOTHING;

-- Every sample judge scores every competition.
-- (The real panel above is assigned in the admin console or by CSV import.)
INSERT INTO judge_assignments (judge_id, competition_id)
SELECT u.id, c.id
FROM users u CROSS JOIN competitions c
WHERE u.role = 'judge' AND u.email LIKE 'judge%@leed26.local'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Memory wall: sample notes so the wall is not empty on day one.
--    These have no photo. Replace them with real photos and videos
--    (admin console, or INSERT rows with kind 'image' / 'video' / 'youtube').
-- ---------------------------------------------------------------------------
INSERT INTO memories (kind, url, caption, author, year, status)
SELECT 'note', NULL, v.caption, 'LEED committee', 2025, 'approved'
FROM (VALUES
  ('Setting up before sunrise'),
  ('First sale of the day'),
  ('The queue that never ended'),
  ('Sold out by noon'),
  ('Team photo, finally'),
  ('Rain did not stop us'),
  ('Judges at our stall'),
  ('Lucky draw time'),
  ('Our banner survived the wind'),
  ('Free samples, gone in minutes'),
  ('Counting the takings'),
  ('Packing up. See you next year')
) AS v(caption)
WHERE NOT EXISTS (SELECT 1 FROM memories);
