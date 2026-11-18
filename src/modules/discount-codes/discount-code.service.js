const discountCodeModel = require('./discount-code.model');
const auditLogsModel = require('../audit-logs/audit-logs.model');
const ApiError = require('../../utils/api-error');

const normalizeDateValue = (val, { endOfDay = false } = {}) => {
    if (val === undefined) return undefined;
    if (val === null || val === '') return null;
    if (typeof val === 'string') {
        const trimmed = val.trim();
        if (!trimmed) return null;
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
            return endOfDay ? `${trimmed} 23:59:59` : `${trimmed} 00:00:00`;
        }
    }
    const parsed = new Date(val);
    if (isNaN(parsed.getTime())) {
        throw ApiError.badRequest('Invalid date value provided');
    }
    return parsed;
};

const toTimestamp = (val) => {
    if (!val) return null;
    if (val instanceof Date) return val.getTime();
    const d = new Date(typeof val === 'string' ? val.replace(' ', 'T') : val);
    return isNaN(d.getTime()) ? null : d.getTime();
};

const createDiscountCode = async ({ user, data, ipAddress }) => {
    const cleanCode = String(data.code || '').trim().toUpperCase();
    const cleanName = String(data.name || '').trim();
    const cleanDescription = data.description && String(data.description).trim()
        ? String(data.description).trim()
        : null;
    const discountType = data.discount_type;
    const discountValue = Number(Number(data.discount_value).toFixed(2));
    const minOrderAmount = Number(Number(data.min_order_amount || 0).toFixed(2));
    const maxUses = data.max_uses !== undefined && data.max_uses !== null && data.max_uses !== ''
        ? Number(data.max_uses)
        : null;
    const startsAt = normalizeDateValue(data.starts_at, { endOfDay: false }) ?? null;
    const expiresAt = normalizeDateValue(data.expires_at, { endOfDay: true }) ?? null;
    const isActive = data.is_active !== undefined ? Boolean(data.is_active) : true;

    if (discountType === 'PERCENT' && discountValue > 100) {
        throw ApiError.badRequest('Percentage discount value cannot exceed 100%');
    }

    if (startsAt && expiresAt && toTimestamp(expiresAt) <= toTimestamp(startsAt)) {
        throw ApiError.badRequest('Expiration date (expires_at) must be after start date (starts_at)');
    }

    const existing = await discountCodeModel.findDiscountCodeByCode(cleanCode);
    if (existing) {
        throw ApiError.conflict(`Discount code '${cleanCode}' already exists`);
    }

    const createdId = await discountCodeModel.insertDiscountCode({
        code: cleanCode,
        name: cleanName,
        description: cleanDescription,
        discountType,
        discountValue,
        minOrderAmount,
        maxUses,
        startsAt,
        expiresAt,
        isActive,
        createdBy: user.id
    });

    const createdRecord = await discountCodeModel.findDiscountCodeById(createdId);

    try {
        await auditLogsModel.insertAuditLog({
            userId: user.id,
            action: 'CREATE_DISCOUNT_CODE',
            tableName: 'discount_codes',
            recordId: createdId,
            details: {
                code: cleanCode,
                name: cleanName,
                discount_type: discountType,
                discount_value: discountValue,
                min_order_amount: minOrderAmount,
                max_uses: maxUses,
                starts_at: startsAt,
                expires_at: expiresAt,
                is_active: isActive
            },
            ipAddress
        });
    } catch (err) {
        console.error('Failed to write audit log for createDiscountCode:', err.message);
    }

    return createdRecord;
};

const getAllDiscountCodes = async ({ queryParams = {} }) => {
    const page = Math.max(1, parseInt(queryParams.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(queryParams.limit, 10) || 50));
    const offset = (page - 1) * limit;

    const filters = {
        search: queryParams.search ? String(queryParams.search).trim() : undefined,
        discountType: queryParams.discount_type,
        isActive: queryParams.is_active,
        validOnly: queryParams.valid_only
    };

    const [discountCodes, total] = await Promise.all([
        discountCodeModel.findAllDiscountCodes({ ...filters, limit, offset }),
        discountCodeModel.countAllDiscountCodes(filters)
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
        discountCodes,
        pagination: {
            page,
            limit,
            total,
            totalPages,
            current_page: page,
            total_items: total,
            total_pages: totalPages
        }
    };
};

const getDiscountCodeById = async ({ id }) => {
    const record = await discountCodeModel.findDiscountCodeById(id);
    if (!record) {
        throw ApiError.notFound(`Discount code #${id} not found`);
    }
    return record;
};

const updateDiscountCode = async ({ id, user, updateData, ipAddress }) => {
    const existing = await discountCodeModel.findDiscountCodeById(id);
    if (!existing) {
        throw ApiError.notFound(`Discount code #${id} not found`);
    }

    const fieldsToUpdate = {};

    if (updateData.code !== undefined) {
        const cleanCode = String(updateData.code).trim().toUpperCase();
        if (cleanCode !== existing.code) {
            const duplicate = await discountCodeModel.findDiscountCodeByCode(cleanCode);
            if (duplicate && duplicate.id !== existing.id) {
                throw ApiError.conflict(`Discount code '${cleanCode}' already exists`);
            }
        }
        fieldsToUpdate.code = cleanCode;
    }

    if (updateData.name !== undefined) {
        fieldsToUpdate.name = String(updateData.name).trim();
    }

    if (updateData.description !== undefined) {
        fieldsToUpdate.description = updateData.description && String(updateData.description).trim()
            ? String(updateData.description).trim()
            : null;
    }

    const nextType = updateData.discount_type !== undefined ? updateData.discount_type : existing.discount_type;
    const nextValue = updateData.discount_value !== undefined
        ? Number(Number(updateData.discount_value).toFixed(2))
        : existing.discount_value;

    if (nextType === 'PERCENT' && nextValue > 100) {
        throw ApiError.badRequest('Percentage discount value cannot exceed 100%');
    }

    if (updateData.discount_type !== undefined) {
        fieldsToUpdate.discount_type = nextType;
    }
    if (updateData.discount_value !== undefined) {
        fieldsToUpdate.discount_value = nextValue;
    }

    if (updateData.min_order_amount !== undefined) {
        fieldsToUpdate.min_order_amount = Number(Number(updateData.min_order_amount).toFixed(2));
    }

    if (updateData.max_uses !== undefined) {
        const nextMaxUses = updateData.max_uses === null || updateData.max_uses === ''
            ? null
            : Number(updateData.max_uses);
        if (nextMaxUses !== null && nextMaxUses < existing.used_count) {
            throw ApiError.badRequest(
                `max_uses (${nextMaxUses}) cannot be less than already used_count (${existing.used_count})`
            );
        }
        fieldsToUpdate.max_uses = nextMaxUses;
    }

    const nextStartsAt = updateData.starts_at !== undefined
        ? normalizeDateValue(updateData.starts_at, { endOfDay: false })
        : (existing.starts_at ? new Date(existing.starts_at) : null);
    const nextExpiresAt = updateData.expires_at !== undefined
        ? normalizeDateValue(updateData.expires_at, { endOfDay: true })
        : (existing.expires_at ? new Date(existing.expires_at) : null);

    if (nextStartsAt && nextExpiresAt && toTimestamp(nextExpiresAt) <= toTimestamp(nextStartsAt)) {
        throw ApiError.badRequest('Expiration date (expires_at) must be after start date (starts_at)');
    }

    if (updateData.starts_at !== undefined) {
        fieldsToUpdate.starts_at = nextStartsAt;
    }
    if (updateData.expires_at !== undefined) {
        fieldsToUpdate.expires_at = nextExpiresAt;
    }

    if (updateData.is_active !== undefined) {
        fieldsToUpdate.is_active = Boolean(updateData.is_active);
    }

    await discountCodeModel.updateDiscountCodeById(id, fieldsToUpdate);
    const updated = await discountCodeModel.findDiscountCodeById(id);

    try {
        await auditLogsModel.insertAuditLog({
            userId: user.id,
            action: 'UPDATE_DISCOUNT_CODE',
            tableName: 'discount_codes',
            recordId: Number(id),
            details: {
                updated_fields: fieldsToUpdate
            },
            ipAddress
        });
    } catch (err) {
        console.error('Failed to write audit log for updateDiscountCode:', err.message);
    }

    return updated;
};

const deleteDiscountCode = async ({ id, user, ipAddress }) => {
    const existing = await discountCodeModel.findDiscountCodeById(id);
    if (!existing) {
        throw ApiError.notFound(`Discount code #${id} not found`);
    }

    const linkedOrdersCount = await discountCodeModel.countOrdersUsingDiscountCode(id);
    if (existing.used_count > 0 || linkedOrdersCount > 0) {
        throw ApiError.badRequest(
            `Cannot delete discount code '${existing.code}' because it has been used in orders. Deactivate it (is_active = false) instead.`
        );
    }

    await discountCodeModel.deleteDiscountCodeById(id);

    try {
        await auditLogsModel.insertAuditLog({
            userId: user.id,
            action: 'DELETE_DISCOUNT_CODE',
            tableName: 'discount_codes',
            recordId: Number(id),
            details: {
                code: existing.code,
                name: existing.name,
                used_count: existing.used_count
            },
            ipAddress
        });
    } catch (err) {
        console.error('Failed to write audit log for deleteDiscountCode:', err.message);
    }

    return existing;
};

const validateAndPreviewDiscountCode = async ({ code, subtotal, orderId = null }) => {
    const cleanCode = String(code || '').trim().toUpperCase();
    const record = await discountCodeModel.findDiscountCodeByCode(cleanCode);

    if (!record) {
        throw ApiError.notFound(`Discount code '${cleanCode}' does not exist`);
    }

    if (!record.is_active) {
        throw ApiError.badRequest(`Discount code '${record.code}' is currently inactive`);
    }

    if (record.is_not_started) {
        throw ApiError.badRequest(`Discount code '${record.code}' is not active until ${new Date(record.starts_at).toISOString()}`);
    }

    if (record.is_expired) {
        throw ApiError.badRequest(`Discount code '${record.code}' has expired`);
    }

    if (record.is_exhausted) {
        const alreadyHeldByOrder = orderId
            ? await discountCodeModel.isDiscountCodeHeldByOrder(record.id, orderId)
            : false;
        if (!alreadyHeldByOrder) {
            throw ApiError.badRequest(`Discount code '${record.code}' has reached its maximum usage limit (${record.max_uses})`);
        }
    }

    let calculatedDiscountAmount = null;
    let finalTotal = null;

    if (subtotal !== undefined && subtotal !== null) {
        const numericSubtotal = Number(subtotal);
        if (numericSubtotal < record.min_order_amount) {
            throw ApiError.badRequest(
                `Order subtotal ($${numericSubtotal.toFixed(2)}) does not meet the minimum required amount ($${record.min_order_amount.toFixed(2)}) for code '${record.code}'`
            );
        }

        if (record.discount_type === 'PERCENT') {
            calculatedDiscountAmount = Number(
                (Math.round(((numericSubtotal * record.discount_value) / 100) * 100) / 100).toFixed(2)
            );
        } else {
            if (record.discount_value > numericSubtotal) {
                throw ApiError.badRequest(
                    `Fixed discount ($${record.discount_value.toFixed(2)}) for code '${record.code}' cannot exceed order subtotal ($${numericSubtotal.toFixed(2)})`
                );
            }
            calculatedDiscountAmount = Number(record.discount_value.toFixed(2));
        }

        finalTotal = Number(Math.max(0, numericSubtotal - calculatedDiscountAmount).toFixed(2));
    }

    return {
        ...record,
        calculated_discount_amount: calculatedDiscountAmount,
        final_total: finalTotal
    };
};

module.exports = {
    createDiscountCode,
    getAllDiscountCodes,
    getDiscountCodeById,
    updateDiscountCode,
    deleteDiscountCode,
    validateAndPreviewDiscountCode
};
