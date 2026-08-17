const crypto = require("crypto");
const { getPool, withTransaction } = require("../db/pool");
const { fail } = require("../utils/domain");
const { dateKey } = require("../utils/records");
const map = require("./mappers");
const partner = require("./partnerService");

function filters(userId, query = {}) {
    const values = [userId], clauses = ["a.user_id=$1"];
    if (query.activity) { values.push(query.activity); clauses.push(`a.activity=$${values.length}`); }
    if (query.subject) { values.push(query.subject.toLowerCase()); clauses.push(`LOWER(a.subject)=$${values.length}`); }
    if (query.start) { values.push(query.start); clauses.push(`a.started_at::date >= $${values.length}`); }
    if (query.end) { values.push(query.end); clauses.push(`a.started_at::date <= $${values.length}`); }
    if (query.status) { values.push(query.status); clauses.push(`a.status=$${values.length}`); }
    return { values, where: clauses.join(" AND ") };
}

async function listSessions(userId, query) { const value=filters(userId,query); return (await getPool().query(`SELECT a.* FROM activity_sessions a WHERE ${value.where} ORDER BY a.started_at DESC`,value.values)).rows.map(map.activitySession); }
async function activeSession(userId) { return map.activitySession((await getPool().query("SELECT * FROM activity_sessions WHERE user_id=$1 AND status IN ('running','paused') ORDER BY started_at DESC LIMIT 1",[userId])).rows[0])||null; }
async function getSettings(userId) { return map.camelizeRow((await getPool().query("SELECT focus_duration,short_break_duration,long_break_duration FROM user_settings WHERE user_id=$1",[userId])).rows[0]); }
async function updateSettings(userId,input) { return map.camelizeRow((await getPool().query("UPDATE user_settings SET focus_duration=$2,short_break_duration=$3,long_break_duration=$4,updated_at=NOW() WHERE user_id=$1 RETURNING focus_duration,short_break_duration,long_break_duration",[userId,input.focusDuration,input.shortBreakDuration,input.longBreakDuration])).rows[0]); }

async function validateSubject(userId, subjectId, client = getPool()) {
    if (!subjectId) return null;
    const result=await client.query("SELECT id,name FROM subjects WHERE id=$1 AND user_id=$2",[subjectId,userId]);
    if(!result.rowCount)fail("Choose a valid subject");
    return result.rows[0];
}

function parsedDate(value, label) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) fail(`${label} is invalid`);
    return date;
}

function validateCompletedTiming(startedAt, completedAt, actualDuration) {
    const now = Date.now() + 5000;
    if (startedAt.getTime() > now || completedAt.getTime() > now) fail("Completed sessions cannot be in the future");
    if (completedAt < startedAt) fail("completedAt cannot be before startedAt");
    if (actualDuration <= 0) fail("Completed study duration must be positive");
    if (actualDuration > Math.floor((completedAt - startedAt) / 1000) + 5) fail("Study duration cannot exceed the session time");
}

function elapsedSeconds(row, now = new Date()) {
    let value = Number(row.actual_duration || 0);
    if (row.status === "running" && row.active_started_at) {
        value += Math.max(0, Math.floor((now - new Date(row.active_started_at)) / 1000));
    }
    return Math.max(0, Math.min(86400, value));
}

async function createSession(userId,input){
    const subject=await validateSubject(userId,input.subjectId);
    const status=input.status||"completed",startedAt=input.startedAt?parsedDate(input.startedAt,"startedAt"):new Date();
    const activeStartedAt=status==="running"?new Date():null;
    const completedAt=status==="completed"?(input.completedAt?parsedDate(input.completedAt,"completedAt"):new Date()):null;
    const actualDuration=input.actualDuration||0;
    if(startedAt.getTime()>Date.now()+5000)fail("Sessions cannot start in the future");
    if(status==="completed"&&input.activity==="study"&&(input.sessionType||"activity")==="focus")validateCompletedTiming(startedAt,completedAt,actualDuration);
    const result=await getPool().query(
        `INSERT INTO activity_sessions(id,user_id,activity,subject_id,subject,topic,planned_duration,actual_duration,status,session_type,pomodoro_number,started_at,active_started_at,completed_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        [crypto.randomUUID(),userId,input.activity,subject?.id||null,subject?.name||input.subject||"",input.topic||"",input.plannedDuration,actualDuration,status,input.sessionType||"activity",input.pomodoroNumber||0,startedAt,activeStartedAt,completedAt]);
    if(status==="completed"&&input.activity==="study"&&(input.sessionType||"activity")==="focus")await partner.recordSharedActivity(userId,"pomodoro_completed","Completed a Pomodoro.");
    return map.activitySession(result.rows[0]);
}

async function updateSession(userId,id,input){
    return withTransaction(async(client)=>{
        const currentResult=await client.query("SELECT * FROM activity_sessions WHERE id=$1 AND user_id=$2 FOR UPDATE",[id,userId]);
        if(!currentResult.rowCount)fail("Session not found",404);
        const current=currentResult.rows[0];
        if(current.partner_session_id)fail("Shared study records are managed by the shared session",409);
        const nextStatus=input.status||current.status;
        const allowedTransitions={running:new Set(["running","paused","completed","cancelled"]),paused:new Set(["paused","running","completed","cancelled"]),completed:new Set(["completed"]),cancelled:new Set(["cancelled"])};
        if(!allowedTransitions[current.status].has(nextStatus))fail(`A ${current.status} session cannot become ${nextStatus}`,409);
        if(current.status==="cancelled")return map.activitySession(current);

        const fields=[],values=[id,userId];
        const add=(column,value)=>{values.push(value);fields.push(`${column}=$${values.length}`);};
        if(input.subjectId!==undefined){const subject=await validateSubject(userId,input.subjectId,client);add("subject_id",subject?.id||null);add("subject",subject?.name||"");}
        if(input.topic!==undefined)add("topic",input.topic);

        const now=new Date();
        if(current.status==="running"||current.status==="paused"){
            if(nextStatus===current.status)return map.activitySession(current);
            if(nextStatus==="paused"){
                add("status","paused");add("actual_duration",elapsedSeconds(current,now));add("active_started_at",null);
            }else if(nextStatus==="running"){
                add("status","running");add("active_started_at",now);
            }else if(nextStatus==="cancelled"){
                add("status","cancelled");add("actual_duration",elapsedSeconds(current,now));add("active_started_at",null);add("completed_at",null);
            }else if(nextStatus==="completed"){
                const actual=elapsedSeconds(current,now);
                if(actual<=0)fail("Study duration must be positive",409);
                add("status","completed");add("actual_duration",actual);add("active_started_at",null);add("completed_at",now);
            }
        }else{
            for(const [key,column] of [["plannedDuration","planned_duration"],["actualDuration","actual_duration"],["pomodoroNumber","pomodoro_number"]])if(input[key]!==undefined)add(column,input[key]);
            if(input.startedAt!==undefined)add("started_at",parsedDate(input.startedAt,"startedAt"));
            if(input.completedAt!==undefined)add("completed_at",input.completedAt?parsedDate(input.completedAt,"completedAt"):null);
            const startedAt=input.startedAt!==undefined?parsedDate(input.startedAt,"startedAt"):new Date(current.started_at);
            const completedAt=input.completedAt!==undefined?parsedDate(input.completedAt,"completedAt"):new Date(current.completed_at);
            const actual=input.actualDuration!==undefined?input.actualDuration:Number(current.actual_duration);
            validateCompletedTiming(startedAt,completedAt,actual);
        }
        if(!fields.length)return map.activitySession(current);
        const result=await client.query(`UPDATE activity_sessions SET ${fields.join(",")},updated_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING *`,values);
        if(current.status!=="completed"&&result.rows[0].status==="completed"&&result.rows[0].activity==="study"&&result.rows[0].session_type==="focus")await partner.recordSharedActivity(userId,"pomodoro_completed","Completed a Pomodoro.",client);
        return map.activitySession(result.rows[0]);
    });
}

async function cancelSession(userId,id){return updateSession(userId,id,{status:"cancelled"});}
async function deleteSession(userId,id){const result=await getPool().query("DELETE FROM activity_sessions WHERE id=$1 AND user_id=$2 AND partner_session_id IS NULL",[id,userId]);if(!result.rowCount)fail("Session not found",404);}

async function analytics(userId,startValue,endValue){
    const end=endValue||dateKey(), start=startValue||addDaysSafe(end,-30);
    const rows=(await getPool().query("SELECT * FROM activity_sessions WHERE user_id=$1 AND status='completed' AND started_at::date BETWEEN $2 AND $3",[userId,start,end])).rows;
    const study=rows.filter((row)=>row.activity==="study"&&row.session_type==="focus");
    const total=study.reduce((sum,row)=>sum+row.actual_duration,0),bySubject={},byDay={},activityTotals={};
    for(const row of study){const subject=row.subject||"Unassigned",day=String(row.started_at).slice(0,10);bySubject[subject]=(bySubject[subject]||0)+row.actual_duration;byDay[day]=(byDay[day]||0)+row.actual_duration;}
    for(const row of rows)activityTotals[row.activity]=(activityTotals[row.activity]||0)+row.actual_duration;
    return{start,end,totalStudyDuration:total,completedPomodoros:study.length,averagePomodoroDuration:study.length?Math.round(total/study.length):0,bySubject:Object.entries(bySubject).map(([subject,actualDuration])=>({subject,actualDuration})),byDay:Object.entries(byDay).map(([date,actualDuration])=>({date,actualDuration})),activityTotals,completedSessions:rows.length};
}
function addDaysSafe(value,count){const date=new Date(`${value}T12:00:00`);date.setDate(date.getDate()+count);return dateKey(date);}

module.exports={listSessions,activeSession,getSettings,updateSettings,createSession,updateSession,cancelSession,deleteSession,analytics};
