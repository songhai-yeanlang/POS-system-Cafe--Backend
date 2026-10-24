const { connection: pool } = require('../../config/db.config');

const getDashboardOrdersStats = async ({ startDate, endDate, shiftId } = {}, connection = pool) => {
    let sql = `
        SELECT 
            COUNT(*) AS total_orders_all,
            CAST(COALESCE(SUM(CASE WHEN status = 'PAID' THEN 1 ELSE 0 END), 0) AS UNSIGNED) AS paid_orders_count,
            CAST(COALESCE(SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END), 0) AS UNSIGNED) AS open_orders_count,
            CAST(COALESCE(SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END), 0) AS UNSIGNED) AS cancelled_orders_count,
            CAST(COALESCE(SUM(CASE WHEN status = 'REFUNDED' THEN 1 ELSE 0 END), 0) AS UNSIGNED) AS refunded_orders_count,
            CAST(COALESCE(SUM(CASE WHEN status IN ('PAID', 'REFUNDED') THEN subtotal ELSE 0 END), 0) AS DOUBLE) AS gross_sales_usd,
            CAST(COALESCE(SUM(CASE WHEN status IN ('PAID', 'REFUNDED') THEN discount_amount ELSE 0 END), 0) AS DOUBLE) AS total_discounts_usd,
            CAST(COALESCE(SUM(CASE WHEN status = 'PAID' THEN total ELSE 0 END), 0) AS DOUBLE) AS active_paid_sales_usd
        FROM orders
        WHERE 1 = 1
    `;
    const params = [];

    if (shiftId) {
        sql += ` AND shift_id = ?`;
        params.push(shiftId);
    }
    if (startDate) {
        sql += ` AND COALESCE(paid_at, created_at) >= ?`;
        params.push(startDate);
    }
    if (endDate) {
        sql += ` AND COALESCE(paid_at, created_at) <= ?`;
        params.push(endDate);
    }

    const [rows] = await connection.query(sql, params);
    return rows[0] || {
        total_orders_all: 0,
        paid_orders_count: 0,
        open_orders_count: 0,
        cancelled_orders_count: 0,
        refunded_orders_count: 0,
        gross_sales_usd: 0,
        total_discounts_usd: 0,
        active_paid_sales_usd: 0
    };
};

const getDashboardRefundsStats = async ({ startDate, endDate, shiftId } = {}, connection = pool) => {
    let sql = `
        SELECT 
            CAST(COUNT(*) AS UNSIGNED) AS total_refunds_count,
            CAST(COALESCE(SUM(amount_usd), 0) AS DOUBLE) AS total_refunded_usd,
            CAST(COALESCE(SUM(CASE WHEN currency = 'KHR' THEN amount ELSE 0 END), 0) AS DOUBLE) AS total_refunded_khr,
            CAST(COALESCE(SUM(CASE WHEN method = 'CASH' THEN amount_usd ELSE 0 END), 0) AS DOUBLE) AS cash_refunded_usd,
            CAST(COALESCE(SUM(CASE WHEN method = 'CASH' AND currency = 'KHR' THEN amount ELSE 0 END), 0) AS DOUBLE) AS cash_refunded_khr
        FROM refunds
        WHERE status = 'COMPLETED'
    `;
    const params = [];

    if (shiftId) {
        sql += ` AND shift_id = ?`;
        params.push(shiftId);
    }
    if (startDate) {
        sql += ` AND refunded_at >= ?`;
        params.push(startDate);
    }
    if (endDate) {
        sql += ` AND refunded_at <= ?`;
        params.push(endDate);
    }

    const [rows] = await connection.query(sql, params);
    return rows[0] || {
        total_refunds_count: 0,
        total_refunded_usd: 0,
        total_refunded_khr: 0,
        cash_refunded_usd: 0,
        cash_refunded_khr: 0
    };
};

const getDashboardExpensesStats = async ({ startDate, endDate, shiftId } = {}, connection = pool) => {
    let sql = `
        SELECT 
            CAST(COUNT(*) AS UNSIGNED) AS total_expenses_count,
            CAST(COALESCE(SUM(amount_usd), 0) AS DOUBLE) AS total_expenses_usd,
            CAST(COALESCE(SUM(CASE WHEN currency = 'KHR' THEN amount ELSE 0 END), 0) AS DOUBLE) AS total_expenses_khr,
            CAST(COALESCE(SUM(CASE WHEN payment_method = 'CASH' THEN amount_usd ELSE 0 END), 0) AS DOUBLE) AS cash_expenses_usd,
            CAST(COALESCE(SUM(CASE WHEN payment_method = 'CASH' AND currency = 'KHR' THEN amount ELSE 0 END), 0) AS DOUBLE) AS cash_expenses_khr
        FROM expenses
        WHERE status = 'ACTIVE'
    `;
    const params = [];

    if (shiftId) {
        sql += ` AND shift_id = ?`;
        params.push(shiftId);
    }
    if (startDate) {
        sql += ` AND incurred_at >= ?`;
        params.push(startDate);
    }
    if (endDate) {
        sql += ` AND incurred_at <= ?`;
        params.push(endDate);
    }

    const [rows] = await connection.query(sql, params);
    return rows[0] || {
        total_expenses_count: 0,
        total_expenses_usd: 0,
        total_expenses_khr: 0,
        cash_expenses_usd: 0,
        cash_expenses_khr: 0
    };
};

const getDashboardPaymentBreakdown = async ({ startDate, endDate, shiftId } = {}, connection = pool) => {
    let sql = `
        SELECT 
            p.method,
            p.currency,
            CAST(COUNT(p.id) AS UNSIGNED) AS transaction_count,
            CAST(COALESCE(SUM(p.amount), 0) AS DOUBLE) AS gross_amount,
            CAST(COALESCE(SUM(p.amount_usd), 0) AS DOUBLE) AS gross_amount_usd,
            CAST(COALESCE(SUM(r.amount_usd), 0) AS DOUBLE) AS refunded_amount_usd,
            CAST(COALESCE(SUM(p.amount_usd - COALESCE(r.amount_usd, 0)), 0) AS DOUBLE) AS net_amount_usd
        FROM payments p
        LEFT JOIN refunds r ON r.payment_id = p.id AND r.status = 'COMPLETED'
        WHERE p.status = 'COMPLETED'
    `;
    const params = [];

    if (shiftId) {
        sql += ` AND p.shift_id = ?`;
        params.push(shiftId);
    }
    if (startDate) {
        sql += ` AND p.paid_at >= ?`;
        params.push(startDate);
    }
    if (endDate) {
        sql += ` AND p.paid_at <= ?`;
        params.push(endDate);
    }

    sql += ` GROUP BY p.method, p.currency ORDER BY net_amount_usd DESC, gross_amount_usd DESC`;

    const [rows] = await connection.query(sql, params);
    return rows;
};

const getSalesTrend = async ({ startDate, endDate, groupBy = 'day' } = {}, connection = pool) => {
    let format = '%Y-%m-%d';
    if (groupBy === 'hour') {
        format = '%Y-%m-%d %H:00';
    } else if (groupBy === 'month') {
        format = '%Y-%m';
    }

    let sql = `
        SELECT 
            DATE_FORMAT(paid_at, '${format}') AS period,
            CAST(COUNT(id) AS UNSIGNED) AS total_orders,
            CAST(COALESCE(SUM(subtotal), 0) AS DOUBLE) AS gross_sales_usd,
            CAST(COALESCE(SUM(discount_amount), 0) AS DOUBLE) AS total_discounts_usd,
            CAST(COALESCE(SUM(total), 0) AS DOUBLE) AS net_sales_usd
        FROM orders
        WHERE status = 'PAID' AND paid_at IS NOT NULL
    `;
    const params = [];

    if (startDate) {
        sql += ` AND paid_at >= ?`;
        params.push(startDate);
    }
    if (endDate) {
        sql += ` AND paid_at <= ?`;
        params.push(endDate);
    }

    sql += ` GROUP BY period ORDER BY period ASC`;

    const [rows] = await connection.query(sql, params);
    return rows;
};

const getTopProducts = async ({ startDate, endDate, categoryId, limit = 10 } = {}, connection = pool) => {
    let dateFilter = '';
    const dateParams = [];

    if (startDate) {
        dateFilter += ` AND o.paid_at >= ?`;
        dateParams.push(startDate);
    }
    if (endDate) {
        dateFilter += ` AND o.paid_at <= ?`;
        dateParams.push(endDate);
    }

    let categoryFilter = '';
    const catParams = [];
    if (categoryId) {
        categoryFilter = ` AND c.id = ?`;
        catParams.push(categoryId);
    }

    const sql = `
        WITH combined_items AS (
            SELECT 
                oi.variant_id,
                oi.quantity,
                oi.line_total,
                o.id AS order_id
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE o.status = 'PAID' ${dateFilter}

            UNION ALL

            SELECT 
                oia.addon_variant_id AS variant_id,
                oia.quantity,
                oia.line_total,
                o.id AS order_id
            FROM order_item_addons oia
            JOIN order_items oi ON oi.id = oia.order_item_id
            JOIN orders o ON o.id = oi.order_id
            WHERE o.status = 'PAID' ${dateFilter}
        )
        SELECT 
            pv.id AS variant_id,
            pv.name AS variant_name,
            p.id AS product_id,
            p.name AS product_name,
            p.product_type,
            c.id AS category_id,
            c.name AS category_name,
            CAST(COALESCE(SUM(ci.quantity), 0) AS UNSIGNED) AS total_quantity_sold,
            CAST(COALESCE(SUM(ci.line_total), 0) AS DOUBLE) AS total_revenue_usd
        FROM combined_items ci
        JOIN product_variants pv ON pv.id = ci.variant_id
        JOIN products p ON p.id = pv.product_id
        JOIN categories c ON c.id = p.category_id
        WHERE 1 = 1 ${categoryFilter}
        GROUP BY pv.id, pv.name, p.id, p.name, p.product_type, c.id, c.name
        ORDER BY total_quantity_sold DESC, total_revenue_usd DESC
        LIMIT ?
    `;

    const allParams = [...dateParams, ...dateParams, ...catParams, Number(limit)];

    const [rows] = await connection.query(sql, allParams);
    return rows;
};

const getCategoriesReport = async ({ startDate, endDate } = {}, connection = pool) => {
    let dateFilter = '';
    const dateParams = [];

    if (startDate) {
        dateFilter += ` AND o.paid_at >= ?`;
        dateParams.push(startDate);
    }
    if (endDate) {
        dateFilter += ` AND o.paid_at <= ?`;
        dateParams.push(endDate);
    }

    const sql = `
        WITH sales_lines AS (
            SELECT 
                oi.variant_id,
                oi.quantity,
                oi.line_total
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE o.status = 'PAID' ${dateFilter}

            UNION ALL

            SELECT 
                oia.addon_variant_id AS variant_id,
                oia.quantity,
                oia.line_total
            FROM order_item_addons oia
            JOIN order_items oi ON oi.id = oia.order_item_id
            JOIN orders o ON o.id = oi.order_id
            WHERE o.status = 'PAID' ${dateFilter}
        )
        SELECT 
            c.id AS category_id,
            c.name AS category_name,
            CAST(COALESCE(SUM(sl.quantity), 0) AS UNSIGNED) AS total_items_sold,
            CAST(COALESCE(SUM(sl.line_total), 0) AS DOUBLE) AS total_revenue_usd
        FROM categories c
        LEFT JOIN products p ON p.category_id = c.id
        LEFT JOIN product_variants pv ON pv.product_id = p.id
        LEFT JOIN sales_lines sl ON sl.variant_id = pv.id
        WHERE c.is_active = TRUE
        GROUP BY c.id, c.name
        ORDER BY total_revenue_usd DESC, total_items_sold DESC
    `;

    const allParams = [...dateParams, ...dateParams];
    const [rows] = await connection.query(sql, allParams);
    return rows;
};

const getPaymentMethodsReport = async ({ startDate, endDate, shiftId } = {}, connection = pool) => {
    let sql = `
        SELECT 
            p.method,
            p.currency,
            CAST(COUNT(p.id) AS UNSIGNED) AS transaction_count,
            CAST(COALESCE(SUM(p.amount), 0) AS DOUBLE) AS gross_amount,
            CAST(COALESCE(SUM(p.amount_usd), 0) AS DOUBLE) AS gross_amount_usd,
            CAST(COALESCE(SUM(r.amount_usd), 0) AS DOUBLE) AS refunded_amount_usd,
            CAST(COALESCE(SUM(p.amount_usd - COALESCE(r.amount_usd, 0)), 0) AS DOUBLE) AS net_amount_usd
        FROM payments p
        LEFT JOIN refunds r ON r.payment_id = p.id AND r.status = 'COMPLETED'
        WHERE p.status = 'COMPLETED'
    `;
    const params = [];

    if (shiftId) {
        sql += ` AND p.shift_id = ?`;
        params.push(shiftId);
    }
    if (startDate) {
        sql += ` AND p.paid_at >= ?`;
        params.push(startDate);
    }
    if (endDate) {
        sql += ` AND p.paid_at <= ?`;
        params.push(endDate);
    }

    sql += ` GROUP BY p.method, p.currency ORDER BY net_amount_usd DESC, gross_amount_usd DESC`;

    const [rows] = await connection.query(sql, params);
    return rows;
};

const getStaffPerformanceReport = async ({ startDate, endDate, staffId } = {}, connection = pool) => {
    let orderDateFilter = '';
    let shiftDateFilter = '';

    let paramShiftStart = null;
    let paramShiftEnd = null;
    let paramOrderStart = null;
    let paramOrderEnd = null;

    if (startDate) {
        shiftDateFilter += ` AND s.opened_at >= ?`;
        orderDateFilter += ` AND o.paid_at >= ?`;
        paramShiftStart = startDate;
        paramOrderStart = startDate;
    }
    if (endDate) {
        shiftDateFilter += ` AND s.opened_at <= ?`;
        orderDateFilter += ` AND o.paid_at <= ?`;
        paramShiftEnd = endDate;
        paramOrderEnd = endDate;
    }

    let userFilter = '';
    const userParams = [];
    if (staffId) {
        userFilter += ` AND u.id = ?`;
        userParams.push(staffId);
    }

    const sql = `
        SELECT 
            u.id AS staff_id,
            u.name AS staff_name,
            u.email AS staff_email,
            u.role,
            (
                SELECT CAST(COUNT(*) AS UNSIGNED) 
                FROM shifts s 
                WHERE s.user_id = u.id ${shiftDateFilter}
            ) AS shifts_count,
            (
                SELECT CAST(COUNT(*) AS UNSIGNED) 
                FROM orders o 
                WHERE o.cashier_id = u.id AND o.status = 'PAID' ${orderDateFilter}
            ) AS paid_orders_count,
            (
                SELECT CAST(COALESCE(SUM(o.total), 0) AS DOUBLE) 
                FROM orders o 
                WHERE o.cashier_id = u.id AND o.status = 'PAID' ${orderDateFilter}
            ) AS total_sales_usd,
            (
                SELECT CAST(COALESCE(SUM(o.discount_amount), 0) AS DOUBLE) 
                FROM orders o 
                WHERE o.cashier_id = u.id AND o.status = 'PAID' ${orderDateFilter}
            ) AS total_discounts_usd
        FROM users u
        WHERE u.is_active = TRUE ${userFilter}
        ORDER BY total_sales_usd DESC, paid_orders_count DESC
    `;

    const allParams = [];
    if (paramShiftStart) allParams.push(paramShiftStart);
    if (paramShiftEnd) allParams.push(paramShiftEnd);
    if (paramOrderStart) allParams.push(paramOrderStart);
    if (paramOrderEnd) allParams.push(paramOrderEnd);
    if (paramOrderStart) allParams.push(paramOrderStart);
    if (paramOrderEnd) allParams.push(paramOrderEnd);
    if (paramOrderStart) allParams.push(paramOrderStart);
    if (paramOrderEnd) allParams.push(paramOrderEnd);
    allParams.push(...userParams);

    const [rows] = await connection.query(sql, allParams);
    return rows;
};

const getInventoryUsageReport = async ({ startDate, endDate, lowStockOnly = false } = {}, connection = pool) => {
    let stockDateFilter = '';
    const params = [];

    if (startDate) {
        stockDateFilter += ` AND sm.created_at >= ?`;
        params.push(startDate);
    }
    if (endDate) {
        stockDateFilter += ` AND sm.created_at <= ?`;
        params.push(endDate);
    }

    let sql = `
        SELECT 
            i.id AS ingredient_id,
            i.name AS ingredient_name,
            i.unit,
            CAST(i.current_stock AS DOUBLE) AS current_stock,
            CAST(i.minimum_stock AS DOUBLE) AS minimum_stock,
            (i.current_stock <= i.minimum_stock) AS is_low_stock,
            CAST(COALESCE(SUM(CASE WHEN sm.movement_type = 'SALE' THEN ABS(sm.quantity_change) ELSE 0 END), 0) AS DOUBLE) AS total_consumed_sales,
            CAST(COALESCE(SUM(CASE WHEN sm.movement_type = 'RETURN' THEN sm.quantity_change ELSE 0 END), 0) AS DOUBLE) AS total_returned,
            CAST(COALESCE(SUM(CASE WHEN sm.movement_type = 'WASTE' THEN ABS(sm.quantity_change) ELSE 0 END), 0) AS DOUBLE) AS total_wasted,
            CAST(COALESCE(SUM(CASE WHEN sm.movement_type = 'PURCHASE' THEN sm.quantity_change ELSE 0 END), 0) AS DOUBLE) AS total_purchased,
            CAST(COALESCE(SUM(CASE WHEN sm.movement_type = 'ADJUSTMENT' THEN sm.quantity_change ELSE 0 END), 0) AS DOUBLE) AS total_adjusted
        FROM ingredients i
        LEFT JOIN stock_movements sm ON sm.ingredient_id = i.id ${stockDateFilter}
        WHERE i.is_active = TRUE
    `;

    if (lowStockOnly) {
        sql += ` AND i.current_stock <= i.minimum_stock`;
    }

    sql += ` GROUP BY i.id, i.name, i.unit, i.current_stock, i.minimum_stock
             ORDER BY is_low_stock DESC, i.name ASC`;

    const [rows] = await connection.query(sql, params);
    return rows.map(r => ({
        ...r,
        is_low_stock: Boolean(r.is_low_stock)
    }));
};

module.exports = {
    getDashboardOrdersStats,
    getDashboardRefundsStats,
    getDashboardExpensesStats,
    getDashboardPaymentBreakdown,
    getSalesTrend,
    getTopProducts,
    getCategoriesReport,
    getPaymentMethodsReport,
    getStaffPerformanceReport,
    getInventoryUsageReport
};

