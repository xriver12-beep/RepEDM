const { sql } = require('../config/database');

/**
 * 檢查用戶是否有審核權限
 */
const checkApprovalPermission = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { workflowId, stepId } = req.params;

    // 檢查用戶是否為系統管理員
    if (req.user.role === 'admin') {
      return next();
    }

    // 檢查用戶是否有特定工作流程的審核權限
    const query = `
      SELECT COUNT(*) as count
      FROM ApprovalSteps
      WHERE WorkflowId = @workflowId 
        AND (ApproverUserId = @userId OR ApproverRole = @userRole)
        AND IsActive = 1
    `;

    const result = await sql.query(query, {
      workflowId: workflowId || req.body.workflowId,
      userId,
      userRole: req.user.role
    });

    if (result.recordset[0].count > 0) {
      return next();
    }

    // 檢查是否有委派權限
    const delegationQuery = `
      SELECT COUNT(*) as count
      FROM ApprovalDelegations
      WHERE DelegatorUserId = @userId
        AND IsActive = 1
        AND (StartDate IS NULL OR StartDate <= GETDATE())
        AND (EndDate IS NULL OR EndDate >= GETDATE())
    `;

    const delegationResult = await sql.query(delegationQuery, { userId });

    if (delegationResult.recordset[0].count > 0) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: '您沒有權限執行此審核操作'
    });

  } catch (error) {
    console.error('審核權限檢查錯誤:', error);
    return res.status(500).json({
      success: false,
      message: '權限檢查失敗'
    });
  }
};

/**
 * 檢查用戶是否可以提交審核
 */
const checkSubmissionPermission = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { campaignId } = req.params;

    // 檢查用戶是否為活動創建者或有編輯權限
    const query = `
      SELECT CreatedBy, Status
      FROM Campaigns
      WHERE Id = @campaignId
    `;

    const result = await sql.query(query, { campaignId });

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: '活動不存在'
      });
    }

    const campaign = result.recordset[0];

    // 檢查是否為創建者或管理員
    if (campaign.CreatedBy === userId || req.user.role === 'admin') {
      // 檢查活動狀態是否允許提交審核
      if (['draft', 'rejected'].includes(campaign.Status)) {
        return next();
      } else {
        return res.status(400).json({
          success: false,
          message: '活動當前狀態不允許提交審核'
        });
      }
    }

    return res.status(403).json({
      success: false,
      message: '您沒有權限提交此活動的審核'
    });

  } catch (error) {
    console.error('提交權限檢查錯誤:', error);
    return res.status(500).json({
      success: false,
      message: '權限檢查失敗'
    });
  }
};

/**
 * 檢查審核狀態
 */
const checkApprovalStatus = async (req, res, next) => {
  try {
    const { campaignId } = req.params;

    const query = `
      SELECT Status, CurrentStepId
      FROM CampaignApprovals
      WHERE CampaignId = @campaignId
        AND IsActive = 1
    `;

    const result = await sql.query(query, { campaignId });

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: '找不到審核記錄'
      });
    }

    const approval = result.recordset[0];
    req.approvalStatus = approval;

    return next();

  } catch (error) {
    console.error('審核狀態檢查錯誤:', error);
    return res.status(500).json({
      success: false,
      message: '狀態檢查失敗'
    });
  }
};

/**
 * 檢查用戶是否可以查看審核詳情
 */
const checkViewPermission = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { campaignId } = req.params;

    // 管理員可以查看所有審核
    if (req.user.role === 'admin') {
      return next();
    }

    // 檢查是否為活動創建者
    const campaignQuery = `
      SELECT CreatedBy
      FROM Campaigns
      WHERE Id = @campaignId
    `;

    const campaignResult = await sql.query(campaignQuery, { campaignId });

    if (campaignResult.recordset.length > 0 && 
        campaignResult.recordset[0].CreatedBy === userId) {
      return next();
    }

    // 檢查是否為審核者
    const approverQuery = `
      SELECT COUNT(*) as count
      FROM CampaignApprovals ca
      JOIN ApprovalSteps ast ON ca.WorkflowId = ast.WorkflowId
      WHERE ca.CampaignId = @campaignId
        AND (ast.ApproverUserId = @userId OR ast.ApproverRole = @userRole)
        AND ca.IsActive = 1
    `;

    const approverResult = await sql.query(approverQuery, {
      campaignId,
      userId,
      userRole: req.user.role
    });

    if (approverResult.recordset[0].count > 0) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: '您沒有權限查看此審核詳情'
    });

  } catch (error) {
    console.error('查看權限檢查錯誤:', error);
    return res.status(500).json({
      success: false,
      message: '權限檢查失敗'
    });
  }
};

module.exports = {
  checkApprovalPermission,
  checkSubmissionPermission,
  checkApprovalStatus,
  checkViewPermission
};