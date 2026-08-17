const express = require("express");
const service = require("../services/partnerService");
const { schemas, parse, id } = require("../validators/schemas");

const router = express.Router();

router.get("/partners", async (request,response,next)=>{try{response.json(await service.getState(request.userId));}catch(error){next(error);}});
router.get("/partners/me", async (request,response,next)=>{try{response.json(await service.getState(request.userId));}catch(error){next(error);}});
router.get("/partners/invitations", async (request,response,next)=>{try{const state=await service.getState(request.userId);response.json({incoming:state.incomingInvitations,outgoing:state.outgoingInvitations});}catch(error){next(error);}});
router.post("/partners/invite", async (request,response,next)=>{try{response.status(201).json(await service.invite(request.userId,parse(schemas.partnerInvite,request.body).identifier));}catch(error){next(error);}});
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
router.delete("/partners/goals/:id", async (request,response,next)=>{try{await service.deleteGoal(request.userId,parse(id,request.params.id));response.status(204).end();}catch(error){next(error);}});

router.post("/partners/study-sessions", async (request,response,next)=>{try{response.status(201).json(await service.createStudySession(request.userId,parse(schemas.partnerSession,request.body)));}catch(error){next(error);}});
router.post("/partners/study-sessions/:id/join", async (request,response,next)=>{try{response.json(await service.joinSession(request.userId,parse(id,request.params.id)));}catch(error){next(error);}});
router.post("/partners/study-sessions/:id/decline", async (request,response,next)=>{try{await service.declineSession(request.userId,parse(id,request.params.id));response.status(204).end();}catch(error){next(error);}});
router.post("/partners/study-sessions/:id/leave", async (request,response,next)=>{try{response.json(await service.leaveSession(request.userId,parse(id,request.params.id)));}catch(error){next(error);}});
router.post("/partners/study-sessions/:id/pause", async (request,response,next)=>{try{response.json(await service.pauseSession(request.userId,parse(id,request.params.id)));}catch(error){next(error);}});
router.post("/partners/study-sessions/:id/resume", async (request,response,next)=>{try{response.json(await service.resumeSession(request.userId,parse(id,request.params.id)));}catch(error){next(error);}});
router.post("/partners/study-sessions/:id/complete", async (request,response,next)=>{try{response.json(await service.completeSession(request.userId,parse(id,request.params.id)));}catch(error){next(error);}});
router.post("/partners/study-sessions/:id/cancel", async (request,response,next)=>{try{await service.cancelSession(request.userId,parse(id,request.params.id));response.status(204).end();}catch(error){next(error);}});

router.post("/partners/encouragement", async (request,response,next)=>{try{await service.encouragement(request.userId,parse(schemas.encouragement,request.body).message);response.status(204).end();}catch(error){next(error);}});
router.get("/partners/notifications", async (request,response,next)=>{try{response.json(await service.listNotifications(request.userId));}catch(error){next(error);}});
router.delete("/partners/notifications", async (request,response,next)=>{try{await service.clearNotifications(request.userId);response.status(204).end();}catch(error){next(error);}});
router.post("/partners/notifications/:id/read", async (request,response,next)=>{try{response.json(await service.readNotification(request.userId,parse(id,request.params.id)));}catch(error){next(error);}});

module.exports = { partnerRouter: router };
