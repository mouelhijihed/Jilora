const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
require("./requireTestDatabase");

if (!process.env.TEST_DATABASE_URL) {
    test("optional onboarding subjects and workout program", { skip: "TEST_DATABASE_URL is not configured" }, () => {});
} else test("onboarding accepts every optional Subjects and Gym Program combination", async (context) => {
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

    const password = "Correct-Horse-2026";
    const { dateKey, addDays } = require("../utils/records");
    const startsOn = addDays(dateKey(), 1);
    const dayOfWeek = new Date(`${startsOn}T12:00:00Z`).getUTCDay() || 7;
    const subject = { name: "Algorithms", targetWeeklyHours: 5, targetMonthlyHours: 20, priority: "medium", color: "#72c59b" };
    const workoutTemplate = { name: "Weekly", recurring: true, startsOn, days: [{ dayOfWeek, workoutName: "Strength", workoutType: "Strength", startTime: "18:00", endTime: "19:00", exercises: [] }] };
    const cases = [
        { suffix: "none", input: { preferences: { student: true, gym: true, partTimeJob: false } }, subjects: 0, templates: 0 },
        { suffix: "gym", input: { preferences: { student: true, gym: true, partTimeJob: false }, workoutTemplate }, subjects: 0, templates: 1 },
        { suffix: "subjects", input: { preferences: { student: true, gym: true, partTimeJob: false }, subjects: [subject] }, subjects: 1, templates: 0 },
        { suffix: "both", input: { preferences: { student: true, gym: true, partTimeJob: false }, subjects: [subject], workoutTemplate }, subjects: 1, templates: 1 },
    ];
    const clients = [];

    for (const current of cases) {
        const request = await client();
        clients.push(request);
        const registered = await request("/api/auth/register", { method: "POST", body: JSON.stringify({ firstName: "Optional", lastName: current.suffix, email: `optional-${current.suffix}@example.com`, password, confirmPassword: password }) });
        assert.equal(registered.status, 201, JSON.stringify(registered.body));
        const onboarding = await request("/api/auth/onboarding", { method: "POST", body: JSON.stringify(current.input) });
        assert.equal(onboarding.status, 200, JSON.stringify(onboarding.body));
        const productivity = await request("/api/productivity");
        const templates = await request("/api/workout-templates");
        assert.equal(productivity.body.subjects.length, current.subjects);
        assert.equal(templates.body.length, current.templates);
    }

    assert.equal((await clients[0]("/api/productivity")).body.subjects.length, 0);
    assert.equal((await clients[0]("/api/workout-templates")).body.length, 0);
    const repeated = await clients[0]("/api/auth/onboarding", { method: "POST", body: JSON.stringify({ preferences: { student: true, gym: true, partTimeJob: false } }) });
    assert.equal(repeated.status, 409, JSON.stringify(repeated.body));
    assert.equal((await clients[0]("/api/productivity")).body.subjects.length, 0);
    assert.equal((await clients[0]("/api/workout-templates")).body.length, 0);
});
