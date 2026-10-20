const { connection: pool } = require('../../config/db.config');

const getSettings = async () => {
    const [rows] = await pool.query(
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

const initDefaultSettings = async () => {
    await pool.query(
        `INSERT IGNORE INTO settings (id, shop_name, exchange_rate) 
         VALUES (1, 'Coffee Shop', 4100.000000)`
    );
    return await getSettings();
};

const updateSettings = async (data = {}) => {
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
        return await getSettings();
    }

    params.push(1); // WHERE id = 1
    const sql = `UPDATE settings SET ${fields.join(', ')} WHERE id = ?`;
    await pool.query(sql, params);

    return await getSettings();
};

module.exports = {
    getSettings,
    initDefaultSettings,
    updateSettings
};
