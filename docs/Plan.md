# WintonEDM 電子報管理系統開發計劃

## 專案概述
基於舊版EDM系統的現代化重構，提供完整的電子報管理、發送和分析功能。

## 核心功能模組

### 1. 用戶管理系統
- [x] 用戶註冊、登入、權限管理
- [x] 角色權限控制 (RBAC)
- [x] 用戶資料管理
- [ ] 多層級組織架構支援

### 2. 訂閱者管理系統
- [x] 訂閱者資料 CRUD 操作
- [x] 批量 Email 修正功能 (Bulk Email Correction)
- [ ] 訂閱者分群功能
- [ ] 標籤管理系統
- [ ] 訂閱偏好設定
- [x] 退訂管理 (含自動 Soft Delete 與報表)
  - [x] 一鍵取消訂閱 (One-Click Unsubscribe) - 狀態標記為 `unsubscribed`
  - [x] 訂閱者統計報表 (狀態/來源/分頁/搜尋)
- [ ] 黑名單管理

### 3. 電子報模板系統
- [ ] 拖拉式編輯器
- [ ] 預設模板庫
- [ ] 自定義模板
- [ ] 模板版本控制
- [ ] 響應式設計支援

### 4. 電子報審核機制 ⭐ **新增功能**
- [x] **審核工作流程設計**
  - 草稿 → 待審核 → 審核中 → 已核准 → 已發送
  - 審核 → 退回修改 → 重新提交
- [x] **多層級審核機制**
  - [x] 初級審核（內容審核）
  - [x] 高級審核（主管核准）
  - [x] 緊急發送審核流程
- [x] **審核權限管理**
  - [x] 審核員角色設定
  - [x] 審核權限分級
  - [x] 審核範圍限制（部門、專案）
- [x] **審核介面功能**
  - [x] 待審核電子報列表
  - [x] 電子報預覽功能
  - [x] 審核意見留言系統
  - [x] 審核歷史記錄
- [x] **通知機制**
  - [x] 提交審核通知
  - [x] 審核結果通知
  - [x] 逾期審核提醒
  - [x] Email/系統內通知

### 5. 電子報發送系統
- [ ] 即時發送功能
- [ ] 排程發送功能
- [ ] 分批發送機制
- [ ] 發送狀態追蹤
- [x] **精準受眾計算 (排除無效/退訂/刪除)**
- [x] **發送速率限制 (Throttling)**
- [x] **IP 預熱機制 (Warm-up)**
- [x] **智慧分流與佇列管理 (Smart Queueing)**
- [x] **發送頻率控管 (Frequency Capping)**
- [x] **審核通過後自動發送**
- [x] **緊急發送機制（特殊審核流程）**
- [x] **優先級發送管理 (普通/高/緊急)**

### 6. 素材管理系統
- [x] 圖片上傳功能
- [x] 素材分類管理
- [x] 素材版本控制
- [x] 素材使用追蹤

### 7. 統計分析系統
- [x] 基礎分析API
- [x] 開信率統計
- [x] 點擊率分析
- [x] 退訂率分析 (含退訂名單報表與搜尋/分頁)
- [x] 發送成功/失敗率統計
- [x] 地理位置分析 (發送者網域統計)
- [x] 設備類型分析 (含圖表優化)
- [x] **最佳發送時間分析**
- [x] **自定義日期範圍篩選 (Custom Date Range)** - 郵件日誌預設載入一週數據
- [x] **多圖表連動更新機制**
- [x] **數據趨勢摘要面板 (Trend Summary Panel)**
- [ ] **審核效率分析**
- [ ] **審核時間統計**

### 8. 追蹤系統
- [x] 開信追蹤
- [x] 點擊追蹤
- [x] 退訂追蹤 (狀態標記為 `unsubscribed`)

## 技術架構

### 後端技術棧
- Node.js + Express.js
- SQL Server 資料庫
- JWT 身份驗證
- Multer 檔案上傳
- Nodemailer 郵件發送

### 前端技術棧
- HTML5 + CSS3
- Vanilla JavaScript (ES6+)
- 響應式設計 (Responsive Design)
- 內建靜態資源伺服器 (Static Server)
- 拖拉式編輯器組件

### 資料庫設計

#### 審核相關資料表
```sql
-- 審核工作流程表
CREATE TABLE ApprovalWorkflows (
    WorkflowID INT PRIMARY KEY IDENTITY(1,1),
    WorkflowName NVARCHAR(100) NOT NULL,
    Description NVARCHAR(500),
    IsActive BIT DEFAULT 1,
    CreatedAt DATETIME2 DEFAULT GETDATE()
);

-- 審核步驟表
CREATE TABLE ApprovalSteps (
    StepID INT PRIMARY KEY IDENTITY(1,1),
    WorkflowID INT FOREIGN KEY REFERENCES ApprovalWorkflows(WorkflowID),
    StepOrder INT NOT NULL,
    StepName NVARCHAR(100) NOT NULL,
    RequiredRole NVARCHAR(50),
    IsRequired BIT DEFAULT 1,
    TimeoutHours INT DEFAULT 24
);

-- 電子報審核記錄表
CREATE TABLE CampaignApprovals (
    ApprovalID INT PRIMARY KEY IDENTITY(1,1),
    CampaignID INT FOREIGN KEY REFERENCES Campaigns(CampaignID),
    WorkflowID INT FOREIGN KEY REFERENCES ApprovalWorkflows(WorkflowID),
    CurrentStepID INT FOREIGN KEY REFERENCES ApprovalSteps(StepID),
    Status NVARCHAR(20) DEFAULT 'Pending', -- Pending, Approved, Rejected, InProgress
    SubmittedBy INT FOREIGN KEY REFERENCES Users(UserID),
    SubmittedAt DATETIME2 DEFAULT GETDATE(),
    CompletedAt DATETIME2 NULL
);

-- 審核步驟記錄表
CREATE TABLE ApprovalStepRecords (
    RecordID INT PRIMARY KEY IDENTITY(1,1),
    ApprovalID INT FOREIGN KEY REFERENCES CampaignApprovals(ApprovalID),
    StepID INT FOREIGN KEY REFERENCES ApprovalSteps(StepID),
    ReviewerID INT FOREIGN KEY REFERENCES Users(UserID),
    Action NVARCHAR(20), -- Approved, Rejected, Returned
    Comments NVARCHAR(1000),
    ActionAt DATETIME2 DEFAULT GETDATE()
);
```

## 開發階段規劃

### Phase 1: 基礎架構完善 (已完成)
- [x] 後端API架構
- [x] 前端基礎框架
- [x] 資料庫連接
- [x] 基本路由設置

### Phase 2: 核心功能開發 (大部分完成)
- [x] 訂閱者管理系統
- [x] 電子報模板系統 (基礎功能)
- [x] **電子報審核機制** ⭐
- [x] 發送系統基礎功能

### Phase 3: 進階功能開發
- [x] 統計分析完善 (圖表優化與自訂篩選 - 營業單位/城市)
- [x] 素材管理系統
- [ ] 權限系統優化
- [ ] **審核流程優化**

### Phase 4: 系統優化與部署
- [ ] 效能優化 (資料庫查詢優化、快取機制強化)
- [ ] 安全性加強
- [ ] 部署配置
- [ ] **審核機制壓力測試**

### Phase 5: 未來擴展規劃 (Future Roadmap)
- [ ] **進階分眾 (Advanced Segmentation)**：基於行為 (開信/點擊) 的動態受眾篩選。
- [ ] **A/B 測試 (A/B Testing)**：主旨、內容 A/B 測試與自動優化。
- [ ] **多租戶支援 (Multi-tenancy)**：支援多組織/多部門獨立架構。
- [ ] **AI 輔助 (AI Integration)**：AI 建議主旨、最佳發送時間預測。
- [ ] **API 擴充**：提供完整 RESTful API 供第三方系統整合。

## 電子報審核機制詳細設計

### 審核流程設計
1. **提交審核**
   - 編輯完成的電子報提交審核
   - 系統自動分配審核工作流程
   - 通知相關審核人員

2. **初級審核**
   - 內容合規性檢查
   - 格式規範驗證
   - 基本資訊確認

3. **高級審核**
   - 主管最終核准
   - 發送時間確認
   - 目標受眾驗證

4. **審核結果處理**
   - 核准：進入發送佇列
   - 退回：返回編輯狀態
   - 拒絕：標記為已拒絕

### 審核介面功能
- **審核儀表板**：顯示待審核項目統計
- **審核列表**：可篩選、排序的審核項目
- **預覽功能**：完整的電子報預覽
- **批量操作**：批量審核多個項目
- **審核歷史**：完整的審核軌跡記錄

### 通知機制
- **即時通知**：系統內即時通知
- **Email通知**：重要審核節點Email提醒
- **逾期提醒**：審核逾期自動提醒
- **狀態更新**：審核狀態變更通知

## 部署注意事項
- 資料庫連接配置
- 環境變數設置
- SMTP服務配置
- 檔案上傳路徑配置
- **審核權限初始化**
- **審核工作流程預設配置**

## 安全考量
- JWT Token 安全
- 資料庫注入防護
- 檔案上傳安全
- **審核權限驗證**
- **審核日誌記錄**
- **敏感操作雙重驗證**