require("dotenv").config();
const fs=require("fs/promises");
const path=require("path");
const {getPool,closePool}=require("./pool");
const productivity=require("../services/productivityService");
const workouts=require("../services/workoutService");
const sessions=require("../services/sessionService");
const planner=require("../services/plannerService");

async function read(name,fallback=[]){try{return JSON.parse(await fs.readFile(path.join(__dirname,"..","..","data",name),"utf8"));}catch{return fallback;}}

async function importLegacy(){
    const email=String(process.env.LEGACY_USER_EMAIL||"").trim().toLowerCase();
    if(!email)throw new Error("Set LEGACY_USER_EMAIL to the account that should own the imported records");
    const user=(await getPool().query("SELECT id FROM users WHERE LOWER(email)=$1",[email])).rows[0];
    if(!user)throw new Error("LEGACY_USER_EMAIL must reference an existing registered account");
    const existing=await getPool().query(`SELECT
      (SELECT COUNT(*) FROM subjects WHERE user_id=$1)+(SELECT COUNT(*) FROM homework WHERE user_id=$1)+(SELECT COUNT(*) FROM scheduled_workouts WHERE user_id=$1)+(SELECT COUNT(*) FROM activity_sessions WHERE user_id=$1)+(SELECT COUNT(*) FROM work_sessions WHERE user_id=$1) count`,[user.id]);
    if(Number(existing.rows[0].count)>0)throw new Error("The target account already has productivity data; import into an empty account to avoid duplicates");
    const [legacySubjects,legacyStudy,legacyHomework,legacyTemplates,legacyWorkouts,legacyLogs,legacyWork,legacySessions,legacyTasks,legacyEvents]=await Promise.all([
        read("study-subjects.json"),read("study-sessions.json"),read("homework-tasks.json"),read("workout-templates.json"),read("workouts.json"),read("workout-logs.json"),read("internship-days.json"),read("sessions.json"),read("tasks.json"),read("events.json"),
    ]);
    const subjectIds=new Map();
    for(const item of legacySubjects){const created=await productivity.createSubject(user.id,{name:item.name,targetWeeklyHours:Number(item.targetWeeklyHours||0),targetMonthlyHours:Number(item.targetMonthlyHours||0),priority:item.priority||"medium",color:item.color||"#72c59b"});subjectIds.set(item.id,created.id);}
    for(const item of legacyStudy){const subjectId=subjectIds.get(item.subjectId);if(subjectId)await productivity.createStudySession(user.id,{subjectId,date:item.date,startTime:item.startTime,endTime:item.endTime,actualMinutes:Number(item.actualMinutes||0),completed:Boolean(item.completed),notes:item.notes||""});}
    for(const item of legacyHomework)await productivity.createHomework(user.id,{title:item.title,subject:item.subject||"",description:item.description||"",dueDate:item.dueDate,dueTime:item.dueTime||"23:59",priority:item.priority||"medium",estimatedMinutes:Number(item.estimatedMinutes||60),status:item.status||"todo",completedDate:item.completedDate||null});
    if(legacyTemplates[0])await workouts.createTemplate(user.id,{...legacyTemplates[0],startsOn:legacyTemplates[0].startsOn||new Date().toISOString().slice(0,10),days:legacyTemplates[0].days||[]});
    const workoutIds=new Map();
    for(const item of legacyWorkouts){const created=await workouts.createWorkout(user.id,{name:item.name,workoutType:item.workoutType||"Full Body",date:item.date,startTime:item.startTime,endTime:item.endTime,completed:false,notes:item.notes||""});workoutIds.set(item.id,created.id);const log=legacyLogs.find((entry)=>entry.scheduledWorkoutId===item.id);if(item.completed||log)await workouts.completeWorkout(user.id,created.id,{durationMinutes:Number(item.actualMinutes||Math.round((log?.duration||item.plannedMinutes*60)/60)||1),startedAt:log?.startedAt,exercises:log?.exercises||[],notes:log?.notes||item.notes||""});}
    if(legacyWork.length){const first=legacyWork[0];await productivity.upsertJob(user.id,{jobName:first.internshipName||"Imported job",company:process.env.LEGACY_JOB_COMPANY||"Imported company",hourlyTarget:null});for(const item of legacyWork)await productivity.createWorkSession(user.id,{date:item.date,startTime:item.startTime,endTime:item.endTime,actualMinutes:Number(item.actualMinutes||0),completed:Boolean(item.completed),notes:item.notes||"",tasksCompleted:item.tasksCompleted||[]});}
    for(const item of legacySessions){if(item.workoutId)continue;await sessions.createSession(user.id,{activity:item.activity==="internship"?"job":item.activity,subjectId:subjectIds.get(item.subjectId),subject:item.subject||"",topic:item.topic||"",plannedDuration:Number(item.plannedDuration||item.duration*60||60),actualDuration:Number(item.actualDuration||item.duration*60||0),status:item.status||"completed",sessionType:item.sessionType||"activity",pomodoroNumber:Number(item.pomodoroNumber||0),startedAt:item.startedAt||item.createdAt,activeStartedAt:item.activeStartedAt||undefined,completedAt:item.completedAt||undefined});}
    for(const item of legacyTasks)await productivity.createTask(user.id,{title:item.title,category:item.category==="Internship"?"Part-Time Job":item.category,completed:Boolean(item.completed),dueDate:item.dueDate||null});
    for(const item of legacyEvents.filter((event)=>!event.metadata?.entityType))await planner.createEvent(user.id,{title:item.title,type:item.type==="internship"?"job":item.type,date:item.date,startTime:item.startTime,endTime:item.endTime,completed:Boolean(item.completed),notes:item.notes||"",metadata:{}});
    await getPool().query("UPDATE user_preferences SET student=$2,gym=$3,part_time_job=$4,onboarding_completed=TRUE,updated_at=NOW() WHERE user_id=$1",[user.id,legacySubjects.length+legacyStudy.length+legacyHomework.length>0,legacyTemplates.length+legacyWorkouts.length>0,legacyWork.length>0]);
    console.log(`Imported legacy records for ${email}`);
}

if(require.main===module)importLegacy().then(closePool).catch((error)=>{console.error(error.message);process.exitCode=1;});
module.exports={importLegacy};
