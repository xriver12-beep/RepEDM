require('dotenv').config();
const sql = require('mssql');
const fs = require('fs');
const path = require('path');

async function createSchema() {
  console.log('正在創建數據庫表結構...');
  
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
    // 連接到數據庫
    const pool = await sql.connect(config);
    console.log('✅ 成功連接到數據庫');
    
    // 定義表創建語句
    const tableStatements = [
      {
        name: 'Users',
        sql: `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Users' AND xtype='U')
CREATE TABLE Users (
    id INT IDENTITY(1,1) PRIMARY KEY,
    username NVARCHAR(50) NOT NULL UNIQUE,
    email NVARCHAR(100) NOT NULL UNIQUE,
    password_hash NVARCHAR(255) NOT NULL,
    full_name NVARCHAR(100) NOT NULL,
    role NVARCHAR(20) NOT NULL DEFAULT 'user',
    department NVARCHAR(50),
    is_active BIT NOT NULL DEFAULT 1,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
)`
      },
      {
        name: 'Subscribers',
        sql: `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Subscribers' AND xtype='U')
CREATE TABLE Subscribers (
    id INT IDENTITY(1,1) PRIMARY KEY,
    email NVARCHAR(100) NOT NULL UNIQUE,
    first_name NVARCHAR(50),
    last_name NVARCHAR(50),
    phone NVARCHAR(20),
    gender NVARCHAR(10),
    birth_date DATE,
    country NVARCHAR(100),
    city NVARCHAR(100),
    status NVARCHAR(20) NOT NULL DEFAULT 'active',
    tags NVARCHAR(500),
    custom_fields NVARCHAR(MAX),
    subscribed_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    unsubscribed_at DATETIME2,
    last_activity_at DATETIME2,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
)`
      },
      {
        name: 'Templates',
        sql: `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Templates' AND xtype='U')
CREATE TABLE Templates (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(100) NOT NULL,
    subject NVARCHAR(200) NOT NULL,
    html_content NVARCHAR(MAX) NOT NULL,
    text_content NVARCHAR(MAX),
    template_type NVARCHAR(20) NOT NULL DEFAULT 'email',
    is_active BIT NOT NULL DEFAULT 1,
    created_by INT NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (created_by) REFERENCES Users(id)
)`
      },
      {
        name: 'ApprovalWorkflows',
        sql: `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ApprovalWorkflows' AND xtype='U')
CREATE TABLE ApprovalWorkflows (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(100) NOT NULL,
    description NVARCHAR(500),
    is_active BIT NOT NULL DEFAULT 1,
    created_by INT NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (created_by) REFERENCES Users(id)
)`
      },
      {
        name: 'WorkflowSteps',
        sql: `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='WorkflowSteps' AND xtype='U')
CREATE TABLE WorkflowSteps (
    id INT IDENTITY(1,1) PRIMARY KEY,
    workflow_id INT NOT NULL,
    step_order INT NOT NULL,
    step_name NVARCHAR(100) NOT NULL,
    approver_id INT NOT NULL,
    is_required BIT NOT NULL DEFAULT 1,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (workflow_id) REFERENCES ApprovalWorkflows(id) ON DELETE CASCADE,
    FOREIGN KEY (approver_id) REFERENCES Users(id),
    UNIQUE(workflow_id, step_order)
)`
      },
      {
        name: 'Campaigns',
        sql: `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Campaigns' AND xtype='U')
CREATE TABLE Campaigns (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(100) NOT NULL,
    subject NVARCHAR(200) NOT NULL,
    template_id INT,
    html_content NVARCHAR(MAX) NOT NULL,
    text_content NVARCHAR(MAX),
    sender_name NVARCHAR(100) NOT NULL,
    sender_email NVARCHAR(100) NOT NULL,
    reply_to NVARCHAR(100),
    status NVARCHAR(20) NOT NULL DEFAULT 'draft',
    priority NVARCHAR(10) NOT NULL DEFAULT 'medium',
    scheduled_at DATETIME2,
    sent_at DATETIME2,
    end_date DATETIME2,
    recipient_count INT DEFAULT 0,
    opened_count INT DEFAULT 0,
    clicked_count INT DEFAULT 0,
    bounced_count INT DEFAULT 0,
    unsubscribed_count INT DEFAULT 0,
    workflow_id INT,
    created_by INT NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (template_id) REFERENCES Templates(id),
    FOREIGN KEY (workflow_id) REFERENCES ApprovalWorkflows(id),
    FOREIGN KEY (created_by) REFERENCES Users(id)
)`
      },
      {
        name: 'ApprovalItems',
        sql: `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ApprovalItems' AND xtype='U')
CREATE TABLE ApprovalItems (
    id INT IDENTITY(1,1) PRIMARY KEY,
    campaign_id INT NOT NULL,
    workflow_id INT NOT NULL,
    current_step INT NOT NULL DEFAULT 1,
    total_steps INT NOT NULL,
    status NVARCHAR(20) NOT NULL DEFAULT 'pending',
    priority NVARCHAR(10) NOT NULL DEFAULT 'medium',
    submitted_by INT NOT NULL,
    submitted_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    completed_at DATETIME2,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (campaign_id) REFERENCES Campaigns(id) ON DELETE CASCADE,
    FOREIGN KEY (workflow_id) REFERENCES ApprovalWorkflows(id),
    FOREIGN KEY (submitted_by) REFERENCES Users(id)
)`
      },
      {
        name: 'ApprovalSteps',
        sql: `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ApprovalSteps' AND xtype='U')
CREATE TABLE ApprovalSteps (
    id INT IDENTITY(1,1) PRIMARY KEY,
    approval_item_id INT NOT NULL,
    workflow_step_id INT NOT NULL,
    step_order INT NOT NULL,
    approver_id INT NOT NULL,
    status NVARCHAR(20) NOT NULL DEFAULT 'pending',
    comments NVARCHAR(1000),
    approved_at DATETIME2,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (approval_item_id) REFERENCES ApprovalItems(id) ON DELETE CASCADE,
    FOREIGN KEY (workflow_step_id) REFERENCES WorkflowSteps(id),
    FOREIGN KEY (approver_id) REFERENCES Users(id)
)`
      },
      {
        name: 'ApprovalHistory',
        sql: `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ApprovalHistory' AND xtype='U')
CREATE TABLE ApprovalHistory (
    id INT IDENTITY(1,1) PRIMARY KEY,
    approval_item_id INT NOT NULL,
    action NVARCHAR(20) NOT NULL,
    actor_id INT NOT NULL,
    step_order INT,
    comments NVARCHAR(1000),
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (approval_item_id) REFERENCES ApprovalItems(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_id) REFERENCES Users(id)
)`
      },
      {
        name: 'EmailSends',
        sql: `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='EmailSends' AND xtype='U')
CREATE TABLE EmailSends (
    id INT IDENTITY(1,1) PRIMARY KEY,
    campaign_id INT NOT NULL,
    subscriber_id INT NOT NULL,
    email NVARCHAR(100) NOT NULL,
    status NVARCHAR(20) NOT NULL DEFAULT 'pending',
    sent_at DATETIME2,
    delivered_at DATETIME2,
    opened_at DATETIME2,
    clicked_at DATETIME2,
    bounced_at DATETIME2,
    bounce_reason NVARCHAR(500),
    unsubscribed_at DATETIME2,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (campaign_id) REFERENCES Campaigns(id) ON DELETE CASCADE,
    FOREIGN KEY (subscriber_id) REFERENCES Subscribers(id)
)`
      },
      {
        name: 'EmailOpens',
        sql: `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='EmailOpens' AND xtype='U')
CREATE TABLE EmailOpens (
    id INT IDENTITY(1,1) PRIMARY KEY,
    CampaignID INT NOT NULL,
    SubscriberID INT NOT NULL,
    OpenedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    IPAddress NVARCHAR(50),
    UserAgent NVARCHAR(500),
    Device NVARCHAR(50),
    EmailClient NVARCHAR(50),
    FOREIGN KEY (CampaignID) REFERENCES Campaigns(id) ON DELETE CASCADE,
    FOREIGN KEY (SubscriberID) REFERENCES Subscribers(id)
)`
      },
      {
        name: 'EmailClicks',
        sql: `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='EmailClicks' AND xtype='U')
CREATE TABLE EmailClicks (
    id INT IDENTITY(1,1) PRIMARY KEY,
    CampaignID INT NOT NULL,
    SubscriberID INT NOT NULL,
    URL NVARCHAR(2048),
    ClickedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    IPAddress NVARCHAR(50),
    UserAgent NVARCHAR(500),
    FOREIGN KEY (CampaignID) REFERENCES Campaigns(id) ON DELETE CASCADE,
    FOREIGN KEY (SubscriberID) REFERENCES Subscribers(id)
)`
      },
      {
        name: 'EmailUnsubscribes',
        sql: `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='EmailUnsubscribes' AND xtype='U')
CREATE TABLE EmailUnsubscribes (
    id INT IDENTITY(1,1) PRIMARY KEY,
    CampaignID INT NOT NULL,
    SubscriberID INT NOT NULL,
    UnsubscribedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    IPAddress NVARCHAR(50),
    FOREIGN KEY (CampaignID) REFERENCES Campaigns(id) ON DELETE CASCADE,
    FOREIGN KEY (SubscriberID) REFERENCES Subscribers(id)
)`
      },
      {
        name: 'Settings',
        sql: `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Settings' AND xtype='U')
CREATE TABLE Settings (
    id INT IDENTITY(1,1) PRIMARY KEY,
    setting_key NVARCHAR(100) NOT NULL UNIQUE,
    setting_value NVARCHAR(MAX),
    description NVARCHAR(500),
    is_public BIT NOT NULL DEFAULT 0,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
)`
      }
    ];
    
    // 逐個創建表
    for (let i = 0; i < tableStatements.length; i++) {
      const table = tableStatements[i];
      try {
        console.log(`⏳ 創建表 ${table.name} (${i + 1}/${tableStatements.length})...`);
        await pool.request().query(table.sql);
        console.log(`✅ 表 ${table.name} 創建成功`);
      } catch (error) {
        if (error.message.includes('already an object named') || 
            error.message.includes('已經有名為')) {
          console.log(`⚠️  表 ${table.name} 已存在，跳過創建`);
        } else {
          console.error(`❌ 創建表 ${table.name} 失敗:`, error.message);
          throw error;
        }
      }
    }
    
    // 創建索引
    console.log('\n📊 創建索引...');
    const indexes = [
      'CREATE INDEX IX_Users_Email ON Users(email)',
      'CREATE INDEX IX_Users_Username ON Users(username)',
      'CREATE INDEX IX_Subscribers_Email ON Subscribers(email)',
      'CREATE INDEX IX_Subscribers_Status ON Subscribers(status)',
      'CREATE INDEX IX_Campaigns_Status ON Campaigns(status)',
      'CREATE INDEX IX_Campaigns_CreatedBy ON Campaigns(created_by)',
      'CREATE INDEX IX_ApprovalItems_Status ON ApprovalItems(status)',
      'CREATE INDEX IX_ApprovalItems_SubmittedBy ON ApprovalItems(submitted_by)',
      'CREATE INDEX IX_ApprovalSteps_Status ON ApprovalSteps(status)',
      'CREATE INDEX IX_EmailSends_Status ON EmailSends(status)',
      'CREATE INDEX IX_EmailSends_CampaignId ON EmailSends(campaign_id)'
    ];
    
    for (let i = 0; i < indexes.length; i++) {
      try {
        await pool.request().query(indexes[i]);
        console.log(`✅ 索引 ${i + 1} 創建成功`);
      } catch (error) {
        if (error.message.includes('already exists') || 
            error.message.includes('已經存在')) {
          console.log(`⚠️  索引 ${i + 1} 已存在，跳過創建`);
        } else {
          console.log(`⚠️  索引 ${i + 1} 創建失敗:`, error.message);
        }
      }
    }
    
    // 驗證表是否創建成功
    console.log('\n🔍 驗證表結構...');
    const tablesResult = await pool.request().query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `);
    
    console.log(`✅ 數據庫中共有 ${tablesResult.recordset.length} 個表:`);
    tablesResult.recordset.forEach((table, index) => {
      console.log(`  ${index + 1}. ${table.TABLE_NAME}`);
    });
    
    await pool.close();
    console.log('\n🎉 數據庫表結構創建完成！');
    
  } catch (error) {
    console.error('\n❌ 創建數據庫表結構失敗:', error.message);
    console.error('詳細錯誤:', error);
    process.exit(1);
  }
}

createSchema();