ALTER TABLE scheduled_workouts DROP CONSTRAINT IF EXISTS scheduled_workouts_event_owner_fkey;
ALTER TABLE scheduled_workouts DROP CONSTRAINT IF EXISTS scheduled_workouts_event_id_fkey;
ALTER TABLE scheduled_workouts ALTER COLUMN event_id DROP NOT NULL;
ALTER TABLE scheduled_workouts
    ADD CONSTRAINT scheduled_workouts_event_id_fkey
    FOREIGN KEY(event_id) REFERENCES calendar_events(id) ON DELETE SET NULL;
ALTER TABLE scheduled_workouts
    ADD CONSTRAINT scheduled_workouts_active_event_check
    CHECK (status='cancelled' OR event_id IS NOT NULL) NOT VALID;
ALTER TABLE scheduled_workouts VALIDATE CONSTRAINT scheduled_workouts_active_event_check;
