const auditLogsModel = require('./audit-logs.model');
const ApiError = require('../../utils/api-error');

const getAllAuditLogs = async (queryParams = {}) => {
    const page = parseInt(queryParams.page, 10) || 1;
    const limit = parseInt(queryParams.limit, 10) || 20;
    const offset = (page - 1) * limit;

    let adjustedEndDate = queryParams.end_date;
    if (adjustedEndDate) {
        if (typeof adjustedEndDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(adjustedEndDate.trim())) {
            adjustedEndDate = `${adjustedEndDate.trim()} 23:59:59.999`;
        } else {
            const d = new Date(adjustedEndDate);
            if (!isNaN(d.getTime())) {
                d.setHours(23, 59, 59, 999);
                adjustedEndDate = d;
            }
        }
    }

    const filters = {
        userId: queryParams.user_id,
        action: queryParams.action,
        tableName: queryParams.table_name,
        startDate: queryParams.start_date,
        endDate: adjustedEndDate,
        limit,
        offset
    };

    const [logs, total] = await Promise.all([
        auditLogsModel.findAuditLogs(filters),
        auditLogsModel.countAuditLogs(filters)
    ]);

    return {
        logs,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        }
    };
};

const getAuditLogById = async (id) => {
    const log = await auditLogsModel.findAuditLogById(id);
    if (!log) {
        throw ApiError.notFound(`Audit log with ID ${id} not found`);
    }
    return log;
};

const createAuditLog = async ({ userId, action, tableName, recordId, details, ipAddress }) => {
    return await auditLogsModel.insertAuditLog({
        userId,
        action,
        tableName,
        recordId,
        details,
        ipAddress
    });
};

const deleteAuditLog = async (id) => {
    const log = await auditLogsModel.findAuditLogById(id);
    if (!log) {
        throw ApiError.notFound(`Audit log with ID ${id} not found`);
    }
    await auditLogsModel.deleteAuditLogById(id);
    return true;
};

const clearAuditLogs = async () => {
    await auditLogsModel.clearAllAuditLogs();
    return true;
};

module.exports = {
    getAllAuditLogs,
    getAuditLogById,
    createAuditLog,
    deleteAuditLog,
    clearAuditLogs
};
