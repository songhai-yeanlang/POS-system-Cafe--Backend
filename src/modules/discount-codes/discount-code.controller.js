const discountCodeService = require('./discount-code.service');

const createDiscountCode = async (req, res, next) => {
    try {
        const ipAddress = req.ip || req.socket?.remoteAddress || null;
        const discountCode = await discountCodeService.createDiscountCode({
            user: req.user,
            data: req.body,
            ipAddress
        });

        res.status(201).json({
            success: true,
            message: 'Discount code created successfully',
            data: discountCode
        });
    } catch (error) {
        next(error);
    }
};

const getAllDiscountCodes = async (req, res, next) => {
    try {
        const result = await discountCodeService.getAllDiscountCodes({
            queryParams: req.query
        });

        res.status(200).json({
            success: true,
            message: 'Discount codes retrieved successfully',
            data: result.discountCodes,
            pagination: result.pagination
        });
    } catch (error) {
        next(error);
    }
};

const getDiscountCodeById = async (req, res, next) => {
    try {
        const discountCode = await discountCodeService.getDiscountCodeById({
            id: req.params.id
        });

        res.status(200).json({
            success: true,
            message: 'Discount code retrieved successfully',
            data: discountCode
        });
    } catch (error) {
        next(error);
    }
};

const updateDiscountCode = async (req, res, next) => {
    try {
        const ipAddress = req.ip || req.socket?.remoteAddress || null;
        const updated = await discountCodeService.updateDiscountCode({
            id: req.params.id,
            user: req.user,
            updateData: req.body,
            ipAddress
        });

        res.status(200).json({
            success: true,
            message: 'Discount code updated successfully',
            data: updated
        });
    } catch (error) {
        next(error);
    }
};

const deleteDiscountCode = async (req, res, next) => {
    try {
        const ipAddress = req.ip || req.socket?.remoteAddress || null;
        const deleted = await discountCodeService.deleteDiscountCode({
            id: req.params.id,
            user: req.user,
            ipAddress
        });

        res.status(200).json({
            success: true,
            message: 'Discount code deleted successfully',
            data: deleted
        });
    } catch (error) {
        next(error);
    }
};

const validateDiscountCode = async (req, res, next) => {
    try {
        const result = await discountCodeService.validateAndPreviewDiscountCode({
            code: req.body.code,
            subtotal: req.body.subtotal,
            orderId: req.body.order_id
        });

        res.status(200).json({
            success: true,
            message: 'Discount code is valid',
            data: result
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createDiscountCode,
    getAllDiscountCodes,
    getDiscountCodeById,
    updateDiscountCode,
    deleteDiscountCode,
    validateDiscountCode
};
