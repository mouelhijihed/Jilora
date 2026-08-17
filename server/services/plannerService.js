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

async function resolveSubject(client, userId, details = {}) {
    if (details.subjectId) {
        const subject = await client.query("SELECT id,name FROM subjects WHERE id=$1 AND user_id=$2", [details.subjectId,userId]);
        if (!subject.rowCount) fail("Choose a valid subject");
        return subject.rows[0];
    }
    if (details.subject) {
        const subject = await client.query("SELECT id,name FROM subjects WHERE user_id=$1 AND LOWER(name)=LOWER($2)", [userId,details.subject]);
        if (subject.rowCount) return subject.rows[0];
    }
    return null;
}

async function attachTypedActivity(client, userId, event, details = {}) {
    if (event.type === "general") return event;
    const entityId = crypto.randomUUID();
    let metadata;
    if (event.type === "gym") {
        if (event.completed) fail("Create the workout first, then complete it with a workout log",409);
        const workoutType = details.workoutType || "Other";
        await client.query(`INSERT INTO scheduled_workouts(id,user_id,event_id,source,name,workout_type,workout_date,start_time,end_time,planned_minutes,completed,status,completed_at,notes)
            VALUES($1,$2,$3,'manual',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [entityId,userId,event.id,event.title,workoutType,event.date,event.startTime,event.endTime,event.duration,event.completed,event.completed?"completed":"planned",event.completed?new Date():null,event.notes]);
        metadata = { entityType:"workout", entityId, workoutType };
    } else if (event.type === "homework") {
        const subject = await resolveSubject(client,userId,details);
        const subjectName = subject?.name || details.subject || "";
        await client.query(`INSERT INTO homework(id,user_id,event_id,subject_id,subject_name,title,description,due_date,due_time,priority,estimated_minutes,status,completed_date,completed_at)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, [entityId,userId,event.id,subject?.id||null,subjectName,event.title,event.notes,event.date,event.endTime,details.priority||"medium",event.duration,event.completed?"completed":"todo",event.completed?event.date:null,event.completed?new Date():null]);
        metadata = { entityType:"homeworkTask", entityId, ...(subject?.id?{subjectId:subject.id}:{}), subject:subjectName, priority:details.priority||"medium" };
    } else if (event.type === "study") {
        const subject = await resolveSubject(client,userId,details);
        await client.query(`INSERT INTO study_sessions(id,user_id,event_id,subject_id,session_date,start_time,end_time,planned_minutes,actual_minutes,completed,completed_at,notes)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,0,$9,$10,$11)`, [entityId,userId,event.id,subject?.id||null,event.date,event.startTime,event.endTime,event.duration,event.completed,event.completed?new Date():null,event.notes]);
        metadata = { entityType:"studySession", entityId, ...(subject?.id?{subjectId:subject.id}:{}) };
    } else if (event.type === "job") {
        const job = await client.query("SELECT id FROM part_time_jobs WHERE user_id=$1", [userId]);
        if (!job.rowCount) fail("Configure your part-time job first",409);
        await client.query(`INSERT INTO work_sessions(id,user_id,job_id,event_id,work_date,start_time,end_time,planned_minutes,actual_minutes,completed,completed_at,notes,tasks_completed)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,0,$9,$10,$11,'[]'::jsonb)`, [entityId,userId,job.rows[0].id,event.id,event.date,event.startTime,event.endTime,event.duration,event.completed,event.completed?new Date():null,event.notes]);
        metadata = { entityType:"workSession", entityId, jobId:job.rows[0].id };
    }
    const result = await client.query("UPDATE calendar_events SET metadata=$3,updated_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING *", [event.id,userId,metadata]);
    return map.event(result.rows[0]);
}

async function createEvent(userId, input) {
    validateNewEventTime(input);
    return withTransaction(async (client) => {
        const event = await insertEvent(client,userId,input,undefined,{});
        return attachTypedActivity(client,userId,event,input.activityDetails);
    });
}

async function findLinkedActivity(client,userId,eventId) {
    const result = await client.query(`
        SELECT 'workout' entity_type,id entity_id,source FROM scheduled_workouts WHERE event_id=$1 AND user_id=$2
        UNION ALL SELECT 'studySession',id,NULL FROM study_sessions WHERE event_id=$1 AND user_id=$2
        UNION ALL SELECT 'homeworkTask',id,NULL FROM homework WHERE event_id=$1 AND user_id=$2
        UNION ALL SELECT 'workSession',id,NULL FROM work_sessions WHERE event_id=$1 AND user_id=$2
        LIMIT 1`, [eventId,userId]);
    if (!result.rowCount) return null;
    return { entityType:result.rows[0].entity_type, entityId:result.rows[0].entity_id, source:result.rows[0].source };
}

async function updateLinkedRecord(client, userId, previous, next, details = {}, link = null) {
    const entityType = link?.entityType;
    const entityId = link?.entityId;
    if (!entityType || !entityId) return;
    if (entityType === "workout" && !previous.completed && next.completed) fail("Complete workouts through the workout log so actual time is recorded", 409);
    if (entityType === "studySession") {
        const hasSubject = Object.prototype.hasOwnProperty.call(details,"subjectId");
        const subject = details.subjectId ? await resolveSubject(client,userId,details) : null;
        await client.query(`UPDATE study_sessions SET subject_id=CASE WHEN $3 THEN $4 ELSE subject_id END,session_date=$5,start_time=$6,end_time=$7,planned_minutes=$8,completed=$9,completed_at=CASE WHEN $9 THEN COALESCE(completed_at,NOW()) ELSE NULL END,notes=$10,updated_at=NOW() WHERE id=$1 AND user_id=$2`, [entityId,userId,hasSubject,subject?.id||null,next.date,next.startTime,next.endTime,next.duration,next.completed,next.notes]);
        if (subject) previous.metadata.subjectId=subject.id;
        else if (hasSubject) delete previous.metadata.subjectId;
    } else if (entityType === "homeworkTask") {
        const hasSubject = Object.prototype.hasOwnProperty.call(details,"subjectId") || Object.prototype.hasOwnProperty.call(details,"subject");
        const subject = details.subjectId || details.subject ? await resolveSubject(client,userId,details) : null;
        const subjectName = subject?.name ?? details.subject ?? null;
        await client.query(`UPDATE homework SET subject_id=CASE WHEN $3 THEN $4 ELSE subject_id END,subject_name=CASE WHEN $3 THEN COALESCE($5,'') ELSE subject_name END,priority=COALESCE($6,priority),title=$7,due_date=$8,due_time=$9,estimated_minutes=$10,status=CASE WHEN $11 THEN 'completed' WHEN status='completed' THEN 'todo' ELSE status END,completed_date=CASE WHEN $11 THEN CURRENT_DATE ELSE NULL END,completed_at=CASE WHEN $11 THEN COALESCE(completed_at,NOW()) ELSE NULL END,description=$12,updated_at=NOW() WHERE id=$1 AND user_id=$2`, [entityId,userId,hasSubject,subject?.id||null,subjectName,details.priority||null,next.title,next.date,next.endTime,next.duration,next.completed,next.notes]);
        if (subject?.id) previous.metadata.subjectId=subject.id;
        else if (hasSubject) delete previous.metadata.subjectId;
        if (details.subject !== undefined) previous.metadata.subject=details.subject;
        if (details.priority) previous.metadata.priority=details.priority;
    } else if (entityType === "workSession") {
        await client.query(`UPDATE work_sessions SET work_date=$3,start_time=$4,end_time=$5,planned_minutes=$6,completed=$7,completed_at=CASE WHEN $7 THEN COALESCE(completed_at,NOW()) ELSE NULL END,notes=$8,updated_at=NOW() WHERE id=$1 AND user_id=$2`, [entityId,userId,next.date,next.startTime,next.endTime,next.duration,next.completed,next.notes]);
    } else if (entityType === "workout") {
        await client.query(`UPDATE scheduled_workouts SET name=$3,workout_type=COALESCE($4,workout_type),workout_date=$5,start_time=$6,end_time=$7,planned_minutes=$8,notes=$9,updated_at=NOW() WHERE id=$1 AND user_id=$2`, [entityId,userId,next.title,details.workoutType||null,next.date,next.startTime,next.endTime,next.duration,next.notes]);
        if (details.workoutType) previous.metadata.workoutType=details.workoutType;
    }
    await client.query("UPDATE calendar_events SET metadata=$3 WHERE id=$1 AND user_id=$2", [next.id,userId,previous.metadata]);
}

async function updateEvent(userId, id, input) {
    return withTransaction(async (client) => {
        const current = await client.query("SELECT * FROM calendar_events WHERE id=$1 AND user_id=$2 FOR UPDATE", [id, userId]);
        if (!current.rowCount) fail("Event not found", 404);
        const previous = map.event(current.rows[0]);
        const link = await findLinkedActivity(client,userId,id);
        if (link) previous.metadata = { ...previous.metadata, entityType:link.entityType, entityId:link.entityId };
        const planned = schedule(input, "Event");
        const linkedType = link?.entityType;
        const forcedType = linkedType === "workout" ? "gym" : linkedType === "studySession" ? "study" : linkedType === "homeworkTask" ? "homework" : linkedType === "workSession" ? "job" : input.type;
        const result = await client.query(
            `UPDATE calendar_events SET title=$3,type=$4,event_date=$5,start_time=$6,end_time=$7,duration_minutes=$8,completed=$9,notes=$10,updated_at=NOW()
             WHERE id=$1 AND user_id=$2 RETURNING *`,
            [id,userId,input.title,forcedType,planned.date,planned.startTime,planned.endTime,planned.plannedMinutes,input.completed,input.notes],
        );
        let next = map.event(result.rows[0]);
        await updateLinkedRecord(client, userId, previous, next, input.activityDetails, link);
        if (!linkedType && next.type !== "general") next = await attachTypedActivity(client,userId,next,input.activityDetails);
        else if (linkedType) next.metadata = previous.metadata;
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
        const link = await findLinkedActivity(client,userId,id);
        if (link?.entityType === "workout") {
            if (link.source === "recurring") {
                await client.query("UPDATE scheduled_workouts SET status='cancelled',completed=FALSE,actual_minutes=0,completed_at=NULL,updated_at=NOW() WHERE id=$1 AND user_id=$2",[link.entityId,userId]);
                await client.query("DELETE FROM workout_logs WHERE scheduled_workout_id=$1 AND user_id=$2",[link.entityId,userId]);
                await client.query("DELETE FROM activity_sessions WHERE workout_id=$1 AND user_id=$2",[link.entityId,userId]);
                await client.query("DELETE FROM calendar_events WHERE id=$1 AND user_id=$2",[id,userId]);
                return;
            }
            await client.query("DELETE FROM scheduled_workouts WHERE id=$1 AND user_id=$2",[link.entityId,userId]);
        }
        await client.query("DELETE FROM calendar_events WHERE id=$1 AND user_id=$2", [id,userId]);
    });
}

module.exports = { listEvents, insertEvent, createEvent, updateEvent, setCompleted, deleteEvent };
