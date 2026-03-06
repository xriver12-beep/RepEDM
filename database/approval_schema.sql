-- 電子報審核機制資料庫表結構
-- 建立日期: 2024
-- 用途: 為WintonEDM系統添加電子報審核功能

USE WintonEDM;
GO

-- 1. 審核工作流程表 (ApprovalWorkflows)
CREATE TABLE ApprovalWorkflows (
    WorkflowID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    WorkflowName NVARCHAR(100) NOT NULL,
    Description NVARCHAR(500),
    WorkflowType NVARCHAR(50) NOT NULL DEFAULT 'Campaign', -- Campaign, Template, Asset
    IsActive BIT NOT NULL DEFAULT 1,
    IsDefault BIT NOT NULL DEFAULT 0, -- 是否為預設工作流程
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    CreatedBy UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Users(UserID),
    UpdatedBy UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Users(UserID)
);

-- 2. 審核步驟表 (ApprovalSteps)
CREATE TABLE ApprovalSteps (
    StepID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    WorkflowID UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES ApprovalWorkflows(WorkflowID) ON DELETE CASCADE,
    StepOrder INT NOT NULL,
    StepName NVARCHAR(100) NOT NULL,
    StepDescription NVARCHAR(500),
    RequiredRole NVARCHAR(50), -- Admin, Manager, Reviewer, 或特定角色
    RequiredUserID UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Users(UserID), -- 指定特定審核者
    IsRequired BIT NOT NULL DEFAULT 1,
    TimeoutHours INT DEFAULT 24, -- 審核超時時間（小時）
    AutoApprove BIT NOT NULL DEFAULT 0, -- 是否自動核准
    IsActive BIT NOT NULL DEFAULT 1,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE()
);

-- 3. 電子報審核記錄表 (CampaignApprovals)
CREATE TABLE CampaignApprovals (
    ApprovalID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    CampaignID UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES Campaigns(CampaignID) ON DELETE CASCADE,
    WorkflowID UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES ApprovalWorkflows(WorkflowID),
    CurrentStepID UNIQUEIDENTIFIER FOREIGN KEY REFERENCES ApprovalSteps(StepID),
    Status NVARCHAR(20) NOT NULL DEFAULT 'Pending', -- Pending, InProgress, Approved, Rejected, Cancelled, Expired
    Priority NVARCHAR(20) NOT NULL DEFAULT 'Normal', -- Low, Normal, High, Urgent
    SubmittedBy UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES Users(UserID),
    SubmittedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    CompletedAt DATETIME2 NULL,
    ExpiredAt DATETIME2 NULL, -- 審核過期時間
    FinalApproverID UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Users(UserID),
    Comments NVARCHAR(1000), -- 提交時的備註
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE()
);

-- 4. 審核步驟記錄表 (ApprovalStepRecords)
CREATE TABLE ApprovalStepRecords (
    RecordID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    ApprovalID UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES CampaignApprovals(ApprovalID) ON DELETE CASCADE,
    StepID UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES ApprovalSteps(StepID),
    ReviewerID UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Users(UserID),
    Action NVARCHAR(20) NOT NULL, -- Approved, Rejected, Returned, Delegated, Skipped
    Comments NVARCHAR(1000),
    ActionAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    IPAddress NVARCHAR(45),
    UserAgent NVARCHAR(500),
    AttachmentURL NVARCHAR(500), -- 審核時附加的文件
    IsSystemAction BIT NOT NULL DEFAULT 0 -- 是否為系統自動操作
);

-- 5. 審核委派表 (ApprovalDelegations)
CREATE TABLE ApprovalDelegations (
    DelegationID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    DelegatorID UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES Users(UserID),
    DelegateID UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES Users(UserID),
    WorkflowID UNIQUEIDENTIFIER FOREIGN KEY REFERENCES ApprovalWorkflows(WorkflowID), -- NULL表示全部工作流程
    StartDate DATETIME2 NOT NULL DEFAULT GETDATE(),
    EndDate DATETIME2,
    IsActive BIT NOT NULL DEFAULT 1,
    Reason NVARCHAR(500),
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    CreatedBy UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Users(UserID)
);

-- 6. 審核通知表 (ApprovalNotifications)
CREATE TABLE ApprovalNotifications (
    NotificationID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    ApprovalID UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES CampaignApprovals(ApprovalID) ON DELETE CASCADE,
    RecipientID UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES Users(UserID),
    NotificationType NVARCHAR(50) NOT NULL, -- Submitted, Approved, Rejected, Reminder, Expired
    Title NVARCHAR(200) NOT NULL,
    Message NVARCHAR(1000) NOT NULL,
    IsRead BIT NOT NULL DEFAULT 0,
    IsEmailSent BIT NOT NULL DEFAULT 0,
    EmailSentAt DATETIME2,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    ReadAt DATETIME2
);

-- 7. 審核EDM表 (ApprovalTemplates)
CREATE TABLE ApprovalTemplates (
    TemplateID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    TemplateName NVARCHAR(100) NOT NULL,
    TemplateType NVARCHAR(50) NOT NULL, -- Email, SystemNotification
    Subject NVARCHAR(200),
    Content NVARCHAR(MAX) NOT NULL,
    Variables NVARCHAR(MAX), -- JSON格式的可用變數說明
    IsActive BIT NOT NULL DEFAULT 1,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    CreatedBy UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Users(UserID)
);

-- 修改Campaigns表，添加審核相關欄位
ALTER TABLE Campaigns ADD 
    ApprovalStatus NVARCHAR(20) DEFAULT 'NotRequired', -- NotRequired, Pending, InProgress, Approved, Rejected
    RequiresApproval BIT NOT NULL DEFAULT 0,
    ApprovalRequestedAt DATETIME2,
    ApprovalCompletedAt DATETIME2;

-- 建立索引以提升查詢效能
CREATE INDEX IX_ApprovalWorkflows_WorkflowType ON ApprovalWorkflows(WorkflowType);
CREATE INDEX IX_ApprovalWorkflows_IsActive ON ApprovalWorkflows(IsActive);

CREATE INDEX IX_ApprovalSteps_WorkflowID ON ApprovalSteps(WorkflowID);
CREATE INDEX IX_ApprovalSteps_StepOrder ON ApprovalSteps(StepOrder);

CREATE INDEX IX_CampaignApprovals_CampaignID ON CampaignApprovals(CampaignID);
CREATE INDEX IX_CampaignApprovals_Status ON CampaignApprovals(Status);
CREATE INDEX IX_CampaignApprovals_SubmittedBy ON CampaignApprovals(SubmittedBy);
CREATE INDEX IX_CampaignApprovals_SubmittedAt ON CampaignApprovals(SubmittedAt);

CREATE INDEX IX_ApprovalStepRecords_ApprovalID ON ApprovalStepRecords(ApprovalID);
CREATE INDEX IX_ApprovalStepRecords_ReviewerID ON ApprovalStepRecords(ReviewerID);
CREATE INDEX IX_ApprovalStepRecords_ActionAt ON ApprovalStepRecords(ActionAt);

CREATE INDEX IX_ApprovalDelegations_DelegatorID ON ApprovalDelegations(DelegatorID);
CREATE INDEX IX_ApprovalDelegations_DelegateID ON ApprovalDelegations(DelegateID);
CREATE INDEX IX_ApprovalDelegations_IsActive ON ApprovalDelegations(IsActive);

CREATE INDEX IX_ApprovalNotifications_RecipientID ON ApprovalNotifications(RecipientID);
CREATE INDEX IX_ApprovalNotifications_IsRead ON ApprovalNotifications(IsRead);
CREATE INDEX IX_ApprovalNotifications_CreatedAt ON ApprovalNotifications(CreatedAt);

CREATE INDEX IX_Campaigns_ApprovalStatus ON Campaigns(ApprovalStatus);
CREATE INDEX IX_Campaigns_RequiresApproval ON Campaigns(RequiresApproval);

-- 建立觸發器以自動更新 UpdatedAt 欄位
CREATE TRIGGER TR_ApprovalWorkflows_UpdatedAt ON ApprovalWorkflows
AFTER UPDATE AS
BEGIN
    UPDATE ApprovalWorkflows 
    SET UpdatedAt = GETDATE()
    FROM ApprovalWorkflows aw
    INNER JOIN inserted i ON aw.WorkflowID = i.WorkflowID;
END;
GO

CREATE TRIGGER TR_CampaignApprovals_UpdatedAt ON CampaignApprovals
AFTER UPDATE AS
BEGIN
    UPDATE CampaignApprovals 
    SET UpdatedAt = GETDATE()
    FROM CampaignApprovals ca
    INNER JOIN inserted i ON ca.ApprovalID = i.ApprovalID;
END;
GO

CREATE TRIGGER TR_ApprovalTemplates_UpdatedAt ON ApprovalTemplates
AFTER UPDATE AS
BEGIN
    UPDATE ApprovalTemplates 
    SET UpdatedAt = GETDATE()
    FROM ApprovalTemplates at
    INNER JOIN inserted i ON at.TemplateID = i.TemplateID;
END;
GO

-- 插入預設審核工作流程
INSERT INTO ApprovalWorkflows (WorkflowName, Description, WorkflowType, IsActive, IsDefault, CreatedBy) 
SELECT 
    '標準電子報審核流程', 
    '包含內容審核和主管核准的標準兩階段審核流程', 
    'Campaign', 
    1, 
    1,
    UserID
FROM Users WHERE Role = 'Admin' AND Username = 'admin';

DECLARE @DefaultWorkflowID UNIQUEIDENTIFIER;
SELECT @DefaultWorkflowID = WorkflowID FROM ApprovalWorkflows WHERE IsDefault = 1 AND WorkflowType = 'Campaign';

-- 插入預設審核步驟
INSERT INTO ApprovalSteps (WorkflowID, StepOrder, StepName, StepDescription, RequiredRole, IsRequired, TimeoutHours) VALUES
(@DefaultWorkflowID, 1, '內容審核', '檢查電子報內容的合規性、格式和品質', 'Manager', 1, 24),
(@DefaultWorkflowID, 2, '主管核准', '最終核准電子報發送', 'Admin', 1, 48);

-- 插入預設通知範本
INSERT INTO ApprovalTemplates (TemplateName, TemplateType, Subject, Content, Variables, IsActive, CreatedBy)
SELECT 
    '審核提交通知',
    'Email',
    '電子報審核請求 - {{CampaignName}}',
    '您好，<br><br>有一封電子報需要您的審核：<br><br>電子報名稱：{{CampaignName}}<br>提交者：{{SubmitterName}}<br>提交時間：{{SubmittedAt}}<br>審核步驟：{{StepName}}<br><br>請登入系統進行審核。<br><br>謝謝！',
    '{"CampaignName": "電子報名稱", "SubmitterName": "提交者姓名", "SubmittedAt": "提交時間", "StepName": "審核步驟名稱"}',
    1,
    UserID
FROM Users WHERE Role = 'Admin' AND Username = 'admin';

INSERT INTO ApprovalTemplates (TemplateName, TemplateType, Subject, Content, Variables, IsActive, CreatedBy)
SELECT 
    '審核結果通知',
    'Email',
    '電子報審核結果 - {{CampaignName}}',
    '您好，<br><br>您提交的電子報審核已完成：<br><br>電子報名稱：{{CampaignName}}<br>審核結果：{{ApprovalResult}}<br>審核者：{{ReviewerName}}<br>審核時間：{{ReviewedAt}}<br>審核意見：{{Comments}}<br><br>請登入系統查看詳細資訊。<br><br>謝謝！',
    '{"CampaignName": "電子報名稱", "ApprovalResult": "審核結果", "ReviewerName": "審核者姓名", "ReviewedAt": "審核時間", "Comments": "審核意見"}',
    1,
    UserID
FROM Users WHERE Role = 'Admin' AND Username = 'admin';

-- 插入系統設定
INSERT INTO SystemSettings (SettingKey, SettingValue, Description) VALUES
('APPROVAL_ENABLED', 'true', '是否啟用審核機制'),
('APPROVAL_TIMEOUT_HOURS', '48', '預設審核超時時間（小時）'),
('APPROVAL_EMAIL_NOTIFICATIONS', 'true', '是否發送審核Email通知'),
('APPROVAL_AUTO_REMINDER_HOURS', '12', '自動提醒間隔時間（小時）'),
('APPROVAL_EMERGENCY_BYPASS_ROLE', 'Admin', '可以繞過審核的角色');

PRINT '電子報審核機制資料庫表結構建立完成！';
GO