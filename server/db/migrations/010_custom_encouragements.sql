ALTER TABLE user_settings
    ADD COLUMN IF NOT EXISTS custom_encouragements_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS encouragement_messages (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message VARCHAR(240) NOT NULL CHECK (char_length(trim(message)) BETWEEN 1 AND 240),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS encouragement_messages_user_idx ON encouragement_messages(user_id, enabled, created_at);
