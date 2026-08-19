const { getPool } = require("../db/pool");
const { fail } = require("../utils/domain");
const { dateKeyInTimeZone, userTimeZone, startOfWeek, addDays } = require("../utils/records");

function minutesFromSeconds(value) {
    return Math.round(Number(value || 0) / 60);
}

function dateValue(value) {
    return String(value).slice(0, 10);
}

function addToMap(map, key, value) {
    map.set(key, (map.get(key) || 0) + Number(value || 0));
}

function rangeRate(completed, planned) {
    return planned ? Math.round((completed / planned) * 1000) / 10 : 0;
}

async function analytics(userId, startValue, endValue) {
    const pool = getPool();
    const timeZone = await userTimeZone(userId, pool);
    const today = dateKeyInTimeZone(timeZone);
    const start = startValue || startOfWeek(today);
    const end = endValue || today;
    if (start > end) fail("Start date must be on or before end date", 400);

    const [prefs, studySessions, activitySessions, workouts, workSessions, homework, subjects, plannerEvents] = await Promise.all([
        pool.query("SELECT student,gym,part_time_job FROM user_preferences WHERE user_id=$1", [userId]),
        pool.query(`SELECT ss.id,ss.user_id,ss.event_id,ss.subject_id,ss.session_date::text AS session_date,
                ss.start_time,ss.end_time,ss.planned_minutes,ss.actual_minutes,ss.completed,ss.completed_at,ss.notes
            FROM study_sessions ss
            JOIN subjects s ON s.id=ss.subject_id AND s.user_id=ss.user_id
            WHERE ss.user_id=$1 AND ss.session_date BETWEEN $2 AND $3`, [userId, start, end]),
        pool.query(`SELECT a.*
            FROM activity_sessions a
            WHERE a.user_id=$1 AND a.status='completed' AND a.completed_at IS NOT NULL
              AND (a.completed_at AT TIME ZONE $4)::date BETWEEN $2 AND $3`, [userId, start, end, timeZone]),
        pool.query(`SELECT id,user_id,event_id,workout_date::text AS workout_date,start_time,end_time,
                workout_type,planned_minutes,actual_minutes,completed,status,completed_at,notes
            FROM scheduled_workouts
            WHERE user_id=$1 AND workout_date BETWEEN $2 AND $3 AND status<>'cancelled'`, [userId, start, end]),
        pool.query(`SELECT ws.id,ws.user_id,ws.job_id,ws.event_id,ws.work_date::text AS work_date,
                ws.start_time,ws.end_time,ws.planned_minutes,ws.actual_minutes,ws.completed,ws.completed_at,
                ws.notes,ws.tasks_completed
            FROM work_sessions ws
            JOIN part_time_jobs j ON j.id=ws.job_id AND j.user_id=ws.user_id
            WHERE ws.user_id=$1 AND ws.work_date BETWEEN $2 AND $3`, [userId, start, end]),
        pool.query(`SELECT id,user_id,event_id,subject_id,subject_name,title,description,due_date::text AS due_date,
                due_time,priority,estimated_minutes,status,completed_date::text AS completed_date,completed_at
            FROM homework
            WHERE user_id=$1 AND due_date BETWEEN $2 AND $3 AND status<>'cancelled'`, [userId, start, end]),
        pool.query(`SELECT id,name,target_weekly_hours,target_monthly_hours
            FROM subjects WHERE user_id=$1 ORDER BY name`, [userId]),
        pool.query(`SELECT event_date,completed
            FROM calendar_events WHERE user_id=$1 AND event_date BETWEEN $2 AND $3`, [userId, start, end]),
    ]);

    const preferences = {
        student: Boolean(prefs.rows[0]?.student),
        gym: Boolean(prefs.rows[0]?.gym),
        partTimeJob: Boolean(prefs.rows[0]?.part_time_job),
    };

    const completedStudySessions = studySessions.rows.filter((row) => row.completed);
    const completedWorkSessions = workSessions.rows.filter((row) => row.completed);
    const ownedSubjectIds = new Set(subjects.rows.map((subject) => subject.id));
    const studyFocus = activitySessions.rows.filter((row) => row.activity === "study" && row.session_type === "focus" && ownedSubjectIds.has(row.subject_id));
    const jobActivity = activitySessions.rows.filter((row) => row.activity === "job");
    const gymActivity = activitySessions.rows.filter((row) => row.activity === "gym" && !row.workout_id);
    const completedWorkouts = workouts.rows.filter((row) => row.completed && row.status !== "cancelled");

    const subjectMinutes = new Map();
    for (const row of completedStudySessions) addToMap(subjectMinutes, row.subject_id, row.actual_minutes);
    for (const row of studyFocus) addToMap(subjectMinutes, row.subject_id, minutesFromSeconds(row.actual_duration));

    const bySubject = subjects.rows.map((subject) => ({
        subject: subject.name,
        minutes: subjectMinutes.get(subject.id) || 0,
    })).filter((row) => row.minutes > 0).sort((a, b) => b.minutes - a.minutes);

    const goals = subjects.rows.map((subject) => {
        const actualMinutes = subjectMinutes.get(subject.id) || 0;
        const targetWeeklyMinutes = Math.round(Number(subject.target_weekly_hours || 0) * 60);
        const targetMonthlyMinutes = Math.round(Number(subject.target_monthly_hours || 0) * 60);
        return {
            subject: subject.name,
            actualMinutes,
            targetWeeklyMinutes,
            targetMonthlyMinutes,
            weeklyProgressPercent: rangeRate(actualMinutes, targetWeeklyMinutes),
            monthlyProgressPercent: rangeRate(actualMinutes, targetMonthlyMinutes),
        };
    });

    const dailyStudy = new Map();
    const dailyJob = new Map();
    const dailyGym = new Map();
    for (const row of completedStudySessions) addToMap(dailyStudy, dateValue(row.session_date), row.actual_minutes);
    for (const row of studyFocus) addToMap(dailyStudy, dateKeyInTimeZone(timeZone, new Date(row.completed_at)), minutesFromSeconds(row.actual_duration));
    for (const row of completedWorkSessions) addToMap(dailyJob, dateValue(row.work_date), row.actual_minutes);
    for (const row of jobActivity) addToMap(dailyJob, dateKeyInTimeZone(timeZone, new Date(row.completed_at)), minutesFromSeconds(row.actual_duration));
    for (const row of completedWorkouts) addToMap(dailyGym, dateValue(row.workout_date), row.actual_minutes);
    for (const row of gymActivity) addToMap(dailyGym, dateKeyInTimeZone(timeZone, new Date(row.completed_at)), minutesFromSeconds(row.actual_duration));

    const daily = [];
    for (let day = start; day <= end; day = addDays(day, 1)) {
        daily.push({
            date: day,
            studyMinutes: dailyStudy.get(day) || 0,
            jobMinutes: dailyJob.get(day) || 0,
            gymMinutes: dailyGym.get(day) || 0,
        });
    }

    const homeworkCompleted = homework.rows.filter((row) => row.status === "completed").length;
    const plannedWorkoutMinutes = workouts.rows.reduce((sum, row) => sum + Number(row.planned_minutes || 0), 0);
    const plannerCompleted = plannerEvents.rows.filter((row) => row.completed).length;
    const plannedJobMinutes = workSessions.rows.reduce((sum, row) => sum + Number(row.planned_minutes || 0), 0);

    return {
        start,
        end,
        preferences,
        planner: {
            planned: plannerEvents.rows.length,
            completed: plannerCompleted,
            completionRate: rangeRate(plannerCompleted, plannerEvents.rows.length),
        },
        study: preferences.student ? {
            minutes: completedStudySessions.reduce((sum, row) => sum + Number(row.actual_minutes || 0), 0) + studyFocus.reduce((sum, row) => sum + minutesFromSeconds(row.actual_duration), 0),
            plannedMinutes: studySessions.rows.reduce((sum, row) => sum + Number(row.planned_minutes || 0), 0),
            completedPomodoros: studyFocus.length,
            averagePomodoroMinutes: studyFocus.length ? Math.round(studyFocus.reduce((sum, row) => sum + Number(row.actual_duration || 0), 0) / studyFocus.length / 60) : 0,
            bySubject,
            goals,
            homeworkCompleted,
            homeworkTotal: homework.rows.length,
        } : null,
        gym: preferences.gym ? {
            planned: workouts.rows.length,
            completed: completedWorkouts.length,
            missed: workouts.rows.filter((row) => !row.completed && row.workout_date < today).length,
            plannedMinutes: plannedWorkoutMinutes,
            actualMinutes: completedWorkouts.reduce((sum, row) => sum + Number(row.actual_minutes || 0), 0) + gymActivity.reduce((sum, row) => sum + minutesFromSeconds(row.actual_duration), 0),
            completionRate: rangeRate(completedWorkouts.length, workouts.rows.length),
        } : null,
        job: preferences.partTimeJob ? {
            minutes: completedWorkSessions.reduce((sum, row) => sum + Number(row.actual_minutes || 0), 0) + jobActivity.reduce((sum, row) => sum + minutesFromSeconds(row.actual_duration), 0),
            sessions: completedWorkSessions.length + jobActivity.length,
            plannedSessions: workSessions.rows.length,
            completedSessions: completedWorkSessions.length + jobActivity.length,
            plannedMinutes: plannedJobMinutes,
        } : null,
        daily,
    };
}

module.exports = { analytics };
