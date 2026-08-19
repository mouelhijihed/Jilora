const express = require("express");
const rateLimit = require("express-rate-limit");
const service = require("../services/partnerService");
const encouragementService = require("../services/encouragementService");
const { schemas, parse, id } = require("../validators/schemas");

const router = express.Router();
const invitationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    keyGenerator: (request) => request.userId,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "Too many partner invitation attempts. Try again later." },
});
const encouragementLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    keyGenerator: (request) => request.userId,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "Too many encouragements. Try again later." },
});

router.get("/partners", async (request,response,next)=>{try{response.json(await service.getState(request.userId));}catch(error){next(error);}});
router.get("/partners/me", async (request,response,next)=>{try{response.json(await service.getState(request.userId));}catch(error){next(error);}});
router.get("/partners/invitations", async (request,response,next)=>{try{const state=await service.getState(request.userId);response.json({incoming:state.incomingInvitations,outgoing:state.outgoingInvitations});}catch(error){next(error);}});
router.post("/partners/invite", invitationLimiter, async (request,response,next)=>{try{response.status(201).json(await service.invite(request.userId,parse(schemas.partnerInvite,request.body).identifier));}catch(error){next(error);}});
router.post("/partners/invitations/:id/accept", async (request,response,next)=>{try{response.json(await service.acceptInvitation(request.userId,parse(id,request.params.id)));}catch(error){next(error);}});
router.post("/partners/invitations/:id/decline", async (request,response,next)=>{try{await service.declineInvitation(request.userId,parse(id,request.params.id));response.status(204).end();}catch(error){next(error);}});
router.post("/partners/invitations/:id/cancel", async (request,response,next)=>{try{await service.cancelInvitation(request.userId,parse(id,request.params.id));response.status(204).end();}catch(error){next(error);}});
router.delete("/partners", async (request,response,next)=>{try{await service.removePartner(request.userId);response.status(204).end();}catch(error){next(error);}});

router.get("/partners/shared-data", async (request,response,next)=>{try{response.json(await service.sharedData(request.userId));}catch(error){next(error);}});
router.get("/partners/settings", async (request,response,next)=>{try{response.json(await service.getSettings(request.userId));}catch(error){next(error);}});
router.put("/partners/settings", async (request,response,next)=>{try{response.json(await service.updateSettings(request.userId,parse(schemas.partnerSettings,request.body)));}catch(error){next(error);}});

router.get("/partners/goals", async (request,response,next)=>{try{response.json(await service.goals(request.userId));}catch(error){next(error);}});
router.post("/partners/goals", async (request,response,next)=>{try{response.status(201).json(await service.createGoal(request.userId,parse(schemas.partnerGoal,request.body)));}catch(error){next(error);}});
router.put("/partners/goals/:id", async (request,response,next)=>{try{response.json(await service.updateGoal(request.userId,parse(id,request.params.id),parse(schemas.partnerGoal,request.body)));}catch(error){next(error);}});
router.post("/partners/goals/:id/complete", async (request,response,next)=>{try{response.json(await service.completeGoal(request.userId,parse(id,request.params.id)));}catch(error){next(error);}});
router.delete("/partners/goals/:id", async (request,response,next)=>{try{await service.deleteGoal(request.userId,parse(id,request.params.id));response.status(204).end();}catch(error){next(error);}});

router.post("/partners/study-sessions", async (request,response,next)=>{try{response.status(201).json(await service.createStudySession(request.userId,parse(schemas.partnerSession,request.body)));}catch(error){next(error);}});
router.post("/partners/study-sessions/:id/join", async (request,response,next)=>{try{response.json(await service.joinSession(request.userId,parse(id,request.params.id)));}catch(error){next(error);}});
router.post("/partners/study-sessions/:id/decline", async (request,response,next)=>{try{await service.declineSession(request.userId,parse(id,request.params.id));response.status(204).end();}catch(error){next(error);}});
router.post("/partners/study-sessions/:id/leave", async (request,response,next)=>{try{response.json(await service.leaveSession(request.userId,parse(id,request.params.id)));}catch(error){next(error);}});
router.post("/partners/study-sessions/:id/pause", async (request,response,next)=>{try{response.json(await service.pauseSession(request.userId,parse(id,request.params.id)));}catch(error){next(error);}});
router.post("/partners/study-sessions/:id/resume", async (request,response,next)=>{try{response.json(await service.resumeSession(request.userId,parse(id,request.params.id)));}catch(error){next(error);}});
router.post("/partners/study-sessions/:id/complete", async (request,response,next)=>{try{response.json(await service.completeSession(request.userId,parse(id,request.params.id)));}catch(error){next(error);}});
router.post("/partners/study-sessions/:id/cancel", async (request,response,next)=>{try{await service.cancelSession(request.userId,parse(id,request.params.id));response.status(204).end();}catch(error){next(error);}});

router.post("/partners/encouragement", encouragementLimiter, async (request,response,next)=>{try{await service.encouragement(request.userId,parse(schemas.encouragement,request.body).message);response.status(204).end();}catch(error){next(error);}});
router.get("/encouragements", async (request,response,next)=>{try{response.json(await encouragementService.available(request.userId));}catch(error){next(error);}});
router.get("/encouragements/manage", async (request,response,next)=>{try{response.json({settings:await encouragementService.getSettings(request.userId),messages:await encouragementService.list(request.userId)});}catch(error){next(error);}});
router.put("/encouragements/settings", async (request,response,next)=>{try{response.json(await encouragementService.updateSettings(request.userId,parse(schemas.encouragementSettings,request.body).enabled));}catch(error){next(error);}});
router.post("/encouragements", async (request,response,next)=>{try{response.status(201).json(await encouragementService.create(request.userId,parse(schemas.encouragementMessage,request.body).message));}catch(error){next(error);}});
router.put("/encouragements/:id", async (request,response,next)=>{try{const input=parse(schemas.encouragementMessage,request.body);response.json(await encouragementService.update(request.userId,parse(id,request.params.id),input.message,input.enabled));}catch(error){next(error);}});
router.delete("/encouragements/:id", async (request,response,next)=>{try{await encouragementService.remove(request.userId,parse(id,request.params.id));response.status(204).end();}catch(error){next(error);}});
router.get("/partners/notifications", async (request,response,next)=>{try{response.json(await service.listNotifications(request.userId));}catch(error){next(error);}});
router.delete("/partners/notifications", async (request,response,next)=>{try{await service.clearNotifications(request.userId);response.status(204).end();}catch(error){next(error);}});
router.post("/partners/notifications/:id/read", async (request,response,next)=>{try{response.json(await service.readNotification(request.userId,parse(id,request.params.id)));}catch(error){next(error);}});

module.exports = { partnerRouter: router };
