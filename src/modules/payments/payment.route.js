const express = require('express');
const router = express.Router();
const paymentController = require('./payment.controller');
const {
    processPaymentSchema,
    getPaymentsQuerySchema,
    getPaymentByIdSchema,
    getPaymentByOrderIdSchema,
    processRefundSchema,
    getRefundsQuerySchema,
    getRefundByIdSchema
} = require('./payment.validation');
const { authenticate } = require('../../middlewares/authenticate');
const validate = require('../../middlewares/validate');


// Payments Endpoints
router.get('/payments', authenticate, validate(getPaymentsQuerySchema), paymentController.getAllPayments);
router.post('/payments', authenticate, validate(processPaymentSchema), paymentController.processPayment);
router.get('/payments/order/:orderId', authenticate, validate(getPaymentByOrderIdSchema), paymentController.getPaymentByOrderId);
router.get('/payments/:id', authenticate, validate(getPaymentByIdSchema), paymentController.getPaymentById);

// Refunds Endpoints
router.get('/refunds', authenticate, validate(getRefundsQuerySchema), paymentController.getAllRefunds);
router.post('/refunds', authenticate, validate(processRefundSchema), paymentController.processRefund);
router.get('/refunds/:id', authenticate, validate(getRefundByIdSchema), paymentController.getRefundById);
router.post('/payments/:id/refund', authenticate, validate(processRefundSchema), paymentController.processRefund);

module.exports = router;