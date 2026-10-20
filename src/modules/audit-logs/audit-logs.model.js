const { connection: pool } = require('../../config/db.config');

const findAuditLogs = async ({ userId, action, tableName, startDate, endDate, limit, offset }) => {
    let sql = `
        SELECT 
            al.id,
            al.user_id,
            u.name AS user_name,
            u.email AS user_email,
            u.role AS user_role,
            al.action,
            al.table_name,
            al.record_id,
            al.details,
            al.ip_address,
            al.created_at
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE 1=1
    `;
    const params = [];

    if (userId) {
        sql += ` AND al.user_id = ?`;
        params.push(userId);
    }
    if (action) {
        sql += ` AND al.action = ?`;
        params.push(action);
    }
    if (tableName) {
        sql += ` AND al.table_name = ?`;
        params.push(tableName);
    }
    if (startDate) {
        sql += ` AND al.created_at >= ?`;
        params.push(startDate);
    }
    if (endDate) {
        sql += ` AND al.created_at <= ?`;
        params.push(endDate);
    }

    sql += ` ORDER BY al.created_at DESC LIMIT ? OFFSET ?`;
    params.push(Number(limit), Number(offset));

    const [rows] = await pool.query(sql, params);
    return rows;
};

const countAuditLogs = async ({ userId, action, tableName, startDate, endDate }) => {
    let sql = `
        SELECT COUNT(*) AS total
        FROM audit_logs al
        WHERE 1=1
    `;
    const params = [];

    if (userId) {
        sql += ` AND al.user_id = ?`;
        params.push(userId);
    }
    if (action) {
        sql += ` AND al.action = ?`;
        params.push(action);
    }
    if (tableName) {
        sql += ` AND al.table_name = ?`;
        params.push(tableName);
    }
    if (startDate) {
        sql += ` AND al.created_at >= ?`;
        params.push(startDate);
    }
    if (endDate) {
        sql += ` AND al.created_at <= ?`;
        params.push(endDate);
    }

    const [rows] = await pool.query(sql, params);
    return rows[0].total;
};

const findAuditLogById = async (id) => {
    const sql = `
        SELECT 
            al.id,
            al.user_id,
            u.name AS user_name,
            u.email AS user_email,
            u.role AS user_role,
            al.action,
            al.table_name,
            al.record_id,
            al.details,
            al.ip_address,
            al.created_at
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE al.id = ?
        LIMIT 1
    `;
    const [rows] = await pool.query(sql, [id]);
    return rows[0] || null;
};

const insertAuditLog = async ({ userId = null, action, tableName, recordId = null, details = null, ipAddress = null }) => {
    const detailsJson = details ? (typeof details === 'string' ? details : JSON.stringify(details)) : null;
    const [result] = await pool.query(
        `INSERT INTO audit_logs (user_id, action, table_name, record_id, details, ip_address)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, action, tableName, recordId, detailsJson, ipAddress]
    );
    return result.insertId;
};

module.exports = {
    findAuditLogs,
    countAuditLogs,
    findAuditLogById,
    insertAuditLog
};
