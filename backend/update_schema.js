require('dotenv').config();
const { executeQuery, connectDB } = require('./src/config/database');

async function addImageUrlColumn() {
  try {
    await connectDB();
    await executeQuery(`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Categories]') AND name = 'image_url')
      BEGIN
          ALTER TABLE [dbo].[Categories] ADD [image_url] NVARCHAR(500) NULL;
          PRINT 'Column image_url added to Categories table.';
      END
      ELSE
      BEGIN
          PRINT 'Column image_url already exists in Categories table.';
      END
    `);
    console.log('Schema update completed.');
  } catch (error) {
    console.error('Schema update failed:', error);
  } finally {
    process.exit();
  }
}

addImageUrlColumn();
