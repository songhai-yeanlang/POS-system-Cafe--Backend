const path = require('path');
const fs = require('fs');
const settingModel = require('./setting.model');
const auditLogsModel = require('../audit-logs/audit-logs.model');
const ApiError = require('../../utils/api-error');

const LOGO_UPLOAD_DIR = path.resolve(__dirname, '../../../uploads/logo');
const PRODUCTS_UPLOAD_DIR = path.resolve(__dirname, '../../../uploads/products');

const safeRemoveLocalLogo = (logoPath, excludeFilename = null) => {
    if (!logoPath || typeof logoPath !== 'string' || !logoPath.startsWith('/uploads/logo/')) {
        return;
    }
    const filename = path.basename(logoPath);
    if (!filename || filename === '.' || filename === '..' || filename === excludeFilename) {
        return;
    }
    const filePath = path.resolve(LOGO_UPLOAD_DIR, filename);
    if (!filePath.startsWith(LOGO_UPLOAD_DIR + path.sep)) {
        return;
    }
    if (fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
        } catch (err) {
            console.error('Failed to delete logo file from disk:', err.message);
        }
    }
};

const safeRemoveLocalProductImage = (imgPath) => {
    if (!imgPath || typeof imgPath !== 'string' || !imgPath.startsWith('/uploads/products/')) {
        return;
    }
    const filename = path.basename(imgPath);
    if (!filename || filename === '.' || filename === '..') {
        return;
    }
    const filePath = path.resolve(PRODUCTS_UPLOAD_DIR, filename);
    if (!filePath.startsWith(PRODUCTS_UPLOAD_DIR + path.sep)) {
        return;
    }
    if (fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
        } catch (err) {
            console.error('Failed to delete product image during clearData:', err.message);
        }
    }
};

const ensureSettingsExist = async () => {
    let settings = await settingModel.findSettings();
    if (!settings) {
        await settingModel.insertDefaultSettings();
        settings = await settingModel.findSettings();
    }
    return settings;
};

const getSettings = async () => {
    const settings = await ensureSettingsExist();
    if (!settings) {
        throw ApiError.notFound('Shop settings not found');
    }
    return settings;
};

const updateSettings = async ({ updateData, updaterId, ipAddress }) => {
    // 1. Ensure current settings exist
    const currentSettings = await ensureSettingsExist();

    // 2. Perform update via model
    await settingModel.updateSettingsById(1, updateData);

    if (
        updateData.logo !== undefined &&
        updateData.logo !== currentSettings.logo &&
        currentSettings.logo
    ) {
        safeRemoveLocalLogo(currentSettings.logo);
    }

    // 3. Fetch fresh settings
    const updatedSettings = await settingModel.findSettings();

    // 4. Record audit log
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
    const currentSettings = await ensureSettingsExist();

    const relativeLogoPath = `/uploads/logo/${logoFilename}`;

    // 2. Remove old logo file if it exists locally in /uploads/logo
    safeRemoveLocalLogo(currentSettings.logo, logoFilename);

    // 3. Update database
    await settingModel.updateSettingsById(1, { logo: relativeLogoPath });
    const updatedSettings = await settingModel.findSettings();

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
    const currentSettings = await ensureSettingsExist();

    if (!currentSettings.logo) {
        throw ApiError.badRequest('No shop logo exists to delete');
    }

    const previousLogo = currentSettings.logo;

    // 2. Remove file from disk if stored locally in /uploads/logo/
    safeRemoveLocalLogo(previousLogo);

    // 3. Update database to set logo = null
    await settingModel.updateSettingsById(1, { logo: null });
    const updatedSettings = await settingModel.findSettings();

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

const clearData = async ({ targets, target, userId, ipAddress }) => {
    let normalizedTargets = ['ALL'];

    if (Array.isArray(targets) && targets.length > 0) {
        normalizedTargets = targets.map((t) => String(t).trim().toUpperCase());
    } else if (typeof targets === 'string' && targets.trim()) {
        normalizedTargets = [targets.trim().toUpperCase()];
    } else if (typeof target === 'string' && target.trim()) {
        normalizedTargets = [target.trim().toUpperCase()];
    }

    const { clearedTables, removedProductImages } = await settingModel.clearSystemData(normalizedTargets);

    // Clean up local product images from disk if products were cleared
    if (Array.isArray(removedProductImages) && removedProductImages.length > 0) {
        for (const imgPath of removedProductImages) {
            safeRemoveLocalProductImage(imgPath);
        }
    }

    // Record audit log
    try {
        await auditLogsModel.insertAuditLog({
            userId: userId || null,
            action: 'CLEAR_SYSTEM_DATA',
            tableName: 'settings',
            recordId: 1,
            details: {
                targets: normalizedTargets,
                cleared_tables: clearedTables
            },
            ipAddress
        });
    } catch (err) {
        console.error('Failed to write audit log for clearData:', err.message);
    }

    return {
        targets: normalizedTargets,
        cleared_tables: clearedTables
    };
};

module.exports = {
    getSettings,
    updateSettings,
    updateLogo,
    deleteLogo,
    clearData
};
