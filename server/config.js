function envBoolean(name, fallback) {
    const value = process.env[name];
    if (value === undefined || value === "") return fallback;
    return value === "true";
}

function frontendOrigins() {
    const production = process.env.NODE_ENV === "production";
    const configured = process.env.FRONTEND_URL || process.env.CLIENT_ORIGIN;
    if (production && !configured) throw new Error("FRONTEND_URL must be configured in production");
    const origins = String(configured || "http://localhost:5173")
        .split(",")
        .map((value) => value.trim().replace(/\/$/, ""))
        .filter(Boolean);
    for (const origin of origins) {
        let parsed;
        try { parsed = new URL(origin); } catch { throw new Error(`Invalid frontend origin: ${origin}`); }
        if (parsed.origin !== origin) throw new Error(`FRONTEND_URL entries must be origins without paths: ${origin}`);
    }
    return origins;
}

function sessionCookieOptions() {
    const production = process.env.NODE_ENV === "production";
    const secure = envBoolean("SESSION_COOKIE_SECURE", production);
    const sameSite = String(process.env.SESSION_COOKIE_SAME_SITE || (production ? "none" : "lax")).toLowerCase();
    const partitioned = envBoolean("SESSION_COOKIE_PARTITIONED", production && sameSite === "none");
    if (!["lax", "strict", "none"].includes(sameSite)) throw new Error("SESSION_COOKIE_SAME_SITE must be lax, strict, or none");
    if (sameSite === "none" && !secure) throw new Error("SESSION_COOKIE_SECURE must be true when SESSION_COOKIE_SAME_SITE is none");
    if (partitioned && !secure) throw new Error("SESSION_COOKIE_SECURE must be true when SESSION_COOKIE_PARTITIONED is true");
    return {
        httpOnly: true,
        partitioned,
        sameSite,
        secure,
        maxAge: Number(process.env.SESSION_TTL_MS || 604800000),
        path: "/",
        ...(process.env.SESSION_COOKIE_DOMAIN ? { domain: process.env.SESSION_COOKIE_DOMAIN } : {}),
    };
}

function sessionCookieClearOptions() {
    const { maxAge: _maxAge, ...options } = sessionCookieOptions();
    return options;
}

module.exports = { frontendOrigins, sessionCookieClearOptions, sessionCookieOptions };
