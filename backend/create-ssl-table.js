const { executeQuery, connectDB } = require('./src/config/database');

async function createSSLCertificatesTable() {
    try {
        await connectDB();
        console.log('正在創建 SSLCertificates 表...');
        
        const query = `
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SSLCertificates' AND xtype='U')
        CREATE TABLE SSLCertificates (
            id INT IDENTITY(1,1) PRIMARY KEY,
            common_name NVARCHAR(255) NOT NULL,
            issuer NVARCHAR(255),
            valid_from DATETIME2,
            valid_to DATETIME2,
            cert_filename NVARCHAR(255) NOT NULL,
            key_filename NVARCHAR(255) NOT NULL,
            is_active BIT DEFAULT 0,
            uploaded_at DATETIME2 DEFAULT GETDATE(),
            uploaded_by INT NULL
        );
        `;

        await executeQuery(query);
        console.log('SSLCertificates 表創建成功 (或已存在)');

    } catch (error) {
        console.error('創建表失敗:', error);
    }
}

createSSLCertificatesTable();
