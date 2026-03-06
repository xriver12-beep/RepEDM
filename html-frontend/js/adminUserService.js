/**
 * 管理員帳號服務模組
 * 處理所有與管理員帳號相關的 API 調用
 */
class AdminUserService {
    constructor() {
        // 動態決定後端 API URL
        const hostname = window.location.hostname;
        const protocol = window.location.protocol;
        const port = window.location.port;
        
        if (port === '3443' || (protocol === 'https:' && !port)) {
             this.baseURL = '/api';
        } else {
             const apiHost = hostname === '127.0.0.1' ? 'localhost' : hostname;
             this.baseURL = `http://${apiHost}:3001/api`;
        }
        // 嘗試從多個位置獲取 token (優先使用 adminAuthToken)
        this.token = localStorage.getItem('adminAuthToken') || localStorage.getItem('token');
    }

    /**
     * 設置認證 token
     */
    setToken(token) {
        this.token = token;
        if (token) {
            localStorage.setItem('adminAuthToken', token);
        } else {
            localStorage.removeItem('adminAuthToken');
        }
    }

    /**
     * 獲取請求標頭
     */
    getHeaders() {
        const headers = {
            'Content-Type': 'application/json'
        };
        
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        
        return headers;
    }

    /**
     * 處理 API 響應
     */
    async handleResponse(response) {
        if (response.status === 401) {
            // Token 失效，清除 token 並重定向到登入頁面
            localStorage.removeItem('adminAuthToken');
            localStorage.removeItem('token');
            
            // 避免重複跳轉
            if (!window.location.pathname.endsWith('login.html') && 
                !window.location.pathname.endsWith('admin-login.html')) {
                window.location.href = 'login.html';
            }
            throw new Error('認證失效，請重新登入');
        }

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Network error' }));
            throw new Error(error.message || `HTTP ${response.status}`);
        }
        return response.json();
    }

    /**
     * 獲取統計數據
     */
    async getStats() {
        try {
            const response = await fetch(`${this.baseURL}/admin-users/stats`, {
                method: 'GET',
                headers: this.getHeaders()
            });
            return await this.handleResponse(response);
        } catch (error) {
            console.error('獲取統計數據失敗:', error);
            // 失敗時不拋出錯誤，以免影響頁面其他功能，返回默認值
            return { success: true, data: { totalUsers: '-', activeUsers: '-' } };
        }
    }

    /**
     * 獲取管理員列表
     */
    async getUsers(page = 1, limit = 10, search = '', role = '', status = '') {
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                limit: limit.toString(),
                search: search
            });

            if (role) params.append('role', role);
            if (status) params.append('status', status);

            const response = await fetch(`${this.baseURL}/admin-users?${params}`, {
                method: 'GET',
                headers: this.getHeaders()
            });
            return await this.handleResponse(response);
        } catch (error) {
            console.error('獲取管理員列表失敗:', error);
            throw error;
        }
    }

    /**
     * 獲取單個管理員信息
     */
    async getUser(userId) {
        try {
            const response = await fetch(`${this.baseURL}/admin-users/${userId}`, {
                method: 'GET',
                headers: this.getHeaders()
            });
            return await this.handleResponse(response);
        } catch (error) {
            console.error('獲取管理員信息失敗:', error);
            throw error;
        }
    }

    /**
     * 創建新管理員
     */
    async createUser(userData) {
        try {
            const response = await fetch(`${this.baseURL}/admin-users`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(userData)
            });
            return await this.handleResponse(response);
        } catch (error) {
            console.error('創建管理員失敗:', error);
            throw error;
        }
    }

    /**
     * 更新管理員信息
     */
    async updateUser(userId, userData) {
        try {
            const response = await fetch(`${this.baseURL}/admin-users/${userId}`, {
                method: 'PUT',
                headers: this.getHeaders(),
                body: JSON.stringify(userData)
            });
            return await this.handleResponse(response);
        } catch (error) {
            console.error('更新管理員失敗:', error);
            throw error;
        }
    }

    /**
     * 刪除管理員
     */
    async deleteUser(userId) {
        try {
            const response = await fetch(`${this.baseURL}/admin-users/${userId}`, {
                method: 'DELETE',
                headers: this.getHeaders()
            });
            return await this.handleResponse(response);
        } catch (error) {
            console.error('刪除管理員失敗:', error);
            throw error;
        }
    }

    /**
     * 重置管理員密碼
     */
    async resetPassword(userId, newPassword) {
        if (!userId) {
            throw new Error('User ID is required');
        }
        try {
            const response = await fetch(`${this.baseURL}/admin-users/${userId}/reset-password`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({ newPassword: newPassword })
            });
            return await this.handleResponse(response);
        } catch (error) {
            console.error('重置密碼失敗:', error);
            throw error;
        }
    }

    /**
     * 切換管理員狀態（啟用/禁用）
     */
    async toggleUserStatus(userId, isActive) {
        try {
            const response = await fetch(`${this.baseURL}/admin-users/${userId}/status`, {
                method: 'PATCH',
                headers: this.getHeaders(),
                body: JSON.stringify({ isActive: isActive })
            });
            return await this.handleResponse(response);
        } catch (error) {
            console.error('切換管理員狀態失敗:', error);
            throw error;
        }
    }
}

// 創建全局實例
window.adminUserService = new AdminUserService();
