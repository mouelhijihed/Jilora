const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function dateKey(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new Error("Invalid date value");
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function parseDateKey(value, field = "date") {
    if (typeof value !== "string") throw new Error(`${field} must use YYYY-MM-DD`);
    const match = DATE_KEY_PATTERN.exec(value);
    if (!match) throw new Error(`${field} must use YYYY-MM-DD`);
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const parsed = new Date(year, month - 1, day, 12, 0, 0, 0);
    if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) throw new Error(`${field} is not a real calendar date`);
    return parsed;
}

function validDateKey(value, field = "date") {
    parseDateKey(value, field);
    return value;
}

function addCalendarDays(date, amount) {
    const result = new Date(date);
    result.setDate(result.getDate() + amount);
    return result;
}

function currentDateKey(now = new Date()) {
    return dateKey(now);
}

function startOfIsoWeek(date) {
    const result = new Date(date);
    const weekday = result.getDay() || 7;
    result.setDate(result.getDate() - weekday + 1);
    result.setHours(12, 0, 0, 0);
    return result;
}

module.exports = { addCalendarDays, currentDateKey, dateKey, parseDateKey, startOfIsoWeek, validDateKey };
