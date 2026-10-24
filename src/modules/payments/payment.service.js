const crypto = require('crypto');
const { connection: pool } = require('../../config/db.config');
const paymentModel = require('./payment.model');
const shiftModel = require('../shifts/shift.model');
const auditLogsModel = require('../audit-logs/audit-logs.model');
const ApiError = require('../../utils/api-error');

const processPayment = async ({ user, paymentData, ipAddress }) => {
    // 1. Verify Cashier Active Shift
    const activeShift = await shiftModel.findActiveShiftByUserId(user.id);
    if (!activeShift) {
        throw ApiError.badRequest('You must have an active open shift to process payments. Please open a shift first.');
    }

    // 2. Check Idempotency Key
    const idempotencyKey = paymentData.idempotency_key && paymentData.idempotency_key.trim()
        ? paymentData.idempotency_key.trim()
        : crypto.randomUUID();

    const existingPayment = await paymentModel.findPaymentByIdempotencyKey(idempotencyKey);
    if (existingPayment) {
        return await paymentModel.findPaymentById(existingPayment.id);
    }

    // 3. Fetch & Validate Order
    const order = await paymentModel.findOrderForPayment(paymentData.order_id);
    if (!order) {
        throw ApiError.notFound('Order not found');
    }

    if (order.status === 'PAID') {
        throw ApiError.badRequest('This order is already paid');
    }

    if (order.status !== 'OPEN') {
        throw ApiError.badRequest(`Cannot process payment for an order with status ${order.status}`);
    }

    // Check that the order shift is not already closed
    const orderShift = await shiftModel.findShiftById(order.shift_id);
    if (orderShift && orderShift.status === 'CLOSED') {
        throw ApiError.badRequest('Cannot process payment for an order belonging to a closed shift');
    }

    // 4. Fetch Shop Settings (Exchange Rate)
    const settings = await paymentModel.getShopSettings();
    const exchangeRate = Number(settings.exchange_rate) || 4100;

    // 5. Calculate Payment Amounts & Change
    const orderTotalUsd = Number(order.total);
    if (orderTotalUsd <= 0) {
        throw ApiError.badRequest('Order total must be greater than 0 to process payment');
    }
    const currency = paymentData.currency || 'USD';
    const method = paymentData.method;

    let pExchangeRate = 1.0;
    let amount = orderTotalUsd;
    let amountUsd = orderTotalUsd;

    if (currency === 'KHR') {
        pExchangeRate = exchangeRate;
        amount = Math.round(orderTotalUsd * exchangeRate);
        amountUsd = orderTotalUsd;
    }

    let receivedAmount = 0;
    let changeUsd = 0;
    let changeKhr = 0;

    if (method === 'BANK_TRANSFER' || method === 'KHQR') {
        // Manual Bank Transfer / KHQR: cashier types received amount or defaults to bill total
        receivedAmount = paymentData.received_amount !== undefined && paymentData.received_amount !== null
            ? Number(paymentData.received_amount)
            : amount;

        if (receivedAmount !== amount) {
            throw ApiError.badRequest(
                `For ${method}, the received amount (${receivedAmount} ${currency}) must equal the order total (${amount} ${currency})`
            );
        }
        changeUsd = 0;
        changeKhr = 0;
    } else if (method === 'CASH') {
        receivedAmount = Number(paymentData.received_amount);
        if (receivedAmount < amount) {
            throw ApiError.badRequest(
                `Received cash amount (${receivedAmount} ${currency}) is less than required order bill (${amount} ${currency})`
            );
        }

        // Change calculation
        if (paymentData.change_usd !== undefined || paymentData.change_khr !== undefined) {
            // Explicit override from cashier interface
            changeUsd = Number(paymentData.change_usd) || 0;
            changeKhr = Number(paymentData.change_khr) || 0;
        } else if (paymentData.change_currency === 'KHR' || (currency === 'USD' && paymentData.change_currency === 'KHR')) {
            // Cross-currency change in KHR
            changeUsd = 0;
            changeKhr = Math.round((receivedAmount - amount) * exchangeRate);
        } else if (currency === 'KHR') {
            // KHR cash payment with default KHR change
            changeUsd = 0;
            changeKhr = Math.round(receivedAmount - amount);
        } else {
            // USD cash payment with default USD change
            changeUsd = Number((receivedAmount - amount).toFixed(2));
            changeKhr = 0;
        }

        // Verify cash balance against DB constraint chk_payments_cash:
        // ABS(((received_amount - amount) / exchange_rate) - (change_usd + (change_khr / khr_per_usd))) <= 0.05
        const cashBalanceDiff = ((receivedAmount - amount) / pExchangeRate) - (changeUsd + (changeKhr / exchangeRate));
        if (Math.abs(cashBalanceDiff) > 0.05) {
            throw ApiError.badRequest(
                `Change amounts (USD: $${changeUsd}, KHR: ${changeKhr}៛) do not balance with received amount (${receivedAmount} ${currency}) for bill total (${amount} ${currency})`
            );
        }
    }

    const bankName = method !== 'CASH' && paymentData.bank_name && paymentData.bank_name.trim()
        ? paymentData.bank_name.trim()
        : null;

    const referenceNote = paymentData.reference && paymentData.reference.trim()
        ? paymentData.reference.trim()
        : null;

    // 6. Execute Transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    let createdPaymentId;

    try {
        // A. Insert Payment Record
        createdPaymentId = await paymentModel.insertPayment({
            orderId: order.id,
            shiftId: activeShift.id,
            receivedBy: user.id,
            method,
            bankName,
            currency,
            amount,
            exchangeRate: pExchangeRate,
            khrPerUsd: exchangeRate,
            amountUsd,
            receivedAmount,
            changeUsd,
            changeKhr,
            reference: referenceNote,
            idempotencyKey
        }, connection);

        // B. Update Order Status to PAID
        const affectedRows = await paymentModel.updateOrderStatusToPaid(order.id, connection);
        if (affectedRows === 0) {
            throw ApiError.badRequest('Failed to update order status to PAID. Order might have already been processed.');
        }

        // C. Automatic Recipe Stock Deduction
        const { items, addons } = await paymentModel.getOrderItemsForRecipeDeduction(order.id, connection);
        const allVariantIds = Array.from(new Set([
            ...items.map(i => i.variant_id),
            ...addons.map(a => a.addon_variant_id)
        ]));

        if (allVariantIds.length > 0) {
            const recipes = await paymentModel.getRecipesForVariants(allVariantIds, connection);
            const recipesByVariant = {};
            for (const r of recipes) {
                if (!recipesByVariant[r.variant_id]) {
                    recipesByVariant[r.variant_id] = [];
                }
                recipesByVariant[r.variant_id].push(r);
            }

            // Deduct base order items
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const itemRecipes = recipesByVariant[item.variant_id] || [];
                for (let j = 0; j < itemRecipes.length; j++) {
                    const rec = itemRecipes[j];
                    const usedQty = Number((item.quantity * rec.recipe_quantity).toFixed(4));
                    const movementKey = `${idempotencyKey}-item-${item.id}-${rec.recipe_id}`;

                    await paymentModel.insertStockMovement({
                        ingredientId: rec.ingredient_id,
                        orderId: order.id,
                        quantityChange: -usedQty,
                        idempotencyKey: movementKey,
                        createdBy: user.id
                    }, connection);

                    await paymentModel.deductIngredientStock(rec.ingredient_id, usedQty, connection);
                }
            }

            // Deduct addons
            for (let i = 0; i < addons.length; i++) {
                const addon = addons[i];
                const addonRecipes = recipesByVariant[addon.addon_variant_id] || [];
                for (let j = 0; j < addonRecipes.length; j++) {
                    const rec = addonRecipes[j];
                    const usedQty = Number((addon.quantity * rec.recipe_quantity).toFixed(4));
                    const movementKey = `${idempotencyKey}-addon-${addon.addon_variant_id}-${rec.recipe_id}-${i}`;

                    await paymentModel.insertStockMovement({
                        ingredientId: rec.ingredient_id,
                        orderId: order.id,
                        quantityChange: -usedQty,
                        idempotencyKey: movementKey,
                        createdBy: user.id
                    }, connection);

                    await paymentModel.deductIngredientStock(rec.ingredient_id, usedQty, connection);
                }
            }
        }

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }

    // 7. Record Audit Log
    try {
        await auditLogsModel.insertAuditLog({
            userId: user.id,
            action: 'PROCESS_PAYMENT',
            tableName: 'payments',
            recordId: createdPaymentId,
            details: {
                order_id: order.id,
                receipt_no: order.receipt_no,
                shift_id: activeShift.id,
                method,
                bank_name: bankName,
                currency,
                amount,
                received_amount: receivedAmount,
                change_usd: changeUsd,
                change_khr: changeKhr,
                reference: referenceNote
            },
            ipAddress
        });
    } catch (err) {
        console.error('Failed to write audit log for processPayment:', err.message);
    }

    // 8. Return Complete Payment Record
    return await paymentModel.findPaymentById(createdPaymentId);
};

const getPaymentById = async ({ paymentId }) => {
    const payment = await paymentModel.findPaymentById(paymentId);
    if (!payment) {
        throw ApiError.notFound(`Payment #${paymentId} not found`);
    }
    return payment;
};

const getPaymentByOrderId = async ({ orderId }) => {
    const payment = await paymentModel.findPaymentByOrderId(orderId);
    if (!payment) {
        throw ApiError.notFound(`No payment found for order #${orderId}`);
    }
    return payment;
};

const getAllPayments = async ({ queryParams = {} }) => {
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

    const filter = {
        shiftId: queryParams.shift_id ? Number(queryParams.shift_id) : undefined,
        orderId: queryParams.order_id ? Number(queryParams.order_id) : undefined,
        method: queryParams.method,
        currency: queryParams.currency,
        status: queryParams.status,
        receivedBy: queryParams.received_by ? Number(queryParams.received_by) : undefined,
        startDate: queryParams.start_date,
        endDate: adjustedEndDate,
        search: queryParams.search,
        limit,
        offset
    };

    const [payments, totalItems] = await Promise.all([
        paymentModel.findAllPayments(filter),
        paymentModel.countAllPayments(filter)
    ]);

    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {
        payments,
        pagination: {
            total_items: totalItems,
            total_pages: totalPages,
            current_page: page,
            limit
        }
    };
};

// ==========================================
// REFUNDS
// ==========================================

const processRefund = async ({ user, refundData, paymentIdParam, ipAddress }) => {
    const targetPaymentId = paymentIdParam ? Number(paymentIdParam) : Number(refundData.payment_id);
    if (!targetPaymentId) {
        throw ApiError.badRequest('Payment ID is required to process a refund');
    }

    // 1. Verify User has an Active Open Shift (refund money leaves the active drawer)
    const activeShift = await shiftModel.findActiveShiftByUserId(user.id);
    if (!activeShift) {
        throw ApiError.badRequest('You must have an active open shift to process a refund. Please open a shift first.');
    }

    // 2. Fetch and Validate Original Payment
    const payment = await paymentModel.findPaymentById(targetPaymentId);
    if (!payment) {
        throw ApiError.notFound(`Payment #${targetPaymentId} not found`);
    }

    if (payment.status !== 'COMPLETED') {
        throw ApiError.badRequest(`Cannot refund payment with status ${payment.status}`);
    }

    if (payment.is_refunded) {
        throw ApiError.conflict(`Payment #${targetPaymentId} has already been refunded on ${payment.refund.refunded_at}`);
    }

    // 3. Fetch and Validate Order Status
    const order = await paymentModel.findOrderForPayment(payment.order_id);
    if (!order) {
        throw ApiError.notFound(`Order #${payment.order_id} not found`);
    }

    if (order.status !== 'PAID') {
        throw ApiError.badRequest(`Cannot refund order with status ${order.status}. Only PAID orders can be refunded.`);
    }

    // 4. Validate Approver
    let approverId = null;
    if (user.role === 'OWNER') {
        approverId = refundData.approved_by ? Number(refundData.approved_by) : user.id;
    } else {
        if (!refundData.approved_by) {
            throw ApiError.forbidden('Staff members require approval from an active OWNER to process a refund. Please provide approved_by.');
        }
        approverId = Number(refundData.approved_by);
    }

    const approverUser = await paymentModel.findActiveOwnerById(approverId);
    if (!approverUser) {
        throw ApiError.badRequest(`Approver #${approverId} is not an active OWNER user`);
    }

    const reason = refundData.reason ? refundData.reason.trim() : '';
    if (!reason) {
        throw ApiError.badRequest('Refund reason is required and cannot be empty');
    }

    const reference = refundData.reference && refundData.reference.trim()
        ? refundData.reference.trim()
        : null;

    // 5. Execute Transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    let createdRefundId;

    try {
        // A. Insert Refund Record
        createdRefundId = await paymentModel.insertRefund({
            orderId: payment.order_id,
            paymentId: payment.id,
            shiftId: activeShift.id,
            approvedBy: approverId,
            method: payment.method,
            currency: payment.currency,
            amount: payment.amount,
            exchangeRate: payment.exchange_rate,
            khrPerUsd: payment.khr_per_usd,
            amountUsd: payment.amount_usd,
            reason,
            reference
        }, connection);

        // B. Update Order Status to REFUNDED
        const affectedRows = await paymentModel.updateOrderStatusToRefunded(payment.order_id, connection);
        if (affectedRows === 0) {
            throw ApiError.badRequest('Failed to update order status to REFUNDED. Order may have already changed status.');
        }

        // C. Reverse Recipe Stock Deductions (Stock Movement: RETURN)
        const saleMovements = await paymentModel.getSaleStockMovementsForOrder(payment.order_id, connection);
        for (const sale of saleMovements) {
            const returnQty = Math.abs(Number(sale.quantity_change));
            if (returnQty > 0) {
                const returnKey = `refund-${payment.id}-sale-${sale.id}`;

                await paymentModel.insertReturnStockMovement({
                    ingredientId: sale.ingredient_id,
                    orderId: payment.order_id,
                    sourceMovementId: sale.id,
                    quantityChange: returnQty,
                    reason: `Order Refund #${payment.order_id}: ${reason}`,
                    idempotencyKey: returnKey,
                    createdBy: user.id
                }, connection);

                await paymentModel.restoreIngredientStock(sale.ingredient_id, returnQty, connection);
            }
        }

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }

    // 6. Record Audit Log
    try {
        await auditLogsModel.insertAuditLog({
            userId: user.id,
            action: 'PROCESS_REFUND',
            tableName: 'refunds',
            recordId: createdRefundId,
            details: {
                order_id: payment.order_id,
                payment_id: payment.id,
                receipt_no: payment.receipt_no,
                shift_id: activeShift.id,
                amount: payment.amount,
                currency: payment.currency,
                method: payment.method,
                reason,
                approved_by: approverId
            },
            ipAddress
        });
    } catch (err) {
        console.error('Failed to write audit log for processRefund:', err.message);
    }

    // 7. Return Created Refund Details
    return await paymentModel.findRefundById(createdRefundId);
};

const getRefundById = async ({ refundId }) => {
    const refund = await paymentModel.findRefundById(refundId);
    if (!refund) {
        throw ApiError.notFound(`Refund #${refundId} not found`);
    }
    return refund;
};

const getAllRefunds = async ({ queryParams = {} }) => {
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

    const filter = {
        shiftId: queryParams.shift_id ? Number(queryParams.shift_id) : undefined,
        orderId: queryParams.order_id ? Number(queryParams.order_id) : undefined,
        approvedBy: queryParams.approved_by ? Number(queryParams.approved_by) : undefined,
        method: queryParams.method,
        currency: queryParams.currency,
        status: queryParams.status,
        startDate: queryParams.start_date,
        endDate: adjustedEndDate,
        search: queryParams.search,
        limit,
        offset
    };

    const [refunds, totalItems] = await Promise.all([
        paymentModel.findAllRefunds(filter),
        paymentModel.countAllRefunds(filter)
    ]);

    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {
        refunds,
        pagination: {
            total_items: totalItems,
            total_pages: totalPages,
            current_page: page,
            limit
        }
    };
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
