require("dotenv").config();
const fs = require("fs/promises");
const path = require("path");
const { getPool, closePool } = require("./pool");

async function migrate() {
    const directory = path.join(__dirname, "migrations");
    const files = (await fs.readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
    const client = await getPool().connect();
    try {
        await client.query("BEGIN");
        await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
        for (const name of files) {
            const exists = await client.query("SELECT 1 FROM schema_migrations WHERE name = $1", [name]);
            if (exists.rowCount) continue;
            await client.query(await fs.readFile(path.join(directory, name), "utf8"));
            await client.query("INSERT INTO schema_migrations(name) VALUES ($1)", [name]);
            console.log(`Applied migration ${name}`);
        }
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

if (require.main === module) migrate().then(closePool).catch((error) => { console.error(error); process.exitCode = 1; });

module.exports = { migrate };
