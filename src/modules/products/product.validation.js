const Joi = require('joi');

const createCategorySchema = {
    body: Joi.object({
        name: Joi.string().trim().min(1).max(100).required().messages({
            'string.empty': 'Category name is required',
            'string.max': 'Category name cannot exceed 100 characters',
            'any.required': 'Category name is required'
        }),
        sort_order: Joi.number().integer().min(0).default(0).messages({
            'number.base': 'Sort order must be a number',
            'number.integer': 'Sort order must be an integer',
            'number.min': 'Sort order must be greater than or equal to 0'
        }),
        is_active: Joi.boolean().default(true)
    })
};

const getCategoryByIdSchema = {
    params: Joi.object({
        id: Joi.number().integer().positive().required().messages({
            'number.base': 'Category ID must be a number',
            'number.integer': 'Category ID must be an integer',
            'number.positive': 'Category ID must be a positive number',
            'any.required': 'Category ID is required'
        })
    })
};

const deleteCategorySchema = getCategoryByIdSchema;

const updateCategorySchema = {
    params: Joi.object({
        id: Joi.number().integer().positive().required().messages({
            'number.base': 'Category ID must be a number',
            'number.integer': 'Category ID must be an integer',
            'number.positive': 'Category ID must be a positive number',
            'any.required': 'Category ID is required'
        })
    }),
    body: Joi.object({
        name: Joi.string().trim().min(1).max(100).optional().messages({
            'string.empty': 'Category name cannot be empty',
            'string.max': 'Category name cannot exceed 100 characters'
        }),
        sort_order: Joi.number().integer().min(0).optional().messages({
            'number.base': 'Sort order must be a number',
            'number.integer': 'Sort order must be an integer',
            'number.min': 'Sort order must be greater than or equal to 0'
        }),
        is_active: Joi.boolean().optional()
    }).min(1).messages({
        'object.min': 'At least one field (name, sort_order, is_active) must be provided to update'
    })
};

const getCategoriesQuerySchema = {
    query: Joi.object({
        is_active: Joi.boolean().truthy('1', 'true').falsy('0', 'false').optional(),
        search: Joi.string().trim().max(100).optional()
    })
};

const getProductsQuerySchema = {
    query: Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(200).default(50),
        category_id: Joi.number().integer().positive().optional(),
        product_type: Joi.string().valid('DRINK', 'FOOD', 'ADDON').optional(),
        is_active: Joi.boolean().truthy('1', 'true').falsy('0', 'false').optional(),
        search: Joi.string().trim().max(100).optional()
    })
};

const getProductByIdSchema = {
    params: Joi.object({
        id: Joi.number().integer().positive().required().messages({
            'number.base': 'Product ID must be a number',
            'number.integer': 'Product ID must be an integer',
            'number.positive': 'Product ID must be a positive number',
            'any.required': 'Product ID is required'
        })
    })
};

const variantItemSchema = Joi.object({
    name: Joi.string().trim().min(1).max(100).required().messages({
        'string.empty': 'Variant name is required',
        'string.max': 'Variant name cannot exceed 100 characters',
        'any.required': 'Variant name is required'
    }),
    size: Joi.string().trim().max(30).allow(null, '').optional(),
    temperature: Joi.string().valid('HOT', 'ICED', 'NONE').default('NONE').messages({
        'any.only': 'Temperature must be HOT, ICED, or NONE'
    }),
    price: Joi.number().precision(2).min(0).required().messages({
        'number.base': 'Variant price must be a number',
        'number.min': 'Variant price must be greater than or equal to 0',
        'any.required': 'Variant price is required'
    }),
    is_active: Joi.boolean().default(true)
});

const createProductSchema = {
    body: Joi.object({
        category_id: Joi.number().integer().positive().required().messages({
            'number.base': 'Category ID must be a number',
            'number.integer': 'Category ID must be an integer',
            'number.positive': 'Category ID must be a positive number',
            'any.required': 'Category ID is required'
        }),
        name: Joi.string().trim().min(1).max(150).required().messages({
            'string.empty': 'Product name is required',
            'string.max': 'Product name cannot exceed 150 characters',
            'any.required': 'Product name is required'
        }),
        product_type: Joi.string().valid('DRINK', 'FOOD', 'ADDON').default('DRINK').messages({
            'any.only': 'Product type must be DRINK, FOOD, or ADDON'
        }),
        description: Joi.string().trim().max(1000).allow(null, '').optional(),
        image: Joi.string().trim().max(500).allow(null, '').optional(),
        is_active: Joi.boolean().default(true),
        variants: Joi.array().items(variantItemSchema).min(1).required().messages({
            'array.min': 'Product must have at least one variant',
            'any.required': 'Product variants are required'
        })
    })
};

const updateVariantItemSchema = Joi.object({
    id: Joi.number().integer().positive().optional(),
    name: Joi.string().trim().min(1).max(100).required().messages({
        'string.empty': 'Variant name is required',
        'string.max': 'Variant name cannot exceed 100 characters',
        'any.required': 'Variant name is required'
    }),
    size: Joi.string().trim().max(30).allow(null, '').optional(),
    temperature: Joi.string().valid('HOT', 'ICED', 'NONE').default('NONE'),
    price: Joi.number().precision(2).min(0).required().messages({
        'number.base': 'Variant price must be a number',
        'number.min': 'Variant price must be greater than or equal to 0',
        'any.required': 'Variant price is required'
    }),
    is_active: Joi.boolean().default(true)
});

const updateProductSchema = {
    params: Joi.object({
        id: Joi.number().integer().positive().required().messages({
            'number.base': 'Product ID must be a number',
            'number.integer': 'Product ID must be an integer',
            'number.positive': 'Product ID must be a positive number',
            'any.required': 'Product ID is required'
        })
    }),
    body: Joi.object({
        category_id: Joi.number().integer().positive().optional(),
        name: Joi.string().trim().min(1).max(150).optional(),
        product_type: Joi.string().valid('DRINK', 'FOOD', 'ADDON').optional(),
        description: Joi.string().trim().max(1000).allow(null, '').optional(),
        image: Joi.string().trim().max(500).allow(null, '').optional(),
        is_active: Joi.boolean().optional(),
        variants: Joi.array().items(updateVariantItemSchema).min(1).optional()
    }).min(1).messages({
        'object.min': 'At least one field must be provided to update'
    })
};

const deleteProductSchema = getProductByIdSchema;
const uploadProductImageSchema = getProductByIdSchema;
const deleteProductImageSchema = getProductByIdSchema;

module.exports = {
    createCategorySchema,
    getCategoryByIdSchema,
    updateCategorySchema,
    deleteCategorySchema,
    getCategoriesQuerySchema,
    getProductsQuerySchema,
    getProductByIdSchema,
    deleteProductSchema,
    uploadProductImageSchema,
    deleteProductImageSchema,
    createProductSchema,
    updateProductSchema
};



