const path = require('path');
const fs = require('fs');
const settingModel = require('./setting.model');
const auditLogsModel = require('../audit-logs/audit-logs.model');
const ApiError = require('../../utils/api-error');

const getSettings = async () => {
    let settings = await settingModel.getSettings();
    if (!settings) {
        settings = await settingModel.initDefaultSettings();
    }

    if (!settings) {
        throw ApiError.notFound('Shop settings not found');
    }

    return settings;
};

const updateSettings = async ({ updateData, updaterId, ipAddress }) => {
    // 1. Ensure current settings exist
    let currentSettings = await settingModel.getSettings();
    if (!currentSettings) {
        currentSettings = await settingModel.initDefaultSettings();
    }

    // 2. Perform update
    const updatedSettings = await settingModel.updateSettings(updateData);

    // 3. Record audit log
    try {
        await auditLogsModel.insertAuditLog({
            userId: updaterId || null,
            action: 'UPDATE_SETTINGS',
            tableName: 'settings',
            recordId: 1,
            details: updateData,
            ipAddress
        });
    } catch (err) {
        console.error('Failed to write audit log for updateSettings:', err.message);
    }

    return updatedSettings;
};

const updateLogo = async ({ logoFilename, updaterId, ipAddress }) => {
    // 1. Ensure current settings exist
    let currentSettings = await settingModel.getSettings();
    if (!currentSettings) {
        currentSettings = await settingModel.initDefaultSettings();
    }

    const relativeLogoPath = `/uploads/logo/${logoFilename}`;

    // 2. Remove old logo file if it exists locally in /uploads/logo
    if (currentSettings.logo && currentSettings.logo.startsWith('/uploads/logo/')) {
        const oldFilename = path.basename(currentSettings.logo);
        const oldFilePath = path.join(__dirname, '../../../uploads/logo', oldFilename);
        if (fs.existsSync(oldFilePath) && oldFilename !== logoFilename) {
            try {
                fs.unlinkSync(oldFilePath);
            } catch (err) {
                console.error('Failed to delete old logo file:', err.message);
            }
        }
    }

    // 3. Update database
    const updatedSettings = await settingModel.updateSettings({ logo: relativeLogoPath });

    // 4. Record audit log
    try {
        await auditLogsModel.insertAuditLog({
            userId: updaterId || null,
            action: 'UPLOAD_LOGO',
            tableName: 'settings',
            recordId: 1,
            details: { logo: relativeLogoPath },
            ipAddress
        });
    } catch (err) {
        console.error('Failed to write audit log for uploadLogo:', err.message);
    }

    return updatedSettings;
};

const deleteLogo = async ({ removerId, ipAddress }) => {
    // 1. Ensure current settings exist
    let currentSettings = await settingModel.getSettings();
    if (!currentSettings) {
        currentSettings = await settingModel.initDefaultSettings();
    }

    if (!currentSettings.logo) {
        throw ApiError.badRequest('No shop logo exists to delete');
    }

    const previousLogo = currentSettings.logo;

    // 2. Remove file from disk if stored locally in /uploads/logo/
    if (previousLogo.startsWith('/uploads/logo/')) {
        const filename = path.basename(previousLogo);
        const filePath = path.join(__dirname, '../../../uploads/logo', filename);
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
            } catch (err) {
                console.error('Failed to delete logo file from disk:', err.message);
            }
        }
    }

    // 3. Update database to set logo = null
    const updatedSettings = await settingModel.updateSettings({ logo: null });

    // 4. Record audit log
    try {
        await auditLogsModel.insertAuditLog({
            userId: removerId || null,
            action: 'DELETE_LOGO',
            tableName: 'settings',
            recordId: 1,
            details: { removedLogo: previousLogo },
            ipAddress
        });
    } catch (err) {
        console.error('Failed to write audit log for deleteLogo:', err.message);
    }

    return updatedSettings;
};

module.exports = {
    getSettings,
    updateSettings,
    updateLogo,
    deleteLogo
};

