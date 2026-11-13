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
