const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { io: connectSocket } = require("socket.io-client");

if (!process.env.TEST_DATABASE_URL) {
    test("production cross-origin session and Socket.IO authentication", { skip: "TEST_DATABASE_URL is not configured" }, () => {});
} else {
    test("production cross-origin session and Socket.IO authentication", async (context) => {
        process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
        process.env.NODE_ENV = "production";
        process.env.SESSION_SECRET = crypto.randomBytes(32).toString("hex");
        process.env.FRONTEND_URL = "https://jilora.vercel.app";
        delete process.env.CLIENT_ORIGIN;
        delete process.env.SESSION_COOKIE_SECURE;
        delete process.env.SESSION_COOKIE_SAME_SITE;
        delete process.env.SESSION_COOKIE_PARTITIONED;
        delete process.env.SESSION_COOKIE_DOMAIN;

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

        let cookie = "";
        async function request(path, options = {}) {
            const response = await fetch(base + path, {
                ...options,
                headers: {
                    "content-type": "application/json",
                    origin: "https://jilora.vercel.app",
                    "x-forwarded-proto": "https",
                    ...(cookie ? { cookie } : {}),
                    ...options.headers,
                },
            });
            const setCookie = response.headers.get("set-cookie");
            if (setCookie) cookie = setCookie.split(";")[0];
            const body = response.status === 204 ? null : await response.json();
            return { response, body, setCookie };
        }

        const password = "Correct-Horse-2026";
        const registered = await request("/api/auth/register", {
            method: "POST",
            body: JSON.stringify({
                firstName: "Production",
                lastName: "Session",
                username: "production_session",
                email: "production-session@example.com",
                password,
                confirmPassword: password,
            }),
        });
        assert.equal(registered.response.status, 201, JSON.stringify(registered.body));
        assert.equal(registered.response.headers.get("access-control-allow-origin"), "https://jilora.vercel.app");
        assert.equal(registered.response.headers.get("access-control-allow-credentials"), "true");
        assert.match(registered.setCookie, /HttpOnly/i);
        assert.match(registered.setCookie, /Secure/i);
        assert.match(registered.setCookie, /SameSite=None/i);
        assert.match(registered.setCookie, /Partitioned/i);
        assert.doesNotMatch(registered.setCookie, /Domain=/i);

        assert.equal((await request("/api/auth/me")).response.status, 200);
        assert.equal((await request("/api/auth/heartbeat", { method: "POST", body: "{}" })).response.status, 200);

        const socket = connectSocket(base, {
            extraHeaders: { Cookie: cookie, Origin: "https://jilora.vercel.app" },
            forceNew: true,
            reconnection: false,
            transports: ["websocket"],
        });
        sockets.push(socket);
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("Authenticated production socket connection timed out")), 3000);
            socket.once("connect", () => { clearTimeout(timer); resolve(); });
            socket.once("connect_error", (error) => { clearTimeout(timer); reject(error); });
        });

        const loggedOut = await request("/api/auth/logout", { method: "POST", body: "{}" });
        assert.equal(loggedOut.response.status, 204);
        assert.match(loggedOut.setCookie, /Max-Age=0|Expires=Thu, 01 Jan 1970/i);
        assert.match(loggedOut.setCookie, /Secure/i);
        assert.match(loggedOut.setCookie, /SameSite=None/i);
        assert.match(loggedOut.setCookie, /Partitioned/i);
        cookie = "";
        assert.equal((await request("/api/auth/me")).response.status, 401);

        const loggedIn = await request("/api/auth/login", {
            method: "POST",
            body: JSON.stringify({ email: "production-session@example.com", password }),
        });
        assert.equal(loggedIn.response.status, 200, JSON.stringify(loggedIn.body));
        assert.match(loggedIn.setCookie, /Secure/i);
        assert.match(loggedIn.setCookie, /SameSite=None/i);
        assert.match(loggedIn.setCookie, /Partitioned/i);
        assert.equal((await request("/api/auth/me")).response.status, 200);
    });
}
