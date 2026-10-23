const Joi = require('joi');

const createOrderSchema = {
    body: Joi.object({
        order_type: Joi.string().valid('DINE_IN', 'TAKEAWAY').default('TAKEAWAY').messages({
            'any.only': 'Order type must be either DINE_IN or TAKEAWAY'
        }),
        table_no: Joi.string().trim().max(20).allow(null, '').when('order_type', {
            is: 'TAKEAWAY',
            then: Joi.forbidden().messages({
                'any.unknown': 'Table number is not allowed for takeaway orders'
            }),
            otherwise: Joi.optional()
        }),
        note: Joi.string().trim().max(500).allow(null, '').optional().messages({
            'string.max': 'Note cannot exceed 500 characters'
        }),
        discount_type: Joi.string().valid('NONE', 'PERCENT', 'FIXED').default('NONE'),
        discount_value: Joi.number().min(0).default(0).messages({
            'number.min': 'Discount value cannot be negative'
        }),
        discount_approved_by: Joi.number().integer().positive().allow(null).optional(),
        discount_reason: Joi.string().trim().max(255).allow(null, '').optional(),
        items: Joi.array().items(
            Joi.object({
                variant_id: Joi.number().integer().positive().required().messages({
                    'any.required': 'Variant ID is required for each item',
                    'number.base': 'Variant ID must be a number',
                    'number.positive': 'Variant ID must be a positive integer'
                }),
                quantity: Joi.number().integer().min(1).required().messages({
                    'any.required': 'Quantity is required for each item',
                    'number.min': 'Quantity must be at least 1'
                }),
                sugar_level: Joi.number().integer().min(0).max(100).allow(null).optional().messages({
                    'number.min': 'Sugar level cannot be less than 0%',
                    'number.max': 'Sugar level cannot exceed 100%'
                }),
                ice_level: Joi.string().valid('NONE', 'LESS', 'NORMAL', 'EXTRA').allow(null).optional().messages({
                    'any.only': 'Ice level must be NONE, LESS, NORMAL, or EXTRA'
                }),
                note: Joi.string().trim().max(500).allow(null, '').optional(),
                addons: Joi.array().items(
                    Joi.object({
                        addon_variant_id: Joi.number().integer().positive().required().messages({
                            'any.required': 'Addon variant ID is required'
                        }),
                        quantity: Joi.number().integer().min(1).default(1).messages({
                            'number.min': 'Addon quantity must be at least 1'
                        })
                    })
                ).optional().default([])
            })
        ).min(1).required().messages({
            'any.required': 'Order must contain at least one item',
            'array.min': 'Order must contain at least one item'
        })
    })
};

const getOrderByIdSchema = {
    params: Joi.object({
        id: Joi.number().integer().positive().required().messages({
            'number.base': 'Order ID must be a number',
            'number.integer': 'Order ID must be an integer',
            'number.positive': 'Order ID must be a positive number',
            'any.required': 'Order ID is required'
        })
    })
};

const getAllOrdersQuerySchema = {
    query: Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(200).default(20),
        status: Joi.string().valid('OPEN', 'PAID', 'CANCELLED', 'REFUNDED').optional(),
        order_type: Joi.string().valid('DINE_IN', 'TAKEAWAY').optional(),
        shift_id: Joi.number().integer().positive().optional(),
        cashier_id: Joi.number().integer().positive().optional(),
        start_date: Joi.date().iso().optional(),
        end_date: Joi.date().iso().optional(),
        search: Joi.string().trim().max(50).optional()
    })
};

const updateOrderSchema = {
    params: Joi.object({
        id: Joi.number().integer().positive().required().messages({
            'number.base': 'Order ID must be a number',
            'number.integer': 'Order ID must be an integer',
            'number.positive': 'Order ID must be a positive number',
            'any.required': 'Order ID is required'
        })
    }),
    body: Joi.object({
        order_type: Joi.string().valid('DINE_IN', 'TAKEAWAY').default('TAKEAWAY').messages({
            'any.only': 'Order type must be either DINE_IN or TAKEAWAY'
        }),
        table_no: Joi.string().trim().max(20).allow(null, '').when('order_type', {
            is: 'TAKEAWAY',
            then: Joi.forbidden().messages({
                'any.unknown': 'Table number is not allowed for takeaway orders'
            }),
            otherwise: Joi.optional()
        }),
        note: Joi.string().trim().max(500).allow(null, '').optional().messages({
            'string.max': 'Note cannot exceed 500 characters'
        }),
        discount_type: Joi.string().valid('NONE', 'PERCENT', 'FIXED').default('NONE'),
        discount_value: Joi.number().min(0).default(0).messages({
            'number.min': 'Discount value cannot be negative'
        }),
        discount_approved_by: Joi.number().integer().positive().allow(null).optional(),
        discount_reason: Joi.string().trim().max(255).allow(null, '').optional(),
        items: Joi.array().items(
            Joi.object({
                variant_id: Joi.number().integer().positive().required().messages({
                    'any.required': 'Variant ID is required for each item',
                    'number.base': 'Variant ID must be a number',
                    'number.positive': 'Variant ID must be a positive integer'
                }),
                quantity: Joi.number().integer().min(1).required().messages({
                    'any.required': 'Quantity is required for each item',
                    'number.min': 'Quantity must be at least 1'
                }),
                sugar_level: Joi.number().integer().min(0).max(100).allow(null).optional().messages({
                    'number.min': 'Sugar level cannot be less than 0%',
                    'number.max': 'Sugar level cannot exceed 100%'
                }),
                ice_level: Joi.string().valid('NONE', 'LESS', 'NORMAL', 'EXTRA').allow(null).optional().messages({
                    'any.only': 'Ice level must be NONE, LESS, NORMAL, or EXTRA'
                }),
                note: Joi.string().trim().max(500).allow(null, '').optional(),
                addons: Joi.array().items(
                    Joi.object({
                        addon_variant_id: Joi.number().integer().positive().required().messages({
                            'any.required': 'Addon variant ID is required'
                        }),
                        quantity: Joi.number().integer().min(1).default(1).messages({
                            'number.min': 'Addon quantity must be at least 1'
                        })
                    })
                ).optional().default([])
            })
        ).min(1).required().messages({
            'any.required': 'Order must contain at least one item',
            'array.min': 'Order must contain at least one item'
        })
    })
};

const cancelOrderSchema = {
    params: Joi.object({
        id: Joi.number().integer().positive().required().messages({
            'number.base': 'Order ID must be a number',
            'number.integer': 'Order ID must be an integer',
            'number.positive': 'Order ID must be a positive number',
            'any.required': 'Order ID is required'
        })
    }),
    body: Joi.object({
        reason: Joi.string().trim().min(1).max(255).required().messages({
            'string.empty': 'Cancellation reason is required',
            'any.required': 'Cancellation reason is required',
            'string.max': 'Cancellation reason cannot exceed 255 characters'
        })
    })
};

module.exports = {
    createOrderSchema,
    getOrderByIdSchema,
    getAllOrdersQuerySchema,
    updateOrderSchema,
    cancelOrderSchema
};
