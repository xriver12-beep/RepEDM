-- 添加缺失的欄位到 subscribers 表
USE WintonEDM;

-- 添加 birthday 欄位 (使用 date 類型)
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'subscribers' AND COLUMN_NAME = 'birthday')
BEGIN
    ALTER TABLE subscribers ADD birthday date NULL;
    PRINT 'Added birthday column';
END
ELSE
BEGIN
    PRINT 'birthday column already exists';
END

-- 添加 f1 欄位 (使用 int 類型，根據範例資料)
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'subscribers' AND COLUMN_NAME = 'f1')
BEGIN
    ALTER TABLE subscribers ADD f1 int NULL;
    PRINT 'Added f1 column';
END
ELSE
BEGIN
    PRINT 'f1 column already exists';
END

-- 添加 f2 欄位
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'subscribers' AND COLUMN_NAME = 'f2')
BEGIN
    ALTER TABLE subscribers ADD f2 int NULL;
    PRINT 'Added f2 column';
END
ELSE
BEGIN
    PRINT 'f2 column already exists';
END

-- 添加 f3 欄位
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'subscribers' AND COLUMN_NAME = 'f3')
BEGIN
    ALTER TABLE subscribers ADD f3 int NULL;
    PRINT 'Added f3 column';
END
ELSE
BEGIN
    PRINT 'f3 column already exists';
END

-- 添加 f4 欄位
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'subscribers' AND COLUMN_NAME = 'f4')
BEGIN
    ALTER TABLE subscribers ADD f4 int NULL;
    PRINT 'Added f4 column';
END
ELSE
BEGIN
    PRINT 'f4 column already exists';
END

-- 添加 f5 欄位
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'subscribers' AND COLUMN_NAME = 'f5')
BEGIN
    ALTER TABLE subscribers ADD f5 int NULL;
    PRINT 'Added f5 column';
END
ELSE
BEGIN
    PRINT 'f5 column already exists';
END

-- 添加 f6 欄位 (使用 nvarchar，因為範例中有 "::Array::" 字串)
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'subscribers' AND COLUMN_NAME = 'f6')
BEGIN
    ALTER TABLE subscribers ADD f6 nvarchar(255) NULL;
    PRINT 'Added f6 column';
END
ELSE
BEGIN
    PRINT 'f6 column already exists';
END

PRINT 'All missing fields have been processed.';