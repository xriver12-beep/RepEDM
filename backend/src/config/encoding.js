/**
 * 編碼配置模組
 * 確保系統正確處理繁體中文字符
 */

// 設定 Node.js 預設編碼
process.env.NODE_OPTIONS = '--max-old-space-size=4096';

// 資料庫連接編碼設定
const dbEncodingConfig = {
  // MS SQL Server 編碼設定
  mssql: {
    options: {
      // 使用 UTF-8 編碼
      charset: 'utf8',
      // 支援繁體中文排序
      collation: 'Chinese_Traditional_Stroke_Order_100_CI_AS',
      // 啟用 Unicode 支援
      useUTC: false,
      // 連接超時設定
      connectTimeout: 60000,
      requestTimeout: 60000,
    },
    // 連接字串編碼參數
    connectionString: {
      charset: 'utf8mb4',
      collation: 'utf8mb4_unicode_ci',
    }
  }
};

// HTTP 響應編碼設定
const httpEncodingConfig = {
  // 預設響應標頭
  defaultHeaders: {
    'Content-Type': 'application/json; charset=utf-8',
    'Accept-Charset': 'utf-8',
  },
  // 檔案上傳編碼
  fileUpload: {
    encoding: 'utf8',
    // 支援的檔案類型
    allowedMimeTypes: [
      'text/plain',
      'text/csv',
      'application/json',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf'
    ]
  }
};

// 郵件編碼設定
const emailEncodingConfig = {
  // 郵件標頭編碼
  headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Transfer-Encoding': '8bit',
  },
  // 主旨編碼
  subject: {
    encoding: 'utf-8',
    // 支援 RFC 2047 編碼
    rfc2047: true,
  },
  // 內容編碼
  content: {
    html: 'utf-8',
    text: 'utf-8',
  }
};

// 日誌編碼設定
const logEncodingConfig = {
  // 日誌檔案編碼
  fileEncoding: 'utf8',
  // 控制台輸出編碼
  consoleEncoding: 'utf8',
  // 日期時間格式（繁體中文）
  dateFormat: 'YYYY年MM月DD日 HH:mm:ss',
  // 時區設定
  timezone: 'Asia/Taipei',
};

// 驗證和清理函數
const encodingUtils = {
  /**
   * 驗證字串是否為有效的 UTF-8
   * @param {string} str - 要驗證的字串
   * @returns {boolean} - 是否為有效的 UTF-8
   */
  isValidUTF8: (str) => {
    try {
      return Buffer.from(str, 'utf8').toString('utf8') === str;
    } catch (error) {
      return false;
    }
  },

  /**
   * 清理和標準化中文字串
   * @param {string} str - 要清理的字串
   * @returns {string} - 清理後的字串
   */
  sanitizeChineseText: (str) => {
    if (!str || typeof str !== 'string') return '';
    
    // 移除控制字符，保留中文字符
    return str
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .trim();
  },

  /**
   * 轉換編碼
   * @param {string} str - 要轉換的字串
   * @param {string} fromEncoding - 來源編碼
   * @param {string} toEncoding - 目標編碼
   * @returns {string} - 轉換後的字串
   */
  convertEncoding: (str, fromEncoding = 'utf8', toEncoding = 'utf8') => {
    try {
      const buffer = Buffer.from(str, fromEncoding);
      return buffer.toString(toEncoding);
    } catch (error) {
      console.error('編碼轉換錯誤:', error);
      return str;
    }
  },

  /**
   * 檢查字串是否包含中文字符
   * @param {string} str - 要檢查的字串
   * @returns {boolean} - 是否包含中文字符
   */
  containsChinese: (str) => {
    const chineseRegex = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;
    return chineseRegex.test(str);
  },

  /**
   * 計算中文字串的實際長度（中文字符算2個字符）
   * @param {string} str - 要計算的字串
   * @returns {number} - 實際長度
   */
  getChineseStringLength: (str) => {
    if (!str) return 0;
    
    let length = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charAt(i);
      // 中文字符、全形字符算2個字符
      if (char.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\uff00-\uffef]/)) {
        length += 2;
      } else {
        length += 1;
      }
    }
    return length;
  },

  /**
   * 截取中文字串（按實際顯示長度）
   * @param {string} str - 要截取的字串
   * @param {number} maxLength - 最大長度
   * @returns {string} - 截取後的字串
   */
  truncateChineseString: (str, maxLength) => {
    if (!str) return '';
    
    let length = 0;
    let result = '';
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charAt(i);
      const charLength = char.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\uff00-\uffef]/) ? 2 : 1;
      
      if (length + charLength > maxLength) {
        break;
      }
      
      result += char;
      length += charLength;
    }
    
    return result;
  }
};

// Express 中間件：設定編碼
const encodingMiddleware = (req, res, next) => {
  // 設定響應編碼（不設定請求編碼，避免與 body-parser 衝突）
  // 移除強制設定 Content-Type 為 JSON，以免影響靜態檔案服務
  // res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // Accept-Charset 是請求標頭，但在某些舊系統中可能用於提示
  // res.setHeader('Accept-Charset', 'utf-8');
  
  // 處理中文檔案名稱
  if (req.headers['content-disposition']) {
    const disposition = req.headers['content-disposition'];
    if (encodingUtils.containsChinese(disposition)) {
      req.headers['content-disposition'] = encodeURIComponent(disposition);
    }
  }
  
  next();
};

module.exports = {
  dbEncodingConfig,
  httpEncodingConfig,
  emailEncodingConfig,
  logEncodingConfig,
  encodingUtils,
  encodingMiddleware
};