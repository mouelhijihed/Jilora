function notFound(_request, response) {
    response.status(404).json({ message: "Endpoint not found" });
}

function errorHandler(error, _request, response, _next) {
    const knownStatus = Number(error.status);
    if (knownStatus >= 400 && knownStatus < 600) return response.status(knownStatus).json({ message: error.message });
    if (error.code === "23505") return response.status(409).json({ message: "A record with these details already exists" });
    if (error.code === "23503") return response.status(409).json({ message: "This record is still referenced by other data" });
    if (error.code === "22P02") return response.status(400).json({ message: "A supplied identifier is invalid" });
    if (error.code === "DATABASE_URL_MISSING") return response.status(503).json({ message: "Database is not configured" });
    console.error(error);
    response.status(500).json({ message: "An unexpected server error occurred" });
}

module.exports = { notFound, errorHandler };
