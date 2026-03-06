// UserAuth Service - 一般使用者認證服務
class UserAuthService {
    constructor() {
        // 動態決定後端 API URL
        const hostname = window.location.hostname;
        const protocol = window.location.protocol;
        const port = window.location.port;
        
        // 如果是在 HTTPS 上運行，且端口是 3443 (後端 HTTPS 端口)，則使用相對路徑
        if (port === '3443' || (protocol === 'https:' && !port)) {
             this.baseURL = '/api/auth';
             console.log('Using relative API path for HTTPS backend');
        } else {
             const apiHost = hostname === '127.0.0.1' ? 'localhost' : hostname;
             this.baseURL = `http://${apiHost}:3001/api/auth`;
        }
        
        console.log('UserAuth API Base URL set to:', this.baseURL);

        this.tokenKey = 'authToken';
        this.userKey = 'user';
        this.timeout = 10000;
    }

    getToken() {
        return localStorage.getItem(this.tokenKey);
    }

    getUser() {
        const userStr = localStorage.getItem(this.userKey);
        return userStr ? JSON.parse(userStr) : null;
    }

    setToken(token) {
        localStorage.setItem(this.tokenKey, token);
    }

    setUser(user) {
        localStorage.setItem(this.userKey, JSON.stringify(user));
    }

    // 設置認證資訊
    setAuth(token, user, refreshToken = null) {
        localStorage.setItem(this.tokenKey, token);
        localStorage.setItem(this.userKey, JSON.stringify(user));
        if (refreshToken) {
            localStorage.setItem('refreshToken', refreshToken);
        }
    }

    // 清除認證資訊
    clearAuth() {
        localStorage.removeItem(this.tokenKey);
        localStorage.removeItem(this.userKey);
        localStorage.removeItem('refreshToken');
    }

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

    isAuthenticated() {
        const token = this.getToken();
        return !!(token && this.getUser() && this.isValidToken(token));
    }

    async login(username, password) {
        try {
            const response = await fetch(`${this.baseURL}/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email: username, password }),
                signal: AbortSignal.timeout(this.timeout)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || '登入失敗');
            }

            const authData = data.data;
            this.setAuth(authData.token, authData.user, authData.refreshToken);

            return data;
        } catch (error) {
            console.error('登入錯誤:', error);
            throw error;
        }
    }

    async getCurrentUser() {
        try {
            const token = this.getToken();
            if (!token) {
                throw new Error('未提供認證令牌');
            }

            const response = await fetch(`${this.baseURL}/me`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                signal: AbortSignal.timeout(this.timeout)
            });

            const data = await response.json();

            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    this.clearAuth();
                }
                throw new Error(data.message || '獲取用戶資訊失敗');
            }

            // 更新本地存儲的用戶資訊
            // 後端返回格式: { success: true, data: { user: { ... } } }
            const user = data.data?.user || data.user;
            
            if (user) {
                this.setUser(user);
                return user;
            }
            
            return null;
        } catch (error) {
            console.error('獲取當前用戶錯誤:', error);
            throw error;
        }
    }
}

// 創建全域實例
window.userAuth = new UserAuthService();
console.log('UserAuth service loaded:', !!window.userAuth);