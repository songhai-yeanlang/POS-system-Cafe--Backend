const inventoryService = require('./inventory.service');

const getAllIngredients = async (req, res, next) => {
    try {
        const result = await inventoryService.getAllIngredients(req.query);
        res.status(200).json({
            success: true,
            message: 'Ingredients retrieved successfully',
            data: result.ingredients,
            pagination: result.pagination
        });
    } catch (error) {
        next(error);
    }
};

const getLowStockIngredients = async (req, res, next) => {
    try {
        const result = await inventoryService.getLowStockIngredients(req.query);
        res.status(200).json({
            success: true,
            message: 'Low stock ingredients retrieved successfully',
            data: result.ingredients,
            pagination: result.pagination
        });
    } catch (error) {
        next(error);
    }
};

const getIngredientById = async (req, res, next) => {
    try {
        const ingredient = await inventoryService.getIngredientById(req.params.id);
        res.status(200).json({
            success: true,
            message: 'Ingredient retrieved successfully',
            data: ingredient
        });
    } catch (error) {
        next(error);
    }
};

const createIngredient = async (req, res, next) => {
    try {
        const ipAddress = req.ip || req.socket?.remoteAddress || null;
        const newIngredient = await inventoryService.createIngredient({
            ...req.body,
            creatorId: req.user?.id,
            ipAddress
        });

        res.status(201).json({
            success: true,
            message: 'Ingredient created successfully',
            data: newIngredient
        });
    } catch (error) {
        next(error);
    }
};

const updateIngredient = async (req, res, next) => {
    try {
        const ipAddress = req.ip || req.socket?.remoteAddress || null;
        const updatedIngredient = await inventoryService.updateIngredient({
            id: req.params.id,
            updateData: req.body,
            updaterId: req.user?.id,
            ipAddress
        });

        res.status(200).json({
            success: true,
            message: 'Ingredient updated successfully',
            data: updatedIngredient
        });
    } catch (error) {
        next(error);
    }
};

const deleteIngredient = async (req, res, next) => {
    try {
        const ipAddress = req.ip || req.socket?.remoteAddress || null;
        await inventoryService.deleteIngredient({
            id: req.params.id,
            deleterId: req.user?.id,
            ipAddress
        });

        res.status(200).json({
            success: true,
            message: 'Ingredient deleted successfully'
        });
    } catch (error) {
        next(error);
    }
};

const getStockMovements = async (req, res, next) => {
    try {
        const result = await inventoryService.getStockMovements(req.query);
        res.status(200).json({
            success: true,
            message: 'Stock movements retrieved successfully',
            data: result.movements,
            pagination: result.pagination
        });
    } catch (error) {
        next(error);
    }
};

const getStockMovementById = async (req, res, next) => {
    try {
        const movement = await inventoryService.getStockMovementById(req.params.id);
        res.status(200).json({
            success: true,
            message: 'Stock movement retrieved successfully',
            data: movement
        });
    } catch (error) {
        next(error);
    }
};

const createStockMovement = async (req, res, next) => {
    try {
        const ipAddress = req.ip || req.socket?.remoteAddress || null;
        const newMovement = await inventoryService.createStockMovement({
            ...req.body,
            creatorId: req.user?.id,
            ipAddress
        });

        res.status(201).json({
            success: true,
            message: 'Stock movement recorded successfully',
            data: newMovement
        });
    } catch (error) {
        next(error);
    }
};

const getAllRecipes = async (req, res, next) => {
    try {
        const result = await inventoryService.getAllRecipes(req.query);
        res.status(200).json({
            success: true,
            message: 'Recipes retrieved successfully',
            data: result.recipes,
            pagination: result.pagination
        });
    } catch (error) {
        next(error);
    }
};

const getRecipeByVariantId = async (req, res, next) => {
    try {
        const result = await inventoryService.getRecipeByVariantId(req.params.variantId);
        res.status(200).json({
            success: true,
            message: 'Recipe retrieved successfully',
            data: result
        });
    } catch (error) {
        next(error);
    }
};

const getRecipeByProductId = async (req, res, next) => {
    try {
        const result = await inventoryService.getRecipeByProductId(req.params.productId);
        res.status(200).json({
            success: true,
            message: 'Product recipes retrieved successfully',
            data: result
        });
    } catch (error) {
        next(error);
    }
};

const updateRecipeByVariantId = async (req, res, next) => {
    try {
        const ipAddress = req.ip || req.socket?.remoteAddress || null;
        const result = await inventoryService.updateRecipeByVariantId({
            variantId: req.params.variantId,
            items: req.body.items,
            updaterId: req.user?.id,
            ipAddress
        });

        res.status(200).json({
            success: true,
            message: 'Recipe updated successfully',
            data: result
        });
    } catch (error) {
        next(error);
    }
};

const deleteRecipeByVariantId = async (req, res, next) => {
    try {
        const ipAddress = req.ip || req.socket?.remoteAddress || null;
        await inventoryService.deleteRecipeByVariantId({
            variantId: req.params.variantId,
            deleterId: req.user?.id,
            ipAddress
        });

        res.status(200).json({
            success: true,
            message: 'Recipe deleted successfully'
        });
    } catch (error) {
        next(error);
    }
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
    getAllRecipes,
    getRecipeByVariantId,
    getRecipeByProductId,
    updateRecipeByVariantId,
    deleteRecipeByVariantId
};
