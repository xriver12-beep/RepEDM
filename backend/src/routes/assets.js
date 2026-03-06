const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const { executeQuery, sql } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errorHandler');

const router = express.Router();

// 確保上傳目錄存在
const uploadDir = path.join(process.cwd(), 'uploads');
const ensureUploadDir = async () => {
  try {
    await fs.access(uploadDir);
  } catch {
    await fs.mkdir(uploadDir, { recursive: true });
  }
};

// 配置 multer 用於文件上傳
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
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|svg|pdf|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new AppError('不支援的文件類型', 400));
    }
  }
});

// --- Category Management Routes ---

// Get all asset categories
router.get('/categories', 
  authenticateToken,
  asyncHandler(async (req, res) => {
    const result = await executeQuery('SELECT * FROM AssetCategories ORDER BY name');
    res.json({
      success: true,
      data: result.recordset
    });
  })
);

// Create asset category
router.post('/categories',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { name, description } = req.body;
    if (!name) throw new AppError('分類名稱不能為空', 400);

    const result = await executeQuery(`
      INSERT INTO AssetCategories (name, description, created_by)
      OUTPUT INSERTED.*
      VALUES (@name, @description, @userId)
    `, {
      name,
      description,
      userId: req.user.userId
    });

    res.status(201).json({
      success: true,
      data: result.recordset[0]
    });
  })
);

// Update asset category
router.put('/categories/:id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, description } = req.body;
    
    await executeQuery(`
      UPDATE AssetCategories 
      SET name = @name, description = @description
      WHERE id = @id
    `, { id, name, description });

    res.json({ success: true, message: '分類更新成功' });
  })
);

// Delete asset category
router.delete('/categories/:id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    // Check if used
    const check = await executeQuery('SELECT TOP 1 1 FROM Assets WHERE category_id = @id', { id });
    if (check.recordset.length > 0) {
      throw new AppError('無法刪除：該分類下已有素材', 400);
    }

    await executeQuery('DELETE FROM AssetCategories WHERE id = @id', { id });
    res.json({ success: true, message: '分類刪除成功' });
  })
);

// --- Asset Routes ---

// 上傳文件
router.post('/upload',
  authenticateToken,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new AppError('請選擇要上傳的文件', 400);
    }

    // 解決中文檔名亂碼問題 (Multer encoding fix)
    req.file.originalname = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

    const { originalname, filename, mimetype, size } = req.file;
    const { description, category_id, group_id } = req.body; // group_id for versioning

    const assetId = uuidv4();
    // If group_id is provided, use it; otherwise allow it to be null (will be set to assetId later if needed, or we can set it to assetId now)
    // Actually, setting group_id = assetId for the first version is a good practice.
    const finalGroupId = group_id || assetId;
    
    // Determine version number
    let version = 1;
    if (group_id) {
        const verResult = await executeQuery(
            'SELECT MAX(version) as max_ver FROM Assets WHERE group_id = @groupId',
            { groupId: group_id }
        );
        version = (verResult.recordset[0].max_ver || 0) + 1;
    }

    // Determine category name (legacy support)
    let categoryName = 'General';
    if (category_id) {
        const catResult = await executeQuery('SELECT name FROM AssetCategories WHERE id = @id', { id: category_id });
        if (catResult.recordset.length > 0) categoryName = catResult.recordset[0].name;
    }

    const result = await executeQuery(`
      INSERT INTO Assets (id, original_name, file_name, mime_type, file_size, description, category, category_id, group_id, version, uploaded_by, created_at)
      OUTPUT INSERTED.id
      VALUES (@assetId, @originalName, @fileName, @mimeType, @fileSize, @description, @category, @categoryId, @groupId, @version, @uploadedBy, GETDATE())
    `, {
      assetId,
      originalName: originalname,
      fileName: filename,
      mimeType: mimetype,
      fileSize: size,
      description: description || null,
      category: categoryName,
      categoryId: category_id || null,
      groupId: finalGroupId,
      version,
      uploadedBy: req.user.userId
    });

    res.status(201).json({
      success: true,
      message: '文件上傳成功',
      data: {
        assetId: result.recordset[0].id,
        originalName: originalname,
        fileName: filename,
        fileUrl: `/uploads/${filename}`,
        fileSize: size,
        version,
        groupId: finalGroupId
      }
    });
  })
);

// 獲取資產列表 (只顯示最新版本)
router.get('/',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, category_id, search } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE A.version = (SELECT MAX(version) FROM Assets A2 WHERE A2.group_id = A.group_id)';
    const params = {};

    if (category_id) {
      whereClause += ' AND A.category_id = @categoryId';
      params.categoryId = category_id;
    }

    if (search) {
      whereClause += ' AND (A.original_name LIKE @search OR A.description LIKE @search)';
      params.search = `%${search}%`;
    }

    const query = `
      SELECT A.id, A.original_name, A.file_name, A.mime_type, A.file_size, A.description, 
             A.category, A.category_id, A.created_at, A.version, A.group_id,
             AC.name as category_name,
             U.username as uploader_name
      FROM Assets A
      LEFT JOIN AssetCategories AC ON A.category_id = AC.id
      LEFT JOIN Users U ON A.uploaded_by = U.id
      ${whereClause}
      ORDER BY A.created_at DESC
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY
    `;

    const assets = await executeQuery(query, { ...params, offset: parseInt(offset), limit: parseInt(limit) });

    const totalCount = await executeQuery(`
      SELECT COUNT(*) as total FROM Assets A ${whereClause}
    `, params);

    res.json({
      success: true,
      data: {
        assets: assets.recordset.map(asset => ({
          ...asset,
          fileUrl: `/uploads/${asset.file_name}`
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount.recordset[0].total,
          pages: Math.ceil(totalCount.recordset[0].total / limit)
        }
      }
    });
  })
);

// Get versions of an asset
router.get('/:id/versions',
    authenticateToken,
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        // First get the group_id of the requested asset
        const asset = await executeQuery('SELECT group_id FROM Assets WHERE id = @id', { id });
        if (asset.recordset.length === 0) throw new AppError('Asset not found', 404);
        
        const groupId = asset.recordset[0].group_id;

        const versions = await executeQuery(`
            SELECT id, original_name, file_name, version, created_at, description
            FROM Assets
            WHERE group_id = @groupId
            ORDER BY version DESC
        `, { groupId });

        res.json({
            success: true,
            data: versions.recordset.map(v => ({
                ...v,
                fileUrl: `/uploads/${v.file_name}`
            }))
        });
    })
);

// Usage Tracking
router.get('/:id/usage',
    authenticateToken,
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const asset = await executeQuery('SELECT file_name FROM Assets WHERE id = @id', { id });
        if (asset.recordset.length === 0) throw new AppError('Asset not found', 404);
        
        const fileName = asset.recordset[0].file_name;
        
        // Search in Campaigns and Templates
        // Note: This is a simple string search.
        const campaigns = await executeQuery(`
            SELECT id, Name, Status FROM Campaigns 
            WHERE html_content LIKE @pattern
        `, { pattern: `%${fileName}%` });

        const templates = await executeQuery(`
            SELECT id, Name FROM Templates
            WHERE html_content LIKE @pattern
        `, { pattern: `%${fileName}%` });

        res.json({
            success: true,
            data: {
                campaigns: campaigns.recordset,
                templates: templates.recordset
            }
        });
    })
);

// 刪除資產
router.delete('/:assetId',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { assetId } = req.params;

    // 獲取文件信息
    const asset = await executeQuery(
      'SELECT file_name FROM Assets WHERE id = @assetId',
      { assetId }
    );

    if (asset.recordset.length === 0) {
      throw new AppError('資產不存在', 404);
    }

    // 刪除數據庫記錄
    await executeQuery(
      'DELETE FROM Assets WHERE id = @assetId',
      { assetId }
    );

    // 刪除文件
    try {
      const filePath = path.join(uploadDir, asset.recordset[0].file_name);
      await fs.unlink(filePath);
    } catch (error) {
      console.error('刪除文件失敗:', error);
    }

    res.json({
      success: true,
      message: '資產刪除成功'
    });
  })
);

module.exports = router;
