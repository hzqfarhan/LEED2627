-- LEED 26 judging system: database schema (PostgreSQL 13+)
--
-- Run once on an empty database, then run seed.sql:
--   psql "<your connection string>" -f db/schema.sql
--   psql "<your connection string>" -f db/seed.sql
--
-- Safe to re-run: every statement is IF NOT EXISTS / OR REPLACE.

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- crypt() / gen_salt() for login PINs

-- ---------------------------------------------------------------------------
-- People who can sign in: admins and judges
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT        NOT NULL,
  email         TEXT        NOT NULL UNIQUE CHECK (email = lower(email)),
  pin_hash      TEXT        NOT NULL,                       -- crypt(pin, gen_salt('bf'))
  role          TEXT        NOT NULL DEFAULT 'judge' CHECK (role IN ('admin', 'judge')),
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  failed_logins INTEGER     NOT NULL DEFAULT 0,
  locked_until  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
-- Customer Choice Award: one like or dislike per phone (voter) per stall.
-- voter is a random id kept in a cookie on the visitor's phone; changing a vote updates the row.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_votes (
  stall_id   INTEGER     NOT NULL REFERENCES stalls(id) ON DELETE CASCADE,
  voter      TEXT        NOT NULL CHECK (char_length(voter) BETWEEN 16 AND 64),
  liked      BOOLEAN     NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (stall_id, voter)
);

CREATE OR REPLACE VIEW v_customer_choice AS
SELECT st.id AS stall_id, st.number AS stall_number, st.name AS stall_name, st.colour,
       COUNT(*) FILTER (WHERE v.liked)::int     AS likes,
       COUNT(*) FILTER (WHERE NOT v.liked)::int AS dislikes,
       RANK() OVER (ORDER BY COUNT(*) FILTER (WHERE v.liked) DESC)::int AS rank
FROM stalls st
JOIN customer_votes v ON v.stall_id = st.id
GROUP BY st.id, st.number, st.name, st.colour;

-- ---------------------------------------------------------------------------
-- App settings (key/value).
--   results_published = 'true'  shows the winners on /results
--   voting_open       = 'true'  lets visitors vote for the Customer Choice Award
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
