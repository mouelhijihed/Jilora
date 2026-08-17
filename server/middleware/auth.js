function requireAuth(request, response, next) {
    if (!request.session?.userId) return response.status(401).json({ message: "Authentication required" });
    request.userId = request.session.userId;
    next();
}

module.exports = { requireAuth };
