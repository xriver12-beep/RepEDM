const { executeQuery } = require('../config/database');
const emailService = require('./email-service');
const crypto = require('crypto');

class NotificationService {
    
    /**
     * 生成審核免登入 Token
     */
    async generateApprovalToken(approvalId, approverId) {
        try {
            const token = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + 24); // 24小時有效期

            await executeQuery(`
                INSERT INTO ApprovalTokens (token, approval_id, approver_id, expires_at)
                VALUES (@token, @approvalId, @approverId, @expiresAt)
            `, {
                token,
                approvalId,
                approverId,
                expiresAt
            });

            return token;
        } catch (error) {
            console.error('生成審核 Token 失敗:', error);
            return null;
        }
    }

    /**
     * 發送審核通知給當前步驟的審批人
     * @param {number} approvalId 
     */
    async sendApprovalNotification(approvalId) {
        try {
            // 1. 獲取審核詳情和審批人資訊
            const query = `
                SELECT 
                    ai.id as ApprovalID, 
                    c.name as CampaignName, 
                    c.subject as CampaignSubject,
                    c.html_content,
                    c.target_audience,
                    c.target_filter,
                    c.recipient_count,
                    u.full_name as SubmitterName,
                    ws.step_name as StepName,
                    ws.approver_type,
                    ws.approver_id,
                    ws.approver_role,
                    submitter.manager_id as SubmitterManagerID
                FROM ApprovalItems ai
                JOIN Campaigns c ON ai.campaign_id = c.id
                JOIN Users u ON ai.submitted_by = u.id 
                JOIN Users submitter ON ai.submitted_by = submitter.id 
                JOIN WorkflowSteps ws ON ai.workflow_id = ws.workflow_id AND ai.current_step = ws.step_order
                WHERE ai.id = @approvalId
            `;
            
            const result = await executeQuery(query, { approvalId });
            
            if (result.recordset.length === 0) {
                console.error(`NotificationService: 找不到審核記錄 ${approvalId}`);
                return;
            }
            
            const item = result.recordset[0];
            let recipients = [];
            
            // 2. 確定收件人
            if (item.approver_type === 'Manager') {
                if (item.SubmitterManagerID) {
                    const managerQuery = `SELECT id, email, full_name FROM Users WHERE id = @id`;
                    const managerResult = await executeQuery(managerQuery, { id: item.SubmitterManagerID });
                    if (managerResult.recordset.length > 0) {
                        recipients.push(managerResult.recordset[0]);
                    }
                }
            } else if (['User', 'SpecificUser'].includes(item.approver_type)) {
                const userQuery = `SELECT id, email, full_name FROM Users WHERE id = @id`;
                const userResult = await executeQuery(userQuery, { id: item.approver_id });
                if (userResult.recordset.length > 0) {
                    recipients.push(userResult.recordset[0]);
                }
            } else if (item.approver_type === 'Role') {
                const roleQuery = `SELECT id, email, full_name FROM Users WHERE role = @role`;
                // 注意：這裡假設 Users 表有 role 欄位且與 approver_role 對應
                // 如果 role 是存儲在其他地方需要調整
                const roleResult = await executeQuery(roleQuery, { role: item.approver_role });
                recipients = roleResult.recordset;
            }
            
            if (recipients.length === 0) {
                console.warn(`NotificationService: 審核記錄 ${approvalId} 沒有找到有效的審批人`);
                return;
            }
            
            // 3. 發送郵件
            for (const recipient of recipients) {
                if (!recipient.email) continue;

                // 生成免登入連結
                let magicLinkHtml = '';
                let magicLinkText = '';
                
                const token = await this.generateApprovalToken(item.ApprovalID, recipient.id);
                if (token) {
                    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
                    const link = `${baseUrl}/approval-login.html?token=${token}`;
                    
                    magicLinkHtml = `
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${link}" 
                               style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
                                🚀 快速審核 (免登入)
                            </a>
                            <p style="margin-top: 10px; font-size: 12px; color: #888;">連結有效期為 24 小時</p>
                        </div>
                    `;
                    
                    magicLinkText = `快速審核連結 (免登入): ${link}`;
                }
                
                // 處理預覽內容
                let previewHtml = '';
                if (item.html_content) {
                    // 嘗試保留 style 標籤的內容，但移除 head/body 標籤
                    let content = item.html_content;
                    
                    // 提取 style 內容 (如果有的話)
                    let styles = '';
                    const styleMatch = content.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
                    if (styleMatch) {
                        styles = styleMatch.join('\n');
                    }

                    // 移除結構標籤
                    content = content
                        .replace(/<!DOCTYPE[^>]*>/gi, '')
                        .replace(/<html[^>]*>/gi, '')
                        .replace(/<\/html>/gi, '')
                        .replace(/<head>[\s\S]*?<\/head>/gi, '') 
                        .replace(/<body[^>]*>/gi, '')
                        .replace(/<\/body>/gi, '');
                    
                    // 如果原本有樣式，將其加回 (但在 style 標籤中)
                    // 並加入 Outlook 圖片間隙修復
                    const fixStyles = `
                        <style>
                            ${styles.replace(/<style[^>]*>|<\/style>/gi, '')}
                            
                            /* 強制覆蓋樣式以確保在通知郵件中正確顯示 */
                            .preview-content { width: 100%; max-width: 100%; }
                            .preview-content img { display: block; border: 0; max-width: 100% !important; height: auto !important; }
                            .preview-content table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; max-width: 100% !important; }
                        </style>
                    `;

                    previewHtml = `
                        ${fixStyles}
                        <div style="margin-top: 30px; border-top: 2px solid #eee; padding-top: 20px;">
                            <h3 style="color: #666; font-size: 16px; font-family: Arial, sans-serif;">📄 EDM 內容預覽</h3>
                            <!-- 使用 Table 結構包裹預覽內容以提升 Outlook 相容性 -->
                            <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border: 1px solid #ddd; background-color: #fff;">
                                <tr>
                                    <td style="padding: 10px;">
                                        <div class="preview-content">
                                            ${content}
                                        </div>
                                    </td>
                                </tr>
                            </table>
                        </div>
                    `;
                }

                const subject = `[待審核] 活動 "${item.CampaignName}" 需要您的審核`;
                
                // 計算並格式化目標受眾資訊
                let audienceText = item.target_audience || '未指定';
                let recipientCountText = item.recipient_count ? `${item.recipient_count} 人` : '計算中...';

                if (item.target_audience === 'all') {
                    audienceText = '所有訂閱者';
                } else if (item.target_audience === 'active') {
                    audienceText = '活躍用戶';
                } else if (item.target_audience === 'category') {
                    // 如果是分類受眾，嘗試解析 filter 獲取詳細資訊 (這裡簡化處理，因為 filter 可能是 ID 列表)
                    // 若需要顯示分類名稱，可能需要額外的查詢，這裡先顯示基本資訊
                    try {
                        let ids = typeof item.target_filter === 'string' ? JSON.parse(item.target_filter || '[]') : item.target_filter;
                        if (!Array.isArray(ids)) ids = [ids];
                        audienceText = `指定分類 (共 ${ids.length} 個分類)`;
                    } catch (e) {
                        audienceText = '指定分類';
                    }
                } else if (item.target_audience === 'custom') {
                    audienceText = '自訂名單';
                }

                const html = `
                    <div style="font-family: Arial, sans-serif; width: 100%; max-width: 900px; margin: 0 auto;">
                        <h2 style="color: #333;">審核請求通知</h2>
                        <p>親愛的 ${recipient.full_name}，</p>
                        <p><strong>${item.SubmitterName}</strong> 提交了一個新的活動需要您的審核。</p>
                        
                        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
                            <p style="margin: 5px 0;"><strong>活動名稱：</strong> ${item.CampaignName}</p>
                            <p style="margin: 5px 0;"><strong>郵件主旨：</strong> ${item.CampaignSubject}</p>
                            <p style="margin: 5px 0;"><strong>目標受眾：</strong> ${audienceText}</p>
                            <p style="margin: 5px 0;"><strong>預計發送數量：</strong> ${recipientCountText}</p>
                            <p style="margin: 5px 0;"><strong>當前步驟：</strong> ${item.StepName}</p>
                        </div>
                        
                        <p>請登入系統查看詳情並進行審核。</p>
                        
                        ${magicLinkHtml}
                        
                        <div style="text-align: center; margin: 20px 0;">
                            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/approvals.html" 
                               style="color: #666; text-decoration: underline;">
                                一般登入審核
                            </a>
                        </div>

                        ${previewHtml}
                        
                        <hr style="border: 1px solid #eee; margin: 20px 0;">
                        <p style="color: #666; font-size: 12px;">此為系統自動發送的通知郵件，請勿直接回覆。</p>
                    </div>
                `;
                
                await emailService.sendEmail({
                    to: recipient.email,
                    subject: subject,
                    html: html,
                    text: `[待審核] 活動 "${item.CampaignName}" 需要您的審核。提交人: ${item.SubmitterName}。請登入系統查看。`,
                    emailType: 'approval_notification'
                });
                
                console.log(`NotificationService: 已發送審核通知給 ${recipient.email}`);
            }
            
        } catch (error) {
            console.error('NotificationService: 發送審核通知失敗', error);
        }
    }

    /**
     * 發送審核完成通知 (批准)
     * @param {number} approvalId 
     */
    async sendCompletionNotification(approvalId) {
        try {
            const query = `
                SELECT 
                    ai.id as ApprovalID, 
                    ai.status as Status,
                    c.name as CampaignName, 
                    c.subject as CampaignSubject,
                    u.full_name as SubmitterName,
                    u.email as SubmitterEmail
                FROM ApprovalItems ai
                JOIN Campaigns c ON ai.campaign_id = c.id
                JOIN Users u ON ai.submitted_by = u.id 
                WHERE ai.id = @approvalId
            `;
            
            const result = await executeQuery(query, { approvalId });
            
            if (result.recordset.length === 0) return;
            
            const item = result.recordset[0];
            
            // Double-check: Ensure status is actually approved
            if (item.Status.toLowerCase() !== 'approved') {
                console.warn(`NotificationService: 試圖發送審核完成通知，但審核狀態為 '${item.Status}' (ID: ${approvalId})。已攔截。`);
                return;
            }

            if (!item.SubmitterEmail) return;

            const subject = `[審核通過] 活動 "${item.CampaignName}" 已通過審核`;
            const html = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #28a745;">審核通過通知</h2>
                    <p>親愛的 ${item.SubmitterName}，</p>
                    <p>恭喜！您提交的活動 <strong>${item.CampaignName}</strong> 已通過所有審核流程。</p>
                    
                    <div style="background-color: #f0fff4; padding: 15px; border-radius: 5px; margin: 20px 0; border: 1px solid #b8daff;">
                        <p style="margin: 5px 0;"><strong>活動名稱：</strong> ${item.CampaignName}</p>
                        <p style="margin: 5px 0;"><strong>郵件主旨：</strong> ${item.CampaignSubject}</p>
                        <p style="margin: 5px 0;"><strong>狀態：</strong> 已批准 (Approved)</p>
                    </div>
                    
                    <p>您現在可以進行後續的發送排程。</p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/campaigns.html" 
                           style="background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                           前往活動列表
                        </a>
                    </div>
                </div>
            `;

            await emailService.sendEmail({
                to: item.SubmitterEmail,
                subject: subject,
                html: html,
                text: `[審核通過] 活動 "${item.CampaignName}" 已通過審核。`,
                emailType: 'approval_completion'
            });
            
            console.log(`NotificationService: 已發送審核完成通知給 ${item.SubmitterEmail}`);

        } catch (error) {
            console.error('NotificationService: 發送審核完成通知失敗', error);
        }
    }

    /**
     * 發送審核拒絕或退回通知
     * @param {number} approvalId 
     * @param {string} rejectedBy 拒絕者姓名
     * @param {string} reason 原因
     * @param {string} action 'Rejected' or 'Returned'
     */
    async sendRejectionNotification(approvalId, rejectedBy, reason, action) {
        try {
            const query = `
                SELECT 
                    ai.id as ApprovalID, 
                    c.name as CampaignName, 
                    c.subject as CampaignSubject,
                    u.full_name as SubmitterName,
                    u.email as SubmitterEmail
                FROM ApprovalItems ai
                JOIN Campaigns c ON ai.campaign_id = c.id
                JOIN Users u ON ai.submitted_by = u.id 
                WHERE ai.id = @approvalId
            `;
            
            const result = await executeQuery(query, { approvalId });
            
            if (result.recordset.length === 0) return;
            
            const item = result.recordset[0];
            if (!item.SubmitterEmail) return;

            const isReturned = action === 'Returned';
            const actionText = isReturned ? '退回修改' : '拒絕';
            const color = isReturned ? '#ffc107' : '#dc3545';
            const titleColor = isReturned ? '#856404' : '#721c24';
            const bgColor = isReturned ? '#fff3cd' : '#f8d7da';
            const borderColor = isReturned ? '#ffeeba' : '#f5c6cb';

            const subject = `[審核${actionText}] 活動 "${item.CampaignName}" 已被${actionText}`;
            const html = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: ${color};">審核${actionText}通知</h2>
                    <p>親愛的 ${item.SubmitterName}，</p>
                    <p>您提交的活動 <strong>${item.CampaignName}</strong> 已被 <strong>${rejectedBy}</strong> ${actionText}。</p>
                    
                    <div style="background-color: ${bgColor}; padding: 15px; border-radius: 5px; margin: 20px 0; border: 1px solid ${borderColor};">
                        <p style="margin: 5px 0; color: ${titleColor};"><strong>${actionText}原因：</strong></p>
                        <p style="margin: 10px 0; white-space: pre-wrap;">${reason || '無詳細原因'}</p>
                    </div>
                    
                    <p>${isReturned ? '請根據反饋修改內容後重新提交。' : '如有疑問請聯繫相關人員。'}</p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/campaigns.html" 
                           style="background-color: #6c757d; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                           查看詳情
                        </a>
                    </div>
                </div>
            `;

            await emailService.sendEmail({
                to: item.SubmitterEmail,
                subject: subject,
                html: html,
                text: `[審核${actionText}] 活動 "${item.CampaignName}" 已被${actionText}。原因: ${reason}`,
                emailType: 'approval_rejection'
            });
            
            console.log(`NotificationService: 已發送審核${actionText}通知給 ${item.SubmitterEmail}`);

        } catch (error) {
            console.error('NotificationService: 發送審核拒絕/退回通知失敗', error);
        }
    }
}

module.exports = new NotificationService();
