const auditLogsService = require('./audit-logs.service');

const getAllAuditLogs = async (req, res, next) => {
    try {
        const result = await auditLogsService.getAllAuditLogs(req.query);
        res.status(200).json({
            success: true,
            message: 'Audit logs retrieved successfully',
            data: result.logs,
            pagination: result.pagination
        });
    } catch (error) {
        next(error);
    }
};

const getAuditLogById = async (req, res, next) => {
    try {
        const log = await auditLogsService.getAuditLogById(req.params.id);
        res.status(200).json({
            success: true,
            message: 'Audit log retrieved successfully',
            data: log
        });
    } catch (error) {
        next(error);
    }
};

const deleteAuditLog = async (req, res, next) => {
    try {
        await auditLogsService.deleteAuditLog(req.params.id);
        res.status(200).json({
            success: true,
            message: 'Audit log deleted successfully'
        });
    } catch (error) {
        next(error);
    }
};

const clearAuditLogs = async (req, res, next) => {
    try {
        await auditLogsService.clearAuditLogs();
        res.status(200).json({
            success: true,
            message: 'All audit logs cleared successfully'
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getAllAuditLogs,
    getAuditLogById,
    deleteAuditLog,
    clearAuditLogs
};
