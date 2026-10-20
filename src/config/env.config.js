require('dotenv').config();

module.exports = {
    port: process.env.PORT,
    nodeEnv: process.env.NODE_ENV,
    jwt: {
        secret: process.env.JWT_SECRET ,
        expiresIn: process.env.JWT_EXPIRES_IN
    },
    db: {
        host: process.env.DB_HOST ,
        user: process.env.DB_USER ,
        password: process.env.DB_PASSWORD,
        name: process.env.DB_NAME
    },
    mail: {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: Number(process.env.SMTP_PORT) || 465,
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS
    }
};
