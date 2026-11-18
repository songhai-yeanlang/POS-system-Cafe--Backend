const { connection: pool } = require('../../config/db.config');

const formatDiscountCodeRow = (row) => {
    if (!row) return null;

    const maxUses = row.max_uses !== null && row.max_uses !== undefined ? Number(row.max_uses) : null;
    const usedCount = Number(row.used_count || 0);
    const isActive = Boolean(row.is_active);

    // Use MySQL NOW()-computed flags so status matches SQL validOnly / incrementUsedCount with zero timezone drift
    const isNotStarted = Boolean(row.is_not_started);
    const isExpired = Boolean(row.is_expired);
    const isExhausted = maxUses !== null ? usedCount >= maxUses : false;
    const isCurrentlyValid = isActive && !isNotStarted && !isExpired && !isExhausted;

    return {
        id: row.id,
        code: row.code,
        name: row.name,
        description: row.description,
        discount_type: row.discount_type,
        discount_value: Number(row.discount_value),
        min_order_amount: Number(row.min_order_amount || 0),
        max_uses: maxUses,
        used_count: usedCount,
        remaining_uses: maxUses !== null ? Math.max(0, maxUses - usedCount) : null,
        starts_at: row.starts_at,
        expires_at: row.expires_at,
        is_active: isActive,
        is_not_started: isNotStarted,
        is_expired: isExpired,
        is_exhausted: isExhausted,
        is_currently_valid: isCurrentlyValid,
        created_by: row.created_by ? {
            id: row.created_by,
            name: row.creator_name || null,
            email: row.creator_email || null
        } : null,
        created_at: row.created_at,
        updated_at: row.updated_at
    };
};

const BASE_SELECT = `
    SELECT
        dc.id,
        dc.code,
        dc.name,
        dc.description,
        dc.discount_type,
        CAST(dc.discount_value AS DOUBLE) AS discount_value,
        CAST(dc.min_order_amount AS DOUBLE) AS min_order_amount,
        dc.max_uses,
        dc.used_count,
        dc.starts_at,
        dc.expires_at,
        dc.is_active,
        (dc.starts_at IS NOT NULL AND dc.starts_at > NOW()) AS is_not_started,
        (dc.expires_at IS NOT NULL AND dc.expires_at < NOW()) AS is_expired,
        dc.created_by,
        u.name AS creator_name,
        u.email AS creator_email,
        dc.created_at,
        dc.updated_at
    FROM discount_codes dc
    LEFT JOIN users u ON u.id = dc.created_by
`;

const findDiscountCodeById = async (id, connection = pool, forUpdate = false) => {
    const lockClause = forUpdate ? ' FOR UPDATE' : '';
    const [rows] = await connection.query(
        `${BASE_SELECT} WHERE dc.id = ? LIMIT 1${lockClause}`,
        [id]
    );
    return formatDiscountCodeRow(rows[0]);
};

const findDiscountCodeByCode = async (code, connection = pool, forUpdate = false) => {
    const lockClause = forUpdate ? ' FOR UPDATE' : '';
    const [rows] = await connection.query(
        `${BASE_SELECT} WHERE UPPER(dc.code) = UPPER(?) LIMIT 1${lockClause}`,
        [code]
    );
    return formatDiscountCodeRow(rows[0]);
};

const buildFilterWhere = ({ search, discountType, isActive, validOnly } = {}) => {
    let where = ' WHERE 1=1';
    const params = [];

    if (search) {
        where += ' AND (dc.code LIKE ? OR dc.name LIKE ? OR dc.description LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (discountType) {
        where += ' AND dc.discount_type = ?';
        params.push(discountType);
    }

    if (isActive !== undefined && isActive !== null) {
        where += ' AND dc.is_active = ?';
        params.push(Boolean(isActive));
    }

    if (validOnly) {
        where += `
            AND dc.is_active = TRUE
            AND (dc.starts_at IS NULL OR dc.starts_at <= NOW())
            AND (dc.expires_at IS NULL OR dc.expires_at >= NOW())
            AND (dc.max_uses IS NULL OR dc.used_count < dc.max_uses)
        `;
    }

    return { where, params };
};

const findAllDiscountCodes = async (filters = {}, connection = pool) => {
    const { where, params } = buildFilterWhere(filters);
    let sql = `${BASE_SELECT}${where} ORDER BY dc.id DESC`;

    if (filters.limit !== undefined && filters.offset !== undefined) {
        sql += ' LIMIT ? OFFSET ?';
        params.push(Number(filters.limit), Number(filters.offset));
    }

    const [rows] = await connection.query(sql, params);
    return rows.map(formatDiscountCodeRow);
};

const countAllDiscountCodes = async (filters = {}, connection = pool) => {
    const { where, params } = buildFilterWhere(filters);
    const [rows] = await connection.query(
        `SELECT COUNT(*) AS total FROM discount_codes dc${where}`,
        params
    );
    return Number(rows[0]?.total || 0);
};

const insertDiscountCode = async ({
    code,
    name,
    description = null,
    discountType,
    discountValue,
    minOrderAmount = 0,
    maxUses = null,
    startsAt = null,
    expiresAt = null,
    isActive = true,
    createdBy
}, connection = pool) => {
    const [result] = await connection.query(
        `INSERT INTO discount_codes (
            code,
            name,
            description,
            discount_type,
            discount_value,
            min_order_amount,
            max_uses,
            starts_at,
            expires_at,
            is_active,
            created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            code,
            name,
            description,
            discountType,
            discountValue,
            minOrderAmount,
            maxUses,
            startsAt,
            expiresAt,
            Boolean(isActive),
            createdBy
        ]
    );
    return result.insertId;
};

const updateDiscountCodeById = async (id, fields = {}, connection = pool) => {
    const setClauses = [];
    const params = [];

    const allowedColumns = [
        'code',
        'name',
        'description',
        'discount_type',
        'discount_value',
        'min_order_amount',
        'max_uses',
        'starts_at',
        'expires_at',
        'is_active'
    ];

    for (const col of allowedColumns) {
        if (fields[col] !== undefined) {
            setClauses.push(`${col} = ?`);
            params.push(fields[col]);
        }
    }

    if (setClauses.length === 0) return 0;

    params.push(id);
    const [result] = await connection.query(
        `UPDATE discount_codes SET ${setClauses.join(', ')} WHERE id = ?`,
        params
    );
    return result.affectedRows;
};

const countOrdersUsingDiscountCode = async (id, connection = pool) => {
    const [rows] = await connection.query(
        `SELECT COUNT(*) AS total FROM orders WHERE discount_code_id = ?`,
        [id]
    );
    return Number(rows[0]?.total || 0);
};

const isDiscountCodeHeldByOrder = async (discountCodeId, orderId, connection = pool) => {
    if (!discountCodeId || !orderId) return false;
    const [rows] = await connection.query(
        `SELECT id FROM orders WHERE id = ? AND discount_code_id = ? AND status = 'OPEN' LIMIT 1`,
        [orderId, discountCodeId]
    );
    return rows.length > 0;
};

const deleteDiscountCodeById = async (id, connection = pool) => {
    const [result] = await connection.query(
        `DELETE FROM discount_codes WHERE id = ?`,
        [id]
    );
    return result.affectedRows > 0;
};

const incrementUsedCount = async (id, connection = pool) => {
    const [result] = await connection.query(
        `UPDATE discount_codes
         SET used_count = used_count + 1
         WHERE id = ?
           AND is_active = TRUE
           AND (starts_at IS NULL OR starts_at <= NOW())
           AND (expires_at IS NULL OR expires_at >= NOW())
           AND (max_uses IS NULL OR used_count < max_uses)`,
        [id]
    );
    return result.affectedRows > 0;
};

const decrementUsedCount = async (id, connection = pool) => {
    const [result] = await connection.query(
        `UPDATE discount_codes
         SET used_count = CASE WHEN used_count > 0 THEN used_count - 1 ELSE 0 END
         WHERE id = ?`,
        [id]
    );
    return result.affectedRows > 0;
};

module.exports = {
    findDiscountCodeById,
    findDiscountCodeByCode,
    findAllDiscountCodes,
    countAllDiscountCodes,
    insertDiscountCode,
    updateDiscountCodeById,
    countOrdersUsingDiscountCode,
    isDiscountCodeHeldByOrder,
    deleteDiscountCodeById,
    incrementUsedCount,
    decrementUsedCount
};
