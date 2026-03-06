-- 逐步添加層次結構欄位到Categories表
USE WintonEDM;
GO

PRINT '開始添加層次結構欄位...';

-- 添加 parent_id 欄位
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Categories') AND name = 'parent_id')
BEGIN
    ALTER TABLE Categories ADD parent_id INT NULL;
    PRINT '✅ parent_id 欄位已添加';
END
ELSE
    PRINT '⚠️ parent_id 欄位已存在';

-- 添加 level 欄位
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Categories') AND name = 'level')
BEGIN
    ALTER TABLE Categories ADD level INT NOT NULL DEFAULT 0;
    PRINT '✅ level 欄位已添加';
END
ELSE
    PRINT '⚠️ level 欄位已存在';

-- 添加 path 欄位
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Categories') AND name = 'path')
BEGIN
    ALTER TABLE Categories ADD path NVARCHAR(500) NULL;
    PRINT '✅ path 欄位已添加';
END
ELSE
    PRINT '⚠️ path 欄位已存在';

-- 添加 sort_order 欄位
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Categories') AND name = 'sort_order')
BEGIN
    ALTER TABLE Categories ADD sort_order INT NOT NULL DEFAULT 0;
    PRINT '✅ sort_order 欄位已添加';
END
ELSE
    PRINT '⚠️ sort_order 欄位已存在';

-- 添加 is_leaf 欄位
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Categories') AND name = 'is_leaf')
BEGIN
    ALTER TABLE Categories ADD is_leaf BIT NOT NULL DEFAULT 1;
    PRINT '✅ is_leaf 欄位已添加';
END
ELSE
    PRINT '⚠️ is_leaf 欄位已存在';

-- 添加 hierarchy_type 欄位
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Categories') AND name = 'hierarchy_type')
BEGIN
    ALTER TABLE Categories ADD hierarchy_type NVARCHAR(50) NULL;
    PRINT '✅ hierarchy_type 欄位已添加';
END
ELSE
    PRINT '⚠️ hierarchy_type 欄位已存在';

PRINT '所有欄位添加完成！';
GO