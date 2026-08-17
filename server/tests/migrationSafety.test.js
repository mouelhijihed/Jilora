const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
require("./requireTestDatabase");

test("required Study subject migration preserves legacy sessions", async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.NODE_ENV = "test";

    const { migrate } = require("../db/migrate");
    await migrate();
    const { getPool, closePool } = require("../db/pool");
    const client = await getPool().connect();
    try {
        await client.query("BEGIN");
        await client.query("ALTER TABLE study_sessions DROP CONSTRAINT study_sessions_subject_owner_fkey");

        const userId = crypto.randomUUID();
        const eventId = crypto.randomUUID();
        const sessionId = crypto.randomUUID();
        await client.query("INSERT INTO users(id,email,username,password_hash,first_name,last_name) VALUES($1,$2,$3,'test-hash','Legacy','Study')", [userId, `legacy-${userId}@example.com`, `legacy_${userId.replaceAll("-", "")}`]);
        await client.query("INSERT INTO user_preferences(user_id) VALUES($1)", [userId]);
        await client.query("INSERT INTO user_settings(user_id) VALUES($1)", [userId]);
        await client.query("INSERT INTO calendar_events(id,user_id,title,type,event_date,start_time,end_time,duration_minutes,metadata) VALUES($1,$2,'Legacy Study','study','2026-08-18','10:00','11:00',60,'{}')", [eventId,userId]);
        await client.query("INSERT INTO study_sessions(id,user_id,event_id,subject_id,session_date,start_time,end_time,planned_minutes) VALUES($1,$2,$3,$4,'2026-08-18','10:00','11:00',60)", [sessionId,userId,eventId,crypto.randomUUID()]);

        const migration = await fs.readFile(path.join(__dirname, "../db/migrations/008_required_study_subjects.sql"), "utf8");
        await client.query(migration);

        const recovered = await client.query(`SELECT s.name,ss.subject_id,e.metadata
            FROM study_sessions ss
            JOIN subjects s ON s.id=ss.subject_id AND s.user_id=ss.user_id
            JOIN calendar_events e ON e.id=ss.event_id AND e.user_id=ss.user_id
            WHERE ss.id=$1`, [sessionId]);
        assert.equal(recovered.rowCount, 1);
        assert.equal(recovered.rows[0].name, "Recovered study subject");
        assert.equal(recovered.rows[0].metadata.entityType, "studySession");
        assert.equal(recovered.rows[0].metadata.entityId, sessionId);
        assert.equal(recovered.rows[0].metadata.subjectId, recovered.rows[0].subject_id);
    } finally {
        await client.query("ROLLBACK");
        client.release();
        await closePool();
    }
});
