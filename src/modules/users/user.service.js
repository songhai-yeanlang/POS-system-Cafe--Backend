const bcrypt = require('bcryptjs');
const userModel = require('./user.model');
const auditLogsModel = require('../audit-logs/audit-logs.model');
const ApiError = require('../../utils/api-error');

const getAllUsers = async (queryParams = {}) => {
    const page = parseInt(queryParams.page, 10) || 1;
    const limit = parseInt(queryParams.limit, 10) || 20;
    const offset = (page - 1) * limit;

    const filters = {
        role: queryParams.role,
        isActive: queryParams.is_active,
        search: queryParams.search,
        limit,
        offset
    };

    const [users, total] = await Promise.all([
        userModel.findUsers(filters),
        userModel.countUsers(filters)
    ]);

    return {
        users,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        }
    };
};

const createUser = async ({ name, email, password, role = 'STAFF', is_active = true, creatorId, ipAddress }) => {
    // 1. Check if email is already taken
    const existingUser = await userModel.findUserByEmail(email);
    if (existingUser) {
        throw ApiError.conflict('Email is already registered');
    }

    // 2. Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // 3. Insert user into database
    const newUserId = await userModel.insertUser({
        name,
        email,
        passwordHash,
        role,
        isActive: is_active
    });

    // 4. Audit log
    try {
        await auditLogsModel.insertAuditLog({
            userId: creatorId || null,
            action: 'CREATE_USER',
            tableName: 'users',
            recordId: newUserId,
            details: { name, email, role },
            ipAddress
        });
    } catch (err) {
        console.error('Failed to write audit log for createUser:', err.message);
    }

    // 5. Return sanitized user object
    return await userModel.findUserById(newUserId);
};

const getUserById = async (id) => {
    const user = await userModel.findUserById(id);
    if (!user) {
        throw ApiError.notFound(`User with ID ${id} not found`);
    }
    return user;
};

const updateUser = async ({ id, updateData, updaterId, ipAddress }) => {
    // 1. Verify user exists
    const existingUser = await userModel.findUserById(id);
    if (!existingUser) {
        throw ApiError.notFound(`User with ID ${id} not found`);
    }

    // 2. Prevent Owner self-lockout
    if (Number(id) === Number(updaterId)) {
        if (updateData.is_active === false) {
            throw ApiError.badRequest('You cannot deactivate your own account');
        }
        if (updateData.role === 'STAFF') {
            throw ApiError.badRequest('You cannot demote your own account from OWNER to STAFF');
        }
    }

    // 3. Prevent deactivating or demoting the last active OWNER
    if (existingUser.role === 'OWNER' && (updateData.is_active === false || updateData.role === 'STAFF')) {
        const activeOwners = await userModel.countActiveOwners();
        if (activeOwners <= 1) {
            throw ApiError.badRequest('Cannot deactivate or demote the only remaining active OWNER in the system');
        }
    }

    // 4. Check email uniqueness if changing email
    if (updateData.email && updateData.email !== existingUser.email) {
        const emailTaken = await userModel.findUserByEmailExcludeId(updateData.email, id);
        if (emailTaken) {
            throw ApiError.conflict('Email is already registered by another user');
        }
    }

    const payload = {};
    if (updateData.name !== undefined) payload.name = updateData.name;
    if (updateData.email !== undefined) payload.email = updateData.email;
    if (updateData.role !== undefined) payload.role = updateData.role;
    if (updateData.is_active !== undefined) payload.isActive = updateData.is_active;

    // 5. Hash password if provided
    let passwordChanged = false;
    if (updateData.password) {
        const salt = await bcrypt.genSalt(10);
        payload.passwordHash = await bcrypt.hash(updateData.password, salt);
        passwordChanged = true;
    }

    // 6. Update in database
    await userModel.updateUserById(id, payload);

    // 7. Security: If deactivated, password changed, or role changed, revoke active sessions
    if (updateData.is_active === false || passwordChanged || updateData.role) {
        await userModel.revokeUserSessions(id);
    }

    // 8. Audit log
    try {
        await auditLogsModel.insertAuditLog({
            userId: updaterId || null,
            action: 'UPDATE_USER',
            tableName: 'users',
            recordId: id,
            details: {
                changedFields: Object.keys(updateData),
                deactivated: updateData.is_active === false,
                passwordReset: passwordChanged
            },
            ipAddress
        });
    } catch (err) {
        console.error('Failed to write audit log for updateUser:', err.message);
    }

    // 9. Return sanitized updated user
    return await userModel.findUserById(id);
};

const deleteUser = async ({ id, removerId, ipAddress }) => {
    // 1. Verify user exists
    const user = await userModel.findUserById(id);
    if (!user) {
        throw ApiError.notFound(`User with ID ${id} not found`);
    }

    // 2. Prevent self-deletion
    if (Number(id) === Number(removerId)) {
        throw ApiError.badRequest('You cannot delete your own account');
    }

    // 3. Prevent deleting the last remaining active OWNER
    if (user.role === 'OWNER') {
        const activeOwners = await userModel.countActiveOwners();
        if (activeOwners <= 1) {
            throw ApiError.badRequest('Cannot delete the only remaining active OWNER in the system');
        }
    }

    // 4. Check if user has transaction history (orders, shifts, expenses)
    const hasTransactions = await userModel.checkUserHasTransactions(id);
    if (hasTransactions) {
        throw ApiError.badRequest(
            'Cannot delete this user because they have transaction history (orders, shifts, or expenses). Please deactivate the user instead to preserve sales records.'
        );
    }

    // 5. Revoke all active sessions for this user
    await userModel.revokeUserSessions(id);

    // 6. Delete user from database
    await userModel.deleteUserById(id);

    // 7. Audit log
    try {
        await auditLogsModel.insertAuditLog({
            userId: removerId || null,
            action: 'DELETE_USER',
            tableName: 'users',
            recordId: id,
            details: { name: user.name, email: user.email, role: user.role },
            ipAddress
        });
    } catch (err) {
        console.error('Failed to write audit log for deleteUser:', err.message);
    }

    return true;
};

module.exports = {
    getAllUsers,
    createUser,
    getUserById,
    updateUser,
    deleteUser
};
