INSERT INTO scheduled_workouts(
    id,user_id,event_id,source,name,workout_type,workout_date,start_time,end_time,
    planned_minutes,completed,status,completed_at,notes
)
SELECT
    e.id,e.user_id,e.id,'manual',e.title,
    CASE WHEN e.metadata->>'workoutType' IN ('Strength','Push','Pull','Legs','Upper','Lower','Full Body','Cardio','Running','Swimming','Cycling','Boxing','Taekwondo','Football','Calisthenics','Weightlifting','Other','Rest')
        THEN e.metadata->>'workoutType' ELSE 'Other' END,
    e.event_date,e.start_time,e.end_time,e.duration_minutes,e.completed,
    CASE WHEN e.completed THEN 'completed' ELSE 'planned' END,
    CASE WHEN e.completed THEN e.updated_at ELSE NULL END,e.notes
FROM calendar_events e
WHERE e.type='gym'
  AND NOT EXISTS (SELECT 1 FROM scheduled_workouts sw WHERE sw.event_id=e.id);

INSERT INTO homework(
    id,user_id,event_id,subject_id,subject_name,title,description,due_date,due_time,
    priority,estimated_minutes,status,completed_date,completed_at
)
SELECT
    e.id,e.user_id,e.id,s.id,COALESCE(NULLIF(e.metadata->>'subject',''),s.name,''),
    e.title,e.notes,e.event_date,e.end_time,
    CASE WHEN e.metadata->>'priority' IN ('low','medium','high','critical') THEN e.metadata->>'priority' ELSE 'medium' END,
    e.duration_minutes,CASE WHEN e.completed THEN 'completed' ELSE 'todo' END,
    CASE WHEN e.completed THEN e.event_date ELSE NULL END,
    CASE WHEN e.completed THEN e.updated_at ELSE NULL END
FROM calendar_events e
LEFT JOIN subjects s ON s.user_id=e.user_id AND s.id::text=e.metadata->>'subjectId'
WHERE e.type='homework'
  AND NOT EXISTS (SELECT 1 FROM homework h WHERE h.event_id=e.id);

INSERT INTO study_sessions(
    id,user_id,event_id,subject_id,session_date,start_time,end_time,planned_minutes,
    actual_minutes,completed,completed_at,notes
)
SELECT
    e.id,e.user_id,e.id,s.id,e.event_date,e.start_time,e.end_time,e.duration_minutes,
    0,e.completed,CASE WHEN e.completed THEN e.updated_at ELSE NULL END,e.notes
FROM calendar_events e
JOIN subjects s ON s.user_id=e.user_id AND s.id::text=e.metadata->>'subjectId'
WHERE e.type='study'
  AND NOT EXISTS (SELECT 1 FROM study_sessions ss WHERE ss.event_id=e.id);

UPDATE calendar_events e
SET type='general', metadata=e.metadata - 'entityType' - 'entityId' - 'subjectId', updated_at=NOW()
WHERE e.type='study'
  AND NOT EXISTS (SELECT 1 FROM study_sessions ss WHERE ss.event_id=e.id);

INSERT INTO work_sessions(
    id,user_id,job_id,event_id,work_date,start_time,end_time,planned_minutes,
    actual_minutes,completed,completed_at,notes,tasks_completed
)
SELECT
    e.id,e.user_id,j.id,e.id,e.event_date,e.start_time,e.end_time,e.duration_minutes,
    0,e.completed,CASE WHEN e.completed THEN e.updated_at ELSE NULL END,e.notes,'[]'::jsonb
FROM calendar_events e
JOIN part_time_jobs j ON j.user_id=e.user_id
WHERE e.type='job'
  AND NOT EXISTS (SELECT 1 FROM work_sessions ws WHERE ws.event_id=e.id);

UPDATE calendar_events e SET metadata=e.metadata || jsonb_build_object(
    'entityType','workout','entityId',sw.id,'workoutType',sw.workout_type
)
FROM scheduled_workouts sw
WHERE sw.event_id=e.id AND sw.user_id=e.user_id;

UPDATE calendar_events e SET metadata=e.metadata || jsonb_strip_nulls(jsonb_build_object(
    'entityType','homeworkTask','entityId',h.id,'subjectId',h.subject_id,
    'subject',h.subject_name,'priority',h.priority
))
FROM homework h
WHERE h.event_id=e.id AND h.user_id=e.user_id;

UPDATE calendar_events e SET metadata=e.metadata || jsonb_strip_nulls(jsonb_build_object(
    'entityType','studySession','entityId',ss.id,'subjectId',ss.subject_id
))
FROM study_sessions ss
WHERE ss.event_id=e.id AND ss.user_id=e.user_id;

UPDATE calendar_events e SET metadata=e.metadata || jsonb_build_object(
    'entityType','workSession','entityId',ws.id,'jobId',ws.job_id
)
FROM work_sessions ws
WHERE ws.event_id=e.id AND ws.user_id=e.user_id;

CREATE UNIQUE INDEX IF NOT EXISTS calendar_events_id_user_unique ON calendar_events(id,user_id);

ALTER TABLE scheduled_workouts
    ADD CONSTRAINT scheduled_workouts_event_owner_fkey
    FOREIGN KEY(event_id,user_id) REFERENCES calendar_events(id,user_id) ON DELETE CASCADE NOT VALID;
ALTER TABLE homework
    ADD CONSTRAINT homework_event_owner_fkey
    FOREIGN KEY(event_id,user_id) REFERENCES calendar_events(id,user_id) ON DELETE CASCADE NOT VALID;
ALTER TABLE study_sessions
    ADD CONSTRAINT study_sessions_event_owner_fkey
    FOREIGN KEY(event_id,user_id) REFERENCES calendar_events(id,user_id) ON DELETE CASCADE NOT VALID;
ALTER TABLE work_sessions
    ADD CONSTRAINT work_sessions_event_owner_fkey
    FOREIGN KEY(event_id,user_id) REFERENCES calendar_events(id,user_id) ON DELETE CASCADE NOT VALID;

ALTER TABLE scheduled_workouts VALIDATE CONSTRAINT scheduled_workouts_event_owner_fkey;
ALTER TABLE homework VALIDATE CONSTRAINT homework_event_owner_fkey;
ALTER TABLE study_sessions VALIDATE CONSTRAINT study_sessions_event_owner_fkey;
ALTER TABLE work_sessions VALIDATE CONSTRAINT work_sessions_event_owner_fkey;
