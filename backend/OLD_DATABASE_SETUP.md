# 舊資料庫匯入配置指南

## 概述
此指南將幫助您配置舊 EDM 主機資料庫的連接，以便將 378,135 筆 member 資料匯入到新的 WintonEDM 系統中。

## 前置需求
1. 舊 EDM 主機資料庫必須可以訪問
2. 資料庫中必須包含 `member` 表
3. 需要有適當的資料庫訪問權限

## 配置步驟

### 1. 更新環境變數
請在 `.env` 文件中更新以下舊資料庫配置參數：

```env
# 舊資料庫配置（用於資料匯入）
OLD_DB_SERVER=your_old_database_host    # 舊資料庫主機地址
OLD_DB_PORT=3306                        # 資料庫端口（MySQL 預設 3306）
OLD_DB_NAME=your_database_name          # 資料庫名稱
OLD_DB_USER=your_username               # 資料庫用戶名
OLD_DB_PASSWORD=your_password           # 資料庫密碼
OLD_DB_TYPE=mysql                       # 資料庫類型
```

### 2. 常見配置範例

#### MySQL 資料庫
```env
OLD_DB_SERVER=localhost
OLD_DB_PORT=3306
OLD_DB_NAME=edm_database
OLD_DB_USER=edm_user
OLD_DB_PASSWORD=your_secure_password
OLD_DB_TYPE=mysql
```

#### 遠程 MySQL 資料庫
```env
OLD_DB_SERVER=192.168.1.100
OLD_DB_PORT=3306
OLD_DB_NAME=edm_production
OLD_DB_USER=readonly_user
OLD_DB_PASSWORD=readonly_password
OLD_DB_TYPE=mysql
```

### 3. 資料庫權限需求
確保配置的資料庫用戶具有以下權限：
- `SELECT` 權限在 `member` 表上
- `SHOW TABLES` 權限
- `INFORMATION_SCHEMA` 訪問權限

### 4. 測試連接
配置完成後，執行以下命令測試連接：

```bash
node test-db-connection.js
```

成功的輸出應該類似：
```
=== 資料庫連接測試 ===

1. 測試新資料庫連接 (SQL Server)...
✅ 新資料庫連接成功
   目前 Subscribers 表中有 X 筆資料

2. 測試舊資料庫連接 (MySQL)...
✅ 舊資料庫連接成功
✅ member 表存在
   資料數量: 378,135 筆
   有效 email 數量: XXX,XXX 筆
```

## 故障排除

### 連接被拒絕 (Connection refused)
- 檢查資料庫服務器是否運行
- 確認端口號是否正確
- 檢查防火牆設置

### 訪問被拒絕 (Access denied)
- 確認用戶名和密碼是否正確
- 檢查用戶是否有訪問該資料庫的權限
- 確認用戶是否允許從當前 IP 連接

### 資料庫不存在
- 確認資料庫名稱是否正確
- 檢查用戶是否有訪問該資料庫的權限

### member 表不存在
- 確認表名是否為 `member`（區分大小寫）
- 檢查是否在正確的資料庫中

## 資料匯入流程

配置完成並測試成功後，可以執行以下步驟進行資料匯入：

### 1. 小批量測試匯入
```bash
node import-member-data.js --test --limit=100
```

### 2. 完整資料匯入
```bash
node import-member-data.js
```

## 預期結果

匯入完成後，您應該看到：
- 成功匯入的記錄數量
- 跳過的重複記錄數量
- 錯誤記錄數量
- 總處理記錄數量

## 資料對應關係

舊資料庫 `member` 表的欄位將對應到新系統 `Subscribers` 表：

| 舊欄位 | 新欄位 | 說明 |
|--------|--------|------|
| email | email | 主要識別欄位 |
| name | first_name, last_name | 自動分割姓名 |
| company | custom_fields.company | 存儲在自定義欄位中 |
| birthday | custom_fields.birthday | 存儲在自定義欄位中 |
| f1-f6 | custom_fields.f1-f6 | 保留原始自定義欄位 |
| cust_id | custom_fields.cust_id | 客戶ID |
| id | custom_fields.original_id | 原始記錄ID |

## 注意事項

1. **備份**: 在執行匯入前，建議備份目標資料庫
2. **測試**: 先在測試環境中執行小批量匯入
3. **監控**: 匯入過程中監控系統資源使用情況
4. **驗證**: 匯入完成後驗證資料完整性

## 支援

如果遇到問題，請檢查：
1. 錯誤日誌
2. 資料庫連接狀態
3. 網絡連接
4. 權限設置

需要進一步協助，請提供詳細的錯誤信息。