function envBoolean(name, fallback) {
    const value = process.env[name];
    if (value === undefined || value === "") return fallback;
    return value === "true";
}

function frontendOrigins() {
    const configured = process.env.FRONTEND_URL || process.env.CLIENT_ORIGIN || "http://localhost:5173";
    return configured.split(",").map((value) => value.trim().replace(/\/$/, "")).filter(Boolean);
}

function sessionCookieOptions() {
    const production = process.env.NODE_ENV === "production";
    const secure = envBoolean("SESSION_COOKIE_SECURE", production);
    const sameSite = String(process.env.SESSION_COOKIE_SAME_SITE || "lax").toLowerCase();
    if (!["lax", "strict", "none"].includes(sameSite)) throw new Error("SESSION_COOKIE_SAME_SITE must be lax, strict, or none");
    if (sameSite === "none" && !secure) throw new Error("SESSION_COOKIE_SECURE must be true when SESSION_COOKIE_SAME_SITE is none");
    return {
        httpOnly: true,
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
