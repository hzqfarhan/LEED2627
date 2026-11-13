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
WHERE c.slug = 'stall'   -- 'stall' | 'video-marketing' | 'business-pitch'
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

-- 1h. People Choice Award: most likes first (1 winner)
SELECT rank, stall_number, stall_name, likes, dislikes FROM v_customer_choice ORDER BY rank, stall_number;

-- 1i. Open / close visitor voting and star ratings
UPDATE settings SET value = 'false' WHERE key = 'voting_open';
UPDATE settings SET value = 'true'  WHERE key = 'voting_open';

-- 1j. Customer ratings: average stars and customer marks per stall and element
SELECT stall_number, stall_name, criterion, avg_stars, customer_marks, raters
FROM v_customer_ratings ORDER BY stall_number, position;

-- 1k. Outstanding Stall (50 marks) = jury average marks (25) + customer marks (25).
--     For an element award, keep only its criteria in the two WHERE k.name IN (...) lines:
--       Clean and Charming Stall   ('Place')
--       Brilliant Stall Promotions ('Promotion')
--       Hottest Product            ('Product', 'Price')
--       Superb Customer Service    ('Customer Service')
WITH stall_crit AS (
  SELECT k.id, k.weight FROM criteria k JOIN competitions c ON c.id = k.competition_id
  WHERE c.slug = 'stall'
    AND k.name IN ('Product', 'Price', 'Place', 'Promotion', 'Customer Service')
),
jury AS (   -- average level per stall and criterion, times the criterion weight = marks
  SELECT s.stall_id, SUM(x.avg_level * sc.weight) AS marks, MAX(x.judges) AS judges
  FROM (SELECT su.stall_id, ss.criterion_id, AVG(ss.score) AS avg_level, COUNT(*) AS judges
        FROM submissions su JOIN submission_scores ss ON ss.submission_id = su.id
        GROUP BY su.stall_id, ss.criterion_id) x
  JOIN stall_crit sc ON sc.id = x.criterion_id
  JOIN (SELECT DISTINCT stall_id FROM submissions) s ON s.stall_id = x.stall_id
  GROUP BY s.stall_id
),
cust AS (   -- average stars / 5 x the criterion's full marks
  SELECT r.stall_id, SUM(r.avg_stars / 5 * sc.weight * 5) AS marks
  FROM (SELECT stall_id, criterion_id, AVG(stars) AS avg_stars FROM customer_ratings GROUP BY stall_id, criterion_id) r
  JOIN stall_crit sc ON sc.id = r.criterion_id
  GROUP BY r.stall_id
)
SELECT RANK() OVER (ORDER BY COALESCE(j.marks, 0) + COALESCE(cu.marks, 0) DESC) AS rank,
       st.number, st.name, j.judges,
       ROUND(COALESCE(j.marks, 0), 2) AS jury, ROUND(COALESCE(cu.marks, 0), 2) AS customers,
       ROUND(COALESCE(j.marks, 0) + COALESCE(cu.marks, 0), 2) AS total
FROM stalls st
LEFT JOIN jury j ON j.stall_id = st.id
LEFT JOIN cust cu ON cu.stall_id = st.id
WHERE j.stall_id IS NOT NULL OR cu.stall_id IS NOT NULL
ORDER BY rank, st.number;

-- 1l. Most Popular & Viral Video Marketing: enter a group's social media counts, then rank (1 winner)
INSERT INTO viral_videos (stall_id, likes, shares, url)
SELECT id, 1250, 310, 'https://www.instagram.com/reel/example' FROM stalls WHERE number = 12
ON CONFLICT (stall_id) DO UPDATE SET likes = EXCLUDED.likes, shares = EXCLUDED.shares, url = EXCLUDED.url, updated_at = now();

SELECT rank, stall_number, stall_name, likes, shares, total, url FROM v_viral_video ORDER BY rank, stall_number;

-- ===========================================================================
-- 2. ACCOUNTS
-- ===========================================================================

-- Everyone signs in with UTHM SSO, so accounts are just emails: no PINs.
-- A person who has never signed in can still be added; their row is used when they first sign in.

-- 2a. Add a judge and assign them to competitions
WITH new_judge AS (
  INSERT INTO users (name, email, role)
  VALUES ('Dr. Example Name', lower('example@uthm.edu.my'), 'judge')
  ON CONFLICT (email) DO UPDATE SET role = 'judge', is_active = TRUE
  RETURNING id
)
INSERT INTO judge_assignments (judge_id, competition_id)
SELECT new_judge.id, c.id
FROM new_judge, competitions c
WHERE c.slug IN ('business-pitch', 'stall')
ON CONFLICT DO NOTHING;

-- 2b. Make someone an admin (or set ADMIN_EMAILS and let them sign in)
INSERT INTO users (name, email, role)
VALUES ('Committee Member', lower('nama@uthm.edu.my'), 'admin')
ON CONFLICT (email) DO UPDATE SET role = 'admin', is_active = TRUE;

-- 2c. Turn an admin or judge back into a customer, or block an account
UPDATE users SET role = 'customer' WHERE email = lower('nama@uthm.edu.my');
-- UPDATE users SET is_active = FALSE WHERE email = lower('someone@student.uthm.edu.my');

-- 2d. Give a preloaded panel judge their real UTHM email, switch them on and assign awards
WITH j AS (
  UPDATE users
  SET email = lower('noorhaniza@uthm.edu.my'), is_active = TRUE
  WHERE name = 'Prof. Madya Dr Noorhaniza binti Wahid'
  RETURNING id
)
INSERT INTO judge_assignments (judge_id, competition_id)
SELECT j.id, c.id FROM j, competitions c WHERE c.slug IN ('stall', 'business-pitch')
ON CONFLICT DO NOTHING;

-- 2f. Allocate stalls to a judge for one award (no rows = the judge may score any stall)
INSERT INTO judge_stalls (judge_id, competition_id, stall_id)
SELECT u.id, c.id, s.id
FROM users u, competitions c, stalls s
WHERE u.email = lower('noorhaniza@uthm.edu.my') AND c.slug = 'stall' AND s.number BETWEEN 1 AND 10
ON CONFLICT DO NOTHING;

-- 2g. Who is allocated to which stalls
SELECT c.name AS award, u.name AS judge, array_agg(s.number ORDER BY s.number) AS stalls
FROM judge_stalls js
JOIN users u ON u.id = js.judge_id
JOIN competitions c ON c.id = js.competition_id
JOIN stalls s ON s.id = js.stall_id
GROUP BY c.name, u.name
ORDER BY c.name, u.name;

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

-- 3c. Replace the wording of one rubric level (here: Customer Service, which has provisional wording).
--     levels[1] is level 0, levels[6] is level 5.
UPDATE criteria SET levels[5] = 'Your level 4 wording here'
WHERE name = 'Customer Service'
  AND competition_id = (SELECT id FROM competitions WHERE slug = 'stall');

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

-- 4c. Put a group into a stall (the first email is the leader). One stall per person.
INSERT INTO stall_members (email, stall_id, is_leader, added_by)
SELECT lower(v.email), s.id, v.leader, 'sql'
FROM stalls s, (VALUES
  ('ai230007@student.uthm.edu.my', TRUE),
  ('ai230011@student.uthm.edu.my', FALSE),
  ('ai230015@student.uthm.edu.my', FALSE)
) AS v(email, leader)
WHERE s.number = 7
ON CONFLICT (email) DO UPDATE SET stall_id = EXCLUDED.stall_id, is_leader = EXCLUDED.is_leader;

-- 4d. Checklist per stall: team size, poster, video links, SSM number, category
SELECT s.number, s.name,
       (SELECT count(*) FROM stall_members m WHERE m.stall_id = s.id) AS members,
       (s.poster IS NOT NULL)            AS has_poster,
       (s.pitch_url IS NOT NULL)         AS has_pitch_video,
       COALESCE(array_length(s.promo_urls, 1), 0) AS promo_videos,
       s.ssm_number, s.category
FROM stalls s
ORDER BY s.number;

-- 4f. Teams with their members (joined = has signed in at least once)
SELECT s.number, s.name, m.email, m.is_leader, (u.id IS NOT NULL) AS joined
FROM stall_members m
JOIN stalls s ON s.id = m.stall_id
LEFT JOIN users u ON u.email = m.email
ORDER BY s.number, m.is_leader DESC, m.email;

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

-- ===========================================================================
-- 6. ANNOUNCEMENTS
-- ===========================================================================

-- 6a. Post a notice (audience: everyone, sellers or judges)
INSERT INTO announcements (title, body, audience, pinned)
VALUES ('Judging starts at 12:00 pm', 'Juries, please collect your lanyards at the registration desk.', 'judges', TRUE);

-- 6b. List notices, pinned first
SELECT id, audience, pinned, title, created_at FROM announcements ORDER BY pinned DESC, created_at DESC;
