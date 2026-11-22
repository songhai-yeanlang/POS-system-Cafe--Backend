const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const jwtSecret = process.env.JWT_SECRET ? process.env.JWT_SECRET.trim() : '';
if (!jwtSecret) {
    console.error('[FATAL] Missing required environment variable: JWT_SECRET must be defined in .env');
    process.exit(1);
}

const parseTrustProxy = (val) => {
    if (val === undefined || val === null || String(val).trim() === '') {
        return 'loopback';
    }
    const normalized = String(val).trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false' || normalized === '0') return false;
    if (/^\d+$/.test(normalized)) return Number(normalized);
    return String(val).trim();
};

const parseCorsOrigin = (val) => {
    if (!val || String(val).trim() === '' || String(val).trim() === '*') {
        return '*';
    }
    const origins = String(val)
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);
    return origins.length === 1 ? origins[0] : origins;
};

module.exports = {
    port: Number(process.env.PORT) || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
    trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
    corsOrigin: parseCorsOrigin(process.env.CORS_ORIGIN),
    jwt: {
        secret: jwtSecret,
        expiresIn: process.env.JWT_EXPIRES_IN || '1d'
    },
    db: {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        name: process.env.DB_NAME || 'coffee_pos'
    },
    mail: {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: Number(process.env.SMTP_PORT) || 465,
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS
    }
};
