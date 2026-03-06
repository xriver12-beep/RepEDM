// 管理員認證守衛
class AdminAuthGuard {
    constructor() {
        this.loginPage = 'login.html';
        this.dashboardPage = 'dashboard.html';
        this.publicPages = ['login.html'];
        this.initialized = false;
    }

    // 初始化認證守衛
    async init() {
        if (this.initialized) return;
        
        try {
            await this.checkAuthentication();
            this.initialized = true;
        } catch (error) {
            console.error('認證守衛初始化失敗:', error);
            this.redirectToLogin();
        }
    }

    // 檢查認證狀態
    async checkAuthentication() {
        const currentPage = this.getCurrentPage();

        // 檢查是否為管理員頁面，如果不是則跳過檢查
        const adminPages = [
            'dashboard.html',
            'settings.html',
            'users.html',
            'email-logs.html',
            'profile.html',
            'analytics.html',
            'queue.html',
            'subscriber-stats.html'
        ];
        
        // 如果不是管理員頁面，且不是登入頁面，則不執行管理員認證檢查
        if (!adminPages.includes(currentPage) && currentPage !== 'login.html') {
            return;
        }
        
        // 開發模式下跳過認證檢查
        if (window.DevConfig && window.DevConfig.shouldSkipAuth()) {
            console.log('🔧 開發模式：跳過管理員認證檢查');
            // 設置模擬管理員數據到 localStorage
            const mockUser = window.DevConfig.getMockUser();
            const mockToken = window.DevConfig.getMockToken();
            
            localStorage.setItem('adminAuthToken', mockToken);
            localStorage.setItem('adminUser', JSON.stringify({
                ...mockUser,
                role: 'admin'
            }));
            
            // 更新用戶界面
            this.updateUserInterface(mockUser);
            return;
        }
        
        // 如果是公開頁面，不需要認證
        if (this.isPublicPage(currentPage)) {
            // 如果已登入且在登入頁面，重定向到儀表板
            if (currentPage === 'login.html' && window.adminAuth && window.adminAuth.isAuthenticated()) {
                try {
                    await window.adminAuth.getCurrentUser();
                    this.redirectToDashboard();
                } catch (error) {
                    // token無效，清除認證資訊
                if (window.adminAuth && typeof window.adminAuth.clearAuth === 'function') {
                    window.adminAuth.clearAuth();
                }
                }
            }
            return;
        }

        // 檢查是否有token
        if (!window.adminAuth || !window.adminAuth.isAuthenticated()) {
            this.redirectToLogin();
            return;
        }

        try {
            // 驗證token有效性
            const user = await window.adminAuth.getCurrentUser();
            
            // 檢查是否需要更改密碼
            if (user.mustChangePassword && currentPage !== 'change-password.html') {
                this.redirectToChangePassword();
                return;
            }

            // 更新用戶界面
            this.updateUserInterface(user);

        } catch (error) {
            console.error('認證驗證失敗:', error);
            // 只有在 token 確實無效（已被清除）時才重定向
            // 避免因網路錯誤或伺服器錯誤導致不必要的登出
            if (!window.adminAuth || !window.adminAuth.isAuthenticated()) {
                this.redirectToLogin();
            } else {
                console.warn('認證檢查遇到錯誤，但 token 仍然存在，保持登入狀態');
                
                // 嘗試從本地存儲獲取用戶資訊更新 UI，避免一直顯示"載入中"
                const localUser = window.adminAuth.getUser();
                if (localUser) {
                    this.updateUserInterface(localUser);
                } else {
                    // 如果本地也沒有，使用預設值
                    this.updateUserInterface({
                        displayName: '管理員',
                        username: 'Admin',
                        email: '',
                        role: 'Admin'
                    });
                }

                // 可選擇顯示錯誤通知
                if (window.notification) {
                    window.notification.warning('無法連接到認證伺服器，請檢查網路連接');
                }
            }
        }
    }

    // 獲取當前頁面
    getCurrentPage() {
        const path = window.location.pathname;
        return path.split('/').pop() || 'index.html';
    }

    // 檢查是否為公開頁面
    isPublicPage(page) {
        return this.publicPages.includes(page);
    }

    // 重定向到登入頁面
    redirectToLogin() {
        if (this.getCurrentPage() !== 'login.html') {
            window.location.href = this.loginPage;
        }
    }

    // 重定向到儀表板
    redirectToDashboard() {
        if (this.getCurrentPage() !== 'dashboard.html') {
            window.location.href = this.dashboardPage;
        }
    }

    // 重定向到更改密碼頁面
    redirectToChangePassword() {
        window.location.href = 'change-password.html';
    }

    // 更新用戶界面
    updateUserInterface(user) {
        const displayName = user.displayName || user.username || user.email;
        const roleName = this.getRoleDisplayName(user.role);

        // 更新用戶名稱顯示 (.user-name, .admin-name, .user-name-large)
        const userNameElements = document.querySelectorAll('.user-name, .admin-name, .user-name-large');
        userNameElements.forEach(element => {
            element.textContent = displayName;
        });

        // 更新用戶 Email 顯示
        const userEmailElements = document.querySelectorAll('.user-email');
        userEmailElements.forEach(element => {
            element.textContent = user.email || '';
        });

        // 更新用戶角色顯示
        const userRoleElements = document.querySelectorAll('.user-role, .admin-role');
        userRoleElements.forEach(element => {
            element.textContent = roleName;
        });

        // 更新頭像顯示
        const avatarLetter = displayName.charAt(0).toUpperCase();
        const userAvatarElements = document.querySelectorAll('.user-avatar, .user-avatar-large');
        userAvatarElements.forEach(element => {
            element.textContent = avatarLetter;
        });

        // 更新用戶部門顯示
        const userDeptElements = document.querySelectorAll('.user-department');
        userDeptElements.forEach(element => {
            if (user.department) {
                element.textContent = user.department;
            }
        });

        // 根據角色顯示/隱藏功能
        this.updateRoleBasedUI(user.role);
        
        // 更新側邊欄
        this.updateSidebar(user.role);
    }

    // 更新側邊欄
    updateSidebar(role) {
        // console.log(`Updating sidebar for role: ${role}`);
        const menuItems = document.querySelectorAll('.menu-item');
        
        // Normalize role for comparison
        const normalizedRole = role ? role.charAt(0).toUpperCase() + role.slice(1).toLowerCase() : '';

        menuItems.forEach(item => {
            let shouldHide = false;

            // 1. 檢查 data-role-required 屬性
            const requiredRolesAttr = item.getAttribute('data-role-required');
            if (requiredRolesAttr) {
                const requiredRoles = requiredRolesAttr.split(',').map(r => r.trim());
                if (!requiredRoles.includes(normalizedRole)) {
                    shouldHide = true;
                }
            }
            
            // 2. 檢查 href 是否在受限列表中 (如果尚未被隱藏) - 這裡可以根據需要擴展
            // 目前主要依賴 data-role-required

            // 應用顯示/隱藏
            if (shouldHide) {
                item.style.display = 'none';
            } else {
                item.style.display = ''; // Ensure it's visible if allowed
            }
        });
    }

    // 獲取角色顯示名稱
    getRoleDisplayName(role) {
        if (!role) return '';
        
        const normalizedRole = role.toLowerCase();
        const roleNames = {
            'admin': '管理員',
            'manager': '管理者',
            'editor': '編輯者',
            'user': '一般用戶'
        };
        return roleNames[normalizedRole] || role;
    }

    // 根據角色更新UI
    updateRoleBasedUI(role) {
        // 管理員專用功能
        const adminOnlyElements = document.querySelectorAll('.admin-only');
        adminOnlyElements.forEach(element => {
            element.style.display = role === 'Admin' ? '' : 'none';
        });

        // 管理者及以上功能
        const managerUpElements = document.querySelectorAll('.manager-up');
        managerUpElements.forEach(element => {
            element.style.display = ['Admin', 'Manager'].includes(role) ? '' : 'none';
        });

        // 編輯者及以上功能
        const editorUpElements = document.querySelectorAll('.editor-up');
        editorUpElements.forEach(element => {
            element.style.display = ['Admin', 'Manager', 'Editor'].includes(role) ? '' : 'none';
        });
    }

    // 登出
    async logout() {
        try {
            if (window.adminAuth) {
                await window.adminAuth.logout();
            }
        } catch (error) {
            console.error('登出失敗:', error);
        } finally {
            this.redirectToLogin();
        }
    }

    // 檢查權限
    hasPermission(requiredRole) {
        const user = window.adminAuth ? window.adminAuth.getUser() : null;
        if (!user) return false;

        const roleHierarchy = {
            'Admin': 3,
            'Manager': 2,
            'Editor': 1
        };

        const userLevel = roleHierarchy[user.role] || 0;
        const requiredLevel = roleHierarchy[requiredRole] || 0;

        return userLevel >= requiredLevel;
    }

    // 需要權限的操作
    requirePermission(requiredRole, callback) {
        if (this.hasPermission(requiredRole)) {
            callback();
        } else {
            this.showPermissionDenied();
        }
    }

    // 顯示權限不足提示
    showPermissionDenied() {
        if (window.NotificationUtils) {
            NotificationUtils.show('權限不足，無法執行此操作', 'error');
        } else {
            alert('權限不足，無法執行此操作');
        }
    }
}

// 創建全域實例
const adminAuthGuard = new AdminAuthGuard();

// 頁面載入時自動初始化
document.addEventListener('DOMContentLoaded', () => {
    adminAuthGuard.init();
});

// 導出守衛
window.adminAuthGuard = adminAuthGuard;
