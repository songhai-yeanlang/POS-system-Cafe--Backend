const Joi = require('joi');

const CODE_PATTERN = /^[A-Za-z0-9_-]+$/;

const createDiscountCodeSchema = {
    body: Joi.object({
        code: Joi.string().trim().min(2).max(50).pattern(CODE_PATTERN).required().messages({
            'string.empty': 'Discount code is required',
            'string.min': 'Discount code must be at least 2 characters',
            'string.max': 'Discount code cannot exceed 50 characters',
            'string.pattern.base': 'Discount code may only contain letters, numbers, hyphens (-), and underscores (_)',
            'any.required': 'Discount code is required'
        }),
        name: Joi.string().trim().min(1).max(150).required().messages({
            'string.empty': 'Promotion name is required',
            'string.max': 'Promotion name cannot exceed 150 characters',
            'any.required': 'Promotion name is required'
        }),
        description: Joi.string().trim().max(500).allow(null, '').optional().messages({
            'string.max': 'Description cannot exceed 500 characters'
        }),
        discount_type: Joi.string().valid('PERCENT', 'FIXED').required().messages({
            'any.only': 'Discount type must be either PERCENT or FIXED',
            'any.required': 'Discount type is required'
        }),
        discount_value: Joi.number().positive().required().messages({
            'number.base': 'Discount value must be a number',
            'number.positive': 'Discount value must be greater than 0',
            'any.required': 'Discount value is required'
        }),
        min_order_amount: Joi.number().min(0).default(0).messages({
            'number.base': 'Minimum order amount must be a number',
            'number.min': 'Minimum order amount cannot be negative'
        }),
        max_uses: Joi.number().integer().positive().allow(null).optional().messages({
            'number.base': 'Max uses must be an integer',
            'number.positive': 'Max uses must be at least 1'
        }),
        starts_at: Joi.date().iso().raw().allow(null, '').optional().messages({
            'date.format': 'Start date must be a valid ISO date'
        }),
        expires_at: Joi.date().iso().raw().allow(null, '').optional().messages({
            'date.format': 'Expiration date must be a valid ISO date'
        }),
        is_active: Joi.boolean().default(true)
    })
};

const updateDiscountCodeSchema = {
    params: Joi.object({
        id: Joi.number().integer().positive().required().messages({
            'number.base': 'Discount code ID must be a number',
            'number.positive': 'Discount code ID must be a positive integer',
            'any.required': 'Discount code ID is required'
        })
    }),
    body: Joi.object({
        code: Joi.string().trim().min(2).max(50).pattern(CODE_PATTERN).optional().messages({
            'string.empty': 'Discount code cannot be empty',
            'string.min': 'Discount code must be at least 2 characters',
            'string.max': 'Discount code cannot exceed 50 characters',
            'string.pattern.base': 'Discount code may only contain letters, numbers, hyphens (-), and underscores (_)'
        }),
        name: Joi.string().trim().min(1).max(150).optional().messages({
            'string.empty': 'Promotion name cannot be empty',
            'string.max': 'Promotion name cannot exceed 150 characters'
        }),
        description: Joi.string().trim().max(500).allow(null, '').optional().messages({
            'string.max': 'Description cannot exceed 500 characters'
        }),
        discount_type: Joi.string().valid('PERCENT', 'FIXED').optional().messages({
            'any.only': 'Discount type must be either PERCENT or FIXED'
        }),
        discount_value: Joi.number().positive().optional().messages({
            'number.base': 'Discount value must be a number',
            'number.positive': 'Discount value must be greater than 0'
        }),
        min_order_amount: Joi.number().min(0).optional().messages({
            'number.base': 'Minimum order amount must be a number',
            'number.min': 'Minimum order amount cannot be negative'
        }),
        max_uses: Joi.number().integer().positive().allow(null).optional().messages({
            'number.base': 'Max uses must be an integer',
            'number.positive': 'Max uses must be at least 1'
        }),
        starts_at: Joi.date().iso().raw().allow(null, '').optional().messages({
            'date.format': 'Start date must be a valid ISO date'
        }),
        expires_at: Joi.date().iso().raw().allow(null, '').optional().messages({
            'date.format': 'Expiration date must be a valid ISO date'
        }),
        is_active: Joi.boolean().optional()
    }).min(1).messages({
        'object.min': 'At least one field must be provided to update'
    })
};

const getDiscountCodeByIdSchema = {
    params: Joi.object({
        id: Joi.number().integer().positive().required().messages({
            'number.base': 'Discount code ID must be a number',
            'number.positive': 'Discount code ID must be a positive integer',
            'any.required': 'Discount code ID is required'
        })
    })
};

const deleteDiscountCodeSchema = getDiscountCodeByIdSchema;

const getDiscountCodesQuerySchema = {
    query: Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(200).default(50),
        search: Joi.string().trim().max(100).optional(),
        discount_type: Joi.string().valid('PERCENT', 'FIXED').optional(),
        is_active: Joi.boolean().truthy('1', 'true').falsy('0', 'false').optional(),
        valid_only: Joi.boolean().truthy('1', 'true').falsy('0', 'false').optional()
    })
};

const validateDiscountCodeSchema = {
    body: Joi.object({
        code: Joi.string().trim().min(1).max(50).required().messages({
            'string.empty': 'Discount code is required',
            'any.required': 'Discount code is required'
        }),
        subtotal: Joi.number().min(0).optional().messages({
            'number.base': 'Order subtotal must be a number',
            'number.min': 'Order subtotal cannot be negative'
        }),
        order_id: Joi.number().integer().positive().allow(null).optional()
    })
};

module.exports = {
    createDiscountCodeSchema,
    updateDiscountCodeSchema,
    getDiscountCodeByIdSchema,
    deleteDiscountCodeSchema,
    getDiscountCodesQuerySchema,
    validateDiscountCodeSchema
};
