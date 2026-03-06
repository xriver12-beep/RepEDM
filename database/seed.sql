-- 電子報管理系統種子資料
-- 用於開發和測試環境

USE WintonEDM;
GO

-- 插入範例使用者
INSERT INTO Users (Username, Email, PasswordHash, FirstName, LastName, Role, IsActive) VALUES
('manager', 'manager@wintonemd.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Marketing', 'Manager', 'Manager', 1),
('editor', 'editor@wintonemd.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Content', 'Editor', 'User', 1),
('viewer', 'viewer@wintonemd.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Report', 'Viewer', 'Viewer', 1);

-- 插入範例訂閱者
INSERT INTO Subscribers (Email, FirstName, LastName, Phone, Gender, Country, City, Status, Source, Tags) VALUES
('john.doe@example.com', 'John', 'Doe', '+886-912-345-678', 'Male', 'Taiwan', 'Taipei', 'Active', 'Website', '["VIP", "Tech"]'),
('jane.smith@example.com', 'Jane', 'Smith', '+886-987-654-321', 'Female', 'Taiwan', 'Kaohsiung', 'Active', 'Import', '["Newsletter", "Promotions"]'),
('bob.wilson@example.com', 'Bob', 'Wilson', '+886-955-123-456', 'Male', 'Taiwan', 'Taichung', 'Active', 'API', '["Tech", "Updates"]'),
('alice.brown@example.com', 'Alice', 'Brown', '+886-933-789-012', 'Female', 'Taiwan', 'Tainan', 'Active', 'Manual', '["VIP", "Newsletter"]'),
('charlie.davis@example.com', 'Charlie', 'Davis', '+886-911-456-789', 'Male', 'Taiwan', 'Hsinchu', 'Unsubscribed', 'Website', '["Tech"]'),
('diana.miller@example.com', 'Diana', 'Miller', '+886-922-567-890', 'Female', 'Taiwan', 'Taoyuan', 'Active', 'Import', '["Promotions"]'),
('edward.garcia@example.com', 'Edward', 'Garcia', '+886-944-678-901', 'Male', 'Taiwan', 'Keelung', 'Active', 'Website', '["Newsletter"]'),
('fiona.martinez@example.com', 'Fiona', 'Martinez', '+886-966-789-012', 'Female', 'Taiwan', 'Chiayi', 'Active', 'API', '["VIP", "Updates"]'),
('george.rodriguez@example.com', 'George', 'Rodriguez', '+886-977-890-123', 'Male', 'Taiwan', 'Pingtung', 'Bounced', 'Manual', '["Tech"]'),
('helen.lopez@example.com', 'Helen', 'Lopez', '+886-988-901-234', 'Female', 'Taiwan', 'Yilan', 'Active', 'Website', '["Newsletter", "Promotions"]');

-- 插入訂閱者群組
DECLARE @GroupID1 UNIQUEIDENTIFIER = NEWID();
DECLARE @GroupID2 UNIQUEIDENTIFIER = NEWID();
DECLARE @GroupID3 UNIQUEIDENTIFIER = NEWID();
DECLARE @AdminUserID UNIQUEIDENTIFIER = (SELECT UserID FROM Users WHERE Username = 'admin');

INSERT INTO SubscriberGroups (GroupID, GroupName, Description, Criteria, CreatedBy) VALUES
(@GroupID1, 'VIP 會員', '高價值客戶群組', '{"tags": ["VIP"], "status": "Active"}', @AdminUserID),
(@GroupID2, '科技愛好者', '對科技產品感興趣的訂閱者', '{"tags": ["Tech"], "status": "Active"}', @AdminUserID),
(@GroupID3, '促銷訂閱者', '接受促銷資訊的訂閱者', '{"tags": ["Promotions"], "status": "Active"}', @AdminUserID);

-- 建立群組成員關聯
INSERT INTO SubscriberGroupMembers (SubscriberID, GroupID)
SELECT s.SubscriberID, @GroupID1
FROM Subscribers s
WHERE s.Tags LIKE '%VIP%' AND s.Status = 'Active';

INSERT INTO SubscriberGroupMembers (SubscriberID, GroupID)
SELECT s.SubscriberID, @GroupID2
FROM Subscribers s
WHERE s.Tags LIKE '%Tech%' AND s.Status = 'Active';

INSERT INTO SubscriberGroupMembers (SubscriberID, GroupID)
SELECT s.SubscriberID, @GroupID3
FROM Subscribers s
WHERE s.Tags LIKE '%Promotions%' AND s.Status = 'Active';

-- 插入電子報EDM
DECLARE @TemplateID1 UNIQUEIDENTIFIER = NEWID();
DECLARE @TemplateID2 UNIQUEIDENTIFIER = NEWID();
DECLARE @TemplateID3 UNIQUEIDENTIFIER = NEWID();

INSERT INTO Templates (TemplateID, TemplateName, Description, Category, HTMLContent, PlainTextContent, IsActive, IsPublic, CreatedBy) VALUES
(@TemplateID1, '基本電子報EDM', '簡潔的電子報設計EDM', 'Newsletter', 
'<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>{{subject}}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 20px; border-radius: 8px; }
        .header { text-align: center; border-bottom: 2px solid #007bff; padding-bottom: 20px; margin-bottom: 20px; }
        .content { line-height: 1.6; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>{{company_name}}</h1>
        </div>
        <div class="content">
            <h2>{{title}}</h2>
            <p>{{content}}</p>
        </div>
        <div class="footer">
            <p>如果您不想再收到此類郵件，請<a href="{{unsubscribe_url}}">取消訂閱</a></p>
            <p>{{company_address}}</p>
        </div>
    </div>
</body>
</html>',
'{{title}}

{{content}}

---
如果您不想再收到此類郵件，請前往: {{unsubscribe_url}}
{{company_name}} - {{company_address}}',
1, 1, @AdminUserID),

(@TemplateID2, '促銷活動EDM', '適用於促銷活動的電子報EDM', 'Promotional',
'<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>{{subject}}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f8f9fa; }
        .container { max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #ff6b6b, #ee5a24); color: white; padding: 30px 20px; text-align: center; }
        .content { padding: 30px 20px; }
        .cta-button { display: inline-block; background-color: #ff6b6b; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
        .footer { background-color: #f8f9fa; padding: 20px; font-size: 12px; color: #666; text-align: center; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎉 特別優惠 🎉</h1>
            <p>{{promotion_title}}</p>
        </div>
        <div class="content">
            <h2>{{title}}</h2>
            <p>{{content}}</p>
            <div style="text-align: center;">
                <a href="{{cta_url}}" class="cta-button">{{cta_text}}</a>
            </div>
        </div>
        <div class="footer">
            <p>優惠期限: {{expiry_date}}</p>
            <p><a href="{{unsubscribe_url}}">取消訂閱</a> | {{company_name}} - {{company_address}}</p>
        </div>
    </div>
</body>
</html>',
'🎉 特別優惠 🎉
{{promotion_title}}

{{title}}

{{content}}

立即行動: {{cta_url}}

優惠期限: {{expiry_date}}
---
取消訂閱: {{unsubscribe_url}}
{{company_name}} - {{company_address}}',
1, 1, @AdminUserID),

(@TemplateID3, '交易確認EDM', '用於交易確認和通知的EDM', 'Transactional',
'<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>{{subject}}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 20px; border-radius: 8px; border: 1px solid #ddd; }
        .header { text-align: center; padding-bottom: 20px; margin-bottom: 20px; border-bottom: 2px solid #28a745; }
        .content { line-height: 1.6; }
        .info-box { background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #28a745; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; text-align: center; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>{{company_name}}</h1>
            <p>交易確認通知</p>
        </div>
        <div class="content">
            <h2>{{title}}</h2>
            <p>親愛的 {{customer_name}}，</p>
            <p>{{content}}</p>
            <div class="info-box">
                <strong>交易詳情:</strong><br>
                訂單編號: {{order_id}}<br>
                交易時間: {{transaction_date}}<br>
                金額: {{amount}}
            </div>
        </div>
        <div class="footer">
            <p>此為系統自動發送的郵件，請勿直接回覆</p>
            <p>{{company_name}} - {{company_address}}</p>
        </div>
    </div>
</body>
</html>',
'{{company_name}} - 交易確認通知

{{title}}

親愛的 {{customer_name}}，

{{content}}

交易詳情:
訂單編號: {{order_id}}
交易時間: {{transaction_date}}
金額: {{amount}}

---
此為系統自動發送的郵件，請勿直接回覆
{{company_name}} - {{company_address}}',
1, 1, @AdminUserID);

-- 插入範例電子報活動
DECLARE @CampaignID1 UNIQUEIDENTIFIER = NEWID();
DECLARE @CampaignID2 UNIQUEIDENTIFIER = NEWID();

INSERT INTO Campaigns (CampaignID, CampaignName, Subject, PreviewText, FromName, FromEmail, TemplateID, HTMLContent, PlainTextContent, Status, Type, TotalRecipients, CreatedBy) VALUES
(@CampaignID1, '歡迎新會員', '歡迎加入 WintonEDM 大家庭！', '感謝您的加入，讓我們一起開始這段旅程', 'WintonEDM 團隊', 'noreply@wintonemd.com', @TemplateID1, 
'<h2>歡迎加入我們！</h2><p>感謝您訂閱我們的電子報。我們將定期為您提供最新的產品資訊和優惠活動。</p>', 
'歡迎加入我們！感謝您訂閱我們的電子報。我們將定期為您提供最新的產品資訊和優惠活動。', 
'Draft', 'Regular', 0, @AdminUserID),

(@CampaignID2, '月度電子報 - 2024年1月', '2024年1月精選內容', '本月最熱門的文章和產品推薦', 'WintonEDM 編輯部', 'newsletter@wintonemd.com', @TemplateID1,
'<h2>2024年1月精選內容</h2><p>本月為您精選了最受歡迎的文章和產品。</p><ul><li>產品更新資訊</li><li>行業趨勢分析</li><li>客戶成功案例</li></ul>',
'2024年1月精選內容\n\n本月為您精選了最受歡迎的文章和產品。\n- 產品更新資訊\n- 行業趨勢分析\n- 客戶成功案例',
'Draft', 'Regular', 0, @AdminUserID);

-- 插入自動化工作流程範例
DECLARE @WorkflowID1 UNIQUEIDENTIFIER = NEWID();
DECLARE @WorkflowID2 UNIQUEIDENTIFIER = NEWID();

INSERT INTO AutomationWorkflows (WorkflowID, WorkflowName, Description, TriggerType, TriggerConditions, CreatedBy) VALUES
(@WorkflowID1, '新訂閱者歡迎流程', '當有新訂閱者加入時自動發送歡迎郵件', 'Subscribe', '{"event": "subscriber_created", "delay": 0}', @AdminUserID),
(@WorkflowID2, '生日祝福流程', '在訂閱者生日當天發送生日祝福', 'Birthday', '{"event": "birthday", "delay": 0}', @AdminUserID);

-- 插入工作流程步驟
INSERT INTO WorkflowSteps (WorkflowID, StepOrder, StepType, StepConfig) VALUES
(@WorkflowID1, 1, 'Email', '{"template_id": "' + CAST(@TemplateID1 AS NVARCHAR(36)) + '", "subject": "歡迎加入！", "delay": 0}'),
(@WorkflowID1, 2, 'Wait', '{"delay": 7, "unit": "days"}'),
(@WorkflowID1, 3, 'Email', '{"template_id": "' + CAST(@TemplateID1 AS NVARCHAR(36)) + '", "subject": "您的第一週體驗如何？", "delay": 0}'),

(@WorkflowID2, 1, 'Email', '{"template_id": "' + CAST(@TemplateID2 AS NVARCHAR(36)) + '", "subject": "生日快樂！特別優惠送給您", "delay": 0}');

-- 插入範例統計資料
INSERT INTO EmailEvents (CampaignID, SubscriberID, EventType, IPAddress, UserAgent) 
SELECT 
    @CampaignID1,
    s.SubscriberID,
    'Sent',
    '192.168.1.' + CAST((ABS(CHECKSUM(NEWID())) % 254) + 1 AS NVARCHAR(3)),
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
FROM Subscribers s
WHERE s.Status = 'Active'
AND EXISTS (SELECT 1 FROM (SELECT TOP 5 SubscriberID FROM Subscribers ORDER BY NEWID()) t WHERE t.SubscriberID = s.SubscriberID);

-- 插入一些開信記錄
INSERT INTO EmailEvents (CampaignID, SubscriberID, EventType, IPAddress, UserAgent)
SELECT 
    CampaignID,
    SubscriberID,
    'Opened',
    IPAddress,
    UserAgent
FROM EmailEvents 
WHERE EventType = 'Sent' 
AND ABS(CHECKSUM(NEWID())) % 100 < 60; -- 60% 開信率

-- 插入一些點擊記錄
INSERT INTO EmailEvents (CampaignID, SubscriberID, EventType, IPAddress, UserAgent)
SELECT 
    CampaignID,
    SubscriberID,
    'Clicked',
    IPAddress,
    UserAgent
FROM EmailEvents 
WHERE EventType = 'Opened' 
AND ABS(CHECKSUM(NEWID())) % 100 < 25; -- 25% 點擊率

PRINT '種子資料插入完成！';
GO