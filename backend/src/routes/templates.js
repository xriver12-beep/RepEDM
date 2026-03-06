const express = require('express');
const axios = require('axios');
const { executeQuery, executeTransaction, sql } = require('../config/database');
const { authenticateToken, authorizeRoles, checkResourceOwner } = require('../middleware/auth');
const { validate, templateValidations, queryValidations } = require('../middleware/validation');
const { asyncHandler, AppError } = require('../middleware/errorHandler');

const router = express.Router();

// 所有路由都需要認證
router.use(authenticateToken);

// 獲取EDM列表
router.get('/',
  validate(queryValidations.templateFilter, 'query'),
  asyncHandler(async (req, res) => {
    const { 
      page = 1, 
      limit = 10, 
      sortBy = 'created_at', 
      sortOrder = 'desc',
      templateType,
      isActive,
      search,
      categoryId,
      scope = 'all' // all, my, public
    } = req.query;
    
    const offset = (page - 1) * limit;

    // 建構查詢條件
    let whereClause = 'WHERE 1=1';
    const params = {};

    if (templateType) {
      whereClause += ' AND t.template_type = @templateType';
      params.templateType = templateType;
    }

    if (isActive !== undefined) {
      whereClause += ' AND t.is_active = @isActive';
      params.isActive = isActive === 'true' ? 1 : 0;
    }
    
    if (categoryId) {
        whereClause += ' AND t.category_id = @categoryId';
        params.categoryId = categoryId;
    }

    if (search) {
      whereClause += ' AND (t.name LIKE @search OR t.subject LIKE @search)';
      params.search = `%${search}%`;
    }

    // 權限與範圍控制
    if (['admin', 'manager'].includes(req.user.role)) {
        // 管理員可以看到所有，但如果指定 scope=my，則只看自己的
        if (scope === 'my') {
            whereClause += ' AND t.created_by = @userId';
            params.userId = req.user.userId;
        }
        // scope=public or all, admin sees all
    } else {
        // 一般用戶
        if (scope === 'my') {
             whereClause += ' AND t.created_by = @userId';
             params.userId = req.user.userId;
        } else if (scope === 'public') {
             whereClause += ' AND t.is_public = 1';
        } else {
             // 默認顯示自己的 + 公開的
             whereClause += ' AND (t.created_by = @userId OR t.is_public = 1)';
             params.userId = req.user.userId;
        }
    }

    // 獲取總數
    const countQuery = `SELECT COUNT(*) as total FROM Templates t ${whereClause}`;
    const countResult = await executeQuery(countQuery, params);
    const total = countResult.recordset[0].total;

    // 獲取EDM列表
    const query = `
      SELECT 
        t.id, t.name, t.subject, t.template_type, 
        t.is_active, t.created_by, t.is_public, t.category_id,
        t.created_at, t.updated_at, t.main_image,
        u.full_name as created_by_name,
        c.name as category_name
      FROM Templates t
      LEFT JOIN Users u ON t.created_by = u.id
      LEFT JOIN TemplateCategories c ON t.category_id = c.id
      ${whereClause}
      ORDER BY t.${sortBy} ${sortOrder}
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
        templates: result.recordset.map(template => ({
          id: template.id,
          name: template.name,
          subject: template.subject,
          templateType: template.template_type,
          isActive: template.is_active,
          isPublic: template.is_public,
          categoryId: template.category_id,
          categoryName: template.category_name,
          createdBy: template.created_by,
          createdByName: template.created_by_name,
          createdAt: template.created_at,
          updatedAt: template.updated_at,
          mainImage: template.main_image
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  })
);

// 獲取EDM分類列表
router.get('/categories',
  asyncHandler(async (req, res) => {
    const query = `
      SELECT id, name, description, is_system, created_by
      FROM TemplateCategories
      ORDER BY is_system DESC, name ASC
    `;
    const result = await executeQuery(query);

    res.json({
      success: true,
      data: result.recordset
    });
  })
);

// 新增EDM分類
router.post('/categories',
  asyncHandler(async (req, res) => {
    const { name, description } = req.body;
    const userId = req.user.userId;

    if (!name) {
      throw new AppError('請輸入分類名稱', 400);
    }

    // Check duplicate
    const checkQuery = `SELECT id FROM TemplateCategories WHERE name = @name`;
    const checkResult = await executeQuery(checkQuery, { name });
    if (checkResult.recordset.length > 0) {
        throw new AppError('分類名稱已存在', 400);
    }

    const query = `
      INSERT INTO TemplateCategories (name, description, is_system, created_by)
      OUTPUT INSERTED.id
      VALUES (@name, @description, 0, @userId)
    `;
    
    const result = await executeQuery(query, {
      name,
      description,
      userId
    });

    res.status(201).json({
      success: true,
      data: {
        id: result.recordset[0].id,
        name,
        description,
        isSystem: false
      }
    });
  })
);

// 刪除EDM分類
router.delete('/categories/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Check if system category
    const checkQuery = `SELECT is_system FROM TemplateCategories WHERE id = @id`;
    const checkResult = await executeQuery(checkQuery, { id });
    
    if (checkResult.recordset.length === 0) {
        throw new AppError('分類不存在', 404);
    }
    
    if (checkResult.recordset[0].is_system) {
        throw new AppError('無法刪除系統預設分類', 403);
    }

    // Check if used
    const useQuery = `SELECT COUNT(*) as count FROM Templates WHERE category_id = @id`;
    const useResult = await executeQuery(useQuery, { id });
    if (useResult.recordset[0].count > 0) {
        throw new AppError('此分類下仍有EDM，無法刪除', 400);
    }

    const deleteQuery = `DELETE FROM TemplateCategories WHERE id = @id`;
    await executeQuery(deleteQuery, { id });

    res.json({
      success: true,
      message: '分類已刪除'
    });
  })
);

// 獲取EDM統計數據
router.get('/stats', asyncHandler(async (req, res) => {
    const query = `
        SELECT 
            COUNT(*) as total,
            COUNT(CASE WHEN is_public = 1 THEN 1 END) as published,
            COUNT(CASE WHEN is_public = 0 THEN 1 END) as drafts,
            (SELECT COUNT(DISTINCT template_id) FROM Campaigns WHERE template_id IS NOT NULL) as used
        FROM Templates
    `;
    
    const result = await executeQuery(query);
    const stats = result.recordset[0];
    
    res.json({
        success: true,
        data: {
            total: stats.total || 0,
            published: stats.published || 0,
            drafts: stats.drafts || 0,
            used: stats.used || 0
        }
    });
}));

// 獲取單個EDM詳情
router.get('/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    const query = `
      SELECT 
        t.*,
        u.full_name as created_by_name,
        c.name as category_name
      FROM Templates t
      LEFT JOIN Users u ON t.created_by = u.id
      LEFT JOIN TemplateCategories c ON t.category_id = c.id
      WHERE t.id = @id
    `;

    const result = await executeQuery(query, { id });

    if (result.recordset.length === 0) {
      throw new AppError('EDM不存在', 404);
    }

    const template = result.recordset[0];

    // 檢查權限
    if (!['admin', 'manager'].includes(userRole) && template.created_by !== userId && !template.is_public) {
      throw new AppError('沒有權限查看此EDM', 403);
    }

    res.json({
      success: true,
      data: {
        id: template.id,
        name: template.name,
        subject: template.subject,
        htmlContent: template.html_content,
        textContent: template.text_content,
        templateType: template.template_type,
        isActive: template.is_active,
        isPublic: template.is_public,
        categoryId: template.category_id,
        createdBy: template.created_by,
        createdByName: template.created_by_name,
        createdAt: template.created_at,
        updatedAt: template.updated_at,
        mainImage: template.main_image
      }
    });
  })
);

// 創建新EDM
router.post('/',
  validate(templateValidations.create),
  asyncHandler(async (req, res) => {
    const {
      name,
      subject,
      htmlContent,
      textContent,
      templateType = 'email',
      categoryId,
      isPublic = false,
      mainImage
    } = req.body;

    const userId = req.user.userId;

    // 檢查EDM名稱是否重複
    const existingQuery = `
      SELECT id FROM Templates WHERE name = @name AND created_by = @userId
    `;
    const existingResult = await executeQuery(existingQuery, { name, userId });

    if (existingResult.recordset.length > 0) {
      throw new AppError('EDM名稱已存在', 400);
    }

    // 創建EDM
    const insertQuery = `
      INSERT INTO Templates (
        name, subject, html_content, text_content, template_type, created_by, category_id, is_public, main_image
      )
      OUTPUT INSERTED.id
      VALUES (
        @name, @subject, @htmlContent, @textContent, @templateType, @userId, @categoryId, @isPublic, @mainImage
      )
    `;

    const result = await executeQuery(insertQuery, {
      name,
      subject,
      htmlContent,
      textContent,
      templateType,
      userId,
      categoryId: categoryId || null,
      isPublic: isPublic ? 1 : 0,
      mainImage
    });

    const templateId = result.recordset[0].id;

    res.status(201).json({
      success: true,
      message: 'EDM創建成功',
      data: { id: templateId }
    });
  })
);

// 更新EDM
router.put('/:id',
  validate(templateValidations.update),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    // 檢查EDM是否存在
    const checkQuery = `
      SELECT id, created_by FROM Templates WHERE id = @id
    `;
    const checkResult = await executeQuery(checkQuery, { id });

    if (checkResult.recordset.length === 0) {
      throw new AppError('EDM不存在', 404);
    }

    const template = checkResult.recordset[0];

    // 檢查權限
    if (!['admin', 'manager'].includes(userRole) && template.created_by !== userId) {
      throw new AppError('沒有權限修改此EDM', 403);
    }

    const {
      name,
      subject,
      htmlContent,
      textContent,
      templateType,
      isActive,
      categoryId,
      isPublic,
      mainImage
    } = req.body;

    // 如果要修改名稱，檢查新名稱是否重複
    if (name) {
      const existingQuery = `
        SELECT id FROM Templates 
        WHERE name = @name 
        AND created_by = @userId 
        AND id != @id
      `;
      const existingResult = await executeQuery(existingQuery, { name, userId, id });

      if (existingResult.recordset.length > 0) {
        throw new AppError('EDM名稱已存在', 400);
      }
    }

    // 建構更新查詢
    const updateFields = [];
    const params = { id };

    if (name !== undefined) {
      updateFields.push('name = @name');
      params.name = name;
    }
    if (subject !== undefined) {
      updateFields.push('subject = @subject');
      params.subject = subject;
    }
    if (htmlContent !== undefined) {
      updateFields.push('html_content = @htmlContent');
      params.htmlContent = htmlContent;
    }
    if (textContent !== undefined) {
      updateFields.push('text_content = @textContent');
      params.textContent = textContent;
    }
    if (templateType !== undefined) {
      updateFields.push('template_type = @templateType');
      params.templateType = templateType;
    }
    if (isActive !== undefined) {
      updateFields.push('is_active = @isActive');
      params.isActive = isActive ? 1 : 0;
    }
    if (categoryId !== undefined) {
      updateFields.push('category_id = @categoryId');
      params.categoryId = categoryId || null;
    }
    if (isPublic !== undefined) {
      updateFields.push('is_public = @isPublic');
      params.isPublic = isPublic ? 1 : 0;
    }
    if (mainImage !== undefined) {
        updateFields.push('main_image = @mainImage');
        params.mainImage = mainImage;
    }

    if (updateFields.length === 0) {
      throw new AppError('沒有提供要更新的欄位', 400);
    }

    updateFields.push('updated_at = GETDATE()');

    const updateQuery = `
      UPDATE Templates
      SET ${updateFields.join(', ')}
      WHERE id = @id
    `;

    await executeQuery(updateQuery, params);

    res.json({
      success: true,
      message: 'EDM更新成功'
    });
  })
);

// 刪除EDM
router.delete('/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    // 檢查EDM是否存在
    const checkQuery = `
      SELECT id, created_by FROM Templates WHERE id = @id
    `;
    const checkResult = await executeQuery(checkQuery, { id });

    if (checkResult.recordset.length === 0) {
      throw new AppError('EDM不存在', 404);
    }

    const template = checkResult.recordset[0];

    // 檢查權限
    // Admin 角色 (通常是 'Admin' 或 'admin') 應該有權限刪除任何EDM
    // 這裡使用更寬鬆的檢查，將 userRole 轉為小寫
    const normalizedRole = userRole ? userRole.toLowerCase() : '';
    
    if (!['admin', 'manager'].includes(normalizedRole) && template.created_by !== userId) {
      console.log(`Permission denied for user ${userId} (Role: ${userRole}) deleting template ${id} (Created by: ${template.created_by})`);
      throw new AppError('沒有權限刪除此EDM', 403);
    }

    // 刪除EDM (使用交易確保資料一致性)
    // 1. 先將相關活動的 template_id 設為 NULL (保留活動記錄但移除關聯)
    // 2. 刪除EDM
    await executeTransaction([
        {
            query: 'UPDATE Campaigns SET template_id = NULL WHERE template_id = @id',
            params: { id }
        },
        {
            query: 'DELETE FROM Templates WHERE id = @id',
            params: { id }
        }
    ]);

    res.json({
      success: true,
      message: 'EDM刪除成功'
    });
  })
);

// 複製EDM
router.post('/:id/duplicate',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    const userId = req.user.userId;

    // 獲取原EDM
    const originalQuery = `
      SELECT name, subject, html_content, text_content, template_type
      FROM Templates 
      WHERE id = @id
    `;
    const originalResult = await executeQuery(originalQuery, { id });

    if (originalResult.recordset.length === 0) {
      throw new AppError('原EDM不存在', 404);
    }

    const template = originalResult.recordset[0];
    const newName = name || `${template.name} (副本)`;

    // 檢查新名稱是否已存在
    const existingQuery = `
      SELECT id FROM Templates WHERE name = @name AND created_by = @userId
    `;
    const existingResult = await executeQuery(existingQuery, { name: newName, userId });

    if (existingResult.recordset.length > 0) {
      throw new AppError('EDM名稱已存在', 400);
    }

    // 創建複製EDM
    const insertQuery = `
      INSERT INTO Templates (
        name, subject, html_content, text_content, template_type, created_by
      )
      OUTPUT INSERTED.id
      VALUES (
        @name, @subject, @htmlContent, @textContent, @templateType, @userId
      )
    `;

    const result = await executeQuery(insertQuery, {
      name: newName,
      subject: template.subject,
      htmlContent: template.html_content,
      textContent: template.text_content,
      templateType: template.template_type,
      userId
    });

    const newTemplateId = result.recordset[0].id;

    res.status(201).json({
      success: true,
      message: 'EDM複製成功',
      data: {
        id: newTemplateId,
        name: newName
      }
    });
  })
);

// 獲取EDM類型列表
router.get('/types/list',
  asyncHandler(async (req, res) => {
    const query = `
      SELECT DISTINCT template_type as type, COUNT(*) as count
      FROM Templates
      WHERE is_active = 1
      GROUP BY template_type
      ORDER BY template_type
    `;

    const result = await executeQuery(query);

    res.json({
      success: true,
      data: {
        types: result.recordset.map(row => ({
          type: row.type,
          count: row.count
        }))
      }
    });
  })
);

// 預覽EDM
router.get('/:id/preview',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { format = 'html' } = req.query;

    const query = `
      SELECT name, subject, html_content, text_content
      FROM Templates
      WHERE id = @id AND is_active = 1
    `;

    const result = await executeQuery(query, { id });

    if (result.recordset.length === 0) {
      throw new AppError('EDM不存在或已停用', 404);
    }

    const template = result.recordset[0];

    if (format === 'text') {
      res.type('text/plain');
      res.send(template.text_content || '');
    } else {
      res.type('text/html');
      res.send(template.html_content || '');
    }
  })
);

// 匯出EDM
router.get('/:id/export',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    const query = `
      SELECT *
      FROM Templates
      WHERE id = @id
    `;

    const result = await executeQuery(query, { id });

    if (result.recordset.length === 0) {
      throw new AppError('EDM不存在', 404);
    }

    const template = result.recordset[0];

    // 檢查權限
    if (!['admin', 'manager'].includes(userRole) && template.created_by !== userId) {
      throw new AppError('沒有權限匯出此EDM', 403);
    }

    const exportData = {
      name: template.name,
      subject: template.subject,
      htmlContent: template.html_content,
      textContent: template.text_content,
      templateType: template.template_type,
      exportedAt: new Date().toISOString(),
      version: '1.0'
    };

    res.setHeader('Content-Disposition', `attachment; filename="${template.name}.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(exportData);
  })
);

// 匯入EDM
router.post('/import',
  validate(templateValidations.import),
  asyncHandler(async (req, res) => {
    const { templateData, name } = req.body;
    const userId = req.user.userId;

    const templateName = name || templateData.name;

    // 檢查EDM名稱是否已存在
    const existingQuery = `
      SELECT id FROM Templates WHERE name = @name AND created_by = @userId
    `;
    const existingResult = await executeQuery(existingQuery, { name: templateName, userId });

    if (existingResult.recordset.length > 0) {
      throw new AppError('EDM名稱已存在', 400);
    }

    // 創建匯入的EDM
    const insertQuery = `
      INSERT INTO Templates (
        name, subject, html_content, text_content, template_type, created_by
      )
      OUTPUT INSERTED.id
      VALUES (
        @name, @subject, @htmlContent, @textContent, @templateType, @userId
      )
    `;

    const result = await executeQuery(insertQuery, {
      name: templateName,
      subject: templateData.subject,
      htmlContent: templateData.htmlContent,
      textContent: templateData.textContent,
      templateType: templateData.templateType || 'email',
      userId
    });

    const templateId = result.recordset[0].id;

    res.status(201).json({
      success: true,
      message: 'EDM匯入成功',
      data: { id: templateId }
    });
  })
);

const iconv = require('iconv-lite');
const jschardet = require('jschardet');

// 抓取外部 URL 內容
router.post('/fetch-url', asyncHandler(async (req, res) => {
    const { url } = req.body;
    if (!url) {
        throw new AppError('請提供 URL', 400);
    }

    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const contentType = response.headers['content-type'];
        
        if (contentType && contentType.includes('image')) {
            const base64 = Buffer.from(response.data, 'binary').toString('base64');
            const mimeType = contentType;
            res.json({
                success: true,
                data: {
                    type: 'image',
                    content: `data:${mimeType};base64,${base64}`
                }
            });
        } else {
            // Detect encoding
            const buffer = Buffer.from(response.data);
            const detected = jschardet.detect(buffer);
            let encoding = detected.encoding || 'utf-8';
            
            // Check content-type header for charset
            if (contentType && contentType.includes('charset=')) {
                const charsetMatch = contentType.match(/charset=([^;]+)/i);
                if (charsetMatch) {
                    encoding = charsetMatch[1];
                }
            }

            // Normalization & Heuristics
            const isTW = url.includes('.tw') || url.includes('.TW');
            
            if (encoding.toLowerCase() === 'windows-1252' && isTW) {
                console.log('Detected windows-1252 for .tw domain, forcing Big5');
                encoding = 'big5';
            }

            // Sometimes jschardet returns 'ascii' for Big5 content if it's mostly english tags
            // We can check if there are high bytes that are valid Big5
            
            console.log(`URL: ${url}, Detected Encoding: ${detected.encoding}, Final Encoding: ${encoding}`);

            // Decode
            let text;
            try {
                if (iconv.encodingExists(encoding)) {
                    text = iconv.decode(buffer, encoding);
                } else {
                    text = iconv.decode(buffer, 'utf-8'); // Fallback
                }
            } catch (err) {
                console.warn('Decoding failed, fallback to utf-8', err);
                text = buffer.toString('utf-8');
            }

            // URL Rewriting to Absolute
            try {
                // Determine base URL
                let baseUrl = url;
                // If it doesn't end with /, assume it's a file and strip the filename
                if (!baseUrl.endsWith('/')) {
                    baseUrl = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
                }

                const makeAbsolute = (relative) => {
                    try {
                        // Skip if already absolute or special protocol
                        if (!relative || relative.match(/^(https?:|data:|#|mailto:|tel:|\/\/)/i)) {
                            return relative;
                        }
                        return new URL(relative, baseUrl).href;
                    } catch (e) {
                        return relative;
                    }
                };

                // Replace src, href, action, background (for tables)
                // 1. Quoted attributes
                text = text.replace(/(src|href|action|background)\s*=\s*(["'])([^"']+)\2/gi, (match, attr, quote, value) => {
                    return `${attr}=${quote}${makeAbsolute(value)}${quote}`;
                });

                // 2. Unquoted attributes (less common but possible in old HTML)
                text = text.replace(/(src|href|action|background)\s*=\s*([^"'\s>]+)/gi, (match, attr, value) => {
                    return `${attr}="${makeAbsolute(value)}"`;
                });

                // Replace url(...) in CSS
                text = text.replace(/url\(\s*(['"]?)([^'"\)]+)\1\s*\)/gi, (match, quote, value) => {
                    return `url(${quote}${makeAbsolute(value)}${quote})`;
                });
                
                console.log(`Rewrote URLs with base: ${baseUrl}`);

            } catch (rewriteErr) {
                console.error('URL rewriting failed:', rewriteErr);
                // Continue with original text if rewrite fails
            }

            res.json({
                success: true,
                data: {
                    type: 'html',
                    content: text,
                    detectedEncoding: encoding
                }
            });
        }
    } catch (error) {
        console.error('Fetch URL error:', error.message);
        throw new AppError(`無法讀取 URL: ${error.message}`, 400);
    }
}));

module.exports = router;