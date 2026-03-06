-- 更新 Subscribers 表結構，添加原始資料欄位
USE [WintonEDM];

-- 添加原始資料相關欄位
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('[dbo].[Subscribers]') AND name = 'company')
    ALTER TABLE [dbo].[Subscribers] ADD [company] NVARCHAR(255) NULL;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('[dbo].[Subscribers]') AND name = 'original_id')
    ALTER TABLE [dbo].[Subscribers] ADD [original_id] INT NULL;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('[dbo].[Subscribers]') AND name = 'original_f1')
    ALTER TABLE [dbo].[Subscribers] ADD [original_f1] INT NULL;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('[dbo].[Subscribers]') AND name = 'original_f2')
    ALTER TABLE [dbo].[Subscribers] ADD [original_f2] INT NULL;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('[dbo].[Subscribers]') AND name = 'original_f3')
    ALTER TABLE [dbo].[Subscribers] ADD [original_f3] INT NULL;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('[dbo].[Subscribers]') AND name = 'original_f4')
    ALTER TABLE [dbo].[Subscribers] ADD [original_f4] INT NULL;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('[dbo].[Subscribers]') AND name = 'original_f5')
    ALTER TABLE [dbo].[Subscribers] ADD [original_f5] INT NULL;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('[dbo].[Subscribers]') AND name = 'original_f6')
    ALTER TABLE [dbo].[Subscribers] ADD [original_f6] NVARCHAR(255) NULL;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('[dbo].[Subscribers]') AND name = 'cust_id')
    ALTER TABLE [dbo].[Subscribers] ADD [cust_id] NVARCHAR(100) NULL;

-- 創建索引以提高查詢效能
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE object_id = OBJECT_ID('[dbo].[Subscribers]') AND name = 'IX_Subscribers_OriginalId')
    CREATE INDEX IX_Subscribers_OriginalId ON [dbo].[Subscribers] ([original_id]);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE object_id = OBJECT_ID('[dbo].[Subscribers]') AND name = 'IX_Subscribers_CustId')
    CREATE INDEX IX_Subscribers_CustId ON [dbo].[Subscribers] ([cust_id]);

PRINT 'Subscribers table structure updated successfully';