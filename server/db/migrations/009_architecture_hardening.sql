ALTER TABLE user_settings
    ADD COLUMN IF NOT EXISTS time_zone VARCHAR(100) NOT NULL DEFAULT 'UTC';

ALTER TABLE scheduled_workouts
    ADD COLUMN IF NOT EXISTS occurrence_date DATE,
    ADD COLUMN IF NOT EXISTS is_override BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE scheduled_workouts
SET occurrence_date=workout_date
WHERE source='recurring' AND occurrence_date IS NULL;

ALTER TABLE scheduled_workouts
    DROP CONSTRAINT IF EXISTS scheduled_workouts_occurrence_check;
ALTER TABLE scheduled_workouts
    ADD CONSTRAINT scheduled_workouts_occurrence_check
    CHECK (source='manual' OR occurrence_date IS NOT NULL) NOT VALID;
ALTER TABLE scheduled_workouts VALIDATE CONSTRAINT scheduled_workouts_occurrence_check;

DROP INDEX IF EXISTS scheduled_workouts_recurring_unique;
CREATE UNIQUE INDEX IF NOT EXISTS scheduled_workouts_recurring_occurrence_unique
    ON scheduled_workouts(user_id,template_id,occurrence_date)
    WHERE template_id IS NOT NULL AND occurrence_date IS NOT NULL;

UPDATE scheduled_workouts sw
SET status='cancelled',completed=FALSE,actual_minutes=0,completed_at=NULL,event_id=NULL,updated_at=NOW()
WHERE sw.event_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM calendar_events e
      WHERE e.id=sw.event_id AND e.user_id=sw.user_id
  );

ALTER TABLE scheduled_workouts DROP CONSTRAINT IF EXISTS scheduled_workouts_event_id_fkey;
ALTER TABLE scheduled_workouts DROP CONSTRAINT IF EXISTS scheduled_workouts_event_owner_fkey;
ALTER TABLE scheduled_workouts
    ADD CONSTRAINT scheduled_workouts_event_owner_fkey
    FOREIGN KEY(event_id,user_id) REFERENCES calendar_events(id,user_id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE scheduled_workouts VALIDATE CONSTRAINT scheduled_workouts_event_owner_fkey;
