const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { createPlannerDomainRouter, syncEntityFromEvent, deleteEntityForEvent } = require("./plannerDomain");
const { createRecurringWorkoutRouter } = require("./recurringWorkouts");
const { currentDateKey, dateKey, parseDateKey, validDateKey } = require("./dateUtils");

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const dataDirectory = process.env.DASHBOARD_DATA_DIR ? path.resolve(process.env.DASHBOARD_DATA_DIR) : path.join(__dirname, "data");
const sessionsFile = path.join(dataDirectory, "sessions.json");
const workoutsFile = path.join(dataDirectory, "workouts.json");
const subjectsFile = path.join(dataDirectory, "study-subjects.json");
const pomodoroSettingsFile = path.join(dataDirectory, "pomodoro-settings.json");
const tasksFile = path.join(dataDirectory, "tasks.json");
const eventsFile = path.join(dataDirectory, "events.json");
const frontendDirectory = path.join(__dirname, "frontend", "dist");
const activities = new Set(["Study", "Homework", "Internship", "Gym"]);
const sessionActivities = new Set(["study", "homework", "internship", "gym"]);
const sessionStatuses = new Set(["running", "paused", "completed", "cancelled"]);
const sessionTypes = new Set(["focus", "shortBreak", "longBreak", "activity"]);
const eventTypes = new Set(["gym", "study", "homework", "internship", "general"]);

app.use(cors());
app.use(express.json({ limit: "32kb" }));
app.use((_request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "same-origin");
    response.setHeader("X-Frame-Options", "DENY");
    next();
});
app.use("/api", createRecurringWorkoutRouter());
app.use("/api", createPlannerDomainRouter());

function ensureJsonFile(filePath, initialValue) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(initialValue, null, 2));
        return;
    }

    const contents = fs.readFileSync(filePath, "utf8").trim();
    if (!contents) {
        fs.writeFileSync(filePath, JSON.stringify(initialValue, null, 2));
    }
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
    const temporaryFile = `${filePath}.tmp`;
    fs.writeFileSync(temporaryFile, JSON.stringify(value, null, 2));
    fs.renameSync(temporaryFile, filePath);
}

ensureJsonFile(sessionsFile, []);
ensureJsonFile(subjectsFile, []);
ensureJsonFile(pomodoroSettingsFile, { focusDuration: 1500, shortBreakDuration: 300, longBreakDuration: 900 });
ensureJsonFile(tasksFile, []);
ensureJsonFile(eventsFile, []);

function parseTime(value) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
    const [hours, minutes] = value.split(":").map(Number);
    return (hours * 60) + minutes;
}

function normalizeEvent(body, existing = {}) {
    const title = String(body.title ?? existing.title ?? "").trim();
    const linkedTypes = { workout: "gym", studySession: "study", internshipDay: "internship", homeworkTask: "homework" };
    const linkedType = linkedTypes[existing.metadata?.entityType];
    const type = linkedType || String(body.type ?? existing.type ?? "").trim();
    const date = String(body.date ?? existing.date ?? "").trim();
    const startTime = String(body.startTime ?? existing.startTime ?? "").trim();
    const endTime = String(body.endTime ?? existing.endTime ?? "").trim();
    const notes = String(body.notes ?? existing.notes ?? "").trim();
    const startMinutes = parseTime(startTime);
    const endMinutes = parseTime(endTime);

    if (!title || title.length > 120) throw new Error("Event title is required and must be under 120 characters");
    if (!eventTypes.has(type)) throw new Error("Choose a valid event category");
    try { validDateKey(date, "Event date"); } catch (error) { throw new Error(error.message); }
    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) throw new Error("End time must be later than start time");
    if (notes.length > 2000) throw new Error("Notes must be under 2000 characters");

    if (Object.prototype.hasOwnProperty.call(body, "completed") && typeof body.completed !== "boolean") throw new Error("Completed must be a boolean");
    const metadataInput = existing.metadata ?? {};
    const metadata = metadataInput && typeof metadataInput === "object" && !Array.isArray(metadataInput) ? metadataInput : {};

    return {
        title,
        type,
        date,
        startTime,
        endTime,
        duration: endMinutes - startMinutes,
        completed: typeof body.completed === "boolean" ? body.completed : Boolean(existing.completed),
        notes,
        metadata,
    };
}

app.get("/api/health", (_request, response) => {
    response.json({ status: "ok" });
});

app.get("/api/events", (_request, response, next) => {
    try {
        const start = _request.query.start ? validDateKey(_request.query.start, "Start date") : null;
        const end = _request.query.end ? validDateKey(_request.query.end, "End date") : null;
        if (start && end && start > end) return response.status(400).json({ message: "Start date must be on or before end date" });
        response.json(readJson(eventsFile).filter((event) => (!start || event.date >= start) && (!end || event.date <= end)));
    } catch (error) {
        next(error);
    }
});

app.post("/api/events", (request, response, next) => {
    try {
        const now = new Date().toISOString();
        const event = {
            id: crypto.randomUUID(),
            ...normalizeEvent(request.body),
            createdAt: now,
            updatedAt: now,
        };
        const events = readJson(eventsFile);
        events.push(event);
        writeJson(eventsFile, events);
        response.status(201).json(event);
    } catch (error) {
        if (error instanceof Error && !error.code) return response.status(400).json({ message: error.message });
        next(error);
    }
});

app.put("/api/events/:id", (request, response, next) => {
    try {
        const events = readJson(eventsFile);
        const index = events.findIndex((event) => event.id === request.params.id);
        if (index === -1) return response.status(404).json({ message: "Event not found" });

        const updated = {
            ...events[index],
            ...normalizeEvent(request.body, events[index]),
            updatedAt: new Date().toISOString(),
        };
        if (events[index].metadata?.entityType === "workout" && !events[index].completed && updated.completed) return response.status(409).json({ message: "Complete workouts through the workout log so actual time is recorded" });
        events[index] = updated;
        writeJson(eventsFile, events);
        syncEntityFromEvent(updated);
        response.json(updated);
    } catch (error) {
        if (error instanceof Error && !error.code) return response.status(400).json({ message: error.message });
        next(error);
    }
});

app.patch("/api/events/:id/completed", (request, response, next) => {
    try {
        if (typeof request.body.completed !== "boolean") return response.status(400).json({ message: "Completed must be a boolean" });
        const events = readJson(eventsFile);
        const event = events.find((item) => item.id === request.params.id);
        if (!event) return response.status(404).json({ message: "Event not found" });
        if (event.metadata?.entityType === "workout" && !event.completed && request.body.completed) return response.status(409).json({ message: "Complete workouts through the workout log so actual time is recorded" });
        event.completed = request.body.completed;
        event.updatedAt = new Date().toISOString();
        writeJson(eventsFile, events);
        syncEntityFromEvent(event);
        response.json(event);
    } catch (error) {
        next(error);
    }
});

app.delete("/api/events/:id", (request, response, next) => {
    try {
        const events = readJson(eventsFile);
        const deletedEvent = events.find((event) => event.id === request.params.id);
        const nextEvents = events.filter((event) => event.id !== request.params.id);
        if (nextEvents.length === events.length) return response.status(404).json({ message: "Event not found" });
        writeJson(eventsFile, nextEvents);
        deleteEntityForEvent(deletedEvent);
        response.status(204).end();
    } catch (error) {
        next(error);
    }
});

function normalizeSessionActivity(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (!sessionActivities.has(normalized)) throw Object.assign(new Error("Choose a valid activity"), { status: 400 });
    return normalized;
}

function cleanSessionText(value, field, maximum, required = false) {
    if (value === undefined || value === null) {
        if (required) throw Object.assign(new Error(`${field} is required`), { status: 400 });
        return "";
    }
    if (typeof value !== "string") throw Object.assign(new Error(`${field} must be text`), { status: 400 });
    const result = value.trim();
    if (required && !result) throw Object.assign(new Error(`${field} is required`), { status: 400 });
    if (result.length > maximum) throw Object.assign(new Error(`${field} must be under ${maximum} characters`), { status: 400 });
    return result;
}

function validTimestamp(value, fallback, field = "Timestamp") {
    if (value === undefined || value === null || value === "") return fallback;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) throw Object.assign(new Error(`${field} must be an ISO timestamp`), { status: 400 });
    const timestamp = new Date(value);
    if (Number.isNaN(timestamp.getTime())) throw Object.assign(new Error(`${field} is invalid`), { status: 400 });
    return timestamp.toISOString();
}

function assertTimestampOrder(startedAt, endedAt, field) {
    if (new Date(endedAt).getTime() < new Date(startedAt).getTime()) throw Object.assign(new Error(`${field} cannot be before startedAt`), { status: 400 });
    if (new Date(endedAt).getTime() > Date.now() + 5000) throw Object.assign(new Error(`${field} cannot be in the future`), { status: 400 });
}

function assertDurationFitsElapsed(actualDuration, startedAt, endedAt) {
    const elapsed = Math.max(0, Math.floor((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000));
    if (actualDuration > elapsed + 5) throw Object.assign(new Error("Actual duration cannot exceed elapsed time"), { status: 400 });
}

function isActiveStatus(status) {
    return status === "running" || status === "paused";
}

function validatePomodoroNumber(value) {
    const number = Number(value || 0);
    if (!Number.isInteger(number) || number < 0 || number > 100000) throw Object.assign(new Error("Pomodoro number must be a non-negative integer"), { status: 400 });
    return number;
}

function normalizeStoredSession(session) {
    const activity = normalizeSessionActivity(session.activity);
    const plannedDuration = Number(session.plannedDuration ?? Number(session.duration || 0) * 60);
    const actualDuration = Number(session.actualDuration ?? Number(session.duration || 0) * 60);
    const status = session.status === undefined ? "completed" : (sessionStatuses.has(session.status) ? session.status : "cancelled");
    return {
        ...session,
        activity,
        subjectId: session.subjectId ? String(session.subjectId) : "",
        subject: String(session.subject || "").trim(),
        topic: String(session.topic || "").trim(),
        plannedDuration: Number.isFinite(plannedDuration) ? Math.max(0, Math.round(plannedDuration)) : 0,
        actualDuration: Number.isFinite(actualDuration) ? Math.max(0, Math.round(actualDuration)) : 0,
        duration: Number.isFinite(actualDuration) ? Math.round(actualDuration / 60) : 0,
        status,
        sessionType: sessionTypes.has(session.sessionType) ? session.sessionType : "activity",
        startedAt: session.startedAt ? validTimestamp(session.startedAt, new Date().toISOString(), "startedAt") : validTimestamp(session.createdAt, new Date().toISOString(), "createdAt"),
        activeStartedAt: status === "running" && session.activeStartedAt ? validTimestamp(session.activeStartedAt, null, "activeStartedAt") : null,
        completedAt: status === "completed" && session.completedAt ? validTimestamp(session.completedAt, null, "completedAt") : null,
        updatedAt: session.updatedAt || session.createdAt || new Date().toISOString(),
    };
}

function sessionDateKey(session) {
    const timestamp = new Date(session.startedAt || session.createdAt);
    const year = timestamp.getFullYear();
    const month = String(timestamp.getMonth() + 1).padStart(2, "0");
    const day = String(timestamp.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function sessionFilters(request) {
    const activity = request.query.activity ? normalizeSessionActivity(request.query.activity) : null;
    const subject = request.query.subject ? cleanSessionText(request.query.subject, "Subject", 120).toLowerCase() : null;
    const start = request.query.start ? validDateKey(request.query.start, "Start date") : null;
    const end = request.query.end ? validDateKey(request.query.end, "End date") : null;
    const status = request.query.status ? String(request.query.status) : null;
    if (status && !sessionStatuses.has(status)) throw Object.assign(new Error("Choose a valid session status"), { status: 400 });
    if (start && end && start > end) throw Object.assign(new Error("Start date must be on or before end date"), { status: 400 });
    return { activity, subject, start, end, status };
}

function sessionMatches(session, filters) {
    const date = sessionDateKey(session);
    return (!filters.activity || session.activity === filters.activity) && (!filters.subject || session.subject.toLowerCase() === filters.subject) && (!filters.start || date >= filters.start) && (!filters.end || date <= filters.end) && (!filters.status || session.status === filters.status);
}

function readSessions() {
    return readJson(sessionsFile).map(normalizeStoredSession);
}

function writeSessions(sessions) {
    writeJson(sessionsFile, sessions.map(normalizeStoredSession));
}

function validateDuration(value, field, maximum = 86400) {
    const duration = Number(value);
    if (!Number.isFinite(duration) || duration < 0 || duration > maximum) throw Object.assign(new Error(`${field} must be between 0 and ${maximum} seconds`), { status: 400 });
    return Math.round(duration);
}

function sessionAnalytics(sessions, start, end) {
    const completed = sessions.filter((session) => session.status === "completed" && sessionDateKey(session) >= start && sessionDateKey(session) <= end);
    const study = completed.filter((session) => session.activity === "study" && session.sessionType === "focus");
    const totalStudyDuration = study.reduce((sum, session) => sum + session.actualDuration, 0);
    const subjectTotals = study.reduce((groups, session) => {
        const key = session.subject || "Unassigned";
        groups[key] = (groups[key] || 0) + session.actualDuration;
        return groups;
    }, {});
    const dayTotals = study.reduce((groups, session) => {
        const key = sessionDateKey(session);
        groups[key] = (groups[key] || 0) + session.actualDuration;
        return groups;
    }, {});
    const activityTotals = completed.reduce((groups, session) => {
        groups[session.activity] = (groups[session.activity] || 0) + session.actualDuration;
        return groups;
    }, {});
    return {
        start,
        end,
        totalStudyDuration,
        completedPomodoros: study.length,
        averagePomodoroDuration: study.length ? Math.round(totalStudyDuration / study.length) : 0,
        bySubject: Object.entries(subjectTotals).map(([subject, actualDuration]) => ({ subject, actualDuration })).sort((a, b) => b.actualDuration - a.actualDuration),
        byDay: Object.entries(dayTotals).map(([date, actualDuration]) => ({ date, actualDuration })).sort((a, b) => a.date.localeCompare(b.date)),
        activityTotals,
        completedSessions: completed.length,
    };
}

app.get("/api/sessions", (request, response, next) => {
    try {
        const filters = sessionFilters(request);
        response.json(readSessions().filter((session) => sessionMatches(session, filters)));
    } catch (error) {
        next(error);
    }
});

app.get("/api/sessions/study", (request, response, next) => {
    try {
        const filters = { ...sessionFilters(request), activity: "study" };
        response.json(readSessions().filter((session) => sessionMatches(session, filters)));
    } catch (error) { next(error); }
});

app.get("/api/sessions/active", (_request, response, next) => {
    try {
        const active = readSessions().filter((session) => session.status === "running" || session.status === "paused").sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] || null;
        response.json(active);
    } catch (error) { next(error); }
});

app.get("/api/sessions/analytics", (request, response, next) => {
    try {
        const sessions = readSessions();
        const dates = sessions.map(sessionDateKey).sort();
        const today = currentDateKey();
        const start = request.query.start ? validDateKey(request.query.start, "Start date") : (dates[0] || today);
        const end = request.query.end ? validDateKey(request.query.end, "End date") : today;
        if (start > end) return response.status(400).json({ message: "Start date must be on or before end date" });
        response.json(sessionAnalytics(sessions, start, end));
    } catch (error) { next(error); }
});

app.get("/api/pomodoro-settings", (_request, response, next) => {
    try { response.json(readJson(pomodoroSettingsFile)); } catch (error) { next(error); }
});

app.put("/api/pomodoro-settings", (request, response, next) => {
    try {
        const settings = {
            focusDuration: validateDuration(request.body.focusDuration, "Focus duration", 43200),
            shortBreakDuration: validateDuration(request.body.shortBreakDuration, "Short break duration", 43200),
            longBreakDuration: validateDuration(request.body.longBreakDuration, "Long break duration", 43200),
        };
        if (!settings.focusDuration || !settings.shortBreakDuration || !settings.longBreakDuration) return response.status(400).json({ message: "Pomodoro durations must be greater than zero" });
        writeJson(pomodoroSettingsFile, settings);
        response.json(settings);
    } catch (error) { next(error); }
});

app.post("/api/sessions", (request, response, next) => {
    try {
        const activity = normalizeSessionActivity(request.body.activity);
        const topic = cleanSessionText(request.body.topic, "Topic", 240);
        const legacyDuration = request.body.duration === undefined ? null : Number(request.body.duration) * 60;
        const plannedDuration = validateDuration(request.body.plannedDuration ?? legacyDuration, "Planned duration");
        if (!plannedDuration) return response.status(400).json({ message: "Planned duration must be greater than zero" });
        const status = request.body.status ? String(request.body.status) : (legacyDuration === null ? "running" : "completed");
        if (!sessionStatuses.has(status)) return response.status(400).json({ message: "Choose a valid session status" });
        const actualDuration = validateDuration(request.body.actualDuration ?? (status === "completed" ? plannedDuration : 0), "Actual duration");
        const sessionType = request.body.sessionType ? String(request.body.sessionType) : "activity";
        if (!sessionTypes.has(sessionType)) return response.status(400).json({ message: "Choose a valid session type" });
        if ((sessionType === "focus" || sessionType === "shortBreak" || sessionType === "longBreak") && activity !== "study") return response.status(400).json({ message: "Pomodoro sessions must use the Study activity" });

        const workoutId = request.body.workoutId ? String(request.body.workoutId) : "";
        if (workoutId && activity !== "gym") return response.status(400).json({ message: "Only Gym sessions can be linked to a workout" });
        if (workoutId && !readJson(workoutsFile).some((workout) => workout.id === workoutId)) return response.status(404).json({ message: "Workout not found" });

        const sessions = readSessions();
        if (isActiveStatus(status) && sessions.some((session) => isActiveStatus(session.status))) return response.status(409).json({ message: "Another activity session is already active" });
        const now = new Date().toISOString();
        const subjectId = cleanSessionText(request.body.subjectId, "Subject ID", 120);
        let subject = cleanSessionText(request.body.subject, "Subject", 120);
        if (sessionType === "focus") {
            const matchedSubject = readJson(subjectsFile).find((item) => item.id === subjectId);
            if (!matchedSubject) return response.status(400).json({ message: "Choose a valid study subject" });
            if (!topic) return response.status(400).json({ message: "Topic is required for a focus session" });
            subject = matchedSubject.name;
        }
        const startedAt = validTimestamp(request.body.startedAt, now, "startedAt");
        if (new Date(startedAt).getTime() > Date.now() + 5000) return response.status(400).json({ message: "startedAt cannot be in the future" });
        const activeStartedAt = status === "running" ? validTimestamp(request.body.activeStartedAt, startedAt, "activeStartedAt") : null;
        const completedAt = status === "completed" ? validTimestamp(request.body.completedAt, now, "completedAt") : null;
        if (activeStartedAt) assertTimestampOrder(startedAt, activeStartedAt, "activeStartedAt");
        if (completedAt) {
            assertTimestampOrder(startedAt, completedAt, "completedAt");
            if (!actualDuration) return response.status(400).json({ message: "Completed sessions must have actual duration" });
            assertDurationFitsElapsed(actualDuration, startedAt, completedAt);
        } else {
            assertDurationFitsElapsed(actualDuration, startedAt, now);
        }
        const session = {
            id: crypto.randomUUID(),
            activity,
            subjectId,
            subject,
            topic,
            plannedDuration,
            actualDuration,
            duration: Math.round(actualDuration / 60),
            status,
            sessionType,
            pomodoroNumber: validatePomodoroNumber(request.body.pomodoroNumber),
            startedAt,
            activeStartedAt,
            completedAt,
            ...(workoutId ? { workoutId } : {}),
            createdAt: now,
            updatedAt: now,
        };

        sessions.push(session);
        writeJson(sessionsFile, sessions);
        response.status(201).json(normalizeStoredSession(session));
    } catch (error) {
        next(error);
    }
});

app.put("/api/sessions/:id", (request, response, next) => {
    try {
        const sessions = readSessions();
        const session = sessions.find((item) => String(item.id) === request.params.id);
        if (!session) return response.status(404).json({ message: "Session not found" });
        const current = normalizeStoredSession(session);
        const status = request.body.status ? String(request.body.status) : current.status;
        if (!sessionStatuses.has(status)) return response.status(400).json({ message: "Choose a valid session status" });
        if ((current.status === "completed" || current.status === "cancelled") && status !== current.status) return response.status(409).json({ message: `A ${current.status} session cannot transition to ${status}` });
        const allowedTransitions = {
            running: new Set(["running", "paused", "completed", "cancelled"]),
            paused: new Set(["paused", "running", "completed", "cancelled"]),
            completed: new Set(["completed"]),
            cancelled: new Set(["cancelled"]),
        };
        if (!allowedTransitions[current.status].has(status)) return response.status(409).json({ message: `Cannot transition from ${current.status} to ${status}` });
        const actualDuration = request.body.actualDuration === undefined ? current.actualDuration : validateDuration(request.body.actualDuration, "Actual duration");
        if (actualDuration < current.actualDuration) return response.status(400).json({ message: "Actual duration cannot decrease" });
        if (status === "completed" && !actualDuration) return response.status(400).json({ message: "Completed sessions must have actual duration" });
        if (status === "running" && sessions.some((item) => item.id !== current.id && isActiveStatus(item.status))) return response.status(409).json({ message: "Another activity session is already active" });
        const now = new Date().toISOString();
        const activeStartedAt = status === "running"
            ? validTimestamp(request.body.activeStartedAt, current.status === "running" ? current.activeStartedAt : now, "activeStartedAt")
            : null;
        const completedAt = status === "completed" ? validTimestamp(request.body.completedAt, current.completedAt || now, "completedAt") : null;
        if (activeStartedAt) assertTimestampOrder(current.startedAt, activeStartedAt, "activeStartedAt");
        if (completedAt) {
            assertTimestampOrder(current.startedAt, completedAt, "completedAt");
            assertDurationFitsElapsed(actualDuration, current.startedAt, completedAt);
        } else {
            assertDurationFitsElapsed(actualDuration, current.startedAt, now);
        }
        Object.assign(session, {
            actualDuration,
            duration: Math.round(actualDuration / 60),
            status,
            activeStartedAt,
            completedAt,
            updatedAt: now,
        });
        writeJson(sessionsFile, sessions);
        response.json(normalizeStoredSession(session));
    } catch (error) { next(error); }
});

app.delete("/api/sessions/:id", (request, response, next) => {
    try {
        const sessions = readJson(sessionsFile);
        const nextSessions = sessions.filter((session) => String(session.id) !== request.params.id);

        if (nextSessions.length === sessions.length) {
            return response.status(404).json({ message: "Session not found" });
        }

        writeJson(sessionsFile, nextSessions);
        response.status(204).end();
    } catch (error) {
        next(error);
    }
});

app.get("/api/tasks", (_request, response, next) => {
    try {
        response.json(readJson(tasksFile));
    } catch (error) {
        next(error);
    }
});

app.post("/api/tasks", (request, response, next) => {
    try {
        const title = String(request.body.title || "").trim();
        const category = String(request.body.category || "").trim();

        if (!title || title.length > 120) {
            return response.status(400).json({ message: "Task title is required and must be under 120 characters" });
        }

        if (!activities.has(category)) {
            return response.status(400).json({ message: "Choose a valid category" });
        }

        const tasks = readJson(tasksFile);
        const task = { id: crypto.randomUUID(), title, category, completed: false };
        tasks.unshift(task);
        writeJson(tasksFile, tasks);
        response.status(201).json(task);
    } catch (error) {
        next(error);
    }
});

app.patch("/api/tasks/:id", (request, response, next) => {
    try {
        const tasks = readJson(tasksFile);
        const task = tasks.find((item) => item.id === request.params.id);

        if (!task) {
            return response.status(404).json({ message: "Task not found" });
        }

        if (typeof request.body.completed !== "boolean") {
            return response.status(400).json({ message: "Completed must be a boolean" });
        }

        task.completed = request.body.completed;
        writeJson(tasksFile, tasks);
        response.json(task);
    } catch (error) {
        next(error);
    }
});

app.delete("/api/tasks/:id", (request, response, next) => {
    try {
        const tasks = readJson(tasksFile);
        const nextTasks = tasks.filter((task) => task.id !== request.params.id);

        if (nextTasks.length === tasks.length) {
            return response.status(404).json({ message: "Task not found" });
        }

        writeJson(tasksFile, nextTasks);
        response.status(204).end();
    } catch (error) {
        next(error);
    }
});

if (fs.existsSync(frontendDirectory)) {
    app.use(express.static(frontendDirectory));
    app.use((request, response, next) => {
        if (request.method !== "GET" || request.path.startsWith("/api/")) {
            return next();
        }

        response.sendFile(path.join(frontendDirectory, "index.html"));
    });
}

app.use("/api", (_request, response) => response.status(404).json({ message: "API endpoint not found" }));

app.use((error, _request, response, _next) => {
    console.error(error);
    if (error?.type === "entity.parse.failed") return response.status(400).json({ message: "Request body contains malformed JSON" });
    if (error?.type === "entity.too.large") return response.status(413).json({ message: "Request body is too large" });
    response.status(error.status || 500).json({ message: error.status && error.status < 500 ? error.message : "Unexpected server error" });
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Dashboard running on http://localhost:${PORT}`);
    });
}

module.exports = app;
