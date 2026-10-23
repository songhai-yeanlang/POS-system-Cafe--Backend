const { connection: pool } = require('../../config/db.config');

const generateReceiptNo = async (connection = pool) => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const datePrefix = `RCP-${year}${month}${day}-`;

    const [rows] = await connection.query(
        `SELECT receipt_no FROM orders WHERE receipt_no LIKE ? ORDER BY id DESC LIMIT 1 FOR UPDATE`,
        [`${datePrefix}%`]
    );

    let nextNumber = 1;
    if (rows.length > 0 && rows[0].receipt_no) {
        const parts = rows[0].receipt_no.split('-');
        const lastSeq = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(lastSeq)) {
            nextNumber = lastSeq + 1;
        }
    }

    return `${datePrefix}${String(nextNumber).padStart(4, '0')}`;
};

const getNextQueueNo = async (datePrefix, connection = pool) => {
    let sql = `SELECT COALESCE(MAX(queue_no), 0) + 1 AS next_queue FROM orders WHERE 1=1`;
    const params = [];
    if (datePrefix) {
        sql += ` AND receipt_no LIKE ?`;
        params.push(`${datePrefix}%`);
    } else {
        sql += ` AND DATE(created_at) = CURRENT_DATE()`;
    }
    sql += ` FOR UPDATE`;

    const [rows] = await connection.query(sql, params);
    return Number(rows[0]?.next_queue || 1);
};

const getVariantsDetailsByIds = async (variantIds = [], connection = pool) => {
    if (!variantIds.length) return [];

    const [rows] = await connection.query(
        `SELECT 
            pv.id AS variant_id,
            pv.name AS variant_name,
            CAST(pv.price AS DOUBLE) AS price,
            pv.is_active AS variant_active,
            p.id AS product_id,
            p.name AS product_name,
            p.product_type,
            p.is_active AS product_active
         FROM product_variants pv
         JOIN products p ON p.id = pv.product_id
         WHERE pv.id IN (?)`,
        [variantIds]
    );
    return rows;
};

const findUserRoleById = async (userId, connection = pool) => {
    const [rows] = await connection.query(
        `SELECT id, name, role, is_active FROM users WHERE id = ? LIMIT 1`,
        [userId]
    );
    return rows[0] || null;
};

const insertOrder = async ({
    receiptNo,
    queueNo,
    cashierId,
    shiftId,
    orderType,
    tableNo = null,
    subtotal = 0,
    discountType = 'NONE',
    discountValue = 0,
    discountAmount = 0,
    discountApprovedBy = null,
    discountReason = null,
    note = null
}, connection = pool) => {
    const [result] = await connection.query(
        `INSERT INTO orders (
            receipt_no,
            queue_no,
            cashier_id,
            shift_id,
            order_type,
            table_no,
            status,
            subtotal,
            discount_type,
            discount_value,
            discount_amount,
            discount_approved_by,
            discount_reason,
            note
        ) VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, ?, ?, ?)`,
        [
            receiptNo,
            queueNo,
            cashierId,
            shiftId,
            orderType,
            tableNo,
            subtotal,
            discountType,
            discountValue,
            discountAmount,
            discountApprovedBy,
            discountReason,
            note
        ]
    );
    return result.insertId;
};

const updateOrderById = async ({
    orderId,
    orderType,
    tableNo = null,
    subtotal = 0,
    discountType = 'NONE',
    discountValue = 0,
    discountAmount = 0,
    discountApprovedBy = null,
    discountReason = null,
    note = null
}, connection = pool) => {
    const [result] = await connection.query(
        `UPDATE orders SET
            order_type = ?,
            table_no = ?,
            subtotal = ?,
            discount_type = ?,
            discount_value = ?,
            discount_amount = ?,
            discount_approved_by = ?,
            discount_reason = ?,
            note = ?
         WHERE id = ? AND status = 'OPEN'`,
        [
            orderType,
            tableNo,
            subtotal,
            discountType,
            discountValue,
            discountAmount,
            discountApprovedBy,
            discountReason,
            note,
            orderId
        ]
    );
    return result.affectedRows;
};

const deleteOrderItemsByOrderId = async (orderId, connection = pool) => {
    const [result] = await connection.query(
        `DELETE FROM order_items WHERE order_id = ?`,
        [orderId]
    );
    return result.affectedRows;
};

const cancelOrderById = async ({ orderId, cancelledBy, cancellationReason }, connection = pool) => {
    const [result] = await connection.query(
        `UPDATE orders SET
            status = 'CANCELLED',
            cancelled_at = CURRENT_TIMESTAMP,
            cancelled_by = ?,
            cancellation_reason = ?
         WHERE id = ? AND status = 'OPEN'`,
        [cancelledBy, cancellationReason, orderId]
    );
    return result.affectedRows;
};

const insertOrderItem = async ({
    orderId,
    variantId,
    productNameSnapshot,
    variantNameSnapshot,
    quantity,
    unitPrice,
    sugarLevel = null,
    iceLevel = null,
    note = null
}, connection = pool) => {
    const [result] = await connection.query(
        `INSERT INTO order_items (
            order_id,
            variant_id,
            product_name_snapshot,
            variant_name_snapshot,
            quantity,
            unit_price,
            sugar_level,
            ice_level,
            note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            orderId,
            variantId,
            productNameSnapshot,
            variantNameSnapshot,
            quantity,
            unitPrice,
            sugarLevel,
            iceLevel,
            note
        ]
    );
    return result.insertId;
};

const insertOrderItemAddon = async ({
    orderItemId,
    addonVariantId,
    addonNameSnapshot,
    quantity,
    unitPrice
}, connection = pool) => {
    const [result] = await connection.query(
        `INSERT INTO order_item_addons (
            order_item_id,
            addon_variant_id,
            addon_name_snapshot,
            quantity,
            unit_price
        ) VALUES (?, ?, ?, ?, ?)`,
        [orderItemId, addonVariantId, addonNameSnapshot, quantity, unitPrice]
    );
    return result.insertId;
};

const findOrderById = async (orderId, connection = pool) => {
    const [orderRows] = await connection.query(
        `SELECT 
            o.id,
            o.receipt_no,
            o.queue_no,
            o.cashier_id,
            u.name AS cashier_name,
            u.email AS cashier_email,
            u.role AS cashier_role,
            o.shift_id,
            o.order_type,
            o.table_no,
            o.status,
            CAST(o.subtotal AS DOUBLE) AS subtotal,
            o.discount_type,
            CAST(o.discount_value AS DOUBLE) AS discount_value,
            CAST(o.discount_amount AS DOUBLE) AS discount_amount,
            o.discount_approved_by,
            appr.name AS discount_approved_by_name,
            o.discount_reason,
            CAST(o.total AS DOUBLE) AS total,
            o.note,
            o.paid_at,
            o.cancelled_at,
            o.cancelled_by,
            canc.name AS cancelled_by_name,
            o.cancellation_reason,
            o.created_at,
            o.updated_at
         FROM orders o
         JOIN users u ON u.id = o.cashier_id
         LEFT JOIN users appr ON appr.id = o.discount_approved_by
         LEFT JOIN users canc ON canc.id = o.cancelled_by
         WHERE o.id = ?
         LIMIT 1`,
        [orderId]
    );

    if (orderRows.length === 0) {
        return null;
    }

    const order = orderRows[0];

    // Fetch order items
    const [itemRows] = await connection.query(
        `SELECT 
            oi.id,
            oi.order_id,
            oi.variant_id,
            oi.product_name_snapshot,
            oi.variant_name_snapshot,
            oi.quantity,
            CAST(oi.unit_price AS DOUBLE) AS unit_price,
            CAST(oi.line_total AS DOUBLE) AS line_total,
            oi.sugar_level,
            oi.ice_level,
            oi.note,
            oi.created_at
         FROM order_items oi
         WHERE oi.order_id = ?
         ORDER BY oi.id ASC`,
        [orderId]
    );

    // Fetch addons for these items
    let addonsByItemId = {};
    if (itemRows.length > 0) {
        const itemIds = itemRows.map(i => i.id);
        const [addonRows] = await connection.query(
            `SELECT 
                oia.id,
                oia.order_item_id,
                oia.addon_variant_id,
                oia.addon_name_snapshot,
                oia.quantity,
                CAST(oia.unit_price AS DOUBLE) AS unit_price,
                CAST(oia.line_total AS DOUBLE) AS line_total
             FROM order_item_addons oia
             WHERE oia.order_item_id IN (?)
             ORDER BY oia.id ASC`,
            [itemIds]
        );

        for (const addon of addonRows) {
            if (!addonsByItemId[addon.order_item_id]) {
                addonsByItemId[addon.order_item_id] = [];
            }
            addonsByItemId[addon.order_item_id].push({
                id: addon.id,
                addon_variant_id: addon.addon_variant_id,
                addon_name: addon.addon_name_snapshot,
                quantity: addon.quantity,
                unit_price: addon.unit_price,
                line_total: addon.line_total
            });
        }
    }

    // Fetch completed payments if any
    const [paymentRows] = await connection.query(
        `SELECT 
            p.id,
            p.method,
            p.currency,
            CAST(p.amount AS DOUBLE) AS amount,
            CAST(p.amount_usd AS DOUBLE) AS amount_usd,
            CAST(p.received_amount AS DOUBLE) AS received_amount,
            CAST(p.change_usd AS DOUBLE) AS change_usd,
            CAST(p.change_khr AS DOUBLE) AS change_khr,
            p.status,
            p.reference,
            p.paid_at
         FROM payments p
         WHERE p.order_id = ?
         ORDER BY p.id ASC`,
        [orderId]
    );

    const items = itemRows.map(item => ({
        id: item.id,
        variant_id: item.variant_id,
        product_name: item.product_name_snapshot,
        variant_name: item.variant_name_snapshot,
        quantity: item.quantity,
        unit_price: item.unit_price,
        line_total: item.line_total,
        sugar_level: item.sugar_level,
        ice_level: item.ice_level,
        note: item.note,
        addons: addonsByItemId[item.id] || []
    }));

    return {
        id: order.id,
        receipt_no: order.receipt_no,
        queue_no: order.queue_no,
        cashier: {
            id: order.cashier_id,
            name: order.cashier_name,
            email: order.cashier_email,
            role: order.cashier_role
        },
        shift_id: order.shift_id,
        order_type: order.order_type,
        table_no: order.table_no,
        status: order.status,
        subtotal: order.subtotal,
        discount: {
            type: order.discount_type,
            value: order.discount_value,
            amount: order.discount_amount,
            approved_by: order.discount_approved_by ? {
                id: order.discount_approved_by,
                name: order.discount_approved_by_name
            } : null,
            reason: order.discount_reason
        },
        total: order.total,
        note: order.note,
        paid_at: order.paid_at,
        cancelled_at: order.cancelled_at,
        cancelled_by: order.cancelled_by ? {
            id: order.cancelled_by,
            name: order.cancelled_by_name
        } : null,
        cancellation_reason: order.cancellation_reason,
        items,
        payments: paymentRows,
        created_at: order.created_at,
        updated_at: order.updated_at
    };
};

const findAllOrders = async ({
    status,
    orderType,
    shiftId,
    cashierId,
    startDate,
    endDate,
    search,
    limit,
    offset
} = {}, connection = pool) => {
    let sql = `
        SELECT 
            o.id,
            o.receipt_no,
            o.queue_no,
            o.cashier_id,
            u.name AS cashier_name,
            u.email AS cashier_email,
            o.shift_id,
            o.order_type,
            o.table_no,
            o.status,
            CAST(o.subtotal AS DOUBLE) AS subtotal,
            o.discount_type,
            CAST(o.discount_value AS DOUBLE) AS discount_value,
            CAST(o.discount_amount AS DOUBLE) AS discount_amount,
            CAST(o.total AS DOUBLE) AS total,
            o.note,
            (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS total_items,
            o.paid_at,
            o.cancelled_at,
            o.created_at,
            o.updated_at
        FROM orders o
        JOIN users u ON u.id = o.cashier_id
        WHERE 1=1
    `;
    const params = [];

    if (status) {
        sql += ` AND o.status = ?`;
        params.push(status);
    }

    if (orderType) {
        sql += ` AND o.order_type = ?`;
        params.push(orderType);
    }

    if (shiftId) {
        sql += ` AND o.shift_id = ?`;
        params.push(shiftId);
    }

    if (cashierId) {
        sql += ` AND o.cashier_id = ?`;
        params.push(cashierId);
    }

    if (startDate) {
        sql += ` AND o.created_at >= ?`;
        params.push(startDate);
    }

    if (endDate) {
        sql += ` AND o.created_at <= ?`;
        params.push(endDate);
    }

    if (search) {
        sql += ` AND (o.receipt_no LIKE ? OR o.table_no LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`);
    }

    sql += ` ORDER BY o.id DESC`;

    if (limit !== undefined && limit !== null && offset !== undefined && offset !== null) {
        sql += ` LIMIT ? OFFSET ?`;
        params.push(Number(limit), Number(offset));
    }

    const [rows] = await connection.query(sql, params);
    return rows;
};

const countAllOrders = async ({
    status,
    orderType,
    shiftId,
    cashierId,
    startDate,
    endDate,
    search
} = {}, connection = pool) => {
    let sql = `SELECT COUNT(*) AS total FROM orders o WHERE 1=1`;
    const params = [];

    if (status) {
        sql += ` AND o.status = ?`;
        params.push(status);
    }

    if (orderType) {
        sql += ` AND o.order_type = ?`;
        params.push(orderType);
    }

    if (shiftId) {
        sql += ` AND o.shift_id = ?`;
        params.push(shiftId);
    }

    if (cashierId) {
        sql += ` AND o.cashier_id = ?`;
        params.push(cashierId);
    }

    if (startDate) {
        sql += ` AND o.created_at >= ?`;
        params.push(startDate);
    }

    if (endDate) {
        sql += ` AND o.created_at <= ?`;
        params.push(endDate);
    }

    if (search) {
        sql += ` AND (o.receipt_no LIKE ? OR o.table_no LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`);
    }

    const [rows] = await connection.query(sql, params);
    return rows[0].total;
};

module.exports = {
    generateReceiptNo,
    getNextQueueNo,
    getVariantsDetailsByIds,
    findUserRoleById,
    insertOrder,
    updateOrderById,
    deleteOrderItemsByOrderId,
    cancelOrderById,
    insertOrderItem,
    insertOrderItemAddon,
    findOrderById,
    findAllOrders,
    countAllOrders
};
