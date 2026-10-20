const nodemailer = require('nodemailer');
const env = require('../config/env.config');
const logger = require('./logger.util');

const transporter = nodemailer.createTransport({
    host: env.mail.host,
    port: env.mail.port,
    secure: env.mail.port === 465,
    auth: {
        user: env.mail.user,
        pass: env.mail.pass
    }
});

const sendResetPasswordOtp = async ({ to, name, otp }) => {
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f6f9fc; margin: 0; padding: 20px; }
            .container { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
            .header { background: #3c2a21; padding: 24px; text-align: center; color: #ffffff; }
            .header h1 { margin: 0; font-size: 24px; letter-spacing: 1px; }
            .content { padding: 32px 24px; color: #333333; line-height: 1.6; }
            .otp-box { background: #fdf8f5; border: 2px dashed #b85d19; border-radius: 8px; text-align: center; padding: 18px; margin: 24px 0; }
            .otp-code { font-size: 36px; font-weight: 700; color: #b85d19; letter-spacing: 8px; font-family: monospace; }
            .footer { background: #f8fafc; padding: 18px 24px; text-align: center; font-size: 13px; color: #888888; border-top: 1px solid #edf2f7; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>☕ POS Coffee System</h1>
            </div>
            <div class="content">
                <p>Hello <strong>${name || 'User'}</strong>,</p>
                <p>We received a request to reset your password for your <strong>POS Coffee</strong> account.</p>
                <p>Use the following 6-digit verification code (OTP) to proceed with resetting your password:</p>
                <div class="otp-box">
                    <div class="otp-code">${otp}</div>
                </div>
                <p style="color: #666; font-size: 14px;">⏳ This code is valid for <strong>10 minutes</strong>. For your security, do not share this code with anyone.</p>
                <p style="color: #999; font-size: 13px;">If you did not request a password reset, you can safely ignore this email. Your account remains secure.</p>
            </div>
            <div class="footer">
                &copy; ${new Date().getFullYear()} POS Coffee Shop System. All rights reserved.
            </div>
        </div>
    </body>
    </html>
    `;

    try {
        const info = await transporter.sendMail({
            from: `"POS Coffee System" <${env.mail.user}>`,
            to,
            subject: `[POS Coffee] ${otp} is your Password Reset Verification Code`,
            text: `Your password reset OTP code is: ${otp}. It is valid for 10 minutes.`,
            html: htmlContent
        });

        logger.info(`Password reset OTP email sent to ${to}: ${info.messageId}`);
        return info;
    } catch (error) {
        logger.error(`Failed to send password reset OTP email to ${to}:`, error);
        throw error;
    }
};

module.exports = {
    sendResetPasswordOtp
};
