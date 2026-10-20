const { connection: pool } = require('../../config/db.config');

const findUsers = async ({ role, isActive, search, limit, offset }) => {
    let sql = `
        SELECT id, name, email, role, is_active, last_login_at, created_at, updated_at
        FROM users
        WHERE 1=1
    `;
    const params = [];

    if (role) {
        sql += ` AND role = ?`;
        params.push(role);
    }
    if (isActive !== undefined && isActive !== null) {
        sql += ` AND is_active = ?`;
        params.push(isActive);
    }
    if (search) {
        sql += ` AND (name LIKE ? OR email LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`);
    }

    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(Number(limit), Number(offset));

    const [rows] = await pool.query(sql, params);
    return rows;
};

const countUsers = async ({ role, isActive, search }) => {
    let sql = `SELECT COUNT(*) AS total FROM users WHERE 1=1`;
    const params = [];

    if (role) {
        sql += ` AND role = ?`;
        params.push(role);
    }
    if (isActive !== undefined && isActive !== null) {
        sql += ` AND is_active = ?`;
        params.push(isActive);
    }
    if (search) {
        sql += ` AND (name LIKE ? OR email LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`);
    }

    const [rows] = await pool.query(sql, params);
    return rows[0].total;
};

const findUserByEmail = async (email) => {
    const [rows] = await pool.query(
        'SELECT id, name, email FROM users WHERE email = ? LIMIT 1',
        [email]
    );
    return rows[0] || null;
};

const findUserByEmailExcludeId = async (email, excludeId) => {
    const [rows] = await pool.query(
        'SELECT id, name, email FROM users WHERE email = ? AND id != ? LIMIT 1',
        [email, excludeId]
    );
    return rows[0] || null;
};

const findUserById = async (id) => {
    const [rows] = await pool.query(
        'SELECT id, name, email, role, is_active, last_login_at, created_at, updated_at FROM users WHERE id = ? LIMIT 1',
        [id]
    );
    return rows[0] || null;
};

const insertUser = async ({ name, email, passwordHash, role, isActive }) => {
    const [result] = await pool.query(
        `INSERT INTO users (name, email, password_hash, role, is_active)
         VALUES (?, ?, ?, ?, ?)`,
        [name, email, passwordHash, role, isActive]
    );
    return result.insertId;
};

const updateUserById = async (id, updateData) => {
    const fields = [];
    const values = [];

    if (updateData.name !== undefined) {
        fields.push('name = ?');
        values.push(updateData.name);
    }
    if (updateData.email !== undefined) {
        fields.push('email = ?');
        values.push(updateData.email);
    }
    if (updateData.passwordHash !== undefined) {
        fields.push('password_hash = ?');
        values.push(updateData.passwordHash);
    }
    if (updateData.role !== undefined) {
        fields.push('role = ?');
        values.push(updateData.role);
    }
    if (updateData.isActive !== undefined) {
        fields.push('is_active = ?');
        values.push(updateData.isActive);
    }

    if (fields.length === 0) return 0;

    values.push(id);
    const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
    const [result] = await pool.query(sql, values);
    return result.affectedRows;
};

const revokeUserSessions = async (userId) => {
    await pool.query(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL',
        [userId]
    );
};

const deleteUserById = async (id) => {
    // Preserve historical audit logs by setting user_id to NULL before deleting user
    await pool.query(
        'UPDATE audit_logs SET user_id = NULL WHERE user_id = ?',
        [id]
    );

    const [result] = await pool.query(
        'DELETE FROM users WHERE id = ?',
        [id]
    );
    return result.affectedRows;
};

const countActiveOwners = async () => {
    const [rows] = await pool.query(
        "SELECT COUNT(*) AS total FROM users WHERE role = 'OWNER' AND is_active = TRUE"
    );
    return rows[0].total;
};

const checkUserHasTransactions = async (id) => {
    // 1. Check orders (cashier, canceller, discount approver)
    const [orders] = await pool.query(
        'SELECT id FROM orders WHERE cashier_id = ? OR cancelled_by = ? OR discount_approved_by = ? LIMIT 1',
        [id, id, id]
    );
    if (orders.length > 0) return true;

    // 2. Check cashier shifts
    const [shifts] = await pool.query(
        'SELECT id FROM shifts WHERE user_id = ? LIMIT 1',
        [id]
    );
    if (shifts.length > 0) return true;

    // 3. Check expenses created
    const [expenses] = await pool.query(
        'SELECT id FROM expenses WHERE created_by = ? LIMIT 1',
        [id]
    );
    if (expenses.length > 0) return true;

    // 4. Check payments received
    const [payments] = await pool.query(
        'SELECT id FROM payments WHERE received_by = ? LIMIT 1',
        [id]
    );
    if (payments.length > 0) return true;

    // 5. Check refunds approved
    const [refunds] = await pool.query(
        'SELECT id FROM refunds WHERE approved_by = ? LIMIT 1',
        [id]
    );
    if (refunds.length > 0) return true;

    // 6. Check stock movements
    const [stocks] = await pool.query(
        'SELECT id FROM stock_movements WHERE created_by = ? LIMIT 1',
        [id]
    );
    if (stocks.length > 0) return true;

    return false;
};

module.exports = {
    findUsers,
    countUsers,
    findUserByEmail,
    findUserByEmailExcludeId,
    findUserById,
    insertUser,
    updateUserById,
    revokeUserSessions,
    deleteUserById,
    countActiveOwners,
    checkUserHasTransactions
};
