const jwt = require('jsonwebtoken');
const ApiError = require('../utils/api-error');
const env = require('../config/env.config');

const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next(ApiError.unauthorized('Authentication required. No token provided.'));
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, env.jwt.secret);
        req.user = decoded;
        next();
    } catch (error) {
        next(error);
    }
};

const authorize = (...roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
        return next(ApiError.forbidden('Forbidden: You do not have permission to access this resource.'));
    }
    next();
};

module.exports = { authenticate, authorize };
