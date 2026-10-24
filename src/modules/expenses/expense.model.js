const { connection: pool } = require('../../config/db.config');

const insertExpense = async ({
    shiftId = null,
    category,
    description,
    paymentMethod,
    currency,
    amount,
    exchangeRate,
    createdBy,
    incurredAt = null
}, connection = pool) => {
    let sql = `
        INSERT INTO expenses (
            shift_id,
            category,
            description,
            payment_method,
            currency,
            amount,
            exchange_rate,
            status,
            created_by,
            incurred_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, COALESCE(?, CURRENT_TIMESTAMP))
    `;
    const params = [
        shiftId,
        category,
        description,
        paymentMethod,
        currency,
        amount,
        exchangeRate,
        createdBy,
        incurredAt
    ];

    const [result] = await connection.query(sql, params);
    return result.insertId;
};

const findExpenseById = async (id, connection = pool) => {
    const [rows] = await connection.query(
        `SELECT 
            e.id,
            e.shift_id,
            e.category,
            e.description,
            e.payment_method,
            e.currency,
            CAST(e.amount AS DOUBLE) AS amount,
            CAST(e.exchange_rate AS DOUBLE) AS exchange_rate,
            CAST(e.amount_usd AS DOUBLE) AS amount_usd,
            e.status,
            e.voided_at,
            e.voided_by,
            vu.name AS voided_by_name,
            e.void_reason,
            e.created_by,
            u.name AS created_by_name,
            u.email AS created_by_email,
            e.incurred_at,
            e.created_at,
            e.updated_at
         FROM expenses e
         JOIN users u ON u.id = e.created_by
         LEFT JOIN users vu ON vu.id = e.voided_by
         WHERE e.id = ?
         LIMIT 1`,
        [id]
    );
    return rows[0] || null;
};

const findAllExpenses = async ({
    shiftId,
    category,
    paymentMethod,
    currency,
    status,
    createdBy,
    startDate,
    endDate,
    search,
    limit = 20,
    offset = 0
} = {}, connection = pool) => {
    let sql = `
        SELECT 
            e.id,
            e.shift_id,
            e.category,
            e.description,
            e.payment_method,
            e.currency,
            CAST(e.amount AS DOUBLE) AS amount,
            CAST(e.exchange_rate AS DOUBLE) AS exchange_rate,
            CAST(e.amount_usd AS DOUBLE) AS amount_usd,
            e.status,
            e.voided_at,
            e.voided_by,
            vu.name AS voided_by_name,
            e.void_reason,
            e.created_by,
            u.name AS created_by_name,
            e.incurred_at,
            e.created_at
        FROM expenses e
        JOIN users u ON u.id = e.created_by
        LEFT JOIN users vu ON vu.id = e.voided_by
        WHERE 1 = 1
    `;
    const params = [];

    if (shiftId) {
        sql += ` AND e.shift_id = ?`;
        params.push(shiftId);
    }
    if (category) {
        sql += ` AND LOWER(e.category) = LOWER(?)`;
        params.push(category.trim());
    }
    if (paymentMethod) {
        sql += ` AND e.payment_method = ?`;
        params.push(paymentMethod);
    }
    if (currency) {
        sql += ` AND e.currency = ?`;
        params.push(currency);
    }
    if (status) {
        sql += ` AND e.status = ?`;
        params.push(status);
    }
    if (createdBy) {
        sql += ` AND e.created_by = ?`;
        params.push(createdBy);
    }
    if (startDate) {
        sql += ` AND e.incurred_at >= ?`;
        params.push(startDate);
    }
    if (endDate) {
        sql += ` AND e.incurred_at <= ?`;
        params.push(endDate);
    }
    if (search && search.trim()) {
        const pattern = `%${search.trim()}%`;
        sql += ` AND (e.description LIKE ? OR e.category LIKE ? OR u.name LIKE ?)`;
        params.push(pattern, pattern, pattern);
    }

    sql += ` ORDER BY e.incurred_at DESC, e.id DESC LIMIT ? OFFSET ?`;
    params.push(Number(limit), Number(offset));

    const [rows] = await connection.query(sql, params);
    return rows;
};

const countAllExpenses = async ({
    shiftId,
    category,
    paymentMethod,
    currency,
    status,
    createdBy,
    startDate,
    endDate,
    search
} = {}, connection = pool) => {
    let sql = `
        SELECT COUNT(e.id) AS total
        FROM expenses e
        JOIN users u ON u.id = e.created_by
        WHERE 1 = 1
    `;
    const params = [];

    if (shiftId) {
        sql += ` AND e.shift_id = ?`;
        params.push(shiftId);
    }
    if (category) {
        sql += ` AND LOWER(e.category) = LOWER(?)`;
        params.push(category.trim());
    }
    if (paymentMethod) {
        sql += ` AND e.payment_method = ?`;
        params.push(paymentMethod);
    }
    if (currency) {
        sql += ` AND e.currency = ?`;
        params.push(currency);
    }
    if (status) {
        sql += ` AND e.status = ?`;
        params.push(status);
    }
    if (createdBy) {
        sql += ` AND e.created_by = ?`;
        params.push(createdBy);
    }
    if (startDate) {
        sql += ` AND e.incurred_at >= ?`;
        params.push(startDate);
    }
    if (endDate) {
        sql += ` AND e.incurred_at <= ?`;
        params.push(endDate);
    }
    if (search && search.trim()) {
        const pattern = `%${search.trim()}%`;
        sql += ` AND (e.description LIKE ? OR e.category LIKE ? OR u.name LIKE ?)`;
        params.push(pattern, pattern, pattern);
    }

    const [rows] = await connection.query(sql, params);
    return Number(rows[0]?.total || 0);
};

const updateExpenseById = async (id, fields = {}, connection = pool) => {
    const setClauses = [];
    const params = [];

    if (fields.category !== undefined) {
        setClauses.push('category = ?');
        params.push(fields.category);
    }
    if (fields.description !== undefined) {
        setClauses.push('description = ?');
        params.push(fields.description);
    }
    if (fields.paymentMethod !== undefined) {
        setClauses.push('payment_method = ?');
        params.push(fields.paymentMethod);
    }
    if (fields.currency !== undefined) {
        setClauses.push('currency = ?');
        params.push(fields.currency);
    }
    if (fields.amount !== undefined) {
        setClauses.push('amount = ?');
        params.push(fields.amount);
    }
    if (fields.exchangeRate !== undefined) {
        setClauses.push('exchange_rate = ?');
        params.push(fields.exchangeRate);
    }
    if (fields.shiftId !== undefined) {
        setClauses.push('shift_id = ?');
        params.push(fields.shiftId);
    }
    if (fields.incurredAt !== undefined) {
        setClauses.push('incurred_at = ?');
        params.push(fields.incurredAt);
    }

    if (!setClauses.length) return 0;

    params.push(id);
    const sql = `UPDATE expenses SET ${setClauses.join(', ')} WHERE id = ? AND status = 'ACTIVE'`;

    const [result] = await connection.query(sql, params);
    return result.affectedRows;
};

const voidExpenseById = async ({ id, voidedBy, voidReason }, connection = pool) => {
    const [result] = await connection.query(
        `UPDATE expenses SET
            status = 'VOIDED',
            voided_at = CURRENT_TIMESTAMP,
            voided_by = ?,
            void_reason = ?
         WHERE id = ? AND status = 'ACTIVE'`,
        [voidedBy, voidReason, id]
    );
    return result.affectedRows;
};

const getExpenseSummary = async ({ startDate, endDate, shiftId } = {}, connection = pool) => {
    let sql = `
        SELECT 
            category,
            currency,
            payment_method,
            COUNT(*) AS count,
            CAST(COALESCE(SUM(amount), 0) AS DOUBLE) AS total_amount,
            CAST(COALESCE(SUM(amount_usd), 0) AS DOUBLE) AS total_amount_usd
        FROM expenses
        WHERE status = 'ACTIVE'
    `;
    const params = [];

    if (startDate) {
        sql += ` AND incurred_at >= ?`;
        params.push(startDate);
    }
    if (endDate) {
        sql += ` AND incurred_at <= ?`;
        params.push(endDate);
    }
    if (shiftId) {
        sql += ` AND shift_id = ?`;
        params.push(shiftId);
    }

    sql += ` GROUP BY category, currency, payment_method ORDER BY total_amount_usd DESC`;

    const [rows] = await connection.query(sql, params);
    return rows;
};

const getShopSettings = async (connection = pool) => {
    const [rows] = await connection.query(
        `SELECT base_currency, CAST(exchange_rate AS DOUBLE) AS exchange_rate FROM settings LIMIT 1`
    );
    return rows[0] || { base_currency: 'USD', exchange_rate: 4100 };
};

module.exports = {
    insertExpense,
    findExpenseById,
    findAllExpenses,
    countAllExpenses,
    updateExpenseById,
    voidExpenseById,
    getExpenseSummary,
    getShopSettings
};
