const express = require('express');
const router = express.Router();
const shiftController = require('./shift.controller');
const { 
    getCurrentShiftQuerySchema, 
    openShiftSchema,
    getShiftByIdSchema,
    closeShiftSchema,
    getAllShiftsQuerySchema
} = require('./shift.validation');
const { authenticate } = require('../../middlewares/authenticate');
const validate = require('../../middlewares/validate');


router.get('/shifts/current', authenticate, validate(getCurrentShiftQuerySchema), shiftController.getCurrentShift);
router.get('/shifts', authenticate, validate(getAllShiftsQuerySchema), shiftController.getAllShifts);
router.post('/shifts/open', authenticate, validate(openShiftSchema), shiftController.openShift);
router.get('/shifts/:id', authenticate, validate(getShiftByIdSchema), shiftController.getShiftById);
router.post('/shifts/:id/close', authenticate, validate(closeShiftSchema), shiftController.closeShift);

module.exports = router;