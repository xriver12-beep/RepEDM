// API 調用模組

class ApiClient {
    constructor() {
        // 動態決定後端 API URL
        const hostname = window.location.hostname;
        const protocol = window.location.protocol;
        const port = window.location.port;
        
        // 如果是在 HTTPS 上運行，且端口是 3443 (後端 HTTPS 端口)，則使用相對路徑或相同的端口
        // 由於我們現在讓後端伺服器 (port 3443) 直接提供前端頁面，所以 API 也在同一個 Origin 下
        if (port === '3443' || (protocol === 'https:' && !port)) {
             this.baseURL = '/api';
             console.log('Using relative API path for HTTPS backend');
        } else {
             // 否則保持原有的開發模式行為 (前端獨立運行於 3002/5500，後端在 3001)
             const apiHost = hostname === '127.0.0.1' ? 'localhost' : hostname;
             this.baseURL = `http://${apiHost}:3001/api`; 
        }
        
        console.log('API Base URL set to:', this.baseURL);

        this.timeout = 10000; // 10 秒超時
        this.defaultHeaders = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        
        // 緩存機制
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5分鐘緩存
        
        // 請求去重機制
        this.pendingRequests = new Map();
        
        // 開發模式下使用模擬 token
        if (window.DevConfig && window.DevConfig.shouldSkipAuth()) {
            this.token = window.DevConfig.getMockToken();
            console.log('🔧 開發模式：使用模擬 token');
        } else {
            // 檢測是否為admin頁面並使用正確的token
            this.token = this.getCorrectToken();
        }
        
        if (this.token) {
            this.defaultHeaders['Authorization'] = `Bearer ${this.token}`;
        }
    }

    // 檢測是否為admin頁面
    isAdminPage() {
        const currentPath = window.location.pathname;
        const adminPages = [
            '/login.html',
            '/admin-login.html',
            '/dashboard.html',
            '/settings.html',
            '/users.html',
            '/admin-users.html',
            '/email-logs.html',
            '/profile.html',
            '/analytics.html',
            '/queue.html',
            '/subscriber-stats.html',
            '/admin.html'
        ];
        
        return adminPages.some(page => currentPath.endsWith(page));
    }

    // 檢測是否為user頁面
    isUserPage() {
        const currentPath = window.location.pathname;
        const userPages = [
            '/user-login.html',
            '/user-dashboard.html',
            '/campaigns.html',
            '/subscribers.html',
            '/templates.html',
            '/approvals.html',
            '/user-profile.html'
        ];
        
        return userPages.some(page => currentPath.endsWith(page));
    }

    // 獲取正確的認證token
    getCorrectToken() {
        // 檢查是否為admin頁面
        if (this.isAdminPage()) {
            const adminToken = localStorage.getItem('adminAuthToken');
            if (adminToken) return adminToken;
            // 如果沒有管理員 token，嘗試使用一般用戶 token (允許一般用戶訪問某些 Admin 頁面功能，如 api 調用)
            return localStorage.getItem('authToken');
        } else {
            // 對於一般頁面，優先使用一般用戶 token
            const userToken = localStorage.getItem('authToken');
            if (userToken) return userToken;
            
            // 如果沒有一般用戶 token，嘗試使用管理員 token (允許管理員訪問一般頁面)
            return localStorage.getItem('adminAuthToken');
        }
    }

    // 設置認證 token
    setAuthToken(token) {
        this.token = token;
        const isAdminPage = this.isAdminPage();
        
        if (token) {
            if (isAdminPage) {
                localStorage.setItem('adminAuthToken', token);
            } else {
                localStorage.setItem('authToken', token);
            }
            this.defaultHeaders['Authorization'] = `Bearer ${token}`;
        } else {
            if (isAdminPage) {
                localStorage.removeItem('adminAuthToken');
            } else {
                localStorage.removeItem('authToken');
            }
            delete this.defaultHeaders['Authorization'];
        }
    }

    // 獲取認證 token
    getAuthToken() {
        return this.token;
    }

    // 刷新認證token（在頁面加載時調用）
    refreshToken() {
        this.token = this.getCorrectToken();
        if (this.token) {
            this.defaultHeaders['Authorization'] = `Bearer ${this.token}`;
        } else {
            delete this.defaultHeaders['Authorization'];
        }
    }

    // 生成緩存鍵
    generateCacheKey(endpoint, options = {}) {
        const method = options.method || 'GET';
        const params = options.params || {};
        const sortedParams = Object.keys(params).sort().reduce((result, key) => {
            result[key] = params[key];
            return result;
        }, {});
        return `${method}:${endpoint}:${JSON.stringify(sortedParams)}`;
    }

    // 檢查緩存
    getCachedData(cacheKey) {
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }
        if (cached) {
            this.cache.delete(cacheKey);
        }
        return null;
    }

    // 設置緩存
    setCachedData(cacheKey, data, endpoint = '') {
        this.cache.set(cacheKey, {
            data: data,
            timestamp: Date.now()
        });

        // 特別處理活動列表的緩存，存入 localStorage 以供 304 響應使用
        if (endpoint && endpoint.includes('/campaigns') && data && data.data && data.data.campaigns) {
            try {
                localStorage.setItem('campaigns_data', JSON.stringify(data.data.campaigns));
            } catch (e) {
                console.warn('無法寫入 localStorage:', e);
            }
        }
    }

    // 清除過期緩存
    clearExpiredCache() {
        const now = Date.now();
        for (const [key, value] of this.cache.entries()) {
            if (now - value.timestamp >= this.cacheTimeout) {
                this.cache.delete(key);
            }
        }
    }

    // 清除所有緩存
    clearCache() {
        this.cache.clear();
    }

    // 通用請求方法
    async request(endpoint, options = {}) {
        // 清理過期緩存
        this.clearExpiredCache();
        
        const method = options.method || 'GET';
        const cacheKey = this.generateCacheKey(endpoint, options);
        
        // 對於 GET 請求，檢查緩存
        if (method === 'GET') {
            // 檢查是否有緩存數據
            const cachedData = this.getCachedData(cacheKey);
            if (cachedData) {
                console.log('🔄 使用緩存數據:', endpoint);
                return cachedData;
            }
            
            // 檢查是否有相同的請求正在進行中
            if (this.pendingRequests.has(cacheKey)) {
                console.log('⏳ 等待進行中的請求:', endpoint);
                return await this.pendingRequests.get(cacheKey);
            }
        }
        
        // 構建完整的 URL
        let url = `${this.baseURL}${endpoint}`;
        
        // 處理查詢參數
        if (options.params && Object.keys(options.params).length > 0) {
            // 使用 window.location.origin 作為 base URL，以支援相對路徑
            const urlObj = new URL(url, window.location.origin);
            Object.entries(options.params).forEach(([key, value]) => {
                if (value !== null && value !== undefined && value !== '') {
                    urlObj.searchParams.append(key, value);
                }
            });
            url = urlObj.toString();
        }
        
        // 動態獲取最新的認證令牌
        const currentToken = this.getCorrectToken();
        const headers = {
            ...this.defaultHeaders,
            ...options.headers
        };
        
        // 如果有令牌，添加到標頭中
        if (currentToken) {
            headers['Authorization'] = `Bearer ${currentToken}`;
        }
        
        const config = {
            method: method,
            headers: headers,
            ...options
        };
        
        // 移除 params 屬性，避免傳遞給 fetch
        delete config.params;

        // 如果有 body 且不是 FormData，則序列化為 JSON
        if (config.body && !(config.body instanceof FormData)) {
            config.body = JSON.stringify(config.body);
        } else if (config.body instanceof FormData) {
            // 如果是 FormData，移除 Content-Type header，讓瀏覽器自動設置 (包含 boundary)
            if (headers['Content-Type']) {
                delete headers['Content-Type'];
            }
        }

        // 創建請求 Promise
        const requestPromise = this.executeRequest(url, config, cacheKey, method, endpoint);
        
        // 對於 GET 請求，將 Promise 存儲到 pendingRequests 中
        if (method === 'GET') {
            this.pendingRequests.set(cacheKey, requestPromise);
        }
        
        try {
            const result = await requestPromise;
            
            // 對於 GET 請求，將結果存入緩存
            if (method === 'GET' && result) {
                this.setCachedData(cacheKey, result, endpoint);
            } else if (method !== 'GET') {
                // 非 GET 請求成功後，清除緩存以確保數據一致性
                console.log('🧹 非 GET 請求成功，清除緩存');
                this.clearCache();
            }
            
            return result;
        } finally {
            // 請求完成後，從 pendingRequests 中移除
            if (method === 'GET') {
                this.pendingRequests.delete(cacheKey);
            }
        }
    }

    async executeRequest(url, config, cacheKey, method, endpoint) {
        try {
            // 創建 AbortController 用於超時控制
            const controller = new AbortController();
            // 允許配置覆蓋默認超時
            const timeout = config.timeout || this.timeout;
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            
            config.signal = controller.signal;

            const response = await fetch(url, config);
            clearTimeout(timeoutId);

            // 檢查響應狀態 (304 Not Modified 也是成功的響應)
            if (!response.ok && response.status !== 304) {
                // 如果是 401 Unauthorized，嘗試刷新 token
                if (response.status === 401 && !config._retry) {
                    console.log('🔄 Token 可能過期，嘗試刷新...');
                    const refreshed = await this.tryRefreshToken();
                    if (refreshed) {
                        console.log('✅ Token 刷新成功，重試請求');
                        config._retry = true;
                        // 更新 Authorization header
                        const newToken = this.getCorrectToken();
                        config.headers['Authorization'] = `Bearer ${newToken}`;
                        return await this.executeRequest(url, config, cacheKey, method, endpoint);
                    }
                }
                
                await this.handleErrorResponse(response);
            }

            // 處理 304 Not Modified 響應
            if (response.status === 304) {
                // 304 響應沒有內容，但我們需要從緩存中獲取數據
                // 對於活動列表，我們可以嘗試從本地存儲獲取
                if (url.includes('/campaigns')) {
                    try {
                        const cachedData = localStorage.getItem('campaigns_data');
                        if (cachedData) {
                            return {
                                success: true,
                                data: { campaigns: JSON.parse(cachedData) }, // 修正數據結構
                                status: 304,
                                message: '數據未修改，使用緩存數據'
                            };
                        }
                    } catch (e) {
                        console.warn('無法解析緩存數據:', e);
                    }
                }
                
                // 如果沒有緩存數據但收到 304，這是一個異常狀態。
                // 我們應該強制刷新數據 (使用 no-cache)
                console.warn('收到 304 響應但無本地緩存，強制重新獲取...');
                const retryConfig = { ...config };
                retryConfig.headers = { ...retryConfig.headers, 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' };
                // 避免無限遞歸，如果已經是重試則不再重試 (雖然這裡沒有傳遞 retry 標誌，但通常一次重試就夠了)
                // 這裡我們直接調用 fetch，不遞歸調用 executeRequest 以避免複雜性，但需要處理響應
                const retryResponse = await fetch(url, retryConfig);
                if (retryResponse.ok) {
                     return await retryResponse.json();
                }
                
                // 如果重試也失敗，返回空數據結構 (最後手段)
                return {
                    success: true,
                    data: { campaigns: [] },
                    status: 200,
                    message: '無法獲取數據'
                };
            }

            // 嘗試解析 JSON 響應
            const contentType = response.headers.get('content-type');
            let result;
            try {
                if (contentType && contentType.includes('application/json')) {
                    result = await response.json();
                } else {
                    result = await response.text();
                }
            } catch (e) {
                console.warn('解析響應失敗:', e);
                // Fallback to text if JSON parsing fails, or return empty object
                result = { message: '無法解析伺服器響應' };
            }

            return result;

        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('請求超時');
            }
            throw error;
        }
    }

    // 嘗試刷新 Token
    async tryRefreshToken() {
        try {
            // 獲取當前頁面類型
            const isAdmin = this.isAdminPage();
            
            // 獲取 refresh token (從 localStorage)
            // 這裡假設 login 時有存 refreshToken，但目前的 user-auth.js 和 admin-auth.js 似乎沒有存?
            // 檢查 backend/auth.js 的 login 確實有回傳 refreshToken。
            // 我們需要檢查 localStorage 是否有 'refreshToken' 或 'adminRefreshToken'
            
            let refreshToken;
            if (isAdmin) {
                refreshToken = localStorage.getItem('adminRefreshToken');
                if (!refreshToken) refreshToken = localStorage.getItem('refreshToken'); // 嘗試 user refresh token
            } else {
                refreshToken = localStorage.getItem('refreshToken');
                if (!refreshToken) refreshToken = localStorage.getItem('adminRefreshToken'); // 嘗試 admin refresh token
            }

            if (!refreshToken) {
                console.log('❌ 無法刷新 Token: 未找到 Refresh Token');
                return false;
            }

            // 發送刷新請求
            const endpoint = isAdmin ? '/admin-auth/refresh' : '/auth/refresh';
            const response = await fetch(`${this.baseURL}${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ refreshToken })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success && data.data.token) {
                    // 更新 Token
                    this.setAuthToken(data.data.token);
                    
                    // 更新 Refresh Token (如果有新的)
                    if (data.data.refreshToken) {
                        if (isAdmin) {
                            localStorage.setItem('adminRefreshToken', data.data.refreshToken);
                        } else {
                            localStorage.setItem('refreshToken', data.data.refreshToken);
                        }
                    }
                    return true;
                }
            }
            console.log('❌ 刷新 Token 失敗:', response.status);
            return false;

        } catch (error) {
            console.error('❌ 刷新 Token 發生錯誤:', error);
            return false;
        }
    }

    // 處理錯誤響應
    async handleErrorResponse(response) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        
        try {
            // 檢查響應內容類型
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                const errorData = await response.json();
                if (errorData.message) {
                    errorMessage = errorData.message;
                }
            } else {
                // 如果不是 JSON，直接讀取文本
                const textResponse = await response.text();
                if (textResponse) {
                    errorMessage = textResponse;
                }
            }
        } catch (parseError) {
            console.warn('無法解析錯誤響應:', parseError);
            // 如果無法解析，使用預設錯誤訊息
        }

        // 處理特定狀態碼
        switch (response.status) {
            case 401:
                this.handleUnauthorized();
                throw new Error('未授權，請重新登入');
            case 403:
                throw new Error(errorMessage || '權限不足');
            case 404:
                throw new Error(errorMessage || '資源不存在');
            case 422:
                throw new Error(errorMessage || '資料驗證失敗');
            case 429:
                throw new Error(errorMessage || '請求過於頻繁，請稍後再試');
            case 500:
                throw new Error(errorMessage || '伺服器內部錯誤');
            default:
                throw new Error(errorMessage);
        }
    }

    // 處理未授權情況
    handleUnauthorized() {
        this.setAuthToken(null);
        // 重定向到登入頁面
        const currentPath = window.location.pathname;
        if (!currentPath.endsWith('login.html') && !currentPath.endsWith('index.html') && !currentPath.endsWith('user-login.html')) {
            // 如果是前台頁面 (User Page)，重定向到 user-login.html
            if (this.isUserPage()) {
                window.location.href = 'user-login.html';
            } else {
                // 否則預設重定向到後台登入頁面
                window.location.href = 'login.html';
            }
        }
    }

    // GET 請求
    async get(endpoint, params = {}, options = {}) {
        return this.request(endpoint, {
            method: 'GET',
            params: params,
            ...options
        });
    }

    // POST 請求
    async post(endpoint, data = {}) {
        return this.request(endpoint, {
            method: 'POST',
            body: data
        });
    }

    // PUT 請求
    async put(endpoint, data = {}) {
        return this.request(endpoint, {
            method: 'PUT',
            body: data
        });
    }

    // PATCH 請求
    async patch(endpoint, data = {}) {
        return this.request(endpoint, {
            method: 'PATCH',
            body: data
        });
    }

    // DELETE 請求
    async delete(endpoint) {
        return this.request(endpoint, {
            method: 'DELETE'
        });
    }

    // 可選請求 (失敗時返回 fallback 值，不拋出錯誤)
    async fetchOptional(endpoint, fallback = null, options = {}) {
        try {
            return await this.request(endpoint, options);
        } catch (error) {
            console.warn(`Optional request to ${endpoint} failed:`, error);
            return fallback;
        }
    }

    // 上傳檔案
    async upload(endpoint, file, additionalData = {}) {
        const formData = new FormData();
        formData.append('file', file);
        
        Object.keys(additionalData).forEach(key => {
            formData.append(key, additionalData[key]);
        });

        return this.request(endpoint, {
            method: 'POST',
            body: formData
        });
    }
}

// API 端點定義
const API_ENDPOINTS = {
    // 認證相關
    auth: {
        login: '/auth/login',
        logout: '/auth/logout',
        refresh: '/auth/refresh',
        profile: '/auth/me'
    },

    // 儀表板
    dashboard: {
        stats: '/dashboard/stats',
        recentCampaigns: '/dashboard/recent-campaigns',
        recentSubscribers: '/dashboard/recent-subscribers',
        chartData: '/dashboard/chart-data'
    },

    // 訂閱者管理
    subscribers: {
        list: '/subscribers',
        ids: '/subscribers/ids',
        create: '/subscribers',
        detail: (id) => `/subscribers/${id}`,
        update: (id) => `/subscribers/${id}`,
        delete: (id) => `/subscribers/${id}`,
        import: '/subscribers/import',
        export: '/subscribers/export',
        bulkUpdate: '/subscribers/bulk-update',
        bulkDelete: '/subscribers/bulk-delete',
        segments: '/subscribers/segments',
        tags: '/subscribers/tags',
        stats: '/subscribers/stats/overview',
        categories: '/subscribers/categories',
        categoriesTree: '/subscribers/categories/tree',
        categoriesHierarchyStats: '/subscribers/categories/hierarchy-stats',
        categoryChildren: (id) => `/subscribers/categories/${id}/children`,
        categoriesSearch: '/subscribers/categories/search',
        subscriberCategories: (id) => `/subscribers/${id}/categories`,
        updateCategories: (id) => `/subscribers/${id}/categories`,
        byCategory: (categoryId) => `/subscribers/by-category/${categoryId}`,
        bulkUpdateCategories: '/subscribers/bulk-update-categories',
        bulkCorrectEmails: '/subscribers/bulk-correct-emails',
        bulkUpdateStatus: '/subscribers/bulk-update-status',
        bulkUpdateData: '/subscribers/bulk-update-data'
    },

    // 行銷活動
    campaigns: {
        list: '/campaigns',
        create: '/campaigns',
        update: (id) => `/campaigns/${id}`,
        delete: (id) => `/campaigns/${id}`,
        duplicate: (id) => `/campaigns/${id}/duplicate`,
        send: (id) => `/campaigns/${id}/send`,
        pause: (id) => `/campaigns/${id}/pause`,
        resume: (id) => `/campaigns/${id}/resume`,
        preview: (id) => `/campaigns/${id}/preview`,
        stats: (id) => `/campaigns/${id}/stats`,
        bulkAction: '/campaigns/bulk-action'
    },

    // 模板管理
    templates: {
        list: '/templates',
        create: '/templates',
        update: (id) => `/templates/${id}`,
        delete: (id) => `/templates/${id}`,
        duplicate: (id) => `/templates/${id}/duplicate`,
        preview: (id) => `/templates/${id}/preview`,
        categories: '/templates/categories',
        bulkAction: '/templates/bulk-action',
        upload: '/templates-modern/upload'
    },

    // 分析報告
    analytics: {
        overview: '/analytics/overview',
        campaigns: '/analytics/campaigns',
        subscribers: '/analytics/subscribers',
        engagement: '/analytics/engagement',

        export: '/analytics/export'
    },

    // 審核工作流程
    approvals: {
        list: '/approvals',
        approve: (id) => `/approvals/${id}/approve`,
        reject: (id) => `/approvals/${id}/reject`,
        history: (id) => `/approvals/${id}/history`,
        settings: '/approvals/settings',
        reviewers: '/approvals/reviewers'
    },

    // 用戶管理
    users: {
        list: '/users',
        create: '/users',
        update: (id) => `/users/${id}`,
        delete: (id) => `/users/${id}`,
        resetPassword: (id) => `/users/${id}/reset-password`,
        stats: '/users/stats/overview'
    },

    // 分類管理 (通用)
    categories: {
        list: '/categories',
        create: '/categories',
        update: (id) => `/categories/${id}`,
        delete: (id) => `/categories/${id}`,
        move: (id) => `/categories/${id}/move`,
        tree: '/categories/tree',
        hierarchyStats: '/categories/hierarchy-stats',
        search: '/categories/search',
        import: '/categories/import',
        export: '/categories/export'
    },

    // 設定
    settings: {
        general: '/settings/general',
        email: '/settings/email',
        smtp: '/settings/smtp',
        security: '/settings/security',
        notifications: '/settings/notifications',
        integrations: '/settings/integrations',
        backup: '/settings/backup',
        advanced: '/settings/advanced',
        testEmail: '/settings/test-email',
        testSmtp: '/settings/test-smtp',
        testWebhook: '/settings/test-webhook'
    }
};

// 創建全域 API 客戶端實例
const apiClient = new ApiClient();

// 具體的 API 服務類別
class AuthService {
    constructor(client) {
        this.apiClient = client || apiClient;
    }

    async login(email, password) {
        const response = await this.apiClient.post(API_ENDPOINTS.auth.login, {
            email,
            password
        });
        
        if (response.token) {
            this.apiClient.setAuthToken(response.token);
        }
        
        return response;
    }

    async logout() {
        try {
            await this.apiClient.post(API_ENDPOINTS.auth.logout);
        } finally {
            this.apiClient.setAuthToken(null);
        }
    }

    async getProfile() {
        return this.apiClient.get(API_ENDPOINTS.auth.profile);
    }

    async refreshToken() {
        const response = await this.apiClient.post(API_ENDPOINTS.auth.refresh);
        if (response.token) {
            this.apiClient.setAuthToken(response.token);
        }
        return response;
    }
}

class DashboardService {
    constructor(client) {
        this.apiClient = client || apiClient;
    }

    async getStats() {
        return this.apiClient.get(API_ENDPOINTS.dashboard.stats);
    }

    async getRecentCampaigns() {
        return this.apiClient.get(API_ENDPOINTS.dashboard.recentCampaigns);
    }

    async getRecentSubscribers() {
        return this.apiClient.get(API_ENDPOINTS.dashboard.recentSubscribers);
    }

    async getChartData(type, period = '7d') {
        return this.apiClient.get(API_ENDPOINTS.dashboard.chartData, { type, period });
    }
}

class SubscriberService {
    constructor(client) {
        this.apiClient = client || apiClient;
    }

    async getSubscribers(params = {}) {
        // Extract timeout from params if present to pass as request option
        const { timeout, ...queryParams } = params;
        return this.apiClient.get(API_ENDPOINTS.subscribers.list, queryParams, timeout ? { timeout } : {});
    }

    async getAllSubscriberIds(params = {}) {
        return this.apiClient.get(API_ENDPOINTS.subscribers.ids, params);
    }

    async getSubscriber(id) {
        return this.apiClient.get(API_ENDPOINTS.subscribers.detail(id));
    }

    async createSubscriber(data) {
        return this.apiClient.post(API_ENDPOINTS.subscribers.create, data);
    }

    async updateSubscriber(id, data) {
        return this.apiClient.put(API_ENDPOINTS.subscribers.update(id), data);
    }

    async deleteSubscriber(id) {
        return this.apiClient.delete(API_ENDPOINTS.subscribers.delete(id));
    }

    // 匯入訂閱者 (文件上傳)
    async importSubscribers(formData) {
        return this.apiClient.request(API_ENDPOINTS.subscribers.import, {
            method: 'POST',
            body: formData
        });
    }

    async exportSubscribers(format = 'csv', filters = {}) {
        return this.apiClient.get(API_ENDPOINTS.subscribers.export, { format, ...filters });
    }

    async bulkUpdateSubscribers(ids, data) {
        return this.apiClient.post(API_ENDPOINTS.subscribers.bulkUpdate, { ids, data });
    }

    async bulkDeleteSubscribers(ids) {
        return this.apiClient.post(API_ENDPOINTS.subscribers.bulkDelete, { ids });
    }

    async getSegments() {
        return this.apiClient.get(API_ENDPOINTS.subscribers.segments);
    }

    async getTags() {
        return this.apiClient.get(API_ENDPOINTS.subscribers.tags);
    }

    // 統計相關
    async getStats(params = {}) {
        return this.apiClient.get(API_ENDPOINTS.subscribers.stats, params);
    }

    // 分類管理相關
    async getCategories(params = {}) {
        return this.apiClient.get(API_ENDPOINTS.subscribers.categories, params);
    }

    // 獲取層次分類樹狀結構
    async getCategoriesTree(hierarchyType = null) {
        const params = hierarchyType ? { hierarchyType } : {};
        return this.apiClient.get(API_ENDPOINTS.subscribers.categoriesTree, params);
    }

    // 獲取層次分類統計信息
    async getCategoriesHierarchyStats(hierarchyType = null) {
        const params = hierarchyType ? { hierarchyType } : {};
        return this.apiClient.get(API_ENDPOINTS.subscribers.categoriesHierarchyStats, params);
    }

    // 獲取指定分類的子分類
    async getCategoryChildren(categoryId) {
        return this.apiClient.get(API_ENDPOINTS.subscribers.categoryChildren(categoryId));
    }

    // 搜索分類
    async searchCategories(keyword, hierarchyType = null) {
        const params = { keyword };
        if (hierarchyType) params.hierarchyType = hierarchyType;
        return this.apiClient.get(API_ENDPOINTS.subscribers.categoriesSearch, params);
    }

    async getSubscriberCategories(id) {
        return this.apiClient.get(API_ENDPOINTS.subscribers.subscriberCategories(id));
    }

    async updateSubscriberCategories(id, categoryIds) {
        return this.apiClient.put(API_ENDPOINTS.subscribers.updateCategories(id), { categoryIds });
    }

    async getSubscribersByCategory(categoryId, params = {}) {
        return this.apiClient.get(API_ENDPOINTS.subscribers.byCategory(categoryId), params);
    }

    async bulkUpdateCategories(subscriberIds, categoryIds, action = 'add') {
        return this.apiClient.post(API_ENDPOINTS.subscribers.bulkUpdateCategories, {
            subscriberIds,
            categoryIds,
            action
        });
    }

    async bulkCorrectEmails(ids, findStr, replaceStr) {
        return this.apiClient.post(API_ENDPOINTS.subscribers.bulkCorrectEmails, { subscriberIds: ids, findStr, replaceStr });
    }

    async bulkUpdateStatus(ids, status) {
        return this.apiClient.post(API_ENDPOINTS.subscribers.bulkUpdateStatus, { subscriberIds: ids, status });
    }

    async bulkUpdateData(ids, data) {
        return this.apiClient.post(API_ENDPOINTS.subscribers.bulkUpdateData, { subscriberIds: ids, ...data });
    }
}

class CampaignService {
    constructor(client) {
        this.apiClient = client || apiClient;
    }

    async getCampaigns(params = {}) {
        return this.apiClient.get(API_ENDPOINTS.campaigns.list, params);
    }

    async createCampaign(data) {
        return this.apiClient.post(API_ENDPOINTS.campaigns.create, data);
    }

    async updateCampaign(id, data) {
        return this.apiClient.put(API_ENDPOINTS.campaigns.update(id), data);
    }

    async deleteCampaign(id) {
        return this.apiClient.delete(API_ENDPOINTS.campaigns.delete(id));
    }

    async duplicateCampaign(id) {
        return this.apiClient.post(API_ENDPOINTS.campaigns.duplicate(id));
    }

    async sendCampaign(id, options = {}) {
        return this.apiClient.post(API_ENDPOINTS.campaigns.send(id), options);
    }

    async pauseCampaign(id) {
        return this.apiClient.post(API_ENDPOINTS.campaigns.pause(id));
    }

    async resumeCampaign(id) {
        return this.apiClient.post(API_ENDPOINTS.campaigns.resume(id));
    }

    async previewCampaign(id) {
        return this.apiClient.get(API_ENDPOINTS.campaigns.preview(id));
    }

    // 審批相關方法
    async approveCampaign(id) {
        return this.apiClient.post(API_ENDPOINTS.approvals.approve(id));
    }

    async rejectCampaign(id, reason) {
        return this.apiClient.post(API_ENDPOINTS.approvals.reject(id), { reason });
    }

    async getCampaignStats(id) {
        return this.apiClient.get(API_ENDPOINTS.campaigns.stats(id));
    }

    async bulkAction(action, ids, data = {}) {
        return this.apiClient.post(API_ENDPOINTS.campaigns.bulkAction, { action, ids, ...data });
    }
}

class TemplateService {
    constructor(client) {
        this.apiClient = client || apiClient;
    }

    async getTemplates(params = {}) {
        return this.apiClient.get(API_ENDPOINTS.templates.list, params);
    }

    async createTemplate(data) {
        return this.apiClient.post(API_ENDPOINTS.templates.create, data);
    }

    async updateTemplate(id, data) {
        return this.apiClient.put(API_ENDPOINTS.templates.update(id), data);
    }

    async deleteTemplate(id) {
        return this.apiClient.delete(API_ENDPOINTS.templates.delete(id));
    }

    async duplicateTemplate(id) {
        return this.apiClient.post(API_ENDPOINTS.templates.duplicate(id));
    }

    async previewTemplate(id) {
        return this.apiClient.get(API_ENDPOINTS.templates.preview(id));
    }

    async getCategories() {
        return this.apiClient.get(API_ENDPOINTS.templates.categories);
    }

    async bulkAction(action, ids, data = {}) {
        return this.apiClient.post(API_ENDPOINTS.templates.bulkAction, { action, ids, ...data });
    }
}

class AnalyticsService {
    constructor(client) {
        this.apiClient = client || apiClient;
    }

    async getOverview(period = '30d') {
        return this.apiClient.get(API_ENDPOINTS.analytics.overview, { period });
    }

    async getCampaignAnalytics(params = {}) {
        return this.apiClient.get(API_ENDPOINTS.analytics.campaigns, params);
    }

    async getSubscriberAnalytics(params = {}) {
        return this.apiClient.get(API_ENDPOINTS.analytics.subscribers, params);
    }

    async getEngagementAnalytics(params = {}) {
        return this.apiClient.get(API_ENDPOINTS.analytics.engagement, params);
    }

    async getCampaignReport(campaignId) {
        return this.apiClient.get(`${API_ENDPOINTS.analytics.campaigns}/${campaignId}/report`);
    }

    async exportReport(type, format = 'csv', params = {}) {
        return this.apiClient.get(API_ENDPOINTS.analytics.export, { type, format, ...params });
    }
}

class ApprovalService {
    constructor(client) {
        this.apiClient = client || apiClient;
    }

    async getApprovals(params = {}) {
        return this.apiClient.get(API_ENDPOINTS.approvals.list, params);
    }

    async approveItem(id, comment = '') {
        return this.apiClient.post(API_ENDPOINTS.approvals.approve(id), { comment });
    }

    async rejectItem(id, reason, comment = '') {
        return this.apiClient.post(API_ENDPOINTS.approvals.reject(id), { reason, comment });
    }

    async getHistory(id) {
        return this.apiClient.get(API_ENDPOINTS.approvals.history(id));
    }

    async getSettings() {
        return this.apiClient.get(API_ENDPOINTS.approvals.settings);
    }

    async updateSettings(data) {
        return this.apiClient.put(API_ENDPOINTS.approvals.settings, data);
    }

    async getReviewers() {
        return this.apiClient.get(API_ENDPOINTS.approvals.reviewers);
    }
}

class SettingsService {
    constructor(client) {
        this.apiClient = client || apiClient;
    }

    async getSettings(section) {
        if (!section) {
            // 獲取所有設定
            return this.apiClient.get('/settings');
        }
        return this.apiClient.get(API_ENDPOINTS.settings[section]);
    }

    async updateSettings(section, data) {
        return this.apiClient.put(API_ENDPOINTS.settings[section], data);
    }

    async testEmail(data) {
        return this.apiClient.post(API_ENDPOINTS.settings.testEmail, data);
    }

    async testSmtp(data) {
        return this.apiClient.post(API_ENDPOINTS.settings.testSmtp, data);
    }

    async testWebhook(data) {
        return this.apiClient.post(API_ENDPOINTS.settings.testWebhook, data);
    }
}

class UserService {
    constructor(client) {
        this.apiClient = client || apiClient;
    }

    async getUsers(params = {}) {
        return this.apiClient.get(API_ENDPOINTS.users.list, params);
    }

    async getUser(id) {
        return this.apiClient.get(API_ENDPOINTS.users.update(id));
    }

    async createUser(userData) {
        return this.apiClient.post(API_ENDPOINTS.users.create, userData);
    }

    async updateUser(id, userData) {
        return this.apiClient.put(API_ENDPOINTS.users.update(id), userData);
    }

    async deleteUser(id) {
        return this.apiClient.delete(API_ENDPOINTS.users.delete(id));
    }

    async resetPassword(id, newPassword) {
        return this.apiClient.put(API_ENDPOINTS.users.resetPassword(id), { password: newPassword });
    }

    async getUserStats() {
        return this.apiClient.get(API_ENDPOINTS.users.stats);
    }
}

// 分類管理服務
class CategoryService {
    constructor(apiClient) {
        this.apiClient = apiClient || window.apiClient;
    }

    async getCategories(params = {}) {
        return this.apiClient.get(API_ENDPOINTS.categories.list, params);
    }

    async getCategoriesByType(type, options = {}) {
        return this.apiClient.get(API_ENDPOINTS.categories.list, { hierarchyType: type, ...options });
    }

    async getCategory(id) {
        return this.apiClient.get(API_ENDPOINTS.categories.update(id));
    }

    async createCategory(data) {
        return this.apiClient.post(API_ENDPOINTS.categories.create, data);
    }

    async updateCategory(id, data) {
        return this.apiClient.put(API_ENDPOINTS.categories.update(id), data);
    }

    async deleteCategory(id) {
        return this.apiClient.delete(API_ENDPOINTS.categories.delete(id));
    }

    async moveCategory(data) {
        // data: { nodeId, targetId, position, newParentId }
        // The endpoint expects id in URL and other data in body
        return this.apiClient.put(API_ENDPOINTS.categories.move(data.nodeId), {
            targetId: data.targetId,
            position: data.position,
            parentId: data.newParentId
        });
    }

    async getCategoriesTree(hierarchyType = null) {
        const params = hierarchyType ? { hierarchyType } : {};
        return this.apiClient.get(API_ENDPOINTS.categories.tree, params);
    }

    async getHierarchyStats() {
        return this.apiClient.get(API_ENDPOINTS.categories.hierarchyStats);
    }

    async searchCategories(keyword, hierarchyType = null) {
        const params = { keyword };
        if (hierarchyType) params.hierarchyType = hierarchyType;
        return this.apiClient.get(API_ENDPOINTS.categories.search, params);
    }
    
    // 匯入分類
    async importCategories(formData) {
        // 這裡假設後端有對應的匯入端點，如果沒有，可能需要新增
        // 目前暫時使用通用上傳方法
        return this.apiClient.upload('/categories/import', formData.get('file'), {
            category_type: formData.get('category_type')
        });
    }

    // 匯出分類
    async exportCategories(params = {}) {
        // 這裡假設後端有對應的匯出端點
        return this.apiClient.get('/categories/export', params);
    }
}

// 創建服務實例
const authService = new AuthService(apiClient);
const dashboardService = new DashboardService(apiClient);
const subscriberService = new SubscriberService(apiClient);
const categoryService = new CategoryService(apiClient);
const campaignService = new CampaignService(apiClient);
const templateService = new TemplateService(apiClient);
const analyticsService = new AnalyticsService(apiClient);
const approvalService = new ApprovalService(apiClient);
const settingsService = new SettingsService(apiClient);
// const userService = new UserService(apiClient); // Conflicts with js/userService.js
window.userService = new UserService(apiClient);

// 錯誤處理工具
class ApiErrorHandler {
    static handle(error, context = '') {
        console.error(`API Error ${context}:`, error);
        
        let message = '發生未知錯誤';
        
        if (error.message) {
            message = error.message;
        } else if (typeof error === 'string') {
            message = error;
        }

        // 顯示錯誤通知
        if (typeof NotificationUtils !== 'undefined') {
            NotificationUtils.show(message, 'error');
        } else if (typeof showNotification === 'function') {
            showNotification(message, 'error');
        } else {
            console.error(message);
        }

        return message;
    }

    static async withErrorHandling(asyncFn, context = '') {
        try {
            return await asyncFn();
        } catch (error) {
            this.handle(error, context);
            throw error;
        }
    }
}

// 導出所有服務和工具
window.apiClient = apiClient;
window.authService = authService;
window.dashboardService = dashboardService;
window.subscriberService = subscriberService;
window.categoryService = categoryService;
window.campaignService = campaignService;
window.templateService = templateService;
window.analyticsService = analyticsService;
window.approvalService = approvalService;
window.settingsService = settingsService;
window.userService = userService;
window.ApiErrorHandler = ApiErrorHandler;

// 為了向後兼容，添加 apiService 別名
window.apiService = apiClient;