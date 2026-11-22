const rateLimit = require('express-rate-limit');
const ApiError = require('../utils/api-error');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Max 10 attempts per IP per window
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many login attempts from this IP, please try again after 15 minutes'
    }
});

const otpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Max 5 OTP requests per IP per 15 minutes
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many OTP requests from this IP. Please try again after 15 minutes.'
    }
});

const passwordActionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Max 10 password change/reset attempts per IP per 15 minutes
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many password requests from this IP. Please try again after 15 minutes.'
    }
});

const refreshTokenLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30, // Max 30 refresh requests per IP per 15 minutes
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many token refresh requests from this IP. Please try again after 15 minutes.'
    }
});

// Brute-force protection for OWNER approval password attempts (discounts & refunds)
const APPROVAL_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_APPROVAL_FAILURES = 5;
const approvalFailures = new Map();

const checkApprovalRateLimit = (key) => {
    if (!key) return;
    const entry = approvalFailures.get(String(key));
    if (!entry) return;
    if (Date.now() - entry.firstFailedAt > APPROVAL_WINDOW_MS) {
        approvalFailures.delete(String(key));
        return;
    }
    if (entry.count >= MAX_APPROVAL_FAILURES) {
        throw new ApiError(
            429,
            'Too many failed OWNER password approval attempts. Please try again after 15 minutes.'
        );
    }
};

const recordApprovalFailure = (key) => {
    if (!key) return;
    const k = String(key);
    const now = Date.now();
    const entry = approvalFailures.get(k);
    if (!entry || now - entry.firstFailedAt > APPROVAL_WINDOW_MS) {
        approvalFailures.set(k, { count: 1, firstFailedAt: now });
    } else {
        entry.count += 1;
    }
};

const clearApprovalFailures = (key) => {
    if (!key) return;
    approvalFailures.delete(String(key));
};

module.exports = {
    loginLimiter,
    otpLimiter,
    passwordActionLimiter,
    refreshTokenLimiter,
    checkApprovalRateLimit,
    recordApprovalFailure,
    clearApprovalFailures
};

