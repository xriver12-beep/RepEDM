-- 電子報管理系統 - 管理員用戶表
-- 此表專門用於管理系統的登入用戶，與訂閱者（subscribers）分開

USE WintonEDM;
GO

-- 創建管理員用戶表
CREATE TABLE AdminUsers (
    AdminUserID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    Username NVARCHAR(50) NOT NULL UNIQUE,
    Email NVARCHAR(255) NOT NULL UNIQUE,
    PasswordHash NVARCHAR(255) NOT NULL,
    Salt NVARCHAR(255) NOT NULL,
    FirstName NVARCHAR(100),
    LastName NVARCHAR(100),
    DisplayName NVARCHAR(150),
    Role NVARCHAR(20) NOT NULL DEFAULT 'Editor', -- Admin, Manager, Editor
    Department NVARCHAR(100),
    Position NVARCHAR(100),
    IsActive BIT NOT NULL DEFAULT 1,
    IsEmailVerified BIT NOT NULL DEFAULT 0,
    LastLoginAt DATETIME2,
    LastLoginIP NVARCHAR(45),
    FailedLoginAttempts INT NOT NULL DEFAULT 0,
    LockedUntil DATETIME2,
    PasswordChangedAt DATETIME2,
    MustChangePassword BIT NOT NULL DEFAULT 1,
    TwoFactorEnabled BIT NOT NULL DEFAULT 0,
    TwoFactorSecret NVARCHAR(255),
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    CreatedBy UNIQUEIDENTIFIER,
    UpdatedBy UNIQUEIDENTIFIER
);

-- 創建索引
CREATE INDEX IX_AdminUsers_Username ON AdminUsers(Username);
CREATE INDEX IX_AdminUsers_Email ON AdminUsers(Email);
CREATE INDEX IX_AdminUsers_Role ON AdminUsers(Role);
CREATE INDEX IX_AdminUsers_IsActive ON AdminUsers(IsActive);
CREATE INDEX IX_AdminUsers_LastLoginAt ON AdminUsers(LastLoginAt);

-- 創建管理員權限表
CREATE TABLE AdminPermissions (
    PermissionID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    PermissionName NVARCHAR(100) NOT NULL UNIQUE,
    Description NVARCHAR(500),
    Category NVARCHAR(50), -- System, Users, Subscribers, Campaigns, Templates, Analytics
    IsActive BIT NOT NULL DEFAULT 1,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE()
);

-- 創建角色權限關聯表
CREATE TABLE RolePermissions (
    Role NVARCHAR(20) NOT NULL,
    PermissionID UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES AdminPermissions(PermissionID),
    GrantedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    GrantedBy UNIQUEIDENTIFIER,
    PRIMARY KEY (Role, PermissionID)
);

-- 創建管理員登入記錄表
CREATE TABLE AdminLoginLogs (
    LogID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    AdminUserID UNIQUEIDENTIFIER FOREIGN KEY REFERENCES AdminUsers(AdminUserID),
    Username NVARCHAR(50),
    LoginAttemptAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    IPAddress NVARCHAR(45),
    UserAgent NVARCHAR(500),
    IsSuccessful BIT NOT NULL,
    FailureReason NVARCHAR(255),
    SessionToken NVARCHAR(255)
);

-- 創建索引
CREATE INDEX IX_AdminLoginLogs_AdminUserID ON AdminLoginLogs(AdminUserID);
CREATE INDEX IX_AdminLoginLogs_LoginAttemptAt ON AdminLoginLogs(LoginAttemptAt);
CREATE INDEX IX_AdminLoginLogs_IsSuccessful ON AdminLoginLogs(IsSuccessful);

-- 插入基本權限
INSERT INTO AdminPermissions (PermissionName, Description, Category) VALUES
-- 系統管理
('system.manage', '系統管理', 'System'),
('system.settings', '系統設定', 'System'),
('system.logs', '查看系統日誌', 'System'),

-- 用戶管理
('users.view', '查看管理員用戶', 'Users'),
('users.create', '創建管理員用戶', 'Users'),
('users.edit', '編輯管理員用戶', 'Users'),
('users.delete', '刪除管理員用戶', 'Users'),
('users.permissions', '管理用戶權限', 'Users'),

-- 訂閱者管理
('subscribers.view', '查看訂閱者', 'Subscribers'),
('subscribers.create', '創建訂閱者', 'Subscribers'),
('subscribers.edit', '編輯訂閱者', 'Subscribers'),
('subscribers.delete', '刪除訂閱者', 'Subscribers'),
('subscribers.import', '匯入訂閱者', 'Subscribers'),
('subscribers.export', '匯出訂閱者', 'Subscribers'),

-- 活動管理
('campaigns.view', '查看活動', 'Campaigns'),
('campaigns.create', '創建活動', 'Campaigns'),
('campaigns.edit', '編輯活動', 'Campaigns'),
('campaigns.delete', '刪除活動', 'Campaigns'),
('campaigns.send', '發送活動', 'Campaigns'),
('campaigns.approve', '審核活動', 'Campaigns'),

-- EDM管理
('templates.view', '查看EDM', 'Templates'),
('templates.create', '創建EDM', 'Templates'),
('templates.edit', '編輯EDM', 'Templates'),
('templates.delete', '刪除EDM', 'Templates'),

-- 分析報告
('analytics.view', '查看分析報告', 'Analytics'),
('analytics.export', '匯出報告', 'Analytics');

-- 設定角色權限
-- Admin 角色 - 所有權限
INSERT INTO RolePermissions (Role, PermissionID)
SELECT 'Admin', PermissionID FROM AdminPermissions;

-- Manager 角色 - 除了系統管理外的所有權限
INSERT INTO RolePermissions (Role, PermissionID)
SELECT 'Manager', PermissionID FROM AdminPermissions 
WHERE Category != 'System' OR PermissionName IN ('system.logs');

-- Editor 角色 - 基本操作權限
INSERT INTO RolePermissions (Role, PermissionID)
SELECT 'Editor', PermissionID FROM AdminPermissions 
WHERE PermissionName IN (
    'subscribers.view', 'subscribers.create', 'subscribers.edit',
    'campaigns.view', 'campaigns.create', 'campaigns.edit',
    'templates.view', 'templates.create', 'templates.edit',
    'analytics.view'
);

PRINT '管理員用戶表和權限系統創建完成';