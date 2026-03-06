require('dotenv').config();
const sql = require('mssql');

async function seedCampaigns() {
  console.log('正在插入示例活動數據...');
  
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
    
    // 檢查是否已有活動數據
    const campaignCount = await pool.request().query('SELECT COUNT(*) as count FROM Campaigns');
    if (campaignCount.recordset[0].count > 0) {
      console.log('⚠️  數據庫中已有活動數據，跳過初始化');
      await pool.close();
      return;
    }
    
    // 獲取用戶ID
    const users = await pool.request().query('SELECT id, username FROM Users ORDER BY id');
    if (users.recordset.length === 0) {
      console.log('❌ 沒有找到用戶，請先運行 seed-data.js');
      await pool.close();
      return;
    }
    
    const adminUserId = users.recordset.find(u => u.username === 'admin')?.id || users.recordset[0].id;
    
    // 創建示例活動
    console.log('\n📧 創建示例活動...');
    const campaigns = [
      {
        name: '2024年春季促銷活動',
        subject: '春季大促銷 - 全場商品8折優惠！',
        html_content: `
          <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
              <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <h1 style="color: #2c5aa0;">春季大促銷</h1>
                <p>親愛的客戶，</p>
                <p>春天來了！為了慶祝新季節的到來，我們特別推出春季促銷活動。</p>
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <h2 style="color: #e74c3c; margin-top: 0;">🌸 全場商品8折優惠</h2>
                  <p>使用優惠碼：<strong>SPRING2024</strong></p>
                  <p>活動期間：2024年3月1日 - 3月31日</p>
                </div>
                <p>不要錯過這個絕佳機會！</p>
                <a href="#" style="display: inline-block; background: #2c5aa0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">立即購買</a>
                <p style="margin-top: 30px; font-size: 12px; color: #666;">
                  此郵件由 Winton EDM 系統發送
                </p>
              </div>
            </body>
          </html>
        `,
        text_content: `
春季大促銷

親愛的客戶，

春天來了！為了慶祝新季節的到來，我們特別推出春季促銷活動。

🌸 全場商品8折優惠
使用優惠碼：SPRING2024
活動期間：2024年3月1日 - 3月31日

不要錯過這個絕佳機會！

此郵件由 Winton EDM 系統發送
        `,
        sender_name: 'Winton 行銷團隊',
        sender_email: 'marketing@winton.com',
        status: 'sent',
        priority: 'high',
        recipient_count: 1250,
        opened_count: 875,
        clicked_count: 156,
        sent_at: new Date('2024-03-01T09:00:00')
      },
      {
        name: '產品更新通知',
        subject: '重要產品更新 - 新功能上線',
        html_content: `
          <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
              <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <h1 style="color: #2c5aa0;">產品更新通知</h1>
                <p>親愛的用戶，</p>
                <p>我們很高興地宣布，我們的產品已經更新了多項新功能：</p>
                <ul>
                  <li>✨ 全新的用戶界面設計</li>
                  <li>🚀 性能提升50%</li>
                  <li>🔒 增強的安全性功能</li>
                  <li>📱 更好的移動端體驗</li>
                </ul>
                <p>立即登錄體驗新功能！</p>
                <a href="#" style="display: inline-block; background: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">立即體驗</a>
              </div>
            </body>
          </html>
        `,
        text_content: `
產品更新通知

親愛的用戶，

我們很高興地宣布，我們的產品已經更新了多項新功能：

✨ 全新的用戶界面設計
🚀 性能提升50%
🔒 增強的安全性功能
📱 更好的移動端體驗

立即登錄體驗新功能！
        `,
        sender_name: 'Winton 技術團隊',
        sender_email: 'tech@winton.com',
        status: 'approved',
        priority: 'medium',
        recipient_count: 2100,
        opened_count: 1680,
        clicked_count: 420,
        scheduled_at: new Date('2024-03-15T14:00:00')
      },
      {
        name: '客戶滿意度調查',
        subject: '您的意見對我們很重要 - 客戶滿意度調查',
        html_content: `
          <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
              <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <h1 style="color: #2c5aa0;">客戶滿意度調查</h1>
                <p>親愛的客戶，</p>
                <p>為了提供更好的服務，我們希望了解您的使用體驗。</p>
                <p>請花費2-3分鐘完成我們的滿意度調查，您的反饋對我們非常寶貴。</p>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="#" style="display: inline-block; background: #17a2b8; color: white; padding: 15px 30px; text-decoration: none; border-radius: 4px; font-size: 16px;">開始調查</a>
                </div>
                <p>作為感謝，完成調查的客戶將獲得10%的折扣優惠券。</p>
              </div>
            </body>
          </html>
        `,
        text_content: `
客戶滿意度調查

親愛的客戶，

為了提供更好的服務，我們希望了解您的使用體驗。

請花費2-3分鐘完成我們的滿意度調查，您的反饋對我們非常寶貴。

作為感謝，完成調查的客戶將獲得10%的折扣優惠券。
        `,
        sender_name: 'Winton 客服團隊',
        sender_email: 'service@winton.com',
        status: 'draft',
        priority: 'low',
        recipient_count: 0,
        opened_count: 0,
        clicked_count: 0
      },
      {
        name: '會員專屬優惠',
        subject: '🎉 VIP會員專屬 - 限時優惠活動',
        html_content: `
          <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
              <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <h1 style="color: #d4af37;">🎉 VIP會員專屬優惠</h1>
                <p>尊貴的VIP會員，</p>
                <p>感謝您一直以來的支持！我們為您準備了專屬優惠：</p>
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 25px; border-radius: 10px; text-align: center; margin: 20px 0;">
                  <h2 style="margin-top: 0;">限時7折優惠</h2>
                  <p style="font-size: 18px; margin: 10px 0;">優惠碼：<strong>VIP70OFF</strong></p>
                  <p>有效期至：2024年3月20日</p>
                </div>
                <p>此優惠僅限VIP會員使用，數量有限，先到先得！</p>
                <a href="#" style="display: inline-block; background: #d4af37; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">立即使用</a>
              </div>
            </body>
          </html>
        `,
        text_content: `
🎉 VIP會員專屬優惠

尊貴的VIP會員，

感謝您一直以來的支持！我們為您準備了專屬優惠：

限時7折優惠
優惠碼：VIP70OFF
有效期至：2024年3月20日

此優惠僅限VIP會員使用，數量有限，先到先得！
        `,
        sender_name: 'Winton VIP服務',
        sender_email: 'vip@winton.com',
        status: 'pending',
        priority: 'high',
        recipient_count: 0,
        opened_count: 0,
        clicked_count: 0
      },
      {
        name: '月度電子報',
        subject: 'Winton 月度電子報 - 2024年3月',
        html_content: `
          <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
              <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <h1 style="color: #2c5aa0;">Winton 月度電子報</h1>
                <p style="color: #666; font-size: 14px;">2024年3月號</p>
                <h2>本月亮點</h2>
                <ul>
                  <li>📈 業績成長20%</li>
                  <li>🆕 推出3項新產品</li>
                  <li>🏆 獲得行業最佳服務獎</li>
                  <li>👥 團隊擴展至50人</li>
                </ul>
                <h2>即將推出</h2>
                <p>下個月我們將推出全新的客戶服務平台，敬請期待！</p>
                <div style="background: #f8f9fa; padding: 15px; border-left: 4px solid #2c5aa0; margin: 20px 0;">
                  <p><strong>客戶反饋：</strong></p>
                  <p style="font-style: italic;">"Winton的服務讓我們的業務效率提升了30%！" - 張先生</p>
                </div>
              </div>
            </body>
          </html>
        `,
        text_content: `
Winton 月度電子報 - 2024年3月

本月亮點：
📈 業績成長20%
🆕 推出3項新產品
🏆 獲得行業最佳服務獎
👥 團隊擴展至50人

即將推出：
下個月我們將推出全新的客戶服務平台，敬請期待！

客戶反饋：
"Winton的服務讓我們的業務效率提升了30%！" - 張先生
        `,
        sender_name: 'Winton 編輯部',
        sender_email: 'newsletter@winton.com',
        status: 'scheduled',
        priority: 'medium',
        recipient_count: 3200,
        opened_count: 0,
        clicked_count: 0,
        scheduled_at: new Date('2024-03-25T10:00:00')
      }
    ];
    
    for (const campaign of campaigns) {
      const result = await pool.request()
        .input('name', sql.NVarChar, campaign.name)
        .input('subject', sql.NVarChar, campaign.subject)
        .input('html_content', sql.NVarChar(sql.MAX), campaign.html_content)
        .input('text_content', sql.NVarChar(sql.MAX), campaign.text_content)
        .input('sender_name', sql.NVarChar, campaign.sender_name)
        .input('sender_email', sql.NVarChar, campaign.sender_email)
        .input('status', sql.NVarChar, campaign.status)
        .input('priority', sql.NVarChar, campaign.priority)
        .input('recipient_count', sql.Int, campaign.recipient_count)
        .input('opened_count', sql.Int, campaign.opened_count)
        .input('clicked_count', sql.Int, campaign.clicked_count)
        .input('created_by', sql.Int, adminUserId)
        .input('sent_at', sql.DateTime2, campaign.sent_at || null)
        .input('scheduled_at', sql.DateTime2, campaign.scheduled_at || null)
        .query(`
          INSERT INTO Campaigns (
            name, subject, html_content, text_content, sender_name, sender_email,
            status, priority, recipient_count, opened_count, clicked_count,
            created_by, sent_at, scheduled_at
          )
          OUTPUT INSERTED.id
          VALUES (
            @name, @subject, @html_content, @text_content, @sender_name, @sender_email,
            @status, @priority, @recipient_count, @opened_count, @clicked_count,
            @created_by, @sent_at, @scheduled_at
          )
        `);
      
      console.log(`✅ 創建活動: ${campaign.name} (ID: ${result.recordset[0].id}, 狀態: ${campaign.status})`);
    }
    
    await pool.close();
    console.log('\n🎉 示例活動數據創建完成！');
    console.log(`\n📋 創建的活動摘要: ${campaigns.length} 個活動`);
    campaigns.forEach((c, i) => {
      console.log(`   ${i + 1}. ${c.name} - ${c.status}`);
    });
    
  } catch (error) {
    console.error('\n❌ 創建活動數據失敗:', error.message);
    console.error('詳細錯誤:', error);
    process.exit(1);
  }
}

seedCampaigns();