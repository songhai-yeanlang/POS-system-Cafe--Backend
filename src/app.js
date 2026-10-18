const express = require('express');
const cors = require('cors');
const env = require('./config/env.config');
const { connectDB } = require('./config/db.config');
const path = require('path');
const logger = require('./utils/logger.util');
const errorHandler = require('./middlewares/error-handler');
const notFound = require('./middlewares/not-found');

// Setup Routes
const authRoutes = require('./modules/auth/auth.route');

const app = express();

app.use(cors());
app.use(express.json());


// Register Endpoints
app.use('/api/auth', authRoutes);



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



