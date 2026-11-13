-- ===========================================================================
-- LEED 26: everything Supabase needs, in one file.
--
-- How to run it
--   1. Supabase dashboard > SQL Editor > New query.
--   2. Paste this whole file and press Run. It is safe to run again after an
--      update: tables, columns and rows are only added when missing.
--   3. Project Settings > Database > Connection string: copy the "Transaction
--      pooler" URI (port 6543), put your database password in it, and set it as
--      DATABASE_URL for the app (add ?sslmode=require at the end if it is missing).
--
-- Security (RLS)
--   Row Level Security is switched on for every table, with no policies, and the
--   public API roles (anon, authenticated) get no access to any table or view.
--   Nobody can read or change LEED data through the Supabase API or the
--   anon key. Only the app reaches the data, through DATABASE_URL, as the
--   database owner.
--
-- This file is built from db/schema.sql and db/seed.sql. Handy one-off queries
-- (rankings, adding admins, teams, allocations) are in db/queries.sql.
-- ===========================================================================

-- ===========================================================================
-- 1. TABLES AND VIEWS (db/schema.sql)
-- ===========================================================================

-- LEED 26 judging system: database schema (PostgreSQL 13+)
--
-- Run once on an empty database, then run seed.sql:
--   psql "<your connection string>" -f db/schema.sql
--   psql "<your connection string>" -f db/seed.sql
--
-- Safe to re-run: every statement is IF NOT EXISTS / OR REPLACE.

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid(), and crypt() for old PIN columns

-- ---------------------------------------------------------------------------
-- Everyone who signs in with a UTHM Google account (@student.uthm.edu.my or @uthm.edu.my).
--   role 'customer' = any student or staff member (votes and rates stalls)
--   role 'judge'    = jury; the committee adds them by email before the event
--   role 'admin'    = committee
-- Sellers are customers who belong to a stall team (stall_members), so they have no role of their own.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT        NOT NULL,
  email         TEXT        NOT NULL UNIQUE CHECK (email = lower(email)),
  pin_hash      TEXT,                                       -- unused since Google sign-in; kept for old databases
  role          TEXT        NOT NULL DEFAULT 'customer',
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  failed_logins INTEGER     NOT NULL DEFAULT 0,
  locked_until  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Upgrade path from PIN sign-in to Google sign-in.
ALTER TABLE users ALTER COLUMN pin_hash DROP NOT NULL;
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'customer';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'judge', 'customer'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub    TEXT UNIQUE;  -- Google account id
ALTER TABLE users ADD COLUMN IF NOT EXISTS picture       TEXT;         -- Google profile photo
ALTER TABLE users ADD COLUMN IF NOT EXISTS staff_id      TEXT;         -- for the UTHM staff photo (optional)
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS nickname      TEXT;         -- Google first name, for the profile pill

-- ---------------------------------------------------------------------------
-- Stalls (one row per tent number on the layout)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stalls (
  id          SERIAL PRIMARY KEY,
  number      INTEGER     NOT NULL UNIQUE CHECK (number > 0),
  name        TEXT        NOT NULL,
  group_name  TEXT,
  cluster     TEXT        CHECK (cluster IN ('food', 'fashion', 'local', 'talent')),
  colour      TEXT        CHECK (colour IN ('pink', 'blue', 'green', 'yellow', 'red')),
  description TEXT,
  instagram   TEXT,
  pitch_url   TEXT,                                 -- business pitch video (set by the stall team)
  promo_urls  TEXT[]      NOT NULL DEFAULT '{}',    -- up to 3 promotional videos
  pin_hash    TEXT,                                 -- stall team PIN, crypt(pin, gen_salt('bf')); NULL = no sign-in yet
  pin_fails   INTEGER     NOT NULL DEFAULT 0,
  pin_locked_until TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Upgrade path for databases created with the first version of this file.
ALTER TABLE stalls ADD COLUMN IF NOT EXISTS pitch_url TEXT;
ALTER TABLE stalls ADD COLUMN IF NOT EXISTS promo_urls TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE stalls ADD COLUMN IF NOT EXISTS pin_hash TEXT;
ALTER TABLE stalls ADD COLUMN IF NOT EXISTS pin_fails INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stalls ADD COLUMN IF NOT EXISTS pin_locked_until TIMESTAMPTZ;
-- Seller details (set by the stall team)
ALTER TABLE stalls ADD COLUMN IF NOT EXISTS ssm_number TEXT;          -- SSM business registration number
ALTER TABLE stalls ADD COLUMN IF NOT EXISTS category   TEXT;          -- food category, see lib/event.ts
ALTER TABLE stalls ADD COLUMN IF NOT EXISTS poster      BYTEA;        -- poster image (JPEG/PNG/WebP, up to 3 MB)
ALTER TABLE stalls ADD COLUMN IF NOT EXISTS poster_type TEXT;
ALTER TABLE stalls ADD COLUMN IF NOT EXISTS poster_updated_at TIMESTAMPTZ;
ALTER TABLE stalls ADD COLUMN IF NOT EXISTS logo        BYTEA;        -- company logo (optional; JPEG/PNG/WebP, up to 1 MB)
ALTER TABLE stalls ADD COLUMN IF NOT EXISTS logo_type   TEXT;
ALTER TABLE stalls ADD COLUMN IF NOT EXISTS logo_updated_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- Stall teams. Membership is by email, so the leader can add groupmates before
-- they have ever signed in; they see their stall the first time they sign in.
-- One stall per person.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stall_members (
  email     TEXT        PRIMARY KEY CHECK (email = lower(email)),
  stall_id  INTEGER     NOT NULL REFERENCES stalls(id) ON DELETE CASCADE,
  is_leader BOOLEAN     NOT NULL DEFAULT FALSE,
  added_by  TEXT,
  added_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stall_members_stall ON stall_members (stall_id);

-- ---------------------------------------------------------------------------
-- Stall registration details (replaces the 2024 "Maklumat Gerai" form)
-- One row per stall; any team member can edit it.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stall_details (
  stall_id      INTEGER     PRIMARY KEY REFERENCES stalls(id) ON DELETE CASCADE,
  course        TEXT,
  lecturer      TEXT,                                   -- id from LECTURERS in lib/event.ts (sets the stall colour)
  group_no      INTEGER,
  main_product  TEXT,
  product_name  TEXT,
  same_product  BOOLEAN,                                -- same product as the original proposal?
  electrical    JSONB       NOT NULL DEFAULT '[]',      -- [{ "item": "Waffle maker", "watts": 1000 }]
  leader_phone  TEXT,
  updated_by    TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Payments: one row per stall per kind, submitted by the team leader.
--   deposit  RM40 to UTHM (RM20 site rental + RM20 cleaning deposit, refunded later)
--   rental   RM70 to SELADEVS DIGITAL
-- payer holds the personal details the deposit form asks for (IC, address, refund
-- bank account...). Only admins and the team leader can see them.
-- A new submission replaces the old one and goes back to 'pending'.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id              SERIAL      PRIMARY KEY,
  stall_id        INTEGER     NOT NULL REFERENCES stalls(id) ON DELETE CASCADE,
  kind            TEXT        NOT NULL CHECK (kind IN ('deposit', 'rental')),
  amount_sen      INTEGER     NOT NULL CHECK (amount_sen > 0),
  paid_on         DATE,
  receipt         BYTEA,                                -- NULL when the file is kept in Google Drive
  receipt_type    TEXT        NOT NULL,
  receipt_name    TEXT,
  payer           JSONB       NOT NULL DEFAULT '{}',
  statement       BYTEA,                                -- bank statement showing the refund account (deposit only)
  statement_type  TEXT,
  statement_name  TEXT,
  status          TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  review_note     TEXT,
  reviewed_by     TEXT,
  reviewed_at     TIMESTAMPTZ,
  refund_status   TEXT        CHECK (refund_status IN ('held', 'refunded', 'forfeited')),
  submitted_by    TEXT        NOT NULL,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (stall_id, kind)
);
ALTER TABLE payments ALTER COLUMN receipt DROP NOT NULL;
-- Google Drive copies (Admin > Payments > Connect Google Drive)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_drive_id    TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_drive_url   TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS statement_drive_id  TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS statement_drive_url TEXT;

-- ---------------------------------------------------------------------------
-- Notifications (the bell). Either for one person (email) or for everyone in an
-- audience (a committee announcement). A person has read everything created
-- before their users.notif_seen_at.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id          SERIAL      PRIMARY KEY,
  email       TEXT        CHECK (email = lower(email)),
  audience    TEXT        CHECK (audience IN ('everyone', 'sellers', 'judges')),
  kind        TEXT        NOT NULL,                     -- payment, refund, announcement, team
  title       TEXT        NOT NULL,
  body        TEXT,
  link        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((email IS NULL) <> (audience IS NULL))
);
CREATE INDEX IF NOT EXISTS notifications_email ON notifications (email, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_audience ON notifications (audience, created_at DESC);
ALTER TABLE users ADD COLUMN IF NOT EXISTS notif_seen_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- Competitions and their scoring criteria
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS competitions (
  id          SERIAL PRIMARY KEY,
  slug        TEXT        NOT NULL UNIQUE,
  name        TEXT        NOT NULL,
  description TEXT,
  position    INTEGER     NOT NULL DEFAULT 0,
  is_open     BOOLEAN     NOT NULL DEFAULT TRUE,   -- master switch
  opens_at    TIMESTAMPTZ,                         -- optional judging window
  closes_at   TIMESTAMPTZ,
  scale_min   SMALLINT    NOT NULL DEFAULT 0,
  scale_max   SMALLINT    NOT NULL DEFAULT 5,
  CHECK (scale_min < scale_max),
  CHECK (opens_at IS NULL OR closes_at IS NULL OR opens_at < closes_at)
);

CREATE TABLE IF NOT EXISTS criteria (
  id             SERIAL PRIMARY KEY,
  competition_id INTEGER      NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  position       INTEGER      NOT NULL,
  name           TEXT         NOT NULL,
  description    TEXT,
  weight         NUMERIC(6,2) NOT NULL DEFAULT 1 CHECK (weight > 0),  -- marks per level (4-mark criterion on 0-5 = 0.8)
  levels         TEXT[],                                             -- level descriptions, level 0 first
  UNIQUE (competition_id, position)
);
ALTER TABLE criteria ADD COLUMN IF NOT EXISTS levels TEXT[];

-- Which judge scores which competition
-- Which stalls a judge must judge for a competition. A judge with no rows for a
-- competition may judge any stall in it.
CREATE TABLE IF NOT EXISTS judge_stalls (
  judge_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  stall_id       INTEGER NOT NULL REFERENCES stalls(id) ON DELETE CASCADE,
  PRIMARY KEY (judge_id, competition_id, stall_id)
);

CREATE TABLE IF NOT EXISTS judge_assignments (
  judge_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  PRIMARY KEY (judge_id, competition_id)
);

-- ---------------------------------------------------------------------------
-- Scores: one submission per judge, per competition, per stall
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS submissions (
  id             SERIAL PRIMARY KEY,
  judge_id       INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  competition_id INTEGER     NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  stall_id       INTEGER     NOT NULL REFERENCES stalls(id) ON DELETE CASCADE,
  comment        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (judge_id, competition_id, stall_id)
);

CREATE TABLE IF NOT EXISTS submission_scores (
  submission_id INTEGER  NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  criterion_id  INTEGER  NOT NULL REFERENCES criteria(id) ON DELETE CASCADE,
  score         SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 100),
  PRIMARY KEY (submission_id, criterion_id)
);

-- Every save is logged, so a changed score can always be traced.
CREATE TABLE IF NOT EXISTS score_audit (
  id             BIGSERIAL PRIMARY KEY,
  judge_id       INTEGER     NOT NULL,
  competition_id INTEGER     NOT NULL,
  stall_id       INTEGER     NOT NULL,
  scores         JSONB       NOT NULL,
  comment        TEXT,
  saved_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS submissions_competition_idx ON submissions (competition_id, stall_id);
CREATE INDEX IF NOT EXISTS score_audit_lookup_idx ON score_audit (competition_id, stall_id, judge_id);

-- ---------------------------------------------------------------------------
-- Memory wall
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memories (
  id         SERIAL PRIMARY KEY,
  kind       TEXT        NOT NULL CHECK (kind IN ('image', 'video', 'youtube', 'note')),
  url        TEXT,                                  -- image/video link, YouTube id, or NULL for a note
  caption    TEXT        NOT NULL CHECK (char_length(caption) BETWEEN 1 AND 140),
  author     TEXT,
  year       INTEGER,
  likes      INTEGER     NOT NULL DEFAULT 0,
  status     TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('approved', 'pending', 'hidden')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- People Choice Award: one like or dislike per phone (voter) per stall.
-- voter is a random id kept in a cookie on the visitor's phone; changing a vote updates the row.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_votes (
  stall_id   INTEGER     NOT NULL REFERENCES stalls(id) ON DELETE CASCADE,
  voter      TEXT        NOT NULL,   -- 'u:<users.id>'
  liked      BOOLEAN     NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (stall_id, voter)
);

CREATE OR REPLACE VIEW v_customer_choice AS -- People Choice ranking
SELECT st.id AS stall_id, st.number AS stall_number, st.name AS stall_name, st.colour,
       COUNT(*) FILTER (WHERE v.liked)::int     AS likes,
       COUNT(*) FILTER (WHERE NOT v.liked)::int AS dislikes,
       RANK() OVER (ORDER BY COUNT(*) FILTER (WHERE v.liked) DESC)::int AS rank
FROM stalls st
JOIN customer_votes v ON v.stall_id = st.id
GROUP BY st.id, st.number, st.name, st.colour;

-- ---------------------------------------------------------------------------
-- Customer ratings: visitors rate each Stall Competition element (Product, Price,
-- Place, Promotion, Customer Service) from 1 to 5 stars. The average is the customer
-- half of each stall award: customer marks = average stars / 5 x the element's marks.
-- One rating per phone per stall per element; rating again updates it.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_ratings (
  stall_id     INTEGER     NOT NULL REFERENCES stalls(id) ON DELETE CASCADE,
  voter        TEXT        NOT NULL,   -- 'u:<users.id>'
  criterion_id INTEGER     NOT NULL REFERENCES criteria(id) ON DELETE CASCADE,
  stars        SMALLINT    NOT NULL CHECK (stars BETWEEN 1 AND 5),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (stall_id, voter, criterion_id)
);

CREATE INDEX IF NOT EXISTS customer_ratings_criterion ON customer_ratings (criterion_id);

CREATE OR REPLACE VIEW v_customer_ratings AS
SELECT st.id AS stall_id, st.number AS stall_number, st.name AS stall_name,
       k.id AS criterion_id, k.name AS criterion, k.position,
       ROUND(AVG(r.stars)::numeric, 2)       AS avg_stars,
       ROUND(AVG(r.stars)::numeric / 5 * k.weight * c.scale_max, 2) AS customer_marks,
       COUNT(*)::int                          AS raters
FROM customer_ratings r
JOIN stalls st      ON st.id = r.stall_id
JOIN criteria k     ON k.id = r.criterion_id
JOIN competitions c ON c.id = k.competition_id
GROUP BY st.id, st.number, st.name, k.id, k.name, k.position, k.weight, c.scale_max;

-- ---------------------------------------------------------------------------
-- Most Popular & Viral Video Marketing: likes and shares on social media,
-- entered by the committee for each group's marketing video.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS viral_videos (
  stall_id   INTEGER     PRIMARY KEY REFERENCES stalls(id) ON DELETE CASCADE,
  likes      INTEGER     NOT NULL DEFAULT 0 CHECK (likes >= 0),
  shares     INTEGER     NOT NULL DEFAULT 0 CHECK (shares >= 0),
  url        TEXT        CHECK (url IS NULL OR url ~* '^https?://'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE VIEW v_viral_video AS
SELECT st.id AS stall_id, st.number AS stall_number, st.name AS stall_name, st.colour,
       v.likes, v.shares, (v.likes + v.shares) AS total, v.url,
       RANK() OVER (ORDER BY v.likes + v.shares DESC)::int AS rank
FROM viral_videos v
JOIN stalls st ON st.id = v.stall_id
WHERE v.likes + v.shares > 0;

-- Votes and ratings now belong to a signed-in account ('u:<users.id>').
ALTER TABLE customer_votes   DROP CONSTRAINT IF EXISTS customer_votes_voter_check;
ALTER TABLE customer_ratings DROP CONSTRAINT IF EXISTS customer_ratings_voter_check;

-- ---------------------------------------------------------------------------
-- Announcements from the committee, shown on the home page and to sellers and judges.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS announcements (
  id         SERIAL PRIMARY KEY,
  title      TEXT        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  body       TEXT        NOT NULL DEFAULT '' CHECK (char_length(body) <= 2000),
  audience   TEXT        NOT NULL DEFAULT 'everyone' CHECK (audience IN ('everyone', 'sellers', 'judges')),
  pinned     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Activity log: who did what, for the committee.
--   kind 'admin' = changes made in the admin console
--   kind 'user'  = what people do (votes, ratings, scores, stall edits, posters, team changes)
--   kind 'auth'  = sign-ins, sign-outs and refused (non-UTHM) sign-ins
-- actor_email is kept as text so the record stays readable if the account is removed.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_log (
  id          BIGSERIAL   PRIMARY KEY,
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id    INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  actor_email TEXT,
  actor_name  TEXT,
  actor_role  TEXT,
  kind        TEXT        NOT NULL CHECK (kind IN ('admin', 'user', 'auth')),
  action      TEXT        NOT NULL,   -- short code, e.g. 'vote', 'team.add', 'users.role'
  summary     TEXT        NOT NULL,   -- one readable sentence
  target      TEXT                    -- what it was about, e.g. 'stall 7' or an email
);

CREATE INDEX IF NOT EXISTS activity_log_at ON activity_log (at DESC);
CREATE INDEX IF NOT EXISTS activity_log_actor ON activity_log (actor_id, at DESC);
CREATE INDEX IF NOT EXISTS activity_log_kind ON activity_log (kind, at DESC);

-- ---------------------------------------------------------------------------
-- App settings (key/value).
--   results_published = 'true'  shows the winners on /results
--   voting_open       = 'true'  lets visitors like and rate stalls (People Choice and customer ratings)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------

-- One row per submission with its weighted total.
CREATE OR REPLACE VIEW v_submission_totals AS
SELECT s.id                               AS submission_id,
       s.judge_id,
       s.competition_id,
       s.stall_id,
       SUM(ss.score * c.weight)::float8   AS total,
       COUNT(*)::int                      AS criteria_scored
FROM submissions s
JOIN submission_scores ss ON ss.submission_id = s.id
JOIN criteria c           ON c.id = ss.criterion_id
GROUP BY s.id, s.judge_id, s.competition_id, s.stall_id;

-- Ranking per competition: a stall's result is the average of its judges' totals,
-- so a stall is not penalised or favoured by how many judges reached it.
CREATE OR REPLACE VIEW v_leaderboard AS
SELECT t.competition_id,
       st.id                                         AS stall_id,
       st.number                                     AS stall_number,
       st.name                                       AS stall_name,
       st.colour,
       COUNT(*)::int                                 AS judges,
       ROUND(AVG(t.total)::numeric, 2)::float8       AS average,
       RANK() OVER (PARTITION BY t.competition_id
                    ORDER BY ROUND(AVG(t.total)::numeric, 2) DESC)::int AS rank
FROM v_submission_totals t
JOIN stalls st ON st.id = t.stall_id
GROUP BY t.competition_id, st.id, st.number, st.name, st.colour;

-- ===========================================================================
-- 2. STARTING DATA (db/seed.sql)
-- ===========================================================================

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

-- ===========================================================================
-- ROW LEVEL SECURITY
-- Switch RLS on for every table in the public schema (including any added
-- later when this file is run again), and keep the Supabase API roles out.
-- ===========================================================================

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

-- Views run with the rights of whoever reads them, so RLS applies through them too.
DO $$
DECLARE
  v record;
BEGIN
  FOR v IN SELECT viewname FROM pg_views WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v.viewname);
  END LOOP;
END $$;

-- No access at all for the API roles (they exist on Supabase; skipped elsewhere).
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', r);
    END IF;
  END LOOP;
END $$;

-- Check: every table should show rls_on = true.
SELECT tablename, rowsecurity AS rls_on FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
