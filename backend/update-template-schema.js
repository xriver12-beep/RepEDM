const { executeQuery, connectDB, closeDB } = require('./src/config/database');

async function updateSchema() {
    try {
        await connectDB();
        console.log('Starting schema update...');

        // 1. Create TemplateCategories table
        const createCategoriesTable = `
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='TemplateCategories' AND xtype='U')
            BEGIN
                CREATE TABLE TemplateCategories (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    name NVARCHAR(100) NOT NULL,
                    description NVARCHAR(255),
                    is_system BIT DEFAULT 0,
                    created_by INT,
                    created_at DATETIME2 DEFAULT GETDATE(),
                    updated_at DATETIME2 DEFAULT GETDATE()
                );
                
                -- Insert default categories
                INSERT INTO TemplateCategories (name, description, is_system)
                VALUES 
                (N'行銷活動', N'用於產品推廣、促銷活動', 1),
                (N'教育訓練', N'內部培訓、課程通知', 1),
                (N'公司快訊', N'重要公告、新聞發布', 1),
                (N'節慶問候', N'節日祝福、賀卡', 1);
                
                PRINT 'TemplateCategories table created and seeded.';
            END
        `;
        await executeQuery(createCategoriesTable);

        // 2. Add columns to Templates table
        const alterTemplatesTable = `
            IF NOT EXISTS(SELECT * FROM sys.columns WHERE Name = N'category_id' AND Object_ID = Object_ID(N'Templates'))
            BEGIN
                ALTER TABLE Templates ADD category_id INT;
                ALTER TABLE Templates ADD CONSTRAINT FK_Templates_Categories FOREIGN KEY (category_id) REFERENCES TemplateCategories(id);
                PRINT 'Added category_id to Templates.';
            END

            IF NOT EXISTS(SELECT * FROM sys.columns WHERE Name = N'is_public' AND Object_ID = Object_ID(N'Templates'))
            BEGIN
                ALTER TABLE Templates ADD is_public BIT DEFAULT 0;
                PRINT 'Added is_public to Templates.';
            END
        `;
        await executeQuery(alterTemplatesTable);

        console.log('Schema update completed successfully.');
    } catch (error) {
        console.error('Schema update failed:', error);
    } finally {
        await closeDB();
    }
}

updateSchema();
