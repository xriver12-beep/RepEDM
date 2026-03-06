# 滿意度投票 / Emoji 反饋功能系統分析與設計方案

**版本**: 1.0  
**日期**: 2026-02-02  
**狀態**: 規劃中 (Planned)

## 1. 功能概述 (Overview)

本功能旨在為電子報 (EDM) 增加一個輕量級的互動機制，讓讀者能通過點擊郵件中的表情符號（如 👍 / 👎）快速反饋對內容的滿意度。這不僅能收集直觀的用戶偏好數據，還能通過「漸進式剖析」(Progressive Profiling) 進一步引導用戶留下具體評論。

### 核心目標
1.  **直觀反饋**：降低用戶互動門檻，提升參與率。
2.  **數據準確性**：排除機器人掃描造成的無效數據。
3.  **深度洞察**：收集量化（評分）與質化（評論）數據。

---

## 2. 系統架構設計 (System Architecture)

### 2.1 資料庫設計 (Database Schema)

新增 `EmailFeedback` 資料表，獨立於點擊記錄 (`EmailClicks`)，以便於專門管理反饋數據。

```sql
CREATE TABLE EmailFeedback (
    id INT IDENTITY(1,1) PRIMARY KEY,
    campaign_id INT NOT NULL,           -- 關聯活動
    subscriber_id INT NOT NULL,         -- 關聯訂閱者
    tracking_id NVARCHAR(50) NOT NULL,  -- 關聯發送記錄 (用於驗證與去重)
    feedback_type NVARCHAR(50) NOT NULL,-- 反饋類型 (例如: 'satisfaction', 'nps')
    feedback_value NVARCHAR(50) NOT NULL,-- 反饋值 (例如: 'like', 'dislike', '5')
    comments NVARCHAR(MAX),             -- 用戶追加的文字評論
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    ip_address NVARCHAR(50),
    user_agent NVARCHAR(500),
    is_valid BIT DEFAULT 1,             -- 標記是否為有效投票 (用於過濾機器人)
    
    FOREIGN KEY (campaign_id) REFERENCES Campaigns(id) ON DELETE CASCADE,
    FOREIGN KEY (subscriber_id) REFERENCES Subscribers(id)
);

-- 索引優化
CREATE INDEX IDX_EmailFeedback_Tracking ON EmailFeedback(tracking_id);
CREATE INDEX IDX_EmailFeedback_Campaign ON EmailFeedback(campaign_id) INCLUDE (feedback_value);
```

### 2.2 API 接口設計 (API Specification)

後端 `tracking.js` 將新增以下端點：

#### A. 提交投票 (POST /api/tracking/feedback)
*   **用途**: 接收前端頁面傳來的投票請求。
*   **機制**: 採用 POST 方法，配合前端 JS 延遲發送，有效防止郵件掃描機器人誤觸。
*   **Payload**: `{ trackingId, value, type }`

#### B. 提交評論 (POST /api/tracking/feedback/comment)
*   **用途**: 接收用戶在感謝頁面填寫的追加評論。
*   **Payload**: `{ trackingId, comment }`

### 2.3 前端交互流程 (Frontend Flow)

為了最大化兼容性並防止機器人干擾，採用「兩階段確認」流程：

1.  **郵件端 (Email Client)**:
    *   顯示靜態圖片連結 (CDN Icons)，確保在 Outlook 等舊版軟體中顯示正常。
    *   連結指向前端中轉頁面：`https://domain/feedback.html?t={id}&v=like`。

2.  **瀏覽器端 (Landing Page - feedback.html)**:
    *   **載入階段**: 頁面載入後，顯示「處理中...」動畫。
    *   **機器人過濾**: 透過 JavaScript 執行 `fetch` 請求呼叫後端 API。由於大多數郵件掃描機器人只爬取 HTML 而不會執行複雜 JS 或發送 POST 請求，此舉能過濾 95% 以上的無效點擊。
    *   **成功狀態**: API 回傳成功後，顯示「感謝投票」及動態評論框。

---

## 3. 關鍵挑戰與解決方案 (Challenges & Solutions)

### 3.1 防範連結掃描機器人 (Link Scanners)
*   **挑戰**: 企業郵件網關 (如 Microsoft Defender) 會自動點擊郵件內所有連結以檢查安全性，導致數據庫充滿虛假投票。
*   **解決方案**: **「前端延遲寫入模式」 (Frontend Deferred Write)**
    *   郵件中的連結**不直接寫入資料庫**。
    *   連結只開啟一個帶有 Token 的網頁。
    *   只有當該網頁在真實瀏覽器中執行 JavaScript 並回傳 POST 請求時，才視為有效投票。

### 3.2 郵件客戶端兼容性 (Compatibility)
*   **挑戰**: Emoji (👍/👎) 在 Windows 7 / Outlook 2016 等舊環境下可能顯示為黑白方框或亂碼。
*   **解決方案**: **「圖片替代方案」 (Image-based Icons)**
    *   使用 PNG 圖片代替文字 Emoji。
    *   圖片託管於 CDN，並在 `<img>` 標籤中明確定義 `width` 和 `height`，防止 Outlook 自動縮放變形。

---

## 4. 擴展功能：漸進式剖析 (Progressive Profiling)

在用戶完成投票（高動機時刻）後，立即引導進行下一步互動，而非讓流程終止。

*   **流程**:
    1.  用戶點擊「👎 不喜歡」。
    2.  跳轉至感謝頁，顯示：「收到您的反饋。請問我們哪裡可以改進？」
    3.  提供文字框與「提交建議」按鈕。
    4.  用戶輸入後，透過 AJAX 更新該筆反饋記錄的 `comments` 欄位。

---

## 5. 部署計畫 (Deployment Plan)

1.  **Database Migration**: 執行 SQL 腳本建立 `EmailFeedback` 表。
2.  **Backend Update**: 更新 `tracking.js`，部署新 API。
3.  **Frontend Deploy**: 上傳 `feedback.html` 與相關圖示資源。
4.  **Template Update**: 更新共用 Footer 或建立新的「滿意度調查」Snippet 供行銷人員使用。