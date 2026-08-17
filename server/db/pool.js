const { Pool, types } = require("pg");

types.setTypeParser(20, (value) => Number(value));

let pool;

function getPool() {
    if (pool) return pool;
    if (!process.env.DATABASE_URL) throw Object.assign(new Error("DATABASE_URL is required"), { code: "DATABASE_URL_MISSING" });
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: Number(process.env.DB_POOL_MAX || 10),
        idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
        connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 5000),
        ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" } : undefined,
    });
    pool.on("error", (error) => console.error("Unexpected PostgreSQL pool error", error));
    return pool;
}

async function withTransaction(callback) {
    const client = await getPool().connect();
    try {
        await client.query("BEGIN");
        const result = await callback(client);
        await client.query("COMMIT");
        return result;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

async function closePool() {
    if (!pool) return;
    const current = pool;
    pool = undefined;
    await current.end();
}

module.exports = { getPool, withTransaction, closePool };
