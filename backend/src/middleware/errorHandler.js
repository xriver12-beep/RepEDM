const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // 記錄錯誤到控制台
  console.error('錯誤詳情:', err);

  // SQL Server 錯誤
  if (err.code) {
    let message = '資料庫操作錯誤';
    let statusCode = 500;

    switch (err.code) {
      case 'EREQUEST':
        // Include the original error message for debugging
        message = `資料庫請求錯誤: ${err.message}`;
        statusCode = 400;
        break;
      case 'ECONNRESET':
        message = '資料庫連接重置';
        statusCode = 503;
        break;
      case 'ETIMEOUT':
        message = '資料庫操作超時';
        statusCode = 504;
        break;
      case 'ENOTFOUND':
        message = '找不到資料庫伺服器';
        statusCode = 503;
        break;
      case 'ECONNREFUSED':
        message = '資料庫連接被拒絕';
        statusCode = 503;
        break;
    }

    error.message = message;
    error.statusCode = statusCode;
  }

  // JWT 錯誤
  if (err.name === 'JsonWebTokenError') {
    const message = '無效的認證令牌';
    error = { message, statusCode: 401 };
  }

  if (err.name === 'TokenExpiredError') {
    const message = '認證令牌已過期';
    error = { message, statusCode: 401 };
  }

  // Validation 錯誤
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = { message, statusCode: 400 };
  }

  // Joi 驗證錯誤
  if (err.isJoi) {
    const message = err.details.map(detail => detail.message).join(', ');
    error = { message, statusCode: 400 };
  }

  // Multer 檔案上傳錯誤
  if (err.code === 'LIMIT_FILE_SIZE') {
    const message = '檔案大小超過限制';
    error = { message, statusCode: 400 };
  }

  if (err.code === 'LIMIT_FILE_COUNT') {
    const message = '檔案數量超過限制';
    error = { message, statusCode: 400 };
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    const message = '不支援的檔案類型';
    error = { message, statusCode: 400 };
  }

  // 自定義應用程式錯誤
  if (err.name === 'AppError') {
    error = { message: err.message, statusCode: err.statusCode };
  }

  // 重複鍵錯誤 (SQL Server)
  if (err.number === 2627 || err.number === 2601) {
    const message = '資料重複，該記錄已存在';
    error = { message, statusCode: 400 };
  }

  // 外鍵約束錯誤
  if (err.number === 547) {
    const message = '資料關聯錯誤，無法執行此操作';
    error = { message, statusCode: 400 };
  }

  // 預設錯誤
  const statusCode = error.statusCode || 500;
  const message = error.message || '伺服器內部錯誤';

  // 開發環境顯示詳細錯誤資訊
  const response = {
    success: false,
    message: message
  };

  if (process.env.NODE_ENV === 'development') {
    response.error = err;
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

// 自定義錯誤類別
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

// 非同步錯誤處理包裝器
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// 404 錯誤處理
const notFound = (req, res, next) => {
  const error = new AppError(`找不到路由 ${req.originalUrl}`, 404);
  next(error);
};

module.exports = {
  errorHandler,
  AppError,
  asyncHandler,
  notFound
};