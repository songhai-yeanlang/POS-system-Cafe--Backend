const expensesService = require('./expense.service');

const createExpense = async (req, res, next) => {
    try {
        const ipAddress = req.ip || req.socket?.remoteAddress || null;
        const expense = await expensesService.createExpense({
            user: req.user,
            expenseData: req.body,
            ipAddress
        });

        res.status(201).json({
            success: true,
            message: 'Expense created successfully',
            data: expense
        });
    } catch (error) {
        next(error);
    }
};

const getExpenseById = async (req, res, next) => {
    try {
        const expense = await expensesService.getExpenseById({
            id: req.params.id
        });

        res.status(200).json({
            success: true,
            message: 'Expense retrieved successfully',
            data: expense
        });
    } catch (error) {
        next(error);
    }
};

const getAllExpenses = async (req, res, next) => {
    try {
        const result = await expensesService.getAllExpenses({
            queryParams: req.query
        });

        res.status(200).json({
            success: true,
            message: 'Expenses retrieved successfully',
            data: result.expenses,
            pagination: result.pagination
        });
    } catch (error) {
        next(error);
    }
};

const updateExpense = async (req, res, next) => {
    try {
        const ipAddress = req.ip || req.socket?.remoteAddress || null;
        const updated = await expensesService.updateExpense({
            id: req.params.id,
            user: req.user,
            updateData: req.body,
            ipAddress
        });

        res.status(200).json({
            success: true,
            message: 'Expense updated successfully',
            data: updated
        });
    } catch (error) {
        next(error);
    }
};

const voidExpense = async (req, res, next) => {
    try {
        const ipAddress = req.ip || req.socket?.remoteAddress || null;
        const voided = await expensesService.voidExpense({
            id: req.params.id,
            user: req.user,
            voidReason: req.body.void_reason,
            ipAddress
        });

        res.status(200).json({
            success: true,
            message: 'Expense voided successfully',
            data: voided
        });
    } catch (error) {
        next(error);
    }
};

const getExpenseSummary = async (req, res, next) => {
    try {
        const summary = await expensesService.getExpenseSummary({
            queryParams: req.query
        });

        res.status(200).json({
            success: true,
            message: 'Expense summary retrieved successfully',
            data: summary
        });
    } catch (error) {
        next(error);
    }
};

const getCategories = async (req, res, next) => {
    try {
        const categories = expensesService.getCategories();
        res.status(200).json({
            success: true,
            message: 'Expense categories retrieved successfully',
            data: categories
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createExpense,
    getExpenseById,
    getAllExpenses,
    updateExpense,
    voidExpense,
    getExpenseSummary,
    getCategories
};
