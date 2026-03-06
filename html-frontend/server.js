// 簡單的靜態文件服務器
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

// 嘗試讀取後端 .env 文件以獲取配置 (僅讀取特定配置，避免污染 PORT)
try {
    const envPath = path.join(__dirname, '../backend/.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split('\n').forEach(line => {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) {
                const key = match[1].trim();
                const value = match[2].trim();
                // 忽略 PORT 配置，避免與後端端口衝突
                if (key !== 'PORT' && !process.env[key]) {
                    process.env[key] = value;
                }
            }
        });
        console.log('已加載後端環境變量配置 (忽略 PORT)');
    }
} catch (e) {
    console.warn('無法讀取 .env 文件:', e.message);
}

class StaticServer {
    constructor(port = 8080, directory = __dirname) {
        this.port = port;
        this.httpsPort = 8443; // 獨立的 HTTPS 端口，避免與後端 (3443) 或其他服務衝突
        this.directory = directory;
        this.mimeTypes = {
            '.html': 'text/html',
            '.css': 'text/css',
            '.js': 'application/javascript',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon',
            '.woff': 'font/woff',
            '.woff2': 'font/woff2',
            '.ttf': 'font/ttf',
            '.eot': 'application/vnd.ms-fontobject'
        };
    }

    getMimeType(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        return this.mimeTypes[ext] || 'application/octet-stream';
    }

    async serveFile(filePath, res) {
        try {
            const stats = await fs.promises.stat(filePath);
            
            if (stats.isFile()) {
                const mimeType = this.getMimeType(filePath);
                const content = await fs.promises.readFile(filePath);
                
                // 對於所有文件禁用緩存 (開發模式)
                const cacheControl = 'no-cache, no-store, must-revalidate';
                
                res.writeHead(200, {
                    'Content-Type': mimeType,
                    'Content-Length': stats.size,
                    'Cache-Control': cacheControl,
                    'Pragma': 'no-cache',
                    'Expires': '0'
                });
                res.end(content);
                return true;
            }
        } catch (error) {
            return false;
        }
        return false;
    }

    async serveDirectory(dirPath, res) {
        try {
            const indexPath = path.join(dirPath, 'index.html');
            return await this.serveFile(indexPath, res);
        } catch (error) {
            return false;
        }
    }

    send404(res, message = 'File not found') {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
            <!DOCTYPE html>
            <html lang="zh-TW">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>404 - 頁面不存在</title>
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        text-align: center; 
                        padding: 50px;
                        background-color: #f5f5f5;
                    }
                    .error-container {
                        max-width: 500px;
                        margin: 0 auto;
                        background: white;
                        padding: 40px;
                        border-radius: 8px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    }
                    h1 { color: #e74c3c; margin-bottom: 20px; }
                    p { color: #666; margin-bottom: 30px; }
                    a { 
                        color: #3498db; 
                        text-decoration: none;
                        padding: 10px 20px;
                        background: #3498db;
                        color: white;
                        border-radius: 4px;
                        display: inline-block;
                    }
                    a:hover { background: #2980b9; }
                </style>
            </head>
            <body>
                <div class="error-container">
                    <h1>404 - 頁面不存在</h1>
                    <p>${message}</p>
                    <a href="/">返回首頁</a>
                </div>
            </body>
            </html>
        `);
    }

    send500(res, error) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
            <!DOCTYPE html>
            <html lang="zh-TW">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>500 - 服務器錯誤</title>
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        text-align: center; 
                        padding: 50px;
                        background-color: #f5f5f5;
                    }
                    .error-container {
                        max-width: 500px;
                        margin: 0 auto;
                        background: white;
                        padding: 40px;
                        border-radius: 8px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    }
                    h1 { color: #e74c3c; margin-bottom: 20px; }
                    p { color: #666; margin-bottom: 30px; }
                    .error-details {
                        background: #f8f9fa;
                        padding: 15px;
                        border-radius: 4px;
                        text-align: left;
                        font-family: monospace;
                        font-size: 12px;
                        color: #666;
                        margin-top: 20px;
                    }
                </style>
            </head>
            <body>
                <div class="error-container">
                    <h1>500 - 伺服器錯誤</h1>
                    <p>伺服器發生內部錯誤</p>
                    <div class="error-details">${error.message}</div>
                </div>
            </body>
            </html>
        `);
    }

    async handleRequest(req, res) {
        try {
            const parsedUrl = url.parse(req.url);
            let pathname = parsedUrl.pathname;
            
            // API 代理邏輯：將 /api 開頭的請求轉發到後端 (預設 3001)
            if (pathname.startsWith('/api')) {
                const backendPort = process.env.BACKEND_PORT || 3001;
                const backendHost = 'localhost';
                
                const options = {
                    hostname: backendHost,
                    port: backendPort,
                    path: req.url,
                    method: req.method,
                    headers: req.headers
                };

                const proxyReq = http.request(options, (proxyRes) => {
                    res.writeHead(proxyRes.statusCode, proxyRes.headers);
                    proxyRes.pipe(res);
                });

                proxyReq.on('error', (e) => {
                    console.error('API Proxy Error:', e);
                    this.send500(res, 'Backend API Proxy Error');
                });

                req.pipe(proxyReq);
                return;
            }

            // 防止路徑遍歷攻擊移除查詢參數和片段
            pathname = pathname.split('?')[0].split('#')[0];

            // 防止路徑遍歷攻擊
            if (pathname.includes('..')) {
                this.send404(res, '無效的路徑');
                return;
            }

            // 根路徑重定向到 dashboard.html
            if (pathname === '/') {
                pathname = '/dashboard.html';
            }

            // 構建完整文件路徑
            const filePath = path.join(this.directory, pathname);

            // 記錄請求
            console.log(`${new Date().toISOString()} - ${req.method} ${pathname}`);

            // 嘗試提供文件
            let fileServed = await this.serveFile(filePath, res);
            if (fileServed) {
                return;
            }

            // 嘗試處理無擴展名的請求 (例如 /unsubscribe -> /unsubscribe.html)
            if (!path.extname(pathname)) {
                const htmlPath = filePath + '.html';
                const htmlServed = await this.serveFile(htmlPath, res);
                if (htmlServed) {
                    return;
                }
            }

            // 如果是目錄，嘗試提供 index.html
            const dirServed = await this.serveDirectory(filePath, res);
            if (dirServed) {
                return;
            }

            // 文件不存在
            this.send404(res);

        } catch (error) {
            console.error('Server error:', error);
            this.send500(res, error);
        }
    }

    async getSSLCertificates() {
        const certDir = path.join(__dirname, '../backend/certs');
        try {
            if (!fs.existsSync(certDir)) return null;
            
            const files = await fs.promises.readdir(certDir);
            
            // 優先尋找 .pfx (取最新的)
            const pfxFiles = files.filter(f => f.endsWith('.pfx')).sort().reverse();
            if (pfxFiles.length > 0) {
                console.log(`找到 SSL PFX 憑證: ${pfxFiles[0]}`);
                return {
                    pfx: await fs.promises.readFile(path.join(certDir, pfxFiles[0]))
                };
            }
            
            // 其次尋找 .key 和 .crt/.cer
            const keyFiles = files.filter(f => f.endsWith('.key')).sort().reverse();
            const certFiles = files.filter(f => f.endsWith('.crt') || f.endsWith('.cer')).sort().reverse();
            
            if (keyFiles.length > 0 && certFiles.length > 0) {
                 console.log(`找到 SSL Key/Cert: ${keyFiles[0]}, ${certFiles[0]}`);
                return {
                    key: await fs.promises.readFile(path.join(certDir, keyFiles[0])),
                    cert: await fs.promises.readFile(path.join(certDir, certFiles[0]))
                };
            }
        } catch (error) {
            console.error('加載 SSL 憑證時發生錯誤:', error);
        }
        return null;
    }

    async start() {
        const requestHandler = (req, res) => {
            // 設置 CORS 標頭
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

            // 處理 OPTIONS 請求
            if (req.method === 'OPTIONS') {
                res.writeHead(200);
                res.end();
                return;
            }

            this.handleRequest(req, res);
        };

        const server = http.createServer(requestHandler);

        server.on('error', (e) => {
            if (e.code === 'EADDRINUSE') {
                console.log(`⚠️ HTTP 端口 ${this.port} 已被佔用，跳過 HTTP 啟動 (HTTPS 仍將嘗試啟動)`);
            } else {
                console.error('❌ HTTP 服務器錯誤:', e);
            }
        });

        server.listen(this.port, () => {
            console.log(`\n🚀 WintonEDM 靜態服務器已啟動`);
            console.log(`📍 HTTP 服務器地址: http://localhost:${this.port}`);
            console.log(`📁 服務目錄: ${this.directory}`);
            console.log(`⏰ 啟動時間: ${new Date().toLocaleString()}`);
            
            console.log(`\n可用頁面:`);
            console.log(`  • 儀表板: http://localhost:${this.port}/dashboard.html`);
            console.log(`  • 訂閱者管理: http://localhost:${this.port}/subscribers.html`);
            console.log(`  • 行銷活動: http://localhost:${this.port}/campaigns.html`);
            console.log(`  • 模板管理: http://localhost:${this.port}/templates.html`);
            console.log(`  • 分析報告: http://localhost:${this.port}/analytics.html`);
            console.log(`  • 訂閱者統計: http://localhost:${this.port}/subscriber-stats.html`);
            console.log(`  • 審核工作流程: http://localhost:${this.port}/approvals.html`);
            console.log(`  • 系統設定: http://localhost:${this.port}/settings.html`);
            console.log(`  • 取消訂閱: http://localhost:${this.port}/unsubscribe`);
            console.log(`\n按 Ctrl+C 停止服務器\n`);
        });

        this.getSSLCertificates().then(sslOptions => {
                if (sslOptions && sslOptions.pfx) {
                    const passwordsToTry = [
                        process.env.SSL_PASSPHRASE,
                        process.env.DB_PASSWORD,
                        'winton',
                        'password'
                    ].filter(p => p !== undefined); // 過濾 undefined
                    
                    // 去重
                    const uniquePasswords = [...new Set(passwordsToTry)];
                    
                    let httpsServer = null;
                    let successPassword = null;

                    for (const pwd of uniquePasswords) {
                        try {
                            // 複製 options 以免修改原始對象
                            const currentOptions = { ...sslOptions, passphrase: pwd };
                            // 嘗試創建 context (這會同步驗證密碼)
                            https.createServer(currentOptions);
                            
                            // 如果沒報錯，說明密碼正確
                            successPassword = pwd;
                            console.log(`✅ SSL 密碼驗證成功: ${pwd ? pwd.substring(0, 2) + '******' : '(空)'}`);
                            httpsServer = https.createServer(currentOptions, requestHandler);
                            break;
                        } catch (e) {
                            if (e.message.includes('unsupported') || e.message.includes('legacy') || e.code === 'ERR_OSSL_EVP_UNSUPPORTED') {
                                console.error('❌ PFX 憑證使用舊版加密算法，Node.js 無法直接讀取。');
                                console.error('👉 請使用以下命令啟動: node --openssl-legacy-provider server.js');
                                // 我們無法繼續嘗試其他密碼，因為這是環境問題
                                break; 
                            }
                            // 忽略密碼錯誤，繼續嘗試下一個
                        }
                    }

                    if (httpsServer) {
                        httpsServer.listen(this.httpsPort, () => {
                            console.log(`🔒 HTTPS 服務器已啟動: https://localhost:${this.httpsPort}`);
                            console.log(`   (支援 https://edm2022.winton.com.tw/unsubscribe 等路徑，需配置 host 或 DNS)`);
                        });
                        
                        process.on('SIGINT', () => {
                            httpsServer.close();
                        });
                    } else {
                        console.error('❌ HTTPS 啟動失敗: 無法解鎖 SSL PFX 憑證 (嘗試了所有已知密碼)');
                        console.error('   請在 .env 中設置正確的 SSL_PASSPHRASE');
                    }
                } else if (sslOptions) {
                     // 非 PFX (Key/Cert)
                     try {
                        const httpsServer = https.createServer(sslOptions, requestHandler);
                        httpsServer.listen(this.httpsPort, () => {
                            console.log(`🔒 HTTPS 服務器已啟動: https://localhost:${this.httpsPort}`);
                        });
                     } catch (e) {
                         console.error('❌ HTTPS 啟動失敗:', e.message);
                     }
                } else {
                    console.log('⚠️ 未找到 SSL 憑證，HTTPS 服務未啟動');
                }
            });

        // 優雅關閉
        process.on('SIGINT', () => {
            console.log('\n正在關閉服務器...');
            server.close(() => {
                console.log('HTTP 服務器已關閉');
                process.exit(0);
            });
        });

        return server;
    }
}

// 如果直接運行此文件，啟動服務器
if (require.main === module) {
    const port = process.env.PORT || 8080;
    const server = new StaticServer(port);
    server.start();
}

module.exports = StaticServer;