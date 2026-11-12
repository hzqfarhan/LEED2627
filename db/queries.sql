-- LEED 26 judging system: handy queries
-- Copy the one you need into psql or your database console. Nothing here runs by itself
-- in a harmful way, but read each block before running it.

-- ===========================================================================
-- 1. RESULTS
-- ===========================================================================

-- 1a. Leaderboard for one competition (average of judges' totals, highest first)
SELECT l.rank, l.stall_number, l.stall_name, l.colour, l.judges, l.average
FROM v_leaderboard l
JOIN competitions c ON c.id = l.competition_id
WHERE c.slug = 'stall'   -- 'stall' | 'video-marketing' | 'innovation-product' | 'business-pitch'
ORDER BY l.rank, l.stall_number;

-- 1b. Top 3 of every competition
SELECT c.name AS competition, l.rank, l.stall_number, l.stall_name, l.average, l.judges
FROM v_leaderboard l
JOIN competitions c ON c.id = l.competition_id
WHERE l.rank <= 3
ORDER BY c.position, l.rank, l.stall_number;

-- 1c. Average per criterion for one competition
SELECT st.number AS stall_number, k.position, k.name AS criterion,
       ROUND(AVG(ss.score), 2) AS average, COUNT(*) AS judges
FROM submissions s
JOIN submission_scores ss ON ss.submission_id = s.id
JOIN criteria k           ON k.id = ss.criterion_id
JOIN stalls st            ON st.id = s.stall_id
JOIN competitions c       ON c.id = s.competition_id
WHERE c.slug = 'video-marketing'
GROUP BY st.number, k.position, k.name
ORDER BY st.number, k.position;

-- 1d. Every individual score sheet (for the record / audit)
SELECT c.name AS competition, st.number AS stall_number, u.name AS judge,
       t.total, s.comment, s.updated_at
FROM submissions s
JOIN v_submission_totals t ON t.submission_id = s.id
JOIN competitions c        ON c.id = s.competition_id
JOIN stalls st             ON st.id = s.stall_id
JOIN users u               ON u.id = s.judge_id
ORDER BY c.position, st.number, u.name;

-- 1e. Judging progress: how many stalls each judge has scored per competition
SELECT u.name AS judge, c.name AS competition,
       COUNT(s.id) AS scored,
       (SELECT COUNT(*) FROM stalls) AS stalls
FROM judge_assignments a
JOIN users u        ON u.id = a.judge_id
JOIN competitions c ON c.id = a.competition_id
LEFT JOIN submissions s ON s.judge_id = a.judge_id AND s.competition_id = a.competition_id
GROUP BY u.name, c.name, c.position
ORDER BY c.position, u.name;

-- 1f. Stalls that still have fewer than N judges in a competition (here N = 2)
SELECT c.name AS competition, st.number AS stall_number, COUNT(s.id) AS judges_so_far
FROM competitions c
CROSS JOIN stalls st
LEFT JOIN submissions s ON s.competition_id = c.id AND s.stall_id = st.id
GROUP BY c.name, c.position, st.number
HAVING COUNT(s.id) < 2
ORDER BY c.position, st.number;

-- 1g. History of changes to one stall's scores
SELECT a.saved_at, u.name AS judge, a.scores, a.comment
FROM score_audit a
JOIN users u        ON u.id = a.judge_id
JOIN stalls st      ON st.id = a.stall_id
JOIN competitions c ON c.id = a.competition_id
WHERE c.slug = 'stall' AND st.number = 12
ORDER BY a.saved_at;

-- 1h. Customer Choice Award: most likes first
SELECT rank, stall_number, stall_name, likes, dislikes FROM v_customer_choice ORDER BY rank, stall_number;

-- 1i. Open / close Customer Choice voting
UPDATE settings SET value = 'false' WHERE key = 'voting_open';
UPDATE settings SET value = 'true'  WHERE key = 'voting_open';

-- ===========================================================================
-- 2. ACCOUNTS
-- ===========================================================================

-- 2a. Add a judge and assign them to competitions
WITH new_judge AS (
  INSERT INTO users (name, email, pin_hash, role)
  VALUES ('Dr. Example Name', lower('example@uthm.edu.my'), crypt('482913', gen_salt('bf')), 'judge')
  RETURNING id
)
INSERT INTO judge_assignments (judge_id, competition_id)
SELECT new_judge.id, c.id
FROM new_judge, competitions c
WHERE c.slug IN ('business-pitch', 'stall');

-- 2b. Change a PIN (do this for the admin account straight after seeding)
UPDATE users
SET pin_hash = crypt('new-pin-here', gen_salt('bf')), failed_logins = 0, locked_until = NULL
WHERE email = 'admin@leed26.local';

-- 2c. Unlock an account that entered the wrong PIN too many times
UPDATE users SET failed_logins = 0, locked_until = NULL WHERE email = 'judge1@leed26.local';

-- 2d. Give a preloaded panel judge a real email and PIN, switch them on and assign awards
WITH j AS (
  UPDATE users
  SET email = lower('noorhaniza@uthm.edu.my'), pin_hash = crypt('482913', gen_salt('bf')), is_active = TRUE
  WHERE name = 'Prof. Madya Dr Noorhaniza binti Wahid'
  RETURNING id
)
INSERT INTO judge_assignments (judge_id, competition_id)
SELECT j.id, c.id FROM j, competitions c WHERE c.slug IN ('stall', 'innovation-product')
ON CONFLICT DO NOTHING;

-- 2e. Remove the sample judges once the real ones are added (also removes their scores)
-- DELETE FROM users WHERE email LIKE 'judge%@leed26.local';

-- ===========================================================================
-- 3. COMPETITIONS AND CRITERIA
-- ===========================================================================

-- 3a. Set a judging window (Malaysia time)
UPDATE competitions
SET opens_at = '2026-12-09 10:00+08', closes_at = '2026-12-09 15:00+08'
WHERE slug = 'stall';

-- 3b. Close / reopen judging immediately
UPDATE competitions SET is_open = FALSE WHERE slug = 'stall';
UPDATE competitions SET is_open = TRUE  WHERE slug = 'stall';

-- 3c. Replace the PROVISIONAL Innovation Product rubric once the committee has one.
--     Only do this BEFORE any Innovation Product scores exist: deleting a criterion deletes its scores.
--     marks = full marks for the criterion; levels = what level 0, 1, 2, 3, 4, 5 mean.
-- BEGIN;
-- DELETE FROM criteria WHERE competition_id = (SELECT id FROM competitions WHERE slug = 'innovation-product');
-- INSERT INTO criteria (competition_id, position, name, description, weight, levels)
-- SELECT c.id, v.position, v.name, v.description, v.marks / 5.0, v.levels
-- FROM competitions c,
--      (VALUES (1, 'First criterion', 'What the judges look for', 5,
--               ARRAY['No submission.', 'Level 1 wording', 'Level 2 wording', 'Level 3 wording', 'Level 4 wording', 'Level 5 wording'])
--      ) AS v(position, name, description, marks, levels)
-- WHERE c.slug = 'innovation-product';
-- COMMIT;

-- 3d. Change a criterion's full marks (here: 10 marks instead of 5)
UPDATE criteria SET weight = 10 / 5.0
WHERE competition_id = (SELECT id FROM competitions WHERE slug = 'business-pitch') AND position = 1;

-- ===========================================================================
-- 4. STALLS
-- ===========================================================================

-- 4a. Fill in one stall
UPDATE stalls
SET name = 'Kopi Kampus', group_name = 'Group 7', cluster = 'food', colour = 'yellow',
    description = 'Iced coffee and kuih', instagram = 'kopikampus', updated_at = now()
WHERE number = 7;

-- 4b. Bulk load stalls from a list (edit the VALUES rows)
UPDATE stalls s
SET name = v.name, group_name = v.group_name, cluster = v.cluster, colour = v.colour, updated_at = now()
FROM (VALUES
  (1, 'Example Stall A', 'Group 1', 'food',    'pink'),
  (2, 'Example Stall B', 'Group 2', 'fashion', 'pink')
) AS v(number, name, group_name, cluster, colour)
WHERE s.number = v.number;

-- 4c. Set (or replace) one stall team's PIN
UPDATE stalls
SET pin_hash = crypt('482913', gen_salt('bf')), pin_fails = 0, pin_locked_until = NULL
WHERE number = 7;

-- 4d. Which stalls still have no team PIN, or no video links
SELECT number, name,
       (pin_hash IS NOT NULL)            AS has_team_pin,
       (pitch_url IS NOT NULL)           AS has_pitch_video,
       COALESCE(array_length(promo_urls, 1), 0) AS promo_videos
FROM stalls
ORDER BY number;

-- 4e. Publish results to everyone / hide them again
INSERT INTO settings (key, value) VALUES ('results_published', 'true')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
-- UPDATE settings SET value = 'false' WHERE key = 'results_published';

-- ===========================================================================
-- 5. MEMORY WALL
-- ===========================================================================

-- 5a. Add a photo, a video file, or a YouTube video (url = the YouTube id)
INSERT INTO memories (kind, url, caption, author, year, status) VALUES
  ('image',   'https://example.com/photos/leed25-opening.jpg', 'Opening ceremony', 'LEED committee', 2025, 'approved'),
  ('video',   '/memories/leed25-recap.mp4',                    'LEED 25 recap',    'LEED committee', 2025, 'approved'),
  ('youtube', 'YOUTUBE_ID_',                                   'Stall 12 promo',   'Group 12',       2025, 'approved');

-- 5b. See what is waiting for approval, then approve or hide
SELECT id, kind, url, caption, author, created_at FROM memories WHERE status = 'pending' ORDER BY created_at;
UPDATE memories SET status = 'approved' WHERE id = 0;   -- put the id here
UPDATE memories SET status = 'hidden'   WHERE id = 0;

-- ===========================================================================
-- 6. RESET (dangerous)
-- ===========================================================================

-- 6a. Wipe all scores but keep stalls, judges and criteria (for a rehearsal)
-- TRUNCATE submission_scores, submissions, score_audit RESTART IDENTITY;
