-- Up Migration

CREATE TABLE recurring_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES users(id),
  court_id uuid NOT NULL REFERENCES courts(id),
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  local_start_time time NOT NULL,
  duration_minutes smallint NOT NULL CHECK (duration_minutes BETWEEN 30 AND 240),
  title text NOT NULL,
  description text,
  format game_format NOT NULL,
  max_players smallint NOT NULL CHECK (max_players BETWEEN 2 AND 30),
  skill_min smallint NOT NULL DEFAULT 1 CHECK (skill_min BETWEEN 1 AND 5),
  skill_max smallint NOT NULL DEFAULT 5 CHECK (skill_max BETWEEN 1 AND 5),
  visibility game_visibility NOT NULL DEFAULT 'PUBLIC',
  join_mode join_mode NOT NULL DEFAULT 'INSTANT',
  fee_per_player numeric(8, 2) NOT NULL DEFAULT 0 CHECK (fee_per_player >= 0),
  until_date date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (skill_min <= skill_max)
);

CREATE TABLE games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES users(id),
  court_id uuid NOT NULL REFERENCES courts(id),
  series_id uuid REFERENCES recurring_series(id) ON DELETE SET NULL,
  sport text NOT NULL DEFAULT 'basketball',
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 80),
  description text CHECK (char_length(description) <= 1000),
  format game_format NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  max_players smallint NOT NULL CHECK (max_players BETWEEN 2 AND 30),
  joined_count smallint NOT NULL DEFAULT 0,
  waitlist_count smallint NOT NULL DEFAULT 0 CHECK (waitlist_count >= 0),
  skill_min smallint NOT NULL DEFAULT 1 CHECK (skill_min BETWEEN 1 AND 5),
  skill_max smallint NOT NULL DEFAULT 5 CHECK (skill_max BETWEEN 1 AND 5),
  fee_per_player numeric(8, 2) NOT NULL DEFAULT 0 CHECK (fee_per_player >= 0),
  visibility game_visibility NOT NULL DEFAULT 'PUBLIC',
  invite_code text UNIQUE,
  join_mode join_mode NOT NULL DEFAULT 'INSTANT',
  status game_status NOT NULL DEFAULT 'SCHEDULED',
  cancel_reason text,
  cancelled_at timestamptz,
  completed_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_time_order CHECK (ends_at > starts_at),
  CONSTRAINT chk_duration CHECK (ends_at - starts_at BETWEEN interval '30 minutes' AND interval '4 hours'),
  CONSTRAINT chk_skill_range CHECK (skill_min <= skill_max),
  CONSTRAINT chk_capacity CHECK (joined_count >= 0 AND joined_count <= max_players),
  CONSTRAINT chk_private_code CHECK ((visibility = 'PRIVATE') = (invite_code IS NOT NULL)),
  CONSTRAINT excl_host_overlap EXCLUDE USING gist (
    host_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (status <> 'CANCELLED')
);

CREATE INDEX idx_games_court_time ON games(court_id, starts_at);
CREATE INDEX idx_games_status_time ON games(status, starts_at);
CREATE INDEX idx_games_host ON games(host_id, starts_at DESC);
CREATE INDEX idx_games_series ON games(series_id) WHERE series_id IS NOT NULL;
CREATE INDEX idx_games_public_upcoming ON games(starts_at, id)
  WHERE status = 'SCHEDULED' AND visibility = 'PUBLIC';

CREATE TRIGGER trg_games_updated BEFORE UPDATE ON games
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE game_events (
  id bigserial PRIMARY KEY,
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES users(id),
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_game_events_game ON game_events(game_id, id);

-- Down Migration

DROP TABLE IF EXISTS game_events;
DROP TABLE IF EXISTS games;
DROP TABLE IF EXISTS recurring_series;