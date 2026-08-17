require("dotenv").config();
const path=require("path");
const {createServer}=require("http");
const express=require("express");
const cors=require("cors");
const helmet=require("helmet");
const session=require("express-session");
const {getPool,closePool}=require("./server/db/pool");
const {migrate}=require("./server/db/migrate");
const {PostgresSessionStore}=require("./server/db/sessionStore");
const {frontendOrigins,sessionCookieOptions}=require("./server/config");
const {attachSocketServer,closeSocketServer,realtimeMutationMiddleware}=require("./server/realtime/socketServer");
const {authRouter}=require("./server/routes/authRoutes");
const {plannerRouter}=require("./server/routes/plannerRoutes");
const {productivityRouter}=require("./server/routes/productivityRoutes");
const {workoutRouter}=require("./server/routes/workoutRoutes");
const {sessionRouter}=require("./server/routes/sessionRoutes");
const {summaryRouter}=require("./server/routes/summaryRoutes");
const {partnerRouter}=require("./server/routes/partnerRoutes");
const {requireAuth}=require("./server/middleware/auth");
const {notFound,errorHandler}=require("./server/middleware/errors");

if(!process.env.SESSION_SECRET||process.env.SESSION_SECRET.length<32)throw new Error("SESSION_SECRET must be configured with at least 32 characters");

const app=express();
const port=Number(process.env.PORT)||5000;
const frontendDirectory=path.join(__dirname,"frontend","dist");
const configuredOrigins=frontendOrigins();
const allowedOrigins=new Set(configuredOrigins);

app.set("trust proxy",1);
app.disable("x-powered-by");
app.use(helmet({contentSecurityPolicy:process.env.NODE_ENV==="production"?undefined:false,crossOriginResourcePolicy:{policy:"same-site"}}));
app.use(cors((request,callback)=>{
    const origin=request.get("origin"),sameOrigin=`${request.protocol}://${request.get("host")}`;
    callback(null,{credentials:true,origin:!origin||origin===sameOrigin||allowedOrigins.has(origin.replace(/\/$/,""))});
}));
app.use(express.json({limit:"64kb"}));
app.use((request,response,next)=>{
    if(["GET","HEAD","OPTIONS"].includes(request.method))return next();
    const origin=request.get("origin");
    if(!origin)return next();
    const sameOrigin=`${request.protocol}://${request.get("host")}`;
    if(origin===sameOrigin||allowedOrigins.has(origin.replace(/\/$/,"")))return next();
    response.status(403).json({message:"Request origin is not allowed"});
});
const sessionMiddleware=session({
    name:process.env.SESSION_COOKIE_NAME||"pd.sid",
    secret:process.env.SESSION_SECRET,
    store:new PostgresSessionStore(),
    resave:false,
    saveUninitialized:false,
    rolling:true,
    cookie:sessionCookieOptions(),
});
app.use(sessionMiddleware);

app.get("/api/health",async(_request,response)=>{try{await getPool().query("SELECT 1");response.json({status:"ok"});}catch(error){console.error("Health check failed",error);response.status(503).json({status:"unavailable"});}});
app.use("/api/auth",authRouter);
app.use("/api",requireAuth,realtimeMutationMiddleware,partnerRouter,plannerRouter,productivityRouter,workoutRouter,sessionRouter,summaryRouter);

app.use(express.static(frontendDirectory,{index:false,maxAge:process.env.NODE_ENV==="production"?"1h":0}));
app.get(/^(?!\/api(?:\/|$)).*/,(_request,response)=>response.sendFile(path.join(frontendDirectory,"index.html")));
app.use(notFound);
app.use(errorHandler);

function createHttpRuntime(){const httpServer=createServer(app);const io=attachSocketServer(httpServer,sessionMiddleware,configuredOrigins);return{httpServer,io};}

if(require.main===module){
    const{httpServer}=createHttpRuntime();
    const start=async()=>{
        try{
            await migrate();
            httpServer.listen(port,()=>console.log(`Jilora server listening on port ${port}`));
        }catch(error){
            console.error("Database migration failed",{message:error.message});
            await closeSocketServer();
            await closePool();
            process.exitCode=1;
        }
    };
    void start();
    let shuttingDown=false;
    const shutdown=async(signal)=>{if(shuttingDown)return;shuttingDown=true;console.log(`${signal} received; shutting down`);const force=setTimeout(()=>process.exit(1),10000);force.unref();try{await closeSocketServer();if(httpServer.listening)await new Promise((resolve)=>httpServer.close(resolve));await closePool();clearTimeout(force);process.exit(0);}catch(error){console.error("Graceful shutdown failed",{message:error.message});process.exit(1);}};
    process.on("SIGINT",()=>shutdown("SIGINT"));
    process.on("SIGTERM",()=>shutdown("SIGTERM"));
    process.on("unhandledRejection",(error)=>console.error("Unhandled promise rejection",{message:error instanceof Error?error.message:String(error)}));
    process.on("uncaughtException",(error)=>{console.error("Uncaught exception",{message:error.message});void shutdown("uncaughtException");});
}

module.exports=app;
module.exports.createHttpRuntime=createHttpRuntime;
module.exports.sessionMiddleware=sessionMiddleware;
