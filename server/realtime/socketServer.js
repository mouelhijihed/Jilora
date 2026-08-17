const { Server } = require("socket.io");
const { getPool } = require("../db/pool");
const presenceService = require("../services/presenceService");

let socketServer = null;

function userRoom(userId) { return `user:${userId}`; }

async function currentPartnerId(userId) {
    const row = (await getPool().query(
        `SELECT other.user_id partner_id
         FROM partnership_members self
         JOIN partnership_members other ON other.partnership_id=self.partnership_id AND other.user_id<>self.user_id
         WHERE self.user_id=$1`,
        [userId],
    )).rows[0];
    return row?.partner_id || null;
}

async function relatedUserIds(userId) {
    const rows = (await getPool().query(
        `SELECT other.user_id related_id
         FROM partnership_members self
         JOIN partnership_members other ON other.partnership_id=self.partnership_id AND other.user_id<>self.user_id
         WHERE self.user_id=$1
         UNION
         SELECT CASE WHEN sender_id=$1 THEN receiver_id ELSE sender_id END related_id
         FROM partner_invitations
         WHERE status='pending' AND expires_at>NOW() AND (sender_id=$1 OR receiver_id=$1)`,
        [userId],
    )).rows;
    return rows.map((row) => row.related_id);
}

function emitToUsers(userIds, payload) {
    if (!socketServer) return;
    for (const userId of new Set(userIds.filter(Boolean))) socketServer.to(userRoom(userId)).emit("state:changed", payload);
}

async function notifyStateChange(userId, payload, before = []) {
    const related = await relatedUserIds(userId);
    emitToUsers([userId, ...before, ...related], { ...payload, occurredAt: new Date().toISOString() });
}

function mutationScope(pathname) {
    if (pathname.startsWith("/partners")) return "partner";
    if (pathname.startsWith("/sessions") || pathname.startsWith("/pomodoro")) return "sessions";
    if (pathname.startsWith("/planner") || pathname.startsWith("/events")) return "planner";
    if (pathname.includes("workout")) return "workouts";
    return "productivity";
}

function realtimeMutationMiddleware(request, response, next) {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return next();
    relatedUserIds(request.userId).then((before) => {
        response.once("finish", () => {
            if (response.statusCode < 200 || response.statusCode >= 300) return;
            setImmediate(() => notifyStateChange(request.userId, {
                scope: mutationScope(request.path),
                method: request.method,
            }, before).catch((error) => console.error("Realtime state notification failed", { message: error.message })));
        });
        next();
    }).catch(next);
}

function attachSocketServer(httpServer, sessionMiddleware, allowedOrigins) {
    if (socketServer) return socketServer;
    const allowed = new Set(allowedOrigins);
    socketServer = new Server(httpServer, {
        cors: {
            credentials: true,
            origin(origin, callback) {
                if (!origin || allowed.has(origin.replace(/\/$/, ""))) return callback(null, true);
                return callback(new Error("Socket origin is not allowed"));
            },
        },
    });
    socketServer.engine.use(sessionMiddleware);
    socketServer.use((socket, next) => {
        const userId = socket.request.session?.userId;
        if (!userId) return next(new Error("Authentication required"));
        socket.data.userId = userId;
        next();
    });
    socketServer.on("connection", async (socket) => {
        const userId = socket.data.userId;
        socket.join(userRoom(userId));
        try {
            await presenceService.touch(userId);
            const partnerId = await currentPartnerId(userId);
            if (partnerId) emitToUsers([partnerId], { scope: "presence", occurredAt: new Date().toISOString() });
        } catch (error) {
            console.error("Socket connection setup failed", { userId, message: error.message });
            socket.disconnect(true);
            return;
        }
        const sessionCheck = setInterval(() => {
            socket.request.session.reload((error) => {
                if (error || socket.request.session?.userId !== userId) socket.disconnect(true);
            });
        }, 60000);
        socket.on("disconnect", () => clearInterval(sessionCheck));
        socket.on("error", (error) => console.error("Socket client error", { userId, message: error.message }));
    });
    socketServer.engine.on("connection_error", (error) => console.error("Socket transport error", { code: error.code, message: error.message }));
    return socketServer;
}

async function disconnectUser(userId) {
    if (!socketServer) return;
    const sockets = await socketServer.in(userRoom(userId)).fetchSockets();
    for (const socket of sockets) socket.disconnect(true);
}

function closeSocketServer() {
    if (!socketServer) return Promise.resolve();
    const current = socketServer;
    socketServer = null;
    current.disconnectSockets(true);
    return new Promise((resolve) => current.close(resolve));
}

module.exports = { attachSocketServer, closeSocketServer, currentPartnerId, disconnectUser, emitToUsers, notifyStateChange, realtimeMutationMiddleware, relatedUserIds };
