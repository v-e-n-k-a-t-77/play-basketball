-- Up Migration

CREATE TABLE game_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  status participant_status NOT NULL,
  attendance attendance_status NOT NULL DEFAULT 'UNMARKED',
  waitlist_position integer,
  is_host boolean NOT NULL DEFAULT false,
  late_leave boolean NOT NULL DEFAULT false,
  joined_at timestamptz,
  left_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_participant UNIQUE (game_id, user_id),
  CONSTRAINT chk_waitlist_pos CHECK ((status = 'WAITLISTED') = (waitlist_position IS NOT NULL))
);

CREATE INDEX idx_participants_user ON game_participants(user_id, status);
CREATE INDEX idx_participants_game ON game_participants(game_id, status);
CREATE INDEX idx_participants_waitlist ON game_participants(game_id, waitlist_position)
  WHERE status = 'WAITLISTED';

CREATE TRIGGER trg_participants_updated BEFORE UPDATE ON game_participants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE game_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id),
  type message_type NOT NULL DEFAULT 'USER',
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  client_msg_id uuid,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_client_msg UNIQUE (game_id, user_id, client_msg_id)
);

CREATE INDEX idx_messages_game_time ON game_messages(game_id, created_at DESC, id DESC);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(user_id) WHERE read_at IS NULL;

CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES users(id),
  target_type report_target NOT NULL,
  target_id uuid NOT NULL,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 500),
  status report_status NOT NULL DEFAULT 'OPEN',
  resolution_note text,
  resolved_by uuid REFERENCES users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_report_once UNIQUE (reporter_id, target_type, target_id)
);

CREATE INDEX idx_reports_status ON reports(status, created_at);

CREATE TABLE idempotency_keys (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key text NOT NULL,
  route text NOT NULL,
  status_code smallint NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

CREATE INDEX idx_idem_created ON idempotency_keys(created_at);

-- Down Migration

DROP TABLE IF EXISTS idempotency_keys;
DROP TABLE IF EXISTS reports;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS game_messages;
DROP TABLE IF EXISTS game_participants;