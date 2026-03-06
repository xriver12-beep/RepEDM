# WintonEDM 任務追蹤 (Task Tracking)

## 發送頻率控管 (Frequency Capping)
- [x] **後端核心功能**
    - [x] 建立 `frequency-service.js` 實作頻率檢查邏輯
    - [x] 整合 `scheduler-service.js` 於發送前進行過濾
    - [x] 實作 Fail-open 機制確保服務穩定性
    - [x] 支援 `force_send` 強制發送參數
    - [x] 記錄 `capped` 狀態至 `EmailSends` 資料表

- [x] **系統設定**
    - [x] 更新 `settings-service.js` 支援頻率控管設定
    - [x] 前端設定頁面新增頻率參數 (天數/次數/開關)

- [x] **活動製作流程**
    - [x] 更新 `campaigns.js` 路由提供預覽統計 API
    - [x] 前端步驟 5 (預覽) 顯示頻率受限人數

- [x] **審核流程**
    - [x] 更新 `approvals.js` 路由回傳頻率統計數據
    - [x] 審核詳情頁面顯示預計觸及 vs 受限人數
    - [x] 審核通過確認視窗新增「強制發送」選項

- [x] **報表分析**
    - [x] 更新 `analytics.js` 網域統計包含受限 (Capped) 數據
    - [x] 確保受限記錄包含失敗原因 (Frequency Capping Limit Reached)

## 維護與優化 (Maintenance & Improvements)
- [x] **系統修復**
    - [x] 修復設定頁面「儲存頻率控管設定」按鈕無反應問題 (settings.js)
    - [x] 修復 CSS/JS 靜態資源載入失敗問題 (app.js)
    - [x] 修復後端服務啟動失敗問題 (frequency-service.js 建構子錯誤)
    - [x] 修復設定頁面儲存時發生 404 錯誤 (API 方法不匹配問題)
    - [x] 修復訂閱者管理頁面批量添加分類選項空白問題 (subscribers.js)
    - [x] 修改審核詳情預覽模式，支援全螢幕顯示 (approvals.html/js/css)
    - [x] 修改匯入訂戶資料，將「職稱」修改為「營業單位」並對應後端資料表 country
    - [x] 修復匯入訂戶資料視窗中「取消」按鈕無反應的問題
    - [x] 優化匯入訂戶資料邏輯：重複 Email 不匯入並顯示重複筆數
    - [x] 優化匯入訂戶資料邏輯：狀態欄位預設為 Active (若未提供)
    - [x] 修改匯入訂戶資料重複檢查機制：改為詢問是否覆蓋 (Overwrite/Skip)
    - [x] 修復批量匯入訂戶資料時，允許 firstName 與 lastName 為空值 (解決 400 錯誤)
    - [x] 修復活動預覽統計 API (preview-stats) 遺失問題，導致前端顯示「計算失敗」

## 進階篩選與優化 (Advanced Filtering & Optimization)
- [x] **訂閱者管理優化**
    - [x] 將「國家」欄位更名為「營業單位」
    - [x] 移除預設「Taiwan」值
    - [x] 進階篩選新增「營業單位」與「城市」多選功能
- [x] **成效分析篩選整合**
    - [x] 儀表板 (Dashboard) 支援營業單位/城市篩選
    - [x] 趨勢圖表 (Trend Charts) 支援篩選連動
    - [x] 活動列表 (Campaign List) 支援篩選統計
- [x] **技術優化**
    - [x] 解決 SQL Server 中文查詢編碼問題 (NVarChar)
    - [x] 實作多選 (Multi-select) 查詢邏輯 (IN Clause)

## 待辦事項 (Pending)
- [ ] 審核效率分析報表
- [ ] 審核時間統計
- [ ] 壓力測試與效能優化
