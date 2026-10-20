const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const authModel = require('./auth.model');
const auditLogsModel = require('../audit-logs/audit-logs.model');
const ApiError = require('../../utils/api-error');
const env = require('../../config/env.config');
const mailer = require('../../utils/mailer.util');

const REFRESH_TOKEN_EXPIRY_DAYS = 7;

const hashToken = (token) => {
    return crypto.createHash('sha256').update(token).digest('hex');
};

const generateRefreshTokenString = () => {
    return crypto.randomBytes(40).toString('hex');
};

const generateAccessToken = (user) => {
    return jwt.sign(
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
};

const logAudit = async ({ userId = null, action, tableName, recordId = null, details = null, ipAddress = null }) => {
    try {
        await auditLogsModel.insertAuditLog({
            userId,
            action,
            tableName,
            recordId,
            details,
            ipAddress
        });
    } catch (err) {
        console.error(`[AUDIT_LOG_ERROR] Failed to record ${action}:`, err.message);
    }
};

const loginUser = async ({ email, password, userAgent, ipAddress }) => {
    // 1. Find user by email
    const user = await authModel.findUserByEmail(email);
    if (!user) {
        await logAudit({
            userId: null,
            action: 'LOGIN_FAILED',
            tableName: 'users',
            recordId: null,
            details: { email, reason: 'User not found', userAgent },
            ipAddress
        });
        throw ApiError.unauthorized('Invalid email or password');
    }

    // 2. Check if account is active
    if (!user.is_active) {
        await logAudit({
            userId: user.id,
            action: 'LOGIN_FAILED',
            tableName: 'users',
            recordId: user.id,
            details: { email, reason: 'Account deactivated', userAgent },
            ipAddress
        });
        throw ApiError.forbidden('Your account has been deactivated');
    }

    // 3. Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
        await logAudit({
            userId: user.id,
            action: 'LOGIN_FAILED',
            tableName: 'users',
            recordId: user.id,
            details: { email, reason: 'Incorrect password', userAgent },
            ipAddress
        });
        throw ApiError.unauthorized('Invalid email or password');
    }

    // 4. Update last login timestamp
    await authModel.updateLastLogin(user.id);

    // 5. Generate access token
    const token = generateAccessToken(user);

    // 6. Generate and save refresh token
    const rawRefreshToken = generateRefreshTokenString();
    const tokenHash = hashToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    await authModel.saveRefreshToken({
        userId: user.id,
        tokenHash,
        userAgent: userAgent || null,
        ipAddress: ipAddress || null,
        expiresAt
    });

    // 7. Audit log: record successful login
    await logAudit({
        userId: user.id,
        action: 'LOGIN',
        tableName: 'users',
        recordId: user.id,
        details: { email: user.email, role: user.role, userAgent },
        ipAddress
    });

    return {
        token,
        refreshToken: rawRefreshToken,
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role
        }
    };
};

const refreshAccessToken = async ({ refreshToken, userAgent, ipAddress }) => {
    if (!refreshToken) {
        throw ApiError.unauthorized('Refresh token is required');
    }

    // 1. Hash incoming token and look up in database
    const tokenHash = hashToken(refreshToken);
    const tokenRecord = await authModel.findRefreshToken(tokenHash);

    if (!tokenRecord) {
        throw ApiError.unauthorized('Invalid refresh token');
    }

    // 2. Token Reuse Detection (OAuth2 RFC 6819 Security Standard):
    // If a revoked token is presented again, someone might have stolen the token!
    if (tokenRecord.revoked_at) {
        // Immediately revoke ALL active sessions for this user
        await authModel.revokeAllUserRefreshTokens(tokenRecord.user_id);

        await logAudit({
            userId: tokenRecord.user_id,
            action: 'SECURITY_ALERT_TOKEN_REUSE',
            tableName: 'refresh_tokens',
            recordId: tokenRecord.id,
            details: {
                message: 'Revoked refresh token was reused. All active sessions have been revoked to protect the account.',
                userAgent
            },
            ipAddress
        });

        throw ApiError.unauthorized('Suspicious activity detected: Revoked token was reused. All active sessions have been terminated for security.');
    }

    // 3. Verify token has not expired
    if (new Date(tokenRecord.expires_at) <= new Date()) {
        throw ApiError.unauthorized('Refresh token has expired');
    }

    // 4. Check if associated user exists and is active
    const user = await authModel.findUserById(tokenRecord.user_id);
    if (!user) {
        throw ApiError.unauthorized('User not found');
    }

    if (!user.is_active) {
        throw ApiError.forbidden('Your account has been deactivated');
    }

    // 5. Refresh token rotation: Revoke old token
    await authModel.revokeRefreshToken(tokenRecord.id);

    // 6. Generate new refresh token
    const newRawRefreshToken = generateRefreshTokenString();
    const newTokenHash = hashToken(newRawRefreshToken);
    const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    await authModel.saveRefreshToken({
        userId: user.id,
        tokenHash: newTokenHash,
        userAgent: userAgent || tokenRecord.user_agent,
        ipAddress: ipAddress || tokenRecord.ip_address,
        expiresAt: newExpiresAt
    });

    // 7. Generate new access token
    const newAccessToken = generateAccessToken(user);

    return {
        token: newAccessToken,
        refreshToken: newRawRefreshToken
    };
};

const getMe = async (userId) => {
    const user = await authModel.findUserById(userId);
    if (!user) {
        throw ApiError.notFound('User not found');
    }

    if (!user.is_active) {
        throw ApiError.forbidden('Your account has been deactivated');
    }

    return user;
};

const updateProfile = async ({ userId, name, ipAddress }) => {
    const user = await authModel.findUserById(userId);
    if (!user) {
        throw ApiError.notFound('User not found');
    }

    if (!user.is_active) {
        throw ApiError.forbidden('Your account has been deactivated');
    }

    await authModel.updateProfile(userId, { name });

    await logAudit({
        userId,
        action: 'UPDATE_PROFILE',
        tableName: 'users',
        recordId: userId,
        details: { oldName: user.name, newName: name },
        ipAddress
    });

    return await authModel.findUserById(userId);
};

const logoutUser = async ({ refreshToken, userAgent, ipAddress }) => {
    if (!refreshToken) {
        throw ApiError.badRequest('Refresh token is required');
    }

    const tokenHash = hashToken(refreshToken);
    const tokenRecord = await authModel.findRefreshToken(tokenHash);

    // If token exists and is not yet revoked, revoke it and log audit
    if (tokenRecord && !tokenRecord.revoked_at) {
        await authModel.revokeRefreshToken(tokenRecord.id);

        await logAudit({
            userId: tokenRecord.user_id,
            action: 'LOGOUT',
            tableName: 'refresh_tokens',
            recordId: tokenRecord.id,
            details: { userAgent },
            ipAddress
        });
    }

    return true;
};

const logoutAllSessions = async ({ userId, ipAddress }) => {
    await authModel.revokeAllUserRefreshTokens(userId);

    await logAudit({
        userId,
        action: 'LOGOUT_ALL',
        tableName: 'refresh_tokens',
        recordId: null,
        details: { message: 'All active sessions revoked' },
        ipAddress
    });

    return true;
};

const changePassword = async ({ userId, currentPassword, newPassword, ipAddress }) => {
    // 1. Find user with password hash
    const user = await authModel.findUserByIdWithPassword(userId);
    if (!user) {
        throw ApiError.notFound('User not found');
    }

    if (!user.is_active) {
        throw ApiError.forbidden('Your account has been deactivated');
    }

    // 2. Verify current password
    const isCurrentValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isCurrentValid) {
        await logAudit({
            userId,
            action: 'CHANGE_PASSWORD_FAILED',
            tableName: 'users',
            recordId: userId,
            details: { reason: 'Incorrect current password' },
            ipAddress
        });
        throw ApiError.badRequest('Incorrect current password');
    }

    // 3. Ensure new password is not the same as current password
    const isSamePassword = await bcrypt.compare(newPassword, user.password_hash);
    if (isSamePassword) {
        throw ApiError.badRequest('New password must be different from current password');
    }

    // 4. Hash new password
    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);

    // 5. Update password in database
    await authModel.updatePassword(userId, newPasswordHash);

    // 6. Security: Revoke all existing refresh tokens
    await authModel.revokeAllUserRefreshTokens(userId);

    // 7. Audit log: record password change
    await logAudit({
        userId,
        action: 'CHANGE_PASSWORD',
        tableName: 'users',
        recordId: userId,
        details: { message: 'Password changed successfully' },
        ipAddress
    });

    return true;
};

const forgotPassword = async ({ email, ipAddress }) => {
    // 1. Check if user exists
    const user = await authModel.findUserByEmail(email);
    if (!user) {
        throw ApiError.notFound('No account found with this email');
    }

    // 2. Check if user is active
    if (!user.is_active) {
        throw ApiError.forbidden('This account has been deactivated. Please contact the administrator.');
    }

    // 3. Cooldown protection: Check if user requested an OTP less than 60 seconds ago
    const activeReset = await authModel.findActiveResetByEmail(email);
    if (activeReset && activeReset.created_at) {
        const timeDiff = Date.now() - new Date(activeReset.created_at).getTime();
        const cooldownMs = 60 * 1000; // 60 seconds
        if (timeDiff < cooldownMs) {
            const secondsLeft = Math.ceil((cooldownMs - timeDiff) / 1000);
            throw ApiError.badRequest(`Please wait ${secondsLeft} seconds before requesting a new OTP.`);
        }
    }

    // 4. Invalidate previous active requests for this user
    await authModel.invalidatePreviousResets(user.id);

    // 5. Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 1000000).toString();

    // 5. Hash OTP with bcrypt
    const salt = await bcrypt.genSalt(10);
    const otpHash = await bcrypt.hash(otp, salt);

    // 6. Set expiration time to 10 minutes
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // 7. Save to database
    await authModel.createPasswordReset({
        userId: user.id,
        email: user.email,
        otpHash,
        expiresAt
    });

    // 8. Send OTP to user's email
    await mailer.sendResetPasswordOtp({
        to: user.email,
        name: user.name,
        otp
    });

    // 9. Audit log
    await logAudit({
        userId: user.id,
        action: 'FORGOT_PASSWORD_REQUEST',
        tableName: 'password_resets',
        recordId: null,
        details: { email: user.email },
        ipAddress
    });

    return {
        message: 'OTP has been sent to your email',
        // In non-production, provide devOtp for easier testing/debugging
        ...(env.nodeEnv !== 'production' && { devOtp: otp })
    };
};

const verifyOtp = async ({ email, otp, ipAddress }) => {
    // 1. Find active reset record for this email
    const reset = await authModel.findActiveResetByEmail(email);
    if (!reset) {
        throw ApiError.badRequest('No active password reset request found or OTP has expired. Please request a new OTP.');
    }

    // 2. Brute-force protection: check attempts limit
    if (reset.attempts >= 5) {
        throw ApiError.badRequest('Too many incorrect attempts. This OTP is now locked for security. Please request a new OTP.');
    }

    // 3. Verify OTP
    const isMatch = await bcrypt.compare(otp, reset.otp_hash);
    if (!isMatch) {
        await authModel.incrementResetAttempts(reset.id);
        const remainingAttempts = Math.max(0, 4 - reset.attempts);
        throw ApiError.badRequest(`Invalid OTP code. You have ${remainingAttempts} attempts remaining.`);
    }

    // 4. Generate secure reset token
    const resetToken = crypto.randomBytes(32).toString('hex');

    // 5. Save reset token in database
    await authModel.saveResetToken(reset.id, resetToken);

    // 6. Audit log
    await logAudit({
        userId: reset.user_id,
        action: 'VERIFY_OTP_SUCCESS',
        tableName: 'password_resets',
        recordId: reset.id,
        details: { email },
        ipAddress
    });

    return {
        resetToken
    };
};

const resetPassword = async ({ resetToken, newPassword, ipAddress }) => {
    // 1. Find valid reset record by token
    const reset = await authModel.findResetByToken(resetToken);
    if (!reset) {
        throw ApiError.badRequest('Invalid or expired reset token. Please request a new password reset.');
    }

    // 2. Find user with password hash
    const user = await authModel.findUserByIdWithPassword(reset.user_id);
    if (!user) {
        throw ApiError.notFound('User associated with this reset token not found');
    }

    // 3. Prevent setting the same password
    const isSamePassword = await bcrypt.compare(newPassword, user.password_hash);
    if (isSamePassword) {
        throw ApiError.badRequest('New password must be different from your current password');
    }

    // 4. Hash new password
    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);

    // 4. Update password in database
    await authModel.updatePassword(user.id, newPasswordHash);

    // 5. Mark reset record as used
    await authModel.markResetAsUsed(reset.id);

    // 6. Security: Revoke all existing sessions for this user across all devices
    await authModel.revokeAllUserRefreshTokens(user.id);

    // 7. Audit log
    await logAudit({
        userId: user.id,
        action: 'RESET_PASSWORD',
        tableName: 'users',
        recordId: user.id,
        details: { message: 'Password reset via OTP successfully' },
        ipAddress
    });

    return {
        message: 'Password has been reset successfully. Please log in with your new password.'
    };
};

module.exports = {
    loginUser,
    refreshAccessToken,
    getMe,
    updateProfile,
    logoutUser,
    logoutAllSessions,
    changePassword,
    forgotPassword,
    verifyOtp,
    resetPassword
};