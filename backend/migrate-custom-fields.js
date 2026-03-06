const sql = require('mssql');
require('dotenv').config();

async function migrateCustomFields() {
  const config = {
    server: process.env.DB_SERVER,
    port: parseInt(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: {
      encrypt: process.env.DB_ENCRYPT === 'true',
      trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true'
    }
  };

  try {
    await sql.connect(config);
    console.log('Connected to database');

    // 獲取所有有 custom_fields 的訂閱者
    const result = await sql.query(`
      SELECT id, custom_fields 
      FROM subscribers 
      WHERE custom_fields IS NOT NULL 
      AND custom_fields != ''
      AND custom_fields != 'null'
    `);

    console.log(`Found ${result.recordset.length} subscribers with custom_fields`);

    let updatedCount = 0;
    let errorCount = 0;
    const batchSize = 100;

    // 分批處理
    for (let i = 0; i < result.recordset.length; i += batchSize) {
      const batch = result.recordset.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(result.recordset.length/batchSize)}`);

      for (const subscriber of batch) {
        try {
          let customFields;
          try {
            customFields = JSON.parse(subscriber.custom_fields);
          } catch (parseError) {
            console.log(`Skipping subscriber ${subscriber.id}: Invalid JSON`);
            continue;
          }

          // 準備更新的欄位
          const updates = [];
          const params = [];
          let paramIndex = 1;

          // 處理 company
          if (customFields.company && customFields.company.trim() !== '') {
            updates.push(`company = @param${paramIndex}`);
            params.push({ name: `param${paramIndex}`, type: sql.NVarChar, value: customFields.company.trim() });
            paramIndex++;
          }

          // 處理 birthday
          if (customFields.birthday && customFields.birthday !== '0000-00-00' && customFields.birthday.trim() !== '') {
            // 嘗試解析日期
            const dateStr = customFields.birthday.trim();
            if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/) && dateStr !== '0000-00-00') {
              const date = new Date(dateStr);
              if (!isNaN(date.getTime()) && date.getFullYear() > 1900) {
                updates.push(`birthday = @param${paramIndex}`);
                params.push({ name: `param${paramIndex}`, type: sql.Date, value: date });
                paramIndex++;
              }
            }
          }

          // 處理 f1-f6
          ['f1', 'f2', 'f3', 'f4', 'f5'].forEach(field => {
            if (customFields[field] !== undefined && customFields[field] !== null && customFields[field] !== '') {
              const value = parseInt(customFields[field]);
              if (!isNaN(value)) {
                updates.push(`${field} = @param${paramIndex}`);
                params.push({ name: `param${paramIndex}`, type: sql.Int, value: value });
                paramIndex++;
              }
            }
          });

          // 處理 f6 (字串類型)
          if (customFields.f6 && customFields.f6.trim() !== '') {
            updates.push(`f6 = @param${paramIndex}`);
            params.push({ name: `param${paramIndex}`, type: sql.NVarChar, value: customFields.f6.trim() });
            paramIndex++;
          }

          // 處理 cust_id
          if (customFields.cust_id && customFields.cust_id.trim() !== '') {
            updates.push(`cust_id = @param${paramIndex}`);
            params.push({ name: `param${paramIndex}`, type: sql.NVarChar, value: customFields.cust_id.trim() });
            paramIndex++;
          }

          // 處理 original_id
          if (customFields.original_id !== undefined && customFields.original_id !== null && customFields.original_id !== '') {
            const value = parseInt(customFields.original_id);
            if (!isNaN(value)) {
              updates.push(`original_id = @param${paramIndex}`);
              params.push({ name: `param${paramIndex}`, type: sql.Int, value: value });
              paramIndex++;
            }
          }

          // 如果有要更新的欄位，執行更新
          if (updates.length > 0) {
            const updateQuery = `
              UPDATE subscribers 
              SET ${updates.join(', ')}, updated_at = GETDATE()
              WHERE id = @subscriberId
            `;

            const request = new sql.Request();
            request.input('subscriberId', sql.Int, subscriber.id);
            
            // 添加所有參數
            params.forEach(param => {
              request.input(param.name, param.type, param.value);
            });

            await request.query(updateQuery);
            updatedCount++;

            // 顯示範例
            if (updatedCount <= 5) {
              console.log(`Updated subscriber ${subscriber.id}:`, {
                company: customFields.company,
                birthday: customFields.birthday,
                f1: customFields.f1,
                f2: customFields.f2,
                f3: customFields.f3,
                f4: customFields.f4,
                f5: customFields.f5,
                f6: customFields.f6,
                cust_id: customFields.cust_id,
                original_id: customFields.original_id
              });
            }
          }

        } catch (error) {
          console.error(`Error updating subscriber ${subscriber.id}:`, error.message);
          errorCount++;
        }
      }
    }

    console.log('\n=== Migration Summary ===');
    console.log(`Total subscribers processed: ${result.recordset.length}`);
    console.log(`Successfully updated: ${updatedCount}`);
    console.log(`Errors: ${errorCount}`);

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await sql.close();
  }
}

migrateCustomFields();