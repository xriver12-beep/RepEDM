const { sql, executeQuery, connectDB } = require('./src/config/database');

async function setupDatabase() {
  try {
    console.log('Starting database setup for Asset Management...');
    await connectDB();
    console.log('Database connected.');

    // Debug: List tables
    const tables = await executeQuery("SELECT name FROM sys.tables");
    console.log('Existing tables:', tables.recordset.map(t => t.name));

    // 1. Create AssetCategories table
    console.log('Creating AssetCategories table...');
    await executeQuery(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AssetCategories')
      BEGIN
          CREATE TABLE AssetCategories (
              id INT IDENTITY(1,1) PRIMARY KEY,
              name NVARCHAR(100) NOT NULL,
              description NVARCHAR(500),
              created_at DATETIME DEFAULT GETDATE(),
              created_by INT
          );
      END
    `);

    // 2. Create or Update Assets table
    console.log('Checking Assets table...');
    
    // Create Assets table if not exists
    await executeQuery(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Assets')
      BEGIN
          CREATE TABLE Assets (
              id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
              original_name NVARCHAR(255) NOT NULL,
              file_name NVARCHAR(255) NOT NULL,
              mime_type NVARCHAR(100),
              file_size BIGINT,
              description NVARCHAR(MAX),
              category NVARCHAR(50), -- Keeping for backward compatibility/string storage
              uploaded_by INT,
              created_at DATETIME DEFAULT GETDATE(),
              updated_at DATETIME DEFAULT GETDATE(),
              version INT DEFAULT 1,
              group_id UNIQUEIDENTIFIER,
              category_id INT
          );
      END
    `);

    // Check and add version column (if table existed but columns missing)
    await executeQuery(`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Assets') AND name = 'version')
      BEGIN
          ALTER TABLE Assets ADD version INT DEFAULT 1;
      END
    `);

    // Check and add group_id column
    await executeQuery(`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Assets') AND name = 'group_id')
      BEGIN
          ALTER TABLE Assets ADD group_id UNIQUEIDENTIFIER;
      END
    `);

    // Check and add category_id column
    await executeQuery(`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Assets') AND name = 'category_id')
      BEGIN
          ALTER TABLE Assets ADD category_id INT;
      END
    `);

    // 3. Data Migration
    console.log('Migrating existing data...');
    
    // Update group_id for existing records
    await executeQuery(`
      UPDATE Assets SET group_id = id WHERE group_id IS NULL;
    `);

    // Create default 'General' category if not exists
    await executeQuery(`
      IF NOT EXISTS (SELECT * FROM AssetCategories WHERE name = '一般')
      BEGIN
          INSERT INTO AssetCategories (name, description) VALUES ('一般', '預設分類');
      END
    `);
    
    // Update existing assets to use default category if they have string category 'General' or null
    // Note: We are keeping the old 'category' string column for backward compatibility for now, 
    // but we should populate category_id.
    // Let's find the ID of 'General'
    const generalCatResult = await executeQuery("SELECT id FROM AssetCategories WHERE name = '一般'");
    if (generalCatResult.recordset.length > 0) {
        const generalId = generalCatResult.recordset[0].id;
        await executeQuery(`
            UPDATE Assets SET category_id = ${generalId} 
            WHERE category_id IS NULL AND (category = 'General' OR category IS NULL);
        `);
    }

    console.log('Database setup completed successfully.');
  } catch (error) {
    console.error('Database setup failed:', error);
  } finally {
    process.exit();
  }
}

setupDatabase();
