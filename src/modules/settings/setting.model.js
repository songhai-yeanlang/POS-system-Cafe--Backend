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

module.exports = {
    findSettings,
    insertDefaultSettings,
    updateSettingsById
};
