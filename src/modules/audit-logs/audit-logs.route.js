const express = require('express');
const router = express.Router();

const auditLogsController = require('./audit-logs.controller');
const { getAuditLogsSchema, getAuditLogByIdSchema } = require('./audit-logs.validation');
const { authenticate, authorize } = require('../../middlewares/authenticate');
const validate = require('../../middlewares/validate');

router.get('/audit-logs', authenticate, authorize('OWNER'), validate(getAuditLogsSchema), auditLogsController.getAllAuditLogs);
router.get('/audit-logs/:id', authenticate, authorize('OWNER'), validate(getAuditLogByIdSchema), auditLogsController.getAuditLogById);

module.exports = router;