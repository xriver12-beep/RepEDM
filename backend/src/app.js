const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const https = require('https');
const fs = require('fs');
const forge = require('node-forge');
require('dotenv').config();

// 編碼配置
const { encodingMiddleware } = require('./config/encoding');

const { connectDB, executeQuery } = require('./config/database');
const { errorHandler } = require('./middleware/errorHandler');
const authRoutes = require('./routes/auth');
const adminAuthRoutes = require('./routes/admin-auth');
const adminUserRoutes = require('./routes/admin-users');
const userRoutes = require('./routes/users');
const subscriberRoutes = require('./routes/subscribers');
const categoriesRoutes = require('./routes/categories');
const campaignRoutes = require('./routes/campaigns');
const templateRoutes = require('./routes/templates');
const templateModernRoutes = require('./routes/templates_modern');
const assetRoutes = require('./routes/assets');
const analyticsRoutes = require('./routes/analytics');
const trackingRoutes = require('./routes/tracking');
const approvalRoutes = require('./routes/approvals');
const workflowRoutes = require('./routes/workflow');
const delegationRoutes = require('./routes/delegations');
const settingsRoutes = require('./routes/settings');
const reviewerRoutes = require('./routes/reviewers');
const dashboardRoutes = require('./routes/dashboard');
const certificateRoutes = require('./routes/certificates');
const queueRoutes = require('./routes/queue');
const trafficControlRoutes = require('./routes/traffic-control');
const schedulerService = require('./services/scheduler-service');

const app = express();
const PORT = process.env.PORT || 3001;

// 基本中間件
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      fontSrc: ["'self'", "https:", "data:"],
      imgSrc: ["'self'", "data:", "https:", "http:"],
      connectSrc: ["'self'", "http:", "https:"],
    },
  },
}));
app.use(cors({
  origin: true, // 允許所有來源，解決內部網路 hostname (如 edm2022) 的 CORS 問題
  credentials: true
}));
app.use(compression());
app.use(morgan('combined'));

// 編碼中間件（確保中文字符正確處理）
app.use(encodingMiddleware);

// 速率限制
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 分鐘
  max: process.env.NODE_ENV === 'production' ? 100 : 10000, // 生產環境100個請求，開發環境10000個請求
  message: JSON.stringify({
    success: false,
    message: '請求過於頻繁，請稍後再試'
  }),
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// 解析 JSON 和 URL 編碼的請求體（支援 UTF-8）
app.use(express.json({ 
  limit: '10mb',
  type: 'application/json'
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb',
  parameterLimit: 1000,
  type: 'application/x-www-form-urlencoded'
}));

// 靜態檔案服務
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
// 服務默認EDM資源
app.use('/default-assets', express.static(path.join(__dirname, '../../Template')));
// 服務前端靜態檔案 (讓 HTTPS 伺服器可以提供前端頁面)
app.use(express.static(path.join(__dirname, '../../html-frontend'), {
  extensions: ['html', 'htm']
}));

// API 路由
app.use('/api/auth', authRoutes);
app.use('/api/admin-auth', adminAuthRoutes);
app.use('/api/admin-users', adminUserRoutes);
app.use('/api/users', userRoutes);
app.use('/api/subscribers', subscriberRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/templates-modern', templateModernRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/workflow', workflowRoutes);
app.use('/api/delegations', delegationRoutes);
app.use('/api/settings/certificates', certificateRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/reviewers', reviewerRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/traffic-control', trafficControlRoutes);

// 健康檢查端點
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 404 處理
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: '找不到請求的資源'
  });
});

// 錯誤處理中介軟體
app.use(errorHandler);

// 全局錯誤捕獲 (防止伺服器崩潰)
process.on('uncaughtException', (err) => {
  console.error('🔥 未捕獲的異常 (Uncaught Exception):', err);
  // 記錄錯誤但不退出，或者進行優雅關閉
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 未處理的 Promise 拒絕 (Unhandled Rejection):', reason);
});

// 啟動伺服器
async function startServer() {
  try {
    // 連接資料庫
    const dbPool = await connectDB();
    app.locals.db = dbPool;
    console.log('✅ 資料庫連接成功');

    // 啟動排程服務
    schedulerService.start();

    // 檢查是否有啟用的 HTTPS 憑證
    let httpsOptions = null;
    try {
        const certResult = await executeQuery('SELECT * FROM SSLCertificates WHERE is_active = 1');
        if (certResult.recordset && certResult.recordset.length > 0) {
            const cert = certResult.recordset[0];
            const certDir = path.join(process.cwd(), 'certs');
            const certPath = path.join(certDir, cert.cert_filename);
            
            if (fs.existsSync(certPath)) {
                if (cert.cert_filename.endsWith('.pfx') || cert.cert_filename.endsWith('.p12')) {
                    try {
                        // 使用 forge 轉換 PFX 為 PEM，以避免 Node.js 對舊版加密演算法的支援問題
                        const pfxContent = fs.readFileSync(certPath);
                        const p12Asn1 = forge.asn1.fromDer(pfxContent.toString('binary'));
                        const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, cert.passphrase || '');
                        
                        let certPem = null;
                        let keyPem = null;

                        // 獲取憑證
                        const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
                        if (certBags[forge.pki.oids.certBag] && certBags[forge.pki.oids.certBag].length > 0) {
                            certPem = forge.pki.certificateToPem(certBags[forge.pki.oids.certBag][0].cert);
                        }

                        // 獲取私鑰
                        const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
                        if (keyBags[forge.pki.oids.pkcs8ShroudedKeyBag] && keyBags[forge.pki.oids.pkcs8ShroudedKeyBag].length > 0) {
                            keyPem = forge.pki.privateKeyToPem(keyBags[forge.pki.oids.pkcs8ShroudedKeyBag][0].key);
                        }

                        if (certPem && keyPem) {
                            httpsOptions = {
                                cert: certPem,
                                key: keyPem
                            };
                            console.log('🔒 已載入 HTTPS 憑證 (PFX -> PEM):', cert.common_name);
                        } else {
                            throw new Error('無法從 PFX 提取完整的憑證和私鑰');
                        }
                    } catch (pfxError) {
                        console.warn('PFX 轉換失敗，嘗試使用原生 PFX 載入:', pfxError.message);
                        httpsOptions = {
                            pfx: fs.readFileSync(certPath),
                            passphrase: cert.passphrase || ''
                        };
                        console.log('🔒 已載入 HTTPS 憑證 (PFX Native):', cert.common_name);
                    }
                } else {
                    const keyPath = path.join(certDir, cert.key_filename);
                    if (fs.existsSync(keyPath)) {
                        httpsOptions = {
                            cert: fs.readFileSync(certPath),
                            key: fs.readFileSync(keyPath)
                        };
                        console.log('🔒 已載入 HTTPS 憑證 (PEM):', cert.common_name);
                    } else {
                        console.warn('⚠️ 私鑰檔案遺失:', cert.key_filename);
                    }
                }
            } else {
                console.warn('⚠️ 憑證檔案遺失:', cert.common_name);
            }
        }
    } catch (err) {
        console.error('檢查憑證失敗:', err);
    }

    // 啟動 HTTPS 伺服器 (如果有憑證)
    if (httpsOptions) {
        const HTTPS_PORT = process.env.HTTPS_PORT || 3443;
        https.createServer(httpsOptions, app).listen(HTTPS_PORT, '0.0.0.0', () => {
             console.log(`🚀 HTTPS 伺服器運行在 https://0.0.0.0:${HTTPS_PORT} (管理後台 + 前台發送)`);
        });

        // --- 獨立追蹤伺服器 (Port 分流) ---
        // 如果設定了 TRACKING_PORT，則啟動獨立的追蹤伺服器
        // 用途：提供開信/點擊追蹤、取消訂閱頁面、圖片資源
        // 安全性：此 Port 不掛載登入與管理 API，即使對外開放也無法登入
        if (process.env.TRACKING_PORT) {
            const trackingApp = express();
            const TRACKING_PORT = process.env.TRACKING_PORT;

            // 1. 基礎中間件 (與主 App 類似，但精簡)
            trackingApp.use(helmet({
                crossOriginResourcePolicy: { policy: "cross-origin" },
                contentSecurityPolicy: {
                    directives: {
                        defaultSrc: ["'self'"],
                        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net"],
                        styleSrc: ["'self'", "'unsafe-inline'", "https:"],
                        imgSrc: ["'self'", "data:", "https:", "http:"],
                        connectSrc: ["'self'", "http:", "https:"],
                    },
                },
            }));
            trackingApp.use(cors({ origin: true, credentials: true }));
            trackingApp.use(compression());
            trackingApp.use(morgan('combined'));
            trackingApp.use(encodingMiddleware);
            
            // 2. 解析器
            trackingApp.use(express.json({ limit: '1mb' }));
            trackingApp.use(express.urlencoded({ extended: true, limit: '1mb' }));

            // 3. 靜態檔案服務 (關鍵：必須提供圖片與前端頁面)
            // 讓外部能讀取上傳的圖片
            trackingApp.use('/uploads', express.static(path.join(__dirname, '../uploads')));
            // 讓外部能讀取預設素材
            trackingApp.use('/default-assets', express.static(path.join(__dirname, '../../Template')));
            // 讓外部能訪問 unsubscribe.html
            // 限制：僅提供 unsubscribe.html，不暴露其他前端頁面 (如 login.html)
            const frontendDir = path.join(__dirname, '../../html-frontend');
            
            trackingApp.get('/unsubscribe', (req, res) => {
                res.sendFile(path.join(frontendDir, 'unsubscribe.html'));
            });
            
            trackingApp.get('/unsubscribe.html', (req, res) => {
                res.sendFile(path.join(frontendDir, 'unsubscribe.html'));
            });

            // 4. 只掛載追蹤相關路由
            trackingApp.use('/api/tracking', trackingRoutes);

            // 5. 健康檢查
            trackingApp.get('/health', (req, res) => res.json({ status: 'OK', service: 'tracking-only' }));

            // 6. 啟動追蹤 HTTPS 伺服器 (共用憑證)
            https.createServer(httpsOptions, trackingApp).listen(TRACKING_PORT, '0.0.0.0', () => {
                console.log(`🚀 追蹤專用伺服器運行在 https://0.0.0.0:${TRACKING_PORT} (僅開放追蹤與資源)`);
            });
        }
    }

    // 總是啟動 HTTP 伺服器
    app.listen(PORT, () => {
      console.log(`🚀 HTTP 伺服器運行在 http://localhost:${PORT}`);
      console.log(`📊 健康檢查: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('❌ 伺服器啟動失敗:', error);
    process.exit(1);
  }
}

// 優雅關閉
process.on('SIGTERM', () => {
  console.log('收到 SIGTERM 信號，正在關閉伺服器...');
  schedulerService.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('收到 SIGINT 信號，正在關閉伺服器...');
  schedulerService.stop();
  process.exit(0);
});

startServer();
 
 module.exports = app;