const crypto = require("crypto");
const { getPool, withTransaction } = require("../db/pool");
const { schedule, fail } = require("../utils/domain");
const { dateKey, dateKeyInTimeZone, userTimeZone, addDays, startOfWeek } = require("../utils/records");
const map = require("./mappers");
const planner = require("./plannerService");
const { replaceWorkoutTemplate } = require("./authService");
const partner = require("./partnerService");

async function getTemplates(userId) {
    const result = await getPool().query(
        `SELECT t.*, d.id day_id,d.day_of_week,d.workout_name,d.workout_type,d.start_time,d.end_time,d.planned_minutes,
                e.id exercise_id,e.name exercise_name,e.sets,e.reps,e.notes exercise_notes,e.position
         FROM workout_templates t
         LEFT JOIN workout_template_days d ON d.template_id=t.id AND d.user_id=t.user_id
         LEFT JOIN workout_exercises e ON e.template_day_id=d.id AND e.user_id=t.user_id
         WHERE t.user_id=$1 ORDER BY d.day_of_week,e.position`, [userId],
    );
    const templates = new Map();
    for (const row of result.rows) {
        if (!templates.has(row.id)) templates.set(row.id,{id:row.id,name:row.name,recurring:row.recurring,startsOn:row.starts_on,createdAt:row.created_at,updatedAt:row.updated_at,days:[]});
        const template=templates.get(row.id);
        if (row.day_id && !template.days.some((day)=>day.id===row.day_id)) template.days.push({id:row.day_id,dayOfWeek:row.day_of_week,workoutName:row.workout_name,workoutType:row.workout_type,startTime:String(row.start_time).slice(0,5),endTime:String(row.end_time).slice(0,5),plannedMinutes:row.planned_minutes,exercises:[]});
        if(row.exercise_id) template.days.find((day)=>day.id===row.day_id).exercises.push({id:row.exercise_id,name:row.exercise_name,sets:row.sets,reps:row.reps,notes:row.exercise_notes});
    }
    return [...templates.values()];
}

async function createTemplate(userId,input){await withTransaction(async(client)=>{const existing=await client.query("SELECT 1 FROM workout_templates WHERE user_id=$1",[userId]);if(existing.rowCount)fail("Only one weekly workout template is supported",409);await replaceWorkoutTemplate(client,userId,input);});return (await getTemplates(userId))[0];}
async function updateTemplate(userId,id,input){await withTransaction(async(client)=>{const existing=await client.query("SELECT 1 FROM workout_templates WHERE id=$1 AND user_id=$2",[id,userId]);if(!existing.rowCount)fail("Workout template not found",404);await replaceWorkoutTemplate(client,userId,input);});return (await getTemplates(userId))[0];}
async function deleteTemplate(userId,id){return withTransaction(async(client)=>{const existing=await client.query("SELECT 1 FROM workout_templates WHERE id=$1 AND user_id=$2",[id,userId]);if(!existing.rowCount)fail("Workout template not found",404);await replaceWorkoutTemplate(client,userId,null);});}

function rangeDefaults(today){const start=startOfWeek(today);return{start,end:addDays(start,20)};}
function isoDay(value){const day=new Date(`${value}T12:00:00`).getDay();return day||7;}

async function materializeSchedule(userId,startValue,endValue){
    const timeZone=await userTimeZone(userId,getPool()),today=dateKeyInTimeZone(timeZone),defaults=rangeDefaults(today),start=startValue||defaults.start,end=endValue||defaults.end;
    if(start>end)fail("Schedule start must be before schedule end");
    const days=Math.round((new Date(`${end}T12:00:00`)-new Date(`${start}T12:00:00`))/86400000);
    if(days>366)fail("Schedule ranges cannot exceed 366 days");
    if(end>addDays(today,366))fail("Workout schedules can only be generated one year ahead");
    await withTransaction(async(client)=>{
        await client.query("SELECT id FROM workout_templates WHERE user_id=$1 FOR UPDATE",[userId]);
        const rows=(await client.query(
            `SELECT t.id template_id,t.starts_on,t.recurring,d.*,s.id schedule_id,
                    COALESCE(jsonb_agg(jsonb_build_object('id',e.id,'name',e.name,'sets',e.sets,'reps',e.reps,'notes',e.notes) ORDER BY e.position) FILTER (WHERE e.id IS NOT NULL),'[]') exercises
             FROM workout_templates t JOIN workout_template_days d ON d.template_id=t.id AND d.user_id=t.user_id
             JOIN workout_schedule s ON s.template_day_id=d.id AND s.user_id=t.user_id AND s.active=TRUE
             LEFT JOIN workout_exercises e ON e.template_day_id=d.id AND e.user_id=t.user_id
             WHERE t.user_id=$1 AND t.recurring=TRUE GROUP BY t.id,t.starts_on,t.recurring,d.id,s.id`,[userId])).rows;
        for(let current=start<today?today:start;current<=end;current=addDays(current,1)){
            for(const row of rows.filter((item)=>item.day_of_week===isoDay(current)&&current>=dateKey(item.starts_on))){
                const existing=await client.query("SELECT * FROM scheduled_workouts WHERE user_id=$1 AND template_id=$2 AND occurrence_date=$3 FOR UPDATE",[userId,row.template_id,current]);
                if(!existing.rowCount){
                    const id=crypto.randomUUID(),eventId=crypto.randomUUID();
                    await planner.insertEvent(client,userId,{title:row.workout_name,type:"gym",date:current,startTime:String(row.start_time).slice(0,5),endTime:String(row.end_time).slice(0,5),completed:false,notes:"",metadata:{}},eventId,{entityType:"workout",entityId:id,templateId:row.template_id,scheduleId:row.schedule_id,workoutType:row.workout_type,occurrenceDate:current,isOverride:false,recurring:true});
                    await client.query(`INSERT INTO scheduled_workouts(id,user_id,event_id,template_id,schedule_id,source,name,workout_type,workout_date,occurrence_date,start_time,end_time,planned_minutes,exercises)
                        VALUES($1,$2,$3,$4,$5,'recurring',$6,$7,$8,$8,$9,$10,$11,$12)`,[id,userId,eventId,row.template_id,row.schedule_id,row.workout_name,row.workout_type,current,row.start_time,row.end_time,row.planned_minutes,JSON.stringify(row.exercises)]);
                }else if(existing.rows[0].status==="planned"&&!existing.rows[0].is_override){
                    const workout=existing.rows[0];
                    await client.query("UPDATE scheduled_workouts SET schedule_id=$3,name=$4,workout_type=$5,workout_date=occurrence_date,start_time=$6,end_time=$7,planned_minutes=$8,exercises=$9,updated_at=NOW() WHERE id=$1 AND user_id=$2",[workout.id,userId,row.schedule_id,row.workout_name,row.workout_type,row.start_time,row.end_time,row.planned_minutes,JSON.stringify(row.exercises)]);
                    await client.query("UPDATE calendar_events SET title=$3,event_date=$4,start_time=$5,end_time=$6,duration_minutes=$7,metadata=$8,updated_at=NOW() WHERE id=$1 AND user_id=$2",[workout.event_id,userId,row.workout_name,current,row.start_time,row.end_time,row.planned_minutes,{entityType:"workout",entityId:workout.id,templateId:row.template_id,scheduleId:row.schedule_id,workoutType:row.workout_type,occurrenceDate:current,isOverride:false,recurring:true}]);
                }
            }
        }
    });
    return listWorkouts(userId,start,end);
}

async function listWorkouts(userId,start,end){const values=[userId],filters=["user_id=$1","status<>'cancelled'"];if(start){values.push(start);filters.push(`workout_date >= $${values.length}`);}if(end){values.push(end);filters.push(`workout_date <= $${values.length}`);}return (await getPool().query(`SELECT * FROM scheduled_workouts WHERE ${filters.join(" AND ")} ORDER BY workout_date,start_time`,values)).rows.map(map.workout);}
async function listLogs(userId){return (await getPool().query("SELECT * FROM workout_logs WHERE user_id=$1 ORDER BY completed_at DESC",[userId])).rows.map(map.workoutLog);}

async function createWorkout(userId,input){if(input.completed)fail("Create the workout first, then complete it with a workout log",409);return withTransaction(async(client)=>{const planned=schedule(input,"Workout"),id=crypto.randomUUID(),eventId=crypto.randomUUID();await planner.insertEvent(client,userId,{title:input.name,type:"gym",...input,metadata:{}},eventId,{entityType:"workout",entityId:id,workoutType:input.workoutType});const result=await client.query("INSERT INTO scheduled_workouts(id,user_id,event_id,source,name,workout_type,workout_date,start_time,end_time,planned_minutes,notes) VALUES($1,$2,$3,'manual',$4,$5,$6,$7,$8,$9,$10) RETURNING *",[id,userId,eventId,input.name,input.workoutType,planned.date,planned.startTime,planned.endTime,planned.plannedMinutes,input.notes]);return map.workout(result.rows[0]);});}
async function updateWorkout(userId,id,input){return withTransaction(async(client)=>{const current=await client.query("SELECT * FROM scheduled_workouts WHERE id=$1 AND user_id=$2 FOR UPDATE",[id,userId]);if(!current.rowCount)fail("Workout not found",404);const workout=current.rows[0];if(Boolean(workout.completed)!==Boolean(input.completed))fail(workout.completed?"Reopen completed workouts through the reopen action":"Complete workouts through the workout log so actual time is recorded",409);const planned=schedule(input,"Workout");const result=await client.query("UPDATE scheduled_workouts SET name=$3,workout_type=$4,workout_date=$5,start_time=$6,end_time=$7,planned_minutes=$8,notes=$9,is_override=CASE WHEN source='recurring' THEN TRUE ELSE is_override END,updated_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING *",[id,userId,input.name,input.workoutType,planned.date,planned.startTime,planned.endTime,planned.plannedMinutes,input.notes]);const metadata={entityType:"workout",entityId:id,workoutType:input.workoutType,...(workout.source==="recurring"?{templateId:workout.template_id,scheduleId:workout.schedule_id,occurrenceDate:dateKey(workout.occurrence_date),isOverride:true,recurring:true}:{})};await client.query("UPDATE calendar_events SET title=$3,event_date=$4,start_time=$5,end_time=$6,duration_minutes=$7,notes=$8,metadata=$9,updated_at=NOW() WHERE id=$1 AND user_id=$2",[workout.event_id,userId,input.name,planned.date,planned.startTime,planned.endTime,planned.plannedMinutes,input.notes,metadata]);return map.workout(result.rows[0]);});}
async function deleteWorkout(userId,id){return withTransaction(async(client)=>{const current=await client.query("SELECT * FROM scheduled_workouts WHERE id=$1 AND user_id=$2 FOR UPDATE",[id,userId]);if(!current.rowCount)fail("Workout not found",404);const workout=current.rows[0];if(workout.source==="recurring"){await client.query("DELETE FROM workout_logs WHERE scheduled_workout_id=$1 AND user_id=$2",[id,userId]);await client.query("DELETE FROM activity_sessions WHERE workout_id=$1 AND user_id=$2",[id,userId]);await client.query("UPDATE scheduled_workouts SET status='cancelled',completed=FALSE,actual_minutes=0,completed_at=NULL,event_id=NULL,is_override=TRUE,updated_at=NOW() WHERE id=$1 AND user_id=$2",[id,userId]);if(workout.event_id)await client.query("DELETE FROM calendar_events WHERE id=$1 AND user_id=$2",[workout.event_id,userId]);}else{await client.query("DELETE FROM scheduled_workouts WHERE id=$1 AND user_id=$2",[id,userId]);await client.query("DELETE FROM calendar_events WHERE id=$1 AND user_id=$2",[workout.event_id,userId]);}});}

async function completeWorkout(userId,id,input){return withTransaction(async(client)=>{const current=await client.query("SELECT * FROM scheduled_workouts WHERE id=$1 AND user_id=$2 FOR UPDATE",[id,userId]);if(!current.rowCount)fail("Workout not found",404);const workout=current.rows[0];if(workout.status==="cancelled")fail("Cancelled workouts cannot be completed",409);if(workout.completed)fail("Workout is already completed",409);const completedAt=new Date();const startedAt=input.startedAt?new Date(input.startedAt):new Date(completedAt.getTime()-input.durationMinutes*60000);if(startedAt>completedAt)fail("startedAt cannot be after completion");if(input.durationMinutes*60000>completedAt-startedAt+5000)fail("Workout duration cannot exceed elapsed time");const logResult=await client.query("INSERT INTO workout_logs(id,user_id,scheduled_workout_id,started_at,completed_at,duration_seconds,exercises,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",[crypto.randomUUID(),userId,id,startedAt,completedAt,input.durationMinutes*60,JSON.stringify(input.exercises),input.notes]);const workoutResult=await client.query("UPDATE scheduled_workouts SET completed=TRUE,status='completed',actual_minutes=$3,completed_at=$4,notes=$5,updated_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING *",[id,userId,input.durationMinutes,completedAt,input.notes]);await client.query("UPDATE calendar_events SET completed=TRUE,notes=$3,updated_at=NOW() WHERE id=$1 AND user_id=$2",[workout.event_id,userId,input.notes]);await client.query("INSERT INTO activity_sessions(id,user_id,activity,topic,planned_duration,actual_duration,status,session_type,started_at,completed_at,workout_id) VALUES($1,$2,'gym',$3,$4,$5,'completed','activity',$6,$7,$8)",[crypto.randomUUID(),userId,workout.name,workout.planned_minutes*60,input.durationMinutes*60,startedAt,completedAt,id]);await partner.recordSharedActivity(userId,"workout_completed","Completed a workout.",client);return{workout:map.workout(workoutResult.rows[0]),log:map.workoutLog(logResult.rows[0])};});}
async function reopenWorkout(userId,id){return withTransaction(async(client)=>{const current=await client.query("SELECT * FROM scheduled_workouts WHERE id=$1 AND user_id=$2 FOR UPDATE",[id,userId]);if(!current.rowCount)fail("Workout not found",404);if(!current.rows[0].completed)return map.workout(current.rows[0]);const result=await client.query("UPDATE scheduled_workouts SET completed=FALSE,status='planned',actual_minutes=0,completed_at=NULL,updated_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING *",[id,userId]);await client.query("DELETE FROM workout_logs WHERE scheduled_workout_id=$1 AND user_id=$2",[id,userId]);await client.query("DELETE FROM activity_sessions WHERE workout_id=$1 AND user_id=$2",[id,userId]);await client.query("UPDATE calendar_events SET completed=FALSE,updated_at=NOW() WHERE id=$1 AND user_id=$2",[current.rows[0].event_id,userId]);return map.workout(result.rows[0]);});}

async function analytics(userId,startValue,endValue){const timeZone=await userTimeZone(userId,getPool()),today=dateKeyInTimeZone(timeZone),end=endValue||today,start=startValue||end;const rows=(await getPool().query("SELECT * FROM scheduled_workouts WHERE user_id=$1 AND workout_date BETWEEN $2 AND $3 AND status<>'cancelled'",[userId,start,end])).rows;const completed=rows.filter((row)=>row.completed);return{range:{planned:rows.length,completed:completed.length,missed:rows.filter((row)=>!row.completed&&String(row.workout_date)<today).length,completionRate:rows.length?Math.round(completed.length/rows.length*1000)/10:0,plannedMinutes:rows.reduce((sum,row)=>sum+row.planned_minutes,0),actualMinutes:completed.reduce((sum,row)=>sum+row.actual_minutes,0),totalWorkoutTimeMinutes:completed.reduce((sum,row)=>sum+row.actual_minutes,0)}};}

module.exports={getTemplates,createTemplate,updateTemplate,deleteTemplate,materializeSchedule,listWorkouts,listLogs,createWorkout,updateWorkout,deleteWorkout,completeWorkout,reopenWorkout,analytics};
