const mysql = require('mysql2/promise');
const env = require('./env.config');
const logger = require('../utils/logger.util');

const pool = mysql.createPool({
    host: env.db.host,
    user: env.db.user,
    password: env.db.password,
    database: env.db.name,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const connectDB = async () => {
    try {
        const connection = await pool.getConnection();
        try {
            await connection.query(`
                CREATE TABLE IF NOT EXISTS discount_codes (
                  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  code VARCHAR(50) NOT NULL COMMENT 'Uppercase promo code e.g. VIP10, OPENING20',
                  name VARCHAR(150) NOT NULL COMMENT 'Promotion title/reason shown on receipt',
                  description VARCHAR(500) NULL,
                  discount_type ENUM('PERCENT', 'FIXED') NOT NULL,
                  discount_value DECIMAL(12,2) NOT NULL COMMENT 'Percentage (0.01-100) or Fixed USD amount',
                  min_order_amount DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT 'Minimum order subtotal (USD) required',
                  max_uses INT UNSIGNED NULL COMMENT 'Maximum total times this code can be used (NULL = unlimited)',
                  used_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Number of active/paid orders that used this code',
                  starts_at DATETIME NULL COMMENT 'Optional start date/time of validity',
                  expires_at DATETIME NULL COMMENT 'Optional expiration date/time of validity',
                  is_active BOOLEAN NOT NULL DEFAULT TRUE,
                  created_by BIGINT UNSIGNED NOT NULL COMMENT 'OWNER user who created this discount code',
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                    ON UPDATE CURRENT_TIMESTAMP,

                  UNIQUE KEY uq_discount_codes_code (code),
                  KEY idx_discount_codes_active_dates (is_active, starts_at, expires_at),
                  KEY idx_discount_codes_creator (created_by),

                  CONSTRAINT fk_discount_codes_creator
                    FOREIGN KEY (created_by) REFERENCES users(id),

                  CONSTRAINT chk_discount_codes_code
                    CHECK (CHAR_LENGTH(TRIM(code)) > 0),

                  CONSTRAINT chk_discount_codes_name
                    CHECK (CHAR_LENGTH(TRIM(name)) > 0),

                  CONSTRAINT chk_discount_codes_value CHECK (
                    discount_value > 0
                    AND (
                      discount_type = 'FIXED'
                      OR (discount_type = 'PERCENT' AND discount_value <= 100)
                    )
                  ),

                  CONSTRAINT chk_discount_codes_limits CHECK (
                    min_order_amount >= 0
                    AND (max_uses IS NULL OR max_uses > 0)
                    AND (max_uses IS NULL OR used_count <= max_uses)
                  ),

                  CONSTRAINT chk_discount_codes_dates CHECK (
                    starts_at IS NULL
                    OR expires_at IS NULL
                    OR expires_at > starts_at
                  )
                ) ENGINE=InnoDB;
            `);

            const [colRows] = await connection.query(
                `SHOW COLUMNS FROM orders LIKE 'discount_code_id'`
            );
            if (colRows.length === 0) {
                await connection.query(`
                    ALTER TABLE orders
                      ADD COLUMN discount_code_id BIGINT UNSIGNED NULL AFTER subtotal,
                      ADD KEY idx_orders_discount_code (discount_code_id),
                      ADD CONSTRAINT fk_orders_discount_code
                        FOREIGN KEY (discount_code_id) REFERENCES discount_codes(id)
                        ON DELETE SET NULL
                `);
            }
        } catch (schemaErr) {
            logger.warn(`[WARN] Auto-schema check for discount_codes: ${schemaErr.message}`);
        }
        logger.info(`[INFO] connect Database [${env.db.name}] is success`);
        connection.release();
    } catch (error) {
        logger.error('[ERROR] fail connect Database:', error);
        process.exit(1);
    }
};

module.exports = { connection: pool, connectDB };