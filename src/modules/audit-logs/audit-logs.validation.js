const Joi = require('joi');

const getAuditLogsSchema = {
    query: Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        user_id: Joi.number().integer().positive().optional(),
        action: Joi.string().trim().max(100).optional(),
        table_name: Joi.string().trim().max(64).optional(),
        start_date: Joi.date().iso().optional(),
        end_date: Joi.date().iso().optional()
    })
};

const getAuditLogByIdSchema = {
    params: Joi.object({
        id: Joi.number().integer().positive().required().messages({
            'number.base': 'Audit log ID must be a number',
            'number.integer': 'Audit log ID must be an integer',
            'number.positive': 'Audit log ID must be a positive number',
            'any.required': 'Audit log ID is required'
        })
    })
};

module.exports = {
    getAuditLogsSchema,
    getAuditLogByIdSchema
};
