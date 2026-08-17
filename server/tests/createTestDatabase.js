require("dotenv").config({ quiet: true });
const { Client } = require("pg");

async function main() {
    const source = new URL(process.env.DATABASE_URL);
    const baseName = source.pathname.slice(1);
    const testName = `${baseName}_partner_test`.replace(/[^a-zA-Z0-9_]/g, "_");
    const admin = new URL(source);
    admin.pathname = "/postgres";
    const client = new Client({
        connectionString: admin.toString(),
        ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" } : undefined,
    });
    await client.connect();
    const exists = await client.query("SELECT 1 FROM pg_database WHERE datname=$1", [testName]);
    if (!exists.rowCount) await client.query(`CREATE DATABASE ${testName}`);
    await client.end();
    source.pathname = `/${testName}`;
    process.stdout.write(source.toString());
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
