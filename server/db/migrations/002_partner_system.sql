ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(40);
UPDATE users
SET username = LEFT(COALESCE(NULLIF(LOWER(REGEXP_REPLACE(SPLIT_PART(email, '@', 1), '[^a-zA-Z0-9_]', '', 'g')), ''), 'user'), 30)
    || '_' || SUBSTRING(REPLACE(id::text, '-', ''), 1, 6)
WHERE username IS NULL;
ALTER TABLE users ALTER COLUMN username SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique ON users(LOWER(username));

CREATE TABLE IF NOT EXISTS partner_invitations (
    id UUID PRIMARY KEY,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled')),
    expires_at TIMESTAMPTZ NOT NULL,
    responded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (sender_id <> receiver_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS partner_invitations_pending_pair_unique
    ON partner_invitations(LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id))
    WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS partner_invitations_receiver_status_idx ON partner_invitations(receiver_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS partner_invitations_sender_status_idx ON partner_invitations(sender_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS partnerships (
    id UUID PRIMARY KEY,
    user_a_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (user_a_id < user_b_id),
    UNIQUE (user_a_id, user_b_id)
);

CREATE TABLE IF NOT EXISTS partnership_members (
    partnership_id UUID NOT NULL REFERENCES partnerships(id) ON DELETE CASCADE,
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (partnership_id, user_id)
);
CREATE INDEX IF NOT EXISTS partnership_members_partnership_idx ON partnership_members(partnership_id);

CREATE TABLE IF NOT EXISTS partner_settings (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    partnership_id UUID NOT NULL REFERENCES partnerships(id) ON DELETE CASCADE,
    share_study_time BOOLEAN NOT NULL DEFAULT TRUE,
    share_study_subjects BOOLEAN NOT NULL DEFAULT FALSE,
    share_homework_progress BOOLEAN NOT NULL DEFAULT TRUE,
    share_gym_progress BOOLEAN NOT NULL DEFAULT TRUE,
    share_job_hours BOOLEAN NOT NULL DEFAULT FALSE,
    share_current_activity BOOLEAN NOT NULL DEFAULT TRUE,
    share_calendar BOOLEAN NOT NULL DEFAULT FALSE,
    share_detailed_tasks BOOLEAN NOT NULL DEFAULT FALSE,
    share_detailed_workouts BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (partnership_id, user_id)
);
CREATE INDEX IF NOT EXISTS partner_settings_partnership_idx ON partner_settings(partnership_id);

CREATE TABLE IF NOT EXISTS shared_goals (
    id UUID PRIMARY KEY,
    partnership_id UUID NOT NULL REFERENCES partnerships(id) ON DELETE CASCADE,
    title VARCHAR(160) NOT NULL,
    type VARCHAR(30) NOT NULL CHECK (type IN ('study_minutes','pomodoros','homework_completed','custom')),
    target NUMERIC(12,2) NOT NULL CHECK (target > 0),
    manual_progress NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (manual_progress >= 0),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS shared_goals_partnership_dates_idx ON shared_goals(partnership_id, active, start_date, end_date);

CREATE TABLE IF NOT EXISTS partner_sessions (
    id UUID PRIMARY KEY,
    partnership_id UUID NOT NULL REFERENCES partnerships(id) ON DELETE CASCADE,
    invited_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    subject_name VARCHAR(120) NOT NULL DEFAULT '',
    duration_seconds INTEGER NOT NULL CHECK (duration_seconds BETWEEN 60 AND 43200),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','paused','completed','cancelled','declined')),
    expires_at TIMESTAMPTZ NOT NULL,
    started_at TIMESTAMPTZ,
    paused_at TIMESTAMPTZ,
    total_paused_seconds INTEGER NOT NULL DEFAULT 0 CHECK (total_paused_seconds >= 0),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS partner_sessions_one_open_per_partnership
    ON partner_sessions(partnership_id) WHERE status IN ('pending','active','paused');
CREATE INDEX IF NOT EXISTS partner_sessions_partnership_created_idx ON partner_sessions(partnership_id, created_at DESC);

CREATE TABLE IF NOT EXISTS partner_session_members (
    session_id UUID NOT NULL REFERENCES partner_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ,
    left_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    actual_seconds INTEGER NOT NULL DEFAULT 0 CHECK (actual_seconds >= 0),
    personal_session_id UUID REFERENCES activity_sessions(id) ON DELETE SET NULL,
    PRIMARY KEY (session_id, user_id)
);
CREATE INDEX IF NOT EXISTS partner_session_members_user_idx ON partner_session_members(user_id, session_id);

ALTER TABLE activity_sessions ADD COLUMN IF NOT EXISTS partner_session_id UUID REFERENCES partner_sessions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS activity_sessions_partner_session_idx ON activity_sessions(partner_session_id) WHERE partner_session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS partner_activity (
    id UUID PRIMARY KEY,
    partnership_id UUID NOT NULL REFERENCES partnerships(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(40) NOT NULL CHECK (type IN ('pomodoro_completed','homework_completed','workout_completed','shared_session_completed','encouragement')),
    message VARCHAR(240) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS partner_activity_partnership_created_idx ON partner_activity(partnership_id, created_at DESC);

CREATE TABLE IF NOT EXISTS partner_notifications (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    partnership_id UUID REFERENCES partnerships(id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(160) NOT NULL,
    body VARCHAR(300) NOT NULL DEFAULT '',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS partner_notifications_user_created_idx ON partner_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS partner_notifications_user_unread_idx ON partner_notifications(user_id, read_at) WHERE read_at IS NULL;
