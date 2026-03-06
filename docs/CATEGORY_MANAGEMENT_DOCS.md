# 分類管理系統技術文檔

## 1. 系統概述
本分類管理系統旨在提供一個靈活、可擴展的多層級分類管理解決方案，支援高達5層的嵌套結構，並具備拖曳排序、圖片上傳、懶加載等現代化功能。

## 2. 數據結構設計

### 資料庫 Schema (Categories 表)

| 欄位名稱 | 類型 | 說明 | 約束 |
|---------|------|------|------|
| id | INT | 主鍵 | AUTO_INCREMENT |
| name | VARCHAR(255) | 分類名稱 | NOT NULL |
| description | TEXT | 分類描述 | |
| hierarchy_type | VARCHAR(50) | 分類層級類型 | NOT NULL (例如: 'customer', 'product') |
| category_type | VARCHAR(50) | 業務類型 | NOT NULL (例如: 'tag', 'folder') |
| parent_id | INT | 父分類ID | NULLABLE, Foreign Key -> Categories(id) |
| level | INT | 層級深度 | Default 1, Max 5 |
| path | VARCHAR(255) | 物化路徑 | 用於快速查詢子樹 (例如: '/1/5/12') |
| sort_order | INT | 排序順序 | Default 0 |
| is_leaf | BOOLEAN | 是否為葉節點 | Default TRUE |
| is_active | BOOLEAN | 是否啟用 | Default TRUE |
| subscriber_count | INT | 關聯訂閱者總數量 (包含無效/退訂) | Default 0 |
| image_url | VARCHAR(255) | 分類圖示/圖片URL | |
| created_at | DATETIME | 建立時間 | |
| updated_at | DATETIME | 更新時間 | |

## 3. API 規格

### 3.1 獲取分類列表
- **Endpoint**: `GET /api/categories`
- **Query Params**:
  - `hierarchyType`: (Required) 分類層級類型
  - `parentId`: (Optional) 父分類ID，用於懶加載
  - `includeChildren`: (Optional) 是否包含子分類 (Default: true)
- **Response**: JSON 對象，包含 `categories` 數組

### 3.2 獲取單一分類
- **Endpoint**: `GET /api/categories/:id`
- **Response**: JSON 對象，包含分類詳細資訊

### 3.3 新增分類
- **Endpoint**: `POST /api/categories`
- **Body** (JSON):
  - `name`: (Required) 名稱 (Max 100)
  - `hierarchyType`: (Required) 層級類型
  - `categoryType`: (Required) 業務類型
  - `parentId`: (Optional) 父分類ID
  - `description`: (Optional) 描述 (Max 500)
  - `image_url`: (Optional) 圖片路徑 (Max 500)
  - `isActive`: (Optional) 是否啟用 (Default: true)
- **Validation**: 
  - Joi Schema 驗證欄位格式與長度
  - 檢查名稱重複 (同一層級類型下)
  - 層級深度不超過5層

### 3.4 更新分類
- **Endpoint**: `PUT /api/categories/:id`
- **Body** (JSON):
  - `name`: (Optional)
  - `categoryType`: (Optional)
  - `description`: (Optional)
  - `sortOrder`: (Optional)
  - `isActive`: (Optional)
- **Validation**: 檢查名稱重複

### 3.5 上傳分類圖片
- **Endpoint**: `POST /api/categories/:id/image`
- **Body** (Multipart/form-data):
  - `image`: (Required) 圖片文件 (JPG, PNG, SVG)
- **Response**: 返回更新後的 `imageUrl`

### 3.6 移動分類 (排序/改變層級)
- **Endpoint**: `PUT /api/categories/:id/move`
- **Body** (JSON):
  - `parentId`: (Optional) 新的父分類ID
  - `targetId`: (Optional) 拖曳目標ID
  - `position`: (Optional) 'inside' (成為子分類)
- **Logic**: 自動更新 `level`, `path`, `sort_order`，並驗證新位置是否違反5層限制

### 3.7 刪除分類
- **Endpoint**: `DELETE /api/categories/:id`
- **Validation**: 檢查是否有子分類或關聯數據，若有則禁止刪除

## 4. 前端架構

### 4.1 核心組件
- `CategoryManagement` class (`js/category-management.js`): 負責所有分類管理邏輯
- `CategoryService` class (`js/api.js`): 負責與後端 API 通訊

### 4.2 主要功能實現
- **樹狀結構**: 使用遞歸渲染 + 懶加載 (Lazy Loading) 優化效能
- **批量渲染優化**: 
  - 前端僅渲染展開節點的子元素 (`display: none` 的節點不產生 DOM)
  - 支援 `DocumentFragment` 批量插入 (若有需要)
  - 配合後端分頁與懶加載，輕鬆應對數千個分類
- **拖曳排序**: 支援 HTML5 Drag & Drop API，實現直觀的層級調整
- **狀態管理**: 使用 `Map` 進行本地緩存 (5分鐘 TTL)，減少 API 請求
- **圖片上傳**: 整合 `FormData` 與後端 Multer 中介軟體
- **響應式設計**: 自動適應桌面與行動裝置介面

## 5. 操作手冊

### 5.1 查看分類
1. 進入「系統設定」->「分類管理」
2. 點擊分類左側箭頭展開/收合子分類
3. 使用上方搜尋框快速篩選分類

### 5.2 新增分類
1. 點擊右上角「新增分類」按鈕，或在現有分類上點擊「+」按鈕新增子分類
2. 填寫名稱、描述
3. 點擊「儲存」創建分類
4. 創建後可點擊「上傳圖片」圖示上傳分類圖標

### 5.3 調整分類順序/層級
1. 按住分類項目的拖曳把手 (Grip Icon)
2. 拖曳至目標位置：
   - **目標上方**: 插入至目標之前
   - **目標下方**: 插入至目標之後
   - **目標中間**: 成為目標的子分類
3. 放開滑鼠完成移動

### 5.4 編輯/刪除
1. 點擊分類右側的「編輯」圖標修改資訊
2. 點擊分類右側的「刪除」圖標刪除分類 (需確認無子分類)

## 6. 效能與安全性
- **效能**: 
  - 懶加載機制避免一次載入大量數據
  - 前端緩存減少網路往返
  - 資料庫索引優化查詢速度
- **安全性**:
  - Admin JWT 驗證確保只有管理員可操作
  - 輸入資料驗證 (Joi) 防止注入攻擊
  - 檔案上傳限制類型與大小
