-- Target: MySQL 8.0.16+ / MySQL 8.4 LTS (InnoDB)
CREATE DATABASE IF NOT EXISTS coffee_pos
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE coffee_pos;

SET NAMES utf8mb4;
SET time_zone = '+00:00';


-- ==========================================================
-- 1. USERS
-- ==========================================================
CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('OWNER', 'STAFF') NOT NULL DEFAULT 'STAFF',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_users_email (email),
  CONSTRAINT chk_users_name CHECK (CHAR_LENGTH(TRIM(name)) > 0),
  CONSTRAINT chk_users_email CHECK (CHAR_LENGTH(TRIM(email)) > 0)
) ENGINE=InnoDB;


-- ==========================================================
-- 2. SETTINGS
-- ==========================================================
CREATE TABLE IF NOT EXISTS settings (
  id TINYINT UNSIGNED PRIMARY KEY,
  shop_name VARCHAR(150) NOT NULL,
  address TEXT NULL,
  phone VARCHAR(30) NULL,
  logo VARCHAR(500) NULL,
  base_currency ENUM('USD') NOT NULL DEFAULT 'USD',
  exchange_rate DECIMAL(14,6) NULL
    COMMENT 'KHR per USD; configure before use',
  receipt_footer VARCHAR(500) NULL,
  receipt_width ENUM('58', '80') NOT NULL DEFAULT '80',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT chk_settings_singleton CHECK (id = 1),
  CONSTRAINT chk_settings_rate
    CHECK (exchange_rate IS NULL OR exchange_rate > 0)
) ENGINE=InnoDB;


-- ==========================================================
-- 3. CATEGORIES
-- ==========================================================
CREATE TABLE IF NOT EXISTS categories (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_categories_name (name),
  CONSTRAINT chk_categories_name CHECK (CHAR_LENGTH(TRIM(name)) > 0)
) ENGINE=InnoDB;


-- ==========================================================
-- 4. PRODUCTS
-- ==========================================================
CREATE TABLE IF NOT EXISTS products (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  product_type ENUM('DRINK', 'FOOD', 'ADDON')
    NOT NULL DEFAULT 'DRINK',
  description TEXT NULL,
  image VARCHAR(500) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  KEY idx_products_category (category_id),

  CONSTRAINT fk_products_category
    FOREIGN KEY (category_id) REFERENCES categories(id),
  CONSTRAINT chk_products_name CHECK (CHAR_LENGTH(TRIM(name)) > 0)
) ENGINE=InnoDB;


-- ==========================================================
-- 5. PRODUCT VARIANTS
-- ==========================================================
CREATE TABLE IF NOT EXISTS product_variants (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  size VARCHAR(30) NULL,
  temperature ENUM('HOT', 'ICED', 'NONE')
    NOT NULL DEFAULT 'NONE',
  price DECIMAL(12,2) NOT NULL COMMENT 'USD',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_variants_product_name (product_id, name),

  CONSTRAINT fk_variants_product
    FOREIGN KEY (product_id) REFERENCES products(id)
    ON DELETE CASCADE,

  CONSTRAINT chk_variants_name CHECK (CHAR_LENGTH(TRIM(name)) > 0),
  CONSTRAINT chk_variants_price CHECK (price >= 0)
) ENGINE=InnoDB;


-- ==========================================================
-- 6. INGREDIENTS
-- ==========================================================
CREATE TABLE IF NOT EXISTS ingredients (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  unit ENUM('G', 'ML', 'PCS') NOT NULL,
  current_stock DECIMAL(14,4) NOT NULL DEFAULT 0,
  minimum_stock DECIMAL(14,4) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_ingredients_name (name),

  CONSTRAINT chk_ingredients_name CHECK (CHAR_LENGTH(TRIM(name)) > 0),
  CONSTRAINT chk_ingredients_minimum
    CHECK (minimum_stock >= 0 AND current_stock >= 0)
) ENGINE=InnoDB;


-- ==========================================================
-- 7. RECIPES
-- ==========================================================
CREATE TABLE IF NOT EXISTS recipes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  variant_id BIGINT UNSIGNED NOT NULL,
  ingredient_id BIGINT UNSIGNED NOT NULL,
  quantity DECIMAL(14,4) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_recipes_variant_ingredient
    (variant_id, ingredient_id),

  CONSTRAINT fk_recipes_variant
    FOREIGN KEY (variant_id) REFERENCES product_variants(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_recipes_ingredient
    FOREIGN KEY (ingredient_id) REFERENCES ingredients(id),

  CONSTRAINT chk_recipes_quantity CHECK (quantity > 0)
) ENGINE=InnoDB;


-- ==========================================================
-- 8. SHIFTS
-- ==========================================================
CREATE TABLE IF NOT EXISTS shifts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  opened_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME NULL,
  opening_cash_usd DECIMAL(14,2) NOT NULL DEFAULT 0,
  opening_cash_khr DECIMAL(14,2) NOT NULL DEFAULT 0,
  expected_cash_usd DECIMAL(14,2) NULL COMMENT 'System calculated USD at shift close',
  expected_cash_khr DECIMAL(14,2) NULL COMMENT 'System calculated KHR at shift close',
  closing_cash_usd DECIMAL(14,2) NULL COMMENT 'Actual counted USD by staff',
  closing_cash_khr DECIMAL(14,2) NULL COMMENT 'Actual counted KHR by staff',
  status ENUM('OPEN', 'CLOSED') NOT NULL DEFAULT 'OPEN',
  note VARCHAR(500) NULL,

  open_user_id BIGINT UNSIGNED GENERATED ALWAYS AS (
    CASE WHEN status = 'OPEN' THEN user_id ELSE NULL END
  ) STORED,

  UNIQUE KEY uq_shifts_one_open_per_user (open_user_id),
  KEY idx_shifts_user_date (user_id, opened_at),

  CONSTRAINT fk_shifts_user
    FOREIGN KEY (user_id) REFERENCES users(id),

  CONSTRAINT chk_shifts_cash CHECK (
    opening_cash_usd >= 0
    AND opening_cash_khr >= 0
    AND (expected_cash_usd IS NULL OR expected_cash_usd >= 0)
    AND (expected_cash_khr IS NULL OR expected_cash_khr >= 0)
    AND (closing_cash_usd IS NULL OR closing_cash_usd >= 0)
    AND (closing_cash_khr IS NULL OR closing_cash_khr >= 0)
  ),

  CONSTRAINT chk_shifts_closing CHECK (
    (
      status = 'OPEN'
      AND closed_at IS NULL
      AND expected_cash_usd IS NULL
      AND expected_cash_khr IS NULL
      AND closing_cash_usd IS NULL
      AND closing_cash_khr IS NULL
    )
    OR
    (
      status = 'CLOSED'
      AND closed_at IS NOT NULL
      AND closed_at >= opened_at
      AND expected_cash_usd IS NOT NULL
      AND expected_cash_khr IS NOT NULL
      AND closing_cash_usd IS NOT NULL
      AND closing_cash_khr IS NOT NULL
    )
  )
) ENGINE=InnoDB;


-- ==========================================================
-- 9. ORDERS (Fixed: DB-01, DB-08, NEW-01, NEW-02)
-- ==========================================================
CREATE TABLE IF NOT EXISTS orders (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  receipt_no VARCHAR(50) NOT NULL,
  queue_no INT UNSIGNED NULL COMMENT 'Daily waiting number e.g. 1, 2, 3',
  cashier_id BIGINT UNSIGNED NOT NULL,
  shift_id BIGINT UNSIGNED NOT NULL,
  order_type ENUM('DINE_IN', 'TAKEAWAY')
    NOT NULL DEFAULT 'TAKEAWAY',
  table_no VARCHAR(20) NULL,
  status ENUM('OPEN', 'PAID', 'CANCELLED', 'REFUNDED')
    NOT NULL DEFAULT 'OPEN',

  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount_type ENUM('NONE', 'PERCENT', 'FIXED') NOT NULL DEFAULT 'NONE',
  discount_value DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount_approved_by BIGINT UNSIGNED NULL,
  discount_reason VARCHAR(255) NULL,

  total DECIMAL(12,2) GENERATED ALWAYS AS (
    subtotal - discount_amount
  ) STORED,

  note VARCHAR(500) NULL,
  paid_at DATETIME NULL,
  cancelled_at DATETIME NULL,
  cancelled_by BIGINT UNSIGNED NULL,
  cancellation_reason VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_orders_receipt (receipt_no),
  KEY idx_orders_status_date (status, created_at),
  KEY idx_orders_cashier_date (cashier_id, created_at),
  KEY idx_orders_shift (shift_id),

  CONSTRAINT fk_orders_cashier
    FOREIGN KEY (cashier_id) REFERENCES users(id),

  CONSTRAINT fk_orders_shift
    FOREIGN KEY (shift_id) REFERENCES shifts(id),

  CONSTRAINT fk_orders_discount_owner
    FOREIGN KEY (discount_approved_by) REFERENCES users(id),

  CONSTRAINT fk_orders_cancelled_by
    FOREIGN KEY (cancelled_by) REFERENCES users(id),

  CONSTRAINT chk_orders_table CHECK (
    (order_type = 'DINE_IN' AND (table_no IS NULL OR CHAR_LENGTH(TRIM(table_no)) > 0))
    OR (order_type = 'TAKEAWAY' AND table_no IS NULL)
  ),

  CONSTRAINT chk_orders_amounts CHECK (
    subtotal >= 0
    AND discount_value >= 0
    AND discount_amount >= 0
    AND discount_amount <= subtotal
    AND (
      (
        discount_type = 'NONE'
        AND discount_value = 0
        AND discount_amount = 0
      )
      OR
      (
        discount_type = 'FIXED'
        AND discount_amount = discount_value
      )
      OR
      (
        discount_type = 'PERCENT'
        AND discount_value <= 100
        AND discount_amount = ROUND((subtotal * discount_value) / 100, 2)
      )
    )
  ),

  CONSTRAINT chk_orders_discount_approval CHECK (
    (
      discount_type = 'NONE'
      AND discount_value = 0
      AND discount_amount = 0
      AND discount_approved_by IS NULL
      AND discount_reason IS NULL
    )
    OR
    (
      discount_type IN ('PERCENT', 'FIXED')
      AND discount_value > 0
      AND discount_approved_by IS NOT NULL
      AND discount_reason IS NOT NULL
      AND CHAR_LENGTH(TRIM(discount_reason)) > 0
    )
  ),

  CONSTRAINT chk_orders_paid_time CHECK (
    (status IN ('PAID', 'REFUNDED') AND paid_at IS NOT NULL AND subtotal > 0)
    OR (status NOT IN ('PAID', 'REFUNDED') AND paid_at IS NULL)
  ),

  CONSTRAINT chk_orders_cancellation CHECK (
    (
      status = 'CANCELLED'
      AND cancelled_at IS NOT NULL
      AND cancelled_by IS NOT NULL
      AND cancellation_reason IS NOT NULL
      AND CHAR_LENGTH(TRIM(cancellation_reason)) > 0
    )
    OR
    (
      status <> 'CANCELLED'
      AND cancelled_at IS NULL
      AND cancelled_by IS NULL
      AND cancellation_reason IS NULL
    )
  )
) ENGINE=InnoDB;


-- ==========================================================
-- 10. ORDER ITEMS
-- ==========================================================
CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NOT NULL,
  product_name_snapshot VARCHAR(150) NOT NULL,
  variant_name_snapshot VARCHAR(100) NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL COMMENT 'USD per item',

  line_total DECIMAL(14,2) GENERATED ALWAYS AS (
    quantity * unit_price
  ) STORED,

  sugar_level TINYINT UNSIGNED NULL
    COMMENT 'Percentage; NULL when not applicable',
  ice_level ENUM('NONE', 'LESS', 'NORMAL', 'EXTRA') NULL,
  note VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  KEY idx_order_items_order (order_id),

  CONSTRAINT fk_order_items_order
    FOREIGN KEY (order_id) REFERENCES orders(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_order_items_variant
    FOREIGN KEY (variant_id) REFERENCES product_variants(id),

  CONSTRAINT chk_order_items_amounts
    CHECK (quantity > 0 AND unit_price >= 0),

  CONSTRAINT chk_order_items_sugar
    CHECK (sugar_level IS NULL OR sugar_level <= 100)
) ENGINE=InnoDB;


-- ==========================================================
-- 11. ORDER ITEM ADD-ONS
-- ==========================================================
CREATE TABLE IF NOT EXISTS order_item_addons (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_item_id BIGINT UNSIGNED NOT NULL,
  addon_variant_id BIGINT UNSIGNED NOT NULL,
  addon_name_snapshot VARCHAR(150) NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL COMMENT 'USD per add-on',

  line_total DECIMAL(14,2) GENERATED ALWAYS AS (
    quantity * unit_price
  ) STORED,

  KEY idx_order_addons_item (order_item_id),

  CONSTRAINT fk_order_addons_item
    FOREIGN KEY (order_item_id) REFERENCES order_items(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_order_addons_variant
    FOREIGN KEY (addon_variant_id) REFERENCES product_variants(id),

  CONSTRAINT chk_order_addons_amounts
    CHECK (quantity > 0 AND unit_price >= 0)
) ENGINE=InnoDB;


-- ==========================================================
-- 12. PAYMENTS (Fixed: DB-02, DB-03, DB-09, NEW-03)
-- Added khr_per_usd snapshot so USD payments giving KHR change
-- preserve the exact historical KHR/USD exchange rate.
-- ==========================================================
CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  shift_id BIGINT UNSIGNED NOT NULL,
  received_by BIGINT UNSIGNED NOT NULL,
  method ENUM('CASH', 'KHQR') NOT NULL,
  currency ENUM('USD', 'KHR') NOT NULL,
  amount DECIMAL(14,2) NOT NULL COMMENT 'Bill amount in payment currency, excluding change',
  exchange_rate DECIMAL(14,6) NOT NULL COMMENT '1 for USD; KHR per USD for KHR',
  khr_per_usd DECIMAL(14,6) NOT NULL COMMENT 'Historical shop KHR/USD rate snapshot at payment time',
  amount_usd DECIMAL(14,2) NOT NULL COMMENT 'Equivalent USD applied to order total',

  received_amount DECIMAL(14,2) NULL COMMENT 'Cash handed by customer in payment currency',
  change_usd DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'Physical USD cash given as change',
  change_khr DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'Physical KHR cash given as change',

  status ENUM('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED')
    NOT NULL DEFAULT 'PENDING',
  reference VARCHAR(150) NULL,
  idempotency_key VARCHAR(100) NOT NULL,
  paid_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_payments_id_order (id, order_id),
  UNIQUE KEY uq_payments_request (idempotency_key),
  UNIQUE KEY uq_payments_reference (method, reference),
  KEY idx_payments_order_status (order_id, status),
  KEY idx_payments_shift_status (shift_id, status),
  KEY idx_payments_paid_date (status, paid_at),

  CONSTRAINT fk_payments_order
    FOREIGN KEY (order_id) REFERENCES orders(id),

  CONSTRAINT fk_payments_shift
    FOREIGN KEY (shift_id) REFERENCES shifts(id),

  CONSTRAINT fk_payments_receiver
    FOREIGN KEY (received_by) REFERENCES users(id),

  CONSTRAINT chk_payments_amount CHECK (
    amount > 0
    AND amount_usd > 0
    AND change_usd >= 0
    AND change_khr >= 0
  ),

  CONSTRAINT chk_payments_rate CHECK (
    exchange_rate > 0
    AND khr_per_usd > 0
    AND (
      (currency = 'USD' AND exchange_rate = 1)
      OR (currency = 'KHR' AND exchange_rate = khr_per_usd)
    )
  ),

  CONSTRAINT chk_payments_math CHECK (
    (
      currency = 'USD' AND amount_usd = amount
    )
    OR
    (
      currency = 'KHR' AND ABS(amount_usd - ROUND(amount / exchange_rate, 2)) <= 0.05
    )
  ),

  CONSTRAINT chk_payments_cash CHECK (
    (
      method = 'CASH'
      AND received_amount IS NOT NULL
      AND received_amount >= amount
      AND (
        -- Same-currency USD change: exact match required
        (currency = 'USD' AND change_khr = 0 AND received_amount - amount = change_usd)
        -- Same-currency KHR change: exact match required
        OR (currency = 'KHR' AND change_usd = 0 AND received_amount - amount = change_khr)
        -- Cross-currency change: allow <= $0.05 tolerance for 100-KHR banknote rounding
        OR (
          ABS(
            ((received_amount - amount) / exchange_rate)
            - (change_usd + (change_khr / khr_per_usd))
          ) <= 0.05
        )
      )
    )
    OR
    (
      method = 'KHQR'
      AND (received_amount IS NULL OR received_amount = amount)
      AND change_usd = 0
      AND change_khr = 0
    )
  ),

  CONSTRAINT chk_payments_completed CHECK (
    (
      status = 'COMPLETED'
      AND paid_at IS NOT NULL
      AND (
        method <> 'KHQR'
        OR (reference IS NOT NULL AND CHAR_LENGTH(TRIM(reference)) > 0)
      )
    )
    OR
    (
      status <> 'COMPLETED'
      AND paid_at IS NULL
    )
  )
) ENGINE=InnoDB;


-- ==========================================================
-- 13. REFUNDS (Fixed: DB-03, DB-08, NEW-03)
-- ==========================================================
CREATE TABLE IF NOT EXISTS refunds (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  payment_id BIGINT UNSIGNED NOT NULL,
  shift_id BIGINT UNSIGNED NOT NULL,
  approved_by BIGINT UNSIGNED NOT NULL,
  method ENUM('CASH', 'KHQR') NOT NULL,
  currency ENUM('USD', 'KHR') NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  exchange_rate DECIMAL(14,6) NOT NULL,
  khr_per_usd DECIMAL(14,6) NOT NULL COMMENT 'Copied from original payment khr_per_usd',
  amount_usd DECIMAL(14,2) NOT NULL COMMENT 'Copied from original payment amount_usd',

  reason VARCHAR(500) NOT NULL,
  status ENUM('PENDING', 'COMPLETED', 'FAILED')
    NOT NULL DEFAULT 'PENDING',
  reference VARCHAR(150) NULL,
  refunded_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_refunds_payment (payment_id),
  KEY idx_refunds_order (order_id),
  KEY idx_refunds_shift_status (shift_id, status),
  KEY idx_refunds_date (status, refunded_at),

  CONSTRAINT fk_refunds_payment_order
    FOREIGN KEY (payment_id, order_id)
    REFERENCES payments(id, order_id),

  CONSTRAINT fk_refunds_shift
    FOREIGN KEY (shift_id) REFERENCES shifts(id),

  CONSTRAINT fk_refunds_approver
    FOREIGN KEY (approved_by) REFERENCES users(id),

  CONSTRAINT chk_refunds_amount CHECK (
    amount > 0
    AND amount_usd > 0
    AND CHAR_LENGTH(TRIM(reason)) > 0
  ),

  CONSTRAINT chk_refunds_rate CHECK (
    exchange_rate > 0
    AND khr_per_usd > 0
    AND (
      (currency = 'USD' AND exchange_rate = 1)
      OR (currency = 'KHR' AND exchange_rate = khr_per_usd)
    )
  ),

  CONSTRAINT chk_refunds_completed CHECK (
    (status = 'COMPLETED' AND refunded_at IS NOT NULL)
    OR (status <> 'COMPLETED' AND refunded_at IS NULL)
  )
) ENGINE=InnoDB;


-- ==========================================================
-- 14. STOCK MOVEMENTS (Fixed: DB-06, NEW-05)
-- Added source_movement_id with UNIQUE key so each SALE movement
-- can be reversed by a RETURN movement at most once.
-- ==========================================================
CREATE TABLE IF NOT EXISTS stock_movements (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ingredient_id BIGINT UNSIGNED NOT NULL,
  order_id BIGINT UNSIGNED NULL,
  source_movement_id BIGINT UNSIGNED NULL
    COMMENT 'References original SALE movement id when movement_type = RETURN',
  movement_type ENUM(
    'PURCHASE', 'SALE', 'WASTE', 'ADJUSTMENT', 'RETURN'
  ) NOT NULL,
  quantity_change DECIMAL(14,4) NOT NULL,
  unit_cost DECIMAL(14,6) NULL
    COMMENT 'USD per ingredient base unit',
  reason VARCHAR(500) NULL,
  idempotency_key VARCHAR(100) NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uq_stock_request (idempotency_key),
  UNIQUE KEY uq_stock_return_source (source_movement_id),
  KEY idx_stock_ingredient_date (ingredient_id, created_at),
  KEY idx_stock_order (order_id),

  CONSTRAINT fk_stock_ingredient
    FOREIGN KEY (ingredient_id) REFERENCES ingredients(id),

  CONSTRAINT fk_stock_order
    FOREIGN KEY (order_id) REFERENCES orders(id),

  CONSTRAINT fk_stock_source_movement
    FOREIGN KEY (source_movement_id) REFERENCES stock_movements(id),

  CONSTRAINT fk_stock_creator
    FOREIGN KEY (created_by) REFERENCES users(id),

  CONSTRAINT chk_stock_quantity CHECK (
    (
      movement_type IN ('PURCHASE', 'RETURN')
      AND quantity_change > 0
    )
    OR
    (
      movement_type IN ('SALE', 'WASTE')
      AND quantity_change < 0
    )
    OR
    (
      movement_type = 'ADJUSTMENT'
      AND quantity_change <> 0
    )
  ),

  CONSTRAINT chk_stock_cost
    CHECK (unit_cost IS NULL OR unit_cost >= 0),

  CONSTRAINT chk_stock_sale_reference CHECK (
    (
      movement_type = 'SALE'
      AND order_id IS NOT NULL
      AND idempotency_key IS NOT NULL
      AND source_movement_id IS NULL
    )
    OR
    (
      movement_type = 'RETURN'
      AND order_id IS NOT NULL
      AND idempotency_key IS NOT NULL
      AND source_movement_id IS NOT NULL
    )
    OR
    (
      movement_type = 'PURCHASE'
      AND order_id IS NULL
      AND source_movement_id IS NULL
    )
    OR
    (
      movement_type IN ('WASTE', 'ADJUSTMENT')
      AND order_id IS NULL
      AND source_movement_id IS NULL
      AND reason IS NOT NULL
      AND CHAR_LENGTH(TRIM(reason)) > 0
    )
  )
) ENGINE=InnoDB;


-- ==========================================================
-- 15. EXPENSES (Fixed: NEW-04 void audit columns & check)
-- ==========================================================
CREATE TABLE IF NOT EXISTS expenses (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  shift_id BIGINT UNSIGNED NULL,
  category VARCHAR(100) NOT NULL,
  description VARCHAR(500) NOT NULL,
  payment_method ENUM('CASH', 'KHQR', 'BANK_TRANSFER') NOT NULL,
  currency ENUM('USD', 'KHR') NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  exchange_rate DECIMAL(14,6) NOT NULL,

  amount_usd DECIMAL(14,2) GENERATED ALWAYS AS (
    ROUND(amount / exchange_rate, 2)
  ) STORED,

  status ENUM('ACTIVE', 'VOIDED') NOT NULL DEFAULT 'ACTIVE',
  voided_at DATETIME NULL,
  voided_by BIGINT UNSIGNED NULL,
  void_reason VARCHAR(255) NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  incurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  KEY idx_expenses_date (status, incurred_at),
  KEY idx_expenses_shift (shift_id, status),

  CONSTRAINT fk_expenses_shift
    FOREIGN KEY (shift_id) REFERENCES shifts(id),

  CONSTRAINT fk_expenses_creator
    FOREIGN KEY (created_by) REFERENCES users(id),

  CONSTRAINT fk_expenses_voided_by
    FOREIGN KEY (voided_by) REFERENCES users(id),

  CONSTRAINT chk_expenses_amount CHECK (
    amount > 0
    AND CHAR_LENGTH(TRIM(category)) > 0
    AND CHAR_LENGTH(TRIM(description)) > 0
  ),

  CONSTRAINT chk_expenses_rate CHECK (
    exchange_rate > 0
    AND (currency <> 'USD' OR exchange_rate = 1)
  ),

  CONSTRAINT chk_expenses_cash_shift CHECK (
    payment_method <> 'CASH' OR shift_id IS NOT NULL
  ),

  CONSTRAINT chk_expenses_void CHECK (
    (
      status = 'ACTIVE'
      AND voided_at IS NULL
      AND voided_by IS NULL
      AND void_reason IS NULL
    )
    OR
    (
      status = 'VOIDED'
      AND voided_at IS NOT NULL
      AND voided_by IS NOT NULL
      AND void_reason IS NOT NULL
      AND CHAR_LENGTH(TRIM(void_reason)) > 0
    )
  )
) ENGINE=InnoDB;


-- ==========================================================
-- 16. AUDIT LOGS
-- ==========================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL COMMENT 'NULL for system actions',
  action VARCHAR(100) NOT NULL,
  table_name VARCHAR(64) NOT NULL,
  record_id BIGINT UNSIGNED NULL,
  details JSON NULL,
  ip_address VARCHAR(45) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  KEY idx_audit_user_date (user_id, created_at),
  KEY idx_audit_record (table_name, record_id, created_at),

  CONSTRAINT fk_audit_user
    FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;


-- ==========================================================
-- 17. REFRESH TOKENS (USER SESSIONS)
-- ==========================================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash VARCHAR(64) NOT NULL COMMENT 'SHA-256 hash of the refresh token',
  user_agent VARCHAR(255) NULL COMMENT 'Browser or device info',
  ip_address VARCHAR(45) NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL COMMENT 'Set timestamp when user logs out or token is revoked',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uq_refresh_tokens_hash (token_hash),
  KEY idx_refresh_tokens_user (user_id, revoked_at, expires_at),

  CONSTRAINT fk_refresh_tokens_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE,

  CONSTRAINT chk_refresh_tokens_expiry
    CHECK (expires_at > created_at)
) ENGINE=InnoDB;


-- ==========================================================
-- INITIAL SETTINGS
-- ==========================================================
INSERT INTO settings (id, shop_name, exchange_rate)
SELECT 1, 'Coffee Shop', 4100.000000
WHERE NOT EXISTS (
  SELECT 1 FROM settings WHERE id = 1
);

SHOW TABLES;