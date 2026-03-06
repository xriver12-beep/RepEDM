require('dotenv').config();
const sql = require('mssql');
const bcrypt = require('bcryptjs');

async function seedData() {
  console.log('正在插入初始數據...');
  
  const config = {
    server: process.env.DB_SERVER,
    port: parseInt(process.env.DB_PORT) || 1433,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: {
      encrypt: process.env.DB_ENCRYPT === 'true',
      trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
      enableArithAbort: true,
      requestTimeout: 60000,
      connectionTimeout: 30000
    }
  };
  
  try {
    const pool = await sql.connect(config);
    console.log('✅ 成功連接到數據庫');
    
    // 檢查是否已有數據
    const userCount = await pool.request().query('SELECT COUNT(*) as count FROM Users');
    if (userCount.recordset[0].count > 0) {
      console.log('⚠️  數據庫中已有用戶數據，跳過初始化');
      await pool.close();
      return;
    }
    
    // 創建初始用戶
    console.log('👥 創建初始用戶...');
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    const users = [
      {
        username: 'admin',
        email: 'admin@winton.com',
        password_hash: hashedPassword,
        full_name: '系統管理員',
        role: 'admin',
        department: 'IT'
      },
      {
        username: 'manager1',
        email: 'manager1@winton.com',
        password_hash: await bcrypt.hash('manager123', 10),
        full_name: '部門經理',
        role: 'manager',
        department: '行銷部'
      },
      {
        username: 'approver1',
        email: 'approver1@winton.com',
        password_hash: await bcrypt.hash('approver123', 10),
        full_name: '審核員一',
        role: 'approver',
        department: '行銷部'
      },
      {
        username: 'approver2',
        email: 'approver2@winton.com',
        password_hash: await bcrypt.hash('approver123', 10),
        full_name: '審核員二',
        role: 'approver',
        department: '法務部'
      },
      {
        username: 'user1',
        email: 'user1@winton.com',
        password_hash: await bcrypt.hash('user123', 10),
        full_name: '一般用戶',
        role: 'user',
        department: '行銷部'
      }
    ];
    
    const userIds = [];
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const result = await pool.request()
        .input('username', sql.NVarChar, user.username)
        .input('email', sql.NVarChar, user.email)
        .input('password_hash', sql.NVarChar, user.password_hash)
        .input('full_name', sql.NVarChar, user.full_name)
        .input('role', sql.NVarChar, user.role)
        .input('department', sql.NVarChar, user.department)
        .query(`
          INSERT INTO Users (username, email, password_hash, full_name, role, department)
          OUTPUT INSERTED.id
          VALUES (@username, @email, @password_hash, @full_name, @role, @department)
        `);
      
      userIds.push(result.recordset[0].id);
      console.log(`✅ 創建用戶: ${user.full_name} (${user.username})`);
    }
    
    // 創建審核工作流程
    console.log('\n📋 創建審核工作流程...');
    const workflowResult = await pool.request()
      .input('name', sql.NVarChar, '標準電子郵件審核流程')
      .input('description', sql.NVarChar, '適用於一般電子郵件行銷活動的標準審核流程')
      .input('created_by', sql.Int, userIds[0]) // admin
      .query(`
        INSERT INTO ApprovalWorkflows (name, description, created_by)
        OUTPUT INSERTED.id
        VALUES (@name, @description, @created_by)
      `);
    
    const workflowId = workflowResult.recordset[0].id;
    console.log(`✅ 創建工作流程: 標準電子郵件審核流程 (ID: ${workflowId})`);
    
    // 創建工作流程步驟
    console.log('\n📝 創建工作流程步驟...');
    const steps = [
      {
        step_order: 1,
        step_name: '內容審核',
        approver_id: userIds[2] // approver1
      },
      {
        step_order: 2,
        step_name: '法務審核',
        approver_id: userIds[3] // approver2
      },
      {
        step_order: 3,
        step_name: '最終批准',
        approver_id: userIds[1] // manager1
      }
    ];
    
    for (const step of steps) {
      await pool.request()
        .input('workflow_id', sql.Int, workflowId)
        .input('step_order', sql.Int, step.step_order)
        .input('step_name', sql.NVarChar, step.step_name)
        .input('approver_id', sql.Int, step.approver_id)
        .query(`
          INSERT INTO WorkflowSteps (workflow_id, step_order, step_name, approver_id)
          VALUES (@workflow_id, @step_order, @step_name, @approver_id)
        `);
      
      console.log(`✅ 創建步驟 ${step.step_order}: ${step.step_name}`);
    }
    
    // 創建示例模板
    console.log('\n📄 創建示例模板...');
    const templateResult = await pool.request()
      .input('name', sql.NVarChar, '歡迎郵件模板')
      .input('subject', sql.NVarChar, '歡迎加入 Winton EDM 系統')
      .input('html_content', sql.NVarChar(sql.MAX), `
        <html>
          <body>
            <h1>歡迎使用 Winton EDM 系統</h1>
            <p>親愛的用戶，</p>
            <p>感謝您註冊我們的電子郵件行銷系統。</p>
            <p>您現在可以開始創建和發送電子郵件活動了。</p>
            <br>
            <p>祝好，<br>Winton EDM 團隊</p>
          </body>
        </html>
      `)
      .input('text_content', sql.NVarChar(sql.MAX), `
        歡迎使用 Winton EDM 系統
        
        親愛的用戶，
        
        感謝您註冊我們的電子郵件行銷系統。
        您現在可以開始創建和發送電子郵件活動了。
        
        祝好，
        Winton EDM 團隊
      `)
      .input('created_by', sql.Int, userIds[0])
      .query(`
        INSERT INTO Templates (name, subject, html_content, text_content, created_by)
        OUTPUT INSERTED.id
        VALUES (@name, @subject, @html_content, @text_content, @created_by)
      `);
    
    console.log(`✅ 創建模板: 歡迎郵件模板 (ID: ${templateResult.recordset[0].id})`);
    
    // 創建示例訂閱者
    console.log('\n📧 創建示例訂閱者...');
    const subscribers = [
      {
        email: 'subscriber1@example.com',
        first_name: '張',
        last_name: '三'
      },
      {
        email: 'subscriber2@example.com',
        first_name: '李',
        last_name: '四'
      },
      {
        email: 'subscriber3@example.com',
        first_name: '王',
        last_name: '五'
      }
    ];
    
    for (const subscriber of subscribers) {
      await pool.request()
        .input('email', sql.NVarChar, subscriber.email)
        .input('first_name', sql.NVarChar, subscriber.first_name)
        .input('last_name', sql.NVarChar, subscriber.last_name)
        .query(`
          INSERT INTO Subscribers (email, first_name, last_name)
          VALUES (@email, @first_name, @last_name)
        `);
      
      console.log(`✅ 創建訂閱者: ${subscriber.first_name}${subscriber.last_name} (${subscriber.email})`);
    }
    
    // 創建系統設置
    console.log('\n⚙️  創建系統設置...');
    const settings = [
      {
        setting_key: 'smtp_host',
        setting_value: 'smtp.gmail.com',
        description: 'SMTP 伺服器主機'
      },
      {
        setting_key: 'smtp_port',
        setting_value: '587',
        description: 'SMTP 伺服器端口'
      },
      {
        setting_key: 'system_email',
        setting_value: 'noreply@winton.com',
        description: '系統發送郵件地址'
      },
      {
        setting_key: 'max_recipients_per_campaign',
        setting_value: '1000',
        description: '每個活動最大收件人數量'
      }
    ];
    
    for (const setting of settings) {
      await pool.request()
        .input('setting_key', sql.NVarChar, setting.setting_key)
        .input('setting_value', sql.NVarChar(sql.MAX), setting.setting_value)
        .input('description', sql.NVarChar, setting.description)
        .query(`
          INSERT INTO Settings (setting_key, setting_value, description)
          VALUES (@setting_key, @setting_value, @description)
        `);
      
      console.log(`✅ 創建設置: ${setting.setting_key}`);
    }
    
    await pool.close();
    console.log('\n🎉 初始數據創建完成！');
    console.log('\n📋 創建的數據摘要:');
    console.log(`   - 用戶: ${users.length} 個`);
    console.log(`   - 審核工作流程: 1 個 (包含 ${steps.length} 個步驟)`);
    console.log(`   - 模板: 1 個`);
    console.log(`   - 訂閱者: ${subscribers.length} 個`);
    console.log(`   - 系統設置: ${settings.length} 個`);
    console.log('\n🔑 默認登錄信息:');
    console.log('   管理員: admin / admin123');
    console.log('   經理: manager1 / manager123');
    console.log('   審核員: approver1 / approver123, approver2 / approver123');
    console.log('   用戶: user1 / user123');
    
  } catch (error) {
    console.error('\n❌ 創建初始數據失敗:', error.message);
    console.error('詳細錯誤:', error);
    process.exit(1);
  }
}

seedData();