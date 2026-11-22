const Joi = require('joi');

const updateSettingsSchema = {
    body: Joi.object({
        shop_name: Joi.string().trim().min(1).max(150).optional().messages({
            'string.empty': 'Shop name cannot be empty',
            'string.min': 'Shop name must be at least 1 character',
            'string.max': 'Shop name cannot exceed 150 characters'
        }),
        address: Joi.string().trim().max(500).allow(null, '').optional().messages({
            'string.max': 'Address cannot exceed 500 characters'
        }),
        phone: Joi.string().trim().max(30).allow(null, '').optional().messages({
            'string.max': 'Phone cannot exceed 30 characters'
        }),
        logo: Joi.string()
            .trim()
            .max(500)
            .pattern(/^(?!.*\.\.)(?!.*\\)(\/uploads\/logo\/[a-zA-Z0-9._-]+|https?:\/\/.+)$/)
            .allow(null, '')
            .optional()
            .messages({
                'string.max': 'Logo URL/path cannot exceed 500 characters',
                'string.pattern.base': 'Logo must be a valid /uploads/logo/ path or HTTP(S) URL'
            }),
        exchange_rate: Joi.number().positive().precision(6).optional().messages({
            'number.base': 'Exchange rate must be a valid number',
            'number.positive': 'Exchange rate must be greater than 0'
        }),
        receipt_footer: Joi.string().trim().max(500).allow(null, '').optional().messages({
            'string.max': 'Receipt footer cannot exceed 500 characters'
        }),
        receipt_width: Joi.string().valid('58', '80').optional().messages({
            'any.only': 'Receipt width must be either 58 or 80'
        })
    }).min(1).messages({
        'object.min': 'At least one field must be provided to update settings'
    })
};

const VALID_CLEAR_TARGETS = [
    'ALL',
    'ORDERS',
    'SHIFTS',
    'EXPENSES',
    'DISCOUNT_CODES',
    'INVENTORY',
    'STOCK_MOVEMENTS',
    'RECIPES',
    'PRODUCTS',
    'CATEGORIES',
    'AUDIT_LOGS'
];

const clearDataTargetFields = {
    targets: Joi.alternatives().try(
        Joi.array().items(Joi.string().uppercase().valid(...VALID_CLEAR_TARGETS)).min(1),
        Joi.string().uppercase().valid(...VALID_CLEAR_TARGETS)
    ).optional().messages({
        'any.only': `Target must be one of: ${VALID_CLEAR_TARGETS.join(', ')}`,
        'array.min': 'At least one target must be specified'
    }),
    target: Joi.string().uppercase().valid(...VALID_CLEAR_TARGETS).optional().messages({
        'any.only': `Target must be one of: ${VALID_CLEAR_TARGETS.join(', ')}`
    })
};

const clearDataSchema = {
    body: Joi.object(clearDataTargetFields).optional(),
    query: Joi.object(clearDataTargetFields).optional()
};

module.exports = {
    updateSettingsSchema,
    clearDataSchema,
    VALID_CLEAR_TARGETS
};
