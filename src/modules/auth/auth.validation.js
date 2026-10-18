const Joi = require('joi');

const loginSchema = {
    body: Joi.object({
        email: Joi.string().email().required().messages({
            'string.empty': 'Email is required',
            'string.email': 'Invalid email format',
            'any.required': 'Email is required'
        }),
        password: Joi.string().min(6).required().messages({
            'string.empty': 'Password is required',
            'string.min': 'Password must be at least 6 characters',
            'any.required': 'Password is required'
        })
    })
};

module.exports = {
    loginSchema
};
