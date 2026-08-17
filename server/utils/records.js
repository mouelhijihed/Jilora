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

module.exports = { camelizeRow, camelizeRows, dateKey, addDays, startOfWeek };
