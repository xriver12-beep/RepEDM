const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const { sql, executeQuery, executeTransaction } = require('../config/database');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { validate, categoryValidations } = require('../middleware/validation');

// 確保上傳目錄存在
const uploadDir = path.join(process.cwd(), 'uploads');
const ensureUploadDir = async () => {
  try {
    await fs.access(uploadDir);
  } catch {
    await fs.mkdir(uploadDir, { recursive: true });
  }
};

// 配置 multer
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    await ensureUploadDir();
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new AppError('只允許上傳圖片檔案', 400), false);
    }
  }
});

// 獲取所有分類 (支持層次結構)
router.get('/',
  asyncHandler(async (req, res) => {
    console.log('📥 收到獲取分類請求 (GET /categories)');
    console.log('Query Params:', req.query);
    const { hierarchyType, parentId, includeChildren = 'true', ids } = req.query;
    
    let categoriesQuery;
    let queryParams = {};

    if (ids !== undefined) {
      // Get specific categories by IDs
      categoriesQuery = `
        SELECT 
          c.id,
          c.category_type,
          c.name,
          c.parent_id,
          c.level,
          c.path,
          c.sort_order,
          c.is_leaf,
          c.hierarchy_type,
          c.is_active,
          COUNT(s.id) as subscriber_count,
          p.name as parent_name
        FROM Categories c
        LEFT JOIN SubscriberCategories sc ON c.id = sc.category_id
        LEFT JOIN Subscribers s ON sc.subscriber_id = s.id AND s.status != 'deleted'
        LEFT JOIN Categories p ON c.parent_id = p.id
        WHERE c.is_active = 1
      `;
      
      const idList = ids.split(',').map(id => parseInt(id)).filter(id => !isNaN(id));
      if (idList.length > 0) {
        categoriesQuery += ` AND c.id IN (${idList.join(',')})`;
      } else {
        // Invalid IDs provided, return empty
        categoriesQuery += ` AND 1=0`;
      }
      
      categoriesQuery += `
        GROUP BY c.id, c.category_type, c.name, c.parent_id, c.level, c.path, 
                 c.sort_order, c.is_leaf, c.hierarchy_type, c.is_active, p.name
        ORDER BY c.name
      `;
      
    } else if (includeChildren === 'true') {
      // 獲取層次結構的分類
      categoriesQuery = `
        SELECT 
          c.id,
          c.category_type,
          c.name,
          c.parent_id,
          c.level,
          c.path,
          c.sort_order,
          c.is_leaf,
          c.hierarchy_type,
          c.is_active,
          COUNT(s.id) as subscriber_count,
          p.name as parent_name,
          (SELECT COUNT(*) FROM Categories child WHERE child.parent_id = c.id AND child.is_active = 1) as child_count
        FROM Categories c
        LEFT JOIN SubscriberCategories sc ON c.id = sc.category_id
        LEFT JOIN Subscribers s ON sc.subscriber_id = s.id AND s.status != 'deleted'
        LEFT JOIN Categories p ON c.parent_id = p.id
        WHERE c.is_active = 1
      `;

      if (hierarchyType) {
        categoriesQuery += ' AND c.hierarchy_type = @hierarchyType';
        queryParams.hierarchyType = hierarchyType;
      }

      if (parentId) {
        categoriesQuery += ' AND c.parent_id = @parentId';
        queryParams.parentId = parentId;
      }

      categoriesQuery += `
        GROUP BY c.id, c.category_type, c.name, c.parent_id, c.level, c.path, 
                 c.sort_order, c.is_leaf, c.hierarchy_type, c.is_active, p.name
        ORDER BY c.hierarchy_type, c.level, c.sort_order, c.name
      `;
    } else {
      // 只獲取根分類
      categoriesQuery = `
        SELECT 
          c.id,
          c.category_type,
          c.name,
          c.hierarchy_type,
          c.is_active,
          c.sort_order,
          COUNT(s.id) as subscriber_count,
          (SELECT COUNT(*) FROM Categories child WHERE child.parent_id = c.id AND child.is_active = 1) as child_count
        FROM Categories c
        LEFT JOIN SubscriberCategories sc ON c.id = sc.category_id
        LEFT JOIN Subscribers s ON sc.subscriber_id = s.id AND s.status != 'deleted'
        WHERE c.is_active = 1 AND c.parent_id IS NULL
      `;

      if (hierarchyType) {
        categoriesQuery += ' AND c.hierarchy_type = @hierarchyType';
        queryParams.hierarchyType = hierarchyType;
      }

      categoriesQuery += `
        GROUP BY c.id, c.category_type, c.name, c.hierarchy_type, c.is_active, c.sort_order
        ORDER BY c.hierarchy_type, c.sort_order, c.name
      `;
    }

    const result = await executeQuery(categoriesQuery, queryParams);

    res.json({
      success: true,
      data: {
        categories: result.recordset.map(cat => ({
          id: cat.id,
          categoryType: cat.category_type,
          name: cat.name,
          parentId: cat.parent_id || null,
          level: cat.level || 0,
          path: cat.path || '',
          sortOrder: cat.sort_order || 0,
          isLeaf: cat.is_leaf || false,
          hierarchyType: cat.hierarchy_type,
          isActive: cat.is_active,
          subscriberCount: cat.subscriber_count || 0,
          parentName: cat.parent_name || null,
          childCount: cat.child_count || 0
        }))
      }
    });
  })
);

// 新增分類
router.post('/',
  authenticateToken,
  authorizeRoles('Admin', 'Manager'),
  validate(categoryValidations.create),
  asyncHandler(async (req, res) => {
    const { 
      name, 
      categoryType, 
      hierarchyType, 
      parentId = null, 
      sortOrder = 0,
      description = '',
      image_url = ''
    } = req.body;

    if (!name || !categoryType || !hierarchyType) {
      throw new AppError('分類名稱、類型和層次類型為必填項', 400);
    }

    // 檢查分類名稱是否已存在 (同一父分類下)
    let duplicateCheckQuery = 'SELECT id FROM Categories WHERE name = @name AND hierarchy_type = @hierarchyType AND is_active = 1';
    const queryParams = { name, hierarchyType };

    if (parentId) {
      duplicateCheckQuery += ' AND parent_id = @parentId';
      queryParams.parentId = parentId;
    } else {
      duplicateCheckQuery += ' AND parent_id IS NULL';
    }

    const existingCategory = await executeQuery(duplicateCheckQuery, queryParams);

    if (existingCategory.recordset.length > 0) {
      throw new AppError('該分類名稱已存在', 400);
    }

    let level = 0;
    let path = '';
    let isLeaf = true;

    // 如果有父分類，計算層級和路徑
    if (parentId) {
      const parentResult = await executeQuery(
        'SELECT level, path, is_leaf FROM Categories WHERE id = @parentId',
        { parentId }
      );

      if (parentResult.recordset.length === 0) {
        throw new AppError('父分類不存在', 400);
      }

      const parent = parentResult.recordset[0];
      level = parent.level + 1;

      if (level >= 5) {
        throw new AppError('分類層級不能超過5層', 400);
      }

      path = parent.path;

      // 更新父分類為非葉節點
      await executeQuery(
        'UPDATE Categories SET is_leaf = 0 WHERE id = @parentId',
        { parentId }
      );
    }

    // 創建新分類
    const originalId = Math.floor(Math.random() * 1000000000) + 1000000; // 生成隨機 original_id 避免唯一鍵衝突

    const insertQuery = `
      INSERT INTO Categories (
        category_type, name, parent_id, level, path, sort_order, 
        is_leaf, hierarchy_type, is_active, original_id, created_at, updated_at, image_url
      )
      OUTPUT INSERTED.id
      VALUES (
        @categoryType, @name, @parentId, @level, @path, @sortOrder,
        @isLeaf, @hierarchyType, 1, @originalId, GETDATE(), GETDATE(), @imageUrl
      )
    `;

    const result = await executeQuery(insertQuery, {
      categoryType,
      name,
      parentId,
      level,
      path,
      sortOrder,
      isLeaf,
      hierarchyType,
      originalId,
      imageUrl: image_url
    });

    const newCategoryId = result.recordset[0].id;

    // 更新路徑包含新的ID
    if (!parentId) {
      path = '/' + newCategoryId;
    } else {
      path = path + '/' + newCategoryId;
    }

    await executeQuery(
      'UPDATE Categories SET path = @path WHERE id = @id',
      { path, id: newCategoryId }
    );

    res.status(201).json({
      success: true,
      message: '分類創建成功',
      data: {
        id: newCategoryId,
        name,
        categoryType,
        hierarchyType,
        parentId,
        level,
        path,
        sortOrder,
        isLeaf
      }
    });
  })
);

// 移動分類
router.put('/:id/move',
  authenticateToken,
  authorizeRoles('Admin', 'Manager'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { parentId, position, targetId } = req.body;

    // 1. 獲取當前分類資訊
    const currentCategoryResult = await executeQuery(
      'SELECT * FROM Categories WHERE id = @id AND is_active = 1',
      { id }
    );

    if (currentCategoryResult.recordset.length === 0) {
      throw new AppError('分類不存在', 404);
    }

    const currentCategory = currentCategoryResult.recordset[0];
    const oldParentId = currentCategory.parent_id;
    const oldPath = currentCategory.path;
    const oldLevel = currentCategory.level;

    // 如果目標父ID與當前父ID相同，且不是排序操作，則無需移動層級
    // 但這裡簡化邏輯，總是執行移動邏輯，排序由前端傳遞的 sortOrder 決定（如果有的話）
    // 目前此 API 主要處理層級變更

    let newParentId = parentId;
    let newLevel = 0;
    let newPathPrefix = '';
    
    // 2. 驗證新父分類
    if (newParentId) {
      // 不能移動到自己下面
      if (newParentId == id) {
        throw new AppError('不能將分類移動到自己下面', 400);
      }

      const parentResult = await executeQuery(
        'SELECT * FROM Categories WHERE id = @parentId AND is_active = 1',
        { parentId: newParentId }
      );

      if (parentResult.recordset.length === 0) {
        throw new AppError('目標父分類不存在', 404);
      }

      const parent = parentResult.recordset[0];
      
      // 檢查是否移動到自己的子分類下 (循環參照檢查)
      // 如果新父分類的路徑包含當前分類的路徑，則說明新父分類是當前分類的子孫
      if (parent.path.startsWith(oldPath + '/')) {
        throw new AppError('不能將分類移動到自己的子分類下', 400);
      }

      newLevel = parent.level + 1;
      newPathPrefix = parent.path;
      
      // 確保層級不超過限制 (例如5層)
      if (newLevel >= 5) {
        throw new AppError('分類層級不能超過5層', 400);
      }
    } else {
      // 移動到根節點
      newParentId = null;
      newLevel = 0;
      newPathPrefix = '';
    }

    // 3. 計算新路徑
    // 路徑格式: /rootId/childId/grandChildId
    // 如果是根節點，路徑為 /id
    // 如果是子節點，路徑為 parentPath/id
    let newPath = '';
    if (newParentId) {
      newPath = newPathPrefix + '/' + id;
    } else {
      newPath = '/' + id;
    }

    // 4. 開始交易執行更新
    const transaction = new sql.Transaction(await sql.connect(require('../config/database').config));
    
    try {
      await transaction.begin();
      const request = new sql.Request(transaction);

      // 4.1 更新當前分類
      await request.query(`
        UPDATE Categories
        SET 
          parent_id = ${newParentId ? newParentId : 'NULL'},
          level = ${newLevel},
          path = '${newPath}',
          updated_at = GETDATE()
        WHERE id = ${id}
      `);

      // 4.2 更新所有子孫分類的路徑和層級
      // 使用 STUFF 函數替換路徑前綴
      // 計算層級差異
      const levelDiff = newLevel - oldLevel;
      
      if (levelDiff !== 0 || oldPath !== newPath) {
        // SQL Server 的 STUFF(string, start, length, new_string)
        // LEN('${oldPath}') 獲取舊路徑長度
        // 我們要替換所有以 oldPath + '/' 開頭的路徑
        
        await request.query(`
          UPDATE Categories
          SET 
            path = STUFF(path, 1, LEN('${oldPath}'), '${newPath}'),
            level = level + ${levelDiff}
          WHERE path LIKE '${oldPath}/%'
        `);
      }

      // 4.3 更新舊父分類的 is_leaf 狀態
      if (oldParentId) {
        const oldParentCheck = await request.query(`
          SELECT COUNT(*) as count FROM Categories 
          WHERE parent_id = ${oldParentId} AND is_active = 1
        `);
        
        if (oldParentCheck.recordset[0].count === 0) {
          await request.query(`
            UPDATE Categories SET is_leaf = 1 WHERE id = ${oldParentId}
          `);
        }
      }

      // 4.4 更新新父分類的 is_leaf 狀態
      if (newParentId) {
        await request.query(`
          UPDATE Categories SET is_leaf = 0 WHERE id = ${newParentId}
        `);
      }

      await transaction.commit();

      res.json({
        success: true,
        message: '分類移動成功',
        data: {
          id,
          parentId: newParentId,
          level: newLevel,
          path: newPath
        }
      });

    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  })
);

// 更新分類
router.put('/:id',
  authenticateToken,
  authorizeRoles('Admin', 'Manager'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, categoryType, sortOrder, description } = req.body;

    if (!name) {
      throw new AppError('分類名稱為必填項', 400);
    }

    // 檢查分類是否存在
    const existingCategory = await executeQuery(
      'SELECT * FROM Categories WHERE id = @id AND is_active = 1',
      { id }
    );

    if (existingCategory.recordset.length === 0) {
      throw new AppError('分類不存在', 404);
    }

    const category = existingCategory.recordset[0];

    // 檢查名稱是否與其他分類重複
    const duplicateCheck = await executeQuery(
      'SELECT id FROM Categories WHERE name = @name AND hierarchy_type = @hierarchyType AND id != @id AND is_active = 1',
      { name, hierarchyType: category.hierarchy_type, id }
    );

    if (duplicateCheck.recordset.length > 0) {
      throw new AppError('該分類名稱已存在', 400);
    }

    // 更新分類
    const updateQuery = `
      UPDATE Categories 
      SET 
        name = @name,
        category_type = @categoryType,
        sort_order = @sortOrder,
        updated_at = GETDATE()
      WHERE id = @id
    `;

    await executeQuery(updateQuery, {
      name,
      categoryType: categoryType || category.category_type,
      sortOrder: sortOrder !== undefined ? sortOrder : category.sort_order,
      id
    });

    res.json({
      success: true,
      message: '分類更新成功'
    });
  })
);

// 刪除分類
router.delete('/:id',
  authenticateToken,
  authorizeRoles('Admin', 'Manager'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // 檢查分類是否存在
    const existingCategory = await executeQuery(
      'SELECT * FROM Categories WHERE id = @id AND is_active = 1',
      { id }
    );

    if (existingCategory.recordset.length === 0) {
      throw new AppError('分類不存在', 404);
    }

    // 檢查是否有子分類
    const childrenCheck = await executeQuery(
      'SELECT COUNT(*) as count FROM Categories WHERE parent_id = @id AND is_active = 1',
      { id }
    );

    if (childrenCheck.recordset[0].count > 0) {
      throw new AppError('無法刪除有子分類的分類，請先刪除子分類', 400);
    }

    // 檢查是否有訂閱者使用此分類
    const subscriberCheck = await executeQuery(
      'SELECT COUNT(*) as count FROM SubscriberCategories WHERE category_id = @id',
      { id }
    );

    if (subscriberCheck.recordset[0].count > 0) {
      throw new AppError('無法刪除已被訂閱者使用的分類', 400);
    }

    const category = existingCategory.recordset[0];

    // 軟刪除分類
    await executeQuery(
      'UPDATE Categories SET is_active = 0, updated_at = GETDATE() WHERE id = @id',
      { id }
    );

    // 如果父分類沒有其他子分類，更新為葉節點
    if (category.parent_id) {
      const siblingCheck = await executeQuery(
        'SELECT COUNT(*) as count FROM Categories WHERE parent_id = @parentId AND is_active = 1',
        { parentId: category.parent_id }
      );

      if (siblingCheck.recordset[0].count === 0) {
        await executeQuery(
          'UPDATE Categories SET is_leaf = 1 WHERE id = @parentId',
          { parentId: category.parent_id }
        );
      }
    }

    res.json({
      success: true,
      message: '分類刪除成功'
    });
  })
);

// 獲取分類樹狀結構
router.get('/tree',
  asyncHandler(async (req, res) => {
    const { hierarchyType } = req.query;

    let treeQuery = `
      WITH CategoryTree AS (
        -- 根節點
        SELECT 
          c.id,
          c.name,
          c.category_type,
          c.parent_id,
          c.level,
          c.path,
          c.sort_order,
          c.is_leaf,
          c.hierarchy_type,
          c.image_url,
          CAST(c.name AS NVARCHAR(MAX)) as tree_path
        FROM Categories c
        WHERE c.parent_id IS NULL AND c.is_active = 1
    `;

    if (hierarchyType) {
      treeQuery += ' AND c.hierarchy_type = @hierarchyType';
    }

    treeQuery += `
        UNION ALL
        
        -- 子節點
        SELECT 
          c.id,
          c.name,
          c.category_type,
          c.parent_id,
          c.level,
          c.path,
          c.sort_order,
          c.is_leaf,
          c.hierarchy_type,
          c.image_url,
          CAST(ct.tree_path + ' > ' + c.name AS NVARCHAR(MAX))
        FROM Categories c
        INNER JOIN CategoryTree ct ON c.parent_id = ct.id
        WHERE c.is_active = 1
      )
      SELECT 
        ct.*,
        COUNT(sc.subscriber_id) as subscriber_count
      FROM CategoryTree ct
      LEFT JOIN SubscriberCategories sc ON ct.id = sc.category_id
      GROUP BY ct.id, ct.name, ct.category_type, ct.parent_id, ct.level, ct.path, 
               ct.sort_order, ct.is_leaf, ct.hierarchy_type, ct.image_url, ct.tree_path
      ORDER BY ct.hierarchy_type, ct.level, ct.sort_order, ct.name
    `;

    const params = hierarchyType ? { hierarchyType } : {};
    const result = await executeQuery(treeQuery, params);

    res.json({
      success: true,
      data: {
        categories: result.recordset.map(cat => ({
          id: cat.id,
          name: cat.name,
          categoryType: cat.category_type,
          parentId: cat.parent_id,
          level: cat.level,
          path: cat.path,
          sortOrder: cat.sort_order,
          isLeaf: cat.is_leaf,
          hierarchyType: cat.hierarchy_type,
          imageUrl: cat.image_url ? `/uploads/${path.basename(cat.image_url)}` : null,
          subscriberCount: cat.subscriber_count || 0,
          treePath: cat.tree_path
        }))
      }
    });
  })
);

// 獲取層次類型統計
router.get('/hierarchy-stats',
  asyncHandler(async (req, res) => {
    const statsQuery = `
      SELECT 
        hierarchy_type,
        COUNT(*) as total_count,
        COUNT(CASE WHEN parent_id IS NULL THEN 1 END) as root_count,
        COUNT(CASE WHEN parent_id IS NOT NULL THEN 1 END) as child_count,
        MAX(level) as max_level,
        SUM(CASE WHEN is_leaf = 1 THEN 1 ELSE 0 END) as leaf_count
      FROM Categories
      WHERE is_active = 1
      GROUP BY hierarchy_type
      ORDER BY hierarchy_type
    `;

    const result = await executeQuery(statsQuery);

    res.json({
      success: true,
      data: {
        stats: result.recordset.map(stat => ({
          hierarchyType: stat.hierarchy_type,
          totalCount: stat.total_count,
          rootCount: stat.root_count,
          childCount: stat.child_count,
          maxLevel: stat.max_level,
          leafCount: stat.leaf_count
        }))
      }
    });
  })
);

// 搜索分類
router.get('/search',
  asyncHandler(async (req, res) => {
    const { keyword, hierarchyType } = req.query;

    if (!keyword) {
      throw new AppError('請提供搜索關鍵字', 400);
    }

    let searchQuery = `
      SELECT 
        c.id,
        c.name,
        c.category_type,
        c.parent_id,
        c.level,
        c.path,
        c.hierarchy_type,
        p.name as parent_name,
        COUNT(sc.subscriber_id) as subscriber_count
      FROM Categories c
      LEFT JOIN Categories p ON c.parent_id = p.id
      LEFT JOIN SubscriberCategories sc ON c.id = sc.category_id
      WHERE c.is_active = 1 AND c.name LIKE @keyword
    `;

    const params = { keyword: `%${keyword}%` };

    if (hierarchyType) {
      searchQuery += ' AND c.hierarchy_type = @hierarchyType';
      params.hierarchyType = hierarchyType;
    }

    searchQuery += `
      GROUP BY c.id, c.name, c.category_type, c.parent_id, c.level, c.path,
               c.hierarchy_type, p.name
      ORDER BY c.hierarchy_type, c.level, c.name
    `;

    const result = await executeQuery(searchQuery, params);

    res.json({
      success: true,
      data: {
        categories: result.recordset.map(cat => ({
          id: cat.id,
          name: cat.name,
          categoryType: cat.category_type,
          parentId: cat.parent_id,
          level: cat.level,
          path: cat.path,
          hierarchyType: cat.hierarchy_type,
          parentName: cat.parent_name,
          subscriberCount: cat.subscriber_count || 0
        }))
      }
    });
  })
);

// 匯出分類
router.get('/export',
  authenticateToken,
  authorizeRoles('Admin', 'Manager'),
  asyncHandler(async (req, res) => {
    const { hierarchyType } = req.query;

    let exportQuery = `
      SELECT 
        c.id,
        c.name,
        c.category_type,
        c.hierarchy_type,
        c.parent_id,
        p.name as parent_name,
        c.level,
        c.sort_order,
        c.is_active,
        c.created_at,
        COUNT(sc.subscriber_id) as subscriber_count
      FROM Categories c
      LEFT JOIN Categories p ON c.parent_id = p.id
      LEFT JOIN SubscriberCategories sc ON c.id = sc.category_id
      WHERE c.is_active = 1
    `;

    const params = {};

    if (hierarchyType) {
      exportQuery += ' AND c.hierarchy_type = @hierarchyType';
      params.hierarchyType = hierarchyType;
    }

    exportQuery += `
      GROUP BY c.id, c.name, c.category_type, c.hierarchy_type, c.parent_id,
               p.name, c.level, c.sort_order, c.is_active, c.created_at
      ORDER BY c.hierarchy_type, c.level, c.sort_order, c.name
    `;

    const result = await executeQuery(exportQuery, params);

    // 生成 CSV 內容
    const csvHeader = 'ID,名稱,分類類型,層次類型,上層分類ID,上層分類名稱,層級,排序,狀態,建立時間,訂閱者數量\n';
    const csvRows = result.recordset.map(row => {
      return [
        row.id,
        `"${row.name}"`,
        row.category_type,
        row.hierarchy_type,
        row.parent_id || '',
        `"${row.parent_name || ''}"`,
        row.level,
        row.sort_order,
        row.is_active ? '啟用' : '停用',
        row.created_at.toISOString().split('T')[0],
        row.subscriber_count
      ].join(',');
    }).join('\n');

    const csvContent = csvHeader + csvRows;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="categories_${hierarchyType || 'all'}_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send('\uFEFF' + csvContent); // 添加 BOM 以支持中文
  })
);

// 從 CSV 匯入分類
router.post('/import-csv',
  authorizeRoles('Admin', 'Manager'),
  asyncHandler(async (req, res) => {
    const multer = require('multer');
    const upload = multer({ storage: multer.memoryStorage() });

    upload.single('file')(req, res, async (err) => {
      if (err) {
        throw new AppError('檔案上傳失敗', 400);
      }

      if (!req.file) {
        throw new AppError('請選擇 CSV 檔案', 400);
      }

      const { type: hierarchyType } = req.body;
      if (!hierarchyType) {
        throw new AppError('請指定分類類型', 400);
      }

      try {
        const csvContent = req.file.buffer.toString('utf-8');
        const lines = csvContent.split('\n').filter(line => line.trim());
        
        if (lines.length <= 1) {
          throw new AppError('CSV 檔案內容為空', 400);
        }

        let imported = 0;
        const errors = [];

        // 跳過標題行，處理數據行
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          try {
            const columns = line.split(',').map(col => col.replace(/^"|"$/g, '').trim());
            
            if (columns.length < 2) {
              errors.push(`第 ${i + 1} 行：格式錯誤`);
              continue;
            }

            const [name, categoryType, parentName, sortOrder, description] = columns;

            if (!name) {
              errors.push(`第 ${i + 1} 行：分類名稱不能為空`);
              continue;
            }

            // 檢查分類是否已存在
            const existingCheck = await executeQuery(
              'SELECT id FROM Categories WHERE name = @name AND hierarchy_type = @hierarchyType AND is_active = 1',
              { name, hierarchyType }
            );

            if (existingCheck.recordset.length > 0) {
              errors.push(`第 ${i + 1} 行：分類「${name}」已存在`);
              continue;
            }

            // 查找父分類
            let parentId = null;
            if (parentName) {
              const parentResult = await executeQuery(
                'SELECT id FROM Categories WHERE name = @parentName AND hierarchy_type = @hierarchyType AND is_active = 1',
                { parentName, hierarchyType }
              );

              if (parentResult.recordset.length > 0) {
                parentId = parentResult.recordset[0].id;
              }
            }

            // 創建分類
            const insertQuery = `
              INSERT INTO Categories (
                category_type, name, parent_id, level, path, sort_order,
                is_leaf, hierarchy_type, is_active, created_at, updated_at
              )
              OUTPUT INSERTED.id
              VALUES (
                @categoryType, @name, @parentId, 0, '', @sortOrder,
                1, @hierarchyType, 1, GETDATE(), GETDATE()
              )
            `;

            await executeQuery(insertQuery, {
              categoryType: categoryType || hierarchyType,
              name,
              parentId,
              sortOrder: parseInt(sortOrder) || 0,
              hierarchyType
            });

            imported++;

          } catch (error) {
            errors.push(`第 ${i + 1} 行：${error.message}`);
          }
        }

        res.json({
          success: true,
          message: `匯入完成：成功 ${imported} 筆`,
          data: {
            imported,
            errors: errors.slice(0, 10) // 只返回前10個錯誤
          }
        });

      } catch (error) {
        throw new AppError('CSV 檔案處理失敗: ' + error.message, 400);
      }
    });
  })
);

// 從舊資料表匯入分類
router.post('/import-legacy',
  authorizeRoles('Admin', 'Manager'),
  asyncHandler(async (req, res) => {
    const { table, type: hierarchyType } = req.body;

    if (!table || !hierarchyType) {
      throw new AppError('請指定舊資料表和分類類型', 400);
    }

    // 驗證資料表名稱安全性
    const allowedTables = [
      'epaper_member_t1', 'epaper_member_t2', 'epaper_member_t3',
      'epaper_member_t4', 'epaper_member_t5', 'epaper_member_t6'
    ];

    if (!allowedTables.includes(table)) {
      throw new AppError('不支援的資料表', 400);
    }

    try {
      // 查詢舊資料表的唯一值
      const legacyQuery = `
        SELECT DISTINCT ${table} as name
        FROM Subscribers 
        WHERE ${table} IS NOT NULL 
        AND ${table} != '' 
        AND ${table} != '無'
        ORDER BY ${table}
      `;

      const legacyResult = await executeQuery(legacyQuery);
      
      let imported = 0;
      const errors = [];

      for (const row of legacyResult.recordset) {
        const name = row.name.trim();
        if (!name) continue;

        try {
          // 檢查分類是否已存在
          const existingCheck = await executeQuery(
            'SELECT id FROM Categories WHERE name = @name AND hierarchy_type = @hierarchyType AND is_active = 1',
            { name, hierarchyType }
          );

          if (existingCheck.recordset.length > 0) {
            continue; // 跳過已存在的分類
          }

          // 創建分類
          const insertQuery = `
            INSERT INTO Categories (
              category_type, name, parent_id, level, path, sort_order,
              is_leaf, hierarchy_type, is_active, created_at, updated_at
            )
            VALUES (
              @hierarchyType, @name, NULL, 0, '', 0,
              1, @hierarchyType, 1, GETDATE(), GETDATE()
            )
          `;

          await executeQuery(insertQuery, {
            hierarchyType,
            name
          });

          imported++;

        } catch (error) {
          errors.push(`分類「${name}」：${error.message}`);
        }
      }

      res.json({
        success: true,
        message: `從 ${table} 匯入完成：成功 ${imported} 筆`,
        data: {
          imported,
          errors: errors.slice(0, 10)
        }
      });

    } catch (error) {
      throw new AppError('舊資料匯入失敗: ' + error.message, 400);
    }
  })
);

// 預覽舊資料表內容
router.get('/legacy-preview',
  authenticateToken,
  authorizeRoles('Admin', 'Manager'),
  asyncHandler(async (req, res) => {
    const { table } = req.query;

    if (!table) {
      throw new AppError('請指定資料表', 400);
    }

    // 驗證資料表名稱安全性
    const allowedTables = [
      'epaper_member_t1', 'epaper_member_t2', 'epaper_member_t3',
      'epaper_member_t4', 'epaper_member_t5', 'epaper_member_t6'
    ];

    if (!allowedTables.includes(table)) {
      throw new AppError('不支援的資料表', 400);
    }

    try {
      const previewQuery = `
        SELECT DISTINCT TOP 10 ${table} as name
        FROM Subscribers 
        WHERE ${table} IS NOT NULL 
        AND ${table} != '' 
        AND ${table} != '無'
        ORDER BY ${table}
      `;

      const countQuery = `
        SELECT COUNT(DISTINCT ${table}) as count
        FROM Subscribers 
        WHERE ${table} IS NOT NULL 
        AND ${table} != '' 
        AND ${table} != '無'
      `;

      const [previewResult, countResult] = await Promise.all([
        executeQuery(previewQuery),
        executeQuery(countQuery)
      ]);

      res.json({
        success: true,
        data: {
          count: countResult.recordset[0].count,
          preview: previewResult.recordset.map(row => row.name)
        }
      });

    } catch (error) {
      throw new AppError('預覽舊資料失敗: ' + error.message, 400);
    }
  })
);

// Get single category
router.get('/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const query = `
      SELECT 
        c.id,
        c.category_type,
        c.name,
        c.parent_id,
        c.level,
        c.path,
        c.sort_order,
        c.is_leaf,
        c.hierarchy_type,
        c.is_active,
        c.image_url,
        p.name as parent_name,
        (SELECT COUNT(*) FROM Categories child WHERE child.parent_id = c.id AND child.is_active = 1) as child_count,
        COUNT(sc.subscriber_id) as subscriber_count
      FROM Categories c
      LEFT JOIN Categories p ON c.parent_id = p.id
      LEFT JOIN SubscriberCategories sc ON c.id = sc.category_id
      WHERE c.id = @id AND c.is_active = 1
      GROUP BY c.id, c.category_type, c.name, c.parent_id, c.level, c.path, 
               c.sort_order, c.is_leaf, c.hierarchy_type, c.is_active, c.image_url, p.name
    `;

    const result = await executeQuery(query, { id });

    if (result.recordset.length === 0) {
      throw new AppError('分類不存在', 404);
    }

    const cat = result.recordset[0];

    res.json({
      success: true,
      data: {
        id: cat.id,
        categoryType: cat.category_type,
        name: cat.name,
        parentId: cat.parent_id || null,
        level: cat.level || 0,
        path: cat.path || '',
        sortOrder: cat.sort_order || 0,
        isLeaf: cat.is_leaf || false,
        hierarchyType: cat.hierarchy_type,
        isActive: cat.is_active,
        imageUrl: cat.image_url ? `/uploads/${path.basename(cat.image_url)}` : null,
        parentName: cat.parent_name || null,
        childCount: cat.child_count || 0,
        subscriberCount: cat.subscriber_count || 0
      }
    });
  })
);

// Upload category image
router.post('/:id/image',
  authenticateToken,
  authorizeRoles('Admin', 'Manager'),
  upload.single('image'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    if (!req.file) {
      throw new AppError('請上傳圖片檔案', 400);
    }

    // Check if category exists
    const checkQuery = 'SELECT id, image_url FROM Categories WHERE id = @id AND is_active = 1';
    const checkResult = await executeQuery(checkQuery, { id });

    if (checkResult.recordset.length === 0) {
      // Delete uploaded file if category not found
      await fs.unlink(req.file.path);
      throw new AppError('分類不存在', 404);
    }

    const oldImageUrl = checkResult.recordset[0].image_url;

    // Update database
    await executeQuery(
      'UPDATE Categories SET image_url = @imageUrl, updated_at = GETDATE() WHERE id = @id',
      { imageUrl: req.file.path, id }
    );

    // Delete old image if exists
    if (oldImageUrl) {
      try {
        await fs.unlink(oldImageUrl);
      } catch (err) {
        console.error('Failed to delete old image:', err);
      }
    }

    res.json({
      success: true,
      message: '圖片上傳成功',
      data: {
        imageUrl: `/uploads/${path.basename(req.file.path)}`
      }
    });
  })
);

module.exports = router;