ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS users_last_seen_idx ON users(last_seen_at) WHERE last_seen_at IS NOT NULL;

ALTER TABLE partner_notifications ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS partner_notifications_user_visible_idx
    ON partner_notifications(user_id, created_at DESC)
    WHERE archived_at IS NULL;
