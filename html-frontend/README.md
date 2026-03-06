# WintonEDM HTML 前端

這是 WintonEDM 電子報管理系統的純 HTML + CSS + Vanilla JavaScript 版本前端。

## 功能特色

- 🎯 **純前端技術**：使用 HTML、CSS 和 Vanilla JavaScript，無需複雜的框架
- 📱 **響應式設計**：支援桌面、平板和手機設備
- 🚀 **輕量快速**：無框架依賴，載入速度快
- 🎨 **現代化 UI**：美觀的用戶界面和流暢的交互體驗
- 🔧 **模組化架構**：清晰的代碼結構，易於維護和擴展

## 頁面功能

### 📊 儀表板 (index.html)
- 系統概覽統計
- 最近活動和訂閱者
- 圖表數據展示

### 👥 訂閱者管理 (subscribers.html)
- 訂閱者列表和搜尋
- 批量操作（匯入、匯出、刪除）
- 標籤和分群管理

### 📧 行銷活動 (campaigns.html)
- 活動創建和管理
- 發送狀態監控
- 批量操作和排程

### 📝 模板管理 (templates.html)
- 模板創建和編輯
- 視覺化模板編輯器
- 模板分類和預覽

### 📈 分析報告 (analytics.html)
- 詳細的數據分析
- 互動式圖表
- 報告匯出功能

### 📊 訂閱者統計 (subscriber-stats.html)
- 訂閱者成長趨勢
- 退訂與刪除名單報表
- 地理分佈與活躍度分析

### ✅ 審核工作流程 (approvals.html)
- 內容審核管理
- 審核歷史記錄
- 受眾數量差異分析 (總數 vs 實際發送數)
- 工作流程設定

### ⚙️ 系統設定 (settings.html)
- 一般設定
- 郵件和 SMTP 設定
- 安全和通知設定
- 第三方整合
- 備份和還原

## 快速開始

### 1. 安裝 Node.js
確保您的系統已安裝 Node.js (版本 14 或以上)。

### 2. 啟動服務器
```bash
# 進入 html-frontend 目錄
cd C:\WintonEDM\html-frontend

# 啟動靜態服務器
npm start
```

### 3. 訪問應用
打開瀏覽器，訪問：http://localhost:8080

## 可用頁面 (預設 HTTP: 8080 / HTTPS: 8443)

- **儀表板**: http://localhost:8080/ 或 http://localhost:8080/index.html
- **訂閱者管理**: http://localhost:8080/subscribers.html
- **行銷活動**: http://localhost:8080/campaigns.html
- **模板管理**: http://localhost:8080/templates.html
- **分析報告**: http://localhost:8080/analytics.html
- **訂閱者統計**: http://localhost:8080/subscriber-stats.html
- **審核工作流程**: http://localhost:8080/approvals.html
- **系統設定**: http://localhost:8080/settings.html
- **取消訂閱**: https://localhost:8443/unsubscribe.html

## 項目結構

```
html-frontend/
├── css/                    # 樣式文件
│   ├── styles.css         # 全域樣式
│   ├── dashboard.css      # 儀表板樣式
│   ├── subscribers.css    # 訂閱者管理樣式
│   ├── campaigns.css      # 行銷活動樣式
│   ├── templates.css      # 模板管理樣式
│   ├── analytics.css      # 分析報告樣式
│   ├── subscriber-stats.css # 訂閱者統計樣式
│   ├── approvals.css      # 審核工作流程樣式
│   └── settings.css       # 系統設定樣式
├── js/                     # JavaScript 文件
│   ├── api.js             # API 調用模組
│   ├── main.js            # 全域 JavaScript
│   ├── dashboard.js       # 儀表板功能
│   ├── subscribers.js     # 訂閱者管理功能
│   ├── campaigns.js       # 行銷活動功能
│   ├── templates.js       # 模板管理功能
│   ├── analytics.js       # 分析報告功能
│   ├── subscriber-stats.js # 訂閱者統計功能
│   ├── approvals.js       # 審核工作流程功能
│   └── settings.js        # 系統設定功能
├── index.html             # 儀表板頁面
├── subscribers.html       # 訂閱者管理頁面
├── campaigns.html         # 行銷活動頁面
├── templates.html         # 模板管理頁面
├── analytics.html         # 分析報告頁面
├── approvals.html         # 審核工作流程頁面
├── settings.html          # 系統設定頁面
├── server.js              # 靜態文件服務器
├── package.json           # 項目配置
└── README.md              # 說明文件
```

## API 整合

### API 配置
API 基礎 URL 在 `js/api.js` 中配置：
```javascript
this.baseURL = 'http://localhost:3001/api'; // 後端 API 基礎 URL
```

### 認證
系統使用 JWT Token 進行認證，Token 會自動存儲在 localStorage 中。

### 可用服務
- `authService` - 認證服務
- `dashboardService` - 儀表板服務
- `subscriberService` - 訂閱者服務
- `campaignService` - 行銷活動服務
- `templateService` - 模板服務
- `analyticsService` - 分析服務
- `approvalService` - 審核服務
- `settingsService` - 設定服務

## 開發說明

### 添加新功能
1. 在對應的 HTML 文件中添加 UI 元素
2. 在對應的 CSS 文件中添加樣式
3. 在對應的 JS 文件中實現功能邏輯
4. 如需 API 調用，使用 `js/api.js` 中的服務

### 樣式指南
- 使用 CSS 變數定義顏色和間距
- 遵循 BEM 命名規範
- 確保響應式設計

### JavaScript 指南
- 使用 ES6+ 語法
- 採用模組化設計
- 適當的錯誤處理
- 清晰的註釋

## 瀏覽器支援

- Chrome 60+
- Firefox 60+
- Safari 12+
- Edge 79+

## 注意事項

1. **開發模式**：當前使用模擬數據，實際部署時需要連接真實的後端 API
2. **CORS 設定**：確保後端 API 正確設定 CORS 標頭
3. **安全性**：生產環境中請使用 HTTPS 和適當的安全措施

## 故障排除

### 常見問題

**Q: 頁面無法載入**
A: 確保服務器正在運行，檢查控制台是否有錯誤訊息

**Q: API 調用失敗**
A: 檢查後端服務是否運行，確認 API URL 配置正確

**Q: 樣式顯示異常**
A: 清除瀏覽器快取，確保 CSS 文件正確載入

### 日誌查看
服務器日誌會顯示所有請求，有助於調試問題。

## 授權

MIT License - 詳見 LICENSE 文件