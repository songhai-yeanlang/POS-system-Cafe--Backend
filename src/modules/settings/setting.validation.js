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
        logo: Joi.string().trim().max(500).allow(null, '').optional().messages({
            'string.max': 'Logo URL/path cannot exceed 500 characters'
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

module.exports = {
    updateSettingsSchema
};
