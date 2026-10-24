const expensesModel = require('./expense.model');
const shiftModel = require('../shifts/shift.model');
const auditLogsModel = require('../audit-logs/audit-logs.model');
const ApiError = require('../../utils/api-error');

const DEFAULT_EXPENSE_CATEGORIES = [
    'INGREDIENTS',
    'SUPPLIES',
    'UTILITIES',
    'MAINTENANCE',
    'SALARY',
    'MARKETING',
    'RENT',
    'EQUIPMENT',
    'OTHER'
];

const createExpense = async ({ user, expenseData, ipAddress }) => {
    const paymentMethod = expenseData.payment_method;
    const currency = expenseData.currency || 'USD';
    const amount = Number(expenseData.amount);

    if (amount <= 0) {
        throw ApiError.badRequest('Expense amount must be greater than 0');
    }

    // 1. Resolve Shift ID (Crucial for CASH payments & chk_expenses_cash_shift)
    let resolvedShiftId = null;

    if (paymentMethod === 'CASH') {
        if (expenseData.shift_id) {
            const specifiedShift = await shiftModel.findShiftById(expenseData.shift_id);
            if (!specifiedShift) {
                throw ApiError.notFound(`Shift #${expenseData.shift_id} not found`);
            }
            if (specifiedShift.status === 'CLOSED') {
                throw ApiError.badRequest('Cannot record a CASH expense against a closed shift');
            }
            resolvedShiftId = specifiedShift.id;
        } else {
            // Find current active shift for this user
            let activeShift = await shiftModel.findActiveShiftByUserId(user.id);
            if (!activeShift && user.role === 'OWNER') {
                const openShifts = await shiftModel.findAllShifts({ status: 'OPEN', limit: 1 });
                if (openShifts && openShifts.length > 0) {
                    activeShift = openShifts[0];
                }
            }
            if (!activeShift) {
                throw ApiError.badRequest(
                    'A cashier active open shift is required to record a CASH expense so it can be deducted from the drawer. Please open a shift first.'
                );
            }
            resolvedShiftId = activeShift.id;
        }
    } else {
        // KHQR or BANK_TRANSFER: shift_id is optional
        if (expenseData.shift_id) {
            const specifiedShift = await shiftModel.findShiftById(expenseData.shift_id);
            if (!specifiedShift) {
                throw ApiError.notFound(`Shift #${expenseData.shift_id} not found`);
            }
            resolvedShiftId = specifiedShift.id;
        }
    }

    // 2. Fetch Exchange Rate from Settings
    const settings = await expensesModel.getShopSettings();
    const exchangeRate = currency === 'USD' ? 1.0 : (Number(settings.exchange_rate) || 4100);

    // 3. Insert Expense Record
    const createdId = await expensesModel.insertExpense({
        shiftId: resolvedShiftId,
        category: expenseData.category.trim(),
        description: expenseData.description.trim(),
        paymentMethod,
        currency,
        amount,
        exchangeRate,
        createdBy: user.id,
        incurredAt: expenseData.incurred_at || null
    });

    // 4. Audit Log
    try {
        await auditLogsModel.insertAuditLog({
            userId: user.id,
            action: 'CREATE_EXPENSE',
            tableName: 'expenses',
            recordId: createdId,
            details: {
                category: expenseData.category.trim(),
                description: expenseData.description.trim(),
                payment_method: paymentMethod,
                currency,
                amount,
                shift_id: resolvedShiftId
            },
            ipAddress
        });
    } catch (err) {
        console.error('Failed to log audit for createExpense:', err.message);
    }

    // 5. Return complete record
    return await expensesModel.findExpenseById(createdId);
};

const getExpenseById = async ({ id }) => {
    const expense = await expensesModel.findExpenseById(id);
    if (!expense) {
        throw ApiError.notFound(`Expense #${id} not found`);
    }
    return expense;
};

const getAllExpenses = async ({ queryParams = {} }) => {
    const page = Math.max(1, Number(queryParams.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(queryParams.limit) || 20));
    const offset = (page - 1) * limit;

    let adjustedEndDate = queryParams.end_date;
    if (adjustedEndDate) {
        const d = new Date(adjustedEndDate);
        if (!isNaN(d.getTime())) {
            d.setHours(23, 59, 59, 999);
            adjustedEndDate = d;
        }
    }

    const filters = {
        shiftId: queryParams.shift_id ? Number(queryParams.shift_id) : undefined,
        category: queryParams.category,
        paymentMethod: queryParams.payment_method,
        currency: queryParams.currency,
        status: queryParams.status,
        createdBy: queryParams.created_by ? Number(queryParams.created_by) : undefined,
        startDate: queryParams.start_date,
        endDate: adjustedEndDate,
        search: queryParams.search,
        limit,
        offset
    };

    const [expenses, totalItems] = await Promise.all([
        expensesModel.findAllExpenses(filters),
        expensesModel.countAllExpenses(filters)
    ]);

    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {
        expenses,
        pagination: {
            total_items: totalItems,
            total_pages: totalPages,
            current_page: page,
            limit
        }
    };
};

const updateExpense = async ({ id, user, updateData, ipAddress }) => {
    const existing = await expensesModel.findExpenseById(id);
    if (!existing) {
        throw ApiError.notFound(`Expense #${id} not found`);
    }

    if (existing.status !== 'ACTIVE') {
        throw ApiError.badRequest('Cannot update an expense that has been VOIDED');
    }

    // Authorization: OWNER can update any; STAFF can only update their own if shift is open
    if (user.role !== 'OWNER') {
        if (Number(existing.created_by) !== Number(user.id)) {
            throw ApiError.forbidden('You can only update expenses created by yourself');
        }
        if (existing.shift_id) {
            const shift = await shiftModel.findShiftById(existing.shift_id);
            if (shift && shift.status === 'CLOSED') {
                throw ApiError.badRequest('Cannot edit an expense belonging to a closed shift');
            }
        }
    }

    const fieldsToUpdate = {};

    if (updateData.category !== undefined) {
        fieldsToUpdate.category = updateData.category.trim();
    }
    if (updateData.description !== undefined) {
        fieldsToUpdate.description = updateData.description.trim();
    }
    if (updateData.incurred_at !== undefined) {
        fieldsToUpdate.incurredAt = updateData.incurred_at;
    }

    const nextPaymentMethod = updateData.payment_method || existing.payment_method;
    const nextCurrency = updateData.currency || existing.currency;

    if (updateData.payment_method !== undefined) {
        fieldsToUpdate.paymentMethod = updateData.payment_method;
        if (nextPaymentMethod === 'CASH' && !existing.shift_id) {
            const activeShift = await shiftModel.findActiveShiftByUserId(user.id);
            if (!activeShift) {
                throw ApiError.badRequest('Changing to CASH requires an active open shift');
            }
            fieldsToUpdate.shiftId = activeShift.id;
        }
    }

    if (updateData.amount !== undefined) {
        const nextAmount = Number(updateData.amount);
        if (nextAmount <= 0) {
            throw ApiError.badRequest('Amount must be greater than 0');
        }
        fieldsToUpdate.amount = nextAmount;
    }

    if (updateData.currency !== undefined) {
        fieldsToUpdate.currency = updateData.currency;
        const settings = await expensesModel.getShopSettings();
        fieldsToUpdate.exchangeRate = nextCurrency === 'USD' ? 1.0 : (Number(settings.exchange_rate) || 4100);
    }

    await expensesModel.updateExpenseById(id, fieldsToUpdate);

    // Audit Log
    try {
        await auditLogsModel.insertAuditLog({
            userId: user.id,
            action: 'UPDATE_EXPENSE',
            tableName: 'expenses',
            recordId: id,
            details: fieldsToUpdate,
            ipAddress
        });
    } catch (err) {
        console.error('Failed to log audit for updateExpense:', err.message);
    }

    return await expensesModel.findExpenseById(id);
};

const voidExpense = async ({ id, user, voidReason, ipAddress }) => {
    const existing = await expensesModel.findExpenseById(id);
    if (!existing) {
        throw ApiError.notFound(`Expense #${id} not found`);
    }

    if (existing.status === 'VOIDED') {
        throw ApiError.badRequest(`Expense #${id} is already VOIDED`);
    }

    // Role check: OWNER can void; STAFF can only void their own if shift is open
    if (user.role !== 'OWNER') {
        if (Number(existing.created_by) !== Number(user.id)) {
            throw ApiError.forbidden('You can only void expenses created by yourself. OWNER can void any expense.');
        }
        if (existing.shift_id) {
            const shift = await shiftModel.findShiftById(existing.shift_id);
            if (shift && shift.status === 'CLOSED') {
                throw ApiError.badRequest('Cannot void an expense belonging to a closed shift. Please contact an OWNER.');
            }
        }
    }

    const cleanReason = voidReason ? voidReason.trim() : '';
    if (!cleanReason) {
        throw ApiError.badRequest('Void reason is required and cannot be empty');
    }

    await expensesModel.voidExpenseById({
        id,
        voidedBy: user.id,
        voidReason: cleanReason
    });

    // Audit Log
    try {
        await auditLogsModel.insertAuditLog({
            userId: user.id,
            action: 'VOID_EXPENSE',
            tableName: 'expenses',
            recordId: id,
            details: {
                previous_amount: existing.amount,
                currency: existing.currency,
                category: existing.category,
                void_reason: cleanReason
            },
            ipAddress
        });
    } catch (err) {
        console.error('Failed to log audit for voidExpense:', err.message);
    }

    return await expensesModel.findExpenseById(id);
};

const getExpenseSummary = async ({ queryParams = {} }) => {
    let adjustedEndDate = queryParams.end_date;
    if (adjustedEndDate) {
        const d = new Date(adjustedEndDate);
        if (!isNaN(d.getTime())) {
            d.setHours(23, 59, 59, 999);
            adjustedEndDate = d;
        }
    }

    const breakdown = await expensesModel.getExpenseSummary({
        startDate: queryParams.start_date,
        endDate: adjustedEndDate,
        shiftId: queryParams.shift_id ? Number(queryParams.shift_id) : undefined
    });

    let totalUsd = 0;
    let totalKhr = 0;
    let cashUsd = 0;
    let cashKhr = 0;
    let totalEquivalentUsd = 0;

    for (const row of breakdown) {
        const amt = Number(row.total_amount);
        if (row.currency === 'USD') {
            totalUsd += amt;
            if (row.payment_method === 'CASH') {
                cashUsd += amt;
            }
        } else if (row.currency === 'KHR') {
            totalKhr += amt;
            if (row.payment_method === 'CASH') {
                cashKhr += amt;
            }
        }
        totalEquivalentUsd += Number(row.total_amount_usd);
    }

    return {
        breakdown,
        totals: {
            total_usd: Number(totalUsd.toFixed(2)),
            total_khr: Math.round(totalKhr),
            cash_usd: Number(cashUsd.toFixed(2)),
            cash_khr: Math.round(cashKhr),
            total_equivalent_usd: Number(totalEquivalentUsd.toFixed(2))
        }
    };
};

const getCategories = () => {
    return DEFAULT_EXPENSE_CATEGORIES;
};

module.exports = {
    DEFAULT_EXPENSE_CATEGORIES,
    createExpense,
    getExpenseById,
    getAllExpenses,
    updateExpense,
    voidExpense,
    getExpenseSummary,
    getCategories
};
