DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'partner_settings_membership_fk'
    ) THEN
        ALTER TABLE partner_settings
            ADD CONSTRAINT partner_settings_membership_fk
            FOREIGN KEY (partnership_id, user_id)
            REFERENCES partnership_members(partnership_id, user_id)
            ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS partner_sessions_pending_expiry_idx
    ON partner_sessions(expires_at)
    WHERE status = 'pending';
