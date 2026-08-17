const session = require("express-session");
const { getPool } = require("./pool");

let lastCleanupAt = 0;

function cleanupExpiredSessions() {
    const now = Date.now();
    if (now - lastCleanupAt < 60 * 60 * 1000) return Promise.resolve();
    lastCleanupAt = now;
    return getPool().query("DELETE FROM app_sessions WHERE expires_at<=NOW()").catch((error) => {
        lastCleanupAt = 0;
        console.error("Expired session cleanup failed", { message: error.message });
    });
}

class PostgresSessionStore extends session.Store {
    get(sid, callback) {
        getPool().query("SELECT sess FROM app_sessions WHERE sid = $1 AND expires_at > NOW()", [sid])
            .then((result) => callback(null, result.rows[0]?.sess || null), callback);
    }

    set(sid, value, callback = () => {}) {
        const expiresAt = value.cookie?.expires ? new Date(value.cookie.expires) : new Date(Date.now() + 7 * 86400000);
        cleanupExpiredSessions().then(() => getPool().query(
            `INSERT INTO app_sessions(sid, sess, expires_at) VALUES ($1, $2, $3)
             ON CONFLICT (sid) DO UPDATE SET sess = EXCLUDED.sess, expires_at = EXCLUDED.expires_at`,
            [sid, value, expiresAt],
        )).then(() => callback(), callback);
    }

    destroy(sid, callback = () => {}) {
        getPool().query("DELETE FROM app_sessions WHERE sid = $1", [sid]).then(() => callback(), callback);
    }

    touch(sid, value, callback = () => {}) {
        const expiresAt = value.cookie?.expires ? new Date(value.cookie.expires) : new Date(Date.now() + 7 * 86400000);
        getPool().query("UPDATE app_sessions SET expires_at = $2 WHERE sid = $1", [sid, expiresAt]).then(() => callback(), callback);
    }
}

module.exports = { PostgresSessionStore };
