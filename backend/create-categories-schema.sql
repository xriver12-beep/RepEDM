-- 建立分類和群組的資料庫結構
-- 基於分析 sqlbak 目錄中的資料結構設計

-- 1. 分類表 (Categories) - 對應原本的 epaper_member_t1 到 t6
CREATE TABLE [WintonEDM].[dbo].[Categories] (
    [id] INT IDENTITY(1,1) PRIMARY KEY,
    [category_type] NVARCHAR(20) NOT NULL, -- t1, t2, t3, t4, t5, t6
    [original_id] INT NOT NULL, -- 原始資料的 ID
    [name] NVARCHAR(100) NOT NULL,
    [display_order] INT DEFAULT 0,
    [is_active] BIT DEFAULT 1,
    [created_at] DATETIME2 DEFAULT GETDATE(),
    [updated_at] DATETIME2 DEFAULT GETDATE(),
    UNIQUE([category_type], [original_id])
);

-- 2. 會員分類關聯表 (SubscriberCategories)
CREATE TABLE [WintonEDM].[dbo].[SubscriberCategories] (
    [id] INT IDENTITY(1,1) PRIMARY KEY,
    [subscriber_id] INT NOT NULL,
    [category_id] INT NOT NULL,
    [assigned_at] DATETIME2 DEFAULT GETDATE(),
    FOREIGN KEY ([subscriber_id]) REFERENCES [WintonEDM].[dbo].[Subscribers]([id]) ON DELETE CASCADE,
    FOREIGN KEY ([category_id]) REFERENCES [WintonEDM].[dbo].[Categories]([id]) ON DELETE CASCADE,
    UNIQUE([subscriber_id], [category_id])
);

-- 3. 擴展 Subscribers 表，新增原始資料欄位
ALTER TABLE [WintonEDM].[dbo].[Subscribers] 
ADD [company] NVARCHAR(128) NULL,
    [original_id] INT NULL,
    [original_f1] INT NULL,
    [original_f2] INT NULL,
    [original_f3] INT NULL,
    [original_f4] INT NULL,
    [original_f5] INT NULL,
    [original_f6] NVARCHAR(32) NULL,
    [cust_id] NVARCHAR(50) NULL;

-- 建立索引以提升查詢效能
CREATE INDEX [IX_Categories_Type] ON [WintonEDM].[dbo].[Categories]([category_type]);
CREATE INDEX [IX_Categories_Name] ON [WintonEDM].[dbo].[Categories]([name]);
CREATE INDEX [IX_SubscriberCategories_Subscriber] ON [WintonEDM].[dbo].[SubscriberCategories]([subscriber_id]);
CREATE INDEX [IX_SubscriberCategories_Category] ON [WintonEDM].[dbo].[SubscriberCategories]([category_id]);
CREATE INDEX [IX_Subscribers_Company] ON [WintonEDM].[dbo].[Subscribers]([company]);
CREATE INDEX [IX_Subscribers_OriginalId] ON [WintonEDM].[dbo].[Subscribers]([original_id]);
CREATE INDEX [IX_Subscribers_CustId] ON [WintonEDM].[dbo].[Subscribers]([cust_id]);

-- 建立檢視表以便查詢會員及其分類
CREATE VIEW [WintonEDM].[dbo].[vw_SubscriberWithCategories] AS
SELECT 
    s.[id],
    s.[email],
    s.[first_name],
    s.[last_name],
    s.[company],
    s.[status],
    s.[phone],
    s.[gender],
    s.[birth_date],
    s.[country],
    s.[city],
    s.[source],
    s.[original_id],
    s.[cust_id],
    s.[subscribed_at],
    s.[created_at],
    STRING_AGG(c.[name], '; ') AS [categories],
    COUNT(sc.[category_id]) AS [category_count]
FROM [WintonEDM].[dbo].[Subscribers] s
LEFT JOIN [WintonEDM].[dbo].[SubscriberCategories] sc ON s.[id] = sc.[subscriber_id]
LEFT JOIN [WintonEDM].[dbo].[Categories] c ON sc.[category_id] = c.[id]
GROUP BY 
    s.[id], s.[email], s.[first_name], s.[last_name], s.[company], 
    s.[status], s.[phone], s.[gender], s.[birth_date], s.[country], 
    s.[city], s.[source], s.[original_id], s.[cust_id], 
    s.[subscribed_at], s.[created_at];

PRINT '✅ 分類和群組資料庫結構建立完成';
PRINT '📊 建立的表格:';
PRINT '   - Categories: 分類主表';
PRINT '   - SubscriberCategories: 會員分類關聯表';
PRINT '   - 擴展 Subscribers 表: 新增原始資料欄位';
PRINT '   - vw_SubscriberWithCategories: 會員分類檢視表';