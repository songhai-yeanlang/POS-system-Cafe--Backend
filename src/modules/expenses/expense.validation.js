const Joi = require('joi');

const createExpenseSchema = {
    body: Joi.object({
        shift_id: Joi.number().integer().positive().allow(null).optional().messages({
            'number.positive': 'Shift ID must be a positive integer'
        }),
        category: Joi.string().trim().min(1).max(100).required().messages({
            'any.required': 'Category is required',
            'string.empty': 'Category cannot be empty',
            'string.max': 'Category cannot exceed 100 characters'
        }),
        description: Joi.string().trim().min(1).max(500).required().messages({
            'any.required': 'Description is required',
            'string.empty': 'Description cannot be empty',
            'string.max': 'Description cannot exceed 500 characters'
        }),
        payment_method: Joi.string().valid('CASH', 'KHQR', 'BANK_TRANSFER').required().messages({
            'any.required': 'Payment method is required',
            'any.only': 'Payment method must be CASH, KHQR, or BANK_TRANSFER'
        }),
        currency: Joi.string().valid('USD', 'KHR').default('USD').messages({
            'any.only': 'Currency must be USD or KHR'
        }),
        amount: Joi.number().positive().required().messages({
            'any.required': 'Amount is required',
            'number.base': 'Amount must be a number',
            'number.positive': 'Amount must be greater than 0'
        }),
        incurred_at: Joi.string().isoDate().allow(null, '').optional().messages({
            'string.isoDate': 'Incurred date must be a valid ISO date'
        })
    })
};

const updateExpenseSchema = {
    params: Joi.object({
        id: Joi.number().integer().positive().required().messages({
            'any.required': 'Expense ID is required',
            'number.positive': 'Expense ID must be a positive integer'
        })
    }),
    body: Joi.object({
        category: Joi.string().trim().min(1).max(100).optional().messages({
            'string.empty': 'Category cannot be empty',
            'string.max': 'Category cannot exceed 100 characters'
        }),
        description: Joi.string().trim().min(1).max(500).optional().messages({
            'string.empty': 'Description cannot be empty',
            'string.max': 'Description cannot exceed 500 characters'
        }),
        payment_method: Joi.string().valid('CASH', 'KHQR', 'BANK_TRANSFER').optional().messages({
            'any.only': 'Payment method must be CASH, KHQR, or BANK_TRANSFER'
        }),
        currency: Joi.string().valid('USD', 'KHR').optional().messages({
            'any.only': 'Currency must be USD or KHR'
        }),
        amount: Joi.number().positive().optional().messages({
            'number.base': 'Amount must be a number',
            'number.positive': 'Amount must be greater than 0'
        }),
        incurred_at: Joi.string().isoDate().allow(null, '').optional().messages({
            'string.isoDate': 'Incurred date must be a valid ISO date'
        })
    }).min(1).messages({
        'object.min': 'At least one field is required to update'
    })
};

const getExpenseByIdSchema = {
    params: Joi.object({
        id: Joi.number().integer().positive().required().messages({
            'any.required': 'Expense ID is required',
            'number.positive': 'Expense ID must be a positive integer'
        })
    })
};

const getExpensesQuerySchema = {
    query: Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        shift_id: Joi.number().integer().positive().optional(),
        category: Joi.string().trim().max(100).allow(null, '').optional(),
        payment_method: Joi.string().valid('CASH', 'KHQR', 'BANK_TRANSFER').optional(),
        currency: Joi.string().valid('USD', 'KHR').optional(),
        status: Joi.string().valid('ACTIVE', 'VOIDED').optional(),
        created_by: Joi.number().integer().positive().optional(),
        start_date: Joi.string().isoDate().allow(null, '').optional().messages({
            'string.isoDate': 'Start date must be a valid ISO date'
        }),
        end_date: Joi.string().isoDate().allow(null, '').optional().messages({
            'string.isoDate': 'End date must be a valid ISO date'
        }),
        search: Joi.string().trim().max(100).allow(null, '').optional()
    })
};

const voidExpenseSchema = {
    params: Joi.object({
        id: Joi.number().integer().positive().required().messages({
            'any.required': 'Expense ID is required',
            'number.positive': 'Expense ID must be a positive integer'
        })
    }),
    body: Joi.object({
        void_reason: Joi.string().trim().min(3).max(255).required().messages({
            'any.required': 'Void reason is required',
            'string.empty': 'Void reason cannot be empty',
            'string.min': 'Void reason must be at least 3 characters',
            'string.max': 'Void reason cannot exceed 255 characters'
        })
    })
};

const getExpenseSummaryQuerySchema = {
    query: Joi.object({
        start_date: Joi.string().isoDate().allow(null, '').optional().messages({
            'string.isoDate': 'Start date must be a valid ISO date'
        }),
        end_date: Joi.string().isoDate().allow(null, '').optional().messages({
            'string.isoDate': 'End date must be a valid ISO date'
        }),
        shift_id: Joi.number().integer().positive().optional()
    })
};

module.exports = {
    createExpenseSchema,
    updateExpenseSchema,
    getExpenseByIdSchema,
    getExpensesQuerySchema,
    voidExpenseSchema,
    getExpenseSummaryQuerySchema
};
