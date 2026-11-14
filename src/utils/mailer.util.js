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

const escapeHtml = (value) =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const sendResetPasswordOtp = async ({ to, name, otp }) => {
    const safeName = escapeHtml(name || 'User');
    const safeOtp = escapeHtml(otp);

    const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Reset Code</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #14231a; -webkit-font-smoothing: antialiased;">
        <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent;">
            Your POS Coffee verification code is ${safeOtp}. Valid for 10 minutes.
        </div>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #ffffff; width: 100%;">
            <tr>
                <td align="center" style="padding: 32px 16px;">
                    <table role="presentation" width="440" cellspacing="0" cellpadding="0" border="0" style="width: 100%; max-width: 440px; background-color: #ffffff; border: 1px solid #e6ebe8; border-radius: 12px;">
                        <tr>
                            <td style="padding: 32px;">
                                <div style="font-size: 13px; font-weight: 600; color: #2d5a43; margin-bottom: 18px;">
                                    POS System
                                </div>

                                <h1 style="margin: 0 0 10px; font-size: 20px; font-weight: 700; color: #14231a; line-height: 1.3; letter-spacing: -0.02em;">
                                    Password reset code
                                </h1>

                                <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #4a5950;">
                                    Hi <strong style="color: #14231a; font-weight: 600;">${safeName}</strong>, enter this code to reset your password. It expires in 10 minutes.
                                </p>

                                <div style="background-color: #f6f9f7; border: 1px solid #e0e8e3; border-radius: 8px; padding: 18px 16px; text-align: center; margin-bottom: 22px;">
                                    <span style="display: inline-block; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 30px; font-weight: 700; color: #14231a; letter-spacing: 10px; padding-left: 10px; line-height: 1.2; font-variant-numeric: tabular-nums;">${safeOtp}</span>
                                </div>

                                <p style="margin: 0; font-size: 12.5px; line-height: 1.5; color: #78857d;">
                                    If you didn't request a password reset, you can ignore this email.
                                </p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    `;

    try {
        const info = await transporter.sendMail({
            from: `"YL Web Solutions" <${env.mail.user}>`,
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
