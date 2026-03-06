-- 更新Categories表以支持多層次結構 (分步驟執行)
-- 執行前請備份數據庫

USE WintonEDM;
GO

-- 步驟1: 添加新欄位支持層次結構
PRINT '步驟1: 添加新欄位...';

-- 檢查欄位是否已存在，避免重複添加
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Categories') AND name = 'parent_id')
    ALTER TABLE Categories ADD parent_id INT NULL;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Categories') AND name = 'level')
    ALTER TABLE Categories ADD level INT NOT NULL DEFAULT 0;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Categories') AND name = 'path')
    ALTER TABLE Categories ADD path NVARCHAR(500) NULL;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Categories') AND name = 'sort_order')
    ALTER TABLE Categories ADD sort_order INT NOT NULL DEFAULT 0;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Categories') AND name = 'is_leaf')
    ALTER TABLE Categories ADD is_leaf BIT NOT NULL DEFAULT 1;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Categories') AND name = 'hierarchy_type')
    ALTER TABLE Categories ADD hierarchy_type NVARCHAR(50) NULL;

PRINT '✅ 新欄位添加完成';
GO

-- 步驟2: 添加外鍵約束
PRINT '步驟2: 添加外鍵約束...';

IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_Categories_Parent')
BEGIN
    ALTER TABLE Categories 
    ADD CONSTRAINT FK_Categories_Parent 
    FOREIGN KEY (parent_id) REFERENCES Categories(id);
    PRINT '✅ 外鍵約束添加完成';
END
ELSE
    PRINT '⚠️ 外鍵約束已存在';
GO

-- 步驟3: 創建索引優化查詢性能
PRINT '步驟3: 創建索引...';

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Categories_Parent_Sort')
    CREATE INDEX IX_Categories_Parent_Sort ON Categories(parent_id, sort_order);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Categories_Level')
    CREATE INDEX IX_Categories_Level ON Categories(level);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Categories_Path')
    CREATE INDEX IX_Categories_Path ON Categories(path);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Categories_HierarchyType')
    CREATE INDEX IX_Categories_HierarchyType ON Categories(hierarchy_type);

PRINT '✅ 索引創建完成';
GO

-- 步驟4: 更新現有數據，設置層次類型
PRINT '步驟4: 更新現有數據...';

UPDATE Categories SET 
    hierarchy_type = CASE 
        WHEN category_type = 't1' THEN 'customer'      -- 客戶身份
        WHEN category_type = 't2' THEN 'organization'  -- 組織單位
        WHEN category_type = 't3' THEN 'geography'     -- 地理區域
        WHEN category_type = 't4' THEN 'department'    -- 部門
        WHEN category_type = 't5' THEN 'contract'      -- 合約
        WHEN category_type = 't6' THEN 'product'       -- 產品
        ELSE 'other'
    END,
    level = 0,  -- 現有數據暫時設為根節點
    path = '/' + CAST(id AS NVARCHAR(10)),
    sort_order = id
WHERE hierarchy_type IS NULL;

PRINT '✅ 現有數據更新完成';
GO

PRINT '🎉 Categories表層次結構基礎更新完成！';
PRINT '📋 已完成:';
PRINT '   - ✅ 父子關係欄位 (parent_id)';
PRINT '   - ✅ 層級深度追蹤 (level)';
PRINT '   - ✅ 路徑記錄 (path)';
PRINT '   - ✅ 層次類型分類 (hierarchy_type)';
PRINT '   - ✅ 排序支持 (sort_order)';
PRINT '   - ✅ 葉節點標記 (is_leaf)';
PRINT '   - ✅ 索引優化';
PRINT '   - ✅ 現有數據遷移';
PRINT '';
PRINT '📝 下一步: 執行 create-hierarchy-procedures.sql 創建存儲過程';
GO