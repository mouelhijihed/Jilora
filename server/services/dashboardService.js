const { getPool } = require("../db/pool");
const { dateKey, dateKeyInTimeZone, timeKeyInTimeZone, userTimeZone, startOfWeek, addDays } = require("../utils/records");
const map = require("./mappers");
const presenceService = require("./presenceService");
const partnerService = require("./partnerService");

async function dashboard(userId){
    const timeZone=await userTimeZone(userId,getPool()),now=new Date(),today=dateKeyInTimeZone(timeZone,now),currentTime=timeKeyInTimeZone(timeZone,now),weekStart=startOfWeek(today),weekEnd=addDays(weekStart,6);
    const [prefs,study,homework,gym,job,tasks,schedule,upcoming,priorities]=await Promise.all([
        getPool().query("SELECT student,gym,part_time_job FROM user_preferences WHERE user_id=$1",[userId]),
        getPool().query(`SELECT
          COALESCE((SELECT SUM(actual_minutes) FROM study_sessions WHERE user_id=$1 AND session_date=$2 AND completed),0)+COALESCE((SELECT SUM(a.actual_duration)/60 FROM activity_sessions a WHERE a.user_id=$1 AND a.activity='study' AND a.session_type='focus' AND a.status='completed' AND (a.completed_at AT TIME ZONE $5)::date=$2 AND EXISTS(SELECT 1 FROM subjects s WHERE s.id=a.subject_id AND s.user_id=a.user_id)),0) today,
          COALESCE((SELECT SUM(actual_minutes) FROM study_sessions WHERE user_id=$1 AND session_date BETWEEN $3 AND $4 AND completed),0)+COALESCE((SELECT SUM(a.actual_duration)/60 FROM activity_sessions a WHERE a.user_id=$1 AND a.activity='study' AND a.session_type='focus' AND a.status='completed' AND (a.completed_at AT TIME ZONE $5)::date BETWEEN $3 AND $4 AND EXISTS(SELECT 1 FROM subjects s WHERE s.id=a.subject_id AND s.user_id=a.user_id)),0) weekly`,[userId,today,weekStart,weekEnd,timeZone]),
        getPool().query(`SELECT COUNT(*) FILTER(WHERE due_date=$2 AND status<>'cancelled') total_today,COUNT(*) FILTER(WHERE due_date=$2 AND status='completed') completed_today,COUNT(*) FILTER(WHERE due_date BETWEEN $3 AND $4 AND status<>'cancelled') total_week,COUNT(*) FILTER(WHERE due_date BETWEEN $3 AND $4 AND status='completed') completed_week FROM homework WHERE user_id=$1`,[userId,today,weekStart,weekEnd]),
        getPool().query(`SELECT COUNT(*) FILTER(WHERE workout_date=$2 AND status<>'cancelled') total_today,COUNT(*) FILTER(WHERE workout_date=$2 AND completed) completed_today,COUNT(*) FILTER(WHERE workout_date BETWEEN $3 AND $4 AND status<>'cancelled') total_week,COUNT(*) FILTER(WHERE workout_date BETWEEN $3 AND $4 AND completed) completed_week,COALESCE(SUM(actual_minutes) FILTER(WHERE workout_date BETWEEN $3 AND $4 AND completed),0) weekly_minutes FROM scheduled_workouts WHERE user_id=$1`,[userId,today,weekStart,weekEnd]),
        getPool().query(`SELECT COALESCE(SUM(actual_minutes) FILTER(WHERE work_date=$2 AND completed),0)+COALESCE((SELECT SUM(actual_duration)/60 FROM activity_sessions WHERE user_id=$1 AND activity='job' AND status='completed' AND (completed_at AT TIME ZONE $5)::date=$2),0) today,COALESCE(SUM(actual_minutes) FILTER(WHERE work_date BETWEEN $3 AND $4 AND completed),0)+COALESCE((SELECT SUM(actual_duration)/60 FROM activity_sessions WHERE user_id=$1 AND activity='job' AND status='completed' AND (completed_at AT TIME ZONE $5)::date BETWEEN $3 AND $4),0) weekly FROM work_sessions WHERE user_id=$1`,[userId,today,weekStart,weekEnd,timeZone]),
        getPool().query("SELECT * FROM tasks WHERE user_id=$1 AND completed=FALSE AND (due_date IS NULL OR due_date<=$2) ORDER BY due_date NULLS LAST,created_at LIMIT 8",[userId,today]),
        getPool().query("SELECT * FROM calendar_events WHERE user_id=$1 AND event_date=$2 ORDER BY start_time LIMIT 12",[userId,today]),
        getPool().query("SELECT * FROM calendar_events WHERE user_id=$1 AND completed=FALSE AND (event_date>$2 OR (event_date=$2 AND start_time>=$3::time)) ORDER BY event_date,start_time LIMIT 8",[userId,today,currentTime]),
        getPool().query("SELECT id,title,subject_name,due_date,priority,status FROM homework WHERE user_id=$1 AND status NOT IN ('completed','cancelled') ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,due_date NULLS LAST LIMIT 6",[userId]),
    ]);
    const preferences={student:prefs.rows[0]?.student||false,gym:prefs.rows[0]?.gym||false,partTimeJob:prefs.rows[0]?.part_time_job||false};
    const todayPayload={},weekly={};
    if(preferences.student){todayPayload.studyMinutes=Number(study.rows[0].today);todayPayload.homeworkCompleted=Number(homework.rows[0].completed_today);todayPayload.homeworkTotal=Number(homework.rows[0].total_today);weekly.studyMinutes=Number(study.rows[0].weekly);weekly.homeworkCompleted=Number(homework.rows[0].completed_week);weekly.homeworkTotal=Number(homework.rows[0].total_week);}
    if(preferences.gym){todayPayload.gymCompleted=Number(gym.rows[0].completed_today);todayPayload.gymPlanned=Number(gym.rows[0].total_today);weekly.gymCompleted=Number(gym.rows[0].completed_week);weekly.gymPlanned=Number(gym.rows[0].total_week);weekly.gymMinutes=Number(gym.rows[0].weekly_minutes);}
    if(preferences.partTimeJob){todayPayload.jobMinutes=Number(job.rows[0].today);weekly.jobMinutes=Number(job.rows[0].weekly);}
    const allowedTypes=new Set(["general",...(preferences.student?["study","homework"]:[]),...(preferences.gym?["gym"]:[]),...(preferences.partTimeJob?["job"]:[])]);
    const [presence,partner] = await Promise.all([presenceService.getPresence(userId),partnerService.dashboardSummary(userId)]);
    return{preferences,presence,today:todayPayload,weekly,tasks:tasks.rows.map((row)=>{const item=map.camelizeRow(row);return{...item,dueDate:item.dueDate?dateKey(item.dueDate):null};}),priorities:priorities.rows.map((row)=>{const item=map.camelizeRow(row);return{...item,dueDate:item.dueDate?dateKey(item.dueDate):null};}),schedule:schedule.rows.map(map.event).filter((event)=>allowedTypes.has(event.type)),upcoming:upcoming.rows.map(map.event).filter((event)=>allowedTypes.has(event.type)),partner};
}

module.exports={dashboard};
