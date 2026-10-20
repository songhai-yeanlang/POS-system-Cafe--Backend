const Joi = require('joi');

const loginSchema = {
    body: Joi.object({
        email: Joi.string().trim().lowercase().email().required().messages({
            'string.empty': 'Email is required',
            'string.email': 'Invalid email format',
            'any.required': 'Email is required'
        }),
        password: Joi.string().min(6).required().messages({
            'string.empty': 'Password is required',
            'string.min': 'Password must be at least 6 characters',
            'any.required': 'Password is required'
        })
    })
};

const refreshTokenSchema = {
    body: Joi.object({
        refreshToken: Joi.string().required().messages({
            'string.empty': 'Refresh token is required',
            'any.required': 'Refresh token is required'
        })
    })
};

const logoutSchema = {
    body: Joi.object({
        refreshToken: Joi.string().required().messages({
            'string.empty': 'Refresh token is required',
            'any.required': 'Refresh token is required'
        })
    })
};

const changePasswordSchema = {
    body: Joi.object({
        currentPassword: Joi.string().required().messages({
            'string.empty': 'Current password is required',
            'any.required': 'Current password is required'
        }),
        newPassword: Joi.string().min(6).invalid(Joi.ref('currentPassword')).required().messages({
            'string.empty': 'New password is required',
            'string.min': 'New password must be at least 6 characters',
            'any.invalid': 'New password must be different from current password',
            'any.required': 'New password is required'
        }),
        confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required().messages({
            'string.empty': 'Confirm password is required',
            'any.only': 'Confirm password must match new password',
            'any.required': 'Confirm password is required'
        })
    })
};

const updateProfileSchema = {
    body: Joi.object({
        name: Joi.string().trim().min(2).max(150).required().messages({
            'string.empty': 'Name is required',
            'string.min': 'Name must be at least 2 characters',
            'string.max': 'Name cannot exceed 150 characters',
            'any.required': 'Name is required'
        })
    })
};

const forgotPasswordSchema = {
    body: Joi.object({
        email: Joi.string().trim().lowercase().email().required().messages({
            'string.empty': 'Email is required',
            'string.email': 'Invalid email format',
            'any.required': 'Email is required'
        })
    })
};

const verifyOtpSchema = {
    body: Joi.object({
        email: Joi.string().trim().lowercase().email().required().messages({
            'string.empty': 'Email is required',
            'string.email': 'Invalid email format',
            'any.required': 'Email is required'
        }),
        otp: Joi.string().trim().length(6).pattern(/^[0-9]+$/).required().messages({
            'string.empty': 'OTP is required',
            'string.length': 'OTP must be exactly 6 digits',
            'string.pattern.base': 'OTP must contain numbers only',
            'any.required': 'OTP is required'
        })
    })
};

const resetPasswordSchema = {
    body: Joi.object({
        resetToken: Joi.string().trim().required().messages({
            'string.empty': 'Reset token is required',
            'any.required': 'Reset token is required'
        }),
        newPassword: Joi.string().min(6).required().messages({
            'string.empty': 'New password is required',
            'string.min': 'New password must be at least 6 characters',
            'any.required': 'New password is required'
        }),
        confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required().messages({
            'string.empty': 'Confirm password is required',
            'any.only': 'Confirm password must match new password',
            'any.required': 'Confirm password is required'
        })
    })
};

module.exports = {
    loginSchema,
    refreshTokenSchema,
    logoutSchema,
    changePasswordSchema,
    updateProfileSchema,
    forgotPasswordSchema,
    verifyOtpSchema,
    resetPasswordSchema
};

