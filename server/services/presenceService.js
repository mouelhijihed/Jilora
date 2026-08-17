const { getPool } = require("../db/pool");

const presenceTimeoutMs = Math.max(60000, Number(process.env.PRESENCE_TIMEOUT_MS || 120000));

function formatPresence(row) {
    const lastSeenAt = row?.last_seen_at || null;
    const online = Boolean(lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() <= presenceTimeoutMs);
    return { online, status: online ? "Online" : "Offline", lastSeenAt };
}

async function touch(userId, client = getPool()) {
    const row = (await client.query("UPDATE users SET last_seen_at=NOW() WHERE id=$1 RETURNING last_seen_at", [userId])).rows[0];
    return formatPresence(row);
}

async function markOffline(userId, client = getPool()) {
    await client.query("UPDATE users SET last_seen_at=NULL WHERE id=$1", [userId]);
    return { online: false, status: "Offline", lastSeenAt: null };
}

async function getPresence(userId, client = getPool()) {
    const row = (await client.query("SELECT last_seen_at FROM users WHERE id=$1", [userId])).rows[0];
    return formatPresence(row);
}

module.exports = { getPresence, markOffline, presenceTimeoutMs, touch };
