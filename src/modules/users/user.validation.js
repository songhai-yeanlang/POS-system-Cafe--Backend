const Joi = require('joi');

const getUsersQuerySchema = {
    query: Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        role: Joi.string().valid('OWNER', 'STAFF').optional(),
        is_active: Joi.boolean().optional(),
        search: Joi.string().trim().max(100).optional()
    })
};

const createUserSchema = {
    body: Joi.object({
        name: Joi.string().trim().min(2).max(150).required().messages({
            'string.empty': 'Name is required',
            'string.min': 'Name must be at least 2 characters',
            'string.max': 'Name cannot exceed 150 characters',
            'any.required': 'Name is required'
        }),
        email: Joi.string().trim().lowercase().email().required().messages({
            'string.empty': 'Email is required',
            'string.email': 'Invalid email format',
            'any.required': 'Email is required'
        }),
        password: Joi.string().min(6).required().messages({
            'string.empty': 'Password is required',
            'string.min': 'Password must be at least 6 characters',
            'any.required': 'Password is required'
        }),
        role: Joi.string().valid('OWNER', 'STAFF').default('STAFF').messages({
            'any.only': 'Role must be either OWNER or STAFF'
        }),
        is_active: Joi.boolean().default(true)
    })
};

const getUserByIdSchema = {
    params: Joi.object({
        id: Joi.number().integer().positive().required().messages({
            'number.base': 'User ID must be a number',
            'number.integer': 'User ID must be an integer',
            'number.positive': 'User ID must be a positive number',
            'any.required': 'User ID is required'
        })
    })
};

const updateUserSchema = {
    params: Joi.object({
        id: Joi.number().integer().positive().required().messages({
            'number.base': 'User ID must be a number',
            'number.integer': 'User ID must be an integer',
            'number.positive': 'User ID must be a positive number',
            'any.required': 'User ID is required'
        })
    }),
    body: Joi.object({
        name: Joi.string().trim().min(2).max(150).optional().messages({
            'string.empty': 'Name cannot be empty',
            'string.min': 'Name must be at least 2 characters',
            'string.max': 'Name cannot exceed 150 characters'
        }),
        email: Joi.string().trim().lowercase().email().optional().messages({
            'string.empty': 'Email cannot be empty',
            'string.email': 'Invalid email format'
        }),
        password: Joi.string().min(6).optional().messages({
            'string.empty': 'Password cannot be empty',
            'string.min': 'Password must be at least 6 characters'
        }),
        role: Joi.string().valid('OWNER', 'STAFF').optional().messages({
            'any.only': 'Role must be either OWNER or STAFF'
        }),
        is_active: Joi.boolean().optional()
    }).min(1).messages({
        'object.min': 'At least one field (name, email, password, role, is_active) must be provided to update'
    })
};

const deleteUserSchema = getUserByIdSchema;

module.exports = {
    getUsersQuerySchema,
    createUserSchema,
    getUserByIdSchema,
    updateUserSchema,
    deleteUserSchema
};
