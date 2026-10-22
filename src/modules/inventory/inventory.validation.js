const Joi = require('joi');

const getIngredientsQuerySchema = {
    query: Joi.object({
        page: Joi.number().integer().min(1).optional(),
        limit: Joi.number().integer().min(1).max(200).optional(),
        search: Joi.string().trim().max(150).optional(),
        unit: Joi.string().valid('G', 'ML', 'PCS').optional(),
        is_active: Joi.boolean().truthy('1', 'true').falsy('0', 'false').optional(),
        low_stock: Joi.boolean().truthy('1', 'true').falsy('0', 'false').optional()
    })
};

const getLowStockIngredientsQuerySchema = {
    query: Joi.object({
        page: Joi.number().integer().min(1).optional(),
        limit: Joi.number().integer().min(1).max(200).optional(),
        search: Joi.string().trim().max(150).optional(),
        unit: Joi.string().valid('G', 'ML', 'PCS').optional()
    })
};

const getIngredientByIdSchema = {
    params: Joi.object({
        id: Joi.number().integer().positive().required().messages({
            'number.base': 'Ingredient ID must be a number',
            'number.integer': 'Ingredient ID must be an integer',
            'number.positive': 'Ingredient ID must be a positive number',
            'any.required': 'Ingredient ID is required'
        })
    })
};

const deleteIngredientSchema = getIngredientByIdSchema;

const createIngredientSchema = {
    body: Joi.object({
        name: Joi.string().trim().min(1).max(150).required().messages({
            'string.empty': 'Ingredient name is required',
            'string.max': 'Ingredient name cannot exceed 150 characters',
            'any.required': 'Ingredient name is required'
        }),
        unit: Joi.string().valid('G', 'ML', 'PCS').required().messages({
            'any.only': 'Unit must be G, ML, or PCS',
            'any.required': 'Unit is required'
        }),
        current_stock: Joi.number().min(0).default(0).messages({
            'number.base': 'Current stock must be a number',
            'number.min': 'Current stock cannot be negative'
        }),
        minimum_stock: Joi.number().min(0).default(0).messages({
            'number.base': 'Minimum stock must be a number',
            'number.min': 'Minimum stock cannot be negative'
        }),
        is_active: Joi.boolean().default(true)
    })
};

const updateIngredientSchema = {
    params: Joi.object({
        id: Joi.number().integer().positive().required().messages({
            'number.base': 'Ingredient ID must be a number',
            'number.integer': 'Ingredient ID must be an integer',
            'number.positive': 'Ingredient ID must be a positive number',
            'any.required': 'Ingredient ID is required'
        })
    }),
    body: Joi.object({
        name: Joi.string().trim().min(1).max(150).optional().messages({
            'string.empty': 'Ingredient name cannot be empty',
            'string.max': 'Ingredient name cannot exceed 150 characters'
        }),
        unit: Joi.string().valid('G', 'ML', 'PCS').optional().messages({
            'any.only': 'Unit must be G, ML, or PCS'
        }),
        current_stock: Joi.number().min(0).optional().messages({
            'number.base': 'Current stock must be a number',
            'number.min': 'Current stock cannot be negative'
        }),
        minimum_stock: Joi.number().min(0).optional().messages({
            'number.base': 'Minimum stock must be a number',
            'number.min': 'Minimum stock cannot be negative'
        }),
        is_active: Joi.boolean().optional()
    }).min(1).messages({
        'object.min': 'At least one field (name, unit, current_stock, minimum_stock, is_active) must be provided to update'
    })
};

const getStockMovementsQuerySchema = {
    query: Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(200).default(50),
        ingredient_id: Joi.number().integer().positive().optional(),
        movement_type: Joi.string().valid('PURCHASE', 'SALE', 'WASTE', 'ADJUSTMENT', 'RETURN').optional(),
        order_id: Joi.number().integer().positive().optional(),
        created_by: Joi.number().integer().positive().optional(),
        start_date: Joi.date().iso().optional(),
        end_date: Joi.date().iso().optional()
    })
};

const createStockMovementSchema = {
    body: Joi.object({
        ingredient_id: Joi.number().integer().positive().required().messages({
            'number.base': 'Ingredient ID must be a number',
            'number.integer': 'Ingredient ID must be an integer',
            'number.positive': 'Ingredient ID must be a positive number',
            'any.required': 'Ingredient ID is required'
        }),
        movement_type: Joi.string().valid('PURCHASE', 'WASTE', 'ADJUSTMENT').required().messages({
            'any.only': 'Movement type must be PURCHASE, WASTE, or ADJUSTMENT',
            'any.required': 'Movement type is required'
        }),
        quantity: Joi.number().invalid(0).required().messages({
            'number.base': 'Quantity must be a number',
            'number.invalid': 'Quantity cannot be 0',
            'any.required': 'Quantity is required'
        }),
        unit_cost: Joi.number().min(0).allow(null).optional().messages({
            'number.base': 'Unit cost must be a number',
            'number.min': 'Unit cost cannot be negative'
        }),
        reason: Joi.string().trim().max(500).when('movement_type', {
            is: Joi.valid('WASTE', 'ADJUSTMENT'),
            then: Joi.required().messages({
                'string.empty': 'Reason is required for WASTE and ADJUSTMENT movements',
                'any.required': 'Reason is required for WASTE and ADJUSTMENT movements'
            }),
            otherwise: Joi.optional().allow(null, '')
        }),
        idempotency_key: Joi.string().trim().max(100).optional()
    })
};

const getStockMovementByIdSchema = {
    params: Joi.object({
        id: Joi.number().integer().positive().required().messages({
            'number.base': 'Stock movement ID must be a number',
            'number.integer': 'Stock movement ID must be an integer',
            'number.positive': 'Stock movement ID must be a positive number',
            'any.required': 'Stock movement ID is required'
        })
    })
};

const getRecipeByVariantIdSchema = {
    params: Joi.object({
        variantId: Joi.number().integer().positive().required().messages({
            'number.base': 'Variant ID must be a number',
            'number.integer': 'Variant ID must be an integer',
            'number.positive': 'Variant ID must be a positive number',
            'any.required': 'Variant ID is required'
        })
    })
};

const deleteRecipeByVariantIdSchema = getRecipeByVariantIdSchema;

const getRecipeByProductIdSchema = {
    params: Joi.object({
        productId: Joi.number().integer().positive().required().messages({
            'number.base': 'Product ID must be a number',
            'number.integer': 'Product ID must be an integer',
            'number.positive': 'Product ID must be a positive number',
            'any.required': 'Product ID is required'
        })
    })
};

const getAllRecipesQuerySchema = {
    query: Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(200).default(50),
        search: Joi.string().trim().max(150).optional(),
        variant_id: Joi.number().integer().positive().optional(),
        ingredient_id: Joi.number().integer().positive().optional()
    })
};

const updateRecipeByVariantIdSchema = {
    params: Joi.object({
        variantId: Joi.number().integer().positive().required().messages({
            'number.base': 'Variant ID must be a number',
            'number.integer': 'Variant ID must be an integer',
            'number.positive': 'Variant ID must be a positive number',
            'any.required': 'Variant ID is required'
        })
    }),
    body: Joi.object({
        items: Joi.array().items(
            Joi.object({
                ingredient_id: Joi.number().integer().positive().required().messages({
                    'number.base': 'Ingredient ID must be a number',
                    'number.integer': 'Ingredient ID must be an integer',
                    'number.positive': 'Ingredient ID must be a positive number',
                    'any.required': 'Ingredient ID is required'
                }),
                quantity: Joi.number().positive().required().messages({
                    'number.base': 'Quantity must be a number',
                    'number.positive': 'Quantity must be greater than 0',
                    'any.required': 'Quantity is required'
                })
            })
        ).required().messages({
            'array.base': 'Items must be an array',
            'any.required': 'Items array is required'
        })
    })
};

module.exports = {
    getIngredientsQuerySchema,
    getLowStockIngredientsQuerySchema,
    getIngredientByIdSchema,
    deleteIngredientSchema,
    createIngredientSchema,
    updateIngredientSchema,
    getStockMovementsQuerySchema,
    getStockMovementByIdSchema,
    createStockMovementSchema,
    getRecipeByVariantIdSchema,
    deleteRecipeByVariantIdSchema,
    getRecipeByProductIdSchema,
    getAllRecipesQuerySchema,
    updateRecipeByVariantIdSchema
};
