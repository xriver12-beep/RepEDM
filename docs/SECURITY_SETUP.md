# 系統安全性配置指南 (Security Setup Guide)

本文件說明 WintonEDM 系統的進階安全性配置，特別是關於「雙 Port 分流架構」的設定與運作原理。此架構旨在將「管理後台」與「對外追蹤服務」的網路流量分離，以強化系統安全性。

## 1. 雙 Port 分流架構 (Dual Port Architecture)

為了降低資安風險，系統支援將敏感的「登入與管理功能」與公開的「追蹤與圖片服務」運行在不同的 Port 上。

### 架構圖示

*   **Port 3443 (內部管理)**：
    *   **用途**：管理員登入、前台使用者登入、活動編輯、名單管理。
    *   **存取權限**：**受限** (建議僅允許公司內部 IP 或 VPN 連線)。
    *   **安全性**：包含所有敏感 API 與資料庫操作介面。

*   **Port 8443 (對外追蹤)**：
    *   **用途**：開信追蹤 (Open Tracking)、點擊追蹤 (Click Tracking)、取消訂閱頁面 (Unsubscribe)、圖片資源讀取 (Images)。
    *   **存取權限**：**全網開放** (0.0.0.0/0)，確保外部收件者能正常檢視郵件內容。
    *   **安全性**：**極簡模式**。此 Port 不掛載任何登入、認證或資料庫管理 API。即使駭客嘗試連接此 Port 的登入頁面，也會因 API 不存在而無法登入。

---

## 2. 啟用方式 (Configuration)

要啟用此功能，只需在後端 `.env` 設定檔中加入 `TRACKING_PORT` 變數。

### .env 設定範例

```env
# --- 原有設定 (管理後台) ---
# 後端服務運行的 Port (預設 3443)
HTTPS_PORT=3443
# 後端基礎網址 (用於內部溝通)
BACKEND_URL=https://edm2022.winton.com.tw:3443

# --- 新增設定 (追蹤服務) ---
# 啟用獨立追蹤 Port (設定此值即開啟雙 Port 模式)
TRACKING_PORT=8443

# (選填) 明確指定追蹤網址
# 若未設定，系統會自動根據 Domain + TRACKING_PORT 推算
# TRACKING_URL=https://edm2022.winton.com.tw:8443/api/tracking

# (選填) 追蹤服務使用的網域 (若與 BACKEND_URL 不同)
# TRACKING_DOMAIN=edm2022.winton.com.tw
```

### 設定生效

修改 `.env` 後，請務必 **重啟後端服務** (Restart Backend Service)。

---

## 3. 防火牆建議規則 (Firewall Rules)

為了發揮此架構的最大效益，請配合調整防火牆規則：

| Port | 協議 | 來源 IP (Source) | 說明 |
| :--- | :--- | :--- | :--- |
| **3443** | TCP | 公司內部 IP / VPN | 保護管理後台，阻擋外部未授權存取。 |
| **8443** | TCP | Any (0.0.0.0/0) | 開放給所有網際網路使用者，確保 EDM 圖片與連結正常運作。 |

---

## 4. 運作原理 (How it works)

當開啟雙 Port 模式後，系統會自動處理網址轉換，確保使用者體驗不受影響。

1.  **伺服器啟動時 (`app.js`)**：
    *   系統會同時啟動兩個 HTTPS 伺服器 (Port 3443 與 Port 8443)。
    *   兩個伺服器共用相同的 SSL 憑證。
    *   Port 8443 的 Express App 僅掛載 `/api/tracking`、`/uploads`、`/default-assets` 與靜態前端頁面，不掛載 `/api/auth` 等敏感路由。

2.  **寄送郵件時 (`scheduler-service.js`)**：
    *   系統會偵測是否啟用了 `TRACKING_PORT` 或 `TRACKING_URL`。
    *   **追蹤連結生成**：所有的開信像素 (Pixel) 與點擊追蹤連結，都會自動使用 **追蹤 Port (8443)** 的網址生成。
    *   **圖片網址替換**：
        *   使用者在後台 (Port 3443) 上傳圖片時，編輯器中的圖片連結是指向 Port 3443 (例如 `https://domain:3443/uploads/img.jpg`)。
        *   在寄出郵件的前一刻，系統會自動掃描郵件內容，將所有指向 **內部 Port (3443)** 的圖片連結，替換為 **外部 Port (8443)** (例如 `https://domain:8443/uploads/img.jpg`)。
        *   這確保了即使 Port 3443 被防火牆封鎖，收件者仍能透過 Port 8443 看到圖片。

## 5. 常見問題 (FAQ)

*   **Q: 為什麼連線到 `https://domain:8443/user-login.html` 無法登入？**
    *   A: 這是正常的設計。Port 8443 雖然能顯示登入頁面的 HTML (因為它是靜態檔案)，但背後的登入 API (`/api/auth/login`) 並未掛載在此 Port 上，因此任何登入嘗試都會失敗 (404 Not Found)。這正是為了防止駭客從外部 Port 嘗試暴力破解密碼。

*   **Q: 需要申請兩張 SSL 憑證嗎？**
    *   A: 不需要。只要兩個 Port 使用相同的網域名稱 (Domain Name)，就可以共用同一張 SSL 憑證。

*   **Q: 取消訂閱連結 (Unsubscribe URL) 應該使用哪個 Port？**
    *   A: 應使用 **Port 8443**。
        *   **自動生成**：系統寄出的郵件中，`{{unsubscribe_url}}` 會自動指向 Port 8443 (例如 `https://domain:8443/api/tracking/unsubscribe/...`)。
        *   **手動連結**：若您在郵件中手動加入「取消訂閱」按鈕並連結到通用退訂頁面，請務必將連結設為 `https://domain:8443/unsubscribe` 或 `https://domain:8443/unsubscribe.html`，以確保外部用戶能正常訪問。
