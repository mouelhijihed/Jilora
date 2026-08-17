const express = require("express");
const rateLimit = require("express-rate-limit");
const { schemas, parse } = require("../validators/schemas");
const authService = require("../services/authService");
const presenceService = require("../services/presenceService");
const { requireAuth } = require("../middleware/auth");
const { sessionCookieClearOptions } = require("../config");
const { currentPartnerId, disconnectUser, emitToUsers } = require("../realtime/socketServer");

const router = express.Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false, message: { message: "Too many authentication attempts. Try again later." } });

function establishSession(request, userId) {
    return new Promise((resolve, reject) => request.session.regenerate((error) => {
        if (error) return reject(error);
        request.session.userId = userId;
        request.session.save((saveError) => saveError ? reject(saveError) : resolve());
    }));
}

router.post("/register", authLimiter, async (request, response, next) => {
    try {
        const user = await authService.register(parse(schemas.register, request.body));
        await establishSession(request, user.id);
        response.status(201).json({ user: { ...user, presence: await presenceService.touch(user.id) } });
    } catch (error) { next(error); }
});

router.post("/login", authLimiter, async (request, response, next) => {
    try {
        const input = parse(schemas.login, request.body);
        const user = await authService.login(input.email, input.password);
        await establishSession(request, user.id);
        response.json({ user: { ...user, presence: await presenceService.touch(user.id) } });
    } catch (error) { next(error); }
});

router.post("/logout", requireAuth, async (request, response, next) => {
    try {
        const userId = request.userId;
        const partnerId = await currentPartnerId(userId);
        await presenceService.markOffline(request.userId);
        request.session.destroy((error) => {
            if (error) return next(error);
            response.clearCookie(process.env.SESSION_COOKIE_NAME || "pd.sid", sessionCookieClearOptions());
            if (partnerId) emitToUsers([partnerId], { scope: "presence", occurredAt: new Date().toISOString() });
            void disconnectUser(userId).catch((disconnectError) => console.error("Socket logout disconnect failed", { userId, message: disconnectError.message }));
            response.status(204).end();
        });
    } catch (error) { next(error); }
});

router.get("/me", async (request, response, next) => {
    try {
        if (!request.session?.userId) return response.status(401).json({ message: "Authentication required" });
        const user = await authService.findPublicUser(request.session.userId);
        if (!user) return request.session.destroy(() => response.status(401).json({ message: "Authentication required" }));
        response.json({ user: { ...user, presence: await presenceService.touch(user.id) } });
    } catch (error) { next(error); }
});

router.post("/heartbeat", requireAuth, async (request, response, next) => {
    try { const presence=await presenceService.touch(request.userId);const partnerId=await currentPartnerId(request.userId);if(partnerId)emitToUsers([partnerId],{scope:"presence",occurredAt:new Date().toISOString()});response.json({ presence }); } catch (error) { next(error); }
});

router.put("/profile", requireAuth, async (request, response, next) => {
    try { const user=await authService.updateProfile(request.userId, parse(schemas.profile, request.body));response.json({ user:{...user,presence:await presenceService.touch(request.userId)} }); } catch (error) { next(error); }
});

router.post("/onboarding", requireAuth, async (request, response, next) => {
    try { const user=await authService.completeOnboarding(request.userId, parse(schemas.onboarding, request.body));response.json({ user:{...user,presence:await presenceService.touch(request.userId)} }); } catch (error) { next(error); }
});

module.exports = { authRouter: router };
