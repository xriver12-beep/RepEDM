/**
 * 用戶服務模組
 * 處理所有與用戶相關的 API 調用
 */
class UserPageService {
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
            localStorage.setItem('token', token);
        } else {
            localStorage.removeItem('token');
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
        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Network error' }));
            throw new Error(error.message || `HTTP ${response.status}`);
        }
        return response.json();
    }

    /**
     * 獲取用戶統計信息
     */
    async getUserStats() {
        try {
            const response = await fetch(`${this.baseURL}/users/stats/overview`, {
                method: 'GET',
                headers: this.getHeaders()
            });
            return await this.handleResponse(response);
        } catch (error) {
            console.error('獲取用戶統計失敗:', error);
            throw error;
        }
    }

    /**
     * 獲取用戶列表
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

            const response = await fetch(`${this.baseURL}/users?${params}`, {
                method: 'GET',
                headers: this.getHeaders()
            });
            return await this.handleResponse(response);
        } catch (error) {
            console.error('獲取用戶列表失敗:', error);
            throw error;
        }
    }

    /**
     * 獲取工作流程列表
     */
    async getWorkflows() {
        try {
            const response = await fetch(`${this.baseURL}/workflow/list`, {
                method: 'GET',
                headers: this.getHeaders()
            });
            return await this.handleResponse(response);
        } catch (error) {
            console.error('獲取工作流程失敗:', error);
            throw error;
        }
    }

    /**
     * 獲取單個用戶信息
     */
    async getUser(userId) {
        try {
            const response = await fetch(`${this.baseURL}/users/${userId}`, {
                method: 'GET',
                headers: this.getHeaders()
            });
            return await this.handleResponse(response);
        } catch (error) {
            console.error('獲取用戶信息失敗:', error);
            throw error;
        }
    }

    /**
     * 創建新用戶
     */
    async createUser(userData) {
        try {
            const response = await fetch(`${this.baseURL}/users`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(userData)
            });
            return await this.handleResponse(response);
        } catch (error) {
            console.error('創建用戶失敗:', error);
            throw error;
        }
    }

    /**
     * 更新用戶信息
     */
    async updateUser(userId, userData) {
        try {
            const response = await fetch(`${this.baseURL}/users/${userId}`, {
                method: 'PUT',
                headers: this.getHeaders(),
                body: JSON.stringify(userData)
            });
            return await this.handleResponse(response);
        } catch (error) {
            console.error('更新用戶失敗:', error);
            throw error;
        }
    }

    /**
     * 刪除用戶
     */
    async deleteUser(userId) {
        try {
            const response = await fetch(`${this.baseURL}/users/${userId}`, {
                method: 'DELETE',
                headers: this.getHeaders()
            });
            return await this.handleResponse(response);
        } catch (error) {
            console.error('刪除用戶失敗:', error);
            throw error;
        }
    }

    /**
     * 重置用戶密碼
     */
    async resetPassword(userId, newPassword) {
        if (!userId) {
            throw new Error('User ID is required');
        }
        try {
            const response = await fetch(`${this.baseURL}/users/${userId}/reset-password`, {
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
     * 切換用戶狀態（啟用/禁用）
     */
    async toggleUserStatus(userId, isActive) {
        try {
            const response = await fetch(`${this.baseURL}/users/${userId}/status`, {
                method: 'PATCH',
                headers: this.getHeaders(),
                body: JSON.stringify({ is_active: isActive })
            });
            return await this.handleResponse(response);
        } catch (error) {
            console.error('切換用戶狀態失敗:', error);
            throw error;
        }
    }

    /**
     * 獲取所有工作流程 (用於下拉選單)
     */
    async getWorkflows() {
        try {
            const response = await fetch(`${this.baseURL}/workflow`, {
                method: 'GET',
                headers: this.getHeaders()
            });
            return await this.handleResponse(response);
        } catch (error) {
            console.error('獲取工作流程失敗:', error);
            // Return empty array on error to prevent UI blocking
            return { success: true, data: [] };
        }
    }

    /**
     * 獲取用戶角色列表
     */
    async getRoles() {
        try {
            const response = await fetch(`${this.baseURL}/users/roles`, {
                method: 'GET',
                headers: this.getHeaders()
            });
            return await this.handleResponse(response);
        } catch (error) {
            console.error('獲取角色列表失敗:', error);
            throw error;
        }
    }

    /**
     * 批量操作用戶
     */
    async bulkOperation(operation, userIds) {
        try {
            const response = await fetch(`${this.baseURL}/users/bulk`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({
                    operation: operation,
                    user_ids: userIds
                })
            });
            return await this.handleResponse(response);
        } catch (error) {
            console.error('批量操作失敗:', error);
            throw error;
        }
    }

    /**
     * 導出用戶數據
     */
    async exportUsers(format = 'csv', filters = {}) {
        try {
            const params = new URLSearchParams({
                format: format,
                ...filters
            });

            const response = await fetch(`${this.baseURL}/users/export?${params}`, {
                method: 'GET',
                headers: this.getHeaders()
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            return response.blob();
        } catch (error) {
            console.error('導出用戶數據失敗:', error);
            throw error;
        }
    }
}

// 創建全局實例
window.userService = new UserPageService();