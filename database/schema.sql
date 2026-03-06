-- 電子報管理系統資料庫架構
-- 建立日期: 2024
-- 資料庫: WintonEDM

USE master;
GO

-- 建立資料庫
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'WintonEDM')
BEGIN
    CREATE DATABASE WintonEDM;
END
GO

USE WintonEDM;
GO

-- 1. 使用者表 (Users)
CREATE TABLE Users (
    UserID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    Username NVARCHAR(50) NOT NULL UNIQUE,
    Email NVARCHAR(255) NOT NULL UNIQUE,
    PasswordHash NVARCHAR(255) NOT NULL,
    FirstName NVARCHAR(100),
    LastName NVARCHAR(100),
    Role NVARCHAR(20) NOT NULL DEFAULT 'User', -- Admin, Manager, User, Viewer
    IsActive BIT NOT NULL DEFAULT 1,
    LastLoginAt DATETIME2,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    CreatedBy UNIQUEIDENTIFIER,
    UpdatedBy UNIQUEIDENTIFIER
);

-- 2. 訂閱者表 (Subscribers)
CREATE TABLE Subscribers (
    SubscriberID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    Email NVARCHAR(255) NOT NULL UNIQUE,
    FirstName NVARCHAR(100),
    LastName NVARCHAR(100),
    Phone NVARCHAR(20),
    Gender NVARCHAR(10), -- Male, Female, Other
    BirthDate DATE,
    Country NVARCHAR(100),
    City NVARCHAR(100),
    Status NVARCHAR(20) NOT NULL DEFAULT 'Active', -- Active, Unsubscribed, Bounced, Complained
    Source NVARCHAR(100), -- Website, Import, API, Manual
    Tags NVARCHAR(MAX), -- JSON array of tags
    CustomFields NVARCHAR(MAX), -- JSON object for custom fields
    SubscribedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    UnsubscribedAt DATETIME2,
    unsubscribe_reason NVARCHAR(255),
    bounce_reason NVARCHAR(255),
    LastActivityAt DATETIME2,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE()
);

-- 3. 訂閱者群組表 (SubscriberGroups)
CREATE TABLE SubscriberGroups (
    GroupID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    GroupName NVARCHAR(100) NOT NULL,
    Description NVARCHAR(500),
    Criteria NVARCHAR(MAX), -- JSON object for filtering criteria
    IsActive BIT NOT NULL DEFAULT 1,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    CreatedBy UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Users(UserID)
);

-- 4. 訂閱者群組關聯表 (SubscriberGroupMembers)
CREATE TABLE SubscriberGroupMembers (
    SubscriberID UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Subscribers(SubscriberID),
    GroupID UNIQUEIDENTIFIER FOREIGN KEY REFERENCES SubscriberGroups(GroupID),
    AddedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    PRIMARY KEY (SubscriberID, GroupID)
);

-- 5. 電子報EDM表 (Templates)
CREATE TABLE Templates (
    TemplateID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    TemplateName NVARCHAR(100) NOT NULL,
    Description NVARCHAR(500),
    Category NVARCHAR(50), -- Newsletter, Promotional, Transactional
    HTMLContent NVARCHAR(MAX) NOT NULL,
    PlainTextContent NVARCHAR(MAX),
    ThumbnailURL NVARCHAR(500),
    IsActive BIT NOT NULL DEFAULT 1,
    IsPublic BIT NOT NULL DEFAULT 0,
    Version INT NOT NULL DEFAULT 1,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    CreatedBy UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Users(UserID),
    UpdatedBy UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Users(UserID)
);

-- 6. 電子報活動表 (Campaigns)
CREATE TABLE Campaigns (
    CampaignID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    CampaignName NVARCHAR(100) NOT NULL,
    Subject NVARCHAR(255) NOT NULL,
    PreviewText NVARCHAR(255),
    FromName NVARCHAR(100) NOT NULL,
    FromEmail NVARCHAR(255) NOT NULL,
    ReplyToEmail NVARCHAR(255),
    TemplateID UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Templates(TemplateID),
    HTMLContent NVARCHAR(MAX) NOT NULL,
    PlainTextContent NVARCHAR(MAX),
    Status NVARCHAR(20) NOT NULL DEFAULT 'Draft', -- Draft, Scheduled, Sending, Sent, Paused, Cancelled
    Type NVARCHAR(20) NOT NULL DEFAULT 'Regular', -- Regular, AB_Test, Automated, Transactional
    ScheduledAt DATETIME2,
    SentAt DATETIME2,
    TotalRecipients INT DEFAULT 0,
    SuccessfulSends INT DEFAULT 0,
    FailedSends INT DEFAULT 0,
    Opens INT DEFAULT 0,
    Clicks INT DEFAULT 0,
    Unsubscribes INT DEFAULT 0,
    Bounces INT DEFAULT 0,
    Complaints INT DEFAULT 0,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    CreatedBy UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Users(UserID),
    UpdatedBy UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Users(UserID)
);

-- 7. 活動收件人表 (CampaignRecipients)
CREATE TABLE CampaignRecipients (
    CampaignID UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Campaigns(CampaignID),
    SubscriberID UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Subscribers(SubscriberID),
    Status NVARCHAR(20) NOT NULL DEFAULT 'Pending', -- Pending, Sent, Failed, Bounced
    SentAt DATETIME2,
    ErrorMessage NVARCHAR(500),
    PRIMARY KEY (CampaignID, SubscriberID)
);

-- 8. 郵件發送佇列表 (EmailQueue)
CREATE TABLE EmailQueue (
    QueueID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    CampaignID UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Campaigns(CampaignID),
    SubscriberID UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Subscribers(SubscriberID),
    ToEmail NVARCHAR(255) NOT NULL,
    Subject NVARCHAR(255) NOT NULL,
    HTMLContent NVARCHAR(MAX) NOT NULL,
    PlainTextContent NVARCHAR(MAX),
    Priority INT NOT NULL DEFAULT 5, -- 1-10, 1 is highest priority
    Status NVARCHAR(20) NOT NULL DEFAULT 'Pending', -- Pending, Processing, Sent, Failed
    RetryCount INT NOT NULL DEFAULT 0,
    MaxRetries INT NOT NULL DEFAULT 3,
    ScheduledAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    ProcessedAt DATETIME2,
    ErrorMessage NVARCHAR(500),
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE()
);

-- 9. 郵件事件表 (EmailEvents)
CREATE TABLE EmailEvents (
    EventID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    CampaignID UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Campaigns(CampaignID),
    SubscriberID UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Subscribers(SubscriberID),
    EventType NVARCHAR(20) NOT NULL, -- Sent, Delivered, Opened, Clicked, Bounced, Complained, Unsubscribed
    EventData NVARCHAR(MAX), -- JSON object with additional event data
    IPAddress NVARCHAR(45),
    UserAgent NVARCHAR(500),
    Timestamp DATETIME2 NOT NULL DEFAULT GETDATE()
);

-- 10. 點擊追蹤表 (ClickTracking)
CREATE TABLE ClickTracking (
    ClickID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    CampaignID UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Campaigns(CampaignID),
    SubscriberID UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Subscribers(SubscriberID),
    OriginalURL NVARCHAR(2000) NOT NULL,
    ClickedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    IPAddress NVARCHAR(45),
    UserAgent NVARCHAR(500)
);

-- 11. 素材管理表 (Assets)
CREATE TABLE Assets (
    AssetID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    FileName NVARCHAR(255) NOT NULL,
    OriginalName NVARCHAR(255) NOT NULL,
    FileType NVARCHAR(50) NOT NULL,
    FileSize BIGINT NOT NULL,
    FilePath NVARCHAR(500) NOT NULL,
    URL NVARCHAR(500) NOT NULL,
    Alt NVARCHAR(255),
    Description NVARCHAR(500),
    IsActive BIT NOT NULL DEFAULT 1,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    CreatedBy UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Users(UserID)
);

-- 12. A/B 測試表 (ABTests)
CREATE TABLE ABTests (
    TestID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    TestName NVARCHAR(100) NOT NULL,
    CampaignID UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Campaigns(CampaignID),
    VariantA_Subject NVARCHAR(255),
    VariantB_Subject NVARCHAR(255),
    VariantA_Content NVARCHAR(MAX),
    VariantB_Content NVARCHAR(MAX),
    TestPercentage DECIMAL(5,2) NOT NULL DEFAULT 50.00, -- Percentage for variant B
    WinnerVariant NVARCHAR(1), -- A or B
    Status NVARCHAR(20) NOT NULL DEFAULT 'Running', -- Running, Completed, Cancelled
    StartedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    CompletedAt DATETIME2,
    CreatedBy UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Users(UserID)
);

-- 13. 自動化工作流程表 (AutomationWorkflows)
CREATE TABLE AutomationWorkflows (
    WorkflowID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    WorkflowName NVARCHAR(100) NOT NULL,
    Description NVARCHAR(500),
    TriggerType NVARCHAR(50) NOT NULL, -- Subscribe, Birthday, Purchase, Custom
    TriggerConditions NVARCHAR(MAX), -- JSON object
    IsActive BIT NOT NULL DEFAULT 1,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    CreatedBy UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Users(UserID)
);

-- 14. 工作流程步驟表 (WorkflowSteps)
CREATE TABLE WorkflowSteps (
    StepID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    WorkflowID UNIQUEIDENTIFIER FOREIGN KEY REFERENCES AutomationWorkflows(WorkflowID),
    StepOrder INT NOT NULL,
    StepType NVARCHAR(50) NOT NULL, -- Email, Wait, Condition
    StepConfig NVARCHAR(MAX) NOT NULL, -- JSON configuration
    IsActive BIT NOT NULL DEFAULT 1
);

-- 15. 系統設定表 (SystemSettings)
CREATE TABLE SystemSettings (
    SettingKey NVARCHAR(100) PRIMARY KEY,
    SettingValue NVARCHAR(MAX),
    Description NVARCHAR(500),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    UpdatedBy UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Users(UserID)
);

-- 16. 審計記錄表 (AuditLogs)
CREATE TABLE AuditLogs (
    LogID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    UserID UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Users(UserID),
    Action NVARCHAR(100) NOT NULL,
    TableName NVARCHAR(100),
    RecordID UNIQUEIDENTIFIER,
    OldValues NVARCHAR(MAX), -- JSON
    NewValues NVARCHAR(MAX), -- JSON
    IPAddress NVARCHAR(45),
    UserAgent NVARCHAR(500),
    Timestamp DATETIME2 NOT NULL DEFAULT GETDATE()
);

-- 建立索引以提升查詢效能
CREATE INDEX IX_Subscribers_Email ON Subscribers(Email);
CREATE INDEX IX_Subscribers_Status ON Subscribers(Status);
CREATE INDEX IX_Subscribers_CreatedAt ON Subscribers(CreatedAt);

CREATE INDEX IX_Campaigns_Status ON Campaigns(Status);
CREATE INDEX IX_Campaigns_CreatedAt ON Campaigns(CreatedAt);
CREATE INDEX IX_Campaigns_ScheduledAt ON Campaigns(ScheduledAt);

CREATE INDEX IX_EmailQueue_Status ON EmailQueue(Status);
CREATE INDEX IX_EmailQueue_ScheduledAt ON EmailQueue(ScheduledAt);
CREATE INDEX IX_EmailQueue_Priority ON EmailQueue(Priority);

CREATE INDEX IX_EmailEvents_CampaignID ON EmailEvents(CampaignID);
CREATE INDEX IX_EmailEvents_SubscriberID ON EmailEvents(SubscriberID);
CREATE INDEX IX_EmailEvents_EventType ON EmailEvents(EventType);
CREATE INDEX IX_EmailEvents_Timestamp ON EmailEvents(Timestamp);

CREATE INDEX IX_ClickTracking_CampaignID ON ClickTracking(CampaignID);
CREATE INDEX IX_ClickTracking_SubscriberID ON ClickTracking(SubscriberID);
CREATE INDEX IX_ClickTracking_ClickedAt ON ClickTracking(ClickedAt);

-- 建立觸發器以自動更新 UpdatedAt 欄位
CREATE TRIGGER TR_Users_UpdatedAt ON Users
AFTER UPDATE AS
BEGIN
    UPDATE Users 
    SET UpdatedAt = GETDATE()
    FROM Users u
    INNER JOIN inserted i ON u.UserID = i.UserID;
END;

CREATE TRIGGER TR_Subscribers_UpdatedAt ON Subscribers
AFTER UPDATE AS
BEGIN
    UPDATE Subscribers 
    SET UpdatedAt = GETDATE()
    FROM Subscribers s
    INNER JOIN inserted i ON s.SubscriberID = i.SubscriberID;
END;

CREATE TRIGGER TR_Campaigns_UpdatedAt ON Campaigns
AFTER UPDATE AS
BEGIN
    UPDATE Campaigns 
    SET UpdatedAt = GETDATE()
    FROM Campaigns c
    INNER JOIN inserted i ON c.CampaignID = i.CampaignID;
END;

-- 插入預設系統設定
INSERT INTO SystemSettings (SettingKey, SettingValue, Description) VALUES
('SMTP_HOST', 'smtp.gmail.com', 'SMTP 伺服器主機'),
('SMTP_PORT', '587', 'SMTP 伺服器埠號'),
('SMTP_SECURE', 'false', 'SMTP 是否使用 SSL'),
('EMAIL_RATE_LIMIT', '100', '每小時郵件發送限制'),
('EMAIL_BATCH_SIZE', '50', '批次發送郵件數量'),
('TRACKING_ENABLED', 'true', '是否啟用郵件追蹤'),
('UNSUBSCRIBE_URL', 'http://localhost:3000/unsubscribe', '取消訂閱連結'),
('COMPANY_NAME', 'WintonEDM', '公司名稱'),
('COMPANY_ADDRESS', '台灣台北市', '公司地址');

-- 建立預設管理員帳號 (密碼: admin123)
INSERT INTO Users (Username, Email, PasswordHash, FirstName, LastName, Role, IsActive) VALUES
('admin', 'admin@wintonemd.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'System', 'Administrator', 'Admin', 1);

PRINT '資料庫架構建立完成！';
GO