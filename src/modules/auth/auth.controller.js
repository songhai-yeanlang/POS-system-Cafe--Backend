const authService = require('./auth.service');

const login = async (req, res, next) => {
    try {
        const userAgent = req.headers['user-agent'] || null;
        const ipAddress = req.ip || req.socket?.remoteAddress || null;

        const result = await authService.loginUser({
            ...req.body,
            userAgent,
            ipAddress
        });

        res.status(200).json({
            success: true,
            message: 'Login successful',
            data: result
        });
    } catch (error) {
        next(error);
    }
};

const refreshToken = async (req, res, next) => {
    try {
        const userAgent = req.headers['user-agent'] || null;
        const ipAddress = req.ip || req.socket?.remoteAddress || null;

        const result = await authService.refreshAccessToken({
            refreshToken: req.body.refreshToken,
            userAgent,
            ipAddress
        });

        res.status(200).json({
            success: true,
            message: 'Token refreshed successfully',
            data: result
        });
    } catch (error) {
        next(error);
    }
};

const getMe = async (req, res, next) => {
    try {
        const user = await authService.getMe(req.user.id);
        res.status(200).json({
            success: true,
            message: 'User profile retrieved successfully',
            data: user
        });
    } catch (error) {
        next(error);
    }
};

const updateProfile = async (req, res, next) => {
    try {
        const ipAddress = req.ip || req.socket?.remoteAddress || null;

        const updatedUser = await authService.updateProfile({
            userId: req.user.id,
            name: req.body.name,
            ipAddress
        });

        res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
            data: updatedUser
        });
    } catch (error) {
        next(error);
    }
};

const logout = async (req, res, next) => {
    try {
        const userAgent = req.headers['user-agent'] || null;
        const ipAddress = req.ip || req.socket?.remoteAddress || null;

        await authService.logoutUser({
            refreshToken: req.body.refreshToken,
            userAgent,
            ipAddress
        });

        res.status(200).json({
            success: true,
            message: 'Logout successful'
        });
    } catch (error) {
        next(error);
    }
};

const logoutAll = async (req, res, next) => {
    try {
        const ipAddress = req.ip || req.socket?.remoteAddress || null;

        await authService.logoutAllSessions({
            userId: req.user.id,
            ipAddress
        });

        res.status(200).json({
            success: true,
            message: 'Logged out from all devices successfully'
        });
    } catch (error) {
        next(error);
    }
};

const changePassword = async (req, res, next) => {
    try {
        const ipAddress = req.ip || req.socket?.remoteAddress || null;

        await authService.changePassword({
            userId: req.user.id,
            currentPassword: req.body.currentPassword,
            newPassword: req.body.newPassword,
            ipAddress
        });

        res.status(200).json({
            success: true,
            message: 'Password changed successfully'
        });
    } catch (error) {
        next(error);
    }
};

const forgotPassword = async (req, res, next) => {
    try {
        const ipAddress = req.ip || req.socket?.remoteAddress || null;
        const result = await authService.forgotPassword({
            email: req.body.email,
            ipAddress
        });

        res.status(200).json({
            success: true,
            message: result.message,
            ...(result.devOtp && { devOtp: result.devOtp })
        });
    } catch (error) {
        next(error);
    }
};

const verifyOtp = async (req, res, next) => {
    try {
        const ipAddress = req.ip || req.socket?.remoteAddress || null;
        const result = await authService.verifyOtp({
            email: req.body.email,
            otp: req.body.otp,
            ipAddress
        });

        res.status(200).json({
            success: true,
            message: 'OTP verified successfully',
            data: result
        });
    } catch (error) {
        next(error);
    }
};

const resetPassword = async (req, res, next) => {
    try {
        const ipAddress = req.ip || req.socket?.remoteAddress || null;
        const result = await authService.resetPassword({
            resetToken: req.body.resetToken,
            newPassword: req.body.newPassword,
            ipAddress
        });

        res.status(200).json({
            success: true,
            message: result.message
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    login,
    refreshToken,
    getMe,
    updateProfile,
    logout,
    logoutAll,
    changePassword,
    forgotPassword,
    verifyOtp,
    resetPassword
};