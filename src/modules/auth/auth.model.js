const { connection: pool } = require('../../config/db.config');

const findUserByEmail = async (email) => {
    const [rows] = await pool.query(
        'SELECT id, name, email, password_hash, role, is_active FROM users WHERE email = ? LIMIT 1',
        [email]
    );
    return rows[0] || null;
};

const updateLastLogin = async (userId) => {
    await pool.query(
        'UPDATE users SET last_login_at = NOW() WHERE id = ?',
        [userId]
    );
};

const findUserById = async (id) => {
    const [rows] = await pool.query(
        'SELECT id, name, email, role, is_active FROM users WHERE id = ? LIMIT 1',
        [id]
    );
    return rows[0] || null;
};

module.exports = {
    findUserByEmail,
    updateLastLogin,
    findUserById
};
