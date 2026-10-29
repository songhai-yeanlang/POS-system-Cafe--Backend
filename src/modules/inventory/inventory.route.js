const express = require('express');
const router = express.Router();
const inventoryController = require('./inventory.controller');
const { 
    getIngredientsQuerySchema, 
    getLowStockIngredientsQuerySchema, 
    getIngredientByIdSchema,
    deleteIngredientSchema,
    createIngredientSchema,
    updateIngredientSchema,
    getStockMovementsQuerySchema,
    getStockMovementByIdSchema,
    createStockMovementSchema,
    getAllRecipesQuerySchema,
    getRecipeByProductIdSchema,
    getRecipeByVariantIdSchema,
    deleteRecipeByVariantIdSchema,
    updateRecipeByVariantIdSchema
} = require('./inventory.validation');
const { authenticate, authorize } = require('../../middlewares/authenticate');
const validate = require('../../middlewares/validate');

// ingredients
router.get('/ingredients', authenticate, validate(getIngredientsQuerySchema), inventoryController.getAllIngredients);
router.get('/ingredients/low-stock', authenticate, validate(getLowStockIngredientsQuerySchema), inventoryController.getLowStockIngredients);
router.get('/ingredients/:id', authenticate, validate(getIngredientByIdSchema), inventoryController.getIngredientById);
router.post('/ingredients', authenticate, authorize('OWNER'), validate(createIngredientSchema), inventoryController.createIngredient);
router.put('/ingredients/:id', authenticate, authorize('OWNER'), validate(updateIngredientSchema), inventoryController.updateIngredient);
router.delete('/ingredients/:id', authenticate, authorize('OWNER'), validate(deleteIngredientSchema), inventoryController.deleteIngredient);

//stock movements
router.get('/stock-movements', authenticate, validate(getStockMovementsQuerySchema), inventoryController.getStockMovements);
router.get('/stock-movements/:id', authenticate, validate(getStockMovementByIdSchema), inventoryController.getStockMovementById);
router.post('/stock-movements', authenticate, authorize('OWNER'), validate(createStockMovementSchema), inventoryController.createStockMovement);

// recipes
router.get('/recipes', authenticate, validate(getAllRecipesQuerySchema), inventoryController.getAllRecipes);
router.get('/recipes/product/:productId', authenticate, validate(getRecipeByProductIdSchema), inventoryController.getRecipeByProductId);
router.get('/recipes/variant/:variantId', authenticate, validate(getRecipeByVariantIdSchema), inventoryController.getRecipeByVariantId);
router.put('/recipes/variant/:variantId', authenticate, authorize('OWNER'), validate(updateRecipeByVariantIdSchema), inventoryController.updateRecipeByVariantId);
router.delete('/recipes/variant/:variantId', authenticate, authorize('OWNER'), validate(deleteRecipeByVariantIdSchema), inventoryController.deleteRecipeByVariantId);

module.exports = router;