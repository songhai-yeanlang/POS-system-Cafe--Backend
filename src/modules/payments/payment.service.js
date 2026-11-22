const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { connection: pool } = require('../../config/db.config');
const paymentModel = require('./payment.model');
const shiftModel = require('../shifts/shift.model');
const auditLogsModel = require('../audit-logs/audit-logs.model');
const ApiError = require('../../utils/api-error');
const {
    checkApprovalRateLimit,
    recordApprovalFailure,
    clearApprovalFailures
} = require('../../middlewares/rate-limiter');

const buildStockMovementKey = (baseKey, suffix) => {
    const combined = `${baseKey}-${suffix}`;
    if (combined.length <= 100) {
        return combined;
    }
    const baseHash = crypto.createHash('sha256').update(String(baseKey)).digest('hex').slice(0, 16);
    const maxPrefixLen = Math.max(8, 100 - 1 - baseHash.length - 1 - suffix.length);
    const safePrefix = String(baseKey).slice(0, maxPrefixLen);
    return `${safePrefix}-${baseHash}-${suffix}`.slice(0, 100);
};

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
    const orderSubtotalUsd = Number(order.subtotal);
    const orderTotalUsd = Number(order.total);
    if (orderSubtotalUsd <= 0 || orderTotalUsd < 0) {
        throw ApiError.badRequest('Order subtotal must be greater than 0 and total cannot be negative');
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
        if ((paymentData.received_amount === undefined || paymentData.received_amount === null) && amount > 0) {
            throw ApiError.badRequest('Received amount is required for CASH payment');
        }
        receivedAmount = paymentData.received_amount !== undefined && paymentData.received_amount !== null
            ? Number(paymentData.received_amount)
            : 0;
        if (receivedAmount < amount) {
            throw ApiError.badRequest(
                `Received cash amount (${receivedAmount} ${currency}) is less than required order bill (${amount} ${currency})`
            );
        }

        // Change calculation
        const targetChangeCurrency = paymentData.change_currency || currency;
        if (paymentData.change_usd !== undefined || paymentData.change_khr !== undefined) {
            // Explicit override from cashier interface
            changeUsd = Number(paymentData.change_usd) || 0;
            changeKhr = Number(paymentData.change_khr) || 0;
        } else if (currency === 'USD' && targetChangeCurrency === 'KHR') {
            // USD cash payment with cross-currency change in KHR
            changeUsd = 0;
            changeKhr = Math.round((receivedAmount - amount) * exchangeRate);
        } else if (currency === 'KHR' && targetChangeCurrency === 'USD') {
            // KHR cash payment with cross-currency change in USD
            changeUsd = Number(((receivedAmount - amount) / exchangeRate).toFixed(2));
            changeKhr = 0;
        } else if (currency === 'KHR') {
            // KHR cash payment with KHR change
            changeUsd = 0;
            changeKhr = Math.round(receivedAmount - amount);
        } else {
            // USD cash payment with USD change
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
        // A. Lock Order Row & Re-verify Status Inside Transaction
        const lockedOrder = await paymentModel.findOrderForPayment(order.id, connection, true);
        if (!lockedOrder) {
            throw ApiError.notFound('Order not found');
        }
        if (lockedOrder.status === 'PAID') {
            throw ApiError.badRequest('This order is already paid');
        }
        if (lockedOrder.status !== 'OPEN') {
            throw ApiError.badRequest(`Cannot process payment for an order with status ${lockedOrder.status}`);
        }

        // B. Prepare & Validate Automatic Recipe Stock Deduction Under Row Lock
        const { items, addons } = await paymentModel.getOrderItemsForRecipeDeduction(order.id, connection);
        const allVariantIds = Array.from(new Set([
            ...items.map(i => i.variant_id),
            ...addons.map(a => a.addon_variant_id)
        ]));

        const plannedMovements = [];
        const requiredByIngredient = new Map();

        if (allVariantIds.length > 0) {
            const recipes = await paymentModel.getRecipesForVariants(allVariantIds, connection);
            const recipesByVariant = {};
            for (const r of recipes) {
                if (!recipesByVariant[r.variant_id]) {
                    recipesByVariant[r.variant_id] = [];
                }
                recipesByVariant[r.variant_id].push(r);
            }

            // Collect base order item recipe movements
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const itemRecipes = recipesByVariant[item.variant_id] || [];
                for (let j = 0; j < itemRecipes.length; j++) {
                    const rec = itemRecipes[j];
                    const isSugarScaled =
                        Boolean(rec.scale_by_sugar) &&
                        item.sugar_level !== null &&
                        item.sugar_level !== undefined;
                    const sugarFactor = isSugarScaled ? Number(item.sugar_level) / 100 : 1;
                    const usedQty = Number((item.quantity * rec.recipe_quantity * sugarFactor).toFixed(4));
                    if (usedQty <= 0) continue;

                    const movementKey = buildStockMovementKey(idempotencyKey, `item-${item.id}-${rec.recipe_id}`);
                    const movementReason = isSugarScaled ? `Sugar ${item.sugar_level}%` : null;
                    plannedMovements.push({
                        ingredientId: Number(rec.ingredient_id),
                        usedQty,
                        movementKey,
                        reason: movementReason
                    });

                    const ingId = Number(rec.ingredient_id);
                    const prev = requiredByIngredient.get(ingId) || {
                        ingredientId: ingId,
                        name: rec.ingredient_name,
                        unit: rec.unit,
                        totalRequired: 0
                    };
                    prev.totalRequired = Number((prev.totalRequired + usedQty).toFixed(4));
                    requiredByIngredient.set(ingId, prev);
                }
            }

            // Collect addon recipe movements
            for (let i = 0; i < addons.length; i++) {
                const addon = addons[i];
                const addonRecipes = recipesByVariant[addon.addon_variant_id] || [];
                for (let j = 0; j < addonRecipes.length; j++) {
                    const rec = addonRecipes[j];
                    const usedQty = Number((addon.quantity * rec.recipe_quantity).toFixed(4));
                    if (usedQty <= 0) continue;

                    const addonIdentifier = addon.id ? `${addon.id}` : `${addon.addon_variant_id}-${i}`;
                    const movementKey = buildStockMovementKey(idempotencyKey, `addon-${addonIdentifier}-${rec.recipe_id}`);
                    plannedMovements.push({
                        ingredientId: Number(rec.ingredient_id),
                        usedQty,
                        movementKey
                    });

                    const ingId = Number(rec.ingredient_id);
                    const prev = requiredByIngredient.get(ingId) || {
                        ingredientId: ingId,
                        name: rec.ingredient_name,
                        unit: rec.unit,
                        totalRequired: 0
                    };
                    prev.totalRequired = Number((prev.totalRequired + usedQty).toFixed(4));
                    requiredByIngredient.set(ingId, prev);
                }
            }
        }

        // Lock all required ingredient rows in ascending ID order & verify sufficient stock
        if (requiredByIngredient.size > 0) {
            const lockedIngredients = await paymentModel.lockIngredientsByIds(
                Array.from(requiredByIngredient.keys()),
                connection
            );
            const lockedMap = new Map(lockedIngredients.map(ing => [Number(ing.id), ing]));

            const shortages = [];
            for (const [ingId, reqInfo] of requiredByIngredient.entries()) {
                const lockedIng = lockedMap.get(ingId);
                if (!lockedIng) {
                    throw ApiError.badRequest(`Required recipe ingredient '${reqInfo.name}' (#${ingId}) no longer exists`);
                }
                const currentStock = Number(lockedIng.current_stock);
                const remainingStock = Number((currentStock - reqInfo.totalRequired).toFixed(4));
                if (remainingStock < 0) {
                    shortages.push(
                        `'${lockedIng.name}' (available: ${currentStock} ${lockedIng.unit}, required: ${reqInfo.totalRequired} ${lockedIng.unit})`
                    );
                }
            }

            if (shortages.length > 0) {
                throw ApiError.badRequest(
                    `Insufficient ingredient stock to complete payment: ${shortages.join('; ')}`
                );
            }
        }

        // C. Insert Payment Record
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

        // D. Update Order Status to PAID
        const affectedRows = await paymentModel.updateOrderStatusToPaid(order.id, connection);
        if (affectedRows === 0) {
            throw ApiError.badRequest('Failed to update order status to PAID. Order might have already been processed.');
        }

        // E. Record Stock Movements & Deduct Aggregated Stock per Ingredient
        for (const mov of plannedMovements) {
            await paymentModel.insertStockMovement({
                ingredientId: mov.ingredientId,
                orderId: order.id,
                quantityChange: -mov.usedQty,
                reason: mov.reason || null,
                idempotencyKey: mov.movementKey,
                createdBy: user.id
            }, connection);
        }

        for (const [ingId, reqInfo] of requiredByIngredient.entries()) {
            await paymentModel.deductIngredientStock(ingId, reqInfo.totalRequired, connection);
        }

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        if (error.errno === 1062 && idempotencyKey) {
            const concurrentPayment = await paymentModel.findPaymentByIdempotencyKey(idempotencyKey);
            if (concurrentPayment) {
                return await paymentModel.findPaymentById(concurrentPayment.id);
            }
        }
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
        if (typeof adjustedEndDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(adjustedEndDate.trim())) {
            adjustedEndDate = `${adjustedEndDate.trim()} 23:59:59.999`;
        } else {
            const d = new Date(adjustedEndDate);
            if (!isNaN(d.getTime())) {
                d.setHours(23, 59, 59, 999);
                adjustedEndDate = d;
            }
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
            page,
            limit,
            total: totalItems,
            totalPages,
            total_items: totalItems,
            total_pages: totalPages,
            current_page: page
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
    const providedPassword = refundData.approver_password || refundData.owner_password;

    if (user.role === 'OWNER') {
        approverId = refundData.approved_by ? Number(refundData.approved_by) : user.id;
        const approverUser = await paymentModel.findActiveOwnerById(approverId);
        if (!approverUser) {
            throw ApiError.badRequest(`Approver #${approverId} is not an active OWNER user`);
        }
    } else if (providedPassword && String(providedPassword).trim()) {
        const rateLimitKey = `refund:${user.id || ipAddress || 'anon'}`;
        checkApprovalRateLimit(rateLimitKey);

        // Staff provided an OWNER password: find matching active OWNER automatically
        const activeOwners = await paymentModel.findAllActiveOwners();
        let matchedOwner = null;
        for (const owner of activeOwners) {
            if (refundData.approved_by && Number(owner.id) !== Number(refundData.approved_by)) {
                continue;
            }
            const isMatch = await bcrypt.compare(String(providedPassword), owner.password_hash);
            if (isMatch) {
                matchedOwner = owner;
                break;
            }
        }
        if (!matchedOwner) {
            recordApprovalFailure(rateLimitKey);
            try {
                await auditLogsModel.insertAuditLog({
                    userId: user.id,
                    action: 'REFUND_APPROVAL_FAILED',
                    tableName: 'refunds',
                    recordId: payment.id,
                    details: {
                        order_id: payment.order_id,
                        payment_id: payment.id,
                        receipt_no: payment.receipt_no,
                        reason: 'Invalid OWNER approval password for refund'
                    },
                    ipAddress
                });
            } catch (err) {
                console.error('Failed to write audit log for failed refund approval:', err.message);
            }
            throw ApiError.forbidden('Invalid OWNER approval password for refund');
        }
        clearApprovalFailures(rateLimitKey);
        approverId = matchedOwner.id;
    } else {
        throw ApiError.forbidden(
            'Staff members require an active OWNER approval password to process a refund.'
        );
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
        // A. Lock Order Row & Verify PAID Status Inside Transaction
        const lockedOrder = await paymentModel.findOrderForPayment(payment.order_id, connection, true);
        if (!lockedOrder) {
            throw ApiError.notFound(`Order #${payment.order_id} not found`);
        }
        if (lockedOrder.status !== 'PAID') {
            throw ApiError.badRequest(`Cannot refund order with status ${lockedOrder.status}. Only PAID orders can be refunded.`);
        }

        // B. Insert Refund Record
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

        // C. Update Order Status to REFUNDED
        const affectedRows = await paymentModel.updateOrderStatusToRefunded(payment.order_id, connection);
        if (affectedRows === 0) {
            throw ApiError.badRequest('Failed to update order status to REFUNDED. Order may have already changed status.');
        }

        // D. Reverse Recipe Stock Deductions (Stock Movement: RETURN) with Row Locks
        const saleMovements = await paymentModel.getSaleStockMovementsForOrder(payment.order_id, connection);
        if (saleMovements.length > 0) {
            const refundIngredientIds = saleMovements.map(s => Number(s.ingredient_id));
            await paymentModel.lockIngredientsByIds(refundIngredientIds, connection);

            for (const sale of saleMovements) {
                const returnQty = Math.abs(Number(sale.quantity_change));
                if (returnQty > 0) {
                    const returnKey = buildStockMovementKey(`refund-${payment.id}`, `sale-${sale.id}`);

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
        if (typeof adjustedEndDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(adjustedEndDate.trim())) {
            adjustedEndDate = `${adjustedEndDate.trim()} 23:59:59.999`;
        } else {
            const d = new Date(adjustedEndDate);
            if (!isNaN(d.getTime())) {
                d.setHours(23, 59, 59, 999);
                adjustedEndDate = d;
            }
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
            page,
            limit,
            total: totalItems,
            totalPages,
            total_items: totalItems,
            total_pages: totalPages,
            current_page: page
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
