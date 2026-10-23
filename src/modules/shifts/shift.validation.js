const Joi = require('joi');

const getCurrentShiftQuerySchema = {
    query: Joi.object({
        user_id: Joi.number().integer().positive().optional().messages({
            'number.base': 'User ID must be a number',
            'number.integer': 'User ID must be an integer',
            'number.positive': 'User ID must be a positive number'
        })
    })
};

const openShiftSchema = {
    body: Joi.object({
        opening_cash_usd: Joi.number().min(0).default(0).messages({
            'number.base': 'Opening cash USD must be a number',
            'number.min': 'Opening cash USD cannot be negative'
        }),
        opening_cash_khr: Joi.number().min(0).default(0).messages({
            'number.base': 'Opening cash KHR must be a number',
            'number.min': 'Opening cash KHR cannot be negative'
        }),
        note: Joi.string().trim().max(500).allow(null, '').optional().messages({
            'string.max': 'Note cannot exceed 500 characters'
        })
    })
};

const getShiftByIdSchema = {
    params: Joi.object({
        id: Joi.number().integer().positive().required().messages({
            'number.base': 'Shift ID must be a number',
            'number.integer': 'Shift ID must be an integer',
            'number.positive': 'Shift ID must be a positive number',
            'any.required': 'Shift ID is required'
        })
    })
};

const closeShiftSchema = {
    params: Joi.object({
        id: Joi.number().integer().positive().required().messages({
            'number.base': 'Shift ID must be a number',
            'number.integer': 'Shift ID must be an integer',
            'number.positive': 'Shift ID must be a positive number',
            'any.required': 'Shift ID is required'
        })
    }),
    body: Joi.object({
        closing_cash_usd: Joi.number().min(0).required().messages({
            'number.base': 'Closing cash USD must be a number',
            'number.min': 'Closing cash USD cannot be negative',
            'any.required': 'Closing cash USD is required'
        }),
        closing_cash_khr: Joi.number().min(0).required().messages({
            'number.base': 'Closing cash KHR must be a number',
            'number.min': 'Closing cash KHR cannot be negative',
            'any.required': 'Closing cash KHR is required'
        }),
        note: Joi.string().trim().max(500).allow(null, '').optional().messages({
            'string.max': 'Note cannot exceed 500 characters'
        })
    })
};

const getAllShiftsQuerySchema = {
    query: Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(200).default(20),
        status: Joi.string().valid('OPEN', 'CLOSED').optional(),
        user_id: Joi.number().integer().positive().optional(),
        start_date: Joi.date().iso().optional(),
        end_date: Joi.date().iso().optional()
    })
};

module.exports = {
    getCurrentShiftQuerySchema,
    openShiftSchema,
    getShiftByIdSchema,
    closeShiftSchema,
    getAllShiftsQuerySchema
};
