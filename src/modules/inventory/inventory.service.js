const { connection: pool } = require('../../config/db.config');
const inventoryModel = require('./inventory.model');
const auditLogsModel = require('../audit-logs/audit-logs.model');
const ApiError = require('../../utils/api-error');

const getAllIngredients = async (queryParams = {}) => {
    const { search, unit, is_active, low_stock } = queryParams;
    const isPaginated = queryParams.page !== undefined || queryParams.limit !== undefined;

    const filters = {
        search,
        unit,
        isActive: is_active,
        lowStock: low_stock
    };

    if (isPaginated) {
        const page = Math.max(1, parseInt(queryParams.page, 10) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(queryParams.limit, 10) || 50));
        const offset = (page - 1) * limit;

        const [rows, total] = await Promise.all([
            inventoryModel.findAllIngredients({ ...filters, limit, offset }),
            inventoryModel.countIngredients(filters)
        ]);

        const ingredients = rows.map((row) => ({
            ...row,
            is_active: Boolean(row.is_active),
            is_low_stock: Boolean(row.is_low_stock)
        }));

        return {
            ingredients,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        };
    }

    const [rows, total] = await Promise.all([
        inventoryModel.findAllIngredients(filters),
        inventoryModel.countIngredients(filters)
    ]);

    const ingredients = rows.map((row) => ({
        ...row,
        is_active: Boolean(row.is_active),
        is_low_stock: Boolean(row.is_low_stock)
    }));

    return {
        ingredients,
        pagination: {
            page: 1,
            limit: total,
            total,
            totalPages: 1
        }
    };
};

const getLowStockIngredients = async (queryParams = {}) => {
    const { search, unit } = queryParams;
    const isPaginated = queryParams.page !== undefined || queryParams.limit !== undefined;

    const filters = { search, unit };

    if (isPaginated) {
        const page = Math.max(1, parseInt(queryParams.page, 10) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(queryParams.limit, 10) || 50));
        const offset = (page - 1) * limit;

        const [rows, total] = await Promise.all([
            inventoryModel.findLowStockIngredients({ ...filters, limit, offset }),
            inventoryModel.countLowStockIngredients(filters)
        ]);

        const ingredients = rows.map((row) => ({
            ...row,
            is_active: Boolean(row.is_active),
            is_low_stock: true
        }));

        return {
            ingredients,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        };
    }

    const [rows, total] = await Promise.all([
        inventoryModel.findLowStockIngredients(filters),
        inventoryModel.countLowStockIngredients(filters)
    ]);

    const ingredients = rows.map((row) => ({
        ...row,
        is_active: Boolean(row.is_active),
        is_low_stock: true
    }));

    return {
        ingredients,
        pagination: {
            page: 1,
            limit: total,
            total,
            totalPages: 1
        }
    };
};

const getIngredientById = async (id) => {
    const ingredient = await inventoryModel.findIngredientById(id);
    if (!ingredient) {
        throw ApiError.notFound('Ingredient not found');
    }

    return {
        ...ingredient,
        is_active: Boolean(ingredient.is_active),
        is_low_stock: Boolean(ingredient.is_low_stock)
    };
};

const createIngredient = async ({ name, unit, current_stock = 0, minimum_stock = 0, is_active = true, creatorId, ipAddress }) => {
    // 1. Check if ingredient name already exists
    const existing = await inventoryModel.findIngredientByName(name);
    if (existing) {
        throw ApiError.conflict('Ingredient name already exists');
    }

    // 2. Insert new ingredient
    const insertId = await inventoryModel.insertIngredient({
        name,
        unit,
        current_stock,
        minimum_stock,
        is_active
    });

    // 3. Record audit log
    try {
        await auditLogsModel.insertAuditLog({
            userId: creatorId || null,
            action: 'CREATE_INGREDIENT',
            tableName: 'ingredients',
            recordId: insertId,
            details: { name, unit, current_stock, minimum_stock, is_active },
            ipAddress
        });
    } catch (err) {
        console.error('Failed to write audit log for createIngredient:', err.message);
    }

    // 4. Retrieve and format newly created ingredient
    const created = await inventoryModel.findIngredientById(insertId);
    return {
        ...created,
        is_active: Boolean(created.is_active),
        is_low_stock: Boolean(created.is_low_stock)
    };
};

const updateIngredient = async ({ id, updateData, updaterId, ipAddress }) => {
    // 1. Check if ingredient exists
    const existing = await inventoryModel.findIngredientById(id);
    if (!existing) {
        throw ApiError.notFound('Ingredient not found');
    }

    // 2. If name is being changed, check for conflict with other ingredients
    if (updateData.name && updateData.name !== existing.name) {
        const conflict = await inventoryModel.findIngredientByNameExcludeId(updateData.name, id);
        if (conflict) {
            throw ApiError.conflict('Ingredient name already exists');
        }
    }

    // 3. Update ingredient in database
    await inventoryModel.updateIngredientById(id, updateData);

    // 4. Record audit log
    try {
        await auditLogsModel.insertAuditLog({
            userId: updaterId || null,
            action: 'UPDATE_INGREDIENT',
            tableName: 'ingredients',
            recordId: id,
            details: updateData,
            ipAddress
        });
    } catch (err) {
        console.error('Failed to write audit log for updateIngredient:', err.message);
    }

    // 5. Retrieve updated record and format
    const updated = await inventoryModel.findIngredientById(id);
    return {
        ...updated,
        is_active: Boolean(updated.is_active),
        is_low_stock: Boolean(updated.is_low_stock)
    };
};

const deleteIngredient = async ({ id, deleterId, ipAddress }) => {
    // 1. Verify ingredient exists
    const ingredient = await inventoryModel.findIngredientById(id);
    if (!ingredient) {
        throw ApiError.notFound('Ingredient not found');
    }

    // 2. Check if ingredient is used in any recipes
    const recipeCount = await inventoryModel.countRecipesByIngredientId(id);
    if (recipeCount > 0) {
        throw ApiError.badRequest(
            `Cannot delete ingredient '${ingredient.name}' because it is used in ${recipeCount} recipe(s). Please remove it from recipes first.`
        );
    }

    // 3. Check if ingredient has stock movement history
    const movementCount = await inventoryModel.countStockMovementsByIngredientId(id);
    if (movementCount > 0) {
        throw ApiError.badRequest(
            `Cannot delete ingredient '${ingredient.name}' because it has existing stock movement history. You can deactivate it (set is_active = false) instead.`
        );
    }

    // 4. Delete ingredient
    await inventoryModel.deleteIngredientById(id);

    // 5. Record audit log
    try {
        await auditLogsModel.insertAuditLog({
            userId: deleterId || null,
            action: 'DELETE_INGREDIENT',
            tableName: 'ingredients',
            recordId: id,
            details: { name: ingredient.name, unit: ingredient.unit },
            ipAddress
        });
    } catch (err) {
        console.error('Failed to write audit log for deleteIngredient:', err.message);
    }

    return true;
};

const getStockMovements = async (queryParams = {}) => {
    const page = Math.max(1, parseInt(queryParams.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(queryParams.limit, 10) || 50));
    const offset = (page - 1) * limit;

    let adjustedEndDate = queryParams.end_date;
    if (adjustedEndDate) {
        const d = new Date(adjustedEndDate);
        if (!isNaN(d.getTime())) {
            // Set to end of the day 23:59:59.999
            d.setHours(23, 59, 59, 999);
            adjustedEndDate = d;
        }
    }

    const filters = {
        ingredientId: queryParams.ingredient_id,
        movementType: queryParams.movement_type,
        orderId: queryParams.order_id,
        createdBy: queryParams.created_by,
        startDate: queryParams.start_date,
        endDate: adjustedEndDate
    };

    const [movements, total] = await Promise.all([
        inventoryModel.findStockMovements({ ...filters, limit, offset }),
        inventoryModel.countStockMovements(filters)
    ]);

    return {
        movements,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        }
    };
};

const getStockMovementById = async (id) => {
    const movement = await inventoryModel.findStockMovementById(id);
    if (!movement) {
        throw ApiError.notFound('Stock movement not found');
    }
    return movement;
};

const createStockMovement = async ({
    ingredient_id,
    movement_type,
    quantity,
    unit_cost = null,
    reason = null,
    idempotency_key = null,
    creatorId,
    ipAddress
}) => {
    // 1. Idempotency check prior to transaction
    if (idempotency_key) {
        const existing = await inventoryModel.findStockMovementByIdempotencyKey(idempotency_key);
        if (existing) {
            return await inventoryModel.findStockMovementById(existing.id);
        }
    }

    // 2. Determine quantity_change based on movement_type
    let quantity_change = Number(quantity);
    if (movement_type === 'PURCHASE') {
        quantity_change = Math.abs(quantity_change);
    } else if (movement_type === 'WASTE') {
        quantity_change = -Math.abs(quantity_change);
    }

    // 3. Execute in database transaction with pessimistic row lock
    const connection = await pool.getConnection();
    let movementId;
    let ingredientName = '';
    try {
        await connection.beginTransaction();

        // 3a. Lock ingredient row to prevent race conditions
        const ingredient = await inventoryModel.findIngredientByIdForUpdate(ingredient_id, connection);
        if (!ingredient) {
            throw ApiError.notFound('Ingredient not found');
        }

        if (!ingredient.is_active) {
            throw ApiError.badRequest(`Cannot record stock movement for inactive ingredient '${ingredient.name}'`);
        }
        ingredientName = ingredient.name;

        // 3b. Verify resulting stock will not be negative under lock
        const currentStock = Number(ingredient.current_stock);
        const newStock = currentStock + quantity_change;
        if (newStock < 0) {
            throw ApiError.badRequest(
                `Insufficient stock for '${ingredient.name}'. Current stock is ${currentStock} ${ingredient.unit}, attempting to deduct ${Math.abs(quantity_change)} ${ingredient.unit}.`
            );
        }

        // 3c. Insert stock movement record
        const formattedUnitCost = (unit_cost !== undefined && unit_cost !== null) ? Number(unit_cost) : null;
        movementId = await inventoryModel.insertStockMovement({
            ingredientId: ingredient_id,
            movementType: movement_type,
            quantityChange: quantity_change,
            unitCost: formattedUnitCost,
            reason: reason || null,
            idempotencyKey: idempotency_key || null,
            createdBy: creatorId
        }, connection);

        // 3d. Update ingredient current_stock
        await inventoryModel.updateIngredientStock(ingredient_id, quantity_change, connection);

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        // If concurrent request inserted the same idempotency key
        if (error.errno === 1062 && idempotency_key) {
            const existing = await inventoryModel.findStockMovementByIdempotencyKey(idempotency_key);
            if (existing) {
                return await inventoryModel.findStockMovementById(existing.id);
            }
        }
        throw error;
    } finally {
        connection.release();
    }

    // 4. Record audit log
    try {
        await auditLogsModel.insertAuditLog({
            userId: creatorId || null,
            action: `STOCK_${movement_type}`,
            tableName: 'stock_movements',
            recordId: movementId,
            details: {
                ingredient_id,
                ingredient_name: ingredientName,
                movement_type,
                quantity_change,
                unit_cost: (unit_cost !== undefined && unit_cost !== null) ? Number(unit_cost) : null,
                reason
            },
            ipAddress
        });
    } catch (err) {
        console.error('Failed to write audit log for createStockMovement:', err.message);
    }

    // 5. Return complete recorded movement details
    return await inventoryModel.findStockMovementById(movementId);
};

const getRecipeByVariantId = async (variantId) => {
    // 1. Verify variant exists
    const variant = await inventoryModel.findVariantDetailsById(variantId);
    if (!variant) {
        throw ApiError.notFound('Product variant not found');
    }

    // 2. Retrieve recipe ingredients
    const rows = await inventoryModel.findRecipesByVariantId(variantId);

    const recipe = rows.map((r) => ({
        id: r.id,
        ingredient_id: r.ingredient_id,
        ingredient_name: r.ingredient_name,
        unit: r.ingredient_unit,
        quantity: r.quantity,
        current_stock: r.current_stock,
        is_active: Boolean(r.ingredient_is_active),
        created_at: r.created_at,
        updated_at: r.updated_at
    }));

    return {
        variant: {
            id: variant.variant_id,
            product_id: variant.product_id,
            product_name: variant.product_name,
            variant_name: variant.variant_name,
            size: variant.size,
            temperature: variant.temperature,
            price: variant.price,
            is_active: Boolean(variant.variant_is_active)
        },
        recipe
    };
};

const updateRecipeByVariantId = async ({ variantId, items, updaterId, ipAddress }) => {
    // 1. Verify product variant exists
    const variant = await inventoryModel.findVariantDetailsById(variantId);
    if (!variant) {
        throw ApiError.notFound('Product variant not found');
    }

    // 2. If items are provided, validate ingredients
    if (items && items.length > 0) {
        // 2a. Check for duplicates in items array
        const ingredientIds = items.map((i) => i.ingredient_id);
        const uniqueIds = new Set(ingredientIds);
        if (uniqueIds.size !== ingredientIds.length) {
            throw ApiError.badRequest('Duplicate ingredient in recipe items');
        }

        // 2b. Check that all ingredients exist in the database
        const existingIngredients = await inventoryModel.findIngredientsByIds(ingredientIds);
        if (existingIngredients.length !== uniqueIds.size) {
            const foundIds = new Set(existingIngredients.map((i) => i.id));
            const missingIds = ingredientIds.filter((id) => !foundIds.has(id));
            throw ApiError.badRequest(`Ingredient ID(s) not found: ${missingIds.join(', ')}`);
        }

        // 2c. Check that all ingredients are active
        const inactive = existingIngredients.filter((i) => !i.is_active);
        if (inactive.length > 0) {
            throw ApiError.badRequest(
                `Cannot add inactive ingredient(s) to recipe: ${inactive.map((i) => `'${i.name}'`).join(', ')}`
            );
        }
    }

    // 3. Replace recipe items inside database transaction
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 3a. Remove previous recipe items for this variant
        await inventoryModel.deleteRecipesByVariantId(variantId, connection);

        // 3b. Insert new recipe items if provided
        if (items && items.length > 0) {
            const recipeRows = items.map((item) => [
                variantId,
                item.ingredient_id,
                item.quantity
            ]);
            await inventoryModel.insertRecipes(recipeRows, connection);
        }

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }

    // 4. Record audit log
    try {
        await auditLogsModel.insertAuditLog({
            userId: updaterId || null,
            action: 'UPDATE_RECIPE',
            tableName: 'recipes',
            recordId: variantId,
            details: {
                variant_id: variantId,
                variant_name: variant.variant_name,
                items_count: items ? items.length : 0,
                items
            },
            ipAddress
        });
    } catch (err) {
        console.error('Failed to write audit log for updateRecipeByVariantId:', err.message);
    }

    // 5. Return updated recipe details
    return await getRecipeByVariantId(variantId);
};

const deleteRecipeByVariantId = async ({ variantId, deleterId, ipAddress }) => {
    // 1. Verify variant exists
    const variant = await inventoryModel.findVariantDetailsById(variantId);
    if (!variant) {
        throw ApiError.notFound('Product variant not found');
    }

    // 2. Delete all recipe ingredients for this variant
    await inventoryModel.deleteRecipesByVariantId(variantId);

    // 3. Record audit log
    try {
        await auditLogsModel.insertAuditLog({
            userId: deleterId || null,
            action: 'DELETE_RECIPE',
            tableName: 'recipes',
            recordId: variantId,
            details: {
                variant_id: variantId,
                variant_name: variant.variant_name
            },
            ipAddress
        });
    } catch (err) {
        console.error('Failed to write audit log for deleteRecipeByVariantId:', err.message);
    }

    return true;
};

const getRecipeByProductId = async (productId) => {
    const rows = await inventoryModel.findRecipesByProductId(productId);
    if (!rows || rows.length === 0) {
        throw ApiError.notFound('Product not found or has no variants');
    }

    const variantsMap = new Map();
    for (const row of rows) {
        if (!variantsMap.has(row.variant_id)) {
            variantsMap.set(row.variant_id, {
                id: row.variant_id,
                variant_name: row.variant_name,
                size: row.size,
                temperature: row.temperature,
                price: row.price,
                is_active: Boolean(row.variant_is_active),
                recipe: []
            });
        }
        if (row.recipe_id) {
            variantsMap.get(row.variant_id).recipe.push({
                id: row.recipe_id,
                ingredient_id: row.ingredient_id,
                ingredient_name: row.ingredient_name,
                unit: row.ingredient_unit,
                quantity: row.quantity,
                current_stock: row.current_stock,
                is_active: Boolean(row.ingredient_is_active)
            });
        }
    }

    return {
        product_id: Number(productId),
        variants: Array.from(variantsMap.values())
    };
};

const getAllRecipes = async (queryParams = {}) => {
    const page = Math.max(1, parseInt(queryParams.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(queryParams.limit, 10) || 50));
    const offset = (page - 1) * limit;

    const filters = {
        search: queryParams.search,
        variantId: queryParams.variant_id,
        ingredientId: queryParams.ingredient_id
    };

    const [recipes, total] = await Promise.all([
        inventoryModel.findAllRecipes({ ...filters, limit, offset }),
        inventoryModel.countAllRecipes(filters)
    ]);

    return {
        recipes,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        }
    };
};

module.exports = {
    getAllIngredients,
    getLowStockIngredients,
    getIngredientById,
    createIngredient,
    updateIngredient,
    deleteIngredient,
    getStockMovements,
    getStockMovementById,
    createStockMovement,
    getRecipeByVariantId,
    updateRecipeByVariantId,
    deleteRecipeByVariantId,
    getRecipeByProductId,
    getAllRecipes
};
