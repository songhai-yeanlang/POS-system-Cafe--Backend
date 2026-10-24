const express = require('express');
const router = express.Router();
const reportController = require('./report.controller');
const {
    getDashboardReportSchema,
    getSalesTrendReportSchema,
    getTopProductsReportSchema,
    getCategoriesReportSchema,
    getPaymentMethodsReportSchema,
    getStaffPerformanceReportSchema,
    getInventoryUsageReportSchema
} = require('./report.validation');
const { authenticate, authorize } = require('../../middlewares/authenticate');
const validate = require('../../middlewares/validate');

// Executive Financial Reports (OWNER only)
router.get('/reports/dashboard', authenticate, authorize('OWNER'), validate(getDashboardReportSchema), reportController.getDashboardSummary);
router.get('/reports/sales-trend', authenticate, authorize('OWNER'), validate(getSalesTrendReportSchema), reportController.getSalesTrend);
router.get('/reports/categories', authenticate, authorize('OWNER'), validate(getCategoriesReportSchema), reportController.getCategoriesReport);
router.get('/reports/payment-methods', authenticate, authorize('OWNER'), validate(getPaymentMethodsReportSchema), reportController.getPaymentMethodsReport);
router.get('/reports/staff-performance', authenticate, authorize('OWNER'), validate(getStaffPerformanceReportSchema), reportController.getStaffPerformanceReport);

// Operational & Inventory Reports (Accessible to STAFF & OWNER)
router.get('/reports/top-products', authenticate, validate(getTopProductsReportSchema), reportController.getTopProducts);
router.get('/reports/inventory-usage', authenticate, validate(getInventoryUsageReportSchema), reportController.getInventoryUsageReport);

module.exports = router;
