function camelKey(key) {
    return key.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());
}

function camelizeRow(row) {
    if (!row) return row;
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [camelKey(key), value]));
}

function camelizeRows(rows) {
    return rows.map(camelizeRow);
}

function dateKey(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function validTimeZone(value) {
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
        return true;
    } catch {
        return false;
    }
}

function zonedParts(timeZone = "UTC", value = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).formatToParts(value);
    return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

function dateKeyInTimeZone(timeZone = "UTC", value = new Date()) {
    const parts = zonedParts(timeZone, value);
    return `${parts.year}-${parts.month}-${parts.day}`;
}

function timeKeyInTimeZone(timeZone = "UTC", value = new Date()) {
    const parts = zonedParts(timeZone, value);
    return `${parts.hour}:${parts.minute}`;
}

async function userTimeZone(userId, client) {
    const result = await client.query("SELECT time_zone FROM user_settings WHERE user_id=$1", [userId]);
    const value = result.rows[0]?.time_zone || "UTC";
    return validTimeZone(value) ? value : "UTC";
}

function addDays(dateValue, count) {
    const date = new Date(`${dateValue}T12:00:00`);
    date.setDate(date.getDate() + count);
    return dateKey(date);
}

function startOfWeek(value = new Date()) {
    const date = value instanceof Date ? new Date(value) : new Date(`${value}T12:00:00`);
    const day = date.getDay() || 7;
    date.setDate(date.getDate() - day + 1);
    return dateKey(date);
}

module.exports = { camelizeRow, camelizeRows, dateKey, dateKeyInTimeZone, timeKeyInTimeZone, userTimeZone, validTimeZone, addDays, startOfWeek };
