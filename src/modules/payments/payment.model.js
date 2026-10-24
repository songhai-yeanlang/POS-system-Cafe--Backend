const { connection: pool } = require('../../config/db.config');

const findPaymentById = async (id, connection = pool) => {
    const [rows] = await connection.query(
        `SELECT 
            p.id,
            p.order_id,
            o.receipt_no,
            o.queue_no,
            o.status AS order_status,
            p.shift_id,
            p.received_by,
            u.name AS receiver_name,
            u.email AS receiver_email,
            p.method,
            p.bank_name,
            p.currency,
            CAST(p.amount AS DOUBLE) AS amount,
            CAST(p.exchange_rate AS DOUBLE) AS exchange_rate,
            CAST(p.khr_per_usd AS DOUBLE) AS khr_per_usd,
            CAST(p.amount_usd AS DOUBLE) AS amount_usd,
            CAST(p.received_amount AS DOUBLE) AS received_amount,
            CAST(p.change_usd AS DOUBLE) AS change_usd,
            CAST(p.change_khr AS DOUBLE) AS change_khr,
            p.status,
            p.reference,
            p.idempotency_key,
            p.paid_at,
            p.created_at,
            p.updated_at,
            r.id AS refund_id,
            CAST(r.amount AS DOUBLE) AS refund_amount,
            r.currency AS refund_currency,
            r.reason AS refund_reason,
            r.status AS refund_status,
            r.refunded_at,
            ru.name AS refund_approved_by_name
         FROM payments p
         JOIN orders o ON o.id = p.order_id
         JOIN users u ON u.id = p.received_by
         LEFT JOIN refunds r ON r.payment_id = p.id
         LEFT JOIN users ru ON ru.id = r.approved_by
         WHERE p.id = ?
         LIMIT 1`,
        [id]
    );

    if (!rows[0]) return null;

    const row = rows[0];
    const isRefunded = !!row.refund_id;
    return {
        id: row.id,
        order_id: row.order_id,
        receipt_no: row.receipt_no,
        queue_no: row.queue_no,
        order_status: row.order_status,
        shift_id: row.shift_id,
        received_by: row.received_by,
        receiver_name: row.receiver_name,
        receiver_email: row.receiver_email,
        method: row.method,
        bank_name: row.bank_name,
        currency: row.currency,
        amount: row.amount,
        exchange_rate: row.exchange_rate,
        khr_per_usd: row.khr_per_usd,
        amount_usd: row.amount_usd,
        received_amount: row.received_amount,
        change_usd: row.change_usd,
        change_khr: row.change_khr,
        status: row.status,
        reference: row.reference,
        idempotency_key: row.idempotency_key,
        paid_at: row.paid_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
        is_refunded: isRefunded,
        refund: isRefunded ? {
            id: row.refund_id,
            amount: row.refund_amount,
            currency: row.refund_currency,
            reason: row.refund_reason,
            status: row.refund_status,
            refunded_at: row.refunded_at,
            approved_by_name: row.refund_approved_by_name
        } : null
    };
};

const findPaymentByOrderId = async (orderId, connection = pool) => {
    const [rows] = await connection.query(
        `SELECT id FROM payments WHERE order_id = ? ORDER BY id DESC LIMIT 1`,
        [orderId]
    );
    if (!rows[0]) return null;
    return await findPaymentById(rows[0].id, connection);
};

const findPaymentByIdempotencyKey = async (idempotencyKey, connection = pool) => {
    const [rows] = await connection.query(
        `SELECT id, order_id, status FROM payments WHERE idempotency_key = ? LIMIT 1`,
        [idempotencyKey]
    );
    return rows[0] || null;
};

const findAllPayments = async ({
    shiftId,
    orderId,
    method,
    currency,
    status,
    receivedBy,
    startDate,
    endDate,
    search,
    limit = 20,
    offset = 0
} = {}, connection = pool) => {
    let sql = `
        SELECT 
            p.id,
            p.order_id,
            o.receipt_no,
            o.queue_no,
            p.shift_id,
            p.received_by,
            u.name AS receiver_name,
            p.method,
            p.bank_name,
            p.currency,
            CAST(p.amount AS DOUBLE) AS amount,
            CAST(p.amount_usd AS DOUBLE) AS amount_usd,
            CAST(p.received_amount AS DOUBLE) AS received_amount,
            CAST(p.change_usd AS DOUBLE) AS change_usd,
            CAST(p.change_khr AS DOUBLE) AS change_khr,
            p.status,
            p.reference,
            p.paid_at,
            p.created_at,
            r.id AS refund_id,
            r.refunded_at
        FROM payments p
        JOIN orders o ON o.id = p.order_id
        JOIN users u ON u.id = p.received_by
        LEFT JOIN refunds r ON r.payment_id = p.id
        WHERE 1 = 1
    `;
    const params = [];

    if (shiftId) {
        sql += ` AND p.shift_id = ?`;
        params.push(shiftId);
    }
    if (orderId) {
        sql += ` AND p.order_id = ?`;
        params.push(orderId);
    }
    if (method) {
        sql += ` AND p.method = ?`;
        params.push(method);
    }
    if (currency) {
        sql += ` AND p.currency = ?`;
        params.push(currency);
    }
    if (status) {
        sql += ` AND p.status = ?`;
        params.push(status);
    }
    if (receivedBy) {
        sql += ` AND p.received_by = ?`;
        params.push(receivedBy);
    }
    if (startDate) {
        sql += ` AND p.paid_at >= ?`;
        params.push(startDate);
    }
    if (endDate) {
        sql += ` AND p.paid_at <= ?`;
        params.push(endDate);
    }
    if (search && search.trim()) {
        const queryPattern = `%${search.trim()}%`;
        sql += ` AND (o.receipt_no LIKE ? OR p.reference LIKE ? OR u.name LIKE ? OR p.bank_name LIKE ?)`;
        params.push(queryPattern, queryPattern, queryPattern, queryPattern);
    }

    sql += ` ORDER BY p.id DESC LIMIT ? OFFSET ?`;
    params.push(Number(limit), Number(offset));

    const [rows] = await connection.query(sql, params);
    return rows.map(r => ({
        ...r,
        is_refunded: !!r.refund_id
    }));
};

const countAllPayments = async ({
    shiftId,
    orderId,
    method,
    currency,
    status,
    receivedBy,
    startDate,
    endDate,
    search
} = {}, connection = pool) => {
    let sql = `
        SELECT COUNT(p.id) AS total
        FROM payments p
        JOIN orders o ON o.id = p.order_id
        JOIN users u ON u.id = p.received_by
        WHERE 1 = 1
    `;
    const params = [];

    if (shiftId) {
        sql += ` AND p.shift_id = ?`;
        params.push(shiftId);
    }
    if (orderId) {
        sql += ` AND p.order_id = ?`;
        params.push(orderId);
    }
    if (method) {
        sql += ` AND p.method = ?`;
        params.push(method);
    }
    if (currency) {
        sql += ` AND p.currency = ?`;
        params.push(currency);
    }
    if (status) {
        sql += ` AND p.status = ?`;
        params.push(status);
    }
    if (receivedBy) {
        sql += ` AND p.received_by = ?`;
        params.push(receivedBy);
    }
    if (startDate) {
        sql += ` AND p.paid_at >= ?`;
        params.push(startDate);
    }
    if (endDate) {
        sql += ` AND p.paid_at <= ?`;
        params.push(endDate);
    }
    if (search && search.trim()) {
        const queryPattern = `%${search.trim()}%`;
        sql += ` AND (o.receipt_no LIKE ? OR p.reference LIKE ? OR u.name LIKE ? OR p.bank_name LIKE ?)`;
        params.push(queryPattern, queryPattern, queryPattern, queryPattern);
    }

    const [rows] = await connection.query(sql, params);
    return Number(rows[0]?.total || 0);
};

const findOrderForPayment = async (orderId, connection = pool) => {
    const [rows] = await connection.query(
        `SELECT 
            id,
            receipt_no,
            queue_no,
            cashier_id,
            shift_id,
            status,
            CAST(subtotal AS DOUBLE) AS subtotal,
            CAST(total AS DOUBLE) AS total
         FROM orders
         WHERE id = ?
         LIMIT 1`,
        [orderId]
    );
    return rows[0] || null;
};

const getShopSettings = async (connection = pool) => {
    const [rows] = await connection.query(
        `SELECT base_currency, CAST(exchange_rate AS DOUBLE) AS exchange_rate FROM settings LIMIT 1`
    );
    return rows[0] || { base_currency: 'USD', exchange_rate: 4100 };
};

const getOrderItemsForRecipeDeduction = async (orderId, connection = pool) => {
    const [items] = await connection.query(
        `SELECT id, variant_id, quantity FROM order_items WHERE order_id = ?`,
        [orderId]
    );

    const [addons] = await connection.query(
        `SELECT oia.addon_variant_id, oia.quantity
         FROM order_item_addons oia
         JOIN order_items oi ON oi.id = oia.order_item_id
         WHERE oi.order_id = ?`,
        [orderId]
    );

    return { items, addons };
};

const getRecipesForVariants = async (variantIds = [], connection = pool) => {
    if (!variantIds.length) return [];

    const [rows] = await connection.query(
        `SELECT 
            r.id AS recipe_id,
            r.variant_id,
            r.ingredient_id,
            CAST(r.quantity AS DOUBLE) AS recipe_quantity,
            i.name AS ingredient_name,
            i.unit,
            CAST(i.current_stock AS DOUBLE) AS current_stock
         FROM recipes r
         JOIN ingredients i ON i.id = r.ingredient_id
         WHERE r.variant_id IN (?)`,
        [variantIds]
    );
    return rows;
};

const insertPayment = async ({
    orderId,
    shiftId,
    receivedBy,
    method,
    bankName = null,
    currency,
    amount,
    exchangeRate,
    khrPerUsd,
    amountUsd,
    receivedAmount,
    changeUsd,
    changeKhr,
    reference,
    idempotencyKey
}, connection = pool) => {
    const [result] = await connection.query(
        `INSERT INTO payments (
            order_id,
            shift_id,
            received_by,
            method,
            bank_name,
            currency,
            amount,
            exchange_rate,
            khr_per_usd,
            amount_usd,
            received_amount,
            change_usd,
            change_khr,
            status,
            reference,
            idempotency_key,
            paid_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?, CURRENT_TIMESTAMP)`,
        [
            orderId,
            shiftId,
            receivedBy,
            method,
            bankName,
            currency,
            amount,
            exchangeRate,
            khrPerUsd,
            amountUsd,
            receivedAmount,
            changeUsd,
            changeKhr,
            reference,
            idempotencyKey
        ]
    );
    return result.insertId;
};

const updateOrderStatusToPaid = async (orderId, connection = pool) => {
    const [result] = await connection.query(
        `UPDATE orders SET
            status = 'PAID',
            paid_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'OPEN'`,
        [orderId]
    );
    return result.affectedRows;
};

const insertStockMovement = async ({
    ingredientId,
    orderId,
    quantityChange,
    idempotencyKey,
    createdBy
}, connection = pool) => {
    const [result] = await connection.query(
        `INSERT INTO stock_movements (
            ingredient_id,
            order_id,
            movement_type,
            quantity_change,
            idempotency_key,
            created_by
        ) VALUES (?, ?, 'SALE', ?, ?, ?)`,
        [ingredientId, orderId, quantityChange, idempotencyKey, createdBy]
    );
    return result.insertId;
};

const deductIngredientStock = async (ingredientId, quantity, connection = pool) => {
    const [result] = await connection.query(
        `UPDATE ingredients SET
            current_stock = current_stock - ?
         WHERE id = ?`,
        [quantity, ingredientId]
    );
    return result.affectedRows;
};

// ==========================================
// REFUNDS
// ==========================================

const findRefundByPaymentId = async (paymentId, connection = pool) => {
    const [rows] = await connection.query(
        `SELECT id, order_id, payment_id, status, amount, currency FROM refunds WHERE payment_id = ? LIMIT 1`,
        [paymentId]
    );
    return rows[0] || null;
};

const findRefundById = async (id, connection = pool) => {
    const [rows] = await connection.query(
        `SELECT 
            r.id,
            r.order_id,
            o.receipt_no,
            o.queue_no,
            r.payment_id,
            r.shift_id,
            r.approved_by,
            u.name AS approver_name,
            u.email AS approver_email,
            r.method,
            r.currency,
            CAST(r.amount AS DOUBLE) AS amount,
            CAST(r.exchange_rate AS DOUBLE) AS exchange_rate,
            CAST(r.khr_per_usd AS DOUBLE) AS khr_per_usd,
            CAST(r.amount_usd AS DOUBLE) AS amount_usd,
            r.reason,
            r.status,
            r.reference,
            r.refunded_at,
            r.created_at,
            r.updated_at
         FROM refunds r
         JOIN orders o ON o.id = r.order_id
         JOIN users u ON u.id = r.approved_by
         WHERE r.id = ?
         LIMIT 1`,
        [id]
    );
    return rows[0] || null;
};

const findAllRefunds = async ({
    shiftId,
    orderId,
    approvedBy,
    method,
    currency,
    status,
    startDate,
    endDate,
    search,
    limit = 20,
    offset = 0
} = {}, connection = pool) => {
    let sql = `
        SELECT 
            r.id,
            r.order_id,
            o.receipt_no,
            o.queue_no,
            r.payment_id,
            r.shift_id,
            r.approved_by,
            u.name AS approver_name,
            r.method,
            r.currency,
            CAST(r.amount AS DOUBLE) AS amount,
            CAST(r.amount_usd AS DOUBLE) AS amount_usd,
            r.reason,
            r.status,
            r.reference,
            r.refunded_at,
            r.created_at
        FROM refunds r
        JOIN orders o ON o.id = r.order_id
        JOIN users u ON u.id = r.approved_by
        WHERE 1 = 1
    `;
    const params = [];

    if (shiftId) {
        sql += ` AND r.shift_id = ?`;
        params.push(shiftId);
    }
    if (orderId) {
        sql += ` AND r.order_id = ?`;
        params.push(orderId);
    }
    if (approvedBy) {
        sql += ` AND r.approved_by = ?`;
        params.push(approvedBy);
    }
    if (method) {
        sql += ` AND r.method = ?`;
        params.push(method);
    }
    if (currency) {
        sql += ` AND r.currency = ?`;
        params.push(currency);
    }
    if (status) {
        sql += ` AND r.status = ?`;
        params.push(status);
    }
    if (startDate) {
        sql += ` AND r.refunded_at >= ?`;
        params.push(startDate);
    }
    if (endDate) {
        sql += ` AND r.refunded_at <= ?`;
        params.push(endDate);
    }
    if (search && search.trim()) {
        const queryPattern = `%${search.trim()}%`;
        sql += ` AND (o.receipt_no LIKE ? OR r.reason LIKE ? OR r.reference LIKE ? OR u.name LIKE ?)`;
        params.push(queryPattern, queryPattern, queryPattern, queryPattern);
    }

    sql += ` ORDER BY r.id DESC LIMIT ? OFFSET ?`;
    params.push(Number(limit), Number(offset));

    const [rows] = await connection.query(sql, params);
    return rows;
};

const countAllRefunds = async ({
    shiftId,
    orderId,
    approvedBy,
    method,
    currency,
    status,
    startDate,
    endDate,
    search
} = {}, connection = pool) => {
    let sql = `
        SELECT COUNT(r.id) AS total
        FROM refunds r
        JOIN orders o ON o.id = r.order_id
        JOIN users u ON u.id = r.approved_by
        WHERE 1 = 1
    `;
    const params = [];

    if (shiftId) {
        sql += ` AND r.shift_id = ?`;
        params.push(shiftId);
    }
    if (orderId) {
        sql += ` AND r.order_id = ?`;
        params.push(orderId);
    }
    if (approvedBy) {
        sql += ` AND r.approved_by = ?`;
        params.push(approvedBy);
    }
    if (method) {
        sql += ` AND r.method = ?`;
        params.push(method);
    }
    if (currency) {
        sql += ` AND r.currency = ?`;
        params.push(currency);
    }
    if (status) {
        sql += ` AND r.status = ?`;
        params.push(status);
    }
    if (startDate) {
        sql += ` AND r.refunded_at >= ?`;
        params.push(startDate);
    }
    if (endDate) {
        sql += ` AND r.refunded_at <= ?`;
        params.push(endDate);
    }
    if (search && search.trim()) {
        const queryPattern = `%${search.trim()}%`;
        sql += ` AND (o.receipt_no LIKE ? OR r.reason LIKE ? OR r.reference LIKE ? OR u.name LIKE ?)`;
        params.push(queryPattern, queryPattern, queryPattern, queryPattern);
    }

    const [rows] = await connection.query(sql, params);
    return Number(rows[0]?.total || 0);
};

const insertRefund = async ({
    orderId,
    paymentId,
    shiftId,
    approvedBy,
    method,
    currency,
    amount,
    exchangeRate,
    khrPerUsd,
    amountUsd,
    reason,
    reference = null
}, connection = pool) => {
    const [result] = await connection.query(
        `INSERT INTO refunds (
            order_id,
            payment_id,
            shift_id,
            approved_by,
            method,
            currency,
            amount,
            exchange_rate,
            khr_per_usd,
            amount_usd,
            reason,
            status,
            reference,
            refunded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, CURRENT_TIMESTAMP)`,
        [
            orderId,
            paymentId,
            shiftId,
            approvedBy,
            method,
            currency,
            amount,
            exchangeRate,
            khrPerUsd,
            amountUsd,
            reason,
            reference
        ]
    );
    return result.insertId;
};

const updateOrderStatusToRefunded = async (orderId, connection = pool) => {
    const [result] = await connection.query(
        `UPDATE orders SET
            status = 'REFUNDED'
         WHERE id = ? AND status = 'PAID'`,
        [orderId]
    );
    return result.affectedRows;
};

const getSaleStockMovementsForOrder = async (orderId, connection = pool) => {
    const [rows] = await connection.query(
        `SELECT 
            id,
            ingredient_id,
            CAST(quantity_change AS DOUBLE) AS quantity_change
         FROM stock_movements
         WHERE order_id = ? AND movement_type = 'SALE'`,
        [orderId]
    );
    return rows;
};

const insertReturnStockMovement = async ({
    ingredientId,
    orderId,
    sourceMovementId,
    quantityChange,
    reason,
    idempotencyKey,
    createdBy
}, connection = pool) => {
    const [result] = await connection.query(
        `INSERT INTO stock_movements (
            ingredient_id,
            order_id,
            source_movement_id,
            movement_type,
            quantity_change,
            reason,
            idempotency_key,
            created_by
        ) VALUES (?, ?, ?, 'RETURN', ?, ?, ?, ?)`,
        [
            ingredientId,
            orderId,
            sourceMovementId,
            quantityChange,
            reason,
            idempotencyKey,
            createdBy
        ]
    );
    return result.insertId;
};

const restoreIngredientStock = async (ingredientId, quantity, connection = pool) => {
    const [result] = await connection.query(
        `UPDATE ingredients SET
            current_stock = current_stock + ?
         WHERE id = ?`,
        [quantity, ingredientId]
    );
    return result.affectedRows;
};

const findActiveOwnerById = async (userId, connection = pool) => {
    const [rows] = await connection.query(
        `SELECT id, name, role, is_active FROM users WHERE id = ? AND role = 'OWNER' AND is_active = TRUE LIMIT 1`,
        [userId]
    );
    return rows[0] || null;
};

module.exports = {
    findPaymentById,
    findPaymentByOrderId,
    findPaymentByIdempotencyKey,
    findAllPayments,
    countAllPayments,
    findOrderForPayment,
    getShopSettings,
    getOrderItemsForRecipeDeduction,
    getRecipesForVariants,
    insertPayment,
    updateOrderStatusToPaid,
    insertStockMovement,
    deductIngredientStock,
    findRefundByPaymentId,
    findRefundById,
    findAllRefunds,
    countAllRefunds,
    insertRefund,
    updateOrderStatusToRefunded,
    getSaleStockMovementsForOrder,
    insertReturnStockMovement,
    restoreIngredientStock,
    findActiveOwnerById
};
