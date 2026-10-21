const fs = require('fs');
const path = require('path');
const { connection: pool } = require('../../config/db.config');
const productModel = require('./product.model');
const auditLogsModel = require('../audit-logs/audit-logs.model');
const ApiError = require('../../utils/api-error');


const getAllCategories = async (queryParams = {}) => {
    return await productModel.findAllCategories({
        isActive: queryParams.is_active,
        search: queryParams.search
    });
};

const getCategoryById = async (id) => {
    const category = await productModel.findCategoryById(id);
    if (!category) {
        throw ApiError.notFound('Category not found');
    }
    return category;
};

const createCategory = async ({ name, sort_order = 0, is_active = true, creatorId, ipAddress }) => {
    // 1. Check if category name is already registered
    const existing = await productModel.findCategoryByName(name);
    if (existing) {
        throw ApiError.conflict('Category name already exists');
    }

    // 2. Insert new category
    const category = await productModel.insertCategory({
        name,
        sort_order,
        is_active
    });

    // 3. Record audit log
    try {
        await auditLogsModel.insertAuditLog({
            userId: creatorId || null,
            action: 'CREATE_CATEGORY',
            tableName: 'categories',
            recordId: category.id,
            details: { name, sort_order, is_active },
            ipAddress
        });
    } catch (err) {
        console.error('Failed to write audit log for createCategory:', err.message);
    }

    return category;
};

const updateCategory = async ({ id, updateData, updaterId, ipAddress }) => {
    // 1. Check if category exists
    const category = await productModel.findCategoryById(id);
    if (!category) {
        throw ApiError.notFound('Category not found');
    }

    // 2. If name is being changed, check for conflict with other categories
    if (updateData.name && updateData.name !== category.name) {
        const existing = await productModel.findCategoryByNameExcludeId(updateData.name, id);
        if (existing) {
            throw ApiError.conflict('Category name already exists');
        }
    }

    // 3. Update category
    const updatedCategory = await productModel.updateCategoryById(id, updateData);

    // 4. Record audit log
    try {
        await auditLogsModel.insertAuditLog({
            userId: updaterId || null,
            action: 'UPDATE_CATEGORY',
            tableName: 'categories',
            recordId: id,
            details: updateData,
            ipAddress
        });
    } catch (err) {
        console.error('Failed to write audit log for updateCategory:', err.message);
    }

    return updatedCategory;
};

const deleteCategory = async ({ id, deleterId, ipAddress }) => {
    // 1. Verify category exists
    const category = await productModel.findCategoryById(id);
    if (!category) {
        throw ApiError.notFound('Category not found');
    }

    // 2. Check if category is currently used by any products
    const productCount = await productModel.countProductsByCategoryId(id);
    if (productCount > 0) {
        throw ApiError.badRequest(
            `Cannot delete category because it has ${productCount} assigned product(s). Please reassign or delete the products first, or deactivate the category.`
        );
    }

    // 3. Delete category from database
    await productModel.deleteCategoryById(id);

    // 4. Record audit log
    try {
        await auditLogsModel.insertAuditLog({
            userId: deleterId || null,
            action: 'DELETE_CATEGORY',
            tableName: 'categories',
            recordId: id,
            details: { name: category.name, sort_order: category.sort_order },
            ipAddress
        });
    } catch (err) {
        console.error('Failed to write audit log for deleteCategory:', err.message);
    }

    return true;
};

// ==========================================
// PRODUCTS
// ==========================================

const getAllProducts = async (queryParams = {}) => {
    const page = parseInt(queryParams.page, 10) || 1;
    const limit = parseInt(queryParams.limit, 10) || 50;
    const offset = (page - 1) * limit;

    const filters = {
        categoryId: queryParams.category_id,
        productType: queryParams.product_type,
        isActive: queryParams.is_active,
        search: queryParams.search,
        limit,
        offset
    };

    const [products, total] = await Promise.all([
        productModel.findProducts(filters),
        productModel.countProducts(filters)
    ]);

    return {
        products,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        }
    };
};

const getProductById = async (id) => {
    const product = await productModel.findProductById(id);
    if (!product) {
        throw ApiError.notFound('Product not found');
    }
    return product;
};

const createProduct = async ({
    category_id,
    name,
    product_type = 'DRINK',
    description = null,
    image = null,
    is_active = true,
    variants = [],
    creatorId,
    ipAddress
}) => {
    // 1. Check if category exists
    const category = await productModel.findCategoryById(category_id);
    if (!category) {
        throw ApiError.badRequest(`Category with ID ${category_id} does not exist`);
    }

    // 2. Check for duplicate product name in the same category
    const existingProduct = await productModel.findProductByNameAndCategory(name, category_id);
    if (existingProduct) {
        throw ApiError.conflict(`Product '${name}' already exists in this category`);
    }

    // 3. Ensure variant names are unique within this product
    const variantNames = new Set();
    for (const v of variants) {
        const lowerName = v.name.toLowerCase();
        if (variantNames.has(lowerName)) {
            throw ApiError.badRequest(`Duplicate variant name '${v.name}' in the same product`);
        }
        variantNames.add(lowerName);
    }

    // 4. Insert product with variants using an explicit transaction
    const connection = await pool.getConnection();
    let productId;
    try {
        await connection.beginTransaction();

        // 4a. Insert product record
        productId = await productModel.insertProduct({
            category_id,
            name,
            product_type,
            description,
            image,
            is_active
        }, connection);

        // 4b. Prepare & insert variants
        if (variants && variants.length > 0) {
            const variantRows = variants.map((v) => [
                productId,
                v.name,
                v.size || null,
                v.temperature || 'NONE',
                v.price,
                v.is_active !== undefined ? v.is_active : true
            ]);

            await productModel.insertProductVariants(variantRows, connection);
        }

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }

    // 5. Audit log
    try {
        await auditLogsModel.insertAuditLog({
            userId: creatorId || null,
            action: 'CREATE_PRODUCT',
            tableName: 'products',
            recordId: productId,
            details: { name, category_id, product_type, variant_count: variants.length },
            ipAddress
        });
    } catch (err) {
        console.error('Failed to write audit log for createProduct:', err.message);
    }

    // 6. Return created product
    return await productModel.findProductById(productId);
};

const updateProduct = async ({ id, updateData, updaterId, ipAddress }) => {
    // 1. Verify product exists
    const currentProduct = await productModel.findProductById(id);
    if (!currentProduct) {
        throw ApiError.notFound('Product not found');
    }

    // 2. Verify category if changing category
    const targetCategoryId = updateData.category_id || currentProduct.category_id;
    if (updateData.category_id && updateData.category_id !== currentProduct.category_id) {
        const category = await productModel.findCategoryById(updateData.category_id);
        if (!category) {
            throw ApiError.badRequest(`Category with ID ${updateData.category_id} does not exist`);
        }
    }

    // 3. Check for name conflict in the target category
    const targetName = updateData.name || currentProduct.name;
    if ((updateData.name && updateData.name !== currentProduct.name) || updateData.category_id) {
        const conflict = await productModel.findProductByNameAndCategoryExcludeId(targetName, targetCategoryId, id);
        if (conflict) {
            throw ApiError.conflict(`Product '${targetName}' already exists in this category`);
        }
    }

    // 4. If variants are supplied, validate unique names
    if (updateData.variants) {
        const variantNames = new Set();
        for (const v of updateData.variants) {
            const lowerName = v.name.toLowerCase();
            if (variantNames.has(lowerName)) {
                throw ApiError.badRequest(`Duplicate variant name '${v.name}' in the same product`);
            }
            variantNames.add(lowerName);
        }
    }

    // 5. Run update in transaction
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 5a. Update main product fields
        const productFields = {};
        for (const key of ['category_id', 'name', 'product_type', 'description', 'image', 'is_active']) {
            if (updateData[key] !== undefined) {
                productFields[key] = updateData[key];
            }
        }
        if (Object.keys(productFields).length > 0) {
            await productModel.updateProductById(id, productFields, connection);
        }

        if (
            updateData.image !== undefined &&
            updateData.image !== currentProduct.image &&
            currentProduct.image &&
            typeof currentProduct.image === 'string' &&
            currentProduct.image.startsWith('/uploads/products/')
        ) {
            const oldFilename = path.basename(currentProduct.image);
            const oldFilePath = path.join(__dirname, '../../../uploads/products', oldFilename);
            if (fs.existsSync(oldFilePath)) {
                try {
                    fs.unlinkSync(oldFilePath);
                } catch (err) {
                    console.error('Failed to delete old product image in updateProduct:', err.message);
                }
            }
        }

        // 5b. Update variants if provided
        if (updateData.variants) {
            const existingVariants = await productModel.findVariantsByProductId(id, connection);
            const existingVariantMap = new Map(existingVariants.map((v) => [v.id, v]));

            const newVariantsToInsert = [];
            const updatedVariantIds = new Set();

            for (const v of updateData.variants) {
                if (v.id) {
                    if (!existingVariantMap.has(v.id)) {
                        throw ApiError.badRequest(`Variant with ID ${v.id} does not belong to this product`);
                    }
                    // Update existing variant
                    await productModel.updateVariantById(
                        v.id,
                        {
                            name: v.name,
                            size: v.size || null,
                            temperature: v.temperature || 'NONE',
                            price: v.price,
                            is_active: v.is_active !== undefined ? v.is_active : true
                        },
                        connection
                    );
                    updatedVariantIds.add(v.id);
                } else {
                    // New variant to insert
                    newVariantsToInsert.push([
                        id,
                        v.name,
                        v.size || null,
                        v.temperature || 'NONE',
                        v.price,
                        v.is_active !== undefined ? v.is_active : true
                    ]);
                }
            }


            // Insert newly added variants
            if (newVariantsToInsert.length > 0) {
                await productModel.insertProductVariants(newVariantsToInsert, connection);
            }

            // Check variants that were in DB but not present in updateData.variants
            for (const existingV of existingVariants) {
                if (!updatedVariantIds.has(existingV.id)) {
                    const isUsed = await productModel.isVariantUsedInOrders(existingV.id, connection);
                    if (isUsed) {
                        // Deactivate to protect order history foreign keys
                        await productModel.updateVariantById(existingV.id, { is_active: false }, connection);
                    } else {
                        // Safe to delete if never used in any order
                        await productModel.deleteVariantById(existingV.id, connection);
                    }
                }
            }
        }

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }

    // 6. Audit log
    try {
        await auditLogsModel.insertAuditLog({
            userId: updaterId || null,
            action: 'UPDATE_PRODUCT',
            tableName: 'products',
            recordId: id,
            details: {
                changedFields: Object.keys(updateData),
                variantsUpdated: Boolean(updateData.variants)
            },
            ipAddress
        });
    } catch (err) {
        console.error('Failed to write audit log for updateProduct:', err.message);
    }

    // 7. Return refreshed product
    return await productModel.findProductById(id);
};

const deleteProduct = async ({ id, deleterId, ipAddress }) => {
    // 1. Verify product exists
    const product = await productModel.findProductById(id);
    if (!product) {
        throw ApiError.notFound('Product not found');
    }

    // 2. Check if product or its variants have been used in orders
    const isUsed = await productModel.isProductUsedInOrders(id);
    if (isUsed) {
        throw ApiError.badRequest(
            'Cannot delete product because it has historical sales/order records. Please deactivate the product (is_active = false) instead.'
        );
    }

    // 3. Delete product from database (cascade deletes product_variants and recipes)
    await productModel.deleteProductById(id);

    // 4. Remove image file from disk if stored locally
    if (product.image && typeof product.image === 'string' && product.image.startsWith('/uploads/')) {
        const filePath = path.join(__dirname, '../../../', product.image.replace(/^\/+/, ''));
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
            } catch (err) {
                console.error('Failed to delete product image file from disk:', err.message);
            }
        }
    }

    // 5. Record audit log
    try {
        await auditLogsModel.insertAuditLog({
            userId: deleterId || null,
            action: 'DELETE_PRODUCT',
            tableName: 'products',
            recordId: id,
            details: {
                name: product.name,
                category_id: product.category_id,
                product_type: product.product_type
            },
            ipAddress
        });
    } catch (err) {
        console.error('Failed to write audit log for deleteProduct:', err.message);
    }

    return true;
};

const updateProductImage = async ({ id, imageFilename, updaterId, ipAddress }) => {
    // 1. Verify product exists
    const product = await productModel.findProductById(id);
    if (!product) {
        throw ApiError.notFound('Product not found');
    }

    const relativeImagePath = `/uploads/products/${imageFilename}`;

    // 2. Remove old product image if it was saved locally in /uploads/products/
    if (product.image && typeof product.image === 'string' && product.image.startsWith('/uploads/products/')) {
        const oldFilename = path.basename(product.image);
        const oldFilePath = path.join(__dirname, '../../../uploads/products', oldFilename);
        if (fs.existsSync(oldFilePath) && oldFilename !== imageFilename) {
            try {
                fs.unlinkSync(oldFilePath);
            } catch (err) {
                console.error('Failed to delete old product image:', err.message);
            }
        }
    }

    // 3. Update product in DB
    await productModel.updateProductById(id, { image: relativeImagePath });

    // 4. Record audit log
    try {
        await auditLogsModel.insertAuditLog({
            userId: updaterId || null,
            action: 'UPLOAD_PRODUCT_IMAGE',
            tableName: 'products',
            recordId: id,
            details: { previousImage: product.image, newImage: relativeImagePath },
            ipAddress
        });
    } catch (err) {
        console.error('Failed to write audit log for updateProductImage:', err.message);
    }

    // 5. Return updated product
    return await productModel.findProductById(id);
};

const deleteProductImage = async ({ id, deleterId, ipAddress }) => {
    // 1. Verify product exists
    const product = await productModel.findProductById(id);
    if (!product) {
        throw ApiError.notFound('Product not found');
    }

    // 2. Check if product actually has an image
    if (!product.image) {
        throw ApiError.badRequest('Product does not have an image to delete');
    }

    const previousImage = product.image;

    // 3. Remove file from disk if stored locally in /uploads/
    if (typeof previousImage === 'string' && previousImage.startsWith('/uploads/')) {
        const filePath = path.join(__dirname, '../../../', previousImage.replace(/^\/+/, ''));
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
            } catch (err) {
                console.error('Failed to delete product image from disk:', err.message);
            }
        }
    }

    // 4. Update database to set image = null
    await productModel.updateProductById(id, { image: null });

    // 5. Record audit log
    try {
        await auditLogsModel.insertAuditLog({
            userId: deleterId || null,
            action: 'DELETE_PRODUCT_IMAGE',
            tableName: 'products',
            recordId: id,
            details: { removedImage: previousImage },
            ipAddress
        });
    } catch (err) {
        console.error('Failed to write audit log for deleteProductImage:', err.message);
    }

    // 6. Return updated product
    return await productModel.findProductById(id);
};

module.exports = {
    getAllCategories,
    getCategoryById,
    createCategory,
    updateCategory,
    deleteCategory,
    getAllProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct,
    updateProductImage,
    deleteProductImage
};



