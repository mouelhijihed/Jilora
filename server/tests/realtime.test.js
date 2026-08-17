const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { io: connectSocket } = require("socket.io-client");

if (!process.env.TEST_DATABASE_URL) {
    test("authenticated Socket.IO targeting and logout", { skip: "TEST_DATABASE_URL is not configured" }, () => {});
} else {
    test("authenticated Socket.IO targeting and logout", async (context) => {
        process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
        process.env.NODE_ENV = "test";
        process.env.SESSION_SECRET = crypto.randomBytes(32).toString("hex");
        process.env.FRONTEND_URL = "http://localhost";
        process.env.SESSION_COOKIE_SECURE = "false";
        process.env.SESSION_COOKIE_SAME_SITE = "lax";

        const { migrate } = require("../db/migrate");
        await migrate();
        const { getPool, closePool } = require("../db/pool");
        await getPool().query("TRUNCATE users CASCADE");
        await getPool().query("TRUNCATE app_sessions");
        const app = require("../../app");
        const { closeSocketServer } = require("../realtime/socketServer");
        const { httpServer } = app.createHttpRuntime();
        await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
        const base = `http://127.0.0.1:${httpServer.address().port}`;
        const sockets = [];

        context.after(async () => {
            for (const socket of sockets) socket.disconnect();
            await closeSocketServer();
            if (httpServer.listening) await new Promise((resolve) => httpServer.close(resolve));
            await closePool();
        });

        function client() {
            let cookie = "";
            return {
                cookie: () => cookie,
                request: async (path, options = {}) => {
                    const response = await fetch(base + path, { ...options, headers: { "content-type": "application/json", cookie, ...options.headers } });
                    const setCookie = response.headers.get("set-cookie");
                    if (setCookie) cookie = setCookie.split(";")[0];
                    const body = response.status === 204 ? null : await response.json();
                    return { status: response.status, body };
                },
            };
        }

        function connect(cookie = "", auth = undefined) {
            const socket = connectSocket(base, { auth, extraHeaders: cookie ? { Cookie: cookie } : undefined, forceNew: true, reconnection: false, transports: ["websocket"] });
            sockets.push(socket);
            return socket;
        }

        function connected(socket) {
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error("Socket connection timed out")), 3000);
                socket.once("connect", () => { clearTimeout(timer); resolve(); });
                socket.once("connect_error", (error) => { clearTimeout(timer); reject(error); });
            });
        }

        const anonymous = connect("", { userId: crypto.randomUUID() });
        const anonymousError = await new Promise((resolve) => anonymous.once("connect_error", resolve));
        assert.match(anonymousError.message, /Authentication required/);

        const a = client(), b = client(), c = client();
        const password = "Correct-Horse-2026";
        const register = (current, suffix) => current.request("/api/auth/register", { method: "POST", body: JSON.stringify({ firstName: `User ${suffix}`, lastName: "Realtime", username: `realtime_${suffix.toLowerCase()}`, email: `realtime-${suffix.toLowerCase()}@example.com`, password, confirmPassword: password }) });
        const userA = (await register(a, "A")).body.user;
        const userB = (await register(b, "B")).body.user;
        await register(c, "C");
        const invitation = await a.request("/api/partners/invite", { method: "POST", body: JSON.stringify({ identifier: userB.username }) });
        assert.equal(invitation.status, 201);
        assert.equal((await b.request(`/api/partners/invitations/${invitation.body.id}/accept`, { method: "POST" })).status, 200);

        const socketA = connect(a.cookie());
        const socketB = connect(b.cookie());
        const socketC = connect(c.cookie());
        await Promise.all([connected(socketA), connected(socketB), connected(socketC)]);
        const bChanges = [];
        const cChanges = [];
        socketB.on("state:changed", (change) => bChanges.push(change));
        socketC.on("state:changed", (change) => cChanges.push(change));

        const created = await a.request("/api/sessions", { method: "POST", body: JSON.stringify({ activity: "study", subject: "Realtime", topic: "Targeted event", plannedDuration: 1500, status: "running", sessionType: "focus", startedAt: new Date().toISOString(), activeStartedAt: new Date().toISOString() }) });
        assert.equal(created.status, 201);
        await new Promise((resolve) => setTimeout(resolve, 150));
        assert.equal(bChanges.filter((change) => change.scope === "sessions").length, 1);
        assert.equal(cChanges.length, 0);

        const disconnected = new Promise((resolve) => socketA.once("disconnect", resolve));
        assert.equal((await a.request("/api/auth/logout", { method: "POST", body: "{}" })).status, 204);
        await disconnected;
        assert.equal(socketA.connected, false);
        assert.equal((await getPool().query("SELECT last_seen_at FROM users WHERE id=$1", [userA.id])).rows[0].last_seen_at, null);
    });
}
