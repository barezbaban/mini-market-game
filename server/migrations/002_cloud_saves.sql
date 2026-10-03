CREATE TABLE IF NOT EXISTS player_saves (
  player_id uuid PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision > 0),
  mutation_id uuid NOT NULL,
  state jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS player_save_history (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, revision)
);
