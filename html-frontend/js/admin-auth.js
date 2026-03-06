// 管理員認證服務
console.log('admin-auth.js script started loading');
class AdminAuthService {
    constructor() {
        // 動態決定後端 API URL
        const hostname = window.location.hostname;
        const protocol = window.location.protocol;
        const port = window.location.port;
        
        if (port === '3443' || (protocol === 'https:' && !port)) {
             this.baseURL = '/api/admin-auth';
        } else {
             const apiHost = hostname === '127.0.0.1' ? 'localhost' : hostname;
             this.baseURL = `http://${apiHost}:3001/api/admin-auth`;
        }
        
        this.tokenKey = 'adminAuthToken';
        this.userKey = 'adminUser';
        this.timeout = 10000;
    }

    // 獲取存儲的token
    getToken() {
        return localStorage.getItem(this.tokenKey);
    }

    // 獲取存儲的用戶資訊
    getUser() {
        const userStr = localStorage.getItem(this.userKey);
        return userStr ? JSON.parse(userStr) : null;
    }

    // 設置認證資訊
    setAuth(token, user, refreshToken) {
        localStorage.setItem(this.tokenKey, token);
        localStorage.setItem(this.userKey, JSON.stringify(user));
        if (refreshToken) {
            localStorage.setItem('adminRefreshToken', refreshToken);
        }
    }

    // 清除認證資訊
    clearAuth() {
        localStorage.removeItem(this.tokenKey);
        localStorage.removeItem(this.userKey);
        localStorage.removeItem('adminRefreshToken');
    }

    // 驗證 token 是否有效
    isValidToken(token) {
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            const payload = JSON.parse(jsonPayload);
            const currentTime = Date.now() / 1000;
            return payload.exp > currentTime;
        } catch (error) {
            console.error('Token validation error:', error);
            return false;
        }
    }

    // 檢查是否已登入
    isAuthenticated() {
        const token = this.getToken();
        const user = this.getUser();
        return !!(token && user && this.isValidToken(token));
    }

    // 管理員登入
    async login(username, password, rememberMe = false) {
        try {
            const response = await fetch(`${this.baseURL}/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username,
                    password,
                    rememberMe
                }),
                signal: AbortSignal.timeout(this.timeout)
            });

            let data;
            const contentType = response.headers.get('content-type');
            
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                // 處理非 JSON 響應（如 429 錯誤的純文字響應）
                const text = await response.text();
                data = { 
                    success: false, 
                    message: text || `HTTP ${response.status}: ${response.statusText}` 
                };
            }

            if (!response.ok) {
                throw new Error(data.message || '登入失敗');
            }

            if (data.success) {
                this.setAuth(data.token, data.user, data.refreshToken);
                return {
                    success: true,
                    user: data.user,
                    mustChangePassword: data.user.mustChangePassword
                };
            } else {
                throw new Error(data.message || '登入失敗');
            }

        } catch (error) {
            console.error('管理員登入錯誤:', error);
            
            // 處理網路錯誤
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                throw new Error('無法連接到服務器，請檢查網路連接');
            }
            
            // 處理超時錯誤
            if (error.name === 'TimeoutError') {
                throw new Error('請求超時，請稍後再試');
            }
            
            throw error;
        }
    }

    // 管理員登出
    async logout() {
        try {
            const token = this.getToken();
            
            if (token) {
                await fetch(`${this.baseURL}/logout`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    signal: AbortSignal.timeout(this.timeout)
                });
            }

        } catch (error) {
            console.error('登出請求失敗:', error);
            // 即使請求失敗也要清除本地認證資訊
        } finally {
            this.clearAuth();
            // 重定向到登入頁面
            window.location.href = 'login.html';
        }
    }

    // 獲取當前用戶資訊
    async getCurrentUser() {
        try {
            const token = this.getToken();
            
            if (!token) {
                throw new Error('未找到認證token');
            }

            const response = await fetch(`${this.baseURL}/me`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                signal: AbortSignal.timeout(this.timeout)
            });

            const data = await response.json();

            if (!response.ok) {
                if (response.status === 401 || response.status === 403 || response.status === 404) {
                    // token無效，清除本地認證資訊
                    this.clearAuth();
                }
                throw new Error(data.message || '獲取用戶資訊失敗');
            }

            if (data.success) {
                // 更新本地用戶資訊
                localStorage.setItem(this.userKey, JSON.stringify(data.user));
                return data.user;
            } else {
                throw new Error(data.message || '獲取用戶資訊失敗');
            }

        } catch (error) {
            console.error('獲取用戶資訊錯誤:', error);
            throw error;
        }
    }

    // 更改密碼
    async changePassword(currentPassword, newPassword) {
        try {
            const token = this.getToken();
            
            if (!token) {
                throw new Error('未找到認證token');
            }

            const response = await fetch(`${this.baseURL}/change-password`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    currentPassword,
                    newPassword
                }),
                signal: AbortSignal.timeout(this.timeout)
            });
            
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || '更改密碼失敗');
            }

            if (data.success) {
                // 如果密碼修改成功，更新用戶資訊（移除 mustChangePassword 標記）
                const user = this.getUser();
                if (user) {
                    user.mustChangePassword = false;
                    // 更新用戶資訊，保持原有 token
                    this.setAuth(token, user);
                }
            }

            return data;

        } catch (error) {
            console.error('更改密碼錯誤:', error);
            throw error;
        }
    }

    // 更新個人資料
    async updateProfile(profileData) {
        try {
            const token = this.getToken();
            
            if (!token) {
                throw new Error('未找到認證token');
            }

            const response = await fetch(`${this.baseURL}/profile`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(profileData),
                signal: AbortSignal.timeout(this.timeout)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || '更新個人資料失敗');
            }

            // 更新本地存儲的用戶資訊
            if (data.user) {
                const currentUser = this.getUser();
                const updatedUser = { ...currentUser, ...data.user };
                this.setAuth(token, updatedUser);
            }

            return data;

        } catch (error) {
            console.error('更新個人資料錯誤:', error);
            throw error;
        }
    }

    // 檢查用戶權限
    hasRole(role) {
        const user = this.getUser();
        return user && user.role === role;
    }

    // 檢查是否為管理員
    isAdmin() {
        return this.hasRole('Admin');
    }

    // 檢查是否為經理或以上
    isManagerOrAbove() {
        const user = this.getUser();
        return user && ['Admin', 'Manager'].includes(user.role);
    }

    // 檢查是否需要更改密碼
    mustChangePassword() {
        const user = this.getUser();
        return user && user.mustChangePassword;
    }

    // 獲取用戶顯示名稱
    getDisplayName() {
        const user = this.getUser();
        return user ? (user.displayName || user.username) : '';
    }

    // 獲取用戶角色
    getRole() {
        const user = this.getUser();
        return user ? user.role : '';
    }

    // 創建帶認證的請求頭
    getAuthHeaders() {
        const token = this.getToken();
        return token ? {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        } : {
            'Content-Type': 'application/json'
        };
    }
}

// 創建全域實例
const adminAuth = new AdminAuthService();

// 導出服務
window.adminAuth = adminAuth;

// 調試信息
console.log('AdminAuth service loaded:', !!window.adminAuth);

// 在非開發跳過模式下，清理可能殘留的模擬認證
try {
    if (window.DevConfig && window.DevConfig.shouldSkipAuth && !window.DevConfig.shouldSkipAuth()) {
        const mockToken = window.DevConfig.getMockToken ? window.DevConfig.getMockToken() : null;
        const currentToken = adminAuth.getToken();
        if (mockToken && currentToken && currentToken === mockToken) {
            console.log('清除殘留的模擬管理員認證資料');
            adminAuth.clearAuth();
        }
    }
} catch (e) {
    console.warn('清理模擬資料時發生例外:', e);
}
