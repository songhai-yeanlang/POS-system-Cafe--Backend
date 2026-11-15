const jwt = require('jsonwebtoken');
const ApiError = require('../utils/api-error');
const env = require('../config/env.config');
const { connection: pool } = require('../config/db.config');

const authenticate = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next(ApiError.unauthorized('Authentication required. No token provided.'));
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, env.jwt.secret);

        const [rows] = await pool.query(
            'SELECT id, name, email, role, is_active FROM users WHERE id = ? LIMIT 1',
            [decoded.id]
        );
        const dbUser = rows[0];
        if (!dbUser) {
            return next(ApiError.unauthorized('User account no longer exists.'));
        }
        if (!dbUser.is_active) {
            return next(ApiError.forbidden('Your account has been deactivated.'));
        }

        req.user = {
            ...decoded,
            id: dbUser.id,
            name: dbUser.name,
            email: dbUser.email,
            role: dbUser.role
        };
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
