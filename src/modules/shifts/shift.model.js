const { connection: pool } = require('../../config/db.config');

const findActiveShiftByUserId = async (userId, connection = pool) => {
    const [rows] = await connection.query(
        `SELECT 
            s.id,
            s.user_id,
            u.name AS user_name,
            u.email AS user_email,
            u.role AS user_role,
            s.opened_at,
            s.closed_at,
            CAST(s.opening_cash_usd AS DOUBLE) AS opening_cash_usd,
            CAST(s.opening_cash_khr AS DOUBLE) AS opening_cash_khr,
            CAST(s.expected_cash_usd AS DOUBLE) AS expected_cash_usd,
            CAST(s.expected_cash_khr AS DOUBLE) AS expected_cash_khr,
            CAST(s.closing_cash_usd AS DOUBLE) AS closing_cash_usd,
            CAST(s.closing_cash_khr AS DOUBLE) AS closing_cash_khr,
            s.status,
            s.note
         FROM shifts s
         JOIN users u ON u.id = s.user_id
         WHERE s.user_id = ? AND s.status = 'OPEN'
         LIMIT 1`,
        [userId]
    );
    return rows[0] || null;
};

const findShiftById = async (id, connection = pool) => {
    const [rows] = await connection.query(
        `SELECT 
            s.id,
            s.user_id,
            u.name AS user_name,
            u.email AS user_email,
            u.role AS user_role,
            s.opened_at,
            s.closed_at,
            CAST(s.opening_cash_usd AS DOUBLE) AS opening_cash_usd,
            CAST(s.opening_cash_khr AS DOUBLE) AS opening_cash_khr,
            CAST(s.expected_cash_usd AS DOUBLE) AS expected_cash_usd,
            CAST(s.expected_cash_khr AS DOUBLE) AS expected_cash_khr,
            CAST(s.closing_cash_usd AS DOUBLE) AS closing_cash_usd,
            CAST(s.closing_cash_khr AS DOUBLE) AS closing_cash_khr,
            s.status,
            s.note
         FROM shifts s
         JOIN users u ON u.id = s.user_id
         WHERE s.id = ?
         LIMIT 1`,
        [id]
    );
    return rows[0] || null;
};

const calculateShiftSummary = async (shiftId, connection = pool) => {
    // 1. Orders summary (paid, open, cancelled)
    const [orderRows] = await connection.query(
        `SELECT 
            CAST(COALESCE(SUM(CASE WHEN status = 'PAID' THEN 1 ELSE 0 END), 0) AS SIGNED) AS paid_orders_count,
            CAST(COALESCE(SUM(CASE WHEN status = 'PAID' THEN total ELSE 0 END), 0) AS DOUBLE) AS total_sales_usd,
            CAST(COALESCE(SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END), 0) AS SIGNED) AS open_orders_count,
            CAST(COALESCE(SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END), 0) AS SIGNED) AS cancelled_orders_count
         FROM orders
         WHERE shift_id = ?`,
        [shiftId]
    );

    // 2. Payments summary (received_amount for cash drawer accuracy, plus change and KHQR)
    const [paymentRows] = await connection.query(
        `SELECT 
            method,
            currency,
            CAST(COALESCE(SUM(amount), 0) AS DOUBLE) AS total_amount,
            CAST(COALESCE(SUM(COALESCE(received_amount, amount)), 0) AS DOUBLE) AS total_received_amount,
            CAST(COALESCE(SUM(change_usd), 0) AS DOUBLE) AS total_change_usd,
            CAST(COALESCE(SUM(change_khr), 0) AS DOUBLE) AS total_change_khr
         FROM payments
         WHERE shift_id = ? AND status = 'COMPLETED'
         GROUP BY method, currency`,
        [shiftId]
    );

    // 3. Cash Expenses
    const [expenseRows] = await connection.query(
        `SELECT 
            payment_method,
            currency,
            CAST(COALESCE(SUM(amount), 0) AS DOUBLE) AS total_amount
         FROM expenses
         WHERE shift_id = ? AND status = 'ACTIVE'
         GROUP BY payment_method, currency`,
        [shiftId]
    );

    // 4. Cash Refunds
    const [refundRows] = await connection.query(
        `SELECT 
            method,
            currency,
            CAST(COALESCE(SUM(amount), 0) AS DOUBLE) AS total_amount
         FROM refunds
         WHERE shift_id = ? AND status = 'COMPLETED'
         GROUP BY method, currency`,
        [shiftId]
    );

    return {
        orders: orderRows[0] || { paid_orders_count: 0, total_sales_usd: 0, open_orders_count: 0, cancelled_orders_count: 0 },
        payments: paymentRows,
        expenses: expenseRows,
        refunds: refundRows
    };
};

const countOpenOrdersByShiftId = async (shiftId, connection = pool) => {
    const [rows] = await connection.query(
        `SELECT COUNT(*) AS total FROM orders WHERE shift_id = ? AND status = 'OPEN'`,
        [shiftId]
    );
    return Number(rows[0]?.total || 0);
};

const insertShift = async ({ userId, openingCashUsd = 0, openingCashKhr = 0, note = null }, connection = pool) => {
    const [result] = await connection.query(
        `INSERT INTO shifts (user_id, opening_cash_usd, opening_cash_khr, status, note)
         VALUES (?, ?, ?, 'OPEN', ?)`,
        [userId, openingCashUsd, openingCashKhr, note]
    );
    return result.insertId;
};

const closeShiftById = async ({
    shiftId,
    expectedCashUsd,
    expectedCashKhr,
    closingCashUsd,
    closingCashKhr,
    note = null
}, connection = pool) => {
    const [result] = await connection.query(
        `UPDATE shifts SET
            closed_at = CURRENT_TIMESTAMP,
            expected_cash_usd = ?,
            expected_cash_khr = ?,
            closing_cash_usd = ?,
            closing_cash_khr = ?,
            status = 'CLOSED',
            note = ?
         WHERE id = ? AND status = 'OPEN'`,
        [expectedCashUsd, expectedCashKhr, closingCashUsd, closingCashKhr, note, shiftId]
    );
    return result.affectedRows;
};

const findAllShifts = async ({ userId, status, startDate, endDate, limit, offset } = {}, connection = pool) => {
    let sql = `
        SELECT 
            s.id,
            s.user_id,
            u.name AS user_name,
            u.email AS user_email,
            u.role AS user_role,
            s.opened_at,
            s.closed_at,
            CAST(s.opening_cash_usd AS DOUBLE) AS opening_cash_usd,
            CAST(s.opening_cash_khr AS DOUBLE) AS opening_cash_khr,
            CAST(s.expected_cash_usd AS DOUBLE) AS expected_cash_usd,
            CAST(s.expected_cash_khr AS DOUBLE) AS expected_cash_khr,
            CAST(s.closing_cash_usd AS DOUBLE) AS closing_cash_usd,
            CAST(s.closing_cash_khr AS DOUBLE) AS closing_cash_khr,
            s.status,
            s.note
        FROM shifts s
        JOIN users u ON u.id = s.user_id
        WHERE 1=1
    `;
    const params = [];

    if (userId) {
        sql += ` AND s.user_id = ?`;
        params.push(userId);
    }

    if (status) {
        sql += ` AND s.status = ?`;
        params.push(status);
    }

    if (startDate) {
        sql += ` AND s.opened_at >= ?`;
        params.push(startDate);
    }

    if (endDate) {
        sql += ` AND s.opened_at <= ?`;
        params.push(endDate);
    }

    sql += ` ORDER BY s.opened_at DESC, s.id DESC`;

    if (limit !== undefined && limit !== null && offset !== undefined && offset !== null) {
        sql += ` LIMIT ? OFFSET ?`;
        params.push(Number(limit), Number(offset));
    }

    const [rows] = await connection.query(sql, params);
    return rows;
};

const countAllShifts = async ({ userId, status, startDate, endDate } = {}, connection = pool) => {
    let sql = `SELECT COUNT(*) AS total FROM shifts s WHERE 1=1`;
    const params = [];

    if (userId) {
        sql += ` AND s.user_id = ?`;
        params.push(userId);
    }

    if (status) {
        sql += ` AND s.status = ?`;
        params.push(status);
    }

    if (startDate) {
        sql += ` AND s.opened_at >= ?`;
        params.push(startDate);
    }

    if (endDate) {
        sql += ` AND s.opened_at <= ?`;
        params.push(endDate);
    }

    const [rows] = await connection.query(sql, params);
    return rows[0].total;
};

module.exports = {
    findActiveShiftByUserId,
    findShiftById,
    calculateShiftSummary,
    countOpenOrdersByShiftId,
    insertShift,
    closeShiftById,
    findAllShifts,
    countAllShifts
};
