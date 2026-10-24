const Joi = require('joi');

const processPaymentSchema = {
    body: Joi.object({
        order_id: Joi.number().integer().positive().required().messages({
            'any.required': 'Order ID is required',
            'number.base': 'Order ID must be a number',
            'number.positive': 'Order ID must be a positive integer'
        }),
        method: Joi.string().valid('CASH', 'BANK_TRANSFER', 'KHQR').required().messages({
            'any.required': 'Payment method is required',
            'any.only': 'Payment method must be CASH, BANK_TRANSFER, or KHQR'
        }),
        bank_name: Joi.string().trim().max(50).allow(null, '').optional().messages({
            'string.max': 'Bank name cannot exceed 50 characters'
        }),
        currency: Joi.string().valid('USD', 'KHR').default('USD').messages({
            'any.only': 'Currency must be either USD or KHR'
        }),
        received_amount: Joi.number().min(0).when('method', {
            is: 'CASH',
            then: Joi.required().messages({
                'any.required': 'Received amount is required for CASH payment',
                'number.base': 'Received amount must be a number',
                'number.min': 'Received amount cannot be negative'
            }),
            otherwise: Joi.optional()
        }),
        change_currency: Joi.string().valid('USD', 'KHR').optional().messages({
            'any.only': 'Change currency must be either USD or KHR'
        }),
        change_usd: Joi.number().min(0).optional().messages({
            'number.min': 'Change USD cannot be negative'
        }),
        change_khr: Joi.number().min(0).optional().messages({
            'number.min': 'Change KHR cannot be negative'
        }),
        reference: Joi.string().trim().max(150).allow(null, '').optional().messages({
            'string.max': 'Reference note cannot exceed 150 characters'
        }),
        idempotency_key: Joi.string().trim().max(100).optional().messages({
            'string.max': 'Idempotency key cannot exceed 100 characters'
        })
    })
};

const getPaymentsQuerySchema = {
    query: Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        shift_id: Joi.number().integer().positive().optional(),
        order_id: Joi.number().integer().positive().optional(),
        method: Joi.string().valid('CASH', 'BANK_TRANSFER', 'KHQR').optional(),
        currency: Joi.string().valid('USD', 'KHR').optional(),
        status: Joi.string().valid('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED').optional(),
        received_by: Joi.number().integer().positive().optional(),
        start_date: Joi.string().isoDate().optional().messages({
            'string.isoDate': 'Start date must be a valid ISO date string'
        }),
        end_date: Joi.string().isoDate().optional().messages({
            'string.isoDate': 'End date must be a valid ISO date string'
        }),
        search: Joi.string().trim().max(100).optional()
    })
};

const getPaymentByIdSchema = {
    params: Joi.object({
        id: Joi.number().integer().positive().required().messages({
            'any.required': 'Payment ID is required',
            'number.positive': 'Payment ID must be a positive integer'
        })
    })
};

const getPaymentByOrderIdSchema = {
    params: Joi.object({
        orderId: Joi.number().integer().positive().required().messages({
            'any.required': 'Order ID is required',
            'number.positive': 'Order ID must be a positive integer'
        })
    })
};

const processRefundSchema = {
    params: Joi.object({
        id: Joi.number().integer().positive().optional()
    }),
    body: Joi.object({
        payment_id: Joi.number().integer().positive().optional(),
        reason: Joi.string().trim().min(3).max(500).required().messages({
            'any.required': 'Refund reason is required',
            'string.empty': 'Refund reason cannot be empty',
            'string.min': 'Refund reason must be at least 3 characters',
            'string.max': 'Refund reason cannot exceed 500 characters'
        }),
        approved_by: Joi.number().integer().positive().optional().messages({
            'number.positive': 'Approver ID must be a positive integer'
        }),
        reference: Joi.string().trim().max(150).allow(null, '').optional().messages({
            'string.max': 'Reference note cannot exceed 150 characters'
        })
    })
};

const getRefundsQuerySchema = {
    query: Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        shift_id: Joi.number().integer().positive().optional(),
        order_id: Joi.number().integer().positive().optional(),
        approved_by: Joi.number().integer().positive().optional(),
        method: Joi.string().valid('CASH', 'BANK_TRANSFER', 'KHQR').optional(),
        currency: Joi.string().valid('USD', 'KHR').optional(),
        status: Joi.string().valid('PENDING', 'COMPLETED', 'FAILED').optional(),
        start_date: Joi.string().isoDate().optional().messages({
            'string.isoDate': 'Start date must be a valid ISO date string'
        }),
        end_date: Joi.string().isoDate().optional().messages({
            'string.isoDate': 'End date must be a valid ISO date string'
        }),
        search: Joi.string().trim().max(100).optional()
    })
};

const getRefundByIdSchema = {
    params: Joi.object({
        id: Joi.number().integer().positive().required().messages({
            'any.required': 'Refund ID is required',
            'number.positive': 'Refund ID must be a positive integer'
        })
    })
};

module.exports = {
    processPaymentSchema,
    getPaymentsQuerySchema,
    getPaymentByIdSchema,
    getPaymentByOrderIdSchema,
    processRefundSchema,
    getRefundsQuerySchema,
    getRefundByIdSchema
};
