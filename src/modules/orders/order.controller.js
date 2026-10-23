const orderService = require('./order.service');

const createOrder = async (req, res, next) => {
    try {
        const ipAddress = req.ip || req.socket?.remoteAddress || null;
        const order = await orderService.createOrder({
            user: req.user,
            orderData: req.body,
            ipAddress
        });

        res.status(201).json({
            success: true,
            message: 'Order created successfully',
            data: order
        });
    } catch (error) {
        next(error);
    }
};

const getOrderById = async (req, res, next) => {
    try {
        const order = await orderService.getOrderById({
            orderId: req.params.id,
            user: req.user
        });

        res.status(200).json({
            success: true,
            message: 'Order retrieved successfully',
            data: order
        });
    } catch (error) {
        next(error);
    }
};

const getAllOrders = async (req, res, next) => {
    try {
        const result = await orderService.getAllOrders({
            user: req.user,
            queryParams: req.query
        });

        res.status(200).json({
            success: true,
            message: 'Orders retrieved successfully',
            data: result.orders,
            pagination: result.pagination
        });
    } catch (error) {
        next(error);
    }
};

const updateOrder = async (req, res, next) => {
    try {
        const ipAddress = req.ip || req.socket?.remoteAddress || null;
        const updatedOrder = await orderService.updateOrder({
            orderId: req.params.id,
            user: req.user,
            orderData: req.body,
            ipAddress
        });

        res.status(200).json({
            success: true,
            message: 'Order updated successfully',
            data: updatedOrder
        });
    } catch (error) {
        next(error);
    }
};

const cancelOrder = async (req, res, next) => {
    try {
        const ipAddress = req.ip || req.socket?.remoteAddress || null;
        const cancelledOrder = await orderService.cancelOrder({
            orderId: req.params.id,
            user: req.user,
            reason: req.body.reason,
            ipAddress
        });

        res.status(200).json({
            success: true,
            message: 'Order cancelled successfully',
            data: cancelledOrder
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createOrder,
    getOrderById,
    getAllOrders,
    updateOrder,
    cancelOrder
};
