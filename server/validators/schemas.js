const { z } = require("zod");

const id = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date").refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}, "Use a valid date");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour HH:MM time");
const shortText = (maximum = 120) => z.string().trim().min(1).max(maximum);
const optionalText = (maximum = 2000) => z.string().trim().max(maximum).default("");
const priority = z.enum(["low", "medium", "high", "critical"]);
const workoutType = z.enum(["Strength", "Push", "Pull", "Legs", "Upper", "Lower", "Full Body", "Cardio", "Running", "Swimming", "Cycling", "Boxing", "Taekwondo", "Football", "Calisthenics", "Weightlifting", "Other", "Rest"]);
const timeZone = z.string().trim().min(1).max(100).refine((value) => {
    try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return true; } catch { return false; }
}, "Use a valid IANA time zone");

const preferences = z.object({
    student: z.boolean(),
    gym: z.boolean(),
    partTimeJob: z.boolean(),
}).strict().refine((value) => value.student || value.gym || value.partTimeJob, "Select at least one feature");

const subjectInput = z.object({
    name: shortText(120),
    targetWeeklyHours: z.number().min(0).max(168).default(0),
    targetMonthlyHours: z.number().min(0).max(744).default(0),
    priority: priority.default("medium"),
    color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#72c59b"),
}).strict();

const exerciseInput = z.object({
    id: id.optional(),
    name: shortText(120),
    sets: z.number().int().min(1).max(30),
    reps: shortText(40),
    notes: optionalText(500),
}).strict();

const workoutDayInput = z.object({
    id: id.optional(),
    dayOfWeek: z.number().int().min(1).max(7),
    workoutName: shortText(120),
    workoutType,
    startTime: time,
    endTime: time,
    exercises: z.array(exerciseInput).max(100).default([]),
}).strict();

const workoutTemplateInput = z.object({
    name: shortText(120),
    recurring: z.boolean().default(true),
    startsOn: date.optional(),
    days: z.array(workoutDayInput).min(1).max(7),
}).strict();

const jobInput = z.object({
    jobName: shortText(120),
    company: shortText(160),
    hourlyTarget: z.number().min(0).max(168).nullable().optional(),
}).strict();

const scheduleInput = z.object({ date, startTime: time, endTime: time }).strict();

const schemas = {
    register: z.object({
        firstName: shortText(80),
        lastName: shortText(80),
        username: z.string().trim().min(3).max(40).regex(/^[a-zA-Z0-9_]+$/, "Username may contain letters, numbers, and underscores").optional(),
        email: z.string().trim().email().max(320),
        password: z.string().min(10).max(200),
        confirmPassword: z.string().min(10).max(200),
        timeZone: timeZone.optional(),
    }).strict().refine((value) => value.password === value.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] }),
    login: z.object({ email: z.string().trim().email().max(320), password: z.string().min(1).max(200) }).strict(),
    heartbeat: z.object({ timeZone: timeZone.optional() }).strict(),
    profile: z.object({ firstName: shortText(80), lastName: shortText(80), preferences }).strict(),
    onboarding: z.object({
        preferences,
        subjects: z.array(subjectInput).max(50).default([]),
        workoutTemplate: workoutTemplateInput.nullable().optional(),
        job: jobInput.nullable().optional(),
    }).strict(),
    preferences,
    subjectInput,
    workoutTemplateInput,
    jobInput,
    eventInput: z.object({
        title: shortText(120), type: z.enum(["gym", "study", "homework", "job", "general"]), date, startTime: time, endTime: time,
        completed: z.boolean().default(false), notes: optionalText(2000),
        activityDetails: z.object({
            workoutType: workoutType.optional(), subjectId: id.optional(), subject: z.string().trim().max(120).optional(), priority: priority.optional(),
        }).strict().default({}),
        metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
    }).strict().superRefine((value, context) => {
        if (value.type === "study" && !value.activityDetails.subjectId) context.addIssue({ code:"custom", path:["activityDetails","subjectId"], message:"Subject is required for Study events" });
    }),
    completed: z.object({ completed: z.boolean() }).strict(),
    studySessionInput: z.object({ subjectId: id, ...scheduleInput.shape, actualMinutes: z.number().int().min(0).max(1440), completed: z.boolean(), notes: optionalText(2000) }).strict().refine((value)=>!value.completed||value.actualMinutes>0,{message:"Completed Study sessions require actual time",path:["actualMinutes"]}),
    homeworkInput: z.object({
        title: shortText(160), subject: z.string().trim().max(120).default(""), description: optionalText(5000), dueDate: date, dueTime: time,
        priority, estimatedMinutes: z.number().int().min(1).max(1440), status: z.enum(["todo", "in-progress", "completed"]), completedDate: date.nullable().optional(),
    }).strict().superRefine((value, context) => {
        const dueMinutes = Number(value.dueTime.slice(0, 2)) * 60 + Number(value.dueTime.slice(3));
        if (value.estimatedMinutes > dueMinutes) context.addIssue({ code:"custom", path:["estimatedMinutes"], message:"Estimated time must fit before the due time on the same day" });
    }),
    workoutInput: z.object({ name: shortText(120), workoutType, ...scheduleInput.shape, completed: z.boolean().default(false), notes: optionalText(2000) }).strict(),
    workoutCompletion: z.object({
        durationMinutes: z.number().int().min(1).max(1440), startedAt: z.string().datetime().optional(),
        exercises: z.array(z.object({ name: shortText(120), sets: z.array(z.object({ reps: z.number().int().min(1).max(1000), weight: z.number().min(0).max(100000) }).strict()).max(30) }).strict()).max(100).default([]),
        notes: optionalText(2000),
    }).strict(),
    workSessionInput: z.object({ ...scheduleInput.shape, actualMinutes: z.number().int().min(0).max(1440), completed: z.boolean(), notes: optionalText(2000), tasksCompleted: z.array(shortText(240)).max(50).default([]) }).strict().refine((value)=>!value.completed||value.actualMinutes>0,{message:"Completed work sessions require actual time",path:["actualMinutes"]}),
    taskCreate: z.object({ title: shortText(240), category: z.enum(["Study", "Homework", "Part-Time Job", "Gym", "General"]), completed: z.boolean().default(false), dueDate: date.nullable().optional() }).strict(),
    taskPatch: z.object({ title: shortText(240).optional(), category: z.enum(["Study", "Homework", "Part-Time Job", "Gym", "General"]).optional(), completed: z.boolean().optional(), dueDate: date.nullable().optional() }).strict().refine((value) => Object.keys(value).length > 0, "Provide at least one field"),
    pomodoroSettings: z.object({ focusDuration: z.number().int().min(1).max(43200), shortBreakDuration: z.number().int().min(1).max(43200), longBreakDuration: z.number().int().min(1).max(43200) }).strict(),
    activitySessionCreate: z.object({
        activity: z.enum(["study", "homework", "job", "gym"]), subjectId: z.preprocess((value) => value === "" ? undefined : value, id.optional()), subject: z.string().trim().max(120).optional(), topic: z.string().trim().max(240).optional(),
        plannedDuration: z.number().int().min(1).max(86400), actualDuration: z.number().int().min(0).max(86400).optional(), status: z.enum(["running", "paused", "completed", "cancelled"]).optional(),
        sessionType: z.enum(["focus", "shortBreak", "longBreak", "activity"]).optional(), pomodoroNumber: z.number().int().min(0).max(100000).optional(),
        startedAt: z.string().datetime().optional(), activeStartedAt: z.string().datetime().nullable().optional(), completedAt: z.string().datetime().nullable().optional(),
    }).strict(),
    partnerInvite: z.object({ identifier: z.string().trim().min(3).max(320) }).strict(),
    workoutMaterialization: z.object({ start: date.optional(), end: date.optional() }).strict(),
    partnerSettings: z.object({
        shareStudyTime: z.boolean(), shareStudySubjects: z.boolean(), shareHomeworkProgress: z.boolean(), shareGymProgress: z.boolean(),
        shareJobHours: z.boolean(), shareCurrentActivity: z.boolean(), shareCalendar: z.boolean(), shareDetailedTasks: z.boolean(), shareDetailedWorkouts: z.boolean(),
    }).strict(),
    partnerGoal: z.object({
        title: shortText(160), type: z.enum(["study_minutes", "pomodoros", "homework_completed", "custom"]), target: z.number().positive().max(1000000),
        manualProgress: z.number().min(0).max(1000000).optional(), startDate: date, endDate: date,
    }).strict().refine((value) => value.endDate >= value.startDate, "Goal end date must be on or after its start date"),
    partnerSession: z.object({ subjectId: id.optional(), durationMinutes: z.number().int().min(1).max(720) }).strict(),
    encouragement: z.object({ message: z.string().trim().min(1).max(240) }).strict(),
    encouragementMessage: z.object({ message: z.string().trim().min(1).max(240), enabled: z.boolean().default(true) }).strict(),
    encouragementSettings: z.object({ enabled: z.boolean() }).strict(),
};
schemas.activitySessionUpdate = schemas.activitySessionCreate.partial().strict().refine((value) => Object.keys(value).length > 0, "Provide at least one field");

function parse(schema, value) {
    const result = schema.safeParse(value);
    if (result.success) return result.data;
    const message = result.error.issues[0]?.message || "Invalid request";
    throw Object.assign(new Error(message), { status: 400 });
}

module.exports = { schemas, parse, id, date, time };
