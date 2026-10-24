const reportService = require('./report.service');

const getDashboardSummary = async (req, res, next) => {
    try {
        const data = await reportService.getDashboardSummary({
            queryParams: req.query
        });

        res.status(200).json({
            success: true,
            message: 'Dashboard report retrieved successfully',
            data
        });
    } catch (error) {
        next(error);
    }
};

const getSalesTrend = async (req, res, next) => {
    try {
        const data = await reportService.getSalesTrend({
            queryParams: req.query
        });

        res.status(200).json({
            success: true,
            message: 'Sales trend report retrieved successfully',
            data
        });
    } catch (error) {
        next(error);
    }
};

const getTopProducts = async (req, res, next) => {
    try {
        const data = await reportService.getTopProducts({
            queryParams: req.query
        });

        res.status(200).json({
            success: true,
            message: 'Top selling products report retrieved successfully',
            data
        });
    } catch (error) {
        next(error);
    }
};

const getCategoriesReport = async (req, res, next) => {
    try {
        const data = await reportService.getCategoriesReport({
            queryParams: req.query
        });

        res.status(200).json({
            success: true,
            message: 'Category sales report retrieved successfully',
            data
        });
    } catch (error) {
        next(error);
    }
};

const getPaymentMethodsReport = async (req, res, next) => {
    try {
        const data = await reportService.getPaymentMethodsReport({
            queryParams: req.query
        });

        res.status(200).json({
            success: true,
            message: 'Payment methods report retrieved successfully',
            data
        });
    } catch (error) {
        next(error);
    }
};

const getStaffPerformanceReport = async (req, res, next) => {
    try {
        const data = await reportService.getStaffPerformanceReport({
            queryParams: req.query
        });

        res.status(200).json({
            success: true,
            message: 'Staff performance report retrieved successfully',
            data
        });
    } catch (error) {
        next(error);
    }
};

const getInventoryUsageReport = async (req, res, next) => {
    try {
        const data = await reportService.getInventoryUsageReport({
            queryParams: req.query
        });

        res.status(200).json({
            success: true,
            message: 'Inventory usage report retrieved successfully',
            data
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getDashboardSummary,
    getSalesTrend,
    getTopProducts,
    getCategoriesReport,
    getPaymentMethodsReport,
    getStaffPerformanceReport,
    getInventoryUsageReport
};
