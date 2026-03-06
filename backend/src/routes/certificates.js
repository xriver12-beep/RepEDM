const express = require('express');
const router = express.Router();
const { authenticateAdmin, requireAnyAdmin } = require('../middleware/admin-auth');
const { executeQuery } = require('../config/database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// 憑證儲存目錄
const CERT_DIR = path.join(process.cwd(), 'certs');
if (!fs.existsSync(CERT_DIR)) {
    fs.mkdirSync(CERT_DIR, { recursive: true });
}

// Multer 配置
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, CERT_DIR);
    },
    filename: function (req, file, cb) {
        // 保留原始檔名，但在前面加上時間戳以避免衝突
        const uniqueSuffix = Date.now();
        cb(null, `${uniqueSuffix}-${file.originalname}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: function (req, file, cb) {
        const allowedExts = ['.crt', '.cer', '.pfx', '.key', '.pem'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedExts.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('不支援的檔案格式'));
        }
    }
});

const forge = require('node-forge');

// 解析憑證資訊
function parseCertificate(certPath, password) {
    try {
        console.log(`正在解析憑證: ${certPath}, PFX密碼長度: ${password ? password.length : 0}`);
        const fileContent = fs.readFileSync(certPath);
        
        // 嘗試作為 PFX/P12 解析
        if (certPath.endsWith('.pfx') || certPath.endsWith('.p12')) {
            console.log('嘗試解析 PFX/P12...');
            const p12Asn1 = forge.asn1.fromDer(fileContent.toString('binary'));
            const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password || '');
            
            // 尋找憑證包
            let certBag = null;
            const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
            if (certBags[forge.pki.oids.certBag] && certBags[forge.pki.oids.certBag].length > 0) {
                certBag = certBags[forge.pki.oids.certBag][0];
            }
            
            if (!certBag) {
                console.error('PFX 中找不到憑證包');
                throw new Error('No certificate found in PFX');
            }
            
            const cert = certBag.cert;

            // 嘗試提取私鑰
            let keyBag = null;
            const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
            if (keyBags[forge.pki.oids.pkcs8ShroudedKeyBag] && keyBags[forge.pki.oids.pkcs8ShroudedKeyBag].length > 0) {
                keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag][0];
            }
            
            let privateKeyPem = null;
            if (keyBag) {
                console.log('PFX 中找到私鑰');
                const privateKey = keyBag.key;
                privateKeyPem = forge.pki.privateKeyToPem(privateKey);
            } else {
                console.warn('PFX 中找不到私鑰 (可能是單獨的證書包)');
            }

            console.log('PFX 解析成功');
            return {
                subject: '/' + cert.subject.attributes.map(attr => `${attr.shortName}=${attr.value}`).join('/'),
                issuer: '/' + cert.issuer.attributes.map(attr => `${attr.shortName}=${attr.value}`).join('/'),
                validFrom: cert.validity.notBefore,
                validTo: cert.validity.notAfter,
                fingerprint: getFingerprintSafe(cert.publicKey),
                privateKey: privateKeyPem
            };
        } else {
            console.log('嘗試解析 PEM/DER...');
            // PEM/DER
            const x509 = new crypto.X509Certificate(fileContent);
            console.log('PEM/DER 解析成功');
            return {
                subject: x509.subject,
                issuer: x509.issuer,
                validFrom: x509.validFrom,
                validTo: x509.validTo,
                fingerprint: x509.fingerprint
            };
        }
    } catch (error) {
        console.error('憑證解析失敗詳細錯誤:', error);
        return null;
    }
}

function getFingerprintSafe(publicKey) {
    try {
        return forge.pki.getPublicKeyFingerprint(publicKey, {md: forge.md.sha1.create(), encoding: 'hex'});
    } catch (e) {
        console.warn('無法生成指紋:', e);
        return 'Unable to generate fingerprint';
    }
}

// 獲取憑證列表
router.get('/', authenticateAdmin, requireAnyAdmin, async (req, res) => {
    try {
        const result = await executeQuery('SELECT * FROM SSLCertificates ORDER BY uploaded_at DESC');
        res.json({
            success: true,
            data: result.recordset
        });
    } catch (error) {
        console.error('獲取憑證列表失敗:', error);
        res.status(500).json({ success: false, message: '獲取憑證列表失敗' });
    }
});

// 上傳憑證
router.post('/upload', authenticateAdmin, requireAnyAdmin, upload.fields([{ name: 'cert', maxCount: 1 }, { name: 'key', maxCount: 1 }]), async (req, res) => {
    try {
        const files = req.files;
        if (!files.cert) {
            return res.status(400).json({ success: false, message: '請上傳憑證檔案' });
        }

        const certFile = files.cert[0];
        const keyFile = files.key ? files.key[0] : null;
        const password = req.body.password || null;

        // 解析憑證
        const certInfo = parseCertificate(certFile.path, password);
        if (!certInfo) {
            // 解析失敗，刪除檔案
            fs.unlinkSync(certFile.path);
            if (keyFile) fs.unlinkSync(keyFile.path);
            return res.status(400).json({ success: false, message: '無效的憑證檔案或密碼錯誤' });
        }

        // 解析 Common Name
        let commonName = certInfo.subject;
        const cnMatch = certInfo.subject.match(/CN=([^,\n\/]+)/); // Update regex for slash separator
        if (cnMatch) commonName = cnMatch[1];
        
        // 解析 Issuer
        let issuer = certInfo.issuer;
        const issuerMatch = certInfo.issuer.match(/O=([^,\n\/]+)/);
        if (issuerMatch) issuer = issuerMatch[1];

        // 如果從 PFX 中提取到了私鑰，將其存為 .key 檔案
        let finalKeyFilename = keyFile ? keyFile.filename : '';
        if (certInfo.privateKey && !keyFile) {
            const keyFilename = certFile.filename.replace(/\.(pfx|p12)$/i, '.key');
            const keyPath = path.join(CERT_DIR, keyFilename);
            fs.writeFileSync(keyPath, certInfo.privateKey);
            finalKeyFilename = keyFilename;
            console.log(`已從 PFX 提取私鑰並儲存為: ${keyFilename}`);
        }

        // 存入資料庫
        await executeQuery(`
            INSERT INTO SSLCertificates (common_name, issuer, valid_from, valid_to, cert_filename, key_filename, uploaded_by, passphrase)
            VALUES (@cn, @issuer, @validFrom, @validTo, @certFile, @keyFile, @userId, @passphrase)
        `, {
            cn: commonName,
            issuer: issuer,
            validFrom: new Date(certInfo.validFrom),
            validTo: new Date(certInfo.validTo),
            certFile: certFile.filename,
            keyFile: finalKeyFilename,
            userId: req.user.adminUserID || req.user.id,
            passphrase: password
        });

        res.json({ success: true, message: '憑證上傳成功' });

    } catch (error) {
        console.error('憑證上傳失敗:', error);
        res.status(500).json({ success: false, message: '憑證上傳失敗: ' + error.message });
    }
});

// 綁定憑證
router.post('/:id/bind', authenticateAdmin, requireAnyAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        
        // 檢查憑證是否存在
        const certCheck = await executeQuery('SELECT * FROM SSLCertificates WHERE id = @id', { id });
        if (certCheck.recordset.length === 0) {
            return res.status(404).json({ success: false, message: '找不到憑證' });
        }
        const cert = certCheck.recordset[0];

        // 檢查是否有私鑰 (必須有私鑰才能綁定為 HTTPS 憑證)
        if (!cert.key_filename) {
            return res.status(400).json({ success: false, message: '此憑證沒有關聯的私鑰，無法綁定' });
        }

        // 更新資料庫狀態
        await executeQuery('UPDATE SSLCertificates SET is_active = 0'); // 先全部設為非啟用
        await executeQuery('UPDATE SSLCertificates SET is_active = 1 WHERE id = @id', { id });

        // 更新系統設定中的 active_cert_id (可選，如果只靠 is_active 欄位判斷也行)
        // 這裡為了雙重保險或方便快速讀取，可以寫入 SystemSettings
        await executeQuery(`
            MERGE SystemSettings AS target
            USING (SELECT 'ssl.active_cert_id' AS SettingKey, @value AS SettingValue) AS source
            ON target.SettingKey = source.SettingKey
            WHEN MATCHED THEN
                UPDATE SET SettingValue = source.SettingValue, UpdatedAt = GETDATE()
            WHEN NOT MATCHED THEN
                INSERT (SettingKey, SettingValue, Description)
                VALUES (source.SettingKey, source.SettingValue, '當前使用的 SSL 憑證 ID');
        `, { value: id.toString() });

        res.json({ success: true, message: '憑證綁定成功，請重啟伺服器以生效' });

    } catch (error) {
        console.error('綁定憑證失敗:', error);
        res.status(500).json({ success: false, message: '綁定憑證失敗' });
    }
});

// 刪除憑證
router.delete('/:id', authenticateAdmin, requireAnyAdmin, async (req, res) => {
    try {
        const id = req.params.id;

        // 獲取檔案名
        const certResult = await executeQuery('SELECT * FROM SSLCertificates WHERE id = @id', { id });
        if (certResult.recordset.length === 0) {
            return res.status(404).json({ success: false, message: '找不到憑證' });
        }
        const cert = certResult.recordset[0];

        if (cert.is_active) {
            return res.status(400).json({ success: false, message: '無法刪除正在使用的憑證' });
        }

        // 刪除檔案
        const certPath = path.join(CERT_DIR, cert.cert_filename);
        if (fs.existsSync(certPath)) fs.unlinkSync(certPath);

        if (cert.key_filename) {
            const keyPath = path.join(CERT_DIR, cert.key_filename);
            if (fs.existsSync(keyPath)) fs.unlinkSync(keyPath);
        }

        // 刪除資料庫記錄
        await executeQuery('DELETE FROM SSLCertificates WHERE id = @id', { id });

        res.json({ success: true, message: '憑證刪除成功' });

    } catch (error) {
        console.error('刪除憑證失敗:', error);
        res.status(500).json({ success: false, message: '刪除憑證失敗' });
    }
});

// 上傳 SMTP CA 憑證
router.post('/ca', authenticateAdmin, requireAnyAdmin, upload.single('caFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: '請上傳 CA 檔案' });
        }

        // 讀取檔案內容
        const caContent = fs.readFileSync(req.file.path, 'utf8');

        // 儲存到 SystemSettings
        await executeQuery(`
            MERGE SystemSettings AS target
            USING (SELECT 'smtp.ca_cert' AS SettingKey, @value AS SettingValue) AS source
            ON target.SettingKey = source.SettingKey
            WHEN MATCHED THEN
                UPDATE SET SettingValue = source.SettingValue, UpdatedAt = GETDATE()
            WHEN NOT MATCHED THEN
                INSERT (SettingKey, SettingValue, Description)
                VALUES (source.SettingKey, source.SettingValue, 'SMTP 企業 CA 憑證內容');
        `, { value: caContent });

        // 刪除暫存檔案
        fs.unlinkSync(req.file.path);

        res.json({ success: true, message: 'CA 憑證儲存成功', data: caContent });

    } catch (error) {
        console.error('CA 上傳失敗:', error);
        res.status(500).json({ success: false, message: 'CA 上傳失敗' });
    }
});

// 獲取 SMTP CA 憑證
router.get('/ca', authenticateAdmin, requireAnyAdmin, async (req, res) => {
    try {
        const result = await executeQuery("SELECT SettingValue FROM SystemSettings WHERE SettingKey = 'smtp.ca_cert'");
        const caContent = result.recordset.length > 0 ? result.recordset[0].SettingValue : '';
        
        res.json({ success: true, data: caContent });
    } catch (error) {
        console.error('獲取 CA 失敗:', error);
        res.status(500).json({ success: false, message: '獲取 CA 失敗' });
    }
});

module.exports = router;
