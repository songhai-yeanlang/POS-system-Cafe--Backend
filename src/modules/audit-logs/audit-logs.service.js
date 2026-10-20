const auditLogsModel = require('./audit-logs.model');
const ApiError = require('../../utils/api-error');

const getAllAuditLogs = async (queryParams = {}) => {
    const page = parseInt(queryParams.page, 10) || 1;
    const limit = parseInt(queryParams.limit, 10) || 20;
    const offset = (page - 1) * limit;

    const filters = {
        userId: queryParams.user_id,
        action: queryParams.action,
        tableName: queryParams.table_name,
        startDate: queryParams.start_date,
        endDate: queryParams.end_date,
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

module.exports = {
    getAllAuditLogs,
    getAuditLogById,
    createAuditLog
};
