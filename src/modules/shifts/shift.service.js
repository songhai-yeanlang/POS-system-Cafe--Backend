const shiftModel = require('./shift.model');
const auditLogsModel = require('../audit-logs/audit-logs.model');
const ApiError = require('../../utils/api-error');

const calculateExpectedDrawer = (shift, rawSummary) => {
    let cashUsdIn = 0;
    let cashKhrIn = 0;
    let cashUsdChange = 0;
    let cashKhrChange = 0;
    let bankTransferUsd = 0;
    let bankTransferKhr = 0;
    let khqrUsd = 0;
    let khqrKhr = 0;

    for (const p of rawSummary.payments) {
        cashUsdChange += p.total_change_usd || 0;
        cashKhrChange += p.total_change_khr || 0;

        if (p.method === 'CASH') {
            const cashReceived = (p.total_received_amount !== undefined && p.total_received_amount !== null)
                ? p.total_received_amount
                : p.total_amount;
            if (p.currency === 'USD') cashUsdIn += cashReceived;
            if (p.currency === 'KHR') cashKhrIn += cashReceived;
        } else if (p.method === 'BANK_TRANSFER') {
            if (p.currency === 'USD') bankTransferUsd += p.total_amount;
            if (p.currency === 'KHR') bankTransferKhr += p.total_amount;
        } else if (p.method === 'KHQR') {
            if (p.currency === 'USD') khqrUsd += p.total_amount;
            if (p.currency === 'KHR') khqrKhr += p.total_amount;
        }
    }

    let cashExpensesUsd = 0;
    let cashExpensesKhr = 0;
    for (const e of rawSummary.expenses) {
        if (e.payment_method === 'CASH') {
            if (e.currency === 'USD') cashExpensesUsd += e.total_amount;
            if (e.currency === 'KHR') cashExpensesKhr += e.total_amount;
        }
    }

    let cashRefundsUsd = 0;
    let cashRefundsKhr = 0;
    for (const r of rawSummary.refunds) {
        if (r.method === 'CASH') {
            if (r.currency === 'USD') cashRefundsUsd += r.total_amount;
            if (r.currency === 'KHR') cashRefundsKhr += r.total_amount;
        }
    }

    const netCashUsd = Math.round((cashUsdIn - cashUsdChange) * 100) / 100;
    const netCashKhr = Math.round((cashKhrIn - cashKhrChange) * 100) / 100;

    const expectedCashUsd = Math.max(0, Math.round((shift.opening_cash_usd + netCashUsd - cashExpensesUsd - cashRefundsUsd) * 100) / 100);
    const expectedCashKhr = Math.max(0, Math.round((shift.opening_cash_khr + netCashKhr - cashExpensesKhr - cashRefundsKhr) * 100) / 100);

    return {
        cashUsdIn,
        cashKhrIn,
        cashUsdChange,
        cashKhrChange,
        netCashUsd,
        netCashKhr,
        khqrUsd,
        khqrKhr,
        bankTransferUsd,
        bankTransferKhr,
        cashExpensesUsd,
        cashExpensesKhr,
        cashRefundsUsd,
        cashRefundsKhr,
        expectedCashUsd,
        expectedCashKhr
    };
};

const buildShiftDetails = (shift, rawSummary) => {
    const calc = calculateExpectedDrawer(shift, rawSummary);

    let discrepancy = null;
    if (shift.status === 'CLOSED' && shift.closing_cash_usd !== null && shift.expected_cash_usd !== null) {
        const diffUsd = Math.round((shift.closing_cash_usd - shift.expected_cash_usd) * 100) / 100;
        const diffKhr = Math.round((shift.closing_cash_khr - shift.expected_cash_khr) * 100) / 100;
        discrepancy = {
            difference_usd: diffUsd,
            difference_khr: diffKhr,
            status_usd: diffUsd === 0 ? 'EXACT' : (diffUsd > 0 ? 'OVER' : 'SHORT'),
            status_khr: diffKhr === 0 ? 'EXACT' : (diffKhr > 0 ? 'OVER' : 'SHORT')
        };
    }

    return {
        ...shift,
        summary: {
            total_orders: Number(rawSummary.orders.paid_orders_count ?? rawSummary.orders.total_orders ?? 0),
            open_orders_count: Number(rawSummary.orders.open_orders_count || 0),
            cancelled_orders_count: Number(rawSummary.orders.cancelled_orders_count || 0),
            total_sales_usd: Number(rawSummary.orders.total_sales_usd || 0),
            cash: {
                in_usd: calc.cashUsdIn,
                change_usd: calc.cashUsdChange,
                net_usd: calc.netCashUsd,
                in_khr: calc.cashKhrIn,
                change_khr: calc.cashKhrChange,
                net_khr: calc.netCashKhr
            },
            bank_transfer: {
                usd: calc.bankTransferUsd,
                khr: calc.bankTransferKhr
            },
            khqr: {
                usd: calc.khqrUsd,
                khr: calc.khqrKhr
            },
            expenses: {
                cash_usd: calc.cashExpensesUsd,
                cash_khr: calc.cashExpensesKhr
            },
            refunds: {
                cash_usd: calc.cashRefundsUsd,
                cash_khr: calc.cashRefundsKhr
            },
            expected_drawer: {
                cash_usd: shift.status === 'CLOSED' && shift.expected_cash_usd !== null ? shift.expected_cash_usd : calc.expectedCashUsd,
                cash_khr: shift.status === 'CLOSED' && shift.expected_cash_khr !== null ? shift.expected_cash_khr : calc.expectedCashKhr
            },
            discrepancy
        }
    };
};

const getCurrentShift = async ({ user, targetUserId }) => {
    // 1. Determine which user's shift to look up
    let userId = user.id;
    if (targetUserId) {
        if (user.role !== 'OWNER' && Number(targetUserId) !== user.id) {
            throw ApiError.forbidden('You are not authorized to view other staff members active shifts');
        }
        userId = Number(targetUserId);
    }

    // 2. Fetch active shift from database
    const shift = await shiftModel.findActiveShiftByUserId(userId);
    if (!shift) {
        return null;
    }

    // 3. Calculate live sales, payments, expenses, and expected cash drawer
    const rawSummary = await shiftModel.calculateShiftSummary(shift.id);
    return buildShiftDetails(shift, rawSummary);
};

const getShiftById = async ({ shiftId, user }) => {
    const shift = await shiftModel.findShiftById(shiftId);
    if (!shift) {
        throw ApiError.notFound('Shift not found');
    }

    // Role check: Only OWNER or the shift creator can view shift details
    if (user.role !== 'OWNER' && Number(shift.user_id) !== Number(user.id)) {
        throw ApiError.forbidden('You are not authorized to view this shift');
    }

    const rawSummary = await shiftModel.calculateShiftSummary(shift.id);
    return buildShiftDetails(shift, rawSummary);
};

const openShift = async ({ userId, opening_cash_usd = 0, opening_cash_khr = 0, note = null, ipAddress }) => {
    // 1. Check if user already has an active open shift
    const existing = await shiftModel.findActiveShiftByUserId(userId);
    if (existing) {
        throw ApiError.conflict('You already have an active open shift. Please close your current shift before opening a new one.');
    }

    const openingCashUsd = Number(opening_cash_usd) || 0;
    const openingCashKhr = Number(opening_cash_khr) || 0;
    const cleanNote = note ? note.trim() : null;

    // 2. Insert shift record
    let shiftId;
    try {
        shiftId = await shiftModel.insertShift({
            userId,
            openingCashUsd,
            openingCashKhr,
            note: cleanNote
        });
    } catch (error) {
        if (error.errno === 1062) {
            throw ApiError.conflict('You already have an active open shift. Please close your current shift before opening a new one.');
        }
        throw error;
    }

    // 3. Record audit log
    try {
        await auditLogsModel.insertAuditLog({
            userId,
            action: 'OPEN_SHIFT',
            tableName: 'shifts',
            recordId: shiftId,
            details: {
                opening_cash_usd: openingCashUsd,
                opening_cash_khr: openingCashKhr,
                note: cleanNote
            },
            ipAddress
        });
    } catch (err) {
        console.error('Failed to write audit log for openShift:', err.message);
    }

    // 4. Return complete shift record
    return await shiftModel.findShiftById(shiftId);
};

const closeShift = async ({ shiftId, user, closing_cash_usd, closing_cash_khr, note, ipAddress }) => {
    // 1. Verify shift exists
    const shift = await shiftModel.findShiftById(shiftId);
    if (!shift) {
        throw ApiError.notFound('Shift not found');
    }

    // 2. Authorization check (only shift owner or OWNER can close)
    if (user.role !== 'OWNER' && Number(shift.user_id) !== Number(user.id)) {
        throw ApiError.forbidden('You are not authorized to close this shift');
    }

    // 3. Status check
    if (shift.status === 'CLOSED') {
        throw ApiError.badRequest('This shift is already closed');
    }

    // 4. Check for open / unpaid orders
    const openOrdersCount = await shiftModel.countOpenOrdersByShiftId(shift.id);
    if (openOrdersCount > 0) {
        throw ApiError.badRequest(
            `Cannot close shift: There are still ${openOrdersCount} open/unpaid order(s). Please complete or cancel all open orders before closing the shift.`
        );
    }

    // 5. Calculate live summary and expected cash drawer
    const rawSummary = await shiftModel.calculateShiftSummary(shift.id);
    const { expectedCashUsd, expectedCashKhr } = calculateExpectedDrawer(shift, rawSummary);

    const closingCashUsd = Number(closing_cash_usd);
    const closingCashKhr = Number(closing_cash_khr);

    // Combine or preserve notes
    let finalNote = shift.note || '';
    if (note && note.trim()) {
        finalNote = finalNote ? `${finalNote} | Close: ${note.trim()}` : note.trim();
    }
    finalNote = finalNote.substring(0, 500) || null;

    // 6. Update shift in database
    const affectedRows = await shiftModel.closeShiftById({
        shiftId,
        expectedCashUsd,
        expectedCashKhr,
        closingCashUsd,
        closingCashKhr,
        note: finalNote
    });

    if (affectedRows === 0) {
        throw ApiError.badRequest('Failed to close shift. Shift might have already been closed.');
    }

    const diffUsd = Math.round((closingCashUsd - expectedCashUsd) * 100) / 100;
    const diffKhr = Math.round((closingCashKhr - expectedCashKhr) * 100) / 100;

    // 6. Record audit log
    try {
        await auditLogsModel.insertAuditLog({
            userId: user.id,
            action: 'CLOSE_SHIFT',
            tableName: 'shifts',
            recordId: shift.id,
            details: {
                closed_by: user.id,
                expected_cash_usd: expectedCashUsd,
                expected_cash_khr: expectedCashKhr,
                closing_cash_usd: closingCashUsd,
                closing_cash_khr: closingCashKhr,
                difference_usd: diffUsd,
                difference_khr: diffKhr,
                note: finalNote
            },
            ipAddress
        });
    } catch (err) {
        console.error('Failed to write audit log for closeShift:', err.message);
    }

    // 7. Return complete closed shift details
    return await getShiftById({ shiftId, user });
};

const getAllShifts = async ({ user, queryParams = {} }) => {
    const page = Math.max(1, parseInt(queryParams.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(queryParams.limit, 10) || 20));
    const offset = (page - 1) * limit;

    // Security: Only OWNER can view other staff shifts or filter by user_id
    let targetUserId = queryParams.user_id;
    if (user.role !== 'OWNER') {
        targetUserId = user.id;
    }

    // Handle end_date full day boundary
    let adjustedEndDate = queryParams.end_date;
    if (adjustedEndDate) {
        const d = new Date(adjustedEndDate);
        if (!isNaN(d.getTime())) {
            d.setHours(23, 59, 59, 999);
            adjustedEndDate = d;
        }
    }

    const filters = {
        userId: targetUserId,
        status: queryParams.status,
        startDate: queryParams.start_date,
        endDate: adjustedEndDate
    };

    const [rows, total] = await Promise.all([
        shiftModel.findAllShifts({ ...filters, limit, offset }),
        shiftModel.countAllShifts(filters)
    ]);

    const shifts = rows.map((shift) => {
        let discrepancy = null;
        if (shift.status === 'CLOSED' && shift.closing_cash_usd !== null && shift.expected_cash_usd !== null) {
            const diffUsd = Math.round((shift.closing_cash_usd - shift.expected_cash_usd) * 100) / 100;
            const diffKhr = Math.round((shift.closing_cash_khr - shift.expected_cash_khr) * 100) / 100;
            discrepancy = {
                difference_usd: diffUsd,
                difference_khr: diffKhr,
                status_usd: diffUsd === 0 ? 'EXACT' : (diffUsd > 0 ? 'OVER' : 'SHORT'),
                status_khr: diffKhr === 0 ? 'EXACT' : (diffKhr > 0 ? 'OVER' : 'SHORT')
            };
        }

        return {
            ...shift,
            discrepancy
        };
    });

    return {
        shifts,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        }
    };
};

module.exports = {
    getCurrentShift,
    getShiftById,
    openShift,
    closeShift,
    getAllShifts
};
