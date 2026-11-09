const { connection: pool } = require('../../config/db.config');

/**
 * Pure SQL: Fetch settings singleton row (id = 1)
 */
const findSettings = async (connection = null) => {
    const db = connection || pool;
    const [rows] = await db.query(
        `SELECT 
            id, 
            shop_name, 
            address, 
            phone, 
            logo, 
            base_currency, 
            exchange_rate, 
            receipt_footer, 
            receipt_width, 
            updated_at 
         FROM settings 
         WHERE id = 1 
         LIMIT 1`
    );
    return rows[0] || null;
};

/**
 * Pure SQL: Insert default settings if id = 1 does not exist
 */
const insertDefaultSettings = async (connection = null) => {
    const db = connection || pool;
    const [result] = await db.query(
        `INSERT IGNORE INTO settings (id, shop_name, exchange_rate) 
         VALUES (1, 'Coffee Shop', 4100.000000)`
    );
    return result.affectedRows;
};

/**
 * Pure SQL: Update settings fields by id
 */
const updateSettingsById = async (id = 1, data = {}, connection = null) => {
    const allowedFields = [
        'shop_name',
        'address',
        'phone',
        'logo',
        'exchange_rate',
        'receipt_footer',
        'receipt_width'
    ];

    const fields = [];
    const params = [];

    for (const key of allowedFields) {
        if (data[key] !== undefined) {
            fields.push(`${key} = ?`);
            params.push(data[key]);
        }
    }

    if (fields.length === 0) {
        return 0;
    }

    params.push(id);
    const db = connection || pool;
    const sql = `UPDATE settings SET ${fields.join(', ')} WHERE id = ?`;
    const [result] = await db.query(sql, params);

    return result.affectedRows;
};

/**
 * Pure SQL: Clear selected data modules safely with FOREIGN_KEY_CHECKS disabled
 */
const clearSystemData = async (targets = ['ALL']) => {
    const targetSet = new Set(targets.map((t) => String(t).toUpperCase()));
    const isAll = targetSet.has('ALL');

    const connection = await pool.getConnection();
    const clearedTables = [];
    let removedProductImages = [];

    try {
        await connection.query('SET FOREIGN_KEY_CHECKS = 0');

        // Collect product images before clearing products so files can be removed from disk
        if (isAll || targetSet.has('PRODUCTS') || targetSet.has('CATEGORIES')) {
            const [imgRows] = await connection.query(
                `SELECT image FROM products WHERE image IS NOT NULL AND image != ''`
            );
            removedProductImages = imgRows.map((r) => r.image).filter(Boolean);
        }

        // 1. Orders, Receipts, Payments & Refunds
        if (isAll || targetSet.has('ORDERS') || targetSet.has('SHIFTS')) {
            await connection.query('TRUNCATE TABLE refunds');
            await connection.query('TRUNCATE TABLE payments');
            await connection.query('TRUNCATE TABLE order_item_addons');
            await connection.query('TRUNCATE TABLE order_items');
            await connection.query('TRUNCATE TABLE orders');
            clearedTables.push('refunds', 'payments', 'order_item_addons', 'order_items', 'orders');

            if (!isAll && !targetSet.has('INVENTORY') && !targetSet.has('STOCK_MOVEMENTS')) {
                await connection.query('DELETE FROM stock_movements WHERE order_id IS NOT NULL');
            }
        }

        // 2. Expenses
        if (isAll || targetSet.has('EXPENSES') || targetSet.has('SHIFTS')) {
            await connection.query('TRUNCATE TABLE expenses');
            clearedTables.push('expenses');
        }

        // 3. Shifts
        if (isAll || targetSet.has('SHIFTS')) {
            await connection.query('TRUNCATE TABLE shifts');
            clearedTables.push('shifts');
        }

        // 4. Inventory, Stock Movements & Recipes
        if (isAll || targetSet.has('INVENTORY')) {
            await connection.query('TRUNCATE TABLE stock_movements');
            await connection.query('TRUNCATE TABLE recipes');
            await connection.query('TRUNCATE TABLE ingredients');
            clearedTables.push('stock_movements', 'recipes', 'ingredients');
        } else {
            if (targetSet.has('STOCK_MOVEMENTS')) {
                await connection.query('TRUNCATE TABLE stock_movements');
                clearedTables.push('stock_movements');
            }
            if (targetSet.has('RECIPES')) {
                await connection.query('TRUNCATE TABLE recipes');
                clearedTables.push('recipes');
            }
        }

        // 5. Products & Categories
        if (isAll || targetSet.has('PRODUCTS') || targetSet.has('CATEGORIES')) {
            if (!clearedTables.includes('recipes')) {
                await connection.query('TRUNCATE TABLE recipes');
                clearedTables.push('recipes');
            }

            // Check if orders table still has records (when ORDERS was not cleared)
            // If orders exist, use DELETE instead of TRUNCATE so new variant IDs do not collide with historical order_items
            const [orderCountRows] = await connection.query('SELECT COUNT(*) AS total FROM orders');
            const hasRemainingOrders = Number(orderCountRows[0]?.total || 0) > 0;

            if (hasRemainingOrders) {
                await connection.query('DELETE FROM product_variants');
                await connection.query('DELETE FROM products');
            } else {
                await connection.query('TRUNCATE TABLE product_variants');
                await connection.query('TRUNCATE TABLE products');
            }
            clearedTables.push('product_variants', 'products');

            if (isAll || targetSet.has('CATEGORIES')) {
                if (hasRemainingOrders) {
                    await connection.query('DELETE FROM categories');
                } else {
                    await connection.query('TRUNCATE TABLE categories');
                }
                clearedTables.push('categories');
            }
        }

        // 6. Audit Logs
        if (isAll || targetSet.has('AUDIT_LOGS')) {
            await connection.query('TRUNCATE TABLE audit_logs');
            clearedTables.push('audit_logs');
        }

        return {
            clearedTables: Array.from(new Set(clearedTables)),
            removedProductImages
        };
    } finally {
        try {
            await connection.query('SET FOREIGN_KEY_CHECKS = 1');
        } catch (_) {}
        connection.release();
    }
};

module.exports = {
    findSettings,
    insertDefaultSettings,
    updateSettingsById,
    clearSystemData
};
