require("dotenv").config({ quiet: true });

function databaseIdentity(value) {
    const parsed = new URL(value);
    return `${parsed.protocol}//${parsed.hostname.toLowerCase()}:${parsed.port || "5432"}${parsed.pathname}`;
}

function validateTestDatabase(value = process.env.TEST_DATABASE_URL) {
    if (!value) throw new Error("TEST_DATABASE_URL is required. Backend tests never use DATABASE_URL.");

    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        throw new Error("TEST_DATABASE_URL must be a valid PostgreSQL URL.");
    }
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error("TEST_DATABASE_URL must use PostgreSQL.");

    const databaseName = decodeURIComponent(parsed.pathname.slice(1));
    if (!/test/i.test(databaseName)) throw new Error("TEST_DATABASE_URL database name must contain 'test'.");
    if (process.env.DATABASE_URL && databaseIdentity(value) === databaseIdentity(process.env.DATABASE_URL)) {
        throw new Error("TEST_DATABASE_URL must not point to DATABASE_URL.");
    }

    const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
    if (!localHosts.has(parsed.hostname.toLowerCase()) && process.env.TEST_DATABASE_ALLOW_REMOTE !== "true") {
        throw new Error("Remote test databases require TEST_DATABASE_ALLOW_REMOTE=true.");
    }
    return parsed;
}

validateTestDatabase();

module.exports = { validateTestDatabase };
