# 系統故障排除紀錄 (Troubleshooting Log)

本文件記錄開發與維護過程中遇到的技術問題及其解決方案。

## 1. 審核通知信件 EDM 預覽顯示異常

### 問題描述
1. **Outlook 顯示問題**：使用 Outlook 收取審核通知信時，EDM 內容預覽的最上方 Banner 被裁切。
2. **Gmail 顯示問題**：EDM 內容預覽版面過大，導致整封信件在 Gmail 中顯示過寬，閱讀體驗不佳。

### 原因分析
*   **Outlook 問題**：Outlook 使用 Word 渲染引擎，對於圖片預設會有間隙，且對某些 CSS 屬性支援度不佳。
*   **Gmail 問題**：原始 EDM 內容可能設定了固定的寬度（如 800px 或 1000px），當通知信容器未限制寬度或寬度設定過大時，會撐開整個郵件版面。

### 解決方案

#### 針對 Outlook 的修正
在 `notification-service.js` 中，為預覽內容加入特定的 CSS 樣式與 HTML 結構：
*   **圖片顯示**：加入 `img { display: block; }` 以消除圖片下方間隙。
*   **表格設定**：加入 `mso-table-lspace: 0pt; mso-table-rspace: 0pt;` 以消除 Outlook 表格間隙。
*   **結構包裹**：使用 `<table>` 結構包裹預覽內容，提升在 Outlook 中的相容性。

#### 針對 Gmail 版面過大的修正
1.  **限制容器寬度**：將審核通知信的主要容器 `max-width` 嚴格設定為 **600px**。
    ```html
    <div style="font-family: Arial, sans-serif; width: 100%; max-width: 600px; margin: 0 auto;">
    ```
2.  **強制響應式縮放**：
    *   在預覽內容外層加入 `<div class="preview-content">`。
    *   使用 CSS `!important` 強制覆寫 EDM 內部的寬度設定。
    ```css
    .preview-content { width: 100%; max-width: 100%; }
    .preview-content img { display: block; border: 0; max-width: 100% !important; height: auto !important; }
    .preview-content table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; max-width: 100% !important; }
    ```

### 相關檔案
*   `backend/src/services/notification-service.js`

---

## 2. 前端審核詳情預覽視窗過寬 (Frontend Approval Detail Preview Modal Too Wide)

### 問題描述
在前端介面點擊審核詳情時，彈出的預覽視窗（Modal）內容寬度過寬，影響閱讀。

### 解決方案
調整 `approvals.js` 中 `updateContentPreview` 函式的 iframe 寬度設定。

*   **修改前**：`width: 100%`
*   **修改後**：`width: 900px`

```javascript
previewContainer.innerHTML = '<iframe id="contentPreviewFrame" style="width: 900px; height: 500px; border: 1px solid #e2e8f0; border-radius: 4px;"></iframe>';
```

### 相關檔案
*   `html-frontend/js/approvals.js`

---

## 3. EDM 範本在 Outlook 中 Top Banner 被裁切

### 問題描述
在 Outlook 電腦版收信時，EDM 最上方的 Banner 圖片被裁切，或者圖片下方出現不明空白，導致版面破圖。即使 Gmail 顯示正常，Outlook 仍有此問題。

### 原因分析
Outlook 使用 Microsoft Word 渲染引擎來顯示 HTML 郵件，這導致它對現代 CSS (如 `max-width`, `flexbox`) 的支援度有限，且對圖片與表格的預設渲染行為與瀏覽器不同：
1.  **圖片間隙**：Outlook 會在圖片下方產生預設的行高間隙。
2.  **寬度計算**：若未指定明確的 `width` 屬性 (HTML attribute)，Outlook 可能無法正確解析 CSS 中的 `width` 或 `max-width`，導致表格寬度錯誤或被裁切。
3.  **DPI 縮放**：高解析度螢幕下，Outlook 可能會錯誤放大圖片導致裁切。

### 解決方案
針對範本 (如 `index_top.html` 及資料庫中的範本) 進行以下相容性修正：

1.  **Outlook 專用條件式註解 (Conditional Comments)**：
    使用 `<!--[if (gte mso 9)|(IE)]>` 包裹固定寬度 (`width="900"`) 的表格，強制 Outlook 使用傳統表格佈局。
    ```html
    <!--[if (gte mso 9)|(IE)]>
    <table width="900" align="center" cellpadding="0" cellspacing="0" border="0">
    <tr>
    <td>
    <![endif]-->
    <!-- 一般瀏覽器與 Gmail 使用的響應式表格 -->
    <table border="0" width="100%" ... style="max-width: 900px; ...">
    ...
    </table>
    <!--[if (gte mso 9)|(IE)]>
    </td>
    </tr>
    </table>
    <![endif]-->
    ```

2.  **消除圖片間隙**：
    在包含圖片的 `<td>` 設定 `line-height: 0; font-size: 0; padding: 0;`。
    圖片本身設定 `display: block;`。

3.  **響應式圖片設定**：
    圖片設定 `width: 100%; height: auto;` 以適應不同裝置寬度，防止在小視窗被裁切。

### 相關檔案
*   `Template/banner/index_top.html`
*   `Template/index_top.html`
*   `html-frontend/js/campaigns.js` (動態生成內容修正)
*   資料庫 `Templates` 資料表 (需透過腳本更新)

---

## 4. 其他已知問題 (Other Known Issues)

### 4.1 訂閱者管理頁面功能未定義錯誤 (Undefined Function Error in Subscribers Page)

**症狀描述：**
在訂閱者管理頁面 (`subscribers.html`)，點擊「新增訂閱者」或「更新訂閱者」的提交按鈕時，控制台顯示錯誤：
`Uncaught TypeError: this.submitUpdateSubscriber is not a function` 或 `Uncaught TypeError: this.submitAddSubscriber is not a function`。

**根本原因 (Root Cause)：**
`SubscribersManager` 類別中的事件監聽器綁定與實際定義的方法名稱不一致。
*   事件監聽器呼叫了 `this.submitAddSubscriber()` 和 `this.submitUpdateSubscriber()`。
*   但類別中定義的方法名稱為 `addSubscriber()` 和 `updateSubscriber()`。

**解決方案 (Solution)：**
*   **前端修復 (`html-frontend/js/subscribers.js`)**：
    *   修改事件監聽器的綁定，使其呼叫正確的方法名稱。
    *   將 `this.submitAddSubscriber()` 改為 `this.addSubscriber()`。
    *   將 `this.submitUpdateSubscriber()` 改為 `this.updateSubscriber()`。

### 4.2 批量 Email 修正功能 (Bulk Email Correction Feature)

**症狀描述：**
使用者反饋有大量訂閱者 Email 輸入錯誤（例如將 `hinet.net` 誤打為 `hient.net`），需要一個批量修正的功能，且必須保留 Email 前綴（例如 `ms42.`）。

**實作細節 (Implementation)：**
*   **後端 API (`backend/src/routes/subscribers.js`)**：
    *   路由：`POST /bulk-correct-emails`
    *   **邏輯**：
        1.  使用 Transaction 確保原子性。
        2.  針對選定的 `subscriberIds`，搜尋 Email 中符合 `findStr` 的部分。
        3.  將 `findStr` 替換為 `replaceStr`（例如 `hient.net` -> `hinet.net`）。
        4.  **重複處理**：如果替換後的新 Email 已存在於資料庫：
            *   刪除舊的（錯誤的）帳號及其關聯資料（SubscriberCategories, EmailOpens, EmailClicks, EmailSends, EmailUnsubscribes）。
            *   更新當前帳號的 Email，實質上達成「合併」效果（保留正確帳號，修正錯誤帳號）。
            *   若無重複，則直接更新 Email。
*   **前端介面 (`html-frontend/js/subscribers.js`)**：
    *   新增「批量修正 Email」按鈕與 Modal。
    *   提供「搜尋字串」與「替換字串」輸入框。
    *   驗證輸入並呼叫後端 API。

### 4.3 Token 過期與登出錯誤 (Token Expiration & Logout Error)

**症狀描述：**
當使用者的認證 Token 過期時，系統嘗試自動登出或跳轉至登入頁面，但控制台報錯：
`Uncaught TypeError: window.authService.clearAuth is not a function` 或 `未提供認證令牌`，導致畫面卡住無法跳轉。

**根本原因 (Root Cause)：**
*   `auth-guard.js` 和 `admin-auth-guard.js` 在處理 401/403 錯誤時，嘗試呼叫 `window.authService.clearAuth()`。
*   但在某些頁面或初始化階段，`window.authService` 可能未定義，或者被定義為 `userAuth` / `adminAuth`，導致 `clearAuth` 方法找不到。

**解決方案 (Solution)：**
*   **增強錯誤處理 (`html-frontend/js/auth-guard.js`, `admin-auth-guard.js`, `analytics.js`)**：
    *   在呼叫 `clearAuth` 之前，先檢查物件是否存在以及方法是否為函數。
    *   範例：
        ```javascript
        if (window.userAuth && typeof window.userAuth.clearAuth === 'function') { window.userAuth.clearAuth(); }
        if (window.adminAuth && typeof window.adminAuth.clearAuth === 'function') { window.adminAuth.clearAuth(); }
        if (window.authService && typeof window.authService.clearAuth === 'function') { window.authService.clearAuth(); }
        ```
    *   確保無論是 Admin 還是 User 上下文，都能正確清除 Token 並導向登入頁面。

### 4.4 訂閱者網域統計更新頻率 (Subscriber Domain Statistics Update Frequency)

**問題描述：**
使用者詢問「訂閱者網域統計 (全體訂閱者)」多久更新一次。

**系統設定 (Configuration)：**
*   **已發送網域統計 (Sent Domains)**：快取時間 **5 分鐘** (300秒)，以提供更即時的發送反饋。
*   **全體訂閱者統計 (All Subscribers)**：快取時間 **4 小時**。
*   **實作位置**：後端 `analytics.js` (sent-domains) 與 `SubscriberService` (geo) 的快取策略。

### 4.5 成效分析無數據 (Analytics No Data)

**症狀描述：**
使用者在成效分析頁面看不到任何數據，或者網域統計顯示為空。

**根本原因 (Root Cause)：**
1.  **數據源變更**：系統已從 `EmailLogs` 遷移至 `EmailSends` 表格作為主要的統計來源。若舊有活動資料未遷移，或新活動尚未產生 `EmailSends` 紀錄，則會顯示無數據。
2.  **服務未重啟**：後端程式碼更新後，若未重啟 `WintonEDM_Backend` 服務，舊的 API 邏輯可能仍在運行。
3.  **快取未更新**：舊的快取資料可能包含錯誤或空的結果。

**解決方案 (Solution)：**
1.  **確認服務狀態**：確保後端服務已重啟 (`net stop WintonEDM_Backend; net start WintonEDM_Backend`)。
2.  **檢查資料庫**：確認 `EmailSends` 表格中有對應活動的發送紀錄。
    ```sql
    SELECT COUNT(*) FROM EmailSends WHERE status = 'sent';
    ```
3.  **強制刷新**：前端頁面載入時會帶上 `_t` 參數以繞過瀏覽器快取，後端 API 則依賴 5 分鐘的伺服器端快取。若需立即看到最新數據，可等待 5 分鐘或請管理員手動清除 Redis/DB Cache (若有實作)。

### 4.6 退訂用戶自動消失 (User Disappears from List after Unsubscribe)

**症狀描述：**
使用者反饋當訂閱者點擊取消訂閱後，該訂閱者直接從列表中消失，無法查詢或統計。

**根本原因 (Root Cause)：**
系統預設只顯示 `status = 'subscribed'` 的訂閱者。

**解決方案 (Solution)：**
*   **前端**：在訂閱者列表加入狀態篩選器 (All, Subscribed, Unsubscribed, Bounced)。
*   **後端**：確保 API 支援狀態篩選，且在未指定狀態時不應預設過濾掉非訂閱狀態（視需求而定，通常預設只顯示有效訂閱者是合理的，但需提供查看全部的選項）。

---

## 5. 營業單位與城市篩選無效 (Business Unit/Country Filter Not Working)

### 問題描述
1. 使用者在進階篩選中使用「營業單位」(Country) 搜尋中文關鍵字（如「總公司」）時，API 回傳 0 筆資料，但資料庫中確有對應資料。
2. 選擇多個單位（如「總公司, 台北」）時，篩選無效。
3. 儀表板與成效分析圖表未正確套用「營業單位」篩選條件，導致總體數據未變化。

### 原因分析
1. **編碼問題**：SQL Server 對於非英文字元（如繁體中文）的儲存與查詢需要使用 Unicode 格式 (`NVarChar`)。原程式碼使用 `VarChar` 導致比對失敗。
2. **多選邏輯**：前端傳遞逗號分隔字串 (`"A,B"`)，後端若直接比對 (`= 'A,B'`) 會失敗，需轉換為 `IN ('A', 'B')`。
3. **查詢遺漏**：部分統計查詢（如儀表板統計、圖表數據）未動態加入 `JOIN Subscribers` 與 `WHERE` 條件。

### 解決方案
1. **強制 NVarChar**：
   在 `backend/src/config/database.js` 中，強制將所有字串參數轉換為 `sql.NVarChar`。
   ```javascript
   if (typeof value === 'string') {
       request.input(key, sql.NVarChar, value);
   }
   ```

2. **實作 GeoFilter Helper**：
   在 `analytics.js` 與 `campaigns.js` 中引入 `buildGeoFilter` 函數，解析逗號分隔字串並動態生成 SQL `IN` 子句。
   ```javascript
   const buildGeoFilter = (country, city, alias = 's') => {
       // Parse 'A,B' -> ['A', 'B'] -> AND s.country IN (@p0, @p1)
   };
   ```

3. **全面套用篩選**：
   確保所有統計 API (`/dashboard`, `/stats`, `/charts`) 都呼叫 `buildGeoFilter` 並將生成的 `WHERE` 子句與 `JOIN` 條件注入到 SQL 查詢中。

### 相關檔案
*   `backend/src/config/database.js`
*   `backend/src/routes/analytics.js`
*   `backend/src/routes/campaigns.js`
*   `html-frontend/js/analytics.js`


**症狀描述：**
管理員或使用者回報，當某個訂閱者點擊「取消訂閱」連結，或管理員手動執行「取消訂閱」後，該訂閱者從「訂閱者管理」列表中消失，無法再搜尋到。

**機制說明 (Mechanism)：**
這是系統的預期行為 (Intended Behavior)，採用了 **Soft Delete (軟刪除)** 機制。
*   **觸發條件**：用戶點擊退訂連結，或管理員執行「取消訂閱」。
*   **系統動作**：將該用戶狀態設為 `deleted`。
*   **顯示邏輯**：「訂閱者管理」列表預設過濾掉 `deleted` 狀態的用戶，以保持列表整潔。

**如何查看這些用戶？**
請前往 **「訂閱者統計 (Subscriber Stats)」** 頁面，底部的 **「退訂與刪除名單紀錄」** 報表會列出所有已刪除的用戶及其退訂詳情。

### 4.6 受眾數量差異 (Recipient Count Discrepancy)

**問題描述：**
在創建行銷活動或審核時，選擇了某個分類，但「預計發送數量」少於該分類的「總訂閱者數量」（例如：總數 21，預計發送 20）。

**根本原因 (Root Cause)：**
系統在計算發送受眾時，會自動排除無效的訂閱者，以確保發送品質與降低退信率。
*   **Active (活躍)**：只有狀態為 `active` 或 `subscribed` 的訂閱者會被計入發送名單。
*   **Excluded (已排除)**：
    *   `unsubscribed` (已退訂)：用戶主動取消訂閱。
    *   `bounced` (信箱無效)：曾發生彈回信件。
    *   `deleted` (已刪除)：已被軟刪除的用戶。

**解決方案 (Solution)：**
*   **查看差異原因**：將滑鼠游標停留在「預計發送數量」上，系統會顯示詳細的扣除原因（例如：退訂: 5, 已刪除: 1）。

### 4.7 訂閱者刪除報錯 (Subscriber Deletion 400 Error)

**症狀描述：**
使用者在嘗試刪除訂閱者時，遇到 `400 Bad Request` 錯誤，並顯示「資料關聯錯誤，無法執行此操作」。控制台顯示 `DELETE` 請求失敗。

**根本原因 (Root Cause)：**
後端 API (`backend/src/routes/subscribers.js`) 原本使用 `DELETE FROM Subscribers` (硬刪除) 語法。由於該訂閱者已存在於其他關聯資料表（如發送記錄 `EmailSends`、點擊記錄 `EmailClicks` 等），資料庫的外鍵約束 (Foreign Key Constraint) 阻止了刪除操作以保護資料完整性。

**解決方案 (Solution)：**
*   **後端修復 (`backend/src/routes/subscribers.js`)**：
    *   將刪除邏輯改為 **軟刪除 (Soft Delete)**。
    *   單筆刪除 (`DELETE /:id`) 與批量刪除 (`POST /bulk-delete`) 皆改為執行 `UPDATE Subscribers SET status = 'deleted'`。
    *   這不僅解決了報錯問題，也保留了歷史數據供日後統計分析。
*   **查看詳細名單**：前往「訂閱者統計」頁面查看退訂與刪除的詳細名單。

### 4.8 Outlook Banner/Footer 切割與間隙問題 (Outlook Banner/Footer Cutoff & Gap Issue)

**症狀描述：**
*   在 Outlook 電腦版軟體中檢視 EDM 時，頂部 Banner 圖片上方被切掉一部分。
*   圖片下方出現不預期的白色間隙。
*   Footer 區域的圖片之間出現斷層或間隙。

**根本原因 (Root Cause)：**
1.  **Outlook 渲染引擎限制**: Outlook 使用 Word 渲染引擎，對於表格單元格 (`td`) 有預設的最小行高 (`line-height`) 和字型大小 (`font-size`)。如果圖片高度小於這些預設值，或者單元格內有空白字符，Outlook 會強制撐開單元格高度，導致圖片周圍出現空白或被推擠切割。
2.  **HTML 結構衝突**: 預設 EDM 範本在載入時 (`templates.js` `loadDefaultAssets`) 包含了完整的 `<html>`, `<head>`, `<body>` 標籤。當這些內容被插入到編輯器或最終郵件的 `<body>` 中時，形成了巢狀 HTML 結構。雖然瀏覽器通常能容錯處理，但 Outlook 解析器可能會忽略內層 `<body>` 的樣式或產生不可預期的渲染行為。

**解決方案 (Solution)：**
1.  **強制重置單元格樣式**:
    *   在所有包含切圖的 `td` 標籤中，強制加入 `style="line-height:0; font-size:0;"`。這會消除 Outlook 對單元格高度的最小限制。
    *   在 `img` 標籤中加入 `display: block;`，消除行內元素基線對齊造成的下方間隙。
2.  **修正範本 HTML 結構**:
    *   **前端 (`html-frontend/js/templates.js`)**: 移除 `loadDefaultAssets` 中多餘的 `<html>`, `<head>`, `<body>` 外層標籤，僅保留內容區塊 (`div`) 與內聯樣式。將背景樣式整合至外層 `div` 或由後端統一處理。
    *   **後端 (`backend/scripts/add_standard_template_v2.js`)**: 同步更新標準範本的 HTML 結構，確保新建立的 EDM 具備上述修正。

## 5. 雙 Port 分流後圖片無法顯示或追蹤失效 (Images Not Loading or Tracking Broken after Dual Port Setup)

### 問題描述
啟用雙 Port 架構 (管理 Port 3443 / 追蹤 Port 8443) 後：
1.  收件者收到信件，但內容中的圖片破圖 (無法載入)。
2.  點擊信件連結無法跳轉，或出現連線逾時 (Connection Timed Out)。
3.  後台預覽信件時圖片正常，但寄出後失效。

### 原因分析
這通常是 **防火牆規則** 或 **環境變數設定** 不完整導致的：
1.  **防火牆擋住追蹤 Port**：Port 8443 未對外開放 (0.0.0.0/0)，導致收件者無法連線。
2.  **網址替換失敗**：`.env` 中未正確設定 `TRACKING_PORT` 或 `TRACKING_URL`，導致系統寄信時仍使用內部 Port (3443) 生成連結。
3.  **圖片路徑問題**：追蹤伺服器未正確掛載 `/uploads` 目錄。

### 解決方案
請參考 **[系統安全性配置指南 (Security Setup Guide)](SECURITY_SETUP.md)** 進行檢查：
1.  確認 `.env` 包含 `TRACKING_PORT=8443`。
2.  確認防火牆已開放 Port 8443 TCP 對全網連線。
3.  重啟後端服務以套用設定。

## 6. 自動發送成效報告通知失敗 (Automatic Campaign Report Notification Failure)

### 問題描述
當系統寄送活動 EDM 完成時，建立者沒有收到「活動成效報告」的通知信件，或者通知信件偶爾會遺漏。

### 原因分析
這是一個典型的 **Race Condition (競爭危害)** 問題：
1.  **狀態更新過早**：當活動剛開始初始化 (`sendCampaign`) 時，系統立即將狀態設為 `processing`。
2.  **檢查機制衝突**：系統有一個每分鐘執行的排程 (`checkCampaignCompletion`)，用來檢查活動是否完成。判斷標準是：「佇列中沒有待處理郵件」且「狀態為 processing」。
3.  **時間差**：在活動初始化階段，郵件可能還沒完全寫入 `EmailQueue` 資料庫。此時排程剛好執行，發現佇列為空且狀態是 `processing`，誤判活動已完成，於是觸發了報告發送（此時數據為 0），並將狀態改為 `sent`。
4.  **結果**：當郵件真正開始發送時，狀態已經是 `sent`，因此發送完成後不會再次觸發通知，導致真正的成效報告被遺漏。

### 解決方案
引入 **「準備中 (preparing)」** 狀態來隔離初始化階段與發送階段。

1.  **後端修正 (`scheduler-service.js`)**：
    *   在 `sendCampaign` 開始時，先將活動狀態設為 `preparing`。
    *   在此狀態下，`checkCampaignCompletion` 會忽略該活動。
    *   直到所有郵件都成功寫入 `EmailQueue` 後，再將狀態更新為 `processing`。
2.  **前端修正 (`campaigns.js`, `dashboard.js`)**：
    *   更新狀態標籤與徽章顏色，支援顯示「準備中」狀態，讓使用者了解活動正在初始化。
3.  **佇列查詢 (`queue.js`)**：
    *   更新 SQL 排序邏輯，將 `preparing` 狀態的活動也納入顯示。

### 相關檔案
*   `backend/src/services/scheduler-service.js`
*   `html-frontend/js/campaigns.js`
*   `html-frontend/js/dashboard.js`

---

## 7. EDM 報告與統計功能更新 (EDM Report & Analytics Updates)

### 7.1 報告匯出格式變更
*   **變更**：將原本的 CSV 匯出改為 **HTML 預覽格式**。
*   **功能**：
    *   支援直接在瀏覽器預覽完整報告。
    *   包含互動式圖表（趨勢圖、裝置分佈、網域統計）。
    *   新增 **A4 列印支援**，可直接列印或另存為 PDF。
    *   包含詳細的「失敗原因分析」。

### 7.2 術語調整
*   **變更**：將報告中的「互動漏斗 (Interaction Funnel)」更名為 **「活動成效統計 (Campaign Performance Stats)」**，以更精確反映數據內容。

---

## 8. 營業單位與城市篩選無效 (Business Unit/Country Filter Not Working)

### 問題描述
使用者在進階篩選中使用「營業單位」(Country) 搜尋中文關鍵字（如「總公司」）時，API 回傳 0 筆資料，但資料庫中確有對應資料。同時「城市」篩選也可能遇到類似問題。

### 原因分析
SQL Server 對於非英文字元（如繁體中文）的儲存與查詢需要使用 Unicode 格式 (`NVarChar`)。
*   原程式碼在建構 SQL 查詢參數時，預設將字串視為 `VarChar` (ASCII)。
*   當查詢條件包含中文字串時，資料庫無法正確比對 `VarChar` 格式的查詢字串與 `NVarChar` 欄位中的資料。

### 解決方案
在後端資料庫設定檔 `src/config/database.js` 中，強制將所有字串型態的參數指定為 `sql.NVarChar`。

```javascript
// c:\WintonEDM\backend\src\config\database.js

// 修改前
request.input(key, value);

// 修改後
if (typeof value === 'string') {
    request.input(key, sql.NVarChar, value); // 強制使用 Unicode
} else {
    request.input(key, value);
}
```

### 相關檔案
*   `backend/src/config/database.js`
*   `backend/src/routes/subscribers.js`

