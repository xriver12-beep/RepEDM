const sql = require('mssql');
require('dotenv').config();

// 資料庫配置
const dbConfig = {
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

async function setupAdminTables() {
    let pool;
    
    try {
        console.log('連接到資料庫...');
        pool = await sql.connect(dbConfig);
        
        console.log('創建管理員用戶表...');
        
        // 創建 AdminUsers 表
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='AdminUsers' AND xtype='U')
            CREATE TABLE AdminUsers (
                AdminUserID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
                Username NVARCHAR(50) NOT NULL UNIQUE,
                Email NVARCHAR(255) NOT NULL UNIQUE,
                PasswordHash NVARCHAR(255) NOT NULL,
                Salt NVARCHAR(255) NOT NULL,
                FirstName NVARCHAR(100),
                LastName NVARCHAR(100),
                DisplayName NVARCHAR(150),
                Role NVARCHAR(20) NOT NULL DEFAULT 'Editor',
                Department NVARCHAR(100),
                Position NVARCHAR(100),
                IsActive BIT NOT NULL DEFAULT 1,
                IsEmailVerified BIT NOT NULL DEFAULT 0,
                LastLoginAt DATETIME2,
                LastLoginIP NVARCHAR(45),
                FailedLoginAttempts INT NOT NULL DEFAULT 0,
                LockedUntil DATETIME2,
                PasswordChangedAt DATETIME2,
                MustChangePassword BIT NOT NULL DEFAULT 1,
                TwoFactorEnabled BIT NOT NULL DEFAULT 0,
                TwoFactorSecret NVARCHAR(255),
                CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
                UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
                CreatedBy UNIQUEIDENTIFIER,
                UpdatedBy UNIQUEIDENTIFIER
            )
        `);
        
        console.log('✓ AdminUsers 表創建完成');
        
        // 創建索引
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_AdminUsers_Username')
            CREATE INDEX IX_AdminUsers_Username ON AdminUsers(Username)
        `);
        
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_AdminUsers_Email')
            CREATE INDEX IX_AdminUsers_Email ON AdminUsers(Email)
        `);
        
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_AdminUsers_Role')
            CREATE INDEX IX_AdminUsers_Role ON AdminUsers(Role)
        `);
        
        console.log('✓ 索引創建完成');
        
        // 創建 AdminPermissions 表
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='AdminPermissions' AND xtype='U')
            CREATE TABLE AdminPermissions (
                PermissionID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
                PermissionName NVARCHAR(100) NOT NULL UNIQUE,
                Description NVARCHAR(500),
                Category NVARCHAR(50),
                IsActive BIT NOT NULL DEFAULT 1,
                CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE()
            )
        `);
        
        console.log('✓ AdminPermissions 表創建完成');
        
        // 創建 RolePermissions 表
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='RolePermissions' AND xtype='U')
            CREATE TABLE RolePermissions (
                Role NVARCHAR(20) NOT NULL,
                PermissionID UNIQUEIDENTIFIER NOT NULL,
                GrantedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
                GrantedBy UNIQUEIDENTIFIER,
                PRIMARY KEY (Role, PermissionID),
                FOREIGN KEY (PermissionID) REFERENCES AdminPermissions(PermissionID)
            )
        `);
        
        console.log('✓ RolePermissions 表創建完成');
        
        // 創建 AdminLoginLogs 表
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='AdminLoginLogs' AND xtype='U')
            CREATE TABLE AdminLoginLogs (
                LogID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
                AdminUserID UNIQUEIDENTIFIER,
                Username NVARCHAR(50),
                LoginAttemptAt DATETIME2 NOT NULL DEFAULT GETDATE(),
                IPAddress NVARCHAR(45),
                UserAgent NVARCHAR(500),
                IsSuccessful BIT NOT NULL,
                FailureReason NVARCHAR(255),
                SessionToken NVARCHAR(255),
                FOREIGN KEY (AdminUserID) REFERENCES AdminUsers(AdminUserID)
            )
        `);
        
        console.log('✓ AdminLoginLogs 表創建完成');
        
        // 插入基本權限
        const permissionsExist = await pool.request().query(`
            SELECT COUNT(*) as count FROM AdminPermissions
        `);
        
        if (permissionsExist.recordset[0].count === 0) {
            console.log('插入基本權限...');
            
            const permissions = [
                // 系統管理
                { name: 'system.manage', desc: '系統管理', category: 'System' },
                { name: 'system.settings', desc: '系統設定', category: 'System' },
                { name: 'system.logs', desc: '查看系統日誌', category: 'System' },
                
                // 用戶管理
                { name: 'users.view', desc: '查看管理員用戶', category: 'Users' },
                { name: 'users.create', desc: '創建管理員用戶', category: 'Users' },
                { name: 'users.edit', desc: '編輯管理員用戶', category: 'Users' },
                { name: 'users.delete', desc: '刪除管理員用戶', category: 'Users' },
                
                // 訂閱者管理
                { name: 'subscribers.view', desc: '查看訂閱者', category: 'Subscribers' },
                { name: 'subscribers.create', desc: '創建訂閱者', category: 'Subscribers' },
                { name: 'subscribers.edit', desc: '編輯訂閱者', category: 'Subscribers' },
                { name: 'subscribers.delete', desc: '刪除訂閱者', category: 'Subscribers' },
                { name: 'subscribers.import', desc: '匯入訂閱者', category: 'Subscribers' },
                { name: 'subscribers.export', desc: '匯出訂閱者', category: 'Subscribers' },
                
                // 活動管理
                { name: 'campaigns.view', desc: '查看活動', category: 'Campaigns' },
                { name: 'campaigns.create', desc: '創建活動', category: 'Campaigns' },
                { name: 'campaigns.edit', desc: '編輯活動', category: 'Campaigns' },
                { name: 'campaigns.delete', desc: '刪除活動', category: 'Campaigns' },
                { name: 'campaigns.send', desc: '發送活動', category: 'Campaigns' },
                { name: 'campaigns.approve', desc: '審核活動', category: 'Campaigns' },
                
                // EDM管理
                { name: 'templates.view', desc: '查看EDM', category: 'EDM' },
                { name: 'templates.create', desc: '創建EDM', category: 'EDM' },
                { name: 'templates.edit', desc: '編輯EDM', category: 'EDM' },
                { name: 'templates.delete', desc: '刪除EDM', category: 'EDM' },
                
                // 分析報告
                { name: 'analytics.view', desc: '查看分析報告', category: 'Analytics' },
                { name: 'analytics.export', desc: '匯出報告', category: 'Analytics' }
            ];
            
            for (const perm of permissions) {
                await pool.request()
                    .input('name', sql.NVarChar(100), perm.name)
                    .input('desc', sql.NVarChar(500), perm.desc)
                    .input('category', sql.NVarChar(50), perm.category)
                    .query(`
                        INSERT INTO AdminPermissions (PermissionName, Description, Category)
                        VALUES (@name, @desc, @category)
                    `);
            }
            
            console.log('✓ 基本權限插入完成');
        }
        
        console.log('\n所有管理員表格和權限設置完成！');
        
    } catch (error) {
        console.error('設置管理員表格時發生錯誤:', error);
    } finally {
        if (pool) {
            await pool.close();
        }
    }
}

// 執行腳本
if (require.main === module) {
    setupAdminTables()
        .then(() => {
            console.log('\n管理員表格設置完成！');
            process.exit(0);
        })
        .catch(error => {
            console.error('腳本執行失敗:', error);
            process.exit(1);
        });
}

module.exports = { setupAdminTables };