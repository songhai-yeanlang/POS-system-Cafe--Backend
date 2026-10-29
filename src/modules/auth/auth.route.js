const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const validate = require('../../middlewares/validate');
const { authenticate } = require('../../middlewares/authenticate');
// const { loginLimiter, otpLimiter } = require('../../middlewares/rate-limiter');
const { 
    loginSchema, 
    refreshTokenSchema, 
    logoutSchema, 
    changePasswordSchema, 
    updateProfileSchema,
    forgotPasswordSchema,
    verifyOtpSchema,
    resetPasswordSchema
} = require('./auth.validation');

router.post('/login', /* loginLimiter, */ validate(loginSchema), authController.login);
router.post('/refresh-token', validate(refreshTokenSchema), authController.refreshToken);
router.get('/me', authenticate, authController.getMe);
router.patch('/profile', authenticate, validate(updateProfileSchema), authController.updateProfile);
router.post('/logout', validate(logoutSchema), authController.logout);
router.post('/logout-all', authenticate, authController.logoutAll);
router.patch('/change-password', authenticate, validate(changePasswordSchema), authController.changePassword);

router.post('/forgot-password', /* otpLimiter, */ validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/verify-otp', /* otpLimiter, */ validate(verifyOtpSchema), authController.verifyOtp);
router.post('/reset-password', validate(resetPasswordSchema), authController.resetPassword);

module.exports = router;