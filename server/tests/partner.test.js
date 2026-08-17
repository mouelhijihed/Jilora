const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

if (!process.env.TEST_DATABASE_URL) {
    test("partner system security, privacy, and persistence", { skip: "TEST_DATABASE_URL is not configured" }, () => {});
} else {
    test("partner system security, privacy, and persistence", async () => {
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
        let server = app.listen(0);
        let base = `http://127.0.0.1:${server.address().port}`;

        async function makeClient() {
            let cookie = "";
            return async (path, options = {}) => {
                const response = await fetch(base + path, { ...options, headers: { "content-type": "application/json", cookie, ...options.headers } });
                const setCookie = response.headers.get("set-cookie");
                if (setCookie) cookie = setCookie.split(";")[0];
                const body = response.status === 204 ? null : await response.json();
                return { status: response.status, body };
            };
        }

        const a = await makeClient();
        const b = await makeClient();
        const c = await makeClient();
        const anonymous = await makeClient();
        const password = "Correct-Horse-2026";
        const register = (client, suffix) => client("/api/auth/register", { method: "POST", body: JSON.stringify({ firstName: `User${suffix}`, lastName: "Partner", username: `partner_${suffix.toLowerCase()}`, email: `${suffix.toLowerCase()}-partner@example.com`, password, confirmPassword: password }) });

        try {
            assert.equal((await anonymous("/api/partners/me")).status, 401);
            const userA = (await register(a, "A")).body.user;
            const userB = (await register(b, "B")).body.user;
            const userC = (await register(c, "C")).body.user;
            assert.equal(userA.presence.online, true);
            assert.equal(userB.presence.online, true);
            assert.equal((await anonymous("/api/auth/heartbeat", { method: "POST" })).status, 401);
            assert.equal((await b("/api/auth/heartbeat", { method: "POST" })).body.presence.online, true);

            assert.equal((await a("/api/partners/invite", { method: "POST", body: JSON.stringify({ identifier: userA.username }) })).status, 400);
            const invitation = await a("/api/partners/invite", { method: "POST", body: JSON.stringify({ identifier: userB.username }) });
            assert.equal(invitation.status, 201);
            assert.equal((await b("/api/partners/invite", { method: "POST", body: JSON.stringify({ identifier: userA.username }) })).status, 409);
            assert.equal((await c(`/api/partners/invitations/${invitation.body.id}/accept`, { method: "POST" })).status, 404);

            const simultaneous = await Promise.all([
                b(`/api/partners/invitations/${invitation.body.id}/accept`, { method: "POST" }),
                b(`/api/partners/invitations/${invitation.body.id}/accept`, { method: "POST" }),
            ]);
            assert.deepEqual(simultaneous.map((result) => result.status).sort(), [200, 409]);
            assert.equal((await a(`/api/partners/invitations/${invitation.body.id}/cancel`, { method: "POST" })).status, 404);
            await getPool().query("UPDATE users SET last_seen_at=NOW()-INTERVAL '3 minutes' WHERE id=$1", [userB.id]);
            assert.equal((await a("/api/partners/me")).body.partnership.partner.id, userB.id);
            assert.equal((await a("/api/partners/shared-data")).body.partner.presence.online, false);
            assert.equal((await b("/api/auth/heartbeat", { method: "POST" })).body.presence.online, true);

            const stateA = await a("/api/partners/me");
            const stateB = await b("/api/partners/me");
            assert.equal(stateA.body.partnership.partner.id, userB.id);
            assert.equal(stateB.body.partnership.partner.id, userA.id);
            assert.equal((await c("/api/partners/me")).body.partnership, null);
            assert.equal((await c("/api/partners/shared-data")).status, 404);

            const defaults = (await b("/api/partners/settings")).body;
            assert.deepEqual({
                study: defaults.shareStudyTime, subjects: defaults.shareStudySubjects, homework: defaults.shareHomeworkProgress,
                gym: defaults.shareGymProgress, job: defaults.shareJobHours, activity: defaults.shareCurrentActivity,
                calendar: defaults.shareCalendar, tasks: defaults.shareDetailedTasks, workouts: defaults.shareDetailedWorkouts,
            }, { study: true, subjects: false, homework: true, gym: true, job: false, activity: true, calendar: false, tasks: false, workouts: false });

            const completed = await b("/api/sessions", { method: "POST", body: JSON.stringify({ activity: "study", subject: "Private subject", plannedDuration: 1500, actualDuration: 600, status: "completed", sessionType: "focus", startedAt: new Date(Date.now() - 600000).toISOString(), completedAt: new Date().toISOString() }) });
            assert.equal(completed.status, 201);
            const active = await b("/api/sessions", { method: "POST", body: JSON.stringify({ activity: "study", subject: "Private live subject", plannedDuration: 1500, status: "running", sessionType: "focus", startedAt: new Date().toISOString(), activeStartedAt: new Date().toISOString() }) });
            assert.equal(active.status, 201);
            let shared = (await a("/api/partners/shared-data")).body;
            assert.equal(shared.partner.study.weekMinutes >= 10, true);
            assert.equal(shared.partner.status, "Studying");
            assert.equal((await b(`/api/sessions/${active.body.id}`, { method: "PUT", body: JSON.stringify({ status: "paused", actualDuration: 999, activeStartedAt: null }) })).body.status, "paused");
            assert.equal((await a("/api/partners/shared-data")).body.partner.status, "On break");
            assert.equal((await b("/api/auth/logout", { method: "POST" })).status, 204);
            shared = (await a("/api/partners/shared-data")).body;
            assert.equal(shared.partner.presence.online, false);
            assert.equal(shared.partner.status, "Offline");
            assert.equal((await b("/api/auth/login", { method: "POST", body: JSON.stringify({ email: userB.email, password }) })).status, 200);
            assert.equal((await a("/api/partners/shared-data")).body.partner.status, "On break");
            assert.equal((await b(`/api/sessions/${active.body.id}`, { method: "PUT", body: JSON.stringify({ status: "running", activeStartedAt: new Date().toISOString() }) })).body.status, "running");
            assert.equal((await a("/api/partners/shared-data")).body.partner.status, "Studying");
            assert.equal(shared.activity.some((item) => item.type === "pomodoro_completed" && item.actor.id === userB.id), true);
            assert.equal(shared.partner.job, null);

            const privateSettings = { shareStudyTime: false, shareStudySubjects: false, shareHomeworkProgress: true, shareGymProgress: false, shareJobHours: false, shareCurrentActivity: false, shareCalendar: false, shareDetailedTasks: false, shareDetailedWorkouts: false };
            assert.equal((await b("/api/partners/settings", { method: "PUT", body: JSON.stringify(privateSettings) })).status, 200);
            shared = (await a("/api/partners/shared-data")).body;
            assert.equal(shared.partner.study, null);
            assert.equal(shared.partner.gym, null);
            assert.equal(shared.partner.job, null);
            assert.equal(shared.partner.presence.online, true);
            assert.equal(shared.partner.status, "Online");
            assert.equal(shared.activity.some((item) => item.type === "pomodoro_completed" && item.actor.id === userB.id), false);
            assert.equal(JSON.stringify(shared).includes("Private subject"), false);
            await b(`/api/sessions/${active.body.id}`, { method: "DELETE" });

            const subject = await a("/api/subjects", { method: "POST", body: JSON.stringify({ name: "Algorithms", targetWeeklyHours: 5, targetMonthlyHours: 20, priority: "high", color: "#72c59b" }) });
            assert.equal(subject.status, 201);
            assert.equal((await a("/api/partners/study-sessions", { method: "POST", body: JSON.stringify({ subjectId: subject.body.id, durationMinutes: 1 }) })).status, 403);

            const openSettings = { ...privateSettings, shareStudyTime: true, shareStudySubjects: true, shareGymProgress: true, shareCurrentActivity: true };
            assert.equal((await a("/api/partners/settings", { method: "PUT", body: JSON.stringify(openSettings) })).status, 200);
            assert.equal((await b("/api/partners/settings", { method: "PUT", body: JSON.stringify(openSettings) })).status, 200);
            const goalDate = new Date().toISOString().slice(0, 10);
            const personalGoal = await a("/api/partners/goals", { method: "POST", body: JSON.stringify({ title: "Personal study contribution", type: "study_minutes", target: 60, startDate: goalDate, endDate: goalDate }) });
            assert.equal(personalGoal.status, 201);
            assert.equal(personalGoal.body.contributors.find((item) => item.user.id === userB.id).value, 10);
            assert.equal(Number((await getPool().query("SELECT COUNT(*) count FROM activity_sessions WHERE id=$1", [completed.body.id])).rows[0].count), 1);

            const partialSession = await a("/api/partners/study-sessions", { method: "POST", body: JSON.stringify({ subjectId: subject.body.id, durationMinutes: 1 }) });
            assert.equal(partialSession.status, 201);
            assert.equal((await a("/api/partners/study-sessions", { method: "POST", body: JSON.stringify({ durationMinutes: 1 }) })).status, 409);
            assert.equal((await c(`/api/partners/study-sessions/${partialSession.body.id}/join`, { method: "POST" })).status, 404);
            assert.equal((await b(`/api/partners/study-sessions/${crypto.randomUUID()}/join`, { method: "POST" })).status, 404);
            assert.equal((await b(`/api/partners/study-sessions/${partialSession.body.id}/join`, { method: "POST" })).status, 200);
            assert.equal((await b(`/api/partners/study-sessions/${partialSession.body.id}/join`, { method: "POST" })).status, 200);
            assert.equal((await a(`/api/partners/study-sessions/${partialSession.body.id}/pause`, { method: "POST" })).status, 200);
            let bNotifications = (await b("/api/partners/notifications")).body;
            assert.equal(bNotifications.filter((item) => item.type === "study_paused" && item.metadata.sessionId === partialSession.body.id).length, 1);
            assert.equal(bNotifications.find((item) => item.type === "study_paused" && item.metadata.sessionId === partialSession.body.id).body, "Your partner paused the Pomodoro.");
            assert.equal((await b(`/api/partners/study-sessions/${partialSession.body.id}/pause`, { method: "POST" })).status, 200);
            assert.equal((await b("/api/partners/notifications")).body.filter((item) => item.type === "study_paused" && item.metadata.sessionId === partialSession.body.id).length, 1);
            assert.equal((await a("/api/partners/notifications")).body.filter((item) => item.type === "study_paused" && item.metadata.sessionId === partialSession.body.id).length, 0);
            assert.equal((await a(`/api/partners/study-sessions/${partialSession.body.id}/resume`, { method: "POST" })).status, 200);
            assert.equal((await b(`/api/partners/study-sessions/${partialSession.body.id}/resume`, { method: "POST" })).status, 200);
            assert.equal((await b("/api/partners/notifications")).body.filter((item) => item.type === "study_resumed" && item.metadata.sessionId === partialSession.body.id).length, 1);
            await new Promise((resolve) => setTimeout(resolve, 1100));
            assert.equal((await a(`/api/partners/study-sessions/${partialSession.body.id}/complete`, { method: "POST" })).status, 200);
            assert.equal((await a(`/api/partners/study-sessions/${partialSession.body.id}/complete`, { method: "POST" })).status, 200);
            assert.equal((await b(`/api/partners/study-sessions/${partialSession.body.id}/leave`, { method: "POST" })).body.status, "cancelled");
            assert.equal(Number((await getPool().query("SELECT COUNT(*) count FROM activity_sessions WHERE partner_session_id=$1", [partialSession.body.id])).rows[0].count), 0);

            const cancelledSession = await a("/api/partners/study-sessions", { method: "POST", body: JSON.stringify({ durationMinutes: 1 }) });
            await b(`/api/partners/study-sessions/${cancelledSession.body.id}/join`, { method: "POST" });
            assert.equal((await a("/api/auth/logout", { method: "POST" })).status, 204);
            const sharedWhileLoggedOut = (await b("/api/partners/shared-data")).body.partner;
            assert.equal(sharedWhileLoggedOut.presence.online, false);
            assert.equal(sharedWhileLoggedOut.status, "Offline");
            assert.equal((await a("/api/auth/login", { method: "POST", body: JSON.stringify({ email: userA.email, password }) })).status, 200);
            assert.equal((await b(`/api/partners/study-sessions/${cancelledSession.body.id}/cancel`, { method: "POST" })).status, 204);
            assert.equal((await a("/api/partners/me")).body.activeSession, null);
            assert.equal((await a("/api/partners/notifications")).body.filter((item) => item.type === "study_cancelled" && item.metadata.sessionId === cancelledSession.body.id).length, 1);
            assert.equal((await b(`/api/partners/study-sessions/${cancelledSession.body.id}/cancel`, { method: "POST" })).status, 204);
            assert.equal((await a("/api/partners/notifications")).body.filter((item) => item.type === "study_cancelled" && item.metadata.sessionId === cancelledSession.body.id).length, 1);

            const completedSession = await a("/api/partners/study-sessions", { method: "POST", body: JSON.stringify({ durationMinutes: 1 }) });
            assert.equal(completedSession.status, 201);
            await b(`/api/partners/study-sessions/${completedSession.body.id}/join`, { method: "POST" });
            await new Promise((resolve) => setTimeout(resolve, 1100));
            await a(`/api/partners/study-sessions/${completedSession.body.id}/complete`, { method: "POST" });
            const completedByB = await b(`/api/partners/study-sessions/${completedSession.body.id}/complete`, { method: "POST" });
            assert.equal(completedByB.body.status, "completed");
            assert.equal(Number((await getPool().query("SELECT COUNT(*) count FROM activity_sessions WHERE partner_session_id=$1 AND status='completed'", [completedSession.body.id])).rows[0].count), 2);
            assert.equal((await a(`/api/partners/study-sessions/${completedSession.body.id}/cancel`, { method: "POST" })).status, 409);

            const today = new Date().toISOString().slice(0, 10);
            const goal = await a("/api/partners/goals", { method: "POST", body: JSON.stringify({ title: "Study Together", type: "study_minutes", target: 20, startDate: today, endDate: today }) });
            assert.equal(goal.status, 201);
            assert.equal(goal.body.contributors.length, 2);
            assert.equal((await c(`/api/partners/goals/${goal.body.id}`, { method: "PUT", body: JSON.stringify({ title: "IDOR", type: "custom", target: 1, manualProgress: 1, startDate: today, endDate: today }) })).status, 404);
            assert.equal((await c(`/api/partners/goals/${goal.body.id}`, { method: "DELETE" })).status, 404);
            await a("/api/partners/settings", { method: "PUT", body: JSON.stringify({ ...openSettings, shareStudyTime: false }) });
            const goalFromB = (await b("/api/partners/goals")).body.find((item) => item.id === goal.body.id);
            assert.equal(goalFromB.contributors.find((item) => item.user.id === userA.id).value, null);
            const goalFromA = (await a("/api/partners/goals")).body.find((item) => item.id === goal.body.id);
            assert.equal(typeof goalFromA.contributors.find((item) => item.user.id === userA.id).value, "number");

            const custom = await a("/api/partners/goals", { method: "POST", body: JSON.stringify({ title: "Read chapters", type: "custom", target: 5, manualProgress: 1, startDate: today, endDate: today }) });
            assert.equal(custom.status, 201);
            const updatedCustom = await b(`/api/partners/goals/${custom.body.id}`, { method: "PUT", body: JSON.stringify({ title: "Read chapters", type: "custom", target: 5, manualProgress: 3, startDate: today, endDate: today }) });
            assert.equal(updatedCustom.body.progress, 3);

            await new Promise((resolve) => server.close(resolve));
            server = app.listen(0);
            base = `http://127.0.0.1:${server.address().port}`;
            assert.equal((await a("/api/partners/me")).body.partnership.partner.id, userB.id);
            assert.equal((await a("/api/partners/goals")).body.some((item) => item.id === custom.body.id), true);

            assert.equal((await a("/api/partners/encouragement", { method: "POST", body: JSON.stringify({ message: "Nice work" }) })).status, 204);
            const notification = (await b("/api/partners/notifications")).body.find((item) => item.type === "encouragement");
            assert.ok(notification);
            assert.equal((await c(`/api/partners/notifications/${notification.id}/read`, { method: "POST" })).status, 404);
            assert.equal((await b(`/api/partners/notifications/${notification.id}/read`, { method: "POST" })).body.readAt !== null, true);
            const aNotificationCount = (await a("/api/partners/notifications")).body.length;
            const activityCountBeforeClear = Number((await getPool().query("SELECT COUNT(*) count FROM partner_activity WHERE partnership_id=$1", [stateA.body.partnership.id])).rows[0].count);
            assert.equal((await b("/api/partners/notifications", { method: "DELETE" })).status, 204);
            assert.equal((await b("/api/partners/notifications")).body.length, 0);
            assert.equal((await a("/api/partners/notifications")).body.length, aNotificationCount);
            assert.equal(Number((await getPool().query("SELECT COUNT(*) count FROM partner_activity WHERE partnership_id=$1", [stateA.body.partnership.id])).rows[0].count), activityCountBeforeClear);
            assert.equal(Number((await getPool().query("SELECT COUNT(*) count FROM partner_notifications WHERE user_id=$1 AND archived_at IS NOT NULL", [userB.id])).rows[0].count) > 0, true);

            const reloggedA = await makeClient();
            assert.equal((await reloggedA("/api/auth/login", { method: "POST", body: JSON.stringify({ email: userA.email, password }) })).status, 200);
            assert.equal((await reloggedA("/api/partners/me")).body.partnership.partner.id, userB.id);
            assert.equal((await reloggedA("/api/partners/goals")).body.some((item) => item.id === custom.body.id), true);
            assert.equal((await reloggedA("/api/auth/logout", { method: "POST" })).status, 204);
            assert.equal((await reloggedA("/api/partners/me")).status, 401);
            assert.equal((await getPool().query("SELECT last_seen_at FROM users WHERE id=$1", [userA.id])).rows[0].last_seen_at, null);

            assert.equal((await c("/api/partners", { method: "DELETE" })).status, 404);
            assert.equal((await a("/api/partners", { method: "DELETE" })).status, 204);
            assert.equal((await b("/api/partners/me")).body.partnership, null);
            assert.equal((await b("/api/partners/goals")).status, 404);
            assert.equal((await a("/api/partners/notifications")).body.length, 0);
            assert.equal((await b("/api/partners/notifications")).body.length, 0);

            const reconnectInvitation = await a("/api/partners/invite", { method: "POST", body: JSON.stringify({ identifier: userB.username }) });
            assert.equal(reconnectInvitation.status, 201);
            const reconnected = await b(`/api/partners/invitations/${reconnectInvitation.body.id}/accept`, { method: "POST" });
            const newPartnershipId = reconnected.body.partnership.id;
            assert.notEqual(newPartnershipId, stateA.body.partnership.id);
            const newNotificationsA = (await a("/api/partners/notifications")).body;
            const newNotificationsB = (await b("/api/partners/notifications")).body;
            assert.equal(newNotificationsA.length > 0, true);
            assert.equal(newNotificationsB.length > 0, true);
            assert.equal(newNotificationsA.every((item) => item.partnershipId === newPartnershipId), true);
            assert.equal(newNotificationsB.every((item) => item.partnershipId === newPartnershipId), true);
            assert.equal((await a("/api/partners/notifications", { method: "DELETE" })).status, 204);
            assert.equal((await a("/api/auth/logout", { method: "POST" })).status, 204);
            assert.equal((await a("/api/auth/login", { method: "POST", body: JSON.stringify({ email: userA.email, password }) })).status, 200);
            assert.equal((await a("/api/partners/notifications")).body.length, 0);
            assert.equal((await a("/api/partners", { method: "DELETE" })).status, 204);

            const cancelInvite = await a("/api/partners/invite", { method: "POST", body: JSON.stringify({ identifier: userB.username }) });
            assert.equal(cancelInvite.status, 201);
            assert.equal((await a(`/api/partners/invitations/${cancelInvite.body.id}/cancel`, { method: "POST" })).status, 204);
            assert.equal((await a(`/api/partners/invitations/${cancelInvite.body.id}/cancel`, { method: "POST" })).status, 404);
            const declineInvite = await b("/api/partners/invite", { method: "POST", body: JSON.stringify({ identifier: userA.username }) });
            assert.equal(declineInvite.status, 201);
            assert.equal((await a(`/api/partners/invitations/${declineInvite.body.id}/decline`, { method: "POST" })).status, 204);
            assert.equal((await a(`/api/partners/invitations/${declineInvite.body.id}/decline`, { method: "POST" })).status, 404);
            assert.equal(userC.id !== userA.id && userC.id !== userB.id, true);
        } finally {
            await new Promise((resolve) => server.close(resolve));
            await closePool();
        }
    });
}
