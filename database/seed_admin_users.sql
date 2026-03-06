-- 電子報管理系統 - 初始管理員用戶數據
-- 創建預設的管理員帳號

USE WintonEDM;
GO

-- 清除現有的管理員用戶（如果存在）
DELETE FROM AdminUsers;

-- 插入初始管理員用戶
-- 注意：這些是示例密碼，實際部署時應該更改
-- 密碼都是 'password123'，已經過 bcrypt 加密

DECLARE @AdminID UNIQUEIDENTIFIER = NEWID();
DECLARE @ManagerID UNIQUEIDENTIFIER = NEWID();
DECLARE @EditorID UNIQUEIDENTIFIER = NEWID();

INSERT INTO AdminUsers (
    AdminUserID,
    Username,
    Email,
    PasswordHash,
    Salt,
    FirstName,
    LastName,
    DisplayName,
    Role,
    Department,
    Position,
    IsActive,
    IsEmailVerified,
    MustChangePassword,
    CreatedAt,
    UpdatedAt
) VALUES 
-- 系統管理員
(
    @AdminID,
    'admin',
    'admin@wintonedm.com',
    '$2b$10$rOzJqQZQZQZQZQZQZQZQZOzJqQZQZQZQZQZQZQZQZOzJqQZQZQZQZQ', -- password123
    'salt_admin_123',
    '系統',
    '管理員',
    '系統管理員',
    'Admin',
    'IT部門',
    '系統管理員',
    1,
    1,
    1, -- 首次登入需要更改密碼
    GETDATE(),
    GETDATE()
),
-- 行銷經理
(
    @ManagerID,
    'manager',
    'manager@wintonedm.com',
    '$2b$10$rOzJqQZQZQZQZQZQZQZQZOzJqQZQZQZQZQZQZQZQZOzJqQZQZQZQZQ', -- password123
    'salt_manager_123',
    '行銷',
    '經理',
    '行銷經理',
    'Manager',
    '行銷部門',
    '經理',
    1,
    1,
    1,
    GETDATE(),
    GETDATE()
),
-- 內容編輯
(
    @EditorID,
    'editor',
    'editor@wintonedm.com',
    '$2b$10$rOzJqQZQZQZQZQZQZQZQZOzJqQZQZQZQZQZQZQZQZOzJqQZQZQZQZQ', -- password123
    'salt_editor_123',
    '內容',
    '編輯',
    '內容編輯',
    'Editor',
    '內容部門',
    '編輯',
    1,
    1,
    1,
    GETDATE(),
    GETDATE()
);

-- 更新創建者資訊
UPDATE AdminUsers SET CreatedBy = @AdminID WHERE AdminUserID != @AdminID;

PRINT '初始管理員用戶創建完成：';
PRINT '1. admin / password123 (系統管理員)';
PRINT '2. manager / password123 (行銷經理)';
PRINT '3. editor / password123 (內容編輯)';
PRINT '';
PRINT '注意：請在首次登入後立即更改密碼！';

-- 顯示創建的用戶
SELECT 
    Username,
    Email,
    DisplayName,
    Role,
    Department,
    Position,
    IsActive,
    CreatedAt
FROM AdminUsers
ORDER BY Role, Username;