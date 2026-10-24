const { connection: pool } = require('../../config/db.config');
const orderModel = require('./order.model');
const shiftModel = require('../shifts/shift.model');
const auditLogsModel = require('../audit-logs/audit-logs.model');
const ApiError = require('../../utils/api-error');

/**
 * Helper to validate all items/addons and calculate subtotal
 */
const prepareOrderItemsAndSubtotal = async (items = []) => {
    if (!items.length) {
        throw ApiError.badRequest('Order must contain at least one item');
    }

    const itemVariantIds = [];
    const addonVariantIds = [];

    for (const item of items) {
        itemVariantIds.push(item.variant_id);
        if (Array.isArray(item.addons)) {
            for (const addon of item.addons) {
                addonVariantIds.push(addon.addon_variant_id);
            }
        }
    }

    const allVariantIds = Array.from(new Set([...itemVariantIds, ...addonVariantIds]));
    const variantsList = await orderModel.getVariantsDetailsByIds(allVariantIds);
    const variantMap = new Map();
    for (const v of variantsList) {
        variantMap.set(v.variant_id, v);
    }

    let subtotal = 0;
    const preparedItems = [];

    for (const item of items) {
        const variant = variantMap.get(item.variant_id);
        if (!variant || !variant.variant_active || !variant.product_active) {
            throw ApiError.badRequest(`Product variant #${item.variant_id} is either inactive or does not exist`);
        }

        const unitPrice = Number(variant.price);
        const itemLineTotal = Number((item.quantity * unitPrice).toFixed(2));
        subtotal += itemLineTotal;

        const preparedAddons = [];
        if (Array.isArray(item.addons)) {
            for (const addon of item.addons) {
                const addonVariant = variantMap.get(addon.addon_variant_id);
                if (!addonVariant || !addonVariant.variant_active || !addonVariant.product_active) {
                    throw ApiError.badRequest(`Add-on variant #${addon.addon_variant_id} is either inactive or does not exist`);
                }

                // Integrity check: Add-on must belong to a product with product_type = 'ADDON'
                if (addonVariant.product_type !== 'ADDON') {
                    throw ApiError.badRequest(`Product variant #${addon.addon_variant_id} is a ${addonVariant.product_type}, not an ADDON`);
                }

                const addonUnitPrice = Number(addonVariant.price);
                const addonLineTotal = Number((addon.quantity * addonUnitPrice).toFixed(2));
                subtotal += addonLineTotal;

                // Snapshot display name
                const addonSnapshotName = addonVariant.variant_name === 'Regular' || addonVariant.variant_name === 'Standard'
                    ? addonVariant.product_name
                    : `${addonVariant.product_name} (${addonVariant.variant_name})`;

                preparedAddons.push({
                    addon_variant_id: addon.addon_variant_id,
                    addon_name_snapshot: addonSnapshotName,
                    quantity: addon.quantity,
                    unit_price: addonUnitPrice
                });
            }
        }

        // Clean sugar and ice customization: only relevant for DRINK products
        const isDrink = variant.product_type === 'DRINK';
        const sugarLevel = isDrink && item.sugar_level !== undefined ? item.sugar_level : null;
        const iceLevel = isDrink && item.ice_level ? item.ice_level : null;

        preparedItems.push({
            variant_id: item.variant_id,
            product_name_snapshot: variant.product_name,
            variant_name_snapshot: variant.variant_name,
            quantity: item.quantity,
            unit_price: unitPrice,
            sugar_level: sugarLevel,
            ice_level: iceLevel,
            note: item.note && item.note.trim() ? item.note.trim() : null,
            addons: preparedAddons
        });
    }

    subtotal = Number(subtotal.toFixed(2));
    return { subtotal, preparedItems };
};

/**
 * Helper to calculate and validate discounts
 */
const calculateAndValidateDiscount = async (orderData, subtotal, currentUser = null) => {
    let discountType = orderData.discount_type || 'NONE';
    let discountValue = Number(orderData.discount_value) || 0;
    let discountAmount = 0;
    let discountApprovedBy = null;
    let discountReason = null;

    if (discountType !== 'NONE' && discountValue > 0) {
        // If current user is OWNER, they can auto-approve the discount if not explicitly specified
        let approverId = orderData.discount_approved_by;
        if (!approverId && currentUser && currentUser.role === 'OWNER') {
            approverId = currentUser.id;
        }

        if (!approverId) {
            throw ApiError.badRequest('Discounts must be approved by an authorized OWNER. Please provide discount_approved_by');
        }
        if (!orderData.discount_reason || !orderData.discount_reason.trim()) {
            throw ApiError.badRequest('Discount reason is required when applying a discount');
        }

        const approver = await orderModel.findUserRoleById(approverId);
        if (!approver || approver.role !== 'OWNER' || !approver.is_active) {
            throw ApiError.badRequest('Discount must be approved by an active user with OWNER role');
        }

        if (discountType === 'PERCENT') {
            if (discountValue > 100) {
                throw ApiError.badRequest('Percentage discount cannot exceed 100%');
            }
            discountValue = Number(discountValue.toFixed(2));
            // Strict MySQL ROUND((subtotal * discount_value) / 100, 2)
            discountAmount = Number((Math.round(((subtotal * discountValue) / 100) * 100) / 100).toFixed(2));
        } else if (discountType === 'FIXED') {
            discountValue = Number(discountValue.toFixed(2));
            if (discountValue > subtotal) {
                throw ApiError.badRequest(`Fixed discount ($${discountValue}) cannot exceed order subtotal ($${subtotal})`);
            }
            discountAmount = discountValue; // Must strictly equal discount_value in DB
        }

        discountApprovedBy = approverId;
        discountReason = orderData.discount_reason.trim();
    } else {
        discountType = 'NONE';
        discountValue = 0;
        discountAmount = 0;
        discountApprovedBy = null;
        discountReason = null;
    }

    return {
        discountType,
        discountValue,
        discountAmount,
        discountApprovedBy,
        discountReason
    };
};

const createOrder = async ({ user, orderData, ipAddress }) => {
    // 1. Verify Cashier Active Shift
    const activeShift = await shiftModel.findActiveShiftByUserId(user.id);
    if (!activeShift) {
        throw ApiError.badRequest('You must have an active open shift to create orders. Please open a shift first.');
    }
    const shiftId = activeShift.id;

    // 2. Validate Order Type & Table Number
    const orderType = orderData.order_type || 'TAKEAWAY';
    let tableNo = null;
    if (orderType === 'DINE_IN') {
        tableNo = orderData.table_no && orderData.table_no.trim() ? orderData.table_no.trim() : null;
    }

    // 3. Prepare Items, Addons, and Subtotal
    const { subtotal, preparedItems } = await prepareOrderItemsAndSubtotal(orderData.items);

    // 4. Calculate and validate discounts
    const discount = await calculateAndValidateDiscount(orderData, subtotal, user);

    // 5. Execute Transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    let createdOrderId;
    let receiptNo;
    let queueNo;

    try {
        receiptNo = await orderModel.generateReceiptNo(connection);
        const datePrefix = receiptNo.substring(0, 13); // e.g. "RCP-YYYYMMDD-"
        queueNo = await orderModel.getNextQueueNo(datePrefix, connection);

        createdOrderId = await orderModel.insertOrder({
            receiptNo,
            queueNo,
            cashierId: user.id,
            shiftId,
            orderType,
            tableNo,
            subtotal,
            discountType: discount.discountType,
            discountValue: discount.discountValue,
            discountAmount: discount.discountAmount,
            discountApprovedBy: discount.discountApprovedBy,
            discountReason: discount.discountReason,
            note: orderData.note && orderData.note.trim() ? orderData.note.trim() : null
        }, connection);

        for (const item of preparedItems) {
            const orderItemId = await orderModel.insertOrderItem({
                orderId: createdOrderId,
                variantId: item.variant_id,
                productNameSnapshot: item.product_name_snapshot,
                variantNameSnapshot: item.variant_name_snapshot,
                quantity: item.quantity,
                unitPrice: item.unit_price,
                sugarLevel: item.sugar_level,
                iceLevel: item.ice_level,
                note: item.note
            }, connection);

            for (const addon of item.addons) {
                await orderModel.insertOrderItemAddon({
                    orderItemId,
                    addonVariantId: addon.addon_variant_id,
                    addonNameSnapshot: addon.addon_name_snapshot,
                    quantity: addon.quantity,
                    unitPrice: addon.unit_price
                }, connection);
            }
        }

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }

    // 6. Audit Log
    try {
        await auditLogsModel.insertAuditLog({
            userId: user.id,
            action: 'CREATE_ORDER',
            tableName: 'orders',
            recordId: createdOrderId,
            details: {
                receipt_no: receiptNo,
                queue_no: queueNo,
                shift_id: shiftId,
                order_type: orderType,
                subtotal,
                discount_amount: discount.discountAmount,
                total: Number((subtotal - discount.discountAmount).toFixed(2)),
                items_count: preparedItems.length
            },
            ipAddress
        });
    } catch (err) {
        console.error('Failed to write audit log for createOrder:', err.message);
    }

    // 7. Return complete order
    return await orderModel.findOrderById(createdOrderId);
};

const getOrderById = async ({ orderId }) => {
    const order = await orderModel.findOrderById(orderId);
    if (!order) {
        throw ApiError.notFound('Order not found');
    }
    return order;
};

const getAllOrders = async ({ queryParams = {} }) => {
    const page = Math.max(1, parseInt(queryParams.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(queryParams.limit, 10) || 20));
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
        status: queryParams.status,
        orderType: queryParams.order_type,
        shiftId: queryParams.shift_id ? Number(queryParams.shift_id) : undefined,
        cashierId: queryParams.cashier_id ? Number(queryParams.cashier_id) : undefined,
        startDate: queryParams.start_date,
        endDate: adjustedEndDate,
        search: queryParams.search ? queryParams.search.trim() : undefined
    };

    const [rows, total] = await Promise.all([
        orderModel.findAllOrders({ ...filters, limit, offset }),
        orderModel.countAllOrders(filters)
    ]);

    const orders = rows.map(o => ({
        id: o.id,
        receipt_no: o.receipt_no,
        queue_no: o.queue_no,
        cashier: {
            id: o.cashier_id,
            name: o.cashier_name,
            email: o.cashier_email
        },
        shift_id: o.shift_id,
        order_type: o.order_type,
        table_no: o.table_no,
        status: o.status,
        subtotal: o.subtotal,
        discount: {
            type: o.discount_type,
            value: o.discount_value,
            amount: o.discount_amount
        },
        total: o.total,
        total_items: Number(o.total_items || 0),
        note: o.note,
        paid_at: o.paid_at,
        cancelled_at: o.cancelled_at,
        created_at: o.created_at,
        updated_at: o.updated_at
    }));

    return {
        orders,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        }
    };
};

const updateOrder = async ({ orderId, user, orderData, ipAddress }) => {
    // 1. Verify Order Exists and has status OPEN
    const existingOrder = await orderModel.findOrderById(orderId);
    if (!existingOrder) {
        throw ApiError.notFound('Order not found');
    }

    if (existingOrder.status !== 'OPEN') {
        throw ApiError.badRequest(`Cannot update order: order status is currently ${existingOrder.status}. Only OPEN orders can be updated.`);
    }

    // 2. Authorization check: Only shift creator (STAFF) or OWNER can update
    if (user.role !== 'OWNER' && Number(existingOrder.cashier.id) !== Number(user.id)) {
        throw ApiError.forbidden('You are not authorized to update this order. Only the staff who created it or an OWNER can update it.');
    }

    // 3. Verify Shift is still OPEN
    const orderShift = await shiftModel.findShiftById(existingOrder.shift_id);
    if (orderShift && orderShift.status === 'CLOSED') {
        throw ApiError.badRequest('Cannot update order belonging to a closed shift');
    }

    // 4. Validate Order Type & Table
    const orderType = orderData.order_type || existingOrder.order_type;
    let tableNo = null;
    if (orderType === 'DINE_IN') {
        tableNo = orderData.table_no !== undefined 
            ? (orderData.table_no && orderData.table_no.trim() ? orderData.table_no.trim() : null)
            : existingOrder.table_no;
    }

    // 5. Prepare Items if provided
    let subtotal = existingOrder.subtotal;
    let preparedItems = null;

    if (orderData.items && orderData.items.length > 0) {
        const prepared = await prepareOrderItemsAndSubtotal(orderData.items);
        subtotal = prepared.subtotal;
        preparedItems = prepared.preparedItems;
    }

    // 6. Handle Discount: validate new discount or re-calculate existing discount
    let discount;
    if (orderData.discount_type !== undefined || orderData.discount_value !== undefined) {
        discount = await calculateAndValidateDiscount({
            discount_type: orderData.discount_type !== undefined ? orderData.discount_type : existingOrder.discount.type,
            discount_value: orderData.discount_value !== undefined ? orderData.discount_value : existingOrder.discount.value,
            discount_approved_by: orderData.discount_approved_by !== undefined ? orderData.discount_approved_by : existingOrder.discount.approved_by?.id,
            discount_reason: orderData.discount_reason !== undefined ? orderData.discount_reason : existingOrder.discount.reason
        }, subtotal, user);
    } else if (existingOrder.discount && existingOrder.discount.type !== 'NONE') {
        // Re-validate and re-calculate existing discount against updated subtotal
        discount = await calculateAndValidateDiscount({
            discount_type: existingOrder.discount.type,
            discount_value: existingOrder.discount.value,
            discount_approved_by: existingOrder.discount.approved_by?.id,
            discount_reason: existingOrder.discount.reason
        }, subtotal, user);
    } else {
        discount = {
            discountType: 'NONE',
            discountValue: 0,
            discountAmount: 0,
            discountApprovedBy: null,
            discountReason: null
        };
    }

    const note = orderData.note !== undefined 
        ? (orderData.note && orderData.note.trim() ? orderData.note.trim() : null) 
        : existingOrder.note;

    // 7. Execute Transaction (delete old items only if new items provided, update order)
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
        if (preparedItems) {
            // Delete existing items (cascades to order_item_addons)
            await orderModel.deleteOrderItemsByOrderId(orderId, connection);

            // Insert updated items
            for (const item of preparedItems) {
                const orderItemId = await orderModel.insertOrderItem({
                    orderId,
                    variantId: item.variant_id,
                    productNameSnapshot: item.product_name_snapshot,
                    variantNameSnapshot: item.variant_name_snapshot,
                    quantity: item.quantity,
                    unitPrice: item.unit_price,
                    sugarLevel: item.sugar_level,
                    iceLevel: item.ice_level,
                    note: item.note
                }, connection);

                for (const addon of item.addons) {
                    await orderModel.insertOrderItemAddon({
                        orderItemId,
                        addonVariantId: addon.addon_variant_id,
                        addonNameSnapshot: addon.addon_name_snapshot,
                        quantity: addon.quantity,
                        unitPrice: addon.unit_price
                    }, connection);
                }
            }
        }

        // Update order record
        await orderModel.updateOrderById({
            orderId,
            orderType,
            tableNo,
            subtotal,
            discountType: discount.discountType,
            discountValue: discount.discountValue,
            discountAmount: discount.discountAmount,
            discountApprovedBy: discount.discountApprovedBy,
            discountReason: discount.discountReason,
            note
        }, connection);

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }

    // 8. Audit Log
    try {
        await auditLogsModel.insertAuditLog({
            userId: user.id,
            action: 'UPDATE_ORDER',
            tableName: 'orders',
            recordId: orderId,
            details: {
                receipt_no: existingOrder.receipt_no,
                order_type: orderType,
                subtotal,
                discount_amount: discount.discountAmount,
                total: Number((subtotal - discount.discountAmount).toFixed(2)),
                items_updated: Boolean(preparedItems)
            },
            ipAddress
        });
    } catch (err) {
        console.error('Failed to write audit log for updateOrder:', err.message);
    }

    // 9. Return complete updated order
    return await orderModel.findOrderById(orderId);
};

const cancelOrder = async ({ orderId, user, reason, ipAddress }) => {
    // 1. Role Authorization: Only OWNER or STAFF
    if (user.role !== 'OWNER' && user.role !== 'STAFF') {
        throw ApiError.forbidden('You are not authorized to cancel orders. Only STAFF or OWNER can cancel.');
    }

    // 2. Verify Order Exists
    const existingOrder = await orderModel.findOrderById(orderId);
    if (!existingOrder) {
        throw ApiError.notFound('Order not found');
    }

    // Staff can only cancel their own order; OWNER can cancel any order
    if (user.role === 'STAFF' && Number(existingOrder.cashier.id) !== Number(user.id)) {
        throw ApiError.forbidden('You can only cancel orders created under your own account. For orders by other staff, an OWNER must cancel.');
    }

    if (existingOrder.status === 'CANCELLED') {
        throw ApiError.badRequest('This order is already cancelled');
    }

    if (existingOrder.status === 'PAID') {
        throw ApiError.badRequest('Paid orders cannot be cancelled directly. Please process a refund instead.');
    }

    if (existingOrder.status !== 'OPEN') {
        throw ApiError.badRequest(`Cannot cancel order with status ${existingOrder.status}`);
    }

    // Check that the order shift is not already closed
    const orderShift = await shiftModel.findShiftById(existingOrder.shift_id);
    if (orderShift && orderShift.status === 'CLOSED') {
        throw ApiError.badRequest('Cannot cancel an order belonging to a closed shift');
    }

    const cleanReason = reason.trim();

    // 3. Update status to CANCELLED
    const affectedRows = await orderModel.cancelOrderById({
        orderId,
        cancelledBy: user.id,
        cancellationReason: cleanReason
    });

    if (affectedRows === 0) {
        throw ApiError.badRequest('Failed to cancel order. Order might have already been processed.');
    }

    // 4. Audit Log
    try {
        await auditLogsModel.insertAuditLog({
            userId: user.id,
            action: 'CANCEL_ORDER',
            tableName: 'orders',
            recordId: orderId,
            details: {
                receipt_no: existingOrder.receipt_no,
                total: existingOrder.total,
                reason: cleanReason
            },
            ipAddress
        });
    } catch (err) {
        console.error('Failed to write audit log for cancelOrder:', err.message);
    }

    return await orderModel.findOrderById(orderId);
};

module.exports = {
    createOrder,
    getOrderById,
    getAllOrders,
    updateOrder,
    cancelOrder
};
