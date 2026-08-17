const express=require("express");
const service=require("../services/productivityService");
const {schemas,parse,id}=require("../validators/schemas");
const router=express.Router();
function crud(path,schema,create,update,remove){router.post(path,async(req,res,next)=>{try{res.status(201).json(await create(req.userId,parse(schema,req.body)));}catch(e){next(e);}});router.put(`${path}/:id`,async(req,res,next)=>{try{res.json(await update(req.userId,parse(id,req.params.id),parse(schema,req.body)));}catch(e){next(e);}});router.delete(`${path}/:id`,async(req,res,next)=>{try{await remove(req.userId,parse(id,req.params.id));res.status(204).end();}catch(e){next(e);}});}
router.get("/productivity",async(req,res,next)=>{try{res.json(await service.getData(req.userId));}catch(e){next(e);}});
crud("/subjects",schemas.subjectInput,service.createSubject,service.updateSubject,service.deleteSubject);
crud("/study-sessions",schemas.studySessionInput,service.createStudySession,service.updateStudySession,service.deleteStudySession);
crud("/homework-tasks",schemas.homeworkInput,service.createHomework,service.updateHomework,service.deleteHomework);
router.put("/part-time-job",async(req,res,next)=>{try{res.json(await service.upsertJob(req.userId,parse(schemas.jobInput,req.body)));}catch(e){next(e);}});
crud("/work-sessions",schemas.workSessionInput,service.createWorkSession,service.updateWorkSession,service.deleteWorkSession);
router.get("/tasks",async(req,res,next)=>{try{res.json(await service.listTasks(req.userId));}catch(e){next(e);}});
router.post("/tasks",async(req,res,next)=>{try{res.status(201).json(await service.createTask(req.userId,parse(schemas.taskCreate,req.body)));}catch(e){next(e);}});
router.patch("/tasks/:id",async(req,res,next)=>{try{res.json(await service.updateTask(req.userId,parse(id,req.params.id),parse(schemas.taskPatch,req.body)));}catch(e){next(e);}});
router.delete("/tasks/:id",async(req,res,next)=>{try{await service.deleteTask(req.userId,parse(id,req.params.id));res.status(204).end();}catch(e){next(e);}});
module.exports={productivityRouter:router};
