const Joi = require('joi');

const getDashboardReportSchema = {
    query: Joi.object({
        start_date: Joi.string().isoDate().allow(null, '').optional().messages({
            'string.isoDate': 'Start date must be a valid ISO date'
        }),
        end_date: Joi.string().isoDate().allow(null, '').optional().messages({
            'string.isoDate': 'End date must be a valid ISO date'
        }),
        shift_id: Joi.number().integer().positive().optional().messages({
            'number.positive': 'Shift ID must be a positive integer'
        })
    })
};

const getSalesTrendReportSchema = {
    query: Joi.object({
        start_date: Joi.string().isoDate().allow(null, '').optional().messages({
            'string.isoDate': 'Start date must be a valid ISO date'
        }),
        end_date: Joi.string().isoDate().allow(null, '').optional().messages({
            'string.isoDate': 'End date must be a valid ISO date'
        }),
        group_by: Joi.string().valid('hour', 'day', 'month').default('day').messages({
            'any.only': 'Group by must be one of: hour, day, month'
        })
    })
};

const getTopProductsReportSchema = {
    query: Joi.object({
        start_date: Joi.string().isoDate().allow(null, '').optional().messages({
            'string.isoDate': 'Start date must be a valid ISO date'
        }),
        end_date: Joi.string().isoDate().allow(null, '').optional().messages({
            'string.isoDate': 'End date must be a valid ISO date'
        }),
        category_id: Joi.number().integer().positive().optional().messages({
            'number.positive': 'Category ID must be a positive integer'
        }),
        limit: Joi.number().integer().min(1).max(100).default(10).messages({
            'number.min': 'Limit must be at least 1',
            'number.max': 'Limit cannot exceed 100'
        })
    })
};

const getCategoriesReportSchema = {
    query: Joi.object({
        start_date: Joi.string().isoDate().allow(null, '').optional().messages({
            'string.isoDate': 'Start date must be a valid ISO date'
        }),
        end_date: Joi.string().isoDate().allow(null, '').optional().messages({
            'string.isoDate': 'End date must be a valid ISO date'
        })
    })
};

const getPaymentMethodsReportSchema = {
    query: Joi.object({
        start_date: Joi.string().isoDate().allow(null, '').optional().messages({
            'string.isoDate': 'Start date must be a valid ISO date'
        }),
        end_date: Joi.string().isoDate().allow(null, '').optional().messages({
            'string.isoDate': 'End date must be a valid ISO date'
        }),
        shift_id: Joi.number().integer().positive().optional().messages({
            'number.positive': 'Shift ID must be a positive integer'
        })
    })
};

const getStaffPerformanceReportSchema = {
    query: Joi.object({
        start_date: Joi.string().isoDate().allow(null, '').optional().messages({
            'string.isoDate': 'Start date must be a valid ISO date'
        }),
        end_date: Joi.string().isoDate().allow(null, '').optional().messages({
            'string.isoDate': 'End date must be a valid ISO date'
        }),
        staff_id: Joi.number().integer().positive().optional().messages({
            'number.positive': 'Staff ID must be a positive integer'
        })
    })
};

const getInventoryUsageReportSchema = {
    query: Joi.object({
        start_date: Joi.string().isoDate().allow(null, '').optional().messages({
            'string.isoDate': 'Start date must be a valid ISO date'
        }),
        end_date: Joi.string().isoDate().allow(null, '').optional().messages({
            'string.isoDate': 'End date must be a valid ISO date'
        }),
        low_stock_only: Joi.boolean().optional()
    })
};

module.exports = {
    getDashboardReportSchema,
    getSalesTrendReportSchema,
    getTopProductsReportSchema,
    getCategoriesReportSchema,
    getPaymentMethodsReportSchema,
    getStaffPerformanceReportSchema,
    getInventoryUsageReportSchema
};
