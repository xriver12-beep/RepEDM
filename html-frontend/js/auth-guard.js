// 認證守衛 - 保護需要登入的頁面
class AuthGuard {
    constructor() {
        this.publicPages = ['login.html', 'index.html', 'user-login.html'];
        this.init();
    }

    init() {
        // 檢查當前頁面是否需要認證
        this.checkAuthentication();
        
        // 監聽認證狀態變化
        this.setupAuthStateListener();
        
        // 設置 token 過期檢查
        this.setupTokenExpirationCheck();
    }

    // 檢查認證狀態
    checkAuthentication() {
        const currentPage = this.getCurrentPageName();
        
        // 如果是公開頁面，不需要檢查認證
        if (this.isPublicPage(currentPage)) {
            return;
        }

        // 如果是管理員頁面，不需要檢查一般使用者認證 (交給 AdminAuthGuard)
        if (this.isAdminPage(currentPage)) {
            return;
        }

        // 開發模式下跳過認證檢查
        if (window.DevConfig && window.DevConfig.shouldSkipAuth()) {
            console.log('🔧 開發模式：跳過認證檢查');
            // 設置模擬用戶數據到 localStorage
            const mockUser = window.DevConfig.getMockUser();
            const mockToken = window.DevConfig.getMockToken();
            
            // 檢查是否為管理員頁面
            const isAdminPage = this.isAdminPage(currentPage);
            if (isAdminPage) {
                localStorage.setItem('adminAuthToken', mockToken);
                localStorage.setItem('adminUser', JSON.stringify({
                    ...mockUser,
                    role: 'admin'
                }));
            } else {
                localStorage.setItem('authToken', mockToken);
                localStorage.setItem('user', JSON.stringify(mockUser));
            }
            
            // 載入用戶資料
            this.loadUserProfile();
            return;
        }

        const token = this.getAuthToken();
        
        if (!token || !this.isValidToken(token)) {
            this.redirectToLogin();
            return;
        }

        // 載入用戶資訊
        this.loadUserProfile();
    }

    // 獲取當前頁面名稱
    getCurrentPageName() {
        const path = window.location.pathname;
        return path.split('/').pop() || 'index.html';
    }

    // 檢查是否為公開頁面
    isPublicPage(pageName) {
        return this.publicPages.includes(pageName);
    }

    // 獲取認證 token
    getAuthToken() {
        // 優先檢查一般用戶 token
        const userToken = localStorage.getItem('authToken');
        if (userToken) return userToken;

        // 如果沒有一般用戶 token，檢查管理員 token (允許管理員訪問一般頁面)
        const adminToken = localStorage.getItem('adminAuthToken');
        if (adminToken) return adminToken;

        return null;
    }

    // 驗證 token 是否有效
    isValidToken(token) {
        if (!token) return false;
        
        try {
            // 解析 token payload
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            
            const payload = JSON.parse(jsonPayload);
            
            // 檢查是否過期
            const currentTime = Math.floor(Date.now() / 1000);
            if (payload.exp && payload.exp < currentTime) {
                console.log('Token has expired');
                return false;
            }
            
            return true;
        } catch (e) {
            console.error('Error validating token:', e);
            return false;
        }
    }

    // 載入用戶資料
    async loadUserProfile() {
        try {
            // 檢查是否使用管理員 token
            const adminToken = localStorage.getItem('adminAuthToken');
            const userToken = localStorage.getItem('authToken');
            
            let userProfile;

            // 如果只有管理員 token，使用 adminAuth 服務
            if (adminToken && !userToken && window.adminAuth) {
                userProfile = await window.adminAuth.getCurrentUser();
            }
            // 否則使用 userAuth 服務
            else if (window.userAuth) {
                userProfile = await window.userAuth.getCurrentUser();
            } else if (window.authService) {
                userProfile = await window.authService.getProfile();
            } else {
                throw new Error('認證服務未定義');
            }
            
            // 更新應用狀態
            if (window.appState) {
                appState.setUser(userProfile);
            }
            
            // 更新 UI
            if (userProfile) {
                this.updateUserInterface(userProfile);
            } else {
                console.warn('未獲取到用戶資料，使用預設值');
                this.updateUserInterface({
                    fullName: '一般使用者',
                    email: '',
                    role: 'User'
                });
            }
            
        } catch (error) {
            console.error('載入用戶資料失敗:', error);
            // 只有在認證失敗時才重定向，如果是服務未定義等錯誤，不應該無限循環
            // 但如果是 401，getCurrentUser 會拋出錯誤
            if (error.message.includes('401') || error.message.includes('認證') || error.message.includes('403')) {
                if (window.userAuth && typeof window.userAuth.clearAuth === 'function') {
                    window.userAuth.clearAuth();
                }
                if (window.adminAuth && typeof window.adminAuth.clearAuth === 'function') {
                    window.adminAuth.clearAuth();
                }
                if (window.authService && typeof window.authService.clearAuth === 'function') {
                    window.authService.clearAuth();
                }
                this.redirectToLogin();
            } else {
                // 其他錯誤（如網絡錯誤），顯示預設使用者狀態，避免一直顯示"載入中"
                this.updateUserInterface({
                    fullName: '一般使用者',
                    email: '',
                    role: 'User'
                });
            }
        }
    }

    // 更新用戶界面
    updateUserInterface(user) {
        if (!user) {
            console.warn('updateUserInterface received null/undefined user');
            return;
        }

        // 更新用戶資訊顯示
        this.updateUserDisplay(user);
        
        // 根據角色顯示/隱藏功能
        if (user.role) {
            this.applyRoleBasedPermissions(user.role);
            // 更新側邊欄
            this.updateSidebar(user.role);
        }
    }

    // 更新用戶顯示
    updateUserDisplay(user) {
        if (!user) return;

        // 更新頂部用戶資訊
        const userNameElements = document.querySelectorAll('.user-name');
        const userRoleElements = document.querySelectorAll('.user-role');
        const userAvatarElement = document.querySelector('.user-avatar');
        
        if (userNameElements.length > 0) {
            userNameElements.forEach(el => {
                el.textContent = user.fullName || user.email || '使用者';
            });
        }
        
        if (userRoleElements.length > 0 && user.role) {
            const roleName = this.getRoleDisplayName(user.role);
            userRoleElements.forEach(el => {
                el.textContent = roleName;
            });
        }
        
        if (userAvatarElement) {
            userAvatarElement.textContent = this.getUserInitials(user);
        }
    }

    // 獲取角色顯示名稱
    getRoleDisplayName(role) {
        const roleNames = {
            'Admin': '管理者',
            'Manager': '主管',
            'User': '一般使用者',
            'user': '一般使用者',
            'Viewer': '檢視者',
            'Approver': '審核者'
        };
        return roleNames[role] || role;
    }

    // 獲取用戶姓名縮寫
    getUserInitials(user) {
        if (user.fullName) {
            const names = user.fullName.trim().split(' ');
            if (names.length >= 2) {
                return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase();
            } else if (names.length === 1) {
                return names[0].charAt(0).toUpperCase();
            }
        }
        if (user.email) {
            return user.email.charAt(0).toUpperCase();
        }
        return 'U';
    }

    // 應用基於角色的權限
    applyRoleBasedPermissions(role) {
        const permissions = this.getRolePermissions(role);
        
        // Normalize role for comparison
        const normalizedRole = role ? role.charAt(0).toUpperCase() + role.slice(1).toLowerCase() : '';
        
        // 隱藏沒有權限的功能
        document.querySelectorAll('[data-permission]').forEach(element => {
            const requiredPermission = element.getAttribute('data-permission');
            if (!permissions.includes(requiredPermission)) {
                element.style.display = 'none';
            }
        });

        // 隱藏沒有權限的選單項目
        document.querySelectorAll('[data-role-required]').forEach(element => {
            const requiredRoles = element.getAttribute('data-role-required').split(',');
            // Check against normalized role
            if (!requiredRoles.includes(normalizedRole)) {
                element.style.display = 'none';
            }
        });
    }

    // 獲取角色權限
    getRolePermissions(role) {
        // Normalize role to Title Case to match keys
        const normalizedRole = role ? role.charAt(0).toUpperCase() + role.slice(1).toLowerCase() : '';
        
        const rolePermissions = {
            'Admin': [
                'view_dashboard', 'manage_users', 'manage_subscribers', 
                'manage_campaigns', 'manage_templates', 'view_analytics', 
                'manage_settings', 'approve_campaigns', 'manage_approvals'
            ],
            'Manager': [
                'view_dashboard', 'manage_subscribers', 'manage_campaigns', 
                'manage_templates', 'view_analytics', 'approve_campaigns', 
                'manage_approvals'
            ],
            'User': [
                'view_dashboard', 'view_subscribers', 'create_campaigns', 
                'manage_templates', 'view_analytics'
            ],
            'Viewer': [
                'view_dashboard', 'view_subscribers', 'view_campaigns', 
                'view_templates', 'view_analytics'
            ],
            'Approver': [
                'view_dashboard', 'view_subscribers', 'view_campaigns', 
                'view_templates', 'view_analytics', 'approve_campaigns', 
                'manage_approvals'
            ]
        };
        
        return rolePermissions[normalizedRole] || [];
    }

    // 更新側邊欄
    updateSidebar(role) {
        console.log(`Updating sidebar for role: ${role}`);
        const menuItems = document.querySelectorAll('.menu-item');
        
        // Normalize role for comparison
        const normalizedRole = role ? role.charAt(0).toUpperCase() + role.slice(1).toLowerCase() : '';

        menuItems.forEach(item => {
            const link = item.querySelector('.menu-link');
            const href = link?.getAttribute('href');
            let shouldHide = false;

            // 1. 檢查 data-role-required 屬性
            const requiredRolesAttr = item.getAttribute('data-role-required');
            if (requiredRolesAttr) {
                const requiredRoles = requiredRolesAttr.split(',');
                if (!requiredRoles.includes(normalizedRole)) {
                    shouldHide = true;
                    console.log(`Hiding menu item (role restriction): ${href || 'unknown'}`);
                }
            }
            
            // 2. 檢查 href 是否在受限列表中 (如果尚未被隱藏)
            if (!shouldHide && this.shouldHideMenuItem(href, role)) {
                shouldHide = true;
                console.log(`Hiding menu item (restricted page): ${href}`);
            }

            // 應用顯示/隱藏
            if (shouldHide) {
                item.style.display = 'none';
            } else {
                item.style.display = ''; // Ensure it's visible if allowed
            }
        });
    }

    // 檢查是否應該隱藏選單項目
    shouldHideMenuItem(href, role) {
        if (!href) return false;
        
        // Normalize role to Title Case for comparison
        const normalizedRole = role ? role.charAt(0).toUpperCase() + role.slice(1).toLowerCase() : '';
        
        const restrictedPages = {
            'settings.html': ['Admin'],
            'approvals.html': ['Admin', 'Manager', 'Approver']
        };
        
        for (const [page, allowedRoles] of Object.entries(restrictedPages)) {
            if (href.includes(page)) {
                // Check if the normalized role is in the allowed list
                const isAllowed = allowedRoles.includes(normalizedRole);
                
                if (!isAllowed) {
                    console.log(`Access denied for ${role} (normalized: ${normalizedRole}) to ${page}`);
                }
                return !isAllowed;
            }
        }
        
        return false;
    }

    // 設置認證狀態監聽器
    setupAuthStateListener() {
        // 監聽 storage 變化（多標籤頁同步）
        window.addEventListener('storage', (e) => {
            if (e.key === 'authToken') {
                if (!e.newValue) {
                    // Token 被移除，重定向到登入頁面
                    this.redirectToLogin();
                }
            }
        });

        // 監聽應用狀態變化
        if (window.appState) {
            appState.state.subscribe('user.isAuthenticated', (isAuthenticated) => {
                if (!isAuthenticated && !this.isPublicPage(this.getCurrentPageName())) {
                    this.redirectToLogin();
                }
            });
        }
    }

    // 設置 token 過期檢查
    setupTokenExpirationCheck() {
        // 每分鐘檢查一次 token 是否過期
        setInterval(() => {
            const token = this.getAuthToken();
            if (token && !this.isValidToken(token)) {
                this.handleTokenExpiration();
            }
        }, 60000); // 60 秒
    }

    // 處理 token 過期
    handleTokenExpiration() {
        // 清除過期的 token
        localStorage.removeItem('authToken');
        
        // 更新應用狀態
        if (window.appState) {
            appState.logout();
        }
        
        // 顯示過期提示
        this.showTokenExpiredMessage();
        
        // 重定向到登入頁面
        setTimeout(() => {
            this.redirectToLogin();
        }, 2000);
    }

    // 顯示 token 過期訊息
    showTokenExpiredMessage() {
        if (window.appState) {
            appState.addNotification({
                type: 'warning',
                title: '登入已過期',
                message: '您的登入已過期，請重新登入',
                duration: 3000
            });
        } else {
            alert('您的登入已過期，請重新登入');
        }
    }

    // 重定向到登入頁面
    redirectToLogin() {
        const currentPage = this.getCurrentPageName();
        
        // 如果已經在登入頁面，不需要重定向
        if (currentPage === 'user-login.html') {
            return;
        }
        
        // 保存當前頁面，登入後可以返回
        sessionStorage.setItem('redirectAfterLogin', window.location.href);
        
        // 重定向到登入頁面
        window.location.href = 'user-login.html';
    }

    // 登入後重定向
    static redirectAfterLogin() {
        const redirectUrl = sessionStorage.getItem('redirectAfterLogin');
        sessionStorage.removeItem('redirectAfterLogin');
        
        if (redirectUrl && !redirectUrl.includes('user-login.html')) {
            window.location.href = redirectUrl;
        } else {
            window.location.href = 'user-dashboard.html';
        }
    }

    // 登出 (靜態方法，兼容舊代碼)
    static logout() {
        if (window.authGuard) {
            window.authGuard.logout();
        } else {
            // 如果實例不存在，創建臨時實例並登出
            const guard = new AuthGuard();
            guard.logout();
        }
    }

    // 登出 (實例方法)
    async logout() {
        try {
            const token = localStorage.getItem('authToken');
            if (token) {
                const apiHost = (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') 
                    ? 'localhost' 
                    : window.location.hostname;
                    
                const protocol = window.location.protocol;
                const port = window.location.port;

                let apiBase;
                if (port === '3443' || (protocol === 'https:' && !port)) {
                     apiBase = '/api';
                } else {
                     apiBase = `http://${apiHost}:3001/api`; 
                }

                console.log('Logging out via API:', `${apiBase}/auth/logout`);

                await fetch(`${apiBase}/auth/logout`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
            }
        } catch (error) {
            console.error('Logout API request failed:', error);
        } finally {
            localStorage.removeItem('authToken');
            localStorage.removeItem('rememberedEmail');
            
            // 更新應用狀態
            if (window.appState) {
                appState.logout();
            }
            
            // 重定向到登入頁面
            window.location.href = 'user-login.html';
        }
    }

    // 檢測是否為管理員頁面
    isAdminPage(pageName) {
        const adminPages = [
            'dashboard.html',
            'settings.html',
            'users.html',
            'email-logs.html',
            'profile.html',
            'login.html',
            'analytics.html'
        ];
        
        return adminPages.includes(pageName);
    }
}

// 頁面載入時初始化認證守衛
document.addEventListener('DOMContentLoaded', () => {
    window.authGuard = new AuthGuard();
});

// 導出到全域
window.AuthGuard = AuthGuard;