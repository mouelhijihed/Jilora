const crypto = require("crypto");
const { getPool, withTransaction } = require("../db/pool");
const { hashPassword, verifyPassword } = require("../utils/passwords");
const { camelizeRow, dateKeyInTimeZone, userTimeZone } = require("../utils/records");

function publicUser(row) {
    if (!row) return null;
    return {
        id: row.id,
        email: row.email,
        username: row.username,
        firstName: row.first_name,
        lastName: row.last_name,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        preferences: {
            student: row.student,
            gym: row.gym,
            partTimeJob: row.part_time_job,
        },
        onboardingCompleted: row.onboarding_completed,
        timeZone: row.time_zone || "UTC",
    };
}

async function findPublicUser(userId, client = getPool()) {
    const result = await client.query(
        `SELECT u.id, u.email, u.username, u.first_name, u.last_name, u.created_at, u.updated_at,
                p.student, p.gym, p.part_time_job, p.onboarding_completed,s.time_zone
         FROM users u JOIN user_preferences p ON p.user_id = u.id JOIN user_settings s ON s.user_id=u.id WHERE u.id = $1`,
        [userId],
    );
    return publicUser(result.rows[0]);
}

async function register(input) {
    const email = input.email.toLowerCase();
    const username = (input.username || `${email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "").slice(0, 30) || "user"}_${crypto.randomUUID().replace(/-/g, "").slice(0, 6)}`).toLowerCase();
    const passwordHash = await hashPassword(input.password);
    return withTransaction(async (client) => {
        const existing = await client.query("SELECT email, username FROM users WHERE LOWER(email) = $1 OR LOWER(username) = $2", [email, username]);
        if (existing.rows.some((row) => row.email.toLowerCase() === email)) throw Object.assign(new Error("An account with this email already exists"), { status: 409 });
        if (existing.rowCount) throw Object.assign(new Error("This username is already taken"), { status: 409 });
        const id = crypto.randomUUID();
        await client.query("INSERT INTO users(id, email, username, password_hash, first_name, last_name) VALUES ($1,$2,$3,$4,$5,$6)", [id, email, username, passwordHash, input.firstName, input.lastName]);
        await client.query("INSERT INTO user_preferences(user_id) VALUES ($1)", [id]);
        await client.query("INSERT INTO user_settings(user_id,time_zone) VALUES ($1,$2)", [id,input.timeZone||"UTC"]);
        return findPublicUser(id, client);
    });
}

async function login(emailValue, password) {
    const result = await getPool().query("SELECT * FROM users WHERE LOWER(email) = $1", [emailValue.toLowerCase()]);
    const row = result.rows[0];
    const valid = row ? await verifyPassword(password, row.password_hash) : (await hashPassword(password), false);
    if (!valid) throw Object.assign(new Error("Invalid email or password"), { status: 401 });
    return findPublicUser(row.id);
}

async function replaceWorkoutTemplate(client, userId, input) {
    const timeZone = await userTimeZone(userId,client);
    const today = dateKeyInTimeZone(timeZone);
    const oldEvents = await client.query("SELECT id,event_id FROM scheduled_workouts WHERE user_id=$1 AND template_id IS NOT NULL AND status='planned' AND workout_date >= $2 FOR UPDATE", [userId,today]);
    if (oldEvents.rowCount) {
        const workoutIds=oldEvents.rows.map((row)=>row.id);
        const eventIds=oldEvents.rows.map((row)=>row.event_id).filter(Boolean);
        await client.query("DELETE FROM workout_logs WHERE user_id=$1 AND scheduled_workout_id=ANY($2::uuid[])",[userId,workoutIds]);
        await client.query("DELETE FROM activity_sessions WHERE user_id=$1 AND workout_id=ANY($2::uuid[])",[userId,workoutIds]);
        await client.query("UPDATE scheduled_workouts SET status='cancelled',completed=FALSE,actual_minutes=0,completed_at=NULL,event_id=NULL,is_override=TRUE,updated_at=NOW() WHERE user_id=$1 AND id=ANY($2::uuid[])",[userId,workoutIds]);
        if(eventIds.length)await client.query("DELETE FROM calendar_events WHERE user_id=$1 AND id=ANY($2::uuid[])",[userId,eventIds]);
    }
    await client.query("DELETE FROM workout_templates WHERE user_id = $1", [userId]);
    if (!input) return;
    const templateId = crypto.randomUUID();
    await client.query("INSERT INTO workout_templates(id,user_id,name,recurring,starts_on) VALUES ($1,$2,$3,$4,$5)", [templateId, userId, input.name, input.recurring, input.startsOn || today]);
    for (const day of input.days) {
        const start = Number(day.startTime.slice(0, 2)) * 60 + Number(day.startTime.slice(3));
        const end = Number(day.endTime.slice(0, 2)) * 60 + Number(day.endTime.slice(3));
        if (end <= start) throw Object.assign(new Error("Workout end time must be later than start time"), { status: 400 });
        const dayId = crypto.randomUUID();
        await client.query("INSERT INTO workout_template_days(id,user_id,template_id,day_of_week,workout_name,workout_type,start_time,end_time,planned_minutes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)", [dayId, userId, templateId, day.dayOfWeek, day.workoutName, day.workoutType, day.startTime, day.endTime, end - start]);
        for (let index = 0; index < day.exercises.length; index += 1) {
            const exercise = day.exercises[index];
            await client.query("INSERT INTO workout_exercises(id,user_id,template_day_id,name,sets,reps,notes,position) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [crypto.randomUUID(), userId, dayId, exercise.name, exercise.sets, exercise.reps, exercise.notes, index]);
        }
        await client.query("INSERT INTO workout_schedule(id,user_id,template_id,template_day_id,day_of_week) VALUES ($1,$2,$3,$4,$5)", [crypto.randomUUID(), userId, templateId, dayId, day.dayOfWeek]);
    }
}

async function completeOnboarding(userId, input) {
    return withTransaction(async (client) => {
        const current = await client.query("SELECT onboarding_completed FROM user_preferences WHERE user_id=$1 FOR UPDATE",[userId]);
        if(!current.rowCount)throw Object.assign(new Error("User preferences not found"),{status:404});
        if(current.rows[0].onboarding_completed)throw Object.assign(new Error("Onboarding has already been completed"),{status:409});
        await client.query(
            `UPDATE user_preferences SET student=$2,gym=$3,part_time_job=$4,onboarding_completed=TRUE,updated_at=NOW() WHERE user_id=$1`,
            [userId, input.preferences.student, input.preferences.gym, input.preferences.partTimeJob],
        );
        await client.query("DELETE FROM subjects WHERE user_id = $1", [userId]);
        if (input.preferences.student) {
            for (const subject of input.subjects) {
                await client.query("INSERT INTO subjects(id,user_id,name,target_weekly_hours,target_monthly_hours,priority,color) VALUES ($1,$2,$3,$4,$5,$6,$7)", [crypto.randomUUID(), userId, subject.name, subject.targetWeeklyHours, subject.targetMonthlyHours, subject.priority, subject.color]);
            }
        }
        await replaceWorkoutTemplate(client, userId, input.preferences.gym ? input.workoutTemplate : null);
        await client.query("DELETE FROM part_time_jobs WHERE user_id = $1", [userId]);
        if (input.preferences.partTimeJob && input.job) {
            await client.query("INSERT INTO part_time_jobs(id,user_id,job_name,company,hourly_target) VALUES ($1,$2,$3,$4,$5)", [crypto.randomUUID(), userId, input.job.jobName, input.job.company, input.job.hourlyTarget ?? null]);
        }
        return findPublicUser(userId, client);
    });
}

async function syncTimeZone(userId,timeZone){
    if(!timeZone)return;
    await getPool().query("UPDATE user_settings SET time_zone=$2,updated_at=NOW() WHERE user_id=$1 AND time_zone<>$2",[userId,timeZone]);
}

async function updateProfile(userId, input) {
    return withTransaction(async (client) => {
        const result = await client.query("UPDATE users SET first_name=$2,last_name=$3,updated_at=NOW() WHERE id=$1 RETURNING id", [userId, input.firstName, input.lastName]);
        if (!result.rowCount) throw Object.assign(new Error("User not found"), { status: 404 });
        await client.query("UPDATE user_preferences SET student=$2,gym=$3,part_time_job=$4,updated_at=NOW() WHERE user_id=$1", [userId, input.preferences.student, input.preferences.gym, input.preferences.partTimeJob]);
        return findPublicUser(userId, client);
    });
}

module.exports = { register, login, findPublicUser, completeOnboarding, updateProfile, replaceWorkoutTemplate, syncTimeZone };
