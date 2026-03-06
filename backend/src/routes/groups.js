const express = require('express');
const { executeQuery, executeTransaction, sql } = require('../config/database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { validate, groupValidations, queryValidations } = require('../middleware/validation');
const { asyncHandler, AppError } = require('../middleware/errorHandler');

const router = express.Router();

// 所有路由都需要認證
router.use(authenticateToken);

// 獲取群組列表
router.get('/',
  validate(queryValidations.pagination, 'query'),
  asyncHandler(async (req, res) => {
    const { 
      page = 1, 
      limit = 10, 
      sortBy = 'created_at', 
      sortOrder = 'desc',
      search,
      isActive
    } = req.query;
    
    const offset = (page - 1) * limit;

    // 建構查詢條件
    let whereClause = 'WHERE 1=1';
    const params = {};

    if (search) {
      whereClause += ' AND (group_name LIKE @search OR description LIKE @search)';
      params.search = `%${search}%`;
    }

    if (isActive !== undefined) {
      whereClause += ' AND is_active = @isActive';
      params.isActive = isActive === 'true';
    }

    // 獲取總數
    const countQuery = `SELECT COUNT(*) as total FROM SubscriberGroups ${whereClause}`;
    const countResult = await executeQuery(countQuery, params);
    const total = countResult.recordset[0].total;

    // 獲取群組列表
    const query = `
      SELECT 
        sg.id, sg.group_name, sg.description, sg.is_active, 
        sg.created_at, sg.updated_at,
        COUNT(sgm.subscriber_id) as MemberCount
      FROM SubscriberGroups sg
      LEFT JOIN SubscriberGroupMembers sgm ON sg.id = sgm.group_id
      ${whereClause}
      GROUP BY sg.id, sg.group_name, sg.description, sg.is_active, sg.created_at, sg.updated_at
      ORDER BY ${sortBy} ${sortOrder}
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `;

    const result = await executeQuery(query, {
      ...params,
      offset,
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      data: {
        groups: result.recordset.map(group => ({
          id: group.id,
          name: group.group_name,
          description: group.description,
          isActive: group.is_active,
          memberCount: group.MemberCount,
          createdAt: group.created_at,
          updatedAt: group.updated_at
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  })
);

// 獲取單一群組
router.get('/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const query = `
      SELECT 
        sg.id, sg.group_name, sg.description, sg.is_active, 
        sg.created_at, sg.updated_at,
        COUNT(sgm.subscriber_id) as MemberCount
      FROM SubscriberGroups sg
      LEFT JOIN SubscriberGroupMembers sgm ON sg.id = sgm.group_id
      WHERE sg.id = @id
      GROUP BY sg.id, sg.group_name, sg.description, sg.is_active, sg.created_at, sg.updated_at
    `;

    const result = await executeQuery(query, { id });

    if (result.recordset.length === 0) {
      throw new AppError('群組不存在', 404);
    }

    const group = result.recordset[0];

    res.json({
      success: true,
      data: {
        group: {
          id: group.id,
          name: group.group_name,
          description: group.description,
          isActive: group.is_active,
          memberCount: group.MemberCount,
          createdAt: group.created_at,
          updatedAt: group.updated_at
        }
      }
    });
  })
);

// 建立新群組
router.post('/',
  validate(groupValidations.create),
  asyncHandler(async (req, res) => {
    const { name, description, isActive = true } = req.body;

    // 檢查群組名稱是否已存在
    const existingGroup = await executeQuery(
      'SELECT id FROM SubscriberGroups WHERE group_name = @name',
      { name }
    );

    if (existingGroup.recordset.length > 0) {
      throw new AppError('群組名稱已存在', 400);
    }

    // 建立新群組
    const insertQuery = `
      INSERT INTO SubscriberGroups (group_name, description, is_active)
      OUTPUT INSERTED.id, INSERTED.group_name, INSERTED.description, 
             INSERTED.is_active, INSERTED.created_at
      VALUES (@name, @description, @isActive)
    `;

    const result = await executeQuery(insertQuery, {
      name,
      description,
      isActive
    });

    const newGroup = result.recordset[0];

    res.status(201).json({
      success: true,
      message: '群組建立成功',
      data: {
        group: {
          id: newGroup.id,
          name: newGroup.group_name,
          description: newGroup.description,
          isActive: newGroup.is_active,
          createdAt: newGroup.created_at
        }
      }
    });
  })
);

// 更新群組
router.put('/:id',
  validate(groupValidations.update),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, description, isActive } = req.body;

    // 建構更新欄位
    const updateFields = [];
    const params = { id };

    if (name !== undefined) {
      // 檢查群組名稱是否已存在（排除自己）
      const existingGroup = await executeQuery(
        'SELECT id FROM SubscriberGroups WHERE group_name = @name AND id != @id',
        { name, id }
      );

      if (existingGroup.recordset.length > 0) {
        throw new AppError('群組名稱已存在', 400);
      }

      updateFields.push('group_name = @name');
      params.name = name;
    }

    if (description !== undefined) {
      updateFields.push('description = @description');
      params.description = description;
    }

    if (isActive !== undefined) {
      updateFields.push('is_active = @isActive');
      params.isActive = isActive;
    }

    if (updateFields.length === 0) {
      throw new AppError('沒有提供要更新的欄位', 400);
    }

    updateFields.push('updated_at = GETDATE()');

    const updateQuery = `
      UPDATE SubscriberGroups 
      SET ${updateFields.join(', ')}
      OUTPUT INSERTED.id, INSERTED.group_name, INSERTED.description, INSERTED.is_active
      WHERE id = @id
    `;

    const result = await executeQuery(updateQuery, params);

    if (result.recordset.length === 0) {
      throw new AppError('群組不存在', 404);
    }

    const updatedGroup = result.recordset[0];

    res.json({
      success: true,
      message: '群組更新成功',
      data: {
        group: {
          id: updatedGroup.id,
          name: updatedGroup.group_name,
          description: updatedGroup.description,
          isActive: updatedGroup.is_active
        }
      }
    });
  })
);

// 刪除群組
router.delete('/:id',
  authorizeRoles('Admin', 'Manager'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // 檢查群組是否有成員
    const memberCheck = await executeQuery(
      'SELECT COUNT(*) as count FROM SubscriberGroupMembers WHERE group_id = @id',
      { id }
    );

    if (memberCheck.recordset[0].count > 0) {
      throw new AppError('無法刪除有成員的群組，請先移除所有成員', 400);
    }

    const deleteQuery = 'DELETE FROM SubscriberGroups WHERE id = @id';
    const result = await executeQuery(deleteQuery, { id });

    if (result.rowsAffected[0] === 0) {
      throw new AppError('群組不存在', 404);
    }

    res.json({
      success: true,
      message: '群組刪除成功'
    });
  })
);

// 獲取群組成員
router.get('/:id/members',
  validate(queryValidations.pagination, 'query'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { page = 1, limit = 10, search } = req.query;
    const offset = (page - 1) * limit;

    // 檢查群組是否存在
    const groupCheck = await executeQuery(
      'SELECT id FROM SubscriberGroups WHERE id = @id',
      { id }
    );

    if (groupCheck.recordset.length === 0) {
      throw new AppError('群組不存在', 404);
    }

    // 建構查詢條件
    let whereClause = 'WHERE sgm.group_id = @id';
    const params = { id };

    if (search) {
      whereClause += ' AND (s.email LIKE @search OR s.first_name LIKE @search OR s.last_name LIKE @search)';
      params.search = `%${search}%`;
    }

    // 獲取總數
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM SubscriberGroupMembers sgm
      INNER JOIN Subscribers s ON sgm.subscriber_id = s.id
      ${whereClause}
    `;
    const countResult = await executeQuery(countQuery, params);
    const total = countResult.recordset[0].total;

    // 獲取成員列表
    const query = `
      SELECT 
        s.id, s.email, s.first_name, s.last_name, s.status,
        sgm.joined_at
      FROM SubscriberGroupMembers sgm
      INNER JOIN Subscribers s ON sgm.subscriber_id = s.id
      ${whereClause}
      ORDER BY sgm.joined_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `;

    const result = await executeQuery(query, {
      ...params,
      offset,
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      data: {
        members: result.recordset.map(member => ({
          id: member.id,
          email: member.email,
          firstName: member.first_name,
          lastName: member.last_name,
          status: member.status,
          joinedAt: member.joined_at
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  })
);

// 新增成員到群組
router.post('/:id/members',
  validate(groupValidations.addMembers),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { subscriberIds } = req.body;

    // 檢查群組是否存在
    const groupCheck = await executeQuery(
      'SELECT id FROM SubscriberGroups WHERE id = @id',
      { id }
    );

    if (groupCheck.recordset.length === 0) {
      throw new AppError('群組不存在', 404);
    }

    // 檢查訂閱者是否存在
    const subscriberCheck = await executeQuery(
      `SELECT id FROM Subscribers WHERE id IN (${subscriberIds.map((_, i) => `@id${i}`).join(',')})`,
      subscriberIds.reduce((acc, id, i) => ({ ...acc, [`id${i}`]: id }), {})
    );

    if (subscriberCheck.recordset.length !== subscriberIds.length) {
      throw new AppError('部分訂閱者不存在', 400);
    }

    // 檢查哪些成員已經在群組中
    const existingMembers = await executeQuery(
      `SELECT subscriber_id FROM SubscriberGroupMembers WHERE group_id = @groupId AND subscriber_id IN (${subscriberIds.map((_, i) => `@id${i}`).join(',')})`,
      {
        groupId: id,
        ...subscriberIds.reduce((acc, id, i) => ({ ...acc, [`id${i}`]: id }), {})
      }
    );

    const existingIds = existingMembers.recordset.map(m => m.subscriber_id);
    const newMemberIds = subscriberIds.filter(id => !existingIds.includes(id));

    if (newMemberIds.length === 0) {
      throw new AppError('所有訂閱者都已在群組中', 400);
    }

    // 新增成員
    const operations = newMemberIds.map(subscriberId => ({
      query: 'INSERT INTO SubscriberGroupMembers (group_id, subscriber_id) VALUES (@groupId, @subscriberId)',
      params: { groupId: id, subscriberId }
    }));

    await executeTransaction(operations);

    res.json({
      success: true,
      message: `成功新增 ${newMemberIds.length} 位成員到群組`,
      data: {
        addedCount: newMemberIds.length,
        skippedCount: existingIds.length
      }
    });
  })
);

// 從群組移除成員
router.delete('/:id/members',
  validate(groupValidations.removeMembers),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { subscriberIds } = req.body;

    const deleteQuery = `
      DELETE FROM SubscriberGroupMembers 
      WHERE group_id = @groupId AND subscriber_id IN (${subscriberIds.map((_, i) => `@id${i}`).join(',')})
    `;

    const result = await executeQuery(deleteQuery, {
      groupId: id,
      ...subscriberIds.reduce((acc, id, i) => ({ ...acc, [`id${i}`]: id }), {})
    });

    res.json({
      success: true,
      message: `成功移除 ${result.rowsAffected[0]} 位成員`,
      data: {
        removedCount: result.rowsAffected[0]
      }
    });
  })
);

// 清空群組成員
router.delete('/:id/members/all',
  authorizeRoles('Admin', 'Manager'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const deleteQuery = 'DELETE FROM SubscriberGroupMembers WHERE group_id = @id';
    const result = await executeQuery(deleteQuery, { id });

    res.json({
      success: true,
      message: `成功清空群組，移除 ${result.rowsAffected[0]} 位成員`,
      data: {
        removedCount: result.rowsAffected[0]
      }
    });
  })
);

// 根據條件自動新增成員
router.post('/:id/auto-add',
  authorizeRoles('Admin', 'Manager'),
  validate(groupValidations.autoAdd),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { criteria } = req.body;

    // 建構查詢條件
    let whereClause = 'WHERE s.status = \'active\'';
    const params = {};

    if (criteria.country) {
      whereClause += ' AND s.country = @country';
      params.country = criteria.country;
    }

    if (criteria.city) {
      whereClause += ' AND s.city = @city';
      params.city = criteria.city;
    }

    if (criteria.categoryGroup && criteria.categoryGroup !== 'all') {
      whereClause += ' AND EXISTS (SELECT 1 FROM SubscriberCategories sc JOIN Categories c ON sc.category_id = c.id WHERE sc.subscriber_id = s.id AND c.hierarchy_type = @categoryGroup)';
      params.categoryGroup = criteria.categoryGroup;
    }

    if (criteria.categoryIds && Array.isArray(criteria.categoryIds) && criteria.categoryIds.length > 0) {
      const categoryIds = criteria.categoryIds.map(id => parseInt(id)).filter(id => !isNaN(id));
      if (categoryIds.length > 0) {
        whereClause += ` AND EXISTS (SELECT 1 FROM SubscriberCategories sc WHERE sc.subscriber_id = s.id AND sc.category_id IN (${categoryIds.join(',')}))`;
      }
    }

    if (criteria.tags && criteria.tags.length > 0) {
      const tagConditions = criteria.tags.map((tag, i) => {
        params[`tag${i}`] = `%"${tag}"%`;
        return `s.tags LIKE @tag${i}`;
      });
      whereClause += ` AND (${tagConditions.join(' OR ')})`;
    }

    if (criteria.subscribedAfter) {
      whereClause += ' AND s.subscribed_at >= @subscribedAfter';
      params.subscribedAfter = criteria.subscribedAfter;
    }

    if (criteria.subscribedBefore) {
      whereClause += ' AND s.subscribed_at <= @subscribedBefore';
      params.subscribedBefore = criteria.subscribedBefore;
    }

    // 排除已在群組中的成員
    whereClause += ` AND s.id NOT IN (
      SELECT subscriber_id FROM SubscriberGroupMembers WHERE group_id = @groupId
    )`;
    params.groupId = id;

    // 獲取符合條件的訂閱者
    const query = `
      SELECT s.id
      FROM Subscribers s
      ${whereClause}
    `;

    const result = await executeQuery(query, params);
    const subscriberIds = result.recordset.map(r => r.id);

    if (subscriberIds.length === 0) {
      return res.json({
        success: true,
        message: '沒有找到符合條件的新成員',
        data: { addedCount: 0 }
      });
    }

    // 批量新增成員
    const operations = subscriberIds.map(subscriberId => ({
      query: 'INSERT INTO SubscriberGroupMembers (group_id, subscriber_id) VALUES (@groupId, @subscriberId)',
      params: { groupId: id, subscriberId }
    }));

    await executeTransaction(operations);

    res.json({
      success: true,
      message: `根據條件自動新增 ${subscriberIds.length} 位成員`,
      data: {
        addedCount: subscriberIds.length
      }
    });
  })
);

module.exports = router;