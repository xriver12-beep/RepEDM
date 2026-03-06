const nodemailer = require('nodemailer');
const { executeQuery } = require('../config/database');
const sql = require('mssql');

class EmailService {
    constructor() {
        this.transporter = null;
    }

    // 記錄郵件發送日誌
    async logEmailActivity(logData) {
        try {
            const {
                emailType,
                recipientEmail,
                senderEmail,
                senderName,
                subject,
                smtpHost,
                smtpPort,
                status,
                messageId,
                errorMessage,
                errorCode,
                retryCount = 0,
                campaignId,
                userId,
                templateId,
                processingTimeMs,
                smtpResponse
            } = logData;

            await executeQuery(`
                INSERT INTO EmailLogs (
                    email_type, recipient_email, sender_email, sender_name, subject,
                    smtp_host, smtp_port, status, message_id, error_message, error_code,
                    retry_count, campaign_id, user_id, template_id, processing_time_ms,
                    smtp_response, created_at, sent_at, failed_at
                ) VALUES (
                    @emailType, @recipientEmail, @senderEmail, @senderName, @subject,
                    @smtpHost, @smtpPort, @status, @messageId, @errorMessage, @errorCode,
                    @retryCount, @campaignId, @userId, @templateId, @processingTimeMs,
                    @smtpResponse, GETDATE(), 
                    ${status === 'sent' ? 'GETDATE()' : 'NULL'},
                    ${status === 'failed' ? 'GETDATE()' : 'NULL'}
                )
            `, {
                emailType,
                recipientEmail,
                senderEmail,
                senderName,
                subject,
                smtpHost,
                smtpPort,
                status,
                messageId,
                errorMessage,
                errorCode,
                retryCount,
                campaignId: campaignId || null,
                userId: userId || null,
                templateId: templateId || null,
                processingTimeMs,
                smtpResponse
            });

            console.log(`📧 郵件日誌記錄: ${emailType} - ${status} - ${recipientEmail}`);
        } catch (error) {
            console.error('記錄郵件日誌失敗:', error);
            // 不拋出錯誤，避免影響主要的郵件發送流程
        }
    }

    // 從資料庫獲取 SMTP 設定
    async getSmtpSettings() {
        try {
            const result = await executeQuery(`
                SELECT SettingKey as setting_key, SettingValue as setting_value 
                FROM SystemSettings 
                WHERE SettingKey IN ('smtp.host', 'smtp.port', 'smtp.secure', 'smtp.username', 'smtp.password', 'smtp.enabled')
            `);

            const settings = {
                enabled: false // 預設值
            };
            result.recordset.forEach(row => {
                const key = row.setting_key.replace('smtp.', '');
                let value = row.setting_value;
                
                // 轉換資料類型
                if (key === 'port') {
                    value = parseInt(value);
                } else if (key === 'secure' || key === 'enabled') {
                    value = value === 'true';
                }
                
                settings[key] = value;
            });

            return settings;
        } catch (error) {
            console.error('獲取 SMTP 設定失敗:', error);
            throw error;
        }
    }

    // 創建郵件傳輸器
    async createTransporter(smtpSettings = null) {
        try {
            const settings = smtpSettings || await this.getSmtpSettings();
            
            if (!settings.host || !settings.port || !settings.username || !settings.password) {
                throw new Error('SMTP 設定不完整');
            }

            this.transporter = nodemailer.createTransport({
                host: settings.host,
                port: settings.port,
                secure: settings.secure, // true for 465, false for other ports
                auth: {
                    user: settings.username,
                    pass: settings.password
                },
                tls: {
                    rejectUnauthorized: false
                },
                // 添加一些額外的配置
                connectionTimeout: 30000, // 30 秒連接超時
                greetingTimeout: 30000,    // 30 秒問候超時
                socketTimeout: 60000      // 60 秒 socket 超時
            });

            return this.transporter;
        } catch (error) {
            console.error('創建郵件傳輸器失敗:', error);
            throw error;
        }
    }

    // 測試 SMTP 連接
    async testConnection(smtpSettings = null) {
        const startTime = Date.now();
        let settings = smtpSettings;
        
        try {
            if (!settings) {
                settings = await this.getSmtpSettings();
            }
            
            const transporter = await this.createTransporter(settings);
            
            // 驗證連接
            await transporter.verify();
            
            const processingTime = Date.now() - startTime;
            
            // 記錄成功的連接測試
            await this.logEmailActivity({
                emailType: 'smtp_test',
                recipientEmail: 'system',
                senderEmail: settings.username,
                senderName: 'System',
                subject: 'SMTP Connection Test',
                smtpHost: settings.host,
                smtpPort: settings.port,
                status: 'sent',
                messageId: `smtp_test_${Date.now()}`,
                processingTimeMs: processingTime,
                smtpResponse: 'Connection verified successfully'
            });
            
            return {
                success: true,
                message: 'SMTP 連接測試成功'
            };
        } catch (error) {
            console.error('SMTP 連接測試失敗:', error);
            
            const processingTime = Date.now() - startTime;
            
            // 記錄失敗的連接測試
            await this.logEmailActivity({
                emailType: 'smtp_test',
                recipientEmail: 'system',
                senderEmail: settings?.username || 'unknown',
                senderName: 'System',
                subject: 'SMTP Connection Test',
                smtpHost: settings?.host || 'unknown',
                smtpPort: settings?.port || 0,
                status: 'failed',
                messageId: `smtp_test_${Date.now()}`,
                errorMessage: error.message,
                errorCode: error.code || 'UNKNOWN',
                processingTimeMs: processingTime,
                smtpResponse: error.response || error.message
            });
            
            return {
                success: false,
                message: `SMTP 連接測試失敗: ${error.message}`
            };
        }
    }

    // 處理 HTML 中的 Base64 圖片
    processHtmlImages(html) {
        if (!html) return { html: '', attachments: [] };

        const attachments = [];
        let processedHtml = html;
        let imageCounter = 0;
        const timestamp = Date.now();

        // Regex to find data:image src
        // src="data:image/type;base64,content"
        const regex = /src=["'](data:image\/([^;]+);base64,([^"']+))["']/g;
        
        processedHtml = html.replace(regex, (match, fullSrc, imageType, base64Data) => {
            imageCounter++;
            const cid = `image_${timestamp}_${imageCounter}@winton.edm`;
            
            attachments.push({
                filename: `image_${imageCounter}.${imageType}`,
                content: Buffer.from(base64Data, 'base64'),
                cid: cid
            });
            
            // Return the new src attribute
            return `src="cid:${cid}"`;
        });

        return { html: processedHtml, attachments };
    }

    // 發送一般郵件
    async sendEmail({ to, subject, html, text, emailType = 'notification', attachments = [] }) {
        const startTime = Date.now();
        let settings = null;
        let emailSettings = {};
        
        try {
            // 處理 HTML 圖片
            const { html: processedHtml, attachments: imageAttachments } = this.processHtmlImages(html);
            const finalAttachments = [...attachments, ...imageAttachments];

            // 先獲取發件人資訊，確保即使 SMTP 設定失敗也能記錄正確的發件人
            emailSettings = await this.getEmailSettings();

            settings = await this.getSmtpSettings();
            
            // 檢查 SMTP 是否啟用
            if (settings.enabled === false) {
                console.log('SMTP 發信功能已停用，取消發送');
                return {
                    success: false,
                    message: 'SMTP 發信功能已停用'
                };
            }

            const transporter = await this.createTransporter(settings);
            
            const senderEmail = emailSettings.fromEmail || settings.username;
            const senderName = emailSettings.fromName || 'WintonEDM';
            
            const mailOptions = {
                from: {
                    name: senderName,
                    address: senderEmail
                },
                to: to,
                subject: String(subject || '').trim(), // Ensure string and trim
                html: processedHtml,
                text: text,
                attachments: finalAttachments
            };

            const info = await transporter.sendMail(mailOptions);
            const processingTime = Date.now() - startTime;
            
            // 記錄成功的郵件發送
            await this.logEmailActivity({
                emailType: emailType,
                recipientEmail: to,
                senderEmail: senderEmail,
                senderName: senderName,
                subject: subject,
                smtpHost: settings.host,
                smtpPort: settings.port,
                status: 'sent',
                messageId: info.messageId,
                processingTimeMs: processingTime,
                smtpResponse: info.response || 'Email sent successfully'
            });
            
            return {
                success: true,
                message: '郵件發送成功',
                messageId: info.messageId
            };
        } catch (error) {
            console.error('發送郵件失敗:', error);
            
            const processingTime = Date.now() - startTime;
            
            // 記錄失敗的郵件發送
            await this.logEmailActivity({
                emailType: emailType,
                recipientEmail: to,
                senderEmail: emailSettings.fromEmail || settings?.username || 'unknown',
                senderName: emailSettings.fromName || 'WintonEDM',
                subject: subject,
                smtpHost: settings?.host || 'unknown',
                smtpPort: settings?.port || 0,
                status: 'failed',
                messageId: `${emailType}_${Date.now()}`,
                errorMessage: error.message,
                errorCode: error.code || 'UNKNOWN',
                processingTimeMs: processingTime,
                smtpResponse: error.response || error.message
            });
            
            return {
                success: false,
                message: `郵件發送失敗: ${error.message}`
            };
        }
    }

    // 發送測試郵件
    async sendTestEmail(testEmail, smtpSettings = null) {
        const startTime = Date.now();
        let settings = smtpSettings;
        let emailSettings = {};
        
        try {
            // 先獲取發件人資訊，確保即使 SMTP 設定失敗也能記錄正確的發件人
            emailSettings = await this.getEmailSettings();

            if (!settings) {
                settings = await this.getSmtpSettings();
            }
            
            const transporter = await this.createTransporter(settings);
            
            const senderEmail = emailSettings.fromEmail || settings.username;
            const senderName = emailSettings.fromName || 'WintonEDM';
            const subject = 'WintonEDM 測試郵件';
            
            const mailOptions = {
                from: `"${senderName}" <${senderEmail}>`,
                to: testEmail,
                subject: subject,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #333;">WintonEDM 測試郵件</h2>
                        <p>這是一封來自 WintonEDM 系統的測試郵件。</p>
                        <p><strong>發送時間:</strong> ${new Date().toLocaleString('zh-TW')}</p>
                        <p><strong>SMTP 伺服器:</strong> ${settings.host || '未知'}</p>
                        <hr style="border: 1px solid #eee; margin: 20px 0;">
                        <p style="color: #666; font-size: 12px;">
                            如果您收到這封郵件，表示您的 SMTP 設定配置正確。
                        </p>
                    </div>
                `,
                text: `
WintonEDM 測試郵件

這是一封來自 WintonEDM 系統的測試郵件。

發送時間: ${new Date().toLocaleString('zh-TW')}
SMTP 伺服器: ${settings.host || '未知'}

如果您收到這封郵件，表示您的 SMTP 設定配置正確。
                `
            };

            const info = await transporter.sendMail(mailOptions);
            const processingTime = Date.now() - startTime;
            
            // 記錄成功的郵件發送
            await this.logEmailActivity({
                emailType: 'test_email',
                recipientEmail: testEmail,
                senderEmail: senderEmail,
                senderName: senderName,
                subject: subject,
                smtpHost: settings.host,
                smtpPort: settings.port,
                status: 'sent',
                messageId: info.messageId,
                processingTimeMs: processingTime,
                smtpResponse: info.response || 'Email sent successfully'
            });
            
            return {
                success: true,
                message: '測試郵件發送成功',
                messageId: info.messageId
            };
        } catch (error) {
            console.error('發送測試郵件失敗:', error);
            
            const processingTime = Date.now() - startTime;
            
            // 記錄失敗的郵件發送
            await this.logEmailActivity({
                emailType: 'test_email',
                recipientEmail: testEmail,
                senderEmail: emailSettings.fromEmail || settings?.username || 'unknown',
                senderName: emailSettings.fromName || 'WintonEDM',
                subject: 'WintonEDM 測試郵件',
                smtpHost: settings?.host || 'unknown',
                smtpPort: settings?.port || 0,
                status: 'failed',
                messageId: `test_email_${Date.now()}`,
                errorMessage: error.message,
                errorCode: error.code || 'UNKNOWN',
                processingTimeMs: processingTime,
                smtpResponse: error.response || error.message
            });
            
            return {
                success: false,
                message: `測試郵件發送失敗: ${error.message}`
            };
        }
    }

    // 獲取郵件設定
    async getEmailSettings() {
        try {
            const result = await executeQuery(`
                SELECT SettingKey, SettingValue 
                FROM SystemSettings 
                WHERE SettingKey IN ('email.fromName', 'email.fromEmail', 'email.replyToEmail')
            `);

            const settings = {};
            result.recordset.forEach(row => {
                const key = row.SettingKey.replace('email.', '');
                settings[key] = row.SettingValue;
            });

            return settings;
        } catch (error) {
            console.error('獲取郵件設定失敗:', error);
            return {};
        }
    }
}

module.exports = new EmailService();