-- 建立分類和群組的資料庫結構
USE [WintonEDM];

-- 1. 分類表 (Categories) - 對應原本的 epaper_member_t1 到 t6
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Categories')
BEGIN
    CREATE TABLE [dbo].[Categories] (
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
    PRINT 'Categories table created successfully';
END
ELSE
BEGIN
    PRINT 'Categories table already exists';
END

-- 2. 會員分類關聯表 (SubscriberCategories)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SubscriberCategories')
BEGIN
    CREATE TABLE [dbo].[SubscriberCategories] (
        [id] INT IDENTITY(1,1) PRIMARY KEY,
        [subscriber_id] INT NOT NULL,
        [category_id] INT NOT NULL,
        [assigned_at] DATETIME2 DEFAULT GETDATE(),
        FOREIGN KEY ([subscriber_id]) REFERENCES [dbo].[Subscribers]([id]) ON DELETE CASCADE,
        FOREIGN KEY ([category_id]) REFERENCES [dbo].[Categories]([id]) ON DELETE CASCADE,
        UNIQUE([subscriber_id], [category_id])
    );
    PRINT 'SubscriberCategories table created successfully';
END
ELSE
BEGIN
    PRINT 'SubscriberCategories table already exists';
END

-- 建立索引以提升查詢效能
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Categories_Type')
    CREATE INDEX [IX_Categories_Type] ON [dbo].[Categories]([category_type]);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Categories_Name')
    CREATE INDEX [IX_Categories_Name] ON [dbo].[Categories]([name]);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_SubscriberCategories_Subscriber')
    CREATE INDEX [IX_SubscriberCategories_Subscriber] ON [dbo].[SubscriberCategories]([subscriber_id]);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_SubscriberCategories_Category')
    CREATE INDEX [IX_SubscriberCategories_Category] ON [dbo].[SubscriberCategories]([category_id]);

-- 建立檢視表以便查詢會員及其分類
IF NOT EXISTS (SELECT * FROM sys.views WHERE name = 'vw_SubscriberWithCategories')
BEGIN
    EXEC('CREATE VIEW [dbo].[vw_SubscriberWithCategories] AS
    SELECT 
        s.[id] as subscriber_id,
        s.[email],
        s.[first_name],
        s.[last_name],
        s.[company],
        s.[original_id],
        c.[id] as category_id,
        c.[category_type],
        c.[name] as category_name,
        c.[display_order]
    FROM [dbo].[Subscribers] s
    LEFT JOIN [dbo].[SubscriberCategories] sc ON s.[id] = sc.[subscriber_id]
    LEFT JOIN [dbo].[Categories] c ON sc.[category_id] = c.[id]
    WHERE s.[status] = ''subscribed''');
    PRINT 'View vw_SubscriberWithCategories created successfully';
END

PRINT 'Categories schema setup completed';