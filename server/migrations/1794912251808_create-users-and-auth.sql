-- Up Migration

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  password_hash text,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 60),
  avatar_url text,
  role user_role NOT NULL DEFAULT 'PLAYER',
  email_verified_at timestamptz,
  is_banned boolean NOT NULL DEFAULT false,
  banned_reason text,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE player_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  bio text CHECK (char_length(bio) <= 280),
  skill_level smallint NOT NULL DEFAULT 2 CHECK (skill_level BETWEEN 1 AND 5),
  position player_position NOT NULL DEFAULT 'ANY',
  home_area text,
  home_location geography(Point, 4326),
  games_completed integer NOT NULL DEFAULT 0,
  games_attended integer NOT NULL DEFAULT 0,
  no_shows integer NOT NULL DEFAULT 0,
  late_leaves integer NOT NULL DEFAULT 0,
  games_hosted integer NOT NULL DEFAULT 0,
  email_reminders boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON player_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  replaced_by uuid REFERENCES refresh_tokens(id),
  user_agent text,
  ip inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_refresh_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_family ON refresh_tokens(family_id);

CREATE TABLE email_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type email_token_type NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_tokens_user ON email_tokens(user_id, type);

-- Down Migration

DROP TABLE IF EXISTS email_tokens;
DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS player_profiles;
DROP TABLE IF EXISTS users;