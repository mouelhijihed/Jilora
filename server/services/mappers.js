const { camelizeRow, camelizeRows, dateKey } = require("../utils/records");

function event(row) {
    if (!row) return row;
    const value = camelizeRow(row);
    return { ...value, date: dateKey(value.eventDate), startTime: String(value.startTime).slice(0, 5), endTime: String(value.endTime).slice(0, 5), duration: value.durationMinutes };
}

function subject(row) {
    const value = camelizeRow(row);
    return { ...value, targetWeeklyHours: Number(value.targetWeeklyHours), targetMonthlyHours: Number(value.targetMonthlyHours) };
}

function studySession(row) {
    const value = camelizeRow(row);
    return { ...value, date: dateKey(value.sessionDate), startTime: String(value.startTime).slice(0, 5), endTime: String(value.endTime).slice(0, 5) };
}

function homework(row) {
    const value = camelizeRow(row);
    return { ...value, subject: value.subjectName, dueDate: dateKey(value.dueDate), completedDate: value.completedDate ? dateKey(value.completedDate) : null, dueTime: String(value.dueTime).slice(0, 5) };
}

function workout(row) {
    const value = camelizeRow(row);
    return { ...value, date: dateKey(value.workoutDate), occurrenceDate: value.occurrenceDate ? dateKey(value.occurrenceDate) : null, startTime: String(value.startTime).slice(0, 5), endTime: String(value.endTime).slice(0, 5), source: value.source === "manual" ? undefined : value.source };
}

function workoutLog(row) {
    const value = camelizeRow(row);
    return { ...value, duration: value.durationSeconds };
}

function workSession(row) {
    const value = camelizeRow(row);
    return { ...value, date: dateKey(value.workDate), startTime: String(value.startTime).slice(0, 5), endTime: String(value.endTime).slice(0, 5) };
}

function job(row) {
    const value = camelizeRow(row);
    return value ? { ...value, hourlyTarget: value.hourlyTarget === null ? null : Number(value.hourlyTarget) } : null;
}

function activitySession(row) {
    const value = camelizeRow(row);
    if (!value) return value;
    return { ...value, subjectId: value.subjectId || "", duration: Math.round(value.actualDuration / 60) };
}

module.exports = { event, subject, studySession, homework, workout, workoutLog, workSession, job, activitySession, camelizeRow, camelizeRows };
