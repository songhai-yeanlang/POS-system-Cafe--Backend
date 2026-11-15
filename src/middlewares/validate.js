const ApiError = require('../utils/api-error');

const validate = (schema) => (req, res, next) => {
    const validSections = ['body', 'query', 'params'];
    const errors = [];

    validSections.forEach((section) => {
        if (schema[section]) {
            let input = req[section];

            // For query parameters, ignore empty/whitespace-only strings (e.g. ?role=&search=)
            // so optional filters and default values work properly
            if (section === 'query' && input && typeof input === 'object') {
                input = {};
                for (const [key, val] of Object.entries(req.query)) {
                    if (typeof val === 'string' && val.trim() === '') {
                        continue;
                    }
                    input[key] = val;
                }
            }

            const { error, value } = schema[section].validate(input, {
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
            } else if (section === 'query') {
                // Express 5 defines req.query as a getter-only property on IncomingMessage.prototype
                Object.defineProperty(req, 'query', {
                    value,
                    writable: true,
                    enumerable: true,
                    configurable: true
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
