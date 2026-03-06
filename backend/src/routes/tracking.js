const express = require('express');
const { executeQuery, sql } = require('../config/database');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const notificationService = require('../services/notification-service');

const router = express.Router();

// 郵件開啟追蹤
router.get('/open/:trackingId',
  asyncHandler(async (req, res) => {
    const { trackingId } = req.params;
    const userAgent = req.get('User-Agent') || '';
    const ip = req.ip || req.connection.remoteAddress;

    try {
      // 解析追蹤ID獲取活動和訂閱者信息
      const trackingInfo = await executeQuery(`
        SELECT campaign_id, subscriber_id 
        FROM EmailSends 
        WHERE TrackingID = @trackingId
      `, { trackingId });

      if (trackingInfo.recordset.length > 0) {
        const { campaign_id, subscriber_id } = trackingInfo.recordset[0];

        // 檢查是否已經開啟過 (用於判斷是否增加計數)
        const checkOpen = await executeQuery(`
          SELECT TOP 1 1 
          FROM EmailOpens 
          WHERE CampaignID = @campaignId AND SubscriberID = @subscriberId
        `, { campaignId: campaign_id, subscriberId: subscriber_id });

        const isFirstOpen = checkOpen.recordset.length === 0;

        // 記錄開啟事件 (詳細日誌)
        await executeQuery(`
          INSERT INTO EmailOpens (CampaignID, SubscriberID, OpenedAt, IPAddress, UserAgent, Device, EmailClient)
          VALUES (@campaignId, @subscriberId, GETDATE(), @ip, @userAgent, @device, @emailClient)
        `, {
          campaignId: campaign_id,
          subscriberId: subscriber_id,
          ip,
          userAgent,
          device: parseDevice(userAgent),
          emailClient: parseEmailClient(userAgent)
        });

        // 只有第一次開啟時才更新活動統計
        if (isFirstOpen) {
          await executeQuery(`
            UPDATE Campaigns 
            SET opened_count = opened_count + 1
            WHERE id = @campaignId
          `, { campaignId: campaign_id });
        }
      }
    } catch (error) {
      console.error('追蹤開啟事件錯誤:', error);
    }

    // 返回1x1透明像素圖片
    const pixel = Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'base64'
    );
    
    res.set({
      'Content-Type': 'image/gif',
      'Content-Length': pixel.length,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    res.send(pixel);
  })
);

// 連結點擊追蹤
router.get('/click/:trackingId',
  asyncHandler(async (req, res) => {
    const { trackingId } = req.params;
    const { url } = req.query;
    const userAgent = req.get('User-Agent') || '';
    const ip = req.ip || req.connection.remoteAddress;

    try {
      // 解析追蹤ID獲取活動和訂閱者信息
      const trackingInfo = await executeQuery(`
        SELECT campaign_id, subscriber_id 
        FROM EmailSends 
        WHERE TrackingID = @trackingId
      `, { trackingId });

      if (trackingInfo.recordset.length > 0) {
        const { campaign_id, subscriber_id } = trackingInfo.recordset[0];

        // 檢查是否已經點擊過 (用於判斷是否增加計數)
        const checkClick = await executeQuery(`
          SELECT TOP 1 1 
          FROM EmailClicks 
          WHERE CampaignID = @campaignId AND SubscriberID = @subscriberId
        `, { campaignId: campaign_id, subscriberId: subscriber_id });

        const isFirstClick = checkClick.recordset.length === 0;

        // 記錄點擊事件 (詳細日誌)
        await executeQuery(`
          INSERT INTO EmailClicks (CampaignID, SubscriberID, URL, ClickedAt, IPAddress, UserAgent)
          VALUES (@campaignId, @subscriberId, @url, GETDATE(), @ip, @userAgent)
        `, {
          campaignId: campaign_id,
          subscriberId: subscriber_id,
          url: decodeURIComponent(url || ''),
          ip,
          userAgent
        });

        // 只有第一次點擊時才更新活動統計
        if (isFirstClick) {
          await executeQuery(`
            UPDATE Campaigns 
            SET clicked_count = clicked_count + 1
            WHERE id = @campaignId
          `, { campaignId: campaign_id });
        }
      }
    } catch (error) {
      console.error('追蹤點擊事件錯誤:', error);
    }

    // 重定向到目標URL
    if (url) {
      res.redirect(decodeURIComponent(url));
    } else {
      res.status(400).send('缺少目標URL');
    }
  })
);

// 取消訂閱追蹤
router.get('/unsubscribe/:trackingId',
  asyncHandler(async (req, res) => {
    const { trackingId } = req.params;

    try {
      // 解析追蹤ID獲取訂閱者信息
      const trackingInfo = await executeQuery(`
        SELECT campaign_id, subscriber_id 
        FROM EmailSends 
        WHERE TrackingID = @trackingId
      `, { trackingId });

      if (trackingInfo.recordset.length > 0) {
        const { campaign_id, subscriber_id } = trackingInfo.recordset[0];

        // 更新訂閱者狀態為已取消訂閱 (unsubscribed)
        await executeQuery(`
          UPDATE Subscribers 
          SET status = 'unsubscribed', unsubscribed_at = GETDATE(), updated_at = GETDATE()
          WHERE id = @subscriberId
        `, { subscriberId: subscriber_id });

        // 記錄取消訂閱事件
        await executeQuery(`
          INSERT INTO EmailUnsubscribes (CampaignID, SubscriberID, UnsubscribedAt, IPAddress)
          VALUES (@campaignId, @subscriberId, GETDATE(), @ip)
        `, {
          campaignId: campaign_id,
          subscriberId: subscriber_id,
          ip: req.ip || req.connection.remoteAddress
        });

        // 更新活動統計
        await executeQuery(`
          UPDATE Campaigns 
          SET unsubscribed_count = unsubscribed_count + 1
          WHERE id = @campaignId
        `, { campaignId: campaign_id });
      }
      // 重定向到前端取消訂閱頁面 (使用相對路徑，適配同一端口服務)
      res.redirect('/unsubscribe.html?status=success');

    } catch (error) {
      console.error('處理取消訂閱錯誤:', error);
      // 發生錯誤時也重定向到前端，但帶上錯誤參數
      res.redirect('/unsubscribe.html?status=error');
    }
  })
);

// One-Click Unsubscribe (RFC 8058) - POST Handler
router.post('/unsubscribe/:trackingId',
  asyncHandler(async (req, res) => {
    const { trackingId } = req.params;

    try {
      // 解析追蹤ID獲取訂閱者信息
      const trackingInfo = await executeQuery(`
        SELECT campaign_id, subscriber_id 
        FROM EmailSends 
        WHERE TrackingID = @trackingId
      `, { trackingId });

      if (trackingInfo.recordset.length > 0) {
        const { campaign_id, subscriber_id } = trackingInfo.recordset[0];

        // 更新訂閱者狀態為已刪除 (Soft Delete)
        await executeQuery(`
          UPDATE Subscribers 
          SET status = 'deleted', unsubscribed_at = GETDATE(), updated_at = GETDATE()
          WHERE id = @subscriberId
        `, { subscriberId: subscriber_id });

        // 記錄取消訂閱事件
        await executeQuery(`
          INSERT INTO EmailUnsubscribes (CampaignID, SubscriberID, UnsubscribedAt, IPAddress)
          VALUES (@campaignId, @subscriberId, GETDATE(), @ip)
        `, {
          campaignId: campaign_id,
          subscriberId: subscriber_id,
          ip: req.ip || req.connection.remoteAddress
        });

        // 更新活動統計
        await executeQuery(`
          UPDATE Campaigns 
          SET unsubscribed_count = unsubscribed_count + 1
          WHERE id = @campaignId
        `, { campaignId: campaign_id });
      }
      
      // RFC 8058 Requires 200 OK
      res.status(200).send('Unsubscribe successful');

    } catch (error) {
      console.error('處理取消訂閱(POST)錯誤:', error);
      res.status(500).send('Error processing unsubscribe');
    }
  })
);

// 手動觸發發送最新活動報告 (來自郵件中的連結)
router.get('/report/:campaignId',
  asyncHandler(async (req, res) => {
    const { campaignId } = req.params;

    // 簡單驗證 campaignId 是否為數字
    if (isNaN(campaignId)) {
        return res.status(400).send('Invalid Campaign ID');
    }

    try {
        // 獲取活動建立者 Email
        const query = `
            SELECT c.id, c.name, u.email as creator_email
            FROM Campaigns c
            LEFT JOIN Users u ON c.created_by = u.id
            WHERE c.id = @campaignId
        `;
        const result = await executeQuery(query, { campaignId });

        if (result.recordset.length === 0) {
            return res.status(404).send('Campaign not found');
        }

        const campaign = result.recordset[0];

        if (!campaign.creator_email) {
            return res.status(400).send('Creator email not found');
        }

        // 發送報告 (isUpdate = true)
        await notificationService.sendCampaignReport(campaign.id, campaign.creator_email, true);

        // 回傳簡單的成功頁面
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>報告已發送</title>
                <style>
                    body { font-family: "Microsoft JhengHei", Arial, sans-serif; text-align: center; padding: 50px 20px; background-color: #f8f9fa; margin: 0; }
                    .container { background-color: white; padding: 40px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); max-width: 500px; margin: 0 auto; }
                    h1 { color: #28a745; margin-bottom: 20px; }
                    p { color: #555; line-height: 1.6; }
                    .email { font-weight: bold; color: #0056b3; background: #e8f4fd; padding: 2px 8px; border-radius: 4px; }
                    .footer { margin-top: 30px; font-size: 13px; color: #999; border-top: 1px solid #eee; padding-top: 20px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>✅ 報告已發送</h1>
                    <p>最新的活動成效報告已發送至您的信箱：</p>
                    <p><span class="email">${campaign.creator_email}</span></p>
                    <p>請查收您的電子郵件以獲取最新數據。</p>
                    
                    <a href="/api/tracking/analysis/${campaignId}" style="display: inline-block; margin-top: 15px; padding: 10px 20px; background-color: #28a745; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">直接查看線上分析報告</a>

                    <div class="footer">
                        您隨時可以再次點擊郵件中的「查看最新即時進度」按鈕來獲取最新數據。
                    </div>
                </div>
            </body>
            </html>
        `);

    } catch (error) {
        console.error('手動發送報告失敗:', error);
        res.status(500).send('系統發生錯誤，請稍後再試。');
    }
  })
);

// 查看活動分析報告 HTML
router.get('/analysis/:campaignId',
    asyncHandler(async (req, res) => {
        const { campaignId } = req.params;
        
        if (isNaN(campaignId)) {
            return res.status(400).send('Invalid Campaign ID');
        }

        try {
            // 1. 獲取基本統計
            const basicStats = await executeQuery(`
              SELECT 
                c.id, c.name, c.subject, c.sent_at,
                c.recipient_count as total_sent,
                c.opened_count as total_opened,
                c.clicked_count as total_clicked,
                c.bounced_count as total_bounced,
                c.unsubscribed_count as total_unsubscribed,
                CASE WHEN c.recipient_count > 0 THEN CAST(c.opened_count AS FLOAT) / c.recipient_count * 100 ELSE 0 END as open_rate,
                CASE WHEN c.opened_count > 0 THEN CAST(c.clicked_count AS FLOAT) / c.opened_count * 100 ELSE 0 END as click_rate,
                CASE WHEN c.recipient_count > 0 THEN CAST(c.bounced_count AS FLOAT) / c.recipient_count * 100 ELSE 0 END as bounce_rate,
                CASE WHEN c.recipient_count > 0 THEN CAST(c.unsubscribed_count AS FLOAT) / c.recipient_count * 100 ELSE 0 END as unsubscribe_rate
              FROM Campaigns c
              WHERE c.id = @campaignId
            `, { campaignId });

            if (basicStats.recordset.length === 0) {
                return res.status(404).send('Campaign not found');
            }
            const campaign = basicStats.recordset[0];

            // 2. 獲取連結統計
            const linkStats = await executeQuery(`
              SELECT 
                URL as url,
                COUNT(*) as clickCount
              FROM EmailClicks 
              WHERE CampaignID = @campaignId
              GROUP BY URL
              ORDER BY clickCount DESC
            `, { campaignId });
            
            // 3. 獲取網域統計 (改為查詢 EmailSends 表，確保數據完整性)
            const domainStats = await executeQuery(`
              SELECT TOP 10
                  SUBSTRING(email, CHARINDEX('@', email) + 1, LEN(email)) as domain,
                  COUNT(*) as total_sent,
                  SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as success_count,
                  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failure_count
              FROM EmailSends
              WHERE campaign_id = @campaignId AND CHARINDEX('@', email) > 0
              GROUP BY SUBSTRING(email, CHARINDEX('@', email) + 1, LEN(email))
              ORDER BY total_sent DESC
            `, { campaignId });

            // 4. 獲取失敗原因 (改為查詢 EmailSends 表)
            const rawFailures = await executeQuery(`
              SELECT
                  SUBSTRING(email, CHARINDEX('@', email) + 1, LEN(email)) as domain,
                  bounce_reason as error_message,
                  '' as smtp_response
              FROM EmailSends
              WHERE campaign_id = @campaignId AND status = 'failed' AND CHARINDEX('@', email) > 0
            `, { campaignId });

            // 聚合失敗原因
            const failureMap = new Map();
            const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;
            const bracketRegex = /<[^>]*>/g;

            rawFailures.recordset.forEach(row => {
                const domain = row.domain || 'Unknown';
                let reason = row.smtp_response || row.error_message || 'Unknown Error';
                reason = reason.replace(emailRegex, '[EMAIL]').replace(bracketRegex, '').replace(/\s+/g, ' ').trim();
                if (!reason) reason = 'Unknown Error';
                const key = `${domain}|${reason}`;
                if (!failureMap.has(key)) {
                    failureMap.set(key, { domain, reason, count: 0 });
                }
                failureMap.get(key).count++;
            });

            const aggregatedFailures = Array.from(failureMap.values())
                .sort((a, b) => b.count - a.count)
                .slice(0, 100);

            // 5. 生成 HTML
            const formatDate = (date) => date ? new Date(date).toLocaleString('zh-TW', { hour12: false }) : '-';
            const formatNumber = (num) => (num || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

            const totalSent = campaign.total_sent || 0;
            const totalOpened = campaign.total_opened || 0;
            const totalClicked = campaign.total_clicked || 0;
            const totalUnsubscribed = campaign.total_unsubscribed || 0;
            const totalBounced = campaign.total_bounced || 0;

            const openRate = totalSent > 0 ? ((totalOpened / totalSent) * 100).toFixed(1) : '0.0';
            const clickRate = totalSent > 0 ? ((totalClicked / totalSent) * 100).toFixed(1) : '0.0';
            const unsubRate = totalSent > 0 ? ((totalUnsubscribed / totalSent) * 100).toFixed(1) : '0.0';
            const bounceRate = totalSent > 0 ? ((totalBounced / totalSent) * 100).toFixed(1) : '0.0';
            const successRate = (100 - parseFloat(bounceRate)).toFixed(1);

            const domainRows = domainStats.recordset.map(d => `
                <tr>
                    <td>${d.domain}</td>
                    <td>${formatNumber(d.total_sent)}</td>
                    <td class="text-success">${formatNumber(d.success_count)}</td>
                    <td class="text-danger">${formatNumber(d.failure_count)}</td>
                    <td>${d.total_sent > 0 ? ((d.success_count / d.total_sent) * 100).toFixed(1) : '0.0'}%</td>
                    <td>${d.total_sent > 0 ? ((d.failure_count / d.total_sent) * 100).toFixed(1) : '0.0'}%</td>
                </tr>
            `).join('');

            const failureRows = aggregatedFailures.map(f => `
                <tr>
                    <td>${f.domain}</td>
                    <td class="text-danger">${f.reason}</td>
                    <td>${formatNumber(f.count)}</td>
                </tr>
            `).join('');

            const linkRows = linkStats.recordset.map(l => `
                <tr>
                    <td><a href="${l.url}" target="_blank">${l.url}</a></td>
                    <td>${formatNumber(l.clickCount)}</td>
                </tr>
            `).join('');

            const html = `
            <!DOCTYPE html>
            <html lang="zh-TW">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>活動分析報告 - ${campaign.name}</title>
                <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
                <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
                <style>
                    body { font-family: "Microsoft JhengHei", sans-serif; background: #f8f9fa; padding: 20px; }
                    .card { border: none; box-shadow: 0 2px 4px rgba(0,0,0,0.05); margin-bottom: 20px; border-radius: 8px; }
                    .stat-card { text-align: center; padding: 20px; }
                    .stat-value { font-size: 28px; font-weight: bold; color: #2c3e50; }
                    .stat-label { font-size: 14px; color: #7f8c8d; margin-top: 5px; }
                    .section-title { border-left: 4px solid #4e73df; padding-left: 10px; margin-bottom: 20px; color: #333; }
                    .table th { background-color: #f1f3f9; }
                    .text-success { color: #1cc88a !important; }
                    .text-danger { color: #e74a3b !important; }
                    .chart-container { position: relative; height: 300px; width: 100%; }
                    @media print {
                        body { background: #fff; padding: 0; }
                        .no-print { display: none !important; }
                        .card { box-shadow: none; border: 1px solid #ddd; break-inside: avoid; }
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="d-flex justify-content-between align-items-center mb-4 no-print">
                        <button onclick="window.print()" class="btn btn-primary">
                            列印 / 儲存 PDF
                        </button>
                    </div>

                    <div class="d-flex justify-content-between align-items-center mb-4">
                        <div>
                            <h2 class="mb-1">活動分析報告</h2>
                            <h4 class="text-primary">${campaign.name}</h4>
                        </div>
                        <div class="text-end text-muted">
                            <small>發送時間: ${formatDate(campaign.sent_at)}</small><br>
                            <small>報告生成時間: ${new Date().toLocaleString('zh-TW', { hour12: false })}</small>
                        </div>
                    </div>

                    <!-- 關鍵指標 -->
                    <div class="row mb-4">
                        <div class="col-md-2 col-sm-4 col-6">
                            <div class="card stat-card">
                                <div class="stat-value">${formatNumber(totalSent)}</div>
                                <div class="stat-label">總發送數</div>
                            </div>
                        </div>
                        <div class="col-md-2 col-sm-4 col-6">
                            <div class="card stat-card">
                                <div class="stat-value text-success">${successRate}%</div>
                                <div class="stat-label">成功率</div>
                            </div>
                        </div>
                        <div class="col-md-2 col-sm-4 col-6">
                            <div class="card stat-card">
                                <div class="stat-value text-primary">${openRate}%</div>
                                <div class="stat-label">開信率</div>
                            </div>
                        </div>
                        <div class="col-md-2 col-sm-4 col-6">
                            <div class="card stat-card">
                                <div class="stat-value text-info">${clickRate}%</div>
                                <div class="stat-label">點擊率</div>
                            </div>
                        </div>
                        <div class="col-md-2 col-sm-4 col-6">
                            <div class="card stat-card">
                                <div class="stat-value text-warning">${unsubRate}%</div>
                                <div class="stat-label">退訂率</div>
                            </div>
                        </div>
                         <div class="col-md-2 col-sm-4 col-6">
                            <div class="card stat-card">
                                <div class="stat-value text-danger">${bounceRate}%</div>
                                <div class="stat-label">失敗率</div>
                            </div>
                        </div>
                    </div>

                    <!-- 圖表分析 -->
                    <div class="row mb-4">
                        <div class="col-md-6">
                            <div class="card p-4">
                                <h5 class="section-title">發送狀態分佈</h5>
                                <div class="chart-container">
                                    <canvas id="deliveryChart"></canvas>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="card p-4">
                                <h5 class="section-title">活動成效統計</h5>
                                <div class="chart-container">
                                    <canvas id="funnelChart"></canvas>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 網域統計 -->
                    <div class="card p-4 mb-4">
                        <h5 class="section-title">網域發送統計</h5>
                        <div class="table-responsive">
                            <table class="table table-hover">
                                <thead>
                                    <tr>
                                        <th>網域</th>
                                        <th>發送總數</th>
                                        <th>成功</th>
                                        <th>失敗</th>
                                        <th>成功率</th>
                                        <th>失敗率</th>
                                    </tr>
                                </thead>
                                <tbody>${domainRows || '<tr><td colspan="6" class="text-center">無數據</td></tr>'}</tbody>
                            </table>
                        </div>
                    </div>

                    <!-- 失敗原因分析 -->
                    <div class="row mb-4">
                        <div class="col-12">
                            <div class="card p-4">
                                <h5 class="section-title">失敗原因詳細分析</h5>
                                <div class="alert alert-info py-2">
                                    <small>僅顯示前 100 筆主要失敗原因</small>
                                </div>
                                <div class="table-responsive" style="max-height: 400px;">
                                    <table class="table table-hover table-sm">
                                        <thead>
                                            <tr>
                                                <th style="width: 20%">網域</th>
                                                <th style="width: 65%">失敗原因</th>
                                                <th style="width: 15%">次數</th>
                                            </tr>
                                        </thead>
                                        <tbody>${failureRows || '<tr><td colspan="3" class="text-center">無失敗數據</td></tr>'}</tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 連結點擊分析 -->
                     <div class="card p-4 mb-4">
                        <h5 class="section-title">熱門連結點擊</h5>
                        <div class="table-responsive">
                            <table class="table table-hover">
                                <thead>
                                    <tr>
                                        <th>連結 URL</th>
                                        <th>點擊次數</th>
                                    </tr>
                                </thead>
                                <tbody>${linkRows || '<tr><td colspan="2" class="text-center">無點擊數據</td></tr>'}</tbody>
                            </table>
                        </div>
                    </div>

                </div>

                <script>
                    document.addEventListener('DOMContentLoaded', function() {
                        const deliveryCtx = document.getElementById('deliveryChart').getContext('2d');
                        new Chart(deliveryCtx, {
                            type: 'doughnut',
                            data: {
                                labels: ['成功送達', '發送失敗'],
                                datasets: [{
                                    data: [${totalSent - totalBounced}, ${totalBounced}],
                                    backgroundColor: ['#1cc88a', '#e74a3b'],
                                    borderWidth: 0
                                }]
                            },
                            options: {
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: { legend: { position: 'bottom' } }
                            }
                        });

                        const funnelCtx = document.getElementById('funnelChart').getContext('2d');
                        new Chart(funnelCtx, {
                            type: 'bar',
                            data: {
                                labels: ['發送總數', '開啟', '點擊', '退訂'],
                                datasets: [{
                                    label: '人數/次數',
                                    data: [${totalSent}, ${totalOpened}, ${totalClicked}, ${totalUnsubscribed}],
                                    backgroundColor: ['#4e73df', '#36b9cc', '#1cc88a', '#f6c23e'],
                                    barPercentage: 0.6
                                }]
                            },
                            options: {
                                responsive: true,
                                maintainAspectRatio: false,
                                indexAxis: 'y',
                                plugins: { legend: { display: false } },
                                scales: { x: { beginAtZero: true } }
                            }
                        });
                    });
                </script>
            </body>
            </html>
            `;
            
            res.send(html);

        } catch (error) {
            console.error('生成活動報告失敗:', error);
            res.status(500).send('系統發生錯誤，請稍後再試。');
        }
    })
);


// 通過 Email 取消訂閱 (用於網頁手動退訂)
router.post('/unsubscribe-by-email',
  asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email) {
      throw new AppError('請提供 Email 地址', 400);
    }

    // 檢查 Email 是否存在
    const subscriberResult = await executeQuery(
      'SELECT id FROM Subscribers WHERE email = @email',
      { email }
    );

    if (subscriberResult.recordset.length === 0) {
      // 為了安全起見，即使找不到也回傳成功，避免枚舉攻擊
      // 但為了 UX，這裡還是回傳具體訊息 (依需求而定，這裡假設是內部或信任的環境)
      // 用戶說 "沒有退訂的網頁"，假設是公開的。
      // 標準做法是說 "如果您的 Email 在我們的列表中，您已成功取消訂閱"。
      // 但為了簡單明確的回饋，我們這裡如果找不到就說找不到 (或視為成功)。
      // 讓我們回傳成功，但不做任何事。
      return res.json({
        success: true,
        message: '如果您的 Email 存在於我們的列表中，已成功取消訂閱。'
      });
    }

    const subscriberId = subscriberResult.recordset[0].id;

    // 更新訂閱者狀態
    // 保持與 tracking.js 上方邏輯一致，使用 'deleted' 或 'unsubscribed'
    // 這裡使用 'unsubscribed' 以保持語義正確，若需 'deleted' 可自行修改
    await executeQuery(`
      UPDATE Subscribers 
      SET status = 'unsubscribed', unsubscribed_at = GETDATE(), updated_at = GETDATE()
      WHERE id = @subscriberId
    `, { subscriberId });

    // 記錄取消訂閱事件 (CampaignID 為 NULL)
    try {
      await executeQuery(`
        INSERT INTO EmailUnsubscribes (CampaignID, SubscriberID, UnsubscribedAt, IPAddress)
        VALUES (NULL, @subscriberId, GETDATE(), @ip)
      `, {
        subscriberId,
        ip: req.ip || req.connection.remoteAddress
      });
    } catch (error) {
      console.error('記錄 EmailUnsubscribes 失敗 (可能是 schema 限制):', error);
      // 不中斷流程，因為狀態已更新
    }

    res.json({
      success: true,
      message: '您已成功取消訂閱。'
    });
  })
);

// 輔助函數：解析設備類型
function parseDevice(userAgent) {
  if (/Mobile|Android|iPhone|iPad/.test(userAgent)) {
    return 'Mobile';
  } else if (/Tablet/.test(userAgent)) {
    return 'Tablet';
  } else {
    return 'Desktop';
  }
}

// 輔助函數：解析郵件客戶端
function parseEmailClient(userAgent) {
  if (/Outlook/.test(userAgent)) {
    return 'Outlook';
  } else if (/Gmail/.test(userAgent)) {
    return 'Gmail';
  } else if (/Apple Mail/.test(userAgent)) {
    return 'Apple Mail';
  } else if (/Thunderbird/.test(userAgent)) {
    return 'Thunderbird';
  } else {
    return 'Unknown';
  }
}

module.exports = router;