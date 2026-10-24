const paymentService = require('./payment.service');

const processPayment = async (req, res, next) => {
    try {
        const ipAddress = req.ip || req.socket?.remoteAddress || null;
        const payment = await paymentService.processPayment({
            user: req.user,
            paymentData: req.body,
            ipAddress
        });

        res.status(201).json({
            success: true,
            message: 'Payment processed successfully',
            data: payment
        });
    } catch (error) {
        next(error);
    }
};

const getPaymentById = async (req, res, next) => {
    try {
        const payment = await paymentService.getPaymentById({
            paymentId: req.params.id,
            user: req.user
        });

        res.status(200).json({
            success: true,
            message: 'Payment retrieved successfully',
            data: payment
        });
    } catch (error) {
        next(error);
    }
};

const getPaymentByOrderId = async (req, res, next) => {
    try {
        const payment = await paymentService.getPaymentByOrderId({
            orderId: req.params.orderId,
            user: req.user
        });

        res.status(200).json({
            success: true,
            message: 'Payment for order retrieved successfully',
            data: payment
        });
    } catch (error) {
        next(error);
    }
};

const getAllPayments = async (req, res, next) => {
    try {
        const result = await paymentService.getAllPayments({
            queryParams: req.query,
            user: req.user
        });

        res.status(200).json({
            success: true,
            message: 'Payments retrieved successfully',
            data: result.payments,
            pagination: result.pagination
        });
    } catch (error) {
        next(error);
    }
};

const processRefund = async (req, res, next) => {
    try {
        const ipAddress = req.ip || req.socket?.remoteAddress || null;
        const refund = await paymentService.processRefund({
            user: req.user,
            refundData: req.body,
            paymentIdParam: req.params.id,
            ipAddress
        });

        res.status(201).json({
            success: true,
            message: 'Refund processed successfully',
            data: refund
        });
    } catch (error) {
        next(error);
    }
};

const getRefundById = async (req, res, next) => {
    try {
        const refund = await paymentService.getRefundById({
            refundId: req.params.id,
            user: req.user
        });

        res.status(200).json({
            success: true,
            message: 'Refund retrieved successfully',
            data: refund
        });
    } catch (error) {
        next(error);
    }
};

const getAllRefunds = async (req, res, next) => {
    try {
        const result = await paymentService.getAllRefunds({
            queryParams: req.query,
            user: req.user
        });

        res.status(200).json({
            success: true,
            message: 'Refunds retrieved successfully',
            data: result.refunds,
            pagination: result.pagination
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    processPayment,
    getPaymentById,
    getPaymentByOrderId,
    getAllPayments,
    processRefund,
    getRefundById,
    getAllRefunds
};
