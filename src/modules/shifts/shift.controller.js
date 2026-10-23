const shiftService = require('./shift.service');

const getCurrentShift = async (req, res, next) => {
    try {
        const shift = await shiftService.getCurrentShift({
            user: req.user,
            targetUserId: req.query.user_id
        });

        if (!shift) {
            return res.status(200).json({
                success: true,
                message: 'No active shift found',
                data: null
            });
        }

        res.status(200).json({
            success: true,
            message: 'Current active shift retrieved successfully',
            data: shift
        });
    } catch (error) {
        next(error);
    }
};

const openShift = async (req, res, next) => {
    try {
        const ipAddress = req.ip || req.socket?.remoteAddress || null;
        const newShift = await shiftService.openShift({
            userId: req.user.id,
            opening_cash_usd: req.body.opening_cash_usd,
            opening_cash_khr: req.body.opening_cash_khr,
            note: req.body.note,
            ipAddress
        });

        res.status(201).json({
            success: true,
            message: 'Shift opened successfully',
            data: newShift
        });
    } catch (error) {
        next(error);
    }
};

const getShiftById = async (req, res, next) => {
    try {
        const shift = await shiftService.getShiftById({
            shiftId: req.params.id,
            user: req.user
        });

        res.status(200).json({
            success: true,
            message: 'Shift retrieved successfully',
            data: shift
        });
    } catch (error) {
        next(error);
    }
};

const closeShift = async (req, res, next) => {
    try {
        const ipAddress = req.ip || req.socket?.remoteAddress || null;
        const closedShift = await shiftService.closeShift({
            shiftId: req.params.id,
            user: req.user,
            closing_cash_usd: req.body.closing_cash_usd,
            closing_cash_khr: req.body.closing_cash_khr,
            note: req.body.note,
            ipAddress
        });

        res.status(200).json({
            success: true,
            message: 'Shift closed successfully',
            data: closedShift
        });
    } catch (error) {
        next(error);
    }
};

const getAllShifts = async (req, res, next) => {
    try {
        const result = await shiftService.getAllShifts({
            user: req.user,
            queryParams: req.query
        });

        res.status(200).json({
            success: true,
            message: 'Shifts retrieved successfully',
            data: result.shifts,
            pagination: result.pagination
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getCurrentShift,
    openShift,
    getShiftById,
    closeShift,
    getAllShifts
};
