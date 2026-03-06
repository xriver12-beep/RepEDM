const sql = require('mssql');
require('dotenv').config();

const config = {
    server: 'edm2022',
    port: parseInt(process.env.DB_PORT) || 1433,
    database: process.env.DB_NAME || 'WintonEDM',
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || 'Wint0n2k00',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function checkCategoriesSchema() {
    try {
        await sql.connect(config);
        console.log('✅ 數據庫連接成功');

        // 檢查Categories表結構
        const schemaQuery = `
            SELECT 
                COLUMN_NAME,
                DATA_TYPE,
                IS_NULLABLE,
                COLUMN_DEFAULT,
                CHARACTER_MAXIMUM_LENGTH
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'Categories'
            ORDER BY ORDINAL_POSITION
        `;

        const result = await sql.query(schemaQuery);
        console.log('\n📋 Categories表當前結構:');
        console.log('欄位名稱\t\t數據類型\t\t可為空\t\t默認值');
        console.log('='.repeat(80));
        
        result.recordset.forEach(column => {
            console.log(`${column.COLUMN_NAME.padEnd(20)}\t${column.DATA_TYPE.padEnd(15)}\t${column.IS_NULLABLE}\t\t${column.COLUMN_DEFAULT || 'NULL'}`);
        });

        // 檢查是否存在新欄位
        const newFields = ['parent_id', 'level', 'path', 'sort_order', 'is_leaf', 'hierarchy_type'];
        console.log('\n🔍 新欄位檢查:');
        
        newFields.forEach(field => {
            const exists = result.recordset.find(col => col.COLUMN_NAME === field);
            console.log(`${field.padEnd(20)}: ${exists ? '✅ 存在' : '❌ 不存在'}`);
        });

        // 檢查索引
        const indexQuery = `
            SELECT 
                i.name as index_name,
                STRING_AGG(c.name, ', ') as columns
            FROM sys.indexes i
            INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
            INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
            WHERE i.object_id = OBJECT_ID('Categories')
            GROUP BY i.name, i.index_id
            ORDER BY i.name
        `;

        const indexResult = await sql.query(indexQuery);
        console.log('\n📊 當前索引:');
        indexResult.recordset.forEach(index => {
            console.log(`${index.index_name}: ${index.columns}`);
        });

    } catch (err) {
        console.error('❌ 錯誤:', err.message);
    } finally {
        await sql.close();
    }
}

checkCategoriesSchema();