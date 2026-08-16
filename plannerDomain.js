const crypto = require("crypto");
const express = require("express");
const fs = require("fs");
const path = require("path");
const { currentDateKey, validDateKey } = require("./dateUtils");

const dataDirectory = process.env.DASHBOARD_DATA_DIR ? path.resolve(process.env.DASHBOARD_DATA_DIR) : path.join(__dirname, "data");
const files = {
    events: path.join(dataDirectory, "events.json"),
    subjects: path.join(dataDirectory, "study-subjects.json"),
    studySessions: path.join(dataDirectory, "study-sessions.json"),
    workouts: path.join(dataDirectory, "workouts.json"),
    internshipDays: path.join(dataDirectory, "internship-days.json"),
    homeworkTasks: path.join(dataDirectory, "homework-tasks.json"),
    workoutLogs: path.join(dataDirectory, "workout-logs.json"),
    activitySessions: path.join(dataDirectory, "sessions.json"),
};

const workoutTypes = new Set(["Push", "Pull", "Legs", "Upper", "Lower", "Full Body", "Cardio", "Rest"]);
const priorities = new Set(["low", "medium", "high", "critical"]);
const taskStatuses = new Set(["todo", "in-progress", "completed"]);

function ensureFile(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath) || !fs.readFileSync(filePath, "utf8").trim()) fs.writeFileSync(filePath, "[]\n");
}

Object.values(files).forEach(ensureFile);

function read(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function write(filePath, value) {
    const temporaryFile = `${filePath}.tmp`;
    fs.writeFileSync(temporaryFile, JSON.stringify(value, null, 2));
    fs.renameSync(temporaryFile, filePath);
}

function fail(message, status = 400) {
    const error = new Error(message);
    error.status = status;
    throw error;
}

function cleanText(value, field, max = 120) {
    if (typeof value !== "string") fail(`${field} must be text`);
    const text = value.trim();
    if (!text) fail(`${field} is required`);
    if (text.length > max) fail(`${field} must be under ${max} characters`);
    return text;
}

function optionalText(value, max = 2000) {
    if (value === undefined || value === null) return "";
    if (typeof value !== "string") fail("Text fields must contain text");
    const text = value.trim();
    if (text.length > max) fail(`Text must be under ${max} characters`);
    return text;
}

function booleanValue(value, field, fallback = false) {
    if (value === undefined) return fallback;
    if (typeof value !== "boolean") fail(`${field} must be a boolean`);
    return value;
}

function boundedNumber(value, field, minimum, maximum, fallback) {
    if (value === undefined && fallback !== undefined) return fallback;
    if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) fail(`${field} must be between ${minimum} and ${maximum}`);
    return value;
}

function completedTasks(value) {
    if (value === undefined) return [];
    if (!Array.isArray(value)) fail("Tasks completed must be a list");
    return value.slice(0, 50).map((task) => cleanText(task, "Completed task", 240));
}

function completionFields(existing, completed) {
    return { completed, completedAt: completed ? (existing?.completedAt || new Date().toISOString()) : null };
}

function ensureLinkedEvent(eventId) {
    if (!read(files.events).some((event) => event.id === eventId)) fail("Linked calendar event not found", 409);
}

function validDate(value) {
    try { return validDateKey(value, "Date"); } catch (error) { fail(error.message); }
}

function timeToMinutes(value) {
    const time = String(value || "");
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) fail("Choose a valid time");
    const [hours, minutes] = time.split(":").map(Number);
    return (hours * 60) + minutes;
}

function minutesToTime(value) {
    const minutes = Math.max(0, Math.min(1439, value));
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function schedule(body) {
    const date = validDate(body.date);
    const startTime = String(body.startTime || "09:00");
    const endTime = String(body.endTime || "10:00");
    const start = timeToMinutes(startTime);
    const end = timeToMinutes(endTime);
    if (end <= start) fail("End time must be later than start time");
    return { date, startTime, endTime, plannedMinutes: end - start };
}

function createEvent({ id = crypto.randomUUID(), title, type, date, startTime, endTime, completed, notes, metadata }) {
    const now = new Date().toISOString();
    const event = { id, title, type, date, startTime, endTime, duration: timeToMinutes(endTime) - timeToMinutes(startTime), completed, notes, metadata, createdAt: now, updatedAt: now };
    const events = read(files.events);
    events.push(event);
    write(files.events, events);
    return event;
}

function updateEvent(eventId, updates) {
    const events = read(files.events);
    const index = events.findIndex((event) => event.id === eventId);
    if (index === -1) fail("Linked calendar event not found", 404);
    const event = { ...events[index], ...updates, updatedAt: new Date().toISOString() };
    event.duration = timeToMinutes(event.endTime) - timeToMinutes(event.startTime);
    events[index] = event;
    write(files.events, events);
    return event;
}

function removeEvent(eventId) {
    write(files.events, read(files.events).filter((event) => event.id !== eventId));
}

function respondError(error, _request, response, next) {
    if (error && error.status) return response.status(error.status).json({ message: error.message });
    next(error);
}

function syncEntityFromEvent(event) {
    const entityType = event.metadata?.entityType;
    const entityId = event.metadata?.entityId;
    if (!entityType || !entityId) return;

    const filePath = files[`${entityType}s`] || files[entityType];
    if (!filePath) return;
    const records = read(filePath);
    const record = records.find((item) => item.id === entityId);
    if (!record) return;

    const wasCompleted = Boolean(record.completed);
    record.date = event.date;
    record.startTime = event.startTime;
    record.endTime = event.endTime;
    record.plannedMinutes = event.duration;
    Object.assign(record, completionFields(record, event.completed));
    record.notes = event.notes;
    if (entityType === "workout") {
        record.name = event.title;
        if (wasCompleted && !event.completed) {
            record.actualMinutes = 0;
            record.status = "planned";
            write(files.workoutLogs, read(files.workoutLogs).filter((log) => log.scheduledWorkoutId !== record.id));
            write(files.activitySessions, read(files.activitySessions).filter((session) => session.workoutId !== record.id));
        }
    }
    if (entityType === "internshipDay") record.internshipName = event.title;
    if (entityType === "homeworkTask") {
        record.title = event.title;
        record.dueDate = event.date;
        record.dueTime = event.endTime;
        record.estimatedMinutes = event.duration;
        record.status = event.completed ? "completed" : (record.status === "completed" ? "todo" : record.status);
        record.completedDate = event.completed ? currentDateKey() : null;
    }
    record.updatedAt = new Date().toISOString();
    write(filePath, records);
}

function deleteEntityForEvent(event) {
    const entityType = event.metadata?.entityType;
    const entityId = event.metadata?.entityId;
    if (!entityType || !entityId) return;
    const filePath = files[`${entityType}s`] || files[entityType];
    if (!filePath) return;
    if (entityType === "workout") {
        const workouts = read(filePath);
        const workout = workouts.find((item) => item.id === entityId);
        if (workout?.source === "recurring") {
            workout.completed = false;
            workout.completedAt = null;
            workout.actualMinutes = 0;
            workout.status = "cancelled";
            workout.updatedAt = new Date().toISOString();
            write(filePath, workouts);
        } else {
            write(filePath, workouts.filter((item) => item.id !== entityId));
        }
        write(files.workoutLogs, read(files.workoutLogs).filter((log) => log.scheduledWorkoutId !== entityId));
        write(files.activitySessions, read(files.activitySessions).filter((session) => session.workoutId !== entityId));
        return;
    }
    write(filePath, read(filePath).filter((item) => item.id !== entityId));
}

function createPlannerDomainRouter() {
    const router = express.Router();

    router.get("/productivity", (_request, response) => {
        response.json({
            subjects: read(files.subjects),
            studySessions: read(files.studySessions),
            workouts: read(files.workouts).filter((workout) => workout.status !== "cancelled"),
            internshipDays: read(files.internshipDays),
            homeworkTasks: read(files.homeworkTasks),
        });
    });

    router.post("/subjects", (request, response, next) => {
        try {
            const name = cleanText(request.body.name, "Subject name");
            const targetWeeklyHours = boundedNumber(request.body.targetWeeklyHours, "Weekly target", 0, 168);
            const targetMonthlyHours = boundedNumber(request.body.targetMonthlyHours, "Monthly target", 0, 744);
            const priority = request.body.priority === undefined ? "medium" : cleanText(request.body.priority, "Priority", 20);
            const color = request.body.color === undefined ? "#72c59b" : cleanText(request.body.color, "Color", 20);
            if (!priorities.has(priority)) fail("Choose a valid priority");
            if (!/^#[0-9a-f]{6}$/i.test(color)) fail("Choose a valid color");
            const subjects = read(files.subjects);
            if (subjects.some((subject) => subject.name.toLowerCase() === name.toLowerCase())) fail("A subject with this name already exists", 409);
            const now = new Date().toISOString();
            const subject = { id: crypto.randomUUID(), name, targetWeeklyHours, targetMonthlyHours, priority, color, createdAt: now, updatedAt: now };
            subjects.push(subject);
            write(files.subjects, subjects);
            response.status(201).json(subject);
        } catch (error) { next(error); }
    });

    router.put("/subjects/:id", (request, response, next) => {
        try {
            const subjects = read(files.subjects);
            const subject = subjects.find((item) => item.id === request.params.id);
            if (!subject) fail("Subject not found", 404);
            const name = cleanText(request.body.name, "Subject name");
            const targetWeeklyHours = boundedNumber(request.body.targetWeeklyHours, "Weekly target", 0, 168);
            const targetMonthlyHours = boundedNumber(request.body.targetMonthlyHours, "Monthly target", 0, 744);
            const priority = cleanText(request.body.priority, "Priority", 20);
            const color = cleanText(request.body.color, "Color", 20);
            if (!priorities.has(priority) || !/^#[0-9a-f]{6}$/i.test(color)) fail("Choose valid subject settings");
            if (subjects.some((item) => item.id !== subject.id && item.name.toLowerCase() === name.toLowerCase())) fail("A subject with this name already exists", 409);
            Object.assign(subject, { name, targetWeeklyHours, targetMonthlyHours, priority, color, updatedAt: new Date().toISOString() });
            write(files.subjects, subjects);
            response.json(subject);
        } catch (error) { next(error); }
    });

    router.delete("/subjects/:id", (request, response, next) => {
        try {
            if (read(files.studySessions).some((session) => session.subjectId === request.params.id)) fail("Delete this subject's study sessions first", 409);
            const subjects = read(files.subjects);
            if (!subjects.some((subject) => subject.id === request.params.id)) fail("Subject not found", 404);
            write(files.subjects, subjects.filter((subject) => subject.id !== request.params.id));
            response.status(204).end();
        } catch (error) { next(error); }
    });

    router.post("/study-sessions", (request, response, next) => {
        try {
            const subjects = read(files.subjects);
            const subject = subjects.find((item) => item.id === request.body.subjectId);
            if (!subject) fail("Choose a valid subject");
            const scheduled = schedule(request.body);
            const actualMinutes = boundedNumber(request.body.actualMinutes, "Actual study time", 0, 1440, 0);
            const completed = booleanValue(request.body.completed, "Completed");
            const id = crypto.randomUUID();
            const eventId = crypto.randomUUID();
            const now = new Date().toISOString();
            const session = { id, eventId, subjectId: subject.id, ...scheduled, actualMinutes: Math.round(actualMinutes), ...completionFields(null, completed), notes: optionalText(request.body.notes), createdAt: now, updatedAt: now };
            const sessions = read(files.studySessions);
            sessions.push(session);
            write(files.studySessions, sessions);
            createEvent({ id: eventId, title: subject.name, type: "study", ...scheduled, completed: session.completed, notes: session.notes, metadata: { entityType: "studySession", entityId: id, subjectId: subject.id } });
            response.status(201).json(session);
        } catch (error) { next(error); }
    });

    router.put("/study-sessions/:id", (request, response, next) => {
        try {
            const sessions = read(files.studySessions);
            const session = sessions.find((item) => item.id === request.params.id);
            if (!session) fail("Study session not found", 404);
            ensureLinkedEvent(session.eventId);
            const subject = read(files.subjects).find((item) => item.id === request.body.subjectId);
            if (!subject) fail("Choose a valid subject");
            const scheduled = schedule(request.body);
            const actualMinutes = boundedNumber(request.body.actualMinutes, "Actual study time", 0, 1440, 0);
            const completed = booleanValue(request.body.completed, "Completed", session.completed);
            Object.assign(session, scheduled, { subjectId: subject.id, actualMinutes: Math.round(actualMinutes), ...completionFields(session, completed), notes: optionalText(request.body.notes), updatedAt: new Date().toISOString() });
            write(files.studySessions, sessions);
            updateEvent(session.eventId, { title: subject.name, type: "study", ...scheduled, completed: session.completed, notes: session.notes, metadata: { entityType: "studySession", entityId: session.id, subjectId: subject.id } });
            response.json(session);
        } catch (error) { next(error); }
    });

    router.delete("/study-sessions/:id", (request, response, next) => {
        try {
            const sessions = read(files.studySessions);
            const session = sessions.find((item) => item.id === request.params.id);
            if (!session) fail("Study session not found", 404);
            write(files.studySessions, sessions.filter((item) => item.id !== session.id));
            removeEvent(session.eventId);
            response.status(204).end();
        } catch (error) { next(error); }
    });

    router.post("/workouts", (request, response, next) => {
        try {
            const name = cleanText(request.body.name, "Workout name");
            const workoutType = String(request.body.workoutType || "Full Body");
            if (!workoutTypes.has(workoutType)) fail("Choose a valid workout type");
            const scheduled = schedule(request.body);
            const id = crypto.randomUUID();
            const eventId = crypto.randomUUID();
            const now = new Date().toISOString();
            const completed = booleanValue(request.body.completed, "Completed");
            if (completed) fail("Create the workout first, then complete it with a workout log", 409);
            const workout = { id, eventId, name, workoutType, ...scheduled, actualMinutes: 0, status: completed ? "completed" : "planned", ...completionFields(null, completed), notes: optionalText(request.body.notes), createdAt: now, updatedAt: now };
            const workouts = read(files.workouts);
            workouts.push(workout);
            write(files.workouts, workouts);
            createEvent({ id: eventId, title: name, type: "gym", ...scheduled, completed: workout.completed, notes: workout.notes, metadata: { entityType: "workout", entityId: id, workoutType } });
            response.status(201).json(workout);
        } catch (error) { next(error); }
    });

    router.put("/workouts/:id", (request, response, next) => {
        try {
            const workouts = read(files.workouts);
            const workout = workouts.find((item) => item.id === request.params.id);
            if (!workout) fail("Workout not found", 404);
            ensureLinkedEvent(workout.eventId);
            const name = cleanText(request.body.name, "Workout name");
            const workoutType = String(request.body.workoutType);
            if (!workoutTypes.has(workoutType)) fail("Choose a valid workout type");
            const scheduled = schedule(request.body);
            const completed = booleanValue(request.body.completed, "Completed", workout.completed);
            if (!workout.completed && completed) fail("Complete workouts through the workout log so actual time is recorded", 409);
            if (workout.completed && !completed) fail("Reopen completed workouts through the reopen action", 409);
            Object.assign(workout, scheduled, { name, workoutType, notes: optionalText(request.body.notes), updatedAt: new Date().toISOString() });
            write(files.workouts, workouts);
            updateEvent(workout.eventId, { title: name, type: "gym", ...scheduled, completed: workout.completed, notes: workout.notes, metadata: { entityType: "workout", entityId: workout.id, workoutType } });
            response.json(workout);
        } catch (error) { next(error); }
    });

    router.delete("/workouts/:id", (request, response, next) => {
        try {
            const workouts = read(files.workouts);
            const workout = workouts.find((item) => item.id === request.params.id);
            if (!workout) fail("Workout not found", 404);
            if (workout.source === "recurring") {
                Object.assign(workout, { completed: false, completedAt: null, actualMinutes: 0, status: "cancelled", updatedAt: new Date().toISOString() });
                write(files.workouts, workouts);
            } else {
                write(files.workouts, workouts.filter((item) => item.id !== workout.id));
            }
            write(files.workoutLogs, read(files.workoutLogs).filter((log) => log.scheduledWorkoutId !== workout.id));
            write(files.activitySessions, read(files.activitySessions).filter((session) => session.workoutId !== workout.id));
            removeEvent(workout.eventId);
            response.status(204).end();
        } catch (error) { next(error); }
    });

    router.post("/internship-days", (request, response, next) => {
        try {
            const internshipName = cleanText(request.body.internshipName, "Internship name");
            const scheduled = schedule(request.body);
            const actualMinutes = boundedNumber(request.body.actualMinutes, "Actual internship time", 0, 1440, 0);
            const tasksCompleted = completedTasks(request.body.tasksCompleted);
            const completed = booleanValue(request.body.completed, "Completed");
            const id = crypto.randomUUID();
            const eventId = crypto.randomUUID();
            const now = new Date().toISOString();
            const day = { id, eventId, internshipName, ...scheduled, actualMinutes: Math.round(actualMinutes), ...completionFields(null, completed), notes: optionalText(request.body.notes), tasksCompleted, createdAt: now, updatedAt: now };
            const days = read(files.internshipDays);
            days.push(day);
            write(files.internshipDays, days);
            createEvent({ id: eventId, title: internshipName, type: "internship", ...scheduled, completed: day.completed, notes: day.notes, metadata: { entityType: "internshipDay", entityId: id } });
            response.status(201).json(day);
        } catch (error) { next(error); }
    });

    router.put("/internship-days/:id", (request, response, next) => {
        try {
            const days = read(files.internshipDays);
            const day = days.find((item) => item.id === request.params.id);
            if (!day) fail("Internship day not found", 404);
            ensureLinkedEvent(day.eventId);
            const internshipName = cleanText(request.body.internshipName, "Internship name");
            const scheduled = schedule(request.body);
            const actualMinutes = boundedNumber(request.body.actualMinutes, "Actual internship time", 0, 1440, 0);
            const tasksCompleted = completedTasks(request.body.tasksCompleted);
            const completed = booleanValue(request.body.completed, "Completed", day.completed);
            Object.assign(day, scheduled, { internshipName, actualMinutes: Math.round(actualMinutes), ...completionFields(day, completed), notes: optionalText(request.body.notes), tasksCompleted, updatedAt: new Date().toISOString() });
            write(files.internshipDays, days);
            updateEvent(day.eventId, { title: internshipName, type: "internship", ...scheduled, completed: day.completed, notes: day.notes, metadata: { entityType: "internshipDay", entityId: day.id } });
            response.json(day);
        } catch (error) { next(error); }
    });

    router.delete("/internship-days/:id", (request, response, next) => {
        try {
            const days = read(files.internshipDays);
            const day = days.find((item) => item.id === request.params.id);
            if (!day) fail("Internship day not found", 404);
            write(files.internshipDays, days.filter((item) => item.id !== day.id));
            removeEvent(day.eventId);
            response.status(204).end();
        } catch (error) { next(error); }
    });

    router.post("/homework-tasks", (request, response, next) => {
        try {
            const title = cleanText(request.body.title, "Task title");
            const subject = cleanText(request.body.subject, "Subject");
            const dueDate = validDate(request.body.dueDate);
            const priority = request.body.priority === undefined ? "medium" : cleanText(request.body.priority, "Priority", 20);
            const status = request.body.status === undefined ? "todo" : cleanText(request.body.status, "Status", 20);
            const estimatedMinutes = boundedNumber(request.body.estimatedMinutes, "Estimated duration", 1, 720, 30);
            if (!priorities.has(priority) || !taskStatuses.has(status)) fail("Choose valid task settings");
            const dueTime = request.body.dueTime === undefined ? "23:59" : cleanText(request.body.dueTime, "Due time", 5);
            const dueMinutes = timeToMinutes(dueTime);
            const startTime = minutesToTime(Math.max(0, dueMinutes - Math.min(estimatedMinutes, 720)));
            const completed = status === "completed";
            const id = crypto.randomUUID();
            const eventId = crypto.randomUUID();
            const now = new Date().toISOString();
            const task = { id, eventId, title, subject, description: optionalText(request.body.description), dueDate, dueTime, priority, estimatedMinutes: Math.round(estimatedMinutes), status, completedDate: completed ? currentDateKey() : null, completedAt: completed ? now : null, createdAt: now, updatedAt: now };
            const tasks = read(files.homeworkTasks);
            tasks.push(task);
            write(files.homeworkTasks, tasks);
            createEvent({ id: eventId, title, type: "homework", date: dueDate, startTime, endTime: dueTime, completed, notes: task.description, metadata: { entityType: "homeworkTask", entityId: id, subject, priority, estimatedMinutes: task.estimatedMinutes } });
            response.status(201).json(task);
        } catch (error) { next(error); }
    });

    router.put("/homework-tasks/:id", (request, response, next) => {
        try {
            const tasks = read(files.homeworkTasks);
            const task = tasks.find((item) => item.id === request.params.id);
            if (!task) fail("Homework task not found", 404);
            ensureLinkedEvent(task.eventId);
            const title = cleanText(request.body.title, "Task title");
            const subject = cleanText(request.body.subject, "Subject");
            const dueDate = validDate(request.body.dueDate);
            const priority = cleanText(request.body.priority, "Priority", 20);
            const status = cleanText(request.body.status, "Status", 20);
            const estimatedMinutes = boundedNumber(request.body.estimatedMinutes, "Estimated duration", 1, 720);
            if (!priorities.has(priority) || !taskStatuses.has(status)) fail("Choose valid task settings");
            const dueTime = request.body.dueTime === undefined ? (task.dueTime || "23:59") : cleanText(request.body.dueTime, "Due time", 5);
            const dueMinutes = timeToMinutes(dueTime);
            const startTime = minutesToTime(Math.max(0, dueMinutes - Math.min(estimatedMinutes, 720)));
            const completed = status === "completed";
            const now = new Date().toISOString();
            Object.assign(task, { title, subject, description: optionalText(request.body.description), dueDate, dueTime, priority, estimatedMinutes: Math.round(estimatedMinutes), status, completedDate: completed ? (task.completedDate || currentDateKey()) : null, completedAt: completed ? (task.completedAt || now) : null, updatedAt: now });
            write(files.homeworkTasks, tasks);
            updateEvent(task.eventId, { title, type: "homework", date: dueDate, startTime, endTime: dueTime, completed, notes: task.description, metadata: { entityType: "homeworkTask", entityId: task.id, subject, priority, estimatedMinutes: task.estimatedMinutes } });
            response.json(task);
        } catch (error) { next(error); }
    });

    router.delete("/homework-tasks/:id", (request, response, next) => {
        try {
            const tasks = read(files.homeworkTasks);
            const task = tasks.find((item) => item.id === request.params.id);
            if (!task) fail("Homework task not found", 404);
            write(files.homeworkTasks, tasks.filter((item) => item.id !== task.id));
            removeEvent(task.eventId);
            response.status(204).end();
        } catch (error) { next(error); }
    });

    router.use(respondError);
    return router;
}

module.exports = { createPlannerDomainRouter, syncEntityFromEvent, deleteEntityForEvent };
