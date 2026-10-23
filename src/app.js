const env = require('./config/env.config');
const express = require('express');
const cors = require('cors');
const { connectDB } = require('./config/db.config');
const path = require('path');
const logger = require('./utils/logger.util');
const errorHandler = require('./middlewares/error-handler');
const notFound = require('./middlewares/not-found');

// Setup Routes
const authRoutes = require('./modules/auth/auth.route');
const auditLogsRoutes = require('./modules/audit-logs/audit-logs.route');
const userRoutes = require('./modules/users/user.route');
const settingsRoutes = require('./modules/settings/setting.route');
const productRoutes = require('./modules/products/product.route');
const inventoryRoutes = require('./modules/inventory/inventory.route');
const shiftRoutes = require('./modules/shifts/shift.route');


const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));


// Register Endpoints
app.use('/api/auth', authRoutes);
app.use('/api', auditLogsRoutes);
app.use('/api', userRoutes);
app.use('/api', settingsRoutes);
app.use('/api', productRoutes)
app.use('/api/inventory', inventoryRoutes)
app.use('/api', shiftRoutes)


// 404 Handler
app.use(notFound);

// Catch Errors
app.use(errorHandler);

const startServer = async () => {
    try {
        await connectDB();

        app.listen(env.port, () => {
            logger.info(`Server is running at http://localhost:${env.port}`);
        });
    } catch (error) {
        logger.error(" fail Server:", error);
        process.exit(1);
    }
};

startServer();



