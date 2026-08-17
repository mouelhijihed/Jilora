require("dotenv").config({ quiet: true });
const { Client } = require("pg");

function validateConfiguredUrl(value) {
    if (!value) throw new Error("Set TEST_DATABASE_URL to an explicitly disposable local PostgreSQL database.");
    const parsed = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error("TEST_DATABASE_URL must use PostgreSQL.");
    if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname.toLowerCase())) {
        throw new Error("createTestDatabase only creates local databases.");
    }
    const databaseName = decodeURIComponent(parsed.pathname.slice(1));
    if (!/test/i.test(databaseName)) throw new Error("The test database name must contain 'test'.");
    if (process.env.DATABASE_URL) {
        const production = new URL(process.env.DATABASE_URL);
        if (production.hostname === parsed.hostname && production.port === parsed.port && production.pathname === parsed.pathname) {
            throw new Error("TEST_DATABASE_URL must not point to DATABASE_URL.");
        }
    }
    return parsed;
}

async function main() {
    const source = validateConfiguredUrl(process.env.TEST_DATABASE_URL);
    const testName = decodeURIComponent(source.pathname.slice(1));
    const admin = new URL(source);
    admin.pathname = "/postgres";
    const client = new Client({
        connectionString: admin.toString(),
        ssl: false,
    });
    await client.connect();
    const exists = await client.query("SELECT 1 FROM pg_database WHERE datname=$1", [testName]);
    if (!exists.rowCount) await client.query(`CREATE DATABASE ${testName}`);
    await client.end();
    process.stdout.write(source.toString());
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
