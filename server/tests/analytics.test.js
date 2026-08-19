const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
require("./requireTestDatabase");

if (!process.env.TEST_DATABASE_URL) {
    test("analytics aggregation", { skip: "TEST_DATABASE_URL is not configured" }, () => {});
} else test("analytics uses unified, completed, user-owned activity data", async (context) => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
    process.env.CLIENT_ORIGIN = "http://localhost";
    process.env.SESSION_COOKIE_SECURE = "false";
    process.env.SESSION_COOKIE_SAME_SITE = "lax";

    const { migrate } = require("../db/migrate");
    await migrate();
    const { getPool, closePool } = require("../db/pool");
    await getPool().query("TRUNCATE users CASCADE");
    const app = require("../../app");
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    context.after(async () => { await new Promise((resolve) => server.close(resolve)); await closePool(); });

    async function client() {
        let cookie = "";
        return async (path, options = {}) => {
            const response = await fetch(base + path, { ...options, headers: { "content-type": "application/json", cookie, ...options.headers } });
            const setCookie = response.headers.get("set-cookie");
            if (setCookie) cookie = setCookie.split(";")[0];
            const body = response.status === 204 ? null : await response.json();
            return { status: response.status, body };
        };
    }

    const a = await client();
    const b = await client();
    const password = "Correct-Horse-2026";
    const { dateKey, addDays } = require("../utils/records");
    const today = dateKey();
    const tomorrow = addDays(today, 1);

    assert.equal((await a("/api/auth/register", { method: "POST", body: JSON.stringify({ firstName: "Analytics", lastName: "A", email: "analytics-a@example.com", password, confirmPassword: password }) })).status, 201);
    assert.equal((await a("/api/auth/onboarding", { method: "POST", body: JSON.stringify({ preferences: { student: true, gym: true, partTimeJob: true }, subjects: [{ name: "Algorithms", targetWeeklyHours: 2, targetMonthlyHours: 8, priority: "high", color: "#72c59b" }], workoutTemplate: null, job: { jobName: "Assistant", company: "Example", hourlyTarget: 20 } }) })).status, 200);
    const product = await a("/api/productivity");
    const subjectId = product.body.subjects[0].id;

    const plannerStudy = await a("/api/events", { method: "POST", body: JSON.stringify({ title: "Planner study", type: "study", date: tomorrow, startTime: "09:00", endTime: "10:00", completed: false, notes: "", activityDetails: { subjectId } }) });
    assert.equal(plannerStudy.status, 201, JSON.stringify(plannerStudy.body));
    const studyRecord = (await a("/api/productivity")).body.studySessions.find((item) => item.eventId === plannerStudy.body.id);
    assert.ok(studyRecord);
    assert.equal((await a(`/api/study-sessions/${studyRecord.id}`, { method: "PUT", body: JSON.stringify({ subjectId, date: tomorrow, startTime: "09:00", endTime: "10:00", actualMinutes: 25, completed: true, notes: "" }) })).status, 200);

    const plannerWorkout = await a("/api/events", { method: "POST", body: JSON.stringify({ title: "Planner workout", type: "gym", date: tomorrow, startTime: "11:00", endTime: "12:00", completed: false, notes: "", activityDetails: { workoutType: "Running" } }) });
    assert.equal(plannerWorkout.status, 201, JSON.stringify(plannerWorkout.body));
    const workoutRecord = (await a("/api/productivity")).body.workouts.find((item) => item.eventId === plannerWorkout.body.id);
    assert.equal((await a(`/api/workouts/${workoutRecord.id}/complete`, { method: "POST", body: JSON.stringify({ durationMinutes: 40, startedAt: new Date(Date.now() - 3600000).toISOString(), exercises: [], notes: "" }) })).status, 200);

    const plannerHomework = await a("/api/events", { method: "POST", body: JSON.stringify({ title: "Planner homework", type: "homework", date: tomorrow, startTime: "13:00", endTime: "14:00", completed: false, notes: "", activityDetails: { subjectId, subject: "Algorithms", priority: "high" } }) });
    assert.equal(plannerHomework.status, 201, JSON.stringify(plannerHomework.body));
    const homeworkRecord = (await a("/api/productivity")).body.homeworkTasks.find((item) => item.eventId === plannerHomework.body.id);
    assert.equal((await a(`/api/homework-tasks/${homeworkRecord.id}`, { method: "PUT", body: JSON.stringify({ title: "Planner homework", subject: "Algorithms", description: "", dueDate: tomorrow, dueTime: "14:00", priority: "high", estimatedMinutes: 60, status: "completed", completedDate: tomorrow }) })).status, 200);

    assert.equal((await a("/api/work-sessions", { method: "POST", body: JSON.stringify({ date: tomorrow, startTime: "15:00", endTime: "16:00", actualMinutes: 60, completed: true, notes: "", tasksCompleted: [] }) })).status, 201);
    assert.equal((await a("/api/study-sessions", { method: "POST", body: JSON.stringify({ subjectId, date: tomorrow, startTime: "16:00", endTime: "17:00", actualMinutes: 99, completed: false, notes: "" }) })).status, 201);
    assert.equal((await a("/api/work-sessions", { method: "POST", body: JSON.stringify({ date: tomorrow, startTime: "17:00", endTime: "18:00", actualMinutes: 88, completed: false, notes: "", tasksCompleted: [] }) })).status, 201);
    const userId = (await getPool().query("SELECT id FROM users WHERE email=$1", ["analytics-a@example.com"])).rows[0].id;
    await getPool().query(`INSERT INTO activity_sessions(id,user_id,activity,subject_id,subject,topic,planned_duration,actual_duration,status,session_type,pomodoro_number,started_at,completed_at)
        VALUES($1,$2,'study',$3,'Algorithms','Pomodoro',1800,1800,'completed','focus',1,$4,$5)`, [crypto.randomUUID(), userId, subjectId, `${tomorrow}T09:00:00Z`, `${tomorrow}T09:30:00Z`]);

    const analytics = await a(`/api/analytics?start=${tomorrow}&end=${tomorrow}`);
    assert.equal(analytics.status, 200, JSON.stringify(analytics.body));
    assert.equal(analytics.body.study.minutes, 55);
    assert.equal(analytics.body.study.homeworkTotal, 1);
    assert.equal(analytics.body.study.homeworkCompleted, 1);
    assert.equal(analytics.body.gym.planned, 1);
    assert.equal(analytics.body.gym.completed, 1);
    assert.equal(analytics.body.gym.actualMinutes, 40);
    assert.equal(analytics.body.job.minutes, 60);
    assert.equal(analytics.body.planner.planned >= 5, true);
    assert.equal(analytics.body.planner.completed >= 3, true);
    assert.equal(analytics.body.gym.completionRate, 100);
    assert.equal(analytics.body.daily[0].studyMinutes, 55);

    const weekly = await a(`/api/analytics?start=${tomorrow}&end=${addDays(tomorrow, 6)}`);
    assert.equal(weekly.status, 200);
    assert.equal(weekly.body.study.minutes, 55);
    const monthDate = new Date(`${tomorrow}T12:00:00`);
    const monthEnd = dateKey(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0));
    const monthly = await a(`/api/analytics?start=${tomorrow}&end=${monthEnd}`);
    assert.equal(monthly.status, 200);
    assert.equal(monthly.body.job.minutes, 60);

    await getPool().query("UPDATE scheduled_workouts SET status='cancelled',completed=FALSE,actual_minutes=0 WHERE user_id=$1 AND id=$2", [userId, workoutRecord.id]);
    const afterCancel = await a(`/api/analytics?start=${tomorrow}&end=${tomorrow}`);
    assert.equal(afterCancel.body.gym.planned, 0);

    assert.equal((await a("/api/auth/logout", { method: "POST", body: "{}" })).status, 204);
    assert.equal((await b("/api/auth/register", { method: "POST", body: JSON.stringify({ firstName: "Analytics", lastName: "B", email: "analytics-b@example.com", password, confirmPassword: password }) })).status, 201);
    assert.equal((await b("/api/auth/onboarding", { method: "POST", body: JSON.stringify({ preferences: { student: true, gym: false, partTimeJob: false }, subjects: [{ name: "Other", targetWeeklyHours: 1, targetMonthlyHours: 4, priority: "medium", color: "#72c59b" }], workoutTemplate: null, job: null }) })).status, 200);
    const isolated = await b(`/api/analytics?start=${tomorrow}&end=${tomorrow}`);
    assert.equal(isolated.body.study.minutes, 0);
    assert.equal(isolated.body.study.homeworkTotal, 0);
    assert.equal(isolated.body.planner.planned, 0);
    assert.equal(isolated.body.planner.completionRate, 0);
    assert.equal((await b(`/api/analytics?start=${tomorrow}&end=${today}`)).status, 400);
});
