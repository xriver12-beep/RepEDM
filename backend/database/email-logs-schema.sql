-- 郵件發送日誌表
CREATE TABLE EmailLogs (
    id INT IDENTITY(1,1) PRIMARY KEY,
    email_type NVARCHAR(50) NOT NULL, -- 'test', 'campaign', 'notification' 等
    recipient_email NVARCHAR(255) NOT NULL,
    sender_email NVARCHAR(255),
    sender_name NVARCHAR(255),
    subject NVARCHAR(500),
    smtp_host NVARCHAR(255),
    smtp_port INT,
    status NVARCHAR(20) NOT NULL, -- 'pending', 'sent', 'failed'
    message_id NVARCHAR(500), -- nodemailer 返回的 messageId
    error_message NVARCHAR(MAX), -- 失敗時的錯誤訊息
    error_code NVARCHAR(50), -- 錯誤代碼
    retry_count INT DEFAULT 0,
    created_at DATETIME2 DEFAULT GETDATE(),
    sent_at DATETIME2,
    failed_at DATETIME2,
    
    -- 額外的元數據
    campaign_id INT, -- 如果是活動郵件
    user_id INT, -- 發送者 ID
    template_id INT, -- 使用的模板 ID
    
    -- 性能相關欄位
    processing_time_ms INT, -- 處理時間（毫秒）
    smtp_response NVARCHAR(MAX), -- SMTP 伺服器回應
    
    -- 索引
    INDEX IX_EmailLogs_Status (status),
    INDEX IX_EmailLogs_CreatedAt (created_at),
    INDEX IX_EmailLogs_RecipientEmail (recipient_email),
    INDEX IX_EmailLogs_EmailType (email_type),
    INDEX IX_EmailLogs_CampaignId (campaign_id)
);

-- 郵件發送統計視圖
CREATE VIEW EmailLogsSummary AS
SELECT 
    email_type,
    status,
    COUNT(*) as count,
    AVG(processing_time_ms) as avg_processing_time,
    MIN(created_at) as first_sent,
    MAX(created_at) as last_sent
FROM EmailLogs
GROUP BY email_type, status;

-- 每日郵件發送統計視圖
CREATE VIEW DailyEmailStats AS
SELECT 
    CAST(created_at AS DATE) as send_date,
    email_type,
    status,
    COUNT(*) as count,
    AVG(processing_time_ms) as avg_processing_time
FROM EmailLogs
GROUP BY CAST(created_at AS DATE), email_type, status;