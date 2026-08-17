const crypto = require("crypto");
const { getPool, withTransaction } = require("../db/pool");
const { schedule, fail } = require("../utils/domain");
const { dateKey } = require("../utils/records");
const map = require("./mappers");

function validateNewEventTime(input) {
    const today = dateKey();
    if (input.date < today) fail("Events cannot be created in the past", 400);
    if (input.date === today) {
        const [hour, minute] = input.startTime.split(":").map(Number);
        const startsAt = new Date();
        startsAt.setHours(hour, minute, 0, 0);
        if (startsAt < new Date()) fail("Event start time must be in the future", 400);
    }
}

async function listEvents(userId, start, end) {
    const values = [userId];
    const filters = ["user_id = $1"];
    if (start) { values.push(start); filters.push(`event_date >= $${values.length}`); }
    if (end) { values.push(end); filters.push(`event_date <= $${values.length}`); }
    const result = await getPool().query(`SELECT * FROM calendar_events WHERE ${filters.join(" AND ")} ORDER BY event_date,start_time`, values);
    return result.rows.map(map.event);
}

async function insertEvent(client, userId, input, id = crypto.randomUUID(), metadata = input.metadata || {}) {
    const planned = schedule(input, "Event");
    const result = await client.query(
        `INSERT INTO calendar_events(id,user_id,title,type,event_date,start_time,end_time,duration_minutes,completed,notes,metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [id, userId, input.title, input.type, planned.date, planned.startTime, planned.endTime, planned.plannedMinutes, input.completed, input.notes, metadata],
    );
    return map.event(result.rows[0]);
}

async function createEvent(userId, input) {
    validateNewEventTime(input);
    return insertEvent(getPool(), userId, input);
}

async function updateLinkedRecord(client, userId, previous, next) {
    const entityType = previous.metadata?.entityType;
    const entityId = previous.metadata?.entityId;
    if (!entityType || !entityId) return;
    if (entityType === "workout" && !previous.completed && next.completed) fail("Complete workouts through the workout log so actual time is recorded", 409);
    if (entityType === "studySession") {
        await client.query(`UPDATE study_sessions SET session_date=$3,start_time=$4,end_time=$5,planned_minutes=$6,completed=$7,completed_at=CASE WHEN $7 THEN COALESCE(completed_at,NOW()) ELSE NULL END,notes=$8,updated_at=NOW() WHERE id=$1 AND user_id=$2`, [entityId,userId,next.date,next.startTime,next.endTime,next.duration,next.completed,next.notes]);
    } else if (entityType === "homeworkTask") {
        await client.query(`UPDATE homework SET title=$3,due_date=$4,due_time=$5,estimated_minutes=$6,status=CASE WHEN $7 THEN 'completed' WHEN status='completed' THEN 'todo' ELSE status END,completed_date=CASE WHEN $7 THEN CURRENT_DATE ELSE NULL END,completed_at=CASE WHEN $7 THEN COALESCE(completed_at,NOW()) ELSE NULL END,updated_at=NOW() WHERE id=$1 AND user_id=$2`, [entityId,userId,next.title,next.date,next.endTime,next.duration,next.completed]);
    } else if (entityType === "workSession") {
        await client.query(`UPDATE work_sessions SET work_date=$3,start_time=$4,end_time=$5,planned_minutes=$6,completed=$7,completed_at=CASE WHEN $7 THEN COALESCE(completed_at,NOW()) ELSE NULL END,notes=$8,updated_at=NOW() WHERE id=$1 AND user_id=$2`, [entityId,userId,next.date,next.startTime,next.endTime,next.duration,next.completed,next.notes]);
    } else if (entityType === "workout") {
        await client.query(`UPDATE scheduled_workouts SET name=$3,workout_date=$4,start_time=$5,end_time=$6,planned_minutes=$7,notes=$8,updated_at=NOW() WHERE id=$1 AND user_id=$2`, [entityId,userId,next.title,next.date,next.startTime,next.endTime,next.duration,next.notes]);
    }
}

async function updateEvent(userId, id, input) {
    return withTransaction(async (client) => {
        const current = await client.query("SELECT * FROM calendar_events WHERE id=$1 AND user_id=$2 FOR UPDATE", [id, userId]);
        if (!current.rowCount) fail("Event not found", 404);
        const previous = map.event(current.rows[0]);
        const planned = schedule(input, "Event");
        const linkedType = previous.metadata?.entityType;
        const forcedType = linkedType === "workout" ? "gym" : linkedType === "studySession" ? "study" : linkedType === "homeworkTask" ? "homework" : linkedType === "workSession" ? "job" : input.type;
        const result = await client.query(
            `UPDATE calendar_events SET title=$3,type=$4,event_date=$5,start_time=$6,end_time=$7,duration_minutes=$8,completed=$9,notes=$10,updated_at=NOW()
             WHERE id=$1 AND user_id=$2 RETURNING *`,
            [id,userId,input.title,forcedType,planned.date,planned.startTime,planned.endTime,planned.plannedMinutes,input.completed,input.notes],
        );
        const next = map.event(result.rows[0]);
        await updateLinkedRecord(client, userId, previous, next);
        return next;
    });
}

async function setCompleted(userId, id, completed) {
    const current = await getPool().query("SELECT * FROM calendar_events WHERE id=$1 AND user_id=$2", [id,userId]);
    if (!current.rowCount) fail("Event not found",404);
    const value = map.event(current.rows[0]);
    return updateEvent(userId,id,{ title:value.title,type:value.type,date:value.date,startTime:value.startTime,endTime:value.endTime,completed,notes:value.notes,metadata:value.metadata });
}

async function deleteEvent(userId, id) {
    return withTransaction(async (client) => {
        const current = await client.query("SELECT * FROM calendar_events WHERE id=$1 AND user_id=$2 FOR UPDATE", [id,userId]);
        if (!current.rowCount) fail("Event not found",404);
        const metadata = current.rows[0].metadata || {};
        if (metadata.entityType === "workout") {
            const workout = await client.query("SELECT source FROM scheduled_workouts WHERE id=$1 AND user_id=$2", [metadata.entityId,userId]);
            if (workout.rows[0]?.source === "recurring") {
                await client.query("UPDATE scheduled_workouts SET status='cancelled',completed=FALSE,actual_minutes=0,completed_at=NULL,updated_at=NOW() WHERE id=$1 AND user_id=$2",[metadata.entityId,userId]);
                await client.query("DELETE FROM workout_logs WHERE scheduled_workout_id=$1 AND user_id=$2",[metadata.entityId,userId]);
                await client.query("DELETE FROM activity_sessions WHERE workout_id=$1 AND user_id=$2",[metadata.entityId,userId]);
                await client.query("DELETE FROM calendar_events WHERE id=$1 AND user_id=$2",[id,userId]);
                return;
            }
        }
        await client.query("DELETE FROM calendar_events WHERE id=$1 AND user_id=$2", [id,userId]);
    });
}

module.exports = { listEvents, insertEvent, createEvent, updateEvent, setCompleted, deleteEvent };
