const { connection: pool } = require('../../config/db.config');

const findAllIngredients = async ({ isActive, search, unit, lowStock, limit, offset } = {}) => {
    let sql = `
        SELECT 
            i.id,
            i.name,
            i.unit,
            CAST(i.current_stock AS DOUBLE) AS current_stock,
            CAST(i.minimum_stock AS DOUBLE) AS minimum_stock,
            i.is_active,
            (i.current_stock <= i.minimum_stock) AS is_low_stock,
            i.created_at,
            i.updated_at,
            COUNT(r.id) AS total_recipes
        FROM ingredients i
        LEFT JOIN recipes r ON r.ingredient_id = i.id
        WHERE 1=1
    `;
    const params = [];

    if (isActive !== undefined && isActive !== null) {
        sql += ` AND i.is_active = ?`;
        params.push(isActive ? 1 : 0);
    }

    if (unit) {
        sql += ` AND i.unit = ?`;
        params.push(unit);
    }

    if (search) {
        sql += ` AND i.name LIKE ?`;
        params.push(`%${search}%`);
    }

    if (lowStock) {
        sql += ` AND i.current_stock <= i.minimum_stock`;
    }

    sql += ` GROUP BY i.id ORDER BY i.name ASC`;

    if (limit !== undefined && limit !== null && offset !== undefined && offset !== null) {
        sql += ` LIMIT ? OFFSET ?`;
        params.push(Number(limit), Number(offset));
    }

    const [rows] = await pool.query(sql, params);
    return rows;
};

const countIngredients = async ({ isActive, search, unit, lowStock } = {}) => {
    let sql = `SELECT COUNT(*) AS total FROM ingredients i WHERE 1=1`;
    const params = [];

    if (isActive !== undefined && isActive !== null) {
        sql += ` AND i.is_active = ?`;
        params.push(isActive ? 1 : 0);
    }

    if (unit) {
        sql += ` AND i.unit = ?`;
        params.push(unit);
    }

    if (search) {
        sql += ` AND i.name LIKE ?`;
        params.push(`%${search}%`);
    }

    if (lowStock) {
        sql += ` AND i.current_stock <= i.minimum_stock`;
    }

    const [rows] = await pool.query(sql, params);
    return rows[0].total;
};

const findLowStockIngredients = async ({ search, unit, limit, offset } = {}) => {
    let sql = `
        SELECT 
            i.id,
            i.name,
            i.unit,
            CAST(i.current_stock AS DOUBLE) AS current_stock,
            CAST(i.minimum_stock AS DOUBLE) AS minimum_stock,
            CAST(GREATEST(0, i.minimum_stock - i.current_stock) AS DOUBLE) AS deficit_stock,
            i.is_active,
            TRUE AS is_low_stock,
            i.created_at,
            i.updated_at,
            COUNT(r.id) AS total_recipes
        FROM ingredients i
        LEFT JOIN recipes r ON r.ingredient_id = i.id
        WHERE i.is_active = TRUE AND i.current_stock <= i.minimum_stock
    `;
    const params = [];

    if (unit) {
        sql += ` AND i.unit = ?`;
        params.push(unit);
    }

    if (search) {
        sql += ` AND i.name LIKE ?`;
        params.push(`%${search}%`);
    }

    sql += ` GROUP BY i.id ORDER BY (i.current_stock <= 0) DESC, deficit_stock DESC, i.name ASC`;

    if (limit !== undefined && limit !== null && offset !== undefined && offset !== null) {
        sql += ` LIMIT ? OFFSET ?`;
        params.push(Number(limit), Number(offset));
    }

    const [rows] = await pool.query(sql, params);
    return rows;
};

const countLowStockIngredients = async ({ search, unit } = {}) => {
    let sql = `
        SELECT COUNT(*) AS total 
        FROM ingredients i 
        WHERE i.is_active = TRUE AND i.current_stock <= i.minimum_stock
    `;
    const params = [];

    if (unit) {
        sql += ` AND i.unit = ?`;
        params.push(unit);
    }

    if (search) {
        sql += ` AND i.name LIKE ?`;
        params.push(`%${search}%`);
    }

    const [rows] = await pool.query(sql, params);
    return rows[0].total;
};

const findIngredientById = async (id, connection = pool) => {
    const [rows] = await connection.query(
        `SELECT 
            i.id,
            i.name,
            i.unit,
            CAST(i.current_stock AS DOUBLE) AS current_stock,
            CAST(i.minimum_stock AS DOUBLE) AS minimum_stock,
            i.is_active,
            (i.current_stock <= i.minimum_stock) AS is_low_stock,
            i.created_at,
            i.updated_at,
            COUNT(r.id) AS total_recipes
        FROM ingredients i
        LEFT JOIN recipes r ON r.ingredient_id = i.id
        WHERE i.id = ?
        GROUP BY i.id
        LIMIT 1`,
        [id]
    );
    return rows[0] || null;
};

const findIngredientByName = async (name, connection = pool) => {
    const [rows] = await connection.query(
        `SELECT id, name, unit, current_stock, minimum_stock, is_active, created_at, updated_at
        FROM ingredients
        WHERE name = ?
        LIMIT 1`,
        [name]
    );
    return rows[0] || null;
};

const findIngredientByNameExcludeId = async (name, excludeId, connection = pool) => {
    const [rows] = await connection.query(
        `SELECT id, name, unit, current_stock, minimum_stock, is_active, created_at, updated_at
        FROM ingredients
        WHERE name = ? AND id != ?
        LIMIT 1`,
        [name, excludeId]
    );
    return rows[0] || null;
};

const findIngredientsByIds = async (ingredientIds, connection = pool) => {
    if (!ingredientIds || ingredientIds.length === 0) return [];
    const [rows] = await connection.query(
        `SELECT id, name, unit, current_stock, is_active FROM ingredients WHERE id IN (?)`,
        [ingredientIds]
    );
    return rows;
};

const insertIngredient = async ({ name, unit, current_stock = 0, minimum_stock = 0, is_active = true }, connection = pool) => {
    const [result] = await connection.query(
        `INSERT INTO ingredients (name, unit, current_stock, minimum_stock, is_active)
         VALUES (?, ?, ?, ?, ?)`,
        [name, unit, current_stock, minimum_stock, is_active ? 1 : 0]
    );
    return result.insertId;
};

const updateIngredientById = async (id, updateData = {}, connection = pool) => {
    const allowedFields = ['name', 'unit', 'current_stock', 'minimum_stock', 'is_active'];
    const fields = [];
    const values = [];

    for (const key of allowedFields) {
        if (updateData[key] !== undefined) {
            fields.push(`${key} = ?`);
            if (key === 'is_active') {
                values.push(updateData[key] ? 1 : 0);
            } else {
                values.push(updateData[key]);
            }
        }
    }

    if (fields.length === 0) {
        return;
    }

    values.push(id);
    const sql = `UPDATE ingredients SET ${fields.join(', ')} WHERE id = ?`;
    await connection.query(sql, values);
};

const findIngredientByIdForUpdate = async (id, connection) => {
    const [rows] = await connection.query(
        `SELECT id, name, unit, CAST(current_stock AS DOUBLE) AS current_stock, is_active 
         FROM ingredients 
         WHERE id = ? 
         FOR UPDATE`,
        [id]
    );
    return rows[0] || null;
};

const updateIngredientStock = async (ingredientId, quantityChange, connection = pool) => {
    await connection.query(
        `UPDATE ingredients 
         SET current_stock = current_stock + ? 
         WHERE id = ?`,
        [quantityChange, ingredientId]
    );
};

const countRecipesByIngredientId = async (ingredientId, connection = pool) => {
    const [rows] = await connection.query(
        'SELECT COUNT(*) AS total FROM recipes WHERE ingredient_id = ?',
        [ingredientId]
    );
    return rows[0].total;
};

const countStockMovementsByIngredientId = async (ingredientId, connection = pool) => {
    const [rows] = await connection.query(
        'SELECT COUNT(*) AS total FROM stock_movements WHERE ingredient_id = ?',
        [ingredientId]
    );
    return rows[0].total;
};

const deleteIngredientById = async (id, connection = pool) => {
    const [result] = await connection.query(
        'DELETE FROM ingredients WHERE id = ?',
        [id]
    );
    return result.affectedRows;
};

const findStockMovements = async ({ ingredientId, movementType, orderId, createdBy, startDate, endDate, limit, offset } = {}) => {
    let sql = `
        SELECT 
            sm.id,
            sm.ingredient_id,
            i.name AS ingredient_name,
            i.unit AS ingredient_unit,
            sm.order_id,
            o.receipt_no AS order_receipt_no,
            sm.movement_type,
            CAST(sm.quantity_change AS DOUBLE) AS quantity_change,
            CAST(sm.unit_cost AS DOUBLE) AS unit_cost,
            CAST(ROUND(ABS(sm.quantity_change) * COALESCE(sm.unit_cost, 0), 2) AS DOUBLE) AS total_cost,
            sm.reason,
            sm.idempotency_key,
            sm.created_by,
            u.name AS created_by_name,
            sm.created_at
        FROM stock_movements sm
        JOIN ingredients i ON i.id = sm.ingredient_id
        LEFT JOIN orders o ON o.id = sm.order_id
        LEFT JOIN users u ON u.id = sm.created_by
        WHERE 1=1
    `;
    const params = [];

    if (ingredientId) {
        sql += ` AND sm.ingredient_id = ?`;
        params.push(ingredientId);
    }

    if (movementType) {
        sql += ` AND sm.movement_type = ?`;
        params.push(movementType);
    }

    if (orderId) {
        sql += ` AND sm.order_id = ?`;
        params.push(orderId);
    }

    if (createdBy) {
        sql += ` AND sm.created_by = ?`;
        params.push(createdBy);
    }

    if (startDate) {
        sql += ` AND sm.created_at >= ?`;
        params.push(startDate);
    }

    if (endDate) {
        sql += ` AND sm.created_at <= ?`;
        params.push(endDate);
    }

    sql += ` ORDER BY sm.created_at DESC, sm.id DESC`;

    if (limit !== undefined && limit !== null && offset !== undefined && offset !== null) {
        sql += ` LIMIT ? OFFSET ?`;
        params.push(Number(limit), Number(offset));
    }

    const [rows] = await pool.query(sql, params);
    return rows;
};

const countStockMovements = async ({ ingredientId, movementType, orderId, createdBy, startDate, endDate } = {}) => {
    let sql = `SELECT COUNT(*) AS total FROM stock_movements sm WHERE 1=1`;
    const params = [];

    if (ingredientId) {
        sql += ` AND sm.ingredient_id = ?`;
        params.push(ingredientId);
    }

    if (movementType) {
        sql += ` AND sm.movement_type = ?`;
        params.push(movementType);
    }

    if (orderId) {
        sql += ` AND sm.order_id = ?`;
        params.push(orderId);
    }

    if (createdBy) {
        sql += ` AND sm.created_by = ?`;
        params.push(createdBy);
    }

    if (startDate) {
        sql += ` AND sm.created_at >= ?`;
        params.push(startDate);
    }

    if (endDate) {
        sql += ` AND sm.created_at <= ?`;
        params.push(endDate);
    }

    const [rows] = await pool.query(sql, params);
    return rows[0].total;
};

const insertStockMovement = async ({
    ingredientId,
    orderId = null,
    movementType,
    quantityChange,
    unitCost = null,
    reason = null,
    idempotencyKey = null,
    createdBy
}, connection = pool) => {
    const [result] = await connection.query(
        `INSERT INTO stock_movements (
            ingredient_id, order_id, movement_type, quantity_change, 
            unit_cost, reason, idempotency_key, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [ingredientId, orderId, movementType, quantityChange, unitCost, reason, idempotencyKey, createdBy]
    );
    return result.insertId;
};

const findStockMovementById = async (id, connection = pool) => {
    const [rows] = await connection.query(
        `SELECT 
            sm.id,
            sm.ingredient_id,
            i.name AS ingredient_name,
            i.unit AS ingredient_unit,
            sm.order_id,
            o.receipt_no AS order_receipt_no,
            sm.movement_type,
            CAST(sm.quantity_change AS DOUBLE) AS quantity_change,
            CAST(sm.unit_cost AS DOUBLE) AS unit_cost,
            CAST(ROUND(ABS(sm.quantity_change) * COALESCE(sm.unit_cost, 0), 2) AS DOUBLE) AS total_cost,
            sm.reason,
            sm.idempotency_key,
            sm.created_by,
            u.name AS created_by_name,
            sm.created_at
        FROM stock_movements sm
        JOIN ingredients i ON i.id = sm.ingredient_id
        LEFT JOIN orders o ON o.id = sm.order_id
        LEFT JOIN users u ON u.id = sm.created_by
        WHERE sm.id = ?
        LIMIT 1`,
        [id]
    );
    return rows[0] || null;
};

const findStockMovementByIdempotencyKey = async (idempotencyKey, connection = pool) => {
    const [rows] = await connection.query(
        `SELECT id FROM stock_movements WHERE idempotency_key = ? LIMIT 1`,
        [idempotencyKey]
    );
    return rows[0] || null;
};

const findVariantDetailsById = async (variantId, connection = pool) => {
    const [rows] = await connection.query(
        `SELECT 
            pv.id AS variant_id,
            pv.name AS variant_name,
            pv.size,
            pv.temperature,
            CAST(pv.price AS DOUBLE) AS price,
            pv.is_active AS variant_is_active,
            p.id AS product_id,
            p.name AS product_name
        FROM product_variants pv
        JOIN products p ON p.id = pv.product_id
        WHERE pv.id = ?
        LIMIT 1`,
        [variantId]
    );
    return rows[0] || null;
};

const findRecipesByVariantId = async (variantId, connection = pool) => {
    const [rows] = await connection.query(
        `SELECT 
            r.id,
            r.variant_id,
            r.ingredient_id,
            i.name AS ingredient_name,
            i.unit AS ingredient_unit,
            CAST(r.quantity AS DOUBLE) AS quantity,
            CAST(i.current_stock AS DOUBLE) AS current_stock,
            i.is_active AS ingredient_is_active,
            r.created_at,
            r.updated_at
        FROM recipes r
        JOIN ingredients i ON i.id = r.ingredient_id
        WHERE r.variant_id = ?
        ORDER BY r.id ASC`,
        [variantId]
    );
    return rows;
};

const deleteRecipesByVariantId = async (variantId, connection = pool) => {
    const [result] = await connection.query(
        `DELETE FROM recipes WHERE variant_id = ?`,
        [variantId]
    );
    return result.affectedRows;
};

const insertRecipes = async (recipeRows, connection = pool) => {
    if (!recipeRows || recipeRows.length === 0) return 0;
    const [result] = await connection.query(
        `INSERT INTO recipes (variant_id, ingredient_id, quantity) VALUES ?`,
        [recipeRows]
    );
    return result.affectedRows;
};

const findRecipesByProductId = async (productId, connection = pool) => {
    const [rows] = await connection.query(
        `SELECT 
            pv.id AS variant_id,
            pv.name AS variant_name,
            pv.size,
            pv.temperature,
            CAST(pv.price AS DOUBLE) AS price,
            pv.is_active AS variant_is_active,
            r.id AS recipe_id,
            r.ingredient_id,
            i.name AS ingredient_name,
            i.unit AS ingredient_unit,
            CAST(r.quantity AS DOUBLE) AS quantity,
            CAST(i.current_stock AS DOUBLE) AS current_stock,
            i.is_active AS ingredient_is_active
         FROM product_variants pv
         JOIN products p ON p.id = pv.product_id
         LEFT JOIN recipes r ON r.variant_id = pv.id
         LEFT JOIN ingredients i ON i.id = r.ingredient_id
         WHERE pv.product_id = ?
         ORDER BY pv.id ASC, r.id ASC`,
        [productId]
    );
    return rows;
};

const findAllRecipes = async ({ search, variantId, ingredientId, limit, offset } = {}) => {
    let sql = `
        SELECT 
            r.id,
            r.variant_id,
            pv.name AS variant_name,
            p.id AS product_id,
            p.name AS product_name,
            r.ingredient_id,
            i.name AS ingredient_name,
            i.unit AS ingredient_unit,
            CAST(r.quantity AS DOUBLE) AS quantity,
            CAST(i.current_stock AS DOUBLE) AS current_stock,
            r.created_at,
            r.updated_at
        FROM recipes r
        JOIN product_variants pv ON pv.id = r.variant_id
        JOIN products p ON p.id = pv.product_id
        JOIN ingredients i ON i.id = r.ingredient_id
        WHERE 1=1
    `;
    const params = [];

    if (variantId) {
        sql += ` AND r.variant_id = ?`;
        params.push(variantId);
    }

    if (ingredientId) {
        sql += ` AND r.ingredient_id = ?`;
        params.push(ingredientId);
    }

    if (search) {
        sql += ` AND (p.name LIKE ? OR pv.name LIKE ? OR i.name LIKE ?)`;
        const s = `%${search}%`;
        params.push(s, s, s);
    }

    sql += ` ORDER BY p.name ASC, pv.name ASC, r.id ASC`;

    if (limit !== undefined && limit !== null && offset !== undefined && offset !== null) {
        sql += ` LIMIT ? OFFSET ?`;
        params.push(Number(limit), Number(offset));
    }

    const [rows] = await pool.query(sql, params);
    return rows;
};

const countAllRecipes = async ({ search, variantId, ingredientId } = {}) => {
    let sql = `
        SELECT COUNT(*) AS total
        FROM recipes r
        JOIN product_variants pv ON pv.id = r.variant_id
        JOIN products p ON p.id = pv.product_id
        JOIN ingredients i ON i.id = r.ingredient_id
        WHERE 1=1
    `;
    const params = [];

    if (variantId) {
        sql += ` AND r.variant_id = ?`;
        params.push(variantId);
    }

    if (ingredientId) {
        sql += ` AND r.ingredient_id = ?`;
        params.push(ingredientId);
    }

    if (search) {
        sql += ` AND (p.name LIKE ? OR pv.name LIKE ? OR i.name LIKE ?)`;
        const s = `%${search}%`;
        params.push(s, s, s);
    }

    const [rows] = await pool.query(sql, params);
    return rows[0].total;
};

module.exports = {
    findAllIngredients,
    countIngredients,
    findLowStockIngredients,
    countLowStockIngredients,
    findIngredientById,
    findIngredientByIdForUpdate,
    findIngredientByName,
    findIngredientByNameExcludeId,
    findIngredientsByIds,
    insertIngredient,
    updateIngredientById,
    updateIngredientStock,
    countRecipesByIngredientId,
    countStockMovementsByIngredientId,
    deleteIngredientById,
    findStockMovements,
    countStockMovements,
    insertStockMovement,
    findStockMovementById,
    findStockMovementByIdempotencyKey,
    findVariantDetailsById,
    findRecipesByVariantId,
    deleteRecipesByVariantId,
    insertRecipes,
    findRecipesByProductId,
    findAllRecipes,
    countAllRecipes
};
