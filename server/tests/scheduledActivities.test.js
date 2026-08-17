const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

if (!process.env.TEST_DATABASE_URL) {
    test("unified scheduled activities", { skip: "TEST_DATABASE_URL is not configured" }, () => {});
} else test("unified scheduled activities stay linked across Planner and sections", async (context) => {
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
    const subjectColumn = await getPool().query("SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='study_sessions' AND column_name='subject_id'");
    assert.equal(subjectColumn.rows[0].is_nullable, "NO");
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
    const tomorrow = addDays(dateKey(), 1);
    const dayAfter = addDays(dateKey(), 2);
    const register = (request, suffix) => request("/api/auth/register", { method: "POST", body: JSON.stringify({ firstName: `Scheduled${suffix}`, lastName: "User", email: `scheduled-${suffix.toLowerCase()}@example.com`, password, confirmPassword: password }) });
    assert.equal((await register(a, "A")).status, 201);
    assert.equal((await a("/api/auth/onboarding", { method: "POST", body: JSON.stringify({ preferences: { student: true, gym: true, partTimeJob: true }, subjects: [{ name: "Algorithms", targetWeeklyHours: 4, targetMonthlyHours: 16, priority: "high", color: "#72c59b" }], workoutTemplate: null, job: { jobName: "Assistant", company: "Example", hourlyTarget: 20 } }) })).status, 200);
    const subjectId = (await a("/api/productivity")).body.subjects[0].id;
    assert.equal((await register(b, "B")).status, 201);
    assert.equal((await b("/api/auth/onboarding", { method: "POST", body: JSON.stringify({ preferences: { student: true, gym: false, partTimeJob: false }, subjects: [{ name: "Other", targetWeeklyHours: 1, targetMonthlyHours: 4, priority: "medium", color: "#72c59b" }], workoutTemplate: null, job: null }) })).status, 200);
    const otherSubjectId = (await b("/api/productivity")).body.subjects[0].id;

    const plannerWorkout = await a("/api/events", { method: "POST", body: JSON.stringify({ title: "Planner Gym", type: "gym", date: tomorrow, startTime: "18:00", endTime: "19:00", completed: false, notes: "Intervals", activityDetails: { workoutType: "Running" } }) });
    assert.equal(plannerWorkout.status, 201, JSON.stringify(plannerWorkout.body));
    let productivity = await a("/api/productivity");
    assert.equal(productivity.body.workouts.some((item) => item.eventId === plannerWorkout.body.id && item.name === "Planner Gym" && item.workoutType === "Running"), true);
    const plannerWorkoutRecord = productivity.body.workouts.find((item) => item.eventId === plannerWorkout.body.id);

    const plannerHomework = await a("/api/events", { method: "POST", body: JSON.stringify({ title: "Planner Homework", type: "homework", date: dayAfter, startTime: "18:00", endTime: "20:00", completed: false, notes: "Read chapter", activityDetails: { subjectId, subject: "Algorithms", priority: "high" } }) });
    assert.equal(plannerHomework.status, 201, JSON.stringify(plannerHomework.body));
    productivity = await a("/api/productivity");
    assert.equal(productivity.body.homeworkTasks.some((item) => item.eventId === plannerHomework.body.id && item.title === "Planner Homework"), true);
    const updatedPlannerHomework = await a(`/api/events/${plannerHomework.body.id}`, { method: "PUT", body: JSON.stringify({ title: "Planner Homework Updated", type: "homework", date: dayAfter, startTime: "18:30", endTime: "20:30", completed: false, notes: "Updated reading", activityDetails: { subject: "Independent", priority: "critical" } }) });
    assert.equal(updatedPlannerHomework.status, 200, JSON.stringify(updatedPlannerHomework.body));
    productivity = await a("/api/productivity");
    assert.equal(productivity.body.homeworkTasks.some((item) => item.eventId === plannerHomework.body.id && item.title === "Planner Homework Updated" && item.subject === "Independent" && item.priority === "critical"), true);
    const homeworkLink = await getPool().query("SELECT subject_id FROM homework WHERE event_id=$1", [plannerHomework.body.id]);
    assert.equal(homeworkLink.rows[0].subject_id, null);

    const calendarCountBeforeInvalidStudy = Number((await getPool().query("SELECT COUNT(*) count FROM calendar_events")).rows[0].count);
    const missingSubjectStudy = await a("/api/events", { method: "POST", body: JSON.stringify({ title: "Missing Subject Study", type: "study", date: tomorrow, startTime: "09:00", endTime: "10:00", completed: false, notes: "", activityDetails: {} }) });
    assert.equal(missingSubjectStudy.status, 400, JSON.stringify(missingSubjectStudy.body));
    const foreignSubjectStudy = await a("/api/events", { method: "POST", body: JSON.stringify({ title: "Foreign Subject Study", type: "study", date: tomorrow, startTime: "09:00", endTime: "10:00", completed: false, notes: "", activityDetails: { subjectId: otherSubjectId } }) });
    assert.equal(foreignSubjectStudy.status, 400, JSON.stringify(foreignSubjectStudy.body));
    assert.equal(Number((await getPool().query("SELECT COUNT(*) count FROM calendar_events")).rows[0].count), calendarCountBeforeInvalidStudy);

    const plannerStudy = await a("/api/events", { method: "POST", body: JSON.stringify({ title: "Planner Study", type: "study", date: tomorrow, startTime: "10:00", endTime: "11:00", completed: false, notes: "Review", activityDetails: { subjectId } }) });
    assert.equal(plannerStudy.status, 201, JSON.stringify(plannerStudy.body));
    productivity = await a("/api/productivity");
    assert.equal(productivity.body.studySessions.some((item) => item.eventId === plannerStudy.body.id && item.subjectId === subjectId), true);
    const updatedPlannerStudy = await a(`/api/events/${plannerStudy.body.id}`, { method: "PUT", body: JSON.stringify({ title: "Planner Study Updated", type: "study", date: dayAfter, startTime: "11:00", endTime: "12:00", completed: false, notes: "Updated review", activityDetails: { subjectId } }) });
    assert.equal(updatedPlannerStudy.status, 200, JSON.stringify(updatedPlannerStudy.body));
    productivity = await a("/api/productivity");
    assert.equal(productivity.body.studySessions.some((item) => item.eventId === plannerStudy.body.id && item.date === dayAfter), true);

    const sectionStudy = await a("/api/study-sessions", { method: "POST", body: JSON.stringify({ subjectId, date: tomorrow, startTime: "13:00", endTime: "14:00", actualMinutes: 0, completed: false, notes: "Section study" }) });
    assert.equal(sectionStudy.status, 201, JSON.stringify(sectionStudy.body));
    assert.equal((await a(`/api/study-sessions/${sectionStudy.body.id}`, { method: "PUT", body: JSON.stringify({ subjectId, date: dayAfter, startTime: "14:00", endTime: "15:00", actualMinutes: 45, completed: true, notes: "Updated section study" }) })).status, 200);
    assert.equal((await a(`/api/events?start=${dayAfter}&end=${dayAfter}`)).body.some((item) => item.id === sectionStudy.body.eventId && item.completed), true);
    assert.equal((await a(`/api/study-sessions/${sectionStudy.body.id}`, { method: "DELETE" })).status, 204);
    assert.equal((await a(`/api/events?start=${tomorrow}&end=${dayAfter}`)).body.some((item) => item.id === sectionStudy.body.eventId), false);

    const updatedWorkout = await a(`/api/events/${plannerWorkout.body.id}`, { method: "PUT", body: JSON.stringify({ title: "Planner Gym Updated", type: "gym", date: dayAfter, startTime: "19:00", endTime: "20:30", completed: false, notes: "Updated", activityDetails: { workoutType: "Boxing" } }) });
    assert.equal(updatedWorkout.status, 200, JSON.stringify(updatedWorkout.body));
    productivity = await a("/api/productivity");
    assert.equal(productivity.body.workouts.some((item) => item.eventId === plannerWorkout.body.id && item.name === "Planner Gym Updated" && item.date === dayAfter && item.workoutType === "Boxing"), true);

    const sectionWorkout = await a("/api/workouts", { method: "POST", body: JSON.stringify({ name: "Section Gym", workoutType: "Strength", date: tomorrow, startTime: "07:00", endTime: "08:00", completed: false, notes: "Section" }) });
    assert.equal(sectionWorkout.status, 201, JSON.stringify(sectionWorkout.body));
    const sectionHomework = await a("/api/homework-tasks", { method: "POST", body: JSON.stringify({ title: "Section Homework", subject: "Algorithms", description: "Section", dueDate: tomorrow, dueTime: "21:00", priority: "medium", estimatedMinutes: 60, status: "todo", completedDate: null }) });
    assert.equal(sectionHomework.status, 201, JSON.stringify(sectionHomework.body));
    assert.equal((await a(`/api/workouts/${sectionWorkout.body.id}`, { method: "PUT", body: JSON.stringify({ name: "Section Gym Updated", workoutType: "Cycling", date: dayAfter, startTime: "08:00", endTime: "09:00", completed: false, notes: "Updated section" }) })).status, 200);
    assert.equal((await a(`/api/homework-tasks/${sectionHomework.body.id}`, { method: "PUT", body: JSON.stringify({ title: "Section Homework Updated", subject: "Algorithms", description: "Updated section", dueDate: dayAfter, dueTime: "22:00", priority: "critical", estimatedMinutes: 90, status: "todo", completedDate: null }) })).status, 200);
    const events = (await a(`/api/events?start=${tomorrow}&end=${dayAfter}`)).body;
    assert.equal(events.some((item) => item.id === sectionWorkout.body.eventId), true);
    assert.equal(events.some((item) => item.id === sectionHomework.body.eventId), true);
    assert.equal(events.find((item) => item.id === sectionWorkout.body.eventId).title, "Section Gym Updated");
    assert.equal(events.find((item) => item.id === sectionHomework.body.eventId).title, "Section Homework Updated");

    const dayOfWeek = new Date(`${tomorrow}T12:00:00Z`).getUTCDay() || 7;
    const recurringTemplate = await a("/api/workout-templates", { method: "POST", body: JSON.stringify({ name: "Recurring test", recurring: true, startsOn: tomorrow, days: [{ dayOfWeek, workoutName: "Recurring Gym", workoutType: "Strength", startTime: "06:00", endTime: "07:00", exercises: [] }] }) });
    assert.equal(recurringTemplate.status, 201, JSON.stringify(recurringTemplate.body));
    let schedule = (await a(`/api/workout-schedule?start=${tomorrow}&end=${tomorrow}`)).body;
    const recurringWorkout = schedule.find((item) => item.source === "recurring" && item.templateId === recurringTemplate.body.id);
    assert.ok(recurringWorkout);
    assert.equal((await a(`/api/workouts/${recurringWorkout.id}`, { method: "DELETE" })).status, 204);
    schedule = (await a(`/api/workout-schedule?start=${tomorrow}&end=${tomorrow}`)).body;
    assert.equal(schedule.some((item) => item.id === recurringWorkout.id), false);
    const tombstone = await getPool().query("SELECT status,event_id FROM scheduled_workouts WHERE id=$1", [recurringWorkout.id]);
    assert.equal(tombstone.rows[0].status, "cancelled");
    assert.equal(tombstone.rows[0].event_id, null);

    const dashboard = await a("/api/dashboard");
    assert.equal(dashboard.status, 200);
    assert.equal(dashboard.body.upcoming.some((item) => item.id === plannerHomework.body.id), true);
    const analytics = await a(`/api/analytics?start=${tomorrow}&end=${dayAfter}`);
    assert.equal(analytics.status, 200);
    assert.equal(analytics.body.gym.planned >= 2, true);
    assert.equal(analytics.body.study.homeworkTotal >= 2, true);

    assert.equal((await a(`/api/events/${plannerHomework.body.id}`, { method: "DELETE" })).status, 204);
    assert.equal((await a(`/api/workouts/${sectionWorkout.body.id}`, { method: "DELETE" })).status, 204);
    assert.equal((await a(`/api/homework-tasks/${sectionHomework.body.id}`, { method: "DELETE" })).status, 204);
    productivity = await a("/api/productivity");
    assert.equal(productivity.body.homeworkTasks.some((item) => item.eventId === plannerHomework.body.id), false);
    assert.equal((await a(`/api/events?start=${tomorrow}&end=${dayAfter}`)).body.some((item) => item.id === sectionWorkout.body.eventId || item.id === sectionHomework.body.eventId), false);

    assert.equal((await b(`/api/events/${plannerWorkout.body.id}`, { method: "PUT", body: JSON.stringify({ title: "IDOR", type: "gym", date: tomorrow, startTime: "12:00", endTime: "13:00", completed: false, notes: "", activityDetails: { workoutType: "Other" } }) })).status, 404);
    assert.equal((await b(`/api/events/${plannerWorkout.body.id}`, { method: "DELETE" })).status, 404);
    assert.equal((await b(`/api/workouts/${plannerWorkoutRecord.id}`, { method: "DELETE" })).status, 404);
    assert.equal((await b("/api/productivity")).body.workouts.length, 0);
    assert.equal((await a(`/api/events/${plannerWorkout.body.id}`, { method: "DELETE" })).status, 204);
    assert.equal((await a(`/api/events/${plannerStudy.body.id}`, { method: "DELETE" })).status, 204);
    productivity = await a("/api/productivity");
    assert.equal(productivity.body.workouts.some((item) => item.eventId === plannerWorkout.body.id), false);
    assert.equal(productivity.body.studySessions.some((item) => item.eventId === plannerStudy.body.id), false);
});
