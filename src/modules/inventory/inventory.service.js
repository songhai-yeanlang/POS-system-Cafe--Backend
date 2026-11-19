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
            is_low_stock: Boolean(row.is_low_stock),
            total_recipes: Number(row.total_recipes || 0)
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
        is_low_stock: Boolean(row.is_low_stock),
        total_recipes: Number(row.total_recipes || 0)
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
            is_low_stock: true,
            total_recipes: Number(row.total_recipes || 0)
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
        is_low_stock: true,
        total_recipes: Number(row.total_recipes || 0)
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
        is_low_stock: Boolean(ingredient.is_low_stock),
        total_recipes: Number(ingredient.total_recipes || 0)
    };
};

const createIngredient = async ({ name, unit, current_stock = 0, minimum_stock = 0, is_active = true, creatorId, ipAddress }) => {
    const cleanName = name ? name.trim() : '';

    // 1. Check if ingredient name already exists (case-insensitive)
    const existing = await inventoryModel.findIngredientByName(cleanName);
    if (existing) {
        throw ApiError.conflict('Ingredient name already exists');
    }

    const cleanCurrentStock = Number(Number(current_stock || 0).toFixed(4));
    const cleanMinimumStock = Number(Number(minimum_stock || 0).toFixed(4));
    const cleanIsActive = is_active !== undefined ? Boolean(is_active) : true;

    // 2. Insert new ingredient in database transaction
    const connection = await pool.getConnection();
    let insertId;

    try {
        await connection.beginTransaction();

        insertId = await inventoryModel.insertIngredient({
            name: cleanName,
            unit,
            current_stock: cleanCurrentStock,
            minimum_stock: cleanMinimumStock,
            is_active: cleanIsActive
        }, connection);

        // If created with initial stock > 0, record initial stock movement ledger entry
        if (cleanCurrentStock > 0 && creatorId) {
            await inventoryModel.insertStockMovement({
                ingredientId: insertId,
                movementType: 'ADJUSTMENT',
                quantityChange: cleanCurrentStock,
                unitCost: null,
                reason: 'Initial stock on ingredient creation',
                idempotencyKey: null,
                createdBy: creatorId
            }, connection);
        }

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        if (error.errno === 1062 || error.code === 'ER_DUP_ENTRY') {
            throw ApiError.conflict('Ingredient name already exists');
        }
        throw error;
    } finally {
        connection.release();
    }

    // 3. Record audit log
    try {
        await auditLogsModel.insertAuditLog({
            userId: creatorId || null,
            action: 'CREATE_INGREDIENT',
            tableName: 'ingredients',
            recordId: insertId,
            details: { name: cleanName, unit, current_stock: cleanCurrentStock, minimum_stock: cleanMinimumStock, is_active: cleanIsActive },
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
        is_low_stock: Boolean(created.is_low_stock),
        total_recipes: 0
    };
};

const updateIngredient = async ({ id, updateData, updaterId, ipAddress }) => {
    // 1. Check if ingredient exists
    const existing = await inventoryModel.findIngredientById(id);
    if (!existing) {
        throw ApiError.notFound('Ingredient not found');
    }

    const cleanUpdate = {};

    // 2. Validate and clean name
    if (updateData.name !== undefined) {
        const cleanName = updateData.name.trim();
        if (cleanName.toLowerCase() !== existing.name.toLowerCase()) {
            const conflict = await inventoryModel.findIngredientByNameExcludeId(cleanName, id);
            if (conflict) {
                throw ApiError.conflict('Ingredient name already exists');
            }
        }
        cleanUpdate.name = cleanName;
    }

    // 3. Allow unit modification if provided
    if (updateData.unit !== undefined && updateData.unit !== existing.unit) {
        cleanUpdate.unit = updateData.unit;
    }

    // 4. Stock adjustment preparation
    if (updateData.current_stock !== undefined) {
        cleanUpdate.current_stock = Number(Number(updateData.current_stock).toFixed(4));
    }

    if (updateData.minimum_stock !== undefined) {
        cleanUpdate.minimum_stock = Number(Number(updateData.minimum_stock).toFixed(4));
    }

    if (updateData.is_active !== undefined) {
        cleanUpdate.is_active = Boolean(updateData.is_active);
    }

    // 5. Update ingredient and record movement in transaction with row lock
    const connection = await pool.getConnection();
    let previousStock = Number(existing.current_stock);
    try {
        await connection.beginTransaction();

        const lockedExisting = await inventoryModel.findIngredientByIdForUpdate(id, connection);
        if (!lockedExisting) {
            throw ApiError.notFound('Ingredient not found');
        }
        previousStock = Number(lockedExisting.current_stock);

        let stockDiff = 0;
        if (cleanUpdate.current_stock !== undefined) {
            stockDiff = Number((cleanUpdate.current_stock - previousStock).toFixed(4));
        }

        await inventoryModel.updateIngredientById(id, cleanUpdate, connection);

        // If current_stock was changed manually, record an ADJUSTMENT stock movement
        if (stockDiff !== 0 && updaterId) {
            await inventoryModel.insertStockMovement({
                ingredientId: id,
                movementType: 'ADJUSTMENT',
                quantityChange: stockDiff,
                unitCost: null,
                reason: 'Manual stock adjustment via ingredient update',
                idempotencyKey: null,
                createdBy: updaterId
            }, connection);
        }

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        if (error.errno === 1062 || error.code === 'ER_DUP_ENTRY') {
            throw ApiError.conflict('Ingredient name already exists');
        }
        throw error;
    } finally {
        connection.release();
    }

    // 6. Record audit log
    try {
        await auditLogsModel.insertAuditLog({
            userId: updaterId || null,
            action: 'UPDATE_INGREDIENT',
            tableName: 'ingredients',
            recordId: id,
            details: {
                ...cleanUpdate,
                previous: {
                    name: existing.name,
                    unit: existing.unit,
                    current_stock: existing.current_stock,
                    minimum_stock: existing.minimum_stock,
                    is_active: existing.is_active
                }
            },
            ipAddress
        });
    } catch (err) {
        console.error('Failed to write audit log for updateIngredient:', err.message);
    }

    // 7. Retrieve updated record and format
    const updated = await inventoryModel.findIngredientById(id);
    return {
        ...updated,
        is_active: Boolean(updated.is_active),
        is_low_stock: Boolean(updated.is_low_stock),
        total_recipes: Number(updated.total_recipes || 0)
    };
};

const deleteIngredient = async ({ id, deleterId, ipAddress }) => {
    // 1. Verify ingredient exists
    const ingredient = await inventoryModel.findIngredientById(id);
    if (!ingredient) {
        throw ApiError.notFound('Ingredient not found');
    }

    const recipeCount = await inventoryModel.countRecipesByIngredientId(id);
    const movementCount = await inventoryModel.countStockMovementsByIngredientId(id);

    // 2. Delete ingredient along with its recipes and stock movements
    await inventoryModel.deleteIngredientById(id);

    // 3. Record audit log
    try {
        await auditLogsModel.insertAuditLog({
            userId: deleterId || null,
            action: 'DELETE_INGREDIENT',
            tableName: 'ingredients',
            recordId: id,
            details: {
                name: ingredient.name,
                unit: ingredient.unit,
                deleted_recipes_count: recipeCount,
                deleted_movements_count: movementCount
            },
            ipAddress
        });
    } catch (err) {
        console.error('Failed to write audit log for deleteIngredient:', err.message);
    }

    return true;
};

const deleteStockMovement = async ({ id, deleterId, ipAddress }) => {
    const movement = await inventoryModel.findStockMovementById(id);
    if (!movement) {
        throw ApiError.notFound('Stock movement not found');
    }

    await inventoryModel.deleteStockMovementById(id);

    try {
        await auditLogsModel.insertAuditLog({
            userId: deleterId || null,
            action: 'DELETE_STOCK_MOVEMENT',
            tableName: 'stock_movements',
            recordId: id,
            details: {
                ingredient_id: movement.ingredient_id,
                ingredient_name: movement.ingredient_name,
                movement_type: movement.movement_type,
                quantity_change: movement.quantity_change
            },
            ipAddress
        });
    } catch (err) {
        console.error('Failed to write audit log for deleteStockMovement:', err.message);
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
        scale_by_sugar: Boolean(r.scale_by_sugar),
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
            const isDrinkVariant = variant.product_type === 'DRINK';
            const recipeRows = items.map((item) => [
                variantId,
                item.ingredient_id,
                item.quantity,
                isDrinkVariant ? Boolean(item.scale_by_sugar) : false
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
                scale_by_sugar: Boolean(row.scale_by_sugar),
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
        recipes: recipes.map((r) => ({
            ...r,
            scale_by_sugar: Boolean(r.scale_by_sugar)
        })),
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
    deleteStockMovement,
    getStockMovements,
    getStockMovementById,
    createStockMovement,
    getRecipeByVariantId,
    updateRecipeByVariantId,
    deleteRecipeByVariantId,
    getRecipeByProductId,
    getAllRecipes
};
