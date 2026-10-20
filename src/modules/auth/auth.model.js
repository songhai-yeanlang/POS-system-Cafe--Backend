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
        'SELECT id, name, email, role, is_active, last_login_at, created_at FROM users WHERE id = ? LIMIT 1',
        [id]
    );
    return rows[0] || null;
};

const findUserByIdWithPassword = async (id) => {
    const [rows] = await pool.query(
        'SELECT id, name, email, password_hash, role, is_active FROM users WHERE id = ? LIMIT 1',
        [id]
    );
    return rows[0] || null;
};

const updateProfile = async (userId, { name }) => {
    await pool.query(
        'UPDATE users SET name = ? WHERE id = ?',
        [name, userId]
    );
};

const updatePassword = async (userId, newPasswordHash) => {
    await pool.query(
        'UPDATE users SET password_hash = ? WHERE id = ?',
        [newPasswordHash, userId]
    );
};

const saveRefreshToken = async ({ userId, tokenHash, userAgent, ipAddress, expiresAt }) => {
    const [result] = await pool.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, user_agent, ip_address, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, tokenHash, userAgent, ipAddress, expiresAt]
    );
    return result.insertId;
};

const findRefreshToken = async (tokenHash) => {
    const [rows] = await pool.query(
        `SELECT id, user_id, token_hash, user_agent, ip_address, expires_at, revoked_at, created_at
         FROM refresh_tokens
         WHERE token_hash = ?
         LIMIT 1`,
        [tokenHash]
    );
    return rows[0] || null;
};

const revokeRefreshToken = async (id) => {
    await pool.query(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?',
        [id]
    );
};

const revokeAllUserRefreshTokens = async (userId) => {
    await pool.query(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL',
        [userId]
    );
};

const deleteExpiredRefreshTokens = async () => {
    const [result] = await pool.query(
        'DELETE FROM refresh_tokens WHERE expires_at < NOW() OR (revoked_at IS NOT NULL AND revoked_at < DATE_SUB(NOW(), INTERVAL 30 DAY))'
    );
    return result.affectedRows;
};

// ==================== PASSWORD RESETS ====================

const invalidatePreviousResets = async (userId) => {
    await pool.query(
        'UPDATE password_resets SET is_used = TRUE WHERE user_id = ? AND is_used = FALSE',
        [userId]
    );
};

const createPasswordReset = async ({ userId, email, otpHash, expiresAt }) => {
    const [result] = await pool.query(
        `INSERT INTO password_resets (user_id, email, otp_hash, expires_at)
         VALUES (?, ?, ?, ?)`,
        [userId, email, otpHash, expiresAt]
    );
    return result.insertId;
};

const findActiveResetByEmail = async (email) => {
    const [rows] = await pool.query(
        `SELECT id, user_id, email, otp_hash, reset_token, attempts, expires_at, is_used, created_at
         FROM password_resets
         WHERE email = ? AND is_used = FALSE AND expires_at > NOW()
         ORDER BY id DESC
         LIMIT 1`,
        [email]
    );
    return rows[0] || null;
};

const incrementResetAttempts = async (id) => {
    await pool.query(
        'UPDATE password_resets SET attempts = attempts + 1 WHERE id = ?',
        [id]
    );
};

const saveResetToken = async (id, resetToken) => {
    // Refresh expires_at to 15 minutes from now for password reset step
    await pool.query(
        'UPDATE password_resets SET reset_token = ?, expires_at = DATE_ADD(NOW(), INTERVAL 15 MINUTE) WHERE id = ?',
        [resetToken, id]
    );
};

const findResetByToken = async (resetToken) => {
    const [rows] = await pool.query(
        `SELECT id, user_id, email, reset_token, expires_at, is_used
         FROM password_resets
         WHERE reset_token = ? AND is_used = FALSE AND expires_at > NOW()
         LIMIT 1`,
        [resetToken]
    );
    return rows[0] || null;
};

const markResetAsUsed = async (id) => {
    await pool.query(
        'UPDATE password_resets SET is_used = TRUE WHERE id = ?',
        [id]
    );
};

module.exports = {
    findUserByEmail,
    updateLastLogin,
    findUserById,
    findUserByIdWithPassword,
    updateProfile,
    updatePassword,
    saveRefreshToken,
    findRefreshToken,
    revokeRefreshToken,
    revokeAllUserRefreshTokens,
    deleteExpiredRefreshTokens,
    invalidatePreviousResets,
    createPasswordReset,
    findActiveResetByEmail,
    incrementResetAttempts,
    saveResetToken,
    findResetByToken,
    markResetAsUsed
};

