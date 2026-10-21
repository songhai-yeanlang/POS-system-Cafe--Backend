const { connection: pool } = require('../../config/db.config');

const findAllCategories = async ({ isActive, search } = {}) => {
    let sql = `
        SELECT 
            c.id, 
            c.name, 
            c.sort_order, 
            c.is_active, 
            c.created_at, 
            c.updated_at,
            COUNT(p.id) AS total_products
        FROM categories c
        LEFT JOIN products p ON p.category_id = c.id
        WHERE 1=1
    `;
    const params = [];

    if (isActive !== undefined && isActive !== null) {
        sql += ` AND c.is_active = ?`;
        params.push(isActive);
    }

    if (search) {
        sql += ` AND c.name LIKE ?`;
        params.push(`%${search}%`);
    }

    sql += ` GROUP BY c.id ORDER BY c.sort_order ASC, c.id ASC`;
    const [rows] = await pool.query(sql, params);
    return rows;
};

const findCategoryByName = async (name) => {
    const [rows] = await pool.query(
        `SELECT id, name, sort_order, is_active, created_at, updated_at 
         FROM categories 
         WHERE name = ? 
         LIMIT 1`,
        [name]
    );
    return rows[0] || null;
};

const findCategoryByNameExcludeId = async (name, excludeId) => {
    const [rows] = await pool.query(
        `SELECT id, name, sort_order, is_active, created_at, updated_at 
         FROM categories 
         WHERE name = ? AND id != ? 
         LIMIT 1`,
        [name, excludeId]
    );
    return rows[0] || null;
};

const findCategoryById = async (id) => {
    const [rows] = await pool.query(
        `SELECT 
            c.id, 
            c.name, 
            c.sort_order, 
            c.is_active, 
            c.created_at, 
            c.updated_at,
            COUNT(p.id) AS total_products
         FROM categories c
         LEFT JOIN products p ON p.category_id = c.id
         WHERE c.id = ? 
         GROUP BY c.id
         LIMIT 1`,
        [id]
    );
    return rows[0] || null;
};

const countProductsByCategoryId = async (categoryId) => {
    const [rows] = await pool.query(
        'SELECT COUNT(*) AS total FROM products WHERE category_id = ?',
        [categoryId]
    );
    return rows[0].total;
};

const insertCategory = async ({ name, sort_order = 0, is_active = true }) => {
    const [result] = await pool.query(
        `INSERT INTO categories (name, sort_order, is_active) 
         VALUES (?, ?, ?)`,
        [name, sort_order, is_active]
    );
    return await findCategoryById(result.insertId);
};

const updateCategoryById = async (id, updateData = {}) => {
    const allowedFields = ['name', 'sort_order', 'is_active'];
    const fields = [];
    const values = [];

    for (const key of allowedFields) {
        if (updateData[key] !== undefined) {
            fields.push(`${key} = ?`);
            values.push(updateData[key]);
        }
    }

    if (fields.length === 0) {
        return await findCategoryById(id);
    }

    values.push(id);
    const sql = `UPDATE categories SET ${fields.join(', ')} WHERE id = ?`;
    await pool.query(sql, values);

    return await findCategoryById(id);
};

const deleteCategoryById = async (id) => {
    const [result] = await pool.query('DELETE FROM categories WHERE id = ?', [id]);
    return result.affectedRows > 0;
};

// ==========================================
// PRODUCTS
// ==========================================

const findProducts = async ({ categoryId, productType, isActive, search, limit, offset }) => {
    let sql = `
        SELECT 
            p.id,
            p.category_id,
            c.name AS category_name,
            p.name,
            p.product_type,
            p.description,
            p.image,
            p.is_active,
            p.created_at,
            p.updated_at,
            COALESCE(
                (
                    SELECT JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'id', pv.id,
                            'product_id', pv.product_id,
                            'name', pv.name,
                            'size', pv.size,
                            'temperature', pv.temperature,
                            'price', pv.price,
                            'is_active', pv.is_active
                        )
                    )
                    FROM product_variants pv
                    WHERE pv.product_id = p.id
                ),
                JSON_ARRAY()
            ) AS variants
        FROM products p
        JOIN categories c ON c.id = p.category_id
        WHERE 1=1
    `;
    const params = [];

    if (categoryId) {
        sql += ` AND p.category_id = ?`;
        params.push(categoryId);
    }
    if (productType) {
        sql += ` AND p.product_type = ?`;
        params.push(productType);
    }
    if (isActive !== undefined && isActive !== null) {
        sql += ` AND p.is_active = ?`;
        params.push(isActive);
    }
    if (search) {
        sql += ` AND (p.name LIKE ? OR p.description LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`);
    }

    sql += ` ORDER BY c.sort_order ASC, p.id ASC LIMIT ? OFFSET ?`;
    params.push(Number(limit), Number(offset));

    const [rows] = await pool.query(sql, params);
    rows.forEach((p) => {
        if (typeof p.variants === 'string') {
            try {
                p.variants = JSON.parse(p.variants);
            } catch (_) {
                p.variants = [];
            }
        }
        if (Array.isArray(p.variants)) {
            p.variants.sort((a, b) => a.id - b.id);
        }
    });
    return rows;
};

const countProducts = async ({ categoryId, productType, isActive, search }) => {
    let sql = `
        SELECT COUNT(*) AS total
        FROM products p
        JOIN categories c ON c.id = p.category_id
        WHERE 1=1
    `;
    const params = [];

    if (categoryId) {
        sql += ` AND p.category_id = ?`;
        params.push(categoryId);
    }
    if (productType) {
        sql += ` AND p.product_type = ?`;
        params.push(productType);
    }
    if (isActive !== undefined && isActive !== null) {
        sql += ` AND p.is_active = ?`;
        params.push(isActive);
    }
    if (search) {
        sql += ` AND (p.name LIKE ? OR p.description LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`);
    }

    const [rows] = await pool.query(sql, params);
    return rows[0].total;
};

const findProductById = async (id) => {
    const sql = `
        SELECT 
            p.id,
            p.category_id,
            c.name AS category_name,
            p.name,
            p.product_type,
            p.description,
            p.image,
            p.is_active,
            p.created_at,
            p.updated_at,
            COALESCE(
                (
                    SELECT JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'id', pv.id,
                            'product_id', pv.product_id,
                            'name', pv.name,
                            'size', pv.size,
                            'temperature', pv.temperature,
                            'price', pv.price,
                            'is_active', pv.is_active
                        )
                    )
                    FROM product_variants pv
                    WHERE pv.product_id = p.id
                ),
                JSON_ARRAY()
            ) AS variants
        FROM products p
        JOIN categories c ON c.id = p.category_id
        WHERE p.id = ?
        LIMIT 1
    `;
    const [rows] = await pool.query(sql, [id]);
    if (rows.length === 0) return null;

    const product = rows[0];
    if (typeof product.variants === 'string') {
        try {
            product.variants = JSON.parse(product.variants);
        } catch (_) {
            product.variants = [];
        }
    }
    if (Array.isArray(product.variants)) {
        product.variants.sort((a, b) => a.id - b.id);
    }
    return product;
};

const findProductByNameAndCategory = async (name, categoryId) => {
    const [rows] = await pool.query(
        `SELECT id, name, category_id 
         FROM products 
         WHERE name = ? AND category_id = ? 
         LIMIT 1`,
        [name, categoryId]
    );
    return rows[0] || null;
};

const insertProduct = async ({
    category_id,
    name,
    product_type = 'DRINK',
    description = null,
    image = null,
    is_active = true
}, connection = null) => {
    const db = connection || pool;
    const [result] = await db.query(
        `INSERT INTO products (category_id, name, product_type, description, image, is_active)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [category_id, name, product_type, description, image, is_active]
    );
    return result.insertId;
};

const insertProductVariants = async (variantRows, connection = null) => {
    if (!variantRows || variantRows.length === 0) return 0;
    const db = connection || pool;
    const [result] = await db.query(
        `INSERT INTO product_variants (product_id, name, size, temperature, price, is_active)
         VALUES ?`,
        [variantRows]
    );
    return result.affectedRows;
};

const findProductByNameAndCategoryExcludeId = async (name, categoryId, excludeId) => {
    const [rows] = await pool.query(
        `SELECT id, name, category_id 
         FROM products 
         WHERE name = ? AND category_id = ? AND id != ? 
         LIMIT 1`,
        [name, categoryId, excludeId]
    );
    return rows[0] || null;
};

const updateProductById = async (id, data = {}, connection = null) => {
    const allowedFields = ['category_id', 'name', 'product_type', 'description', 'image', 'is_active'];
    const fields = [];
    const params = [];

    for (const key of allowedFields) {
        if (data[key] !== undefined) {
            fields.push(`${key} = ?`);
            params.push(data[key]);
        }
    }

    if (fields.length === 0) return 0;

    params.push(id);
    const db = connection || pool;
    const sql = `UPDATE products SET ${fields.join(', ')} WHERE id = ?`;
    const [result] = await db.query(sql, params);
    return result.affectedRows;
};

const findVariantsByProductId = async (productId, connection = null) => {
    const db = connection || pool;
    const [rows] = await db.query(
        `SELECT id, product_id, name, size, temperature, price, is_active 
         FROM product_variants 
         WHERE product_id = ?`,
        [productId]
    );
    return rows;
};

const updateVariantById = async (id, data = {}, connection = null) => {
    const allowedFields = ['name', 'size', 'temperature', 'price', 'is_active'];
    const fields = [];
    const params = [];

    for (const key of allowedFields) {
        if (data[key] !== undefined) {
            fields.push(`${key} = ?`);
            params.push(data[key]);
        }
    }

    if (fields.length === 0) return 0;

    params.push(id);
    const db = connection || pool;
    const sql = `UPDATE product_variants SET ${fields.join(', ')} WHERE id = ?`;
    const [result] = await db.query(sql, params);
    return result.affectedRows;
};

const deleteVariantById = async (id, connection = null) => {
    const db = connection || pool;
    const [result] = await db.query(`DELETE FROM product_variants WHERE id = ?`, [id]);
    return result.affectedRows;
};

const isVariantUsedInOrders = async (variantId, connection = null) => {
    const db = connection || pool;
    const [rows] = await db.query(
        `SELECT 
            (SELECT COUNT(*) FROM order_items WHERE variant_id = ?) +
            (SELECT COUNT(*) FROM order_item_addons WHERE addon_variant_id = ?) AS total`,
        [variantId, variantId]
    );
    return Number(rows[0]?.total || 0) > 0;
};

const deleteProductById = async (id, connection = null) => {
    const db = connection || pool;
    const [result] = await db.query('DELETE FROM products WHERE id = ?', [id]);
    return result.affectedRows > 0;
};

const isProductUsedInOrders = async (productId, connection = null) => {
    const db = connection || pool;
    const [rows] = await db.query(
        `SELECT 
            (SELECT COUNT(*) 
             FROM order_items oi 
             JOIN product_variants pv ON oi.variant_id = pv.id 
             WHERE pv.product_id = ?) +
            (SELECT COUNT(*) 
             FROM order_item_addons oia 
             JOIN product_variants pv ON oia.addon_variant_id = pv.id 
             WHERE pv.product_id = ?) AS total`,
        [productId, productId]
    );
    return Number(rows[0]?.total || 0) > 0;
};

module.exports = {
    findAllCategories,
    findCategoryByName,
    findCategoryByNameExcludeId,
    findCategoryById,
    countProductsByCategoryId,
    insertCategory,
    updateCategoryById,
    deleteCategoryById,
    findProducts,
    countProducts,
    findProductById,
    findProductByNameAndCategory,
    findProductByNameAndCategoryExcludeId,
    insertProduct,
    insertProductVariants,
    updateProductById,
    findVariantsByProductId,
    updateVariantById,
    deleteVariantById,
    isVariantUsedInOrders,
    deleteProductById,
    isProductUsedInOrders
};

