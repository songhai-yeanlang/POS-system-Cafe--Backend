const express = require('express');
const router = express.Router();
const settingController = require('./setting.controller');
const { updateSettingsSchema } = require('./setting.validation');
const { authenticate, authorize } = require('../../middlewares/authenticate');
const validate = require('../../middlewares/validate');
const { uploadLogo } = require('../../middlewares/upload');


router.get('/settings', authenticate, settingController.getSettings);
router.put('/settings', authenticate, authorize('OWNER'), validate(updateSettingsSchema), settingController.updateSettings);
router.put('/settings/logo', authenticate, authorize('OWNER'), uploadLogo, settingController.uploadLogo);
router.delete('/settings/logo', authenticate, authorize('OWNER'), settingController.deleteLogo);


module.exports = router;