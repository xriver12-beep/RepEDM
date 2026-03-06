-- WintonEDM 數據庫表結構
-- 創建日期: 2024-10-23

-- 1. 用戶表
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Users' AND xtype='U')
CREATE TABLE Users (
    id INT IDENTITY(1,1) PRIMARY KEY,
    username NVARCHAR(50) NOT NULL UNIQUE,
    email NVARCHAR(100) NOT NULL UNIQUE,
    password_hash NVARCHAR(255) NOT NULL,
    full_name NVARCHAR(100) NOT NULL,
    role NVARCHAR(20) NOT NULL DEFAULT 'user', -- admin, manager, user
    department NVARCHAR(50),
    is_active BIT NOT NULL DEFAULT 1,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
);

-- 17. 用戶登入日誌表
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='UserLoginLogs' AND xtype='U')
CREATE TABLE UserLoginLogs (
    id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT NOT NULL,
    login_time DATETIME2 NOT NULL DEFAULT GETDATE(),
    logout_time DATETIME2 NULL,
    ip_address NVARCHAR(50),
    user_agent NVARCHAR(500),
    session_id NVARCHAR(100),
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
);

-- 2. 訂閱者表
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Subscribers' AND xtype='U')
CREATE TABLE Subscribers (
    id INT IDENTITY(1,1) PRIMARY KEY,
    email NVARCHAR(100) NOT NULL UNIQUE,
    first_name NVARCHAR(50),
    last_name NVARCHAR(50),
    status NVARCHAR(20) NOT NULL DEFAULT 'active', -- active, unsubscribed, bounced
    tags NVARCHAR(500), -- JSON array of tags
    custom_fields NVARCHAR(MAX), -- JSON object for custom fields
    company NVARCHAR(255),
    phone NVARCHAR(50),
    gender NVARCHAR(20),
    city NVARCHAR(100),
    birthday DATE,
    f1 INT,
    f2 INT,
    f3 INT,
    f4 INT,
    f5 INT,
    f6 NVARCHAR(255),
    cust_id NVARCHAR(100),
    original_id INT,
    subscribed_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    unsubscribed_at DATETIME2,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
);

-- 3. 郵件模板表
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Templates' AND xtype='U')
CREATE TABLE Templates (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(100) NOT NULL,
    subject NVARCHAR(200) NOT NULL,
    html_content NVARCHAR(MAX) NOT NULL,
    text_content NVARCHAR(MAX),
    template_type NVARCHAR(20) NOT NULL DEFAULT 'email', -- email, sms
    is_active BIT NOT NULL DEFAULT 1,
    created_by INT NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (created_by) REFERENCES Users(id)
);

-- 4. 審核工作流程表
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ApprovalWorkflows' AND xtype='U')
CREATE TABLE ApprovalWorkflows (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(100) NOT NULL,
    description NVARCHAR(500),
    is_active BIT NOT NULL DEFAULT 1,
    created_by INT NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (created_by) REFERENCES Users(id)
);

-- 5. 審核工作流程步驟表
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='WorkflowSteps' AND xtype='U')
CREATE TABLE WorkflowSteps (
    id INT IDENTITY(1,1) PRIMARY KEY,
    workflow_id INT NOT NULL,
    step_order INT NOT NULL,
    step_name NVARCHAR(100) NOT NULL,
    approver_id INT NOT NULL,
    is_required BIT NOT NULL DEFAULT 1,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (workflow_id) REFERENCES ApprovalWorkflows(id) ON DELETE CASCADE,
    FOREIGN KEY (approver_id) REFERENCES Users(id),
    UNIQUE(workflow_id, step_order)
);

-- 6. 郵件活動表
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Campaigns' AND xtype='U')
CREATE TABLE Campaigns (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(100) NOT NULL,
    subject NVARCHAR(200) NOT NULL,
    template_id INT,
    html_content NVARCHAR(MAX) NOT NULL,
    text_content NVARCHAR(MAX),
    sender_name NVARCHAR(100) NOT NULL,
    sender_email NVARCHAR(100) NOT NULL,
    reply_to NVARCHAR(100),
    status NVARCHAR(20) NOT NULL DEFAULT 'draft', -- draft, pending_approval, approved, rejected, scheduled, sending, sent, cancelled
    priority NVARCHAR(10) NOT NULL DEFAULT 'medium', -- low, medium, high, urgent
    scheduled_at DATETIME2,
    sent_at DATETIME2,
    recipient_count INT DEFAULT 0,
    opened_count INT DEFAULT 0,
    clicked_count INT DEFAULT 0,
    bounced_count INT DEFAULT 0,
    unsubscribed_count INT DEFAULT 0,
    workflow_id INT,
    created_by INT NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (template_id) REFERENCES Templates(id),
    FOREIGN KEY (workflow_id) REFERENCES ApprovalWorkflows(id),
    FOREIGN KEY (created_by) REFERENCES Users(id)
);

-- 7. 審核項目表
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ApprovalItems' AND xtype='U')
CREATE TABLE ApprovalItems (
    id INT IDENTITY(1,1) PRIMARY KEY,
    campaign_id INT NOT NULL,
    workflow_id INT NOT NULL,
    current_step INT NOT NULL DEFAULT 1,
    total_steps INT NOT NULL,
    status NVARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, in_review, approved, rejected
    priority NVARCHAR(10) NOT NULL DEFAULT 'medium', -- low, medium, high, urgent
    submitted_by INT NOT NULL,
    submitted_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    completed_at DATETIME2,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (campaign_id) REFERENCES Campaigns(id) ON DELETE CASCADE,
    FOREIGN KEY (workflow_id) REFERENCES ApprovalWorkflows(id),
    FOREIGN KEY (submitted_by) REFERENCES Users(id)
);

-- 8. 審核步驟執行表
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ApprovalSteps' AND xtype='U')
CREATE TABLE ApprovalSteps (
    id INT IDENTITY(1,1) PRIMARY KEY,
    approval_item_id INT NOT NULL,
    workflow_step_id INT NOT NULL,
    step_order INT NOT NULL,
    approver_id INT NOT NULL,
    status NVARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, approved, rejected
    comments NVARCHAR(1000),
    approved_at DATETIME2,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (approval_item_id) REFERENCES ApprovalItems(id) ON DELETE CASCADE,
    FOREIGN KEY (workflow_step_id) REFERENCES WorkflowSteps(id),
    FOREIGN KEY (approver_id) REFERENCES Users(id)
);

-- 9. 審核歷史表
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ApprovalHistory' AND xtype='U')
CREATE TABLE ApprovalHistory (
    id INT IDENTITY(1,1) PRIMARY KEY,
    approval_item_id INT NOT NULL,
    action NVARCHAR(20) NOT NULL, -- submitted, approved, rejected, reassigned
    actor_id INT NOT NULL,
    step_order INT,
    comments NVARCHAR(1000),
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (approval_item_id) REFERENCES ApprovalItems(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_id) REFERENCES Users(id)
);

-- 10. 郵件發送記錄表
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='EmailSends' AND xtype='U')
CREATE TABLE EmailSends (
    id INT IDENTITY(1,1) PRIMARY KEY,
    TrackingID NVARCHAR(50),
    campaign_id INT NOT NULL,
    subscriber_id INT NOT NULL,
    email NVARCHAR(100) NOT NULL,
    status NVARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, sent, delivered, bounced, failed
    sent_at DATETIME2,
    delivered_at DATETIME2,
    opened_at DATETIME2,
    clicked_at DATETIME2,
    bounced_at DATETIME2,
    bounce_reason NVARCHAR(500),
    unsubscribed_at DATETIME2,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (campaign_id) REFERENCES Campaigns(id) ON DELETE CASCADE,
    FOREIGN KEY (subscriber_id) REFERENCES Subscribers(id)
);

-- 11. 系統設置表
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Settings' AND xtype='U')
CREATE TABLE Settings (
    id INT IDENTITY(1,1) PRIMARY KEY,
    setting_key NVARCHAR(100) NOT NULL UNIQUE,
    setting_value NVARCHAR(MAX),
    description NVARCHAR(500),
    is_public BIT NOT NULL DEFAULT 0,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
);

-- 12. 郵件開啟記錄表
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='EmailOpens' AND xtype='U')
CREATE TABLE EmailOpens (
    id INT IDENTITY(1,1) PRIMARY KEY,
    CampaignID INT,
    SubscriberID INT,
    OpenedAt DATETIME2 DEFAULT GETDATE(),
    IPAddress NVARCHAR(50),
    UserAgent NVARCHAR(500),
    Device NVARCHAR(50),
    EmailClient NVARCHAR(50),
    FOREIGN KEY (CampaignID) REFERENCES Campaigns(id),
    FOREIGN KEY (SubscriberID) REFERENCES Subscribers(id)
);

-- 13. 郵件點擊記錄表
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='EmailClicks' AND xtype='U')
CREATE TABLE EmailClicks (
    id INT IDENTITY(1,1) PRIMARY KEY,
    CampaignID INT,
    SubscriberID INT,
    URL NVARCHAR(MAX),
    ClickedAt DATETIME2 DEFAULT GETDATE(),
    IPAddress NVARCHAR(50),
    UserAgent NVARCHAR(500),
    FOREIGN KEY (CampaignID) REFERENCES Campaigns(id),
    FOREIGN KEY (SubscriberID) REFERENCES Subscribers(id)
);

-- 14. 郵件退訂記錄表
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='EmailUnsubscribes' AND xtype='U')
CREATE TABLE EmailUnsubscribes (
    id INT IDENTITY(1,1) PRIMARY KEY,
    CampaignID INT,
    SubscriberID INT,
    UnsubscribedAt DATETIME2 DEFAULT GETDATE(),
    IPAddress NVARCHAR(50),
    FOREIGN KEY (CampaignID) REFERENCES Campaigns(id),
    FOREIGN KEY (SubscriberID) REFERENCES Subscribers(id)
);
