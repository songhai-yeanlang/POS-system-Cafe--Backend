const fs = require('fs');
const settingService = require('./setting.service');
const ApiError = require('../../utils/api-error');

const getSettings = async (req, res, next) => {
    try {
        const settings = await settingService.getSettings();
        res.status(200).json({
            success: true,
            message: 'Shop settings retrieved successfully',
            data: settings
        });
    } catch (error) {
        next(error);
    }
};

const updateSettings = async (req, res, next) => {
    try {
        const ipAddress = req.ip || req.socket?.remoteAddress || null;
        const updatedSettings = await settingService.updateSettings({
            updateData: req.body,
            updaterId: req.user?.id,
            ipAddress
        });

        res.status(200).json({
            success: true,
            message: 'Shop settings updated successfully',
            data: updatedSettings
        });
    } catch (error) {
        next(error);
    }
};

const uploadLogo = async (req, res, next) => {
    try {
        if (!req.file) {
            throw ApiError.badRequest('Please attach a logo image file (field name: "logo")');
        }

        const ipAddress = req.ip || req.socket?.remoteAddress || null;
        const updatedSettings = await settingService.updateLogo({
            logoFilename: req.file.filename,
            updaterId: req.user?.id,
            ipAddress
        });

        res.status(200).json({
            success: true,
            message: 'Shop logo uploaded successfully',
            data: updatedSettings
        });
    } catch (error) {
        // If an error happens, clean up newly uploaded file if it was saved
        if (req.file?.path && fs.existsSync(req.file.path)) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (_) {}
        }
        next(error);
    }
};

const deleteLogo = async (req, res, next) => {
    try {
        const ipAddress = req.ip || req.socket?.remoteAddress || null;
        const updatedSettings = await settingService.deleteLogo({
            removerId: req.user?.id,
            ipAddress
        });

        res.status(200).json({
            success: true,
            message: 'Shop logo deleted successfully',
            data: updatedSettings
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getSettings,
    updateSettings,
    uploadLogo,
    deleteLogo
};

