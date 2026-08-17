const express=require("express");
const {date,parse}=require("../validators/schemas");
const dashboard=require("../services/dashboardService");
const analytics=require("../services/analyticsService");
const router=express.Router();
router.get("/dashboard",async(req,res,next)=>{try{res.json(await dashboard.dashboard(req.userId));}catch(e){next(e);}});
router.get("/analytics",async(req,res,next)=>{try{res.json(await analytics.analytics(req.userId,req.query.start?parse(date,req.query.start):undefined,req.query.end?parse(date,req.query.end):undefined));}catch(e){next(e);}});
module.exports={summaryRouter:router};
