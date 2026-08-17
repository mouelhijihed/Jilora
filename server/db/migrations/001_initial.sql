CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    email VARCHAR(320) NOT NULL,
    password_hash TEXT NOT NULL,
    first_name VARCHAR(80) NOT NULL,
    last_name VARCHAR(80) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (LOWER(email));

CREATE TABLE IF NOT EXISTS user_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    student BOOLEAN NOT NULL DEFAULT FALSE,
    gym BOOLEAN NOT NULL DEFAULT FALSE,
    part_time_job BOOLEAN NOT NULL DEFAULT FALSE,
    onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_settings (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    focus_duration INTEGER NOT NULL DEFAULT 1500 CHECK (focus_duration BETWEEN 1 AND 43200),
    short_break_duration INTEGER NOT NULL DEFAULT 300 CHECK (short_break_duration BETWEEN 1 AND 43200),
    long_break_duration INTEGER NOT NULL DEFAULT 900 CHECK (long_break_duration BETWEEN 1 AND 43200),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subjects (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    target_weekly_hours NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (target_weekly_hours BETWEEN 0 AND 168),
    target_monthly_hours NUMERIC(7,2) NOT NULL DEFAULT 0 CHECK (target_monthly_hours BETWEEN 0 AND 744),
    priority VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
    color CHAR(7) NOT NULL DEFAULT '#72c59b',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, name)
);
CREATE INDEX IF NOT EXISTS subjects_user_id_idx ON subjects(user_id);

CREATE TABLE IF NOT EXISTS calendar_events (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(120) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('gym','study','homework','job','general')),
    event_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 1 AND 1440),
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT NOT NULL DEFAULT '',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS calendar_events_user_date_idx ON calendar_events(user_id, event_date);
CREATE INDEX IF NOT EXISTS calendar_events_user_completed_idx ON calendar_events(user_id, completed);

CREATE TABLE IF NOT EXISTS study_sessions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_id UUID NOT NULL UNIQUE REFERENCES calendar_events(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
    session_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    planned_minutes INTEGER NOT NULL CHECK (planned_minutes BETWEEN 1 AND 1440),
    actual_minutes INTEGER NOT NULL DEFAULT 0 CHECK (actual_minutes BETWEEN 0 AND 1440),
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS study_sessions_user_date_idx ON study_sessions(user_id, session_date);
CREATE INDEX IF NOT EXISTS study_sessions_user_subject_idx ON study_sessions(user_id, subject_id);

CREATE TABLE IF NOT EXISTS homework (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_id UUID NOT NULL UNIQUE REFERENCES calendar_events(id) ON DELETE CASCADE,
    subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
    subject_name VARCHAR(120) NOT NULL DEFAULT '',
    title VARCHAR(160) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    due_date DATE NOT NULL,
    due_time TIME NOT NULL,
    priority VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
    estimated_minutes INTEGER NOT NULL CHECK (estimated_minutes BETWEEN 1 AND 10080),
    status VARCHAR(20) NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in-progress','completed','cancelled')),
    completed_date DATE,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS homework_user_due_idx ON homework(user_id, due_date);
CREATE INDEX IF NOT EXISTS homework_user_status_idx ON homework(user_id, status);

CREATE TABLE IF NOT EXISTS workout_templates (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    recurring BOOLEAN NOT NULL DEFAULT TRUE,
    starts_on DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workout_template_days (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_id UUID NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
    workout_name VARCHAR(120) NOT NULL,
    workout_type VARCHAR(30) NOT NULL CHECK (workout_type IN ('Push','Pull','Legs','Upper','Lower','Full Body','Cardio','Rest')),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    planned_minutes INTEGER NOT NULL CHECK (planned_minutes BETWEEN 1 AND 1440),
    UNIQUE (template_id, day_of_week)
);
CREATE INDEX IF NOT EXISTS workout_template_days_user_idx ON workout_template_days(user_id);

CREATE TABLE IF NOT EXISTS workout_exercises (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_day_id UUID NOT NULL REFERENCES workout_template_days(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    sets SMALLINT NOT NULL CHECK (sets BETWEEN 1 AND 30),
    reps VARCHAR(40) NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    position SMALLINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS workout_exercises_user_idx ON workout_exercises(user_id);

CREATE TABLE IF NOT EXISTS workout_schedule (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_id UUID NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
    template_day_id UUID NOT NULL REFERENCES workout_template_days(id) ON DELETE CASCADE,
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (template_id, day_of_week)
);
CREATE INDEX IF NOT EXISTS workout_schedule_user_idx ON workout_schedule(user_id);

CREATE TABLE IF NOT EXISTS scheduled_workouts (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_id UUID NOT NULL UNIQUE REFERENCES calendar_events(id) ON DELETE CASCADE,
    template_id UUID REFERENCES workout_templates(id) ON DELETE SET NULL,
    schedule_id UUID REFERENCES workout_schedule(id) ON DELETE SET NULL,
    source VARCHAR(20) NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','recurring')),
    name VARCHAR(120) NOT NULL,
    workout_type VARCHAR(30) NOT NULL CHECK (workout_type IN ('Push','Pull','Legs','Upper','Lower','Full Body','Cardio','Rest')),
    workout_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    planned_minutes INTEGER NOT NULL CHECK (planned_minutes BETWEEN 1 AND 1440),
    actual_minutes INTEGER NOT NULL DEFAULT 0 CHECK (actual_minutes BETWEEN 0 AND 1440),
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','completed','cancelled')),
    completed_at TIMESTAMPTZ,
    notes TEXT NOT NULL DEFAULT '',
    exercises JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS scheduled_workouts_recurring_unique ON scheduled_workouts(user_id, template_id, workout_date) WHERE template_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS scheduled_workouts_user_date_idx ON scheduled_workouts(user_id, workout_date);
CREATE INDEX IF NOT EXISTS scheduled_workouts_user_status_idx ON scheduled_workouts(user_id, status);

CREATE TABLE IF NOT EXISTS workout_logs (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scheduled_workout_id UUID NOT NULL UNIQUE REFERENCES scheduled_workouts(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL,
    duration_seconds INTEGER NOT NULL CHECK (duration_seconds BETWEEN 1 AND 86400),
    exercises JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS workout_logs_user_completed_idx ON workout_logs(user_id, completed_at);

CREATE TABLE IF NOT EXISTS part_time_jobs (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    job_name VARCHAR(120) NOT NULL,
    company VARCHAR(160) NOT NULL,
    hourly_target NUMERIC(6,2) CHECK (hourly_target IS NULL OR hourly_target BETWEEN 0 AND 168),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS work_sessions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES part_time_jobs(id) ON DELETE CASCADE,
    event_id UUID NOT NULL UNIQUE REFERENCES calendar_events(id) ON DELETE CASCADE,
    work_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    planned_minutes INTEGER NOT NULL CHECK (planned_minutes BETWEEN 1 AND 1440),
    actual_minutes INTEGER NOT NULL DEFAULT 0 CHECK (actual_minutes BETWEEN 0 AND 1440),
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    notes TEXT NOT NULL DEFAULT '',
    tasks_completed JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS work_sessions_user_date_idx ON work_sessions(user_id, work_date);

CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(240) NOT NULL,
    category VARCHAR(30) NOT NULL CHECK (category IN ('Study','Homework','Part-Time Job','Gym','General')),
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    due_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS tasks_user_due_idx ON tasks(user_id, due_date);
CREATE INDEX IF NOT EXISTS tasks_user_completed_idx ON tasks(user_id, completed);

CREATE TABLE IF NOT EXISTS activity_sessions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity VARCHAR(20) NOT NULL CHECK (activity IN ('study','homework','job','gym')),
    subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
    subject VARCHAR(120) NOT NULL DEFAULT '',
    topic VARCHAR(240) NOT NULL DEFAULT '',
    planned_duration INTEGER NOT NULL CHECK (planned_duration BETWEEN 1 AND 86400),
    actual_duration INTEGER NOT NULL DEFAULT 0 CHECK (actual_duration BETWEEN 0 AND 86400),
    status VARCHAR(20) NOT NULL CHECK (status IN ('running','paused','completed','cancelled')),
    session_type VARCHAR(20) NOT NULL CHECK (session_type IN ('focus','shortBreak','longBreak','activity')),
    pomodoro_number INTEGER NOT NULL DEFAULT 0 CHECK (pomodoro_number >= 0),
    started_at TIMESTAMPTZ NOT NULL,
    active_started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    workout_id UUID REFERENCES scheduled_workouts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS activity_sessions_one_active_per_user ON activity_sessions(user_id) WHERE status IN ('running','paused');
CREATE INDEX IF NOT EXISTS activity_sessions_user_started_idx ON activity_sessions(user_id, started_at);
CREATE INDEX IF NOT EXISTS activity_sessions_user_status_idx ON activity_sessions(user_id, status);

CREATE TABLE IF NOT EXISTS app_sessions (
    sid VARCHAR(255) PRIMARY KEY,
    sess JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS app_sessions_expires_idx ON app_sessions(expires_at);
