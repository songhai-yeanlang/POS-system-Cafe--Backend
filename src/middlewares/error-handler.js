const logger = require('../utils/logger.util');

const errorHandler = (err, req, res, next) => {
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Internal Server Error';
    let errors = err.errors || [];

    // 1. Handle Joi Validation Error
    if (err.isJoi || (err.name === 'ValidationError' && Array.isArray(err.details))) {
        statusCode = 400;
        message = 'Validation Error';
        errors = err.details.map((detail) => ({
            field: detail.path.join('.'),
            message: detail.message.replace(/['"]/g, '')
        }));
    }

    // 2. Handle Body Parser / JSON Syntax Error
    else if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        statusCode = 400;
        message = 'Invalid JSON payload format';
    }

    // 3. Handle JWT Errors
    else if (err.name === 'JsonWebTokenError') {
        statusCode = 401;
        message = 'Invalid authentication token';
    } else if (err.name === 'TokenExpiredError') {
        statusCode = 401;
        message = 'Authentication token has expired';
    }

    // 4. Handle Multer File Upload Errors
    else if (err.name === 'MulterError') {
        statusCode = 400;
        if (err.code === 'LIMIT_FILE_SIZE') {
            message = 'File size is too large for upload';
        } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            message = `Unexpected upload field: '${err.field}'`;
        } else {
            message = err.message;
        }
    }

    // 5. Handle MySQL Errors
    else if (err.code === 'ER_DUP_ENTRY') {
        statusCode = 409;
        message = 'Duplicate entry: Record already exists';
    } else if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW') {
        statusCode = 400;
        message = 'Invalid reference: Referenced record does not exist';
    } else if (err.code === 'ER_ROW_IS_REFERENCED_2') {
        statusCode = 400;
        message = 'Cannot delete or update: Record is currently in use by other data';
    } else if (err.code === 'ECONNREFUSED') {
        statusCode = 503;
        message = 'Database service unavailable';
    }

    // Logging based on severity
    if (statusCode >= 500) {
        logger.error(`[500 Server Error] ${req.method} ${req.originalUrl}:`, err.stack || err);
    } else {
        logger.error(`[${statusCode} Client Error] ${req.method} ${req.originalUrl} - ${message}`);
    }

    // Security: Hide internal error details in production
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction && statusCode >= 500) {
        message = 'Internal Server Error';
    }

    // Send formatted JSON response
    res.status(statusCode).json({
        success: false,
        message,
        ...(errors.length > 0 && { errors }),
        ...(!isProduction && { stack: err.stack })
    });
};

module.exports = errorHandler;