WITH invalid_users AS (
    SELECT DISTINCT ss.user_id
    FROM study_sessions ss
    WHERE NOT EXISTS (
        SELECT 1 FROM subjects s
        WHERE s.id=ss.subject_id AND s.user_id=ss.user_id
    )
), recovered_subjects AS (
    SELECT
        (
            SUBSTRING(MD5(user_id::text || ':recovered-study-subject'),1,8) || '-' ||
            SUBSTRING(MD5(user_id::text || ':recovered-study-subject'),9,4) || '-' ||
            SUBSTRING(MD5(user_id::text || ':recovered-study-subject'),13,4) || '-' ||
            SUBSTRING(MD5(user_id::text || ':recovered-study-subject'),17,4) || '-' ||
            SUBSTRING(MD5(user_id::text || ':recovered-study-subject'),21,12)
        )::uuid id,
        user_id
    FROM invalid_users
)
INSERT INTO subjects(id,user_id,name,target_weekly_hours,target_monthly_hours,priority,color)
SELECT id,user_id,'Recovered study subject',0,0,'medium','#72c59b'
FROM recovered_subjects
ON CONFLICT(user_id,name) DO NOTHING;

UPDATE study_sessions ss
SET subject_id=s.id, updated_at=NOW()
FROM subjects s
WHERE s.user_id=ss.user_id
  AND s.name='Recovered study subject'
  AND NOT EXISTS (
      SELECT 1 FROM subjects owned
      WHERE owned.id=ss.subject_id AND owned.user_id=ss.user_id
  );

UPDATE calendar_events e
SET title=s.name,
    metadata=e.metadata || jsonb_build_object('entityType','studySession','entityId',ss.id,'subjectId',s.id),
    updated_at=NOW()
FROM study_sessions ss
JOIN subjects s ON s.id=ss.subject_id AND s.user_id=ss.user_id
WHERE ss.event_id=e.id AND e.user_id=ss.user_id;

ALTER TABLE study_sessions ALTER COLUMN subject_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS subjects_id_user_unique ON subjects(id,user_id);
ALTER TABLE study_sessions DROP CONSTRAINT IF EXISTS study_sessions_subject_id_fkey;
ALTER TABLE study_sessions
    ADD CONSTRAINT study_sessions_subject_owner_fkey
    FOREIGN KEY(subject_id,user_id) REFERENCES subjects(id,user_id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE study_sessions VALIDATE CONSTRAINT study_sessions_subject_owner_fkey;
