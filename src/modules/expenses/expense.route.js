const express = require('express');
const router = express.Router();
const expensesController = require('./expense.controller');
const {
    createExpenseSchema,
    updateExpenseSchema,
    getExpenseByIdSchema,
    getExpensesQuerySchema,
    voidExpenseSchema,
    getExpenseSummaryQuerySchema
} = require('./expense.validation');
const { authenticate } = require('../../middlewares/authenticate');
const validate = require('../../middlewares/validate');


router.get('/expenses', authenticate, validate(getExpensesQuerySchema), expensesController.getAllExpenses);
router.post('/expenses', authenticate, validate(createExpenseSchema), expensesController.createExpense);
router.get('/expenses/summary', authenticate, validate(getExpenseSummaryQuerySchema), expensesController.getExpenseSummary);
router.get('/expenses/categories', authenticate, expensesController.getCategories);
router.get('/expenses/:id', authenticate, validate(getExpenseByIdSchema), expensesController.getExpenseById);
router.put('/expenses/:id', authenticate, validate(updateExpenseSchema), expensesController.updateExpense);
router.post('/expenses/:id/void', authenticate, validate(voidExpenseSchema), expensesController.voidExpense);

module.exports = router;
