UPDATE calendar_events e
SET type='general', metadata=e.metadata - 'entityType' - 'entityId' - 'subjectId', updated_at=NOW()
FROM study_sessions ss
WHERE ss.event_id=e.id
  AND NOT EXISTS (
      SELECT 1 FROM subjects s
      WHERE s.id=ss.subject_id AND s.user_id=ss.user_id
  );

DELETE FROM study_sessions ss
WHERE NOT EXISTS (
    SELECT 1 FROM subjects s
    WHERE s.id=ss.subject_id AND s.user_id=ss.user_id
);

ALTER TABLE study_sessions ALTER COLUMN subject_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS subjects_id_user_unique ON subjects(id,user_id);
ALTER TABLE study_sessions DROP CONSTRAINT IF EXISTS study_sessions_subject_id_fkey;
ALTER TABLE study_sessions
    ADD CONSTRAINT study_sessions_subject_owner_fkey
    FOREIGN KEY(subject_id,user_id) REFERENCES subjects(id,user_id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE study_sessions VALIDATE CONSTRAINT study_sessions_subject_owner_fkey;
