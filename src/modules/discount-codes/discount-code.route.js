const express = require('express');
const router = express.Router();
const discountCodeController = require('./discount-code.controller');
const {
    createDiscountCodeSchema,
    updateDiscountCodeSchema,
    getDiscountCodeByIdSchema,
    deleteDiscountCodeSchema,
    getDiscountCodesQuerySchema,
    validateDiscountCodeSchema
} = require('./discount-code.validation');
const { authenticate, authorize } = require('../../middlewares/authenticate');
const validate = require('../../middlewares/validate');


router.post('/discount-codes/validate', authenticate, validate(validateDiscountCodeSchema), discountCodeController.validateDiscountCode);
router.get('/discount-codes', authenticate, validate(getDiscountCodesQuerySchema), discountCodeController.getAllDiscountCodes);
router.get('/discount-codes/:id', authenticate, validate(getDiscountCodeByIdSchema), discountCodeController.getDiscountCodeById);
router.post('/discount-codes',authenticate,authorize('OWNER'),validate(createDiscountCodeSchema),discountCodeController.createDiscountCode);
router.put('/discount-codes/:id',authenticate,authorize('OWNER'), validate(updateDiscountCodeSchema), discountCodeController.updateDiscountCode);
router.delete('/discount-codes/:id', authenticate, authorize('OWNER'), validate(deleteDiscountCodeSchema), discountCodeController.deleteDiscountCode);

module.exports = router;
