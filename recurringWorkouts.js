const crypto = require("crypto");
const express = require("express");
const fs = require("fs");
const path = require("path");
const { addCalendarDays, currentDateKey, dateKey, parseDateKey, validDateKey } = require("./dateUtils");

const dataDirectory = process.env.DASHBOARD_DATA_DIR ? path.resolve(process.env.DASHBOARD_DATA_DIR) : path.join(__dirname, "data");
const files = {
    events: path.join(dataDirectory, "events.json"),
    workouts: path.join(dataDirectory, "workouts.json"),
    templates: path.join(dataDirectory, "workout-templates.json"),
    schedules: path.join(dataDirectory, "workout-schedules.json"),
    logs: path.join(dataDirectory, "workout-logs.json"),
    sessions: path.join(dataDirectory, "sessions.json"),
};

const workoutTypes = new Set(["Push", "Pull", "Legs", "Upper", "Lower", "Full Body", "Cardio", "Rest"]);

function ensureFile(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath) || !fs.readFileSync(filePath, "utf8").trim()) fs.writeFileSync(filePath, "[]\n");
}

Object.values(files).forEach(ensureFile);

function read(filePath) { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
function write(filePath, value) {
    const temporaryFile = `${filePath}.tmp`;
    fs.writeFileSync(temporaryFile, JSON.stringify(value, null, 2));
    fs.renameSync(temporaryFile, filePath);
}
function fail(message, status = 400) { const error = new Error(message); error.status = status; throw error; }
function text(value, field, max = 120) { if (typeof value !== "string") fail(`${field} must be text`); const result = value.trim(); if (!result) fail(`${field} is required`); if (result.length > max) fail(`${field} must be under ${max} characters`); return result; }
function validDate(value) { try { return validDateKey(value, "Date"); } catch (error) { fail(error.message); } }
function parseDate(value) { try { return parseDateKey(value, "Date"); } catch (error) { fail(error.message); } }
function addDays(date, amount) { return addCalendarDays(date, amount); }
function timeToMinutes(value) { const result = String(value || ""); if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(result)) fail("Choose a valid time"); const [hours, minutes] = result.split(":").map(Number); return (hours * 60) + minutes; }
function minutesToTime(value) { const minutes = Math.max(0, Math.min(1439, Math.round(value))); return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`; }
function durationFromTimes(startTime, endTime) { const duration = timeToMinutes(endTime) - timeToMinutes(startTime); if (duration <= 0) fail("End time must be later than start time"); return duration; }
function deterministicId(prefix, value) { return `${prefix}_${crypto.createHash("sha256").update(value).digest("hex").slice(0, 32)}`; }
function defaultRange() { const today = parseDate(currentDateKey()); return { start: dateKey(addDays(today, -7)), end: dateKey(addDays(today, 42)) }; }

function normalizeExercise(exercise, index) {
    const name = text(exercise?.name, `Exercise ${index + 1}`, 100);
    const sets = Number(exercise?.sets || 1);
    const reps = String(exercise?.reps || "").trim();
    if (!Number.isInteger(sets) || sets < 1 || sets > 30) fail("Exercise sets must be between 1 and 30");
    if (!reps || reps.length > 30) fail("Exercise reps are required");
    if (exercise?.notes !== undefined && typeof exercise.notes !== "string") fail("Exercise notes must be text");
    const notes = String(exercise?.notes || "").trim();
    if (notes.length > 300) fail("Exercise notes must be under 300 characters");
    return { id: String(exercise?.id || deterministicId("exercise", `${name}:${index}`)), name, sets, reps, notes };
}

function normalizeDay(day, index) {
    const dayOfWeek = Number(day?.dayOfWeek);
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) fail("dayOfWeek must use 1 for Monday through 7 for Sunday");
    const workoutName = text(day?.workoutName, `Workout name for day ${dayOfWeek}`);
    const workoutType = String(day?.workoutType || workoutName);
    if (!workoutTypes.has(workoutType)) fail("Choose a valid workout type");
    const startTime = String(day?.startTime || "18:00");
    const endTime = String(day?.endTime || "19:00");
    const plannedMinutes = durationFromTimes(startTime, endTime);
    if (day?.exercises !== undefined && !Array.isArray(day.exercises)) fail("Exercises must be a list");
    if (day?.exercises?.length > 100) fail("A workout can contain at most 100 exercises");
    const exercises = Array.isArray(day?.exercises) ? day.exercises.map(normalizeExercise) : [];
    return { id: String(day?.id || deterministicId("day", `${dayOfWeek}:${workoutName}:${index}`)), dayOfWeek, workoutName, workoutType, startTime, endTime, plannedMinutes, exercises };
}

function normalizeTemplate(body, existing = {}) {
    const name = text(body.name ?? existing.name, "Template name");
    const days = Array.isArray(body.days ?? existing.days) ? (body.days ?? existing.days).map(normalizeDay) : [];
    if (!days.length) fail("Add at least one recurring workout day");
    if (new Set(days.map((day) => day.dayOfWeek)).size !== days.length) fail("Each day of the week can only have one workout assignment");
    const recurring = body.recurring ?? existing.recurring ?? true;
    if (typeof recurring !== "boolean") fail("Recurring must be a boolean");
    return { name, recurring, startsOn: validDate(body.startsOn ?? existing.startsOn ?? currentDateKey()), days };
}

function upsertEvent(workout) {
    const events = read(files.events);
    const eventId = workout.eventId || deterministicId("event", workout.id);
    const event = {
        id: eventId,
        title: workout.name,
        type: "gym",
        date: workout.date,
        startTime: workout.startTime,
        endTime: workout.endTime,
        duration: workout.plannedMinutes,
        completed: Boolean(workout.completed),
        notes: workout.notes || "",
        metadata: { entityType: "workout", entityId: workout.id, templateId: workout.templateId || null, scheduleId: workout.scheduleId || null, recurring: Boolean(workout.templateId) },
        createdAt: workout.createdAt,
        updatedAt: new Date().toISOString(),
    };
    const index = events.findIndex((item) => item.id === eventId);
    if (index === -1) events.push(event); else events[index] = { ...events[index], ...event };
    write(files.events, events);
    return event;
}

function removeEvent(eventId) { write(files.events, read(files.events).filter((event) => event.id !== eventId)); }

// dayOfWeek uses ISO convention: 1 is Monday and 7 is Sunday.
function instanceId(templateId, date, dayOfWeek) { return deterministicId("scheduled", `${templateId}:${dayOfWeek}:${date}`); }

function ensureRecurringSchedule(startValue, endValue) {
    const defaults = defaultRange();
    const start = parseDate(startValue || defaults.start);
    const end = parseDate(endValue || defaults.end);
    if (start > end) fail("Schedule start must be before schedule end");
    if ((end.getTime() - start.getTime()) / 86400000 > 366) fail("Schedule ranges cannot exceed 366 days");
    const templates = read(files.templates);
    const schedules = read(files.schedules).filter((schedule) => schedule.active !== false);
    const workouts = read(files.workouts);
    let changed = false;
    for (let date = new Date(start); date <= end; date = addDays(date, 1)) {
        const dayOfWeek = date.getDay() || 7;
        schedules.filter((schedule) => schedule.dayOfWeek === dayOfWeek).forEach((schedule) => {
            const template = templates.find((item) => item.id === schedule.templateId);
            if (!template || template.recurring === false) return;
            const workoutDate = dateKey(date);
            if (workoutDate < (template.startsOn || String(template.createdAt || "").slice(0, 10))) return;
            const id = instanceId(template.id, workoutDate, dayOfWeek);
            const day = template.days.find((item) => item.id === schedule.dayId) || template.days.find((item) => item.dayOfWeek === dayOfWeek);
            if (!day) return;
            // The second lookup adopts instances created by older schedule-ID based builds.
            let workout = workouts.find((item) => item.id === id) || workouts.find((item) => item.source === "recurring" && item.templateId === template.id && item.date === workoutDate);
            if (!workout) {
                const now = new Date().toISOString();
                workout = { id, eventId: deterministicId("event", id), templateId: template.id, scheduleId: schedule.id, source: "recurring", name: day.workoutName, workoutType: day.workoutType, date: workoutDate, startTime: day.startTime, endTime: day.endTime, plannedMinutes: day.plannedMinutes, actualMinutes: 0, completed: false, status: "planned", notes: "", exercises: day.exercises, createdAt: now, updatedAt: now };
                workouts.push(workout);
                upsertEvent(workout);
                changed = true;
            } else if (workout.status === "planned" && workoutDate >= currentDateKey() && (workout.name !== day.workoutName || workout.workoutType !== day.workoutType || workout.startTime !== day.startTime || workout.endTime !== day.endTime || workout.plannedMinutes !== day.plannedMinutes || workout.scheduleId !== schedule.id || JSON.stringify(workout.exercises) !== JSON.stringify(day.exercises))) {
                Object.assign(workout, { scheduleId: schedule.id, name: day.workoutName, workoutType: day.workoutType, startTime: day.startTime, endTime: day.endTime, plannedMinutes: day.plannedMinutes, exercises: day.exercises, updatedAt: new Date().toISOString() });
                upsertEvent(workout);
                changed = true;
            }
        });
    }
    if (changed) write(files.workouts, workouts);
    return workouts.filter((workout) => workout.status !== "cancelled" && workout.date >= dateKey(start) && workout.date <= dateKey(end));
}

function parseLogExercises(value) {
    if (!Array.isArray(value)) return [];
    return value.slice(0, 100).map((exercise) => ({
        name: text(exercise?.name, "Logged exercise", 100),
        sets: Array.isArray(exercise?.sets) ? exercise.sets.slice(0, 30).map((set) => ({ reps: Number(set.reps), weight: Number(set.weight || 0) })).filter((set) => Number.isFinite(set.reps) && set.reps > 0 && Number.isFinite(set.weight) && set.weight >= 0) : [],
    }));
}

function validTimestamp(value, field) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) fail(`${field} must be an ISO timestamp`);
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) fail(`${field} is invalid`);
    return parsed.toISOString();
}

function workoutNotes(value) {
    if (value === undefined || value === null) return "";
    if (typeof value !== "string") fail("Workout notes must be text");
    const notes = value.trim();
    if (notes.length > 2000) fail("Workout notes must be under 2000 characters");
    return notes;
}

function periodStats(workouts, logs, start, end) {
    const filtered = workouts.filter((workout) => workout.status !== "cancelled" && workout.date >= start && workout.date <= end);
    const completed = filtered.filter((workout) => workout.status === "completed" || workout.completed);
    const logByWorkout = new Map(logs.map((log) => [log.scheduledWorkoutId, log]));
    const actualMinutes = completed.reduce((sum, workout) => sum + (workout.actualMinutes || Math.round((logByWorkout.get(workout.id)?.duration || 0) / 60)), 0);
    return { planned: filtered.length, completed: completed.length, missed: filtered.filter((workout) => workout.date < currentDateKey() && !completed.includes(workout)).length, completionRate: filtered.length ? Math.round((completed.length / filtered.length) * 1000) / 10 : 0, plannedMinutes: filtered.reduce((sum, workout) => sum + workout.plannedMinutes, 0), actualMinutes, totalWorkoutTimeMinutes: actualMinutes };
}

function createRecurringWorkoutRouter() {
    const router = express.Router();

    router.get("/workout-templates", (_request, response) => { response.json(read(files.templates)); });

    router.post("/workout-templates", (request, response, next) => {
        try {
            const now = new Date().toISOString();
            const normalized = normalizeTemplate(request.body);
            const templates = read(files.templates);
            if (templates.length) return next(Object.assign(new Error("Only one weekly workout template is supported"), { status: 409 }));
            const template = { id: crypto.randomUUID(), ...normalized, createdAt: now, updatedAt: now };
            templates.push(template); write(files.templates, templates);
            const schedules = read(files.schedules);
            normalized.days.forEach((day) => schedules.push({ id: crypto.randomUUID(), templateId: template.id, dayId: day.id, dayOfWeek: day.dayOfWeek, active: true }));
            write(files.schedules, schedules);
            ensureRecurringSchedule();
            response.status(201).json(template);
        } catch (error) { next(error); }
    });

    router.put("/workout-templates/:id", (request, response, next) => {
        try {
            const templates = read(files.templates);
            const template = templates.find((item) => item.id === request.params.id);
            if (!template) return next(Object.assign(new Error("Workout template not found"), { status: 404 }));
            const normalized = normalizeTemplate(request.body, template);
            Object.assign(template, normalized, { updatedAt: new Date().toISOString() });
            write(files.templates, templates);
            const workouts = read(files.workouts);
            const obsolete = workouts.filter((workout) => workout.templateId === template.id && workout.source === "recurring" && workout.status === "planned" && workout.date >= currentDateKey());
            obsolete.forEach((workout) => removeEvent(workout.eventId));
            write(files.workouts, workouts.filter((workout) => !obsolete.includes(workout)));
            const schedules = read(files.schedules).filter((schedule) => schedule.templateId !== template.id);
            normalized.days.forEach((day) => schedules.push({ id: crypto.randomUUID(), templateId: template.id, dayId: day.id, dayOfWeek: day.dayOfWeek, active: true }));
            write(files.schedules, schedules);
            ensureRecurringSchedule();
            response.json(template);
        } catch (error) { next(error); }
    });

    router.delete("/workout-templates/:id", (request, response, next) => {
        try {
            const templates = read(files.templates);
            const template = templates.find((item) => item.id === request.params.id);
            if (!template) return next(Object.assign(new Error("Workout template not found"), { status: 404 }));
            const workouts = read(files.workouts);
            const futurePlanned = workouts.filter((workout) => workout.templateId === template.id && workout.status === "planned" && workout.date >= currentDateKey());
            futurePlanned.forEach((workout) => removeEvent(workout.eventId));
            write(files.workouts, workouts.filter((workout) => !futurePlanned.includes(workout)));
            write(files.schedules, read(files.schedules).filter((schedule) => schedule.templateId !== template.id));
            write(files.templates, templates.filter((item) => item.id !== template.id));
            response.status(204).end();
        } catch (error) { next(error); }
    });

    router.get("/workout-schedule", (request, response, next) => {
        try { response.json(ensureRecurringSchedule(request.query.start, request.query.end)); } catch (error) { next(error); }
    });

    router.get("/workouts", (_request, response) => { response.json(read(files.workouts).filter((workout) => workout.status !== "cancelled").sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))); });
    router.get("/workout-logs", (_request, response) => { response.json(read(files.logs)); });

    router.post("/workouts/:id/complete", (request, response, next) => {
        try {
            const workouts = read(files.workouts);
            const workout = workouts.find((item) => item.id === request.params.id);
            if (!workout) return next(Object.assign(new Error("Workout not found"), { status: 404 }));
            if (workout.status === "cancelled") return next(Object.assign(new Error("Cancelled workouts cannot be completed"), { status: 409 }));
            if (workout.status === "completed" || workout.completed) return next(Object.assign(new Error("Workout is already completed"), { status: 409 }));
            const duration = Number(request.body.duration || 0);
            const durationMinutes = Number(request.body.durationMinutes || request.body.actualMinutes || Math.round(duration / 60));
            if (!Number.isFinite(durationMinutes) || durationMinutes <= 0 || durationMinutes > 1440) return next(Object.assign(new Error("Workout duration must be between 1 and 1440 minutes"), { status: 400 }));
            const completedAt = new Date().toISOString();
            const startedAt = validTimestamp(request.body.startedAt, "startedAt");
            if (new Date(startedAt).getTime() > new Date(completedAt).getTime()) return next(Object.assign(new Error("startedAt cannot be after completion"), { status: 400 }));
            const elapsedSeconds = Math.floor((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000);
            if (Math.round(durationMinutes * 60) > elapsedSeconds + 5) return next(Object.assign(new Error("Workout duration cannot exceed elapsed time"), { status: 400 }));
            const logs = read(files.logs);
            if (logs.some((log) => log.scheduledWorkoutId === workout.id)) return next(Object.assign(new Error("Workout already has a completion log"), { status: 409 }));
            const log = { id: crypto.randomUUID(), scheduledWorkoutId: workout.id, startedAt, completedAt, duration: Math.round(durationMinutes * 60), exercises: parseLogExercises(request.body.exercises), notes: workoutNotes(request.body.notes) };
            logs.push(log); write(files.logs, logs);
            Object.assign(workout, { completed: true, status: "completed", actualMinutes: Math.round(durationMinutes), completedAt: log.completedAt, notes: log.notes, updatedAt: new Date().toISOString() });
            write(files.workouts, workouts); upsertEvent(workout);
            const sessions = read(files.sessions); sessions.push({ id: crypto.randomUUID(), activity: "gym", subjectId: "", subject: "", topic: workout.name, plannedDuration: Math.round(workout.plannedMinutes * 60), actualDuration: Math.round(durationMinutes * 60), duration: Math.round(durationMinutes), status: "completed", sessionType: "activity", startedAt: log.startedAt, completedAt: log.completedAt, workoutId: workout.id, createdAt: log.completedAt, updatedAt: log.completedAt }); write(files.sessions, sessions);
            response.json({ workout, log });
        } catch (error) { next(error); }
    });

    router.post("/workouts/:id/reopen", (request, response, next) => {
        try {
            const workouts = read(files.workouts);
            const workout = workouts.find((item) => item.id === request.params.id);
            if (!workout) return next(Object.assign(new Error("Workout not found"), { status: 404 }));
            if (workout.status !== "completed" && !workout.completed) return response.json(workout);
            Object.assign(workout, { completed: false, status: "planned", actualMinutes: 0, completedAt: null, updatedAt: new Date().toISOString() });
            write(files.workouts, workouts);
            write(files.logs, read(files.logs).filter((log) => log.scheduledWorkoutId !== workout.id));
            write(files.sessions, read(files.sessions).filter((session) => session.workoutId !== workout.id));
            upsertEvent(workout);
            response.json(workout);
        } catch (error) { next(error); }
    });

    router.get("/workouts/analytics", (request, response, next) => {
        try {
            const defaults = defaultRange();
            const start = request.query.start ? validDate(request.query.start) : defaults.start;
            const end = request.query.end ? validDate(request.query.end) : defaults.end;
            ensureRecurringSchedule(start, end);
            const workouts = read(files.workouts); const logs = read(files.logs); const today = parseDate(currentDateKey());
            const weekStart = dateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - (today.getDay() || 7) + 1));
            const lastWeekStart = dateKey(addDays(parseDate(weekStart), -7));
            const monthStart = dateKey(new Date(today.getFullYear(), today.getMonth(), 1));
            const datedWorkouts = workouts.filter((workout) => workout.date <= currentDateKey());
            const overallStart = datedWorkouts.length ? datedWorkouts.reduce((earliest, workout) => workout.date < earliest ? workout.date : earliest, datedWorkouts[0].date) : currentDateKey();
            response.json({ range: periodStats(workouts, logs, start, end), thisWeek: periodStats(workouts, logs, weekStart, dateKey(addDays(parseDate(weekStart), 6))), lastWeek: periodStats(workouts, logs, lastWeekStart, dateKey(addDays(parseDate(lastWeekStart), 6))), thisMonth: periodStats(workouts, logs, monthStart, dateKey(new Date(today.getFullYear(), today.getMonth() + 1, 0))), overall: periodStats(datedWorkouts, logs, overallStart, currentDateKey()), byWorkout: [...new Set(workouts.map((workout) => workout.name))].map((name) => ({ name, ...periodStats(workouts.filter((workout) => workout.name === name), logs, start, end) })) });
        } catch (error) { next(error); }
    });

    router.use((error, _request, response, _next) => {
        if (!error?.status) console.error(error);
        response.status(error?.status || 500).json({ message: error?.status ? error.message : "Unexpected workout error" });
    });
    return router;
}

module.exports = { createRecurringWorkoutRouter, ensureRecurringSchedule };
