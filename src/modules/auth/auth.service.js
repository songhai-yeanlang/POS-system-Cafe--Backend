const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const authModel = require('./auth.model');
const ApiError = require('../../utils/api-error');
const env = require('../../config/env.config');

const loginUser = async ({ email, password }) => {
    // 1. Find user by email
    const user = await authModel.findUserByEmail(email);
    if (!user) {
        throw ApiError.unauthorized('Invalid email or password');
    }

    // 2. Check if account is active
    if (!user.is_active) {
        throw ApiError.forbidden('Your account has been deactivated');
    }

    // 3. Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
        throw ApiError.unauthorized('Invalid email or password');
    }

    // 4. Update last login timestamp
    await authModel.updateLastLogin(user.id);

    // 5. Generate JWT token
    const token = jwt.sign(
        {
            id: user.id,
            email: user.email,
            role: user.role,
            name: user.name
        },
        env.jwt.secret,
        {
            expiresIn: env.jwt.expiresIn
        }
    );

    return {
        token,
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role
        }
    };
};

module.exports = {
    loginUser
};