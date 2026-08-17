import { fromDateKey, startOfCalendarWeek, toDateKey } from "./date";
import type { CalendarEvent } from "../types/planner";
import type { HomeworkTask, StudySession, WorkSession, Workout } from "../types/productivity";

type PlannedRecord = { date: string; plannedMinutes: number; completed: boolean };
type ActualRecord = PlannedRecord & { actualMinutes: number };

export function isWithinDates(date: string, start: Date, end: Date) {
    const value = fromDateKey(date).getTime();
    return value >= start.getTime() && value <= end.getTime();
}

export function endOfDay(date: Date) {
    const result = new Date(date);
    result.setHours(23, 59, 59, 999);
    return result;
}

export function startOfMonth(date = new Date()) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date = new Date()) {
    return endOfDay(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

export function calculatePlannedMinutes<T extends PlannedRecord>(records: T[], start?: Date, end?: Date) {
    return records.filter((record) => !start || !end || isWithinDates(record.date, start, end)).reduce((sum, record) => sum + record.plannedMinutes, 0);
}

export function calculateActualMinutes<T extends ActualRecord>(records: T[], start?: Date, end?: Date) {
    return records.filter((record) => !start || !end || isWithinDates(record.date, start, end)).reduce((sum, record) => sum + record.actualMinutes, 0);
}

export function calculateCompletionRate<T extends { completed: boolean }>(records: T[]) {
    return records.length ? Math.round((records.filter((record) => record.completed).length / records.length) * 100) : 0;
}

export function calculateWeeklyMinutes<T extends PlannedRecord>(records: T[], date = new Date()) {
    const start = startOfCalendarWeek(date);
    const end = endOfDay(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6));
    return calculatePlannedMinutes(records, start, end);
}

export function calculateMonthlyMinutes<T extends PlannedRecord>(records: T[], date = new Date()) {
    return calculatePlannedMinutes(records, startOfMonth(date), endOfMonth(date));
}

export function getStudyMinutesBySubject(sessions: StudySession[], actual = true) {
    return sessions.reduce<Record<string, number>>((totals, session) => {
        totals[session.subjectId] = (totals[session.subjectId] || 0) + (actual ? session.actualMinutes : session.plannedMinutes);
        return totals;
    }, {});
}

export function getOverdueTasks(tasks: HomeworkTask[], now = new Date()) {
    const today = toDateKey(now);
    return tasks.filter((task) => task.status !== "completed" && task.dueDate < today);
}

export function getUpcomingEvents(events: CalendarEvent[], now = new Date(), limit = 8) {
    const currentKey = `${toDateKey(now)}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    return [...events].filter((event) => `${event.date}T${event.startTime}` >= currentKey && !event.completed).sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`)).slice(0, limit);
}

export function eventActualMinutes(event: CalendarEvent, studySessions: StudySession[], workSessions: WorkSession[], workouts: Workout[]) {
    const entityType = event.metadata.entityType;
    const entityId = event.metadata.entityId;
    if (entityType === "studySession") return studySessions.find((item) => item.id === entityId)?.actualMinutes || 0;
    if (entityType === "workSession") return workSessions.find((item) => item.id === entityId)?.actualMinutes || 0;
    if (entityType === "workout") return workouts.find((item) => item.id === entityId)?.actualMinutes || 0;
    if (entityType === "homeworkTask") return 0;
    return event.completed ? event.duration : 0;
}
