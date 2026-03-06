# WintonEDM 系統說明 (Readme)

## 專案簡介
WintonEDM 是一套專為企業設計的電子報發送管理系統，提供從名單管理、內容製作、審核流程到發送追蹤的一站式解決方案。系統強調高可送達率、嚴謹的審核機制以及友善的操作介面。

## 主要功能

### 1. 郵件發送與追蹤
- 支援多 SMTP 伺服器配置與輪詢。
- 完整的開信 (Open) 與點擊 (Click) 追蹤。
- 自動處理退信 (Bounce) 與取消訂閱 (Unsubscribe)。

### 2. 受眾管理
- 支援 Excel/CSV 批次匯入訂閱者。
- 靈活的標籤與分類管理。
- 黑名單與白名單機制。

### 3. 審核流程 (Approval Workflow)
- 可自定義多級審核流程。
- 支援角色 (Role-based) 與指定人員 (User-based) 審核。
- 整合 Email 與 Slack 通知。

### 4. 頻率控管 (Frequency Capping)
- **全域限制**：設定每位訂閱者在特定週期內 (如 30 天) 最多接收的郵件數量。
- **強制發送**：緊急活動可設定 `force_send` 參數繞過頻率限制。
- **即時預覽**：在活動建立階段即時顯示受頻率限制影響的人數。

### 5. 系統安全
- 雙因子驗證 (2FA)。
- 登入失敗鎖定機制。
- 密碼強度政策強制執行。

## 系統架構
- **後端**：Node.js + Express.js
- **前端**：HTML5 + CSS3 + Vanilla JavaScript (無框架依賴，輕量化)
- **資料庫**：Microsoft SQL Server
- **通訊協定**：RESTful API

## 安裝與執行

### 前置需求
- Node.js (v16+)
- Microsoft SQL Server
- IIS (選用，若需部署為 Windows Service)

### 安裝步驟
1. 複製專案代碼：
   ```bash
   git clone <repository_url>
   cd WintonEDM
   ```
2. 安裝後端依賴：
   ```bash
   cd backend
   npm install
   ```
3. 設定環境變數：
   - 複製 `.env.example` 為 `.env`。
   - 設定資料庫連線字串、JWT 密鑰等資訊。

4. 初始化資料庫：
   - 執行 `scripts/init_db.sql` 建立資料表與預設資料。

### 啟動服務
1. 啟動後端伺服器：
   ```bash
   cd backend
   npm start
   ```
   預設 Port: 3001

2. 啟動前端 (開發模式)：
   可使用 Live Server 或直接部署至 IIS / Nginx。

## 設定說明

### 頻率控管設定
進入「系統設定」->「頻率控管」：
- **啟用/停用**：全域開關。
- **發送上限**：設定週期內最大發送次數 (預設 4 次)。
- **計算週期**：設定時間範圍 (預設 30 天)。
- **排除測試郵件**：測試郵件是否計入額度。

## 常見問題
- **Q: CSS 無法載入？**
  A: 請確認後端 `app.js` 中已設定靜態資源路由 (`/css`, `/js`, `/images`)。

- **Q: 設定儲存無反應？**
  A: 請確認前端 `settings.js` 中已綁定對應的儲存按鈕事件。

## 聯絡資訊
技術支援：support@wintonedm.com
