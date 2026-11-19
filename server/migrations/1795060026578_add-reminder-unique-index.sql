-- Up Migration

CREATE UNIQUE INDEX uq_reminder_once
  ON notifications (user_id, type, (data->>'gameId'))
  WHERE type IN ('GAME_REMINDER_24H', 'GAME_REMINDER_2H');

-- Down Migration

DROP INDEX IF EXISTS uq_reminder_once;