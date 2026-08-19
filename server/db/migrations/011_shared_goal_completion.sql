ALTER TABLE shared_goals
    ADD COLUMN IF NOT EXISTS completed BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS shared_goals_partnership_status_idx
    ON shared_goals(partnership_id, active, completed, created_at DESC);
