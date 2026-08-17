const { getPool } = require("../db/pool");
const { dateKey, startOfWeek, addDays } = require("../utils/records");

async function analytics(userId,startValue,endValue){
    const start=startValue||startOfWeek(),end=endValue||dateKey();
    const [prefs,studySessions,activity,workouts,workSessions,homework,subjects]=await Promise.all([
        getPool().query("SELECT student,gym,part_time_job FROM user_preferences WHERE user_id=$1",[userId]),
        getPool().query("SELECT * FROM study_sessions WHERE user_id=$1 AND session_date BETWEEN $2 AND $3",[userId,start,end]),
        getPool().query("SELECT * FROM activity_sessions WHERE user_id=$1 AND status='completed' AND completed_at::date BETWEEN $2 AND $3",[userId,start,end]),
        getPool().query("SELECT * FROM scheduled_workouts WHERE user_id=$1 AND workout_date BETWEEN $2 AND $3 AND status<>'cancelled'",[userId,start,end]),
        getPool().query("SELECT * FROM work_sessions WHERE user_id=$1 AND work_date BETWEEN $2 AND $3",[userId,start,end]),
        getPool().query("SELECT * FROM homework WHERE user_id=$1 AND due_date BETWEEN $2 AND $3 AND status<>'cancelled'",[userId,start,end]),
        getPool().query("SELECT id,name FROM subjects WHERE user_id=$1",[userId]),
    ]);
    const preferences={student:prefs.rows[0]?.student||false,gym:prefs.rows[0]?.gym||false,partTimeJob:prefs.rows[0]?.part_time_job||false};
    const studyFocus=activity.rows.filter((row)=>row.activity==="study"&&row.session_type==="focus"),jobActivity=activity.rows.filter((row)=>row.activity==="job"),gymActivity=activity.rows.filter((row)=>row.activity==="gym"&&!row.workout_id);
    const studyMinutes=studySessions.rows.reduce((s,r)=>s+r.actual_minutes,0)+studyFocus.reduce((s,r)=>s+Math.round(r.actual_duration/60),0);
    const jobMinutes=workSessions.rows.reduce((s,r)=>s+r.actual_minutes,0)+jobActivity.reduce((s,r)=>s+Math.round(r.actual_duration/60),0);
    const completedWorkouts=workouts.rows.filter((row)=>row.completed);
    const bySubject=subjects.rows.map((subject)=>({subject:subject.name,minutes:studySessions.rows.filter((r)=>r.subject_id===subject.id).reduce((s,r)=>s+r.actual_minutes,0)+studyFocus.filter((r)=>r.subject_id===subject.id).reduce((s,r)=>s+Math.round(r.actual_duration/60),0)})).filter((row)=>row.minutes>0).sort((a,b)=>b.minutes-a.minutes);
    const timestampDate=(value)=>dateKey(value instanceof Date?value:new Date(value));
    const daily=[];for(let day=start;day<=end;day=addDays(day,1)){daily.push({date:day,studyMinutes:studySessions.rows.filter((r)=>String(r.session_date)===day).reduce((s,r)=>s+r.actual_minutes,0)+studyFocus.filter((r)=>timestampDate(r.completed_at)===day).reduce((s,r)=>s+Math.round(r.actual_duration/60),0),jobMinutes:workSessions.rows.filter((r)=>String(r.work_date)===day).reduce((s,r)=>s+r.actual_minutes,0)+jobActivity.filter((r)=>timestampDate(r.completed_at)===day).reduce((s,r)=>s+Math.round(r.actual_duration/60),0),gymMinutes:completedWorkouts.filter((r)=>String(r.workout_date)===day).reduce((s,r)=>s+r.actual_minutes,0)+gymActivity.filter((r)=>timestampDate(r.completed_at)===day).reduce((s,r)=>s+Math.round(r.actual_duration/60),0)});}
    return{start,end,preferences,study:preferences.student?{minutes:studyMinutes,completedPomodoros:studyFocus.length,averagePomodoroMinutes:studyFocus.length?Math.round(studyFocus.reduce((s,r)=>s+r.actual_duration,0)/studyFocus.length/60):0,bySubject,homeworkCompleted:homework.rows.filter((r)=>r.status==="completed").length,homeworkTotal:homework.rows.length}:null,gym:preferences.gym?{planned:workouts.rows.length,completed:completedWorkouts.length,missed:workouts.rows.filter((r)=>!r.completed&&String(r.workout_date)<dateKey()).length,actualMinutes:completedWorkouts.reduce((s,r)=>s+r.actual_minutes,0),completionRate:workouts.rows.length?Math.round(completedWorkouts.length/workouts.rows.length*1000)/10:0}:null,job:preferences.partTimeJob?{minutes:jobMinutes,sessions:workSessions.rows.length+jobActivity.length}:null,daily};
}

module.exports={analytics};
