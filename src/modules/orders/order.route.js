const express = require('express');
const router = express.Router();
const orderController = require('./order.controller');
const { 
    createOrderSchema,
    getOrderByIdSchema,
    getAllOrdersQuerySchema,
    updateOrderSchema,
    cancelOrderSchema
} = require('./order.validation');
const { authenticate } = require('../../middlewares/authenticate');
const validate = require('../../middlewares/validate');

router.get('/orders', authenticate, validate(getAllOrdersQuerySchema), orderController.getAllOrders);
router.post('/orders', authenticate, validate(createOrderSchema), orderController.createOrder);
router.get('/orders/:id', authenticate, validate(getOrderByIdSchema), orderController.getOrderById);
router.put('/orders/:id', authenticate, validate(updateOrderSchema), orderController.updateOrder);
router.post('/orders/:id/cancel', authenticate, validate(cancelOrderSchema), orderController.cancelOrder);

module.exports = router;