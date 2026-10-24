const reportModel = require('./report.model');

const normalizeDateRange = (startDateStr, endDateStr) => {
    let startDate = startDateStr;
    let endDate = endDateStr;

    if (startDate && typeof startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(startDate.trim())) {
        startDate = `${startDate.trim()} 00:00:00`;
    }
    if (endDate && typeof endDate === 'string') {
        const trimmed = endDate.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
            endDate = `${trimmed} 23:59:59`;
        }
    }

    return { startDate, endDate };
};

const getDashboardSummary = async ({ queryParams = {} }) => {
    const { startDate, endDate } = normalizeDateRange(queryParams.start_date, queryParams.end_date);
    const shiftId = queryParams.shift_id ? Number(queryParams.shift_id) : undefined;

    const [ordersStats, refundsStats, expensesStats, paymentsBreakdown] = await Promise.all([
        reportModel.getDashboardOrdersStats({ startDate, endDate, shiftId }),
        reportModel.getDashboardRefundsStats({ startDate, endDate, shiftId }),
        reportModel.getDashboardExpensesStats({ startDate, endDate, shiftId }),
        reportModel.getDashboardPaymentBreakdown({ startDate, endDate, shiftId })
    ]);

    const grossSalesUsd = Number(ordersStats.gross_sales_usd || 0);
    const totalDiscountsUsd = Number(ordersStats.total_discounts_usd || 0);
    const totalRefundedUsd = Number(refundsStats.total_refunded_usd || 0);
    const totalExpensesUsd = Number(expensesStats.total_expenses_usd || 0);

    // Standard Retail Accounting Formulas:
    // Billed Sales = Gross Sales - Discounts
    const billedSalesUsd = Number(Math.max(0, grossSalesUsd - totalDiscountsUsd).toFixed(2));
    // Net Sales = Billed Sales - Total Refunds
    const netSalesUsd = Number(Math.max(0, billedSalesUsd - totalRefundedUsd).toFixed(2));
    // Net Operating Profit = Net Sales - Operating Expenses (No double deduction of refunds)
    const netOperatingProfitUsd = Number((netSalesUsd - totalExpensesUsd).toFixed(2));

    const paidOrdersCount = Number(ordersStats.paid_orders_count || 0);
    const aovUsd = paidOrdersCount > 0
        ? Number((netSalesUsd / paidOrdersCount).toFixed(2))
        : 0;

    return {
        financials: {
            gross_sales_usd: Number(grossSalesUsd.toFixed(2)),
            total_discounts_usd: Number(totalDiscountsUsd.toFixed(2)),
            billed_sales_usd: billedSalesUsd,
            total_refunded_usd: Number(totalRefundedUsd.toFixed(2)),
            total_refunded_khr: Math.round(Number(refundsStats.total_refunded_khr || 0)),
            cash_refunded_usd: Number(Number(refundsStats.cash_refunded_usd || 0).toFixed(2)),
            cash_refunded_khr: Math.round(Number(refundsStats.cash_refunded_khr || 0)),
            net_sales_usd: Number(netSalesUsd.toFixed(2)),
            total_expenses_usd: Number(totalExpensesUsd.toFixed(2)),
            total_expenses_khr: Math.round(Number(expensesStats.total_expenses_khr || 0)),
            cash_expenses_usd: Number(Number(expensesStats.cash_expenses_usd || 0).toFixed(2)),
            cash_expenses_khr: Math.round(Number(expensesStats.cash_expenses_khr || 0)),
            net_operating_profit_usd: netOperatingProfitUsd,
            average_order_value_usd: aovUsd
        },
        orders: {
            total_orders: Number(ordersStats.total_orders_all || 0),
            paid_orders: paidOrdersCount,
            open_orders: Number(ordersStats.open_orders_count || 0),
            cancelled_orders: Number(ordersStats.cancelled_orders_count || 0),
            refunded_orders: Number(ordersStats.refunded_orders_count || 0)
        },
        refunds_count: Number(refundsStats.total_refunds_count || 0),
        expenses_count: Number(expensesStats.total_expenses_count || 0),
        payments_breakdown: paymentsBreakdown
    };
};

const getSalesTrend = async ({ queryParams = {} }) => {
    const { startDate, endDate } = normalizeDateRange(queryParams.start_date, queryParams.end_date);
    const groupBy = queryParams.group_by || 'day';

    const points = await reportModel.getSalesTrend({ startDate, endDate, groupBy });

    let peakPeriod = null;
    let maxSales = -1;

    for (const p of points) {
        if (p.net_sales_usd > maxSales) {
            maxSales = p.net_sales_usd;
            peakPeriod = p.period;
        }
    }

    return {
        group_by: groupBy,
        total_data_points: points.length,
        peak_period: peakPeriod,
        data: points
    };
};

const getTopProducts = async ({ queryParams = {} }) => {
    const { startDate, endDate } = normalizeDateRange(queryParams.start_date, queryParams.end_date);
    const categoryId = queryParams.category_id ? Number(queryParams.category_id) : undefined;
    const limit = queryParams.limit ? Number(queryParams.limit) : 10;

    const products = await reportModel.getTopProducts({ startDate, endDate, categoryId, limit });

    const totalRevenue = products.reduce((acc, p) => acc + Number(p.total_revenue_usd), 0);

    const withPercentages = products.map((p, index) => ({
        rank: index + 1,
        ...p,
        revenue_share_percentage: totalRevenue > 0
            ? Number(((Number(p.total_revenue_usd) / totalRevenue) * 100).toFixed(2))
            : 0
    }));

    return {
        limit,
        total_revenue_sum: Number(totalRevenue.toFixed(2)),
        products: withPercentages
    };
};

const getCategoriesReport = async ({ queryParams = {} }) => {
    const { startDate, endDate } = normalizeDateRange(queryParams.start_date, queryParams.end_date);

    const categories = await reportModel.getCategoriesReport({ startDate, endDate });

    const totalRevenue = categories.reduce((acc, c) => acc + Number(c.total_revenue_usd), 0);

    const withPercentages = categories.map(c => ({
        ...c,
        revenue_share_percentage: totalRevenue > 0
            ? Number(((Number(c.total_revenue_usd) / totalRevenue) * 100).toFixed(2))
            : 0
    }));

    return {
        total_categories: categories.length,
        total_revenue_sum: Number(totalRevenue.toFixed(2)),
        categories: withPercentages
    };
};

const getPaymentMethodsReport = async ({ queryParams = {} }) => {
    const { startDate, endDate } = normalizeDateRange(queryParams.start_date, queryParams.end_date);
    const shiftId = queryParams.shift_id ? Number(queryParams.shift_id) : undefined;

    const methods = await reportModel.getPaymentMethodsReport({ startDate, endDate, shiftId });

    const totalNetRevenueUsd = methods.reduce((acc, m) => acc + Number(m.net_amount_usd || 0), 0);
    const totalGrossRevenueUsd = methods.reduce((acc, m) => acc + Number(m.gross_amount_usd || 0), 0);
    const totalRefundedUsd = methods.reduce((acc, m) => acc + Number(m.refunded_amount_usd || 0), 0);

    const withPercentages = methods.map(m => ({
        ...m,
        revenue_share_percentage: totalNetRevenueUsd > 0
            ? Number(((Number(m.net_amount_usd) / totalNetRevenueUsd) * 100).toFixed(2))
            : 0
    }));

    return {
        summary: {
            total_gross_amount_usd: Number(totalGrossRevenueUsd.toFixed(2)),
            total_refunded_usd: Number(totalRefundedUsd.toFixed(2)),
            total_net_amount_usd: Number(totalNetRevenueUsd.toFixed(2))
        },
        payment_methods: withPercentages
    };
};

const getStaffPerformanceReport = async ({ queryParams = {} }) => {
    const { startDate, endDate } = normalizeDateRange(queryParams.start_date, queryParams.end_date);
    const staffId = queryParams.staff_id ? Number(queryParams.staff_id) : undefined;

    const rawStaffList = await reportModel.getStaffPerformanceReport({ startDate, endDate, staffId });

    const staffWithMetrics = rawStaffList.map(s => {
        const paidOrders = Number(s.paid_orders_count || 0);
        const totalSales = Number(s.total_sales_usd || 0);
        const avgOrderVal = paidOrders > 0
            ? Number((totalSales / paidOrders).toFixed(2))
            : 0;

        return {
            ...s,
            average_order_value_usd: avgOrderVal
        };
    });

    return {
        total_staff_count: staffWithMetrics.length,
        staff: staffWithMetrics
    };
};

const getInventoryUsageReport = async ({ queryParams = {} }) => {
    const { startDate, endDate } = normalizeDateRange(queryParams.start_date, queryParams.end_date);
    const lowStockOnly = queryParams.low_stock_only === true || queryParams.low_stock_only === 'true';

    const ingredients = await reportModel.getInventoryUsageReport({
        startDate,
        endDate,
        lowStockOnly
    });

    const lowStockCount = ingredients.filter(i => i.is_low_stock).length;

    return {
        total_ingredients_count: ingredients.length,
        low_stock_alert_count: lowStockCount,
        ingredients
    };
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
