-- LEED 26 judging system: starting data
-- Run after schema.sql. Safe to re-run (existing rows are left alone).

-- ---------------------------------------------------------------------------
-- 1. Score sheets and their rubrics ("The Competition", Appendix B)
--    Stall Competition (Component B: Product, Price, Place, Promotion, Customer Service,
--    5 marks each), Impressive Video Marketing (Component D, 25 marks) and Best Business
--    Pitch with Innovation Element (Component C, 15 marks). Levels run 0 to 5; a level is
--    worth level x marks / 5.
--    The stall element awards and Outstanding Stall are half these jury marks and half
--    visitors' ratings (customer_ratings). People Choice uses customer_votes and the viral
--    video award uses viral_videos.
--
--    Generated from lib/awards.ts. Re-running this file refreshes names, descriptions
--    and rubrics only for competitions that have no scores yet.
-- ---------------------------------------------------------------------------
INSERT INTO competitions (slug, name, description, position, scale_min, scale_max) VALUES
  ('stall', 'Stall Competition', 'Judged at the stall on 9 December, 12:00 pm to 5:00 pm. Rubric: BIT21603 Component B. These marks are the jury half of Outstanding Stall and the four stall element awards; visitors rate the same elements for the other half.', 1, 0, 5),
  ('video-marketing', 'Impressive Video Marketing', 'Each group may post up to 3 videos; give one set of marks covering all of them. The links are on this sheet. Rubric: BIT21603 Component D.', 2, 0, 5),
  ('business-pitch', 'Best Business Pitch with Innovation Element', 'Score the 2 to 3 minute pitch video (link on this sheet). Rubric: BIT21603 Component C, including UN SDG 8 (Decent Work and Economic Growth).', 3, 0, 5)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name, description = EXCLUDED.description, position = EXCLUDED.position,
    scale_min = EXCLUDED.scale_min, scale_max = EXCLUDED.scale_max
WHERE NOT EXISTS (SELECT 1 FROM submissions s WHERE s.competition_id = competitions.id);

-- Earlier drafts had 'customer-service' and 'innovation-product' sheets. Customer service is
-- now part of the Stall Competition, and innovation is judged in the Business Pitch.
DELETE FROM competitions c
WHERE c.slug IN ('customer-service', 'innovation-product')
  AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.competition_id = c.id);

-- Replace rubrics of competitions nobody has scored yet.
DELETE FROM criteria k
WHERE NOT EXISTS (SELECT 1 FROM submissions s WHERE s.competition_id = k.competition_id);

INSERT INTO criteria (competition_id, position, name, description, weight, levels)
SELECT c.id, v.position, v.name, v.description, v.marks / 5.0, v.levels
FROM (VALUES
  ('stall', 1, 'Product', 'Creativity, quality and attractive presentation of the product or service.', 5, ARRAY['No implementation.', 'Very poor quality, messy.', 'Poor quality, weak presentation.', 'Adequate quality and presentation.', 'Creative, good quality, neat presentation.', 'Highly creative, superior quality, attractive.']),
  ('stall', 2, 'Price', 'Competitive pricing grounded in at least 2 competitor benchmarks.', 5, ARRAY['No implementation.', 'Inappropriate pricing model.', 'Overpriced, or no competitors compared.', 'Reasonable, minimal competitor reference.', 'Competitive, 1 to 2 competitor comparisons.', 'Highly competitive, affordable, 2 or more competitors compared.']),
  ('stall', 3, 'Place', 'The stall itself: clean, charming and set up for its target customers.', 5, ARRAY['No implementation.', 'Incorrect or missing audience definition.', 'Vague audience; mismatched platform.', 'Target audience identified; standard choice.', 'Clear target audience; strong channel rationale.', 'Deep, data-backed audience insight; channel aligned.']),
  ('stall', 4, 'Promotion', 'Visual appeal, campaign reach and promotional engagement.', 5, ARRAY['No implementation.', 'Poor visuals; no promotional effort.', 'Weak visuals; ineffective campaign.', 'Acceptable visuals; predictable campaign.', 'Attractive visuals and effective campaign.', 'Attractive visuals, high reach and engagement.']),
  ('stall', 5, 'Customer Service', 'Provisional wording: friendliness, helpfulness and speed of service at the stall.', 5, ARRAY['No implementation.', 'Customers ignored or treated rudely.', 'Slow or unhelpful service.', 'Polite; answers basic questions.', 'Friendly and quick; explains the product well.', 'Warm, proactive, memorable service for every customer.']),
  ('video-marketing', 1, 'Promotional Engagement', 'Creativity and capacity to motivate consumer action.', 5, ARRAY['No submission.', 'Ineffective; fails its engagement purpose.', 'Low engagement; weak call to action.', 'Moderate engagement; achieves the basic objective.', 'Engaging content that motivates viewer action.', 'Highly engaging, creative, strongly drives viewer action.']),
  ('video-marketing', 2, 'Core Value Points', 'Clear communication of core selling points (3 or more USPs).', 5, ARRAY['No submission.', 'Complete lack of message clarity or selling points.', 'Unclear message; minimal value highlights.', 'Fair clarity, highlighting 1 core selling proposition.', 'Clear message highlighting 2 core selling propositions.', 'Exceptional clarity; highlights 3 or more unique selling propositions.']),
  ('video-marketing', 3, 'Visual Impact & Branding', 'Visual aesthetics, graphic quality and brand alignment.', 5, ARRAY['No submission.', 'No visual branding elements.', 'Weak, distracting or unpolished visuals.', 'Minimal visual graphics; partial brand support.', 'High-quality visuals that support brand presentation.', 'Superior brand visuals, graphics and aesthetic appeal.']),
  ('video-marketing', 4, 'Audio Quality & Balance', 'Clarity, volume balance and soundtrack coordination.', 5, ARRAY['No submission.', 'Unusable audio quality.', 'Poor audio coordination or background noise.', 'Adequate audio with minor volume imbalance.', 'Clear, well-balanced audio tracking.', 'Crystal clear audio, balanced mix, complements the video.']),
  ('video-marketing', 5, 'Editing & Production', 'Camera stability, scene transitions and production polish.', 5, ARRAY['No submission.', 'Substandard editing and camera control.', 'Unsteady footage; weak scene transitions.', 'Adequate camera focus with basic editing.', 'Steady camera work with effective scene transitions.', 'Sharp, steady camera work with professional transitions.']),
  ('business-pitch', 1, 'Concept & Innovation', 'Uniqueness of the value proposition, technological integration and original product or service solution.', 5, ARRAY['No submission.', 'Poor concept; no technological link.', 'Weak concept; minimal tech integration.', 'Adequate concept with a basic tech link.', 'Creative, trend-aligned, with good technology application.', 'Highly unique, trend-aligned, strong tech integration.']),
  ('business-pitch', 2, 'Presentation & Demonstration', 'Engaging pitch narrative, crisp visual quality, clear product demonstration and professional editing.', 5, ARRAY['No submission.', 'Poor visual quality; no product demo.', 'Weak visuals; unclear product demo.', 'Adequate visual presentation and basic demo.', 'Engaging narrative with clear visuals and product demo.', 'Highly engaging narrative, crisp visuals, effective demo.']),
  ('business-pitch', 3, 'Feasibility & SDG 8 Alignment', 'Realism of the business model, market opportunity, financial viability and explicit UN SDG 8 alignment.', 5, ARRAY['No submission.', 'Unrealistic model; no market demand or SDG 8 alignment.', 'Weak model; vague market and superficial SDG 8 link.', 'Adequate model with basic SDG 8 and market understanding.', 'Realistic model with clear SDG 8 relevance and market demand.', 'Robust model; exceptional SDG 8 integration (decent work and economic growth).'])
) AS v(slug, position, name, description, marks, levels)
JOIN competitions c ON c.slug = v.slug
ON CONFLICT (competition_id, position) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Panel of judges (event proposal, Lampiran 3) and judging unit (Lampiran 2).
-- They are created SWITCHED OFF with placeholder emails. Give each one their real UTHM
-- email in the admin console (Judges and admins > Import, or edit one by one); that
-- switches them on, and they sign in with UTHM SSO.
-- ---------------------------------------------------------------------------
INSERT INTO users (name, email, role, is_active) VALUES
  ('Prof. Madya Dr Noorhaniza binti Wahid', 'juri01@pending.leed26.local', 'judge', FALSE),
  ('Dr Rahayu binti A.Hamid', 'juri02@pending.leed26.local', 'judge', FALSE),
  ('Dr Norhanifah binti Murli', 'juri03@pending.leed26.local', 'judge', FALSE),
  ('Dr Che Samihah binti Che Dalim', 'juri04@pending.leed26.local', 'judge', FALSE),
  ('En. Muhamad Fakri bin Othman', 'juri05@pending.leed26.local', 'judge', FALSE),
  ('Dr Nur Arifin bin Mohd Zin', 'juri06@pending.leed26.local', 'judge', FALSE),
  ('Dr Mohamad Zanes bin Shahid', 'juri07@pending.leed26.local', 'judge', FALSE),
  ('Dr Mohamad Hamdi Irwan bin Hamzah', 'juri08@pending.leed26.local', 'judge', FALSE),
  ('PM Dr Noraini binti Ibrahim', 'juri09@pending.leed26.local', 'judge', FALSE),
  ('Puan Norhanim binti Selamat', 'juri10@pending.leed26.local', 'judge', FALSE),
  ('Dr Shahdatunnaim binti Azmi', 'juri11@pending.leed26.local', 'judge', FALSE),
  ('Dr Mazidah binti Rejab', 'juri12@pending.leed26.local', 'judge', FALSE),
  ('Dr Rabatul Aduni binti Sulaiman', 'juri13@pending.leed26.local', 'judge', FALSE),
  ('Dr Nurezayana binti Zainal', 'juri14@pending.leed26.local', 'judge', FALSE),
  ('Puan Norlida binti Hassan', 'juri15@pending.leed26.local', 'judge', FALSE),
  ('Dr Yana Mazwin binti Mohmad Hassim', 'juri16@pending.leed26.local', 'judge', FALSE),
  ('Prof Madya Dr Isredza Rahmi binti Hamid', 'juri17@pending.leed26.local', 'judge', FALSE),
  ('Ts. Dr Suziyanti binti Marjudi Hassan', 'juri18@pending.leed26.local', 'judge', FALSE),
  ('Dr Radiah binti Mohamad', 'juri19@pending.leed26.local', 'judge', FALSE),
  ('Prof Madya Dr Shahreen binti Kassim', 'juri20@pending.leed26.local', 'judge', FALSE),
  ('Dr Nurul Hidayah binti Ab. Rahman', 'juri21@pending.leed26.local', 'judge', FALSE),
  ('Dr Mohamad Firdaus bin Ab Aziz', 'juri22@pending.leed26.local', 'judge', FALSE),
  ('Pn Ruhaya binti Ab Aziz', 'juri23@pending.leed26.local', 'judge', FALSE),
  ('Pn Rozlini binti Mohamed', 'juri24@pending.leed26.local', 'judge', FALSE),
  ('Dr Norhamreeza binti Abdul Hamid', 'juri25@pending.leed26.local', 'judge', FALSE),
  ('Puan Zuraida binti Bosri', 'juri26@pending.leed26.local', 'judge', FALSE),
  ('Dr Mohamad Aizi bin Salamat', 'juri27@pending.leed26.local', 'judge', FALSE),
  ('En Muhammad Shukri bin Che Lah', 'juri28@pending.leed26.local', 'judge', FALSE),
  ('En Khairul Amin bin Mohamad Sukri', 'juri29@pending.leed26.local', 'judge', FALSE),
  ('Ts Dr Mohd Norasri bin Ismail', 'juri30@pending.leed26.local', 'judge', FALSE),
  ('Dr Ezak Fadzrin bin Ahmad Shaubari', 'penjurian01@pending.leed26.local', 'admin', FALSE),
  ('Ts Dr Mohd Amin bin Mohd Yunus', 'penjurian02@pending.leed26.local', 'admin', FALSE),
  ('Ts Dr Deden Witarsyah', 'penjurian03@pending.leed26.local', 'admin', FALSE)
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

-- ---------------------------------------------------------------------------
-- 3. Accounts
--    Everyone signs in with their UTHM Google account. There are no sample accounts.
--    The first admins come from ADMIN_EMAILS in the environment (see .env.example):
--    they become admins the first time they sign in. Judges are added by email in
--    the admin console. Sellers are added to their stall team by the committee or
--    their team leader.
-- ---------------------------------------------------------------------------
