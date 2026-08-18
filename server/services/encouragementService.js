const crypto = require("crypto");
const { getPool } = require("../db/pool");
const { fail } = require("../utils/domain");
const { camelizeRow, camelizeRows } = require("../utils/records");

const defaultMessages = ["Keep going", "You've got this", "Nice work", "Start another session", "Great job"];

async function getSettings(userId) {
    const result = await getPool().query("SELECT custom_encouragements_enabled FROM user_settings WHERE user_id=$1", [userId]);
    return { enabled: result.rows[0]?.custom_encouragements_enabled !== false };
}

async function updateSettings(userId, enabled) {
    const result = await getPool().query("UPDATE user_settings SET custom_encouragements_enabled=$2,updated_at=NOW() WHERE user_id=$1 RETURNING custom_encouragements_enabled", [userId, enabled]);
    if (!result.rowCount) fail("User settings not found", 404);
    return { enabled: result.rows[0].custom_encouragements_enabled };
}

async function list(userId) {
    return camelizeRows((await getPool().query("SELECT * FROM encouragement_messages WHERE user_id=$1 ORDER BY created_at", [userId])).rows);
}

async function create(userId, message) {
    return camelizeRow((await getPool().query("INSERT INTO encouragement_messages(id,user_id,message) VALUES($1,$2,$3) RETURNING *", [crypto.randomUUID(), userId, message])).rows[0]);
}

async function update(userId, id, message, enabled) {
    const result = await getPool().query("UPDATE encouragement_messages SET message=$3,enabled=$4,updated_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING *", [id, userId, message, enabled]);
    if (!result.rowCount) fail("Encouragement message not found", 404);
    return camelizeRow(result.rows[0]);
}

async function remove(userId, id) {
    const result = await getPool().query("DELETE FROM encouragement_messages WHERE id=$1 AND user_id=$2", [id, userId]);
    if (!result.rowCount) fail("Encouragement message not found", 404);
}

async function available(userId) {
    const settings = await getSettings(userId);
    const custom = settings.enabled ? (await getPool().query("SELECT message FROM encouragement_messages WHERE user_id=$1 AND enabled=TRUE ORDER BY created_at", [userId])).rows.map((row) => row.message) : [];
    return { defaults: defaultMessages, custom, enabled: settings.enabled };
}

module.exports = { defaultMessages, getSettings, updateSettings, list, create, update, remove, available };
