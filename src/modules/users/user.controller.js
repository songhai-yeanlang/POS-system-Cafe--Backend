const userService = require('./user.service');

const getAllUsers = async (req, res, next) => {
    try {
        const result = await userService.getAllUsers(req.query);
        res.status(200).json({
            success: true,
            message: 'Users retrieved successfully',
            data: result.users,
            pagination: result.pagination
        });
    } catch (error) {
        next(error);
    }
};

const createUser = async (req, res, next) => {
    try {
        const ipAddress = req.ip || req.socket?.remoteAddress || null;
        const newUser = await userService.createUser({
            ...req.body,
            creatorId: req.user?.id,
            ipAddress
        });

        res.status(201).json({
            success: true,
            message: 'User created successfully',
            data: newUser
        });
    } catch (error) {
        next(error);
    }
};

const getUserById = async (req, res, next) => {
    try {
        const user = await userService.getUserById(req.params.id);
        res.status(200).json({
            success: true,
            message: 'User retrieved successfully',
            data: user
        });
    } catch (error) {
        next(error);
    }
};

const updateUser = async (req, res, next) => {
    try {
        const ipAddress = req.ip || req.socket?.remoteAddress || null;
        const updatedUser = await userService.updateUser({
            id: req.params.id,
            updateData: req.body,
            updaterId: req.user?.id,
            ipAddress
        });

        res.status(200).json({
            success: true,
            message: 'User updated successfully',
            data: updatedUser
        });
    } catch (error) {
        next(error);
    }
};

const deleteUser = async (req, res, next) => {
    try {
        const ipAddress = req.ip || req.socket?.remoteAddress || null;
        await userService.deleteUser({
            id: req.params.id,
            removerId: req.user?.id,
            ipAddress
        });

        res.status(200).json({
            success: true,
            message: 'User deleted successfully'
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getAllUsers,
    createUser,
    getUserById,
    updateUser,
    deleteUser
};
