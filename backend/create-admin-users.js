const sql = require('mssql');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
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

// 初始管理員用戶數據
const adminUsers = [
    {
        username: 'admin',
        email: 'admin@wintonedm.com',
        password: 'admin123',
        firstName: '系統',
        lastName: '管理員',
        displayName: '系統管理員',
        role: 'Admin',
        department: 'IT部門',
        position: '系統管理員'
    },
    {
        username: 'manager',
        email: 'manager@wintonedm.com',
        password: 'manager123',
        firstName: '行銷',
        lastName: '經理',
        displayName: '行銷經理',
        role: 'Manager',
        department: '行銷部門',
        position: '經理'
    },
    {
        username: 'editor',
        email: 'editor@wintonedm.com',
        password: 'editor123',
        firstName: '內容',
        lastName: '編輯',
        displayName: '內容編輯',
        role: 'Editor',
        department: '內容部門',
        position: '編輯'
    }
];

async function createAdminUsers() {
    let pool;
    
    try {
        console.log('連接到資料庫...');
        pool = await sql.connect(dbConfig);
        
        console.log('清除現有的管理員用戶...');
        // 先清除相關的登入日誌
        await pool.request().query('DELETE FROM AdminLoginLogs');
        // 再清除管理員用戶
        await pool.request().query('DELETE FROM AdminUsers');
        
        console.log('創建新的管理員用戶...');
        
        const adminID = uuidv4();
        let createdBy = null;
        
        for (const user of adminUsers) {
            const userID = uuidv4();
            
            // 生成密碼雜湊
            const saltRounds = 10;
            const passwordHash = await bcrypt.hash(user.password, saltRounds);
            
            const request = pool.request();
            request.input('AdminUserID', sql.UniqueIdentifier, userID);
            request.input('Username', sql.NVarChar(50), user.username);
            request.input('Email', sql.NVarChar(255), user.email);
            request.input('PasswordHash', sql.NVarChar(255), passwordHash);
            request.input('Salt', sql.NVarChar(255), '');
            request.input('FirstName', sql.NVarChar(100), user.firstName);
            request.input('LastName', sql.NVarChar(100), user.lastName);
            request.input('DisplayName', sql.NVarChar(150), user.displayName);
            request.input('Role', sql.NVarChar(20), user.role);
            request.input('Department', sql.NVarChar(100), user.department);
            request.input('Position', sql.NVarChar(100), user.position);
            request.input('CreatedBy', sql.UniqueIdentifier, createdBy);
            
            await request.query(`
                INSERT INTO AdminUsers (
                    AdminUserID, Username, Email, PasswordHash, Salt,
                    FirstName, LastName, DisplayName, Role, Department, Position,
                    IsActive, IsEmailVerified, MustChangePassword,
                    CreatedAt, UpdatedAt, CreatedBy
                ) VALUES (
                    @AdminUserID, @Username, @Email, @PasswordHash, @Salt,
                    @FirstName, @LastName, @DisplayName, @Role, @Department, @Position,
                    1, 1, 1,
                    GETDATE(), GETDATE(), @CreatedBy
                )
            `);
            
            console.log(`✓ 創建用戶: ${user.username} (${user.role})`);
            
            // 第一個用戶（admin）作為其他用戶的創建者
            if (user.role === 'Admin') {
                createdBy = userID;
            }
        }
        
        // 顯示創建的用戶
        console.log('\n創建的管理員用戶：');
        const result = await pool.request().query(`
            SELECT Username, Email, DisplayName, Role, Department, Position, CreatedAt
            FROM AdminUsers
            ORDER BY Role, Username
        `);
        
        console.table(result.recordset);
        
        console.log('\n登入資訊：');
        adminUsers.forEach(user => {
            console.log(`${user.username} / ${user.password} (${user.role})`);
        });
        
        console.log('\n⚠️  重要：請在首次登入後立即更改密碼！');
        
    } catch (error) {
        console.error('創建管理員用戶時發生錯誤:', error);
    } finally {
        if (pool) {
            await pool.close();
        }
    }
}

// 執行腳本
if (require.main === module) {
    createAdminUsers()
        .then(() => {
            console.log('\n管理員用戶創建完成！');
            process.exit(0);
        })
        .catch(error => {
            console.error('腳本執行失敗:', error);
            process.exit(1);
        });
}

module.exports = { createAdminUsers };