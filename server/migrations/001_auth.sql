CREATE TABLE IF NOT EXISTS players (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  display_name varchar(24) NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT players_email_normalized CHECK (email = lower(email)),
  CONSTRAINT players_display_name_length CHECK (char_length(display_name) BETWEEN 2 AND 24)
);

CREATE UNIQUE INDEX IF NOT EXISTS players_email_unique ON players (lower(email));

CREATE TABLE IF NOT EXISTS player_sessions (
  id uuid PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS player_sessions_player_id ON player_sessions (player_id);
CREATE INDEX IF NOT EXISTS player_sessions_expires_at ON player_sessions (expires_at);
