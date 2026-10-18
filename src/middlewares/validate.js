const ApiError = require('../utils/api-error');

const validate = (schema) => (req, res, next) => {
    const validSections = ['body', 'query', 'params'];
    const errors = [];

    validSections.forEach((section) => {
        if (schema[section]) {
            const { error, value } = schema[section].validate(req[section], {
                abortEarly: false,
                stripUnknown: true
            });

            if (error) {
                error.details.forEach((detail) => {
                    errors.push({
                        field: detail.path.join('.'),
                        message: detail.message.replace(/['"]/g, '')
                    });
                });
            } else {
                req[section] = value;
            }
        }
    });

    if (errors.length > 0) {
        return next(new ApiError(400, 'Validation Error', errors));
    }

    next();
};

module.exports = validate;
