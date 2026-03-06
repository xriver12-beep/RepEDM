// 主要 JavaScript 功能 - 重構版本
// 使用新的工具和組件系統
console.log('=== MAIN.JS LOADED - VERSION 3.0 ===');

// DOM 載入完成後執行
document.addEventListener('DOMContentLoaded', function() {
    // 立即初始化所有服務
    initializeServices();

    // 預加載關鍵資源（僅預載入未通過 link 標籤載入的資源）
    // 注意：css/components.css、js/components.js 和 js/api.js 已經通過 HTML 標籤載入，無需預載入
    // OptimizationUtils.preloadCriticalResources([]);
    
    // 使用 requestIdleCallback 延遲非關鍵初始化
    if (window.requestIdleCallback) {
        requestIdleCallback(() => initializeApp());
    } else {
        setTimeout(() => initializeApp(), 0);
    }
});

// 初始化應用程式
function initializeApp() {
    // 使用 PerformanceUtils 監控初始化性能
    PerformanceUtils.startTimer('app-init');
    
    try {
        // 關鍵初始化（立即執行）
        initializeSidebar();
        setActiveMenuItem();
        initializeUserMenu();
        loadUserInfo(); // 載入用戶資訊
        
        // 非關鍵初始化（延遲執行）
        PerformanceUtils.defer(() => {
            initializeTooltips();
            initializeGlobalComponents();
            
            // 懶加載圖片
            PerformanceUtils.lazyLoadImages();
            
            // 清理未使用的資源
            setTimeout(() => {
                const usedClasses = OptimizationUtils.removeUnusedCSS();
                console.log(`檢測到 ${usedClasses.length} 個使用中的 CSS 類`);
            }, 2000);
        });
        
        PerformanceUtils.endTimer('app-init');
        console.log('應用程式初始化完成');
    } catch (error) {
        console.error('應用程式初始化失敗:', error);
        NotificationUtils.show('應用程式初始化失敗', 'error');
    }
}

// 初始化全域組件
function initializeGlobalComponents() {
    console.log('initializeGlobalComponents called - version 2.0');
    // 自動初始化所有組件
    if (typeof componentRegistry !== 'undefined' && componentRegistry.initComponents) {
        componentRegistry.initComponents();
    } else {
        console.warn('componentRegistry not available or initComponents method missing');
    }
    
    // 設定全域狀態管理
    if (typeof appState !== 'undefined' && appState.subscribe) {
        appState.subscribe('app.loading', (isLoading) => {
            DOMUtils.toggleClass(document.body, 'app-loading', isLoading);
        });
        
        appState.subscribe('user.profile', (user) => {
            updateUserInterface(user);
        });
    } else {
        console.warn('appState not available or subscribe method missing');
    }
    
    // 初始化性能監控
    initializePerformanceMonitoring();
}

// 性能監控初始化
function initializePerformanceMonitoring() {
    // 監控記憶體使用
    setInterval(() => {
        const memoryUsage = PerformanceUtils.getMemoryUsage();
        if (memoryUsage && memoryUsage.used > 50) { // 超過 50MB 時警告
            console.warn(`記憶體使用量較高: ${memoryUsage.used}MB`);
        }
    }, 30000); // 每 30 秒檢查一次

    // 監控頁面性能
    if ('PerformanceObserver' in window) {
        const observer = new PerformanceObserver((list) => {
            list.getEntries().forEach((entry) => {
                if (entry.entryType === 'navigation') {
                    console.log(`頁面載入時間: ${entry.loadEventEnd - entry.loadEventStart}ms`);
                } else if (entry.entryType === 'paint') {
                    console.log(`${entry.name}: ${entry.startTime}ms`);
                }
            });
        });
        
        observer.observe({ entryTypes: ['navigation', 'paint'] });
    }

    // 添加性能調試快捷鍵 (Ctrl+Shift+P)
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'P') {
            showPerformanceReport();
        }
    });
}

// 顯示性能報告
function showPerformanceReport() {
    const memoryUsage = PerformanceUtils.getMemoryUsage();
    const storageSize = StorageUtils.getStorageSize();
    
    const report = `
=== 性能報告 ===
記憶體使用: ${memoryUsage ? `${memoryUsage.used}MB / ${memoryUsage.total}MB` : '不可用'}
本地存儲: ${FormatUtils.formatFileSize(storageSize)}
緩存項目: ${PerformanceUtils.memoCache.size} 個
頁面載入時間: ${performance.timing.loadEventEnd - performance.timing.navigationStart}ms
    `;
    
    console.log(report);
    NotificationUtils.info('性能報告已輸出到控制台');
}

// 側邊欄功能 - 重構版本
function initializeSidebar() {
    const sidebar = DOMUtils.select('#sidebar');
    const mobileMenuBtn = DOMUtils.select('#mobileMenuBtn');
    const sidebarToggle = DOMUtils.select('#sidebarToggle');
    
    if (!sidebar) return;
    
    // 使用 EventUtils 的節流功能優化事件處理
    const throttledResize = EventUtils.throttle(() => {
        if (window.innerWidth > 768) {
            DOMUtils.removeClass(sidebar, 'open');
            resetMobileMenuIcon();
        }
    }, 250);
    
    // 手機版選單切換
    if (mobileMenuBtn) {
        EventUtils.on(mobileMenuBtn, 'click', function() {
            DOMUtils.toggleClass(sidebar, 'open');
            animateMobileMenuIcon(this, sidebar.classList.contains('open'));
        });
    }
    
    // 桌面版側邊欄切換
    if (sidebarToggle) {
        EventUtils.on(sidebarToggle, 'click', function() {
            DOMUtils.toggleClass(sidebar, 'collapsed');
            DOMUtils.toggleClass('.main-content', 'expanded');
        });
    }
    
    // 使用事件委託優化點擊外部關閉功能
    document.addEventListener('click', function(event) {
        if (window.innerWidth <= 768) {
            // 檢查是否點擊了模態框或其內容
            const clickedModal = event.target.closest('.modal');
            const isModalBackdrop = event.target.classList.contains('modal');
            
            // 如果點擊了模態框內容（非背景），則不關閉側邊欄
            if (clickedModal && !isModalBackdrop) {
                return;
            }
            
            if (!sidebar.contains(event.target) && !mobileMenuBtn.contains(event.target)) {
                DOMUtils.removeClass(sidebar, 'open');
                resetMobileMenuIcon();
            }
        }
    });
    
    // 視窗大小改變時重置選單
    EventUtils.on(window, 'resize', throttledResize);
}

// 動畫手機版選單圖示
function animateMobileMenuIcon(button, isOpen) {
    const spans = DOMUtils.selectAll('span', button);
    
    spans.forEach((span, index) => {
        if (isOpen) {
            if (index === 0) span.style.transform = 'rotate(45deg) translate(5px, 5px)';
            if (index === 1) span.style.opacity = '0';
            if (index === 2) span.style.transform = 'rotate(-45deg) translate(7px, -6px)';
        } else {
            span.style.transform = '';
            span.style.opacity = '';
        }
    });
}

// 重置手機版選單圖示
function resetMobileMenuIcon() {
    const mobileMenuBtn = DOMUtils.select('#mobileMenuBtn');
    if (mobileMenuBtn) {
        const spans = DOMUtils.selectAll('span', mobileMenuBtn);
        spans.forEach(span => {
            span.style.transform = '';
            span.style.opacity = '';
        });
    }
}

// 載入用戶資訊
async function loadUserInfo() {
    try {
        console.log('開始載入用戶資訊...');
        
        // 僅在 DevConfig 明確允許時才跳過認證
        if (window.DevConfig && window.DevConfig.shouldSkipAuth && window.DevConfig.shouldSkipAuth()) {
            console.log('開發模式：跳過用戶認證');
            const mockUser = window.DevConfig.getMockUser ? window.DevConfig.getMockUser() : null;
            if (mockUser) {
                updateUserMenuInfo(mockUser);
                updateRoleBasedVisibility(mockUser);
            }
            return;
        }
        
        // 檢查是否為admin頁面
        const isAdminPage = checkIfAdminPage();
        console.log('是否為管理員頁面:', isAdminPage);
        
        // 如果是管理員頁面，且 AdminAuthGuard 存在，則跳過此處的用戶資訊載入
        // 避免與 AdminAuthGuard 重複請求 /api/admin-auth/me
        if (isAdminPage && (window.AdminAuthGuard || window.adminAuthGuard)) {
            console.log('管理員頁面，交由 AdminAuthGuard 處理用戶資訊載入');
            return;
        }
        
        // 如果不是管理員頁面，且 AuthGuard 存在，則跳過此處的用戶資訊載入
        // 避免與 AuthGuard 重複請求 /api/auth/me
        if (!isAdminPage && (window.AuthGuard || window.authGuard)) {
            console.log('一般頁面，交由 AuthGuard 處理用戶資訊載入');
            
            // Failsafe: 如果 3 秒後仍然顯示"載入中..."，則強制更新為預設值
            setTimeout(() => {
                const userNameEl = document.querySelector('.user-name');
                if (userNameEl && (userNameEl.textContent === '載入中...' || userNameEl.textContent === 'Loading...')) {
                    console.warn('AuthGuard timed out or failed, forcing UI update');
                    updateUserMenuInfo({ 
                        displayName: '一般使用者', 
                        role: 'User' 
                    });
                }
            }, 3000);
            
            return;
        }

        let token;
        if (isAdminPage) {
            // Admin頁面使用adminAuthToken
            token = localStorage.getItem('adminAuthToken');
        } else {
            // 一般頁面使用authToken
            token = localStorage.getItem('authToken');
        }
        
        // 清理殘留的模擬 token
        if (window.DevConfig && window.DevConfig.getMockToken) {
            const mockToken = window.DevConfig.getMockToken();
            if (token === mockToken) {
                console.log('清除殘留的模擬 token');
                if (isAdminPage) {
                    localStorage.removeItem('adminAuthToken');
                    localStorage.removeItem('adminUser');
                } else {
                    localStorage.removeItem('authToken');
                    localStorage.removeItem('user');
                }
                token = null;
            }
        }

        if (!token) {
            console.log('未找到認證令牌');
            if (isAdminPage) {
                // 管理員頁面需要認證，跳轉到登入頁面
                console.log('管理員頁面需要認證，跳轉到登入頁面');
                window.location.href = 'login.html';
                return;
            } else {
                console.log('一般頁面，跳過載入用戶資訊');
                return;
            }
        }
        
        // 根據頁面類型選擇正確的端點
        const apiHost = (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') 
            ? 'localhost' 
            : window.location.hostname;
            
        const apiBase = (window.location.port === '3443' || (window.location.protocol === 'https:' && !window.location.port)) 
            ? '/api' 
            : `http://${apiHost}:3001/api`;

        const endpoint = isAdminPage ? 
            `${apiBase}/admin-auth/me` : 
            `${apiBase}/auth/me`;
            
        const response = await fetch(endpoint, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const result = await response.json();
            // 修正: API 回傳結構可能是 { data: { user: {...} } } 或 { data: {...} }
            const user = result.data.user || result.data;
            
            // 更新用戶選單中的資訊
            updateUserMenuInfo(user);
            
            // 根據角色顯示/隱藏系統設定選項
            updateRoleBasedVisibility(user);
        } else {
            console.error('載入用戶資訊失敗:', response.status);
            // 載入失敗時使用預設值
            updateUserMenuInfo({
                displayName: '使用者',
                role: 'User'
            });
        }
    } catch (error) {
        console.error('載入用戶資訊時發生錯誤:', error);
        // 發生錯誤時使用預設值
        updateUserMenuInfo({
            displayName: '使用者',
            role: 'User'
        });
    }
}

// 更新用戶選單資訊
function updateUserMenuInfo(user) {
    // 檢查 user 是否存在
    if (!user) {
        console.warn('用戶資訊不存在，無法更新用戶選單');
        return;
    }
    
    const userName = user.displayName || user.username || user.email || '用戶';
    const userRole = getRoleText(user.role);
    
    // 更新小頭像和資訊
    const userNameElements = DOMUtils.selectAll('.user-name');
    const userRoleElements = DOMUtils.selectAll('.user-role');
    const userAvatarElement = DOMUtils.select('.user-avatar');
    
    if (userNameElements.length > 0) {
        userNameElements.forEach(el => el.textContent = userName);
    }
    if (userRoleElements.length > 0) {
        userRoleElements.forEach(el => el.textContent = userRole);
    }
    if (userAvatarElement && userName) {
        const avatarLetter = userName.charAt(0).toUpperCase();
        userAvatarElement.textContent = avatarLetter;
    }
    
    // 更新大頭像和詳細資訊
    const userNameLargeElement = DOMUtils.select('.user-name-large');
    const userEmailElement = DOMUtils.select('.user-email');
    const userAvatarLargeElement = DOMUtils.select('.user-avatar-large');
    
    if (userNameLargeElement) userNameLargeElement.textContent = userName;
    if (userEmailElement) userEmailElement.textContent = user.email || '';
    if (userAvatarLargeElement && userName) {
        const avatarLetter = userName.charAt(0).toUpperCase();
        userAvatarLargeElement.textContent = avatarLetter;
    }
}

// 獲取角色文字
function getRoleText(role) {
    const roleMap = {
        'Admin': '管理員',
        'Manager': '主管',
        'User': '一般使用者',
        'user': '一般使用者',
        'Editor': '編輯者',
        'Viewer': '檢視者',
        'Approver': '審核者'
    };
    return roleMap[role] || role;
}

// 根據角色更新可見性
function updateRoleBasedVisibility(user) {
    // 檢查用戶是否存在
    if (!user) {
        console.warn('用戶資訊不存在，無法更新角色基於可見性');
        return;
    }
    
    const settingsItems = DOMUtils.selectAll('[data-role-required="Admin"]');
    settingsItems.forEach(item => {
        if (user.role !== 'Admin') {
            item.style.display = 'none';
        } else {
            item.style.display = '';
        }
    });
}

// 使用者選單功能 - 重構版本
function initializeUserMenu() {
    const userMenuBtn = DOMUtils.select('.user-menu-btn');
    const userDropdown = DOMUtils.select('.user-dropdown');
    
    if (userMenuBtn && userDropdown) {
        // 點擊用戶選單按鈕切換下拉選單
        EventUtils.on(userMenuBtn, 'click', function(e) {
            e.stopPropagation();
            toggleUserDropdown();
        });
        
        // 處理下拉選單項目點擊
        EventUtils.delegate(userDropdown, '.dropdown-item', 'click', function(event) {
            event.preventDefault();
            const action = this.getAttribute('href') || this.dataset.action;
            handleUserMenuAction(action);
            closeUserDropdown();
        });
        
        // 點擊外部關閉下拉選單
        EventUtils.on(document, 'click', function(event) {
            if (!userMenuBtn.contains(event.target) && !userDropdown.contains(event.target)) {
                closeUserDropdown();
            }
        });
        
        // ESC 鍵關閉下拉選單
        EventUtils.on(document, 'keydown', function(event) {
            if (event.key === 'Escape') {
                closeUserDropdown();
            }
        });
    }
}

// 切換用戶下拉選單
function toggleUserDropdown() {
    const userDropdown = DOMUtils.select('.user-dropdown');
    if (userDropdown) {
        DOMUtils.toggleClass(userDropdown, 'show');
    }
}

// 關閉用戶下拉選單
function closeUserDropdown() {
    const userDropdown = DOMUtils.select('.user-dropdown');
    if (userDropdown) {
        DOMUtils.removeClass(userDropdown, 'show');
    }
}

// 處理使用者選單動作
function handleUserMenuAction(action) {
    // 處理頁面導航
    if (action && (action.endsWith('.html') || action.startsWith('/'))) {
        window.location.href = action;
        return;
    }

    switch (action) {
        case 'profile':
        case '#profile':
            // 根據當前頁面判斷跳轉目標
            // 如果是 dashboard.html 或其他管理員頁面，跳轉到 profile.html
            const currentPath = window.location.pathname;
            const isDashboard = currentPath.endsWith('dashboard.html');
            
            if (checkIfAdminPage() || isDashboard) {
                window.location.href = 'profile.html';
            } else {
                window.location.href = 'user-profile.html';
            }
            break;
        case 'settings':
        case '#settings':
            showSettings();
            break;
        case 'logout':
        case '#logout':
            handleLogout();
            break;
        default:
            console.log('未知的選單動作:', action);
    }
}

// 處理登出
function handleLogout() {
    // 檢查是否為admin頁面
    const isAdminPage = checkIfAdminPage();
    
    if (isAdminPage && window.adminAuth && typeof window.adminAuth.logout === 'function') {
        // Admin頁面使用adminAuth登出
        window.adminAuth.logout();
    } else if (window.authGuard && typeof window.authGuard.logout === 'function') {
        // 一般頁面使用authGuard登出
        window.authGuard.logout();
    } else {
        // 備用登出邏輯
        if (isAdminPage) {
            localStorage.removeItem('adminAuthToken');
            localStorage.removeItem('adminUser');
            window.location.href = 'login.html';
        } else {
            localStorage.removeItem('authToken');
            localStorage.removeItem('user');
            window.location.href = 'user-login.html';
        }
    }
}

// 檢查是否為admin頁面
function checkIfAdminPage() {
    const currentPath = window.location.pathname;
    const adminPages = [
        'settings.html',
        'dashboard.html',
        'users.html',
        'admin-users.html',
        'email-logs.html',
        'profile.html',
        'analytics.html',
        'queue.html',
        'subscriber-stats.html',
        'admin.html'
    ];
    
    const currentPage = currentPath.split('/').pop() || 'index.html';
    // 只有當頁面名稱完全匹配且確實是管理員頁面時才返回 true
    return adminPages.includes(currentPage);
}

// 顯示個人資料
function showProfile() {
    window.location.href = 'profile.html';
}

// 顯示設定（佔位符）
function showSettings() {
    // 檢查用戶權限
    const user = window.appState ? window.appState.get('user') : null;
    if (user && user.role === 'Admin') {
        NotificationUtils.info('系統設定功能開發中...');
    } else {
        NotificationUtils.warning('您沒有權限訪問系統設定');
    }
}

// 設定當前頁面的選單項目為活躍狀態
function setActiveMenuItem() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const menuItems = DOMUtils.selectAll('.menu-item');
    
    menuItems.forEach(item => {
        DOMUtils.removeClass(item, 'active');
        const link = DOMUtils.select('.menu-link', item);
        if (link && link.getAttribute('href') === currentPage) {
            DOMUtils.addClass(item, 'active');
        }
    });
}

// 工具提示功能 - 使用新的工具系統
function initializeTooltips() {
    const tooltipElements = DOMUtils.selectAll('[data-tooltip]');
    
    tooltipElements.forEach(element => {
        EventUtils.on(element, 'mouseenter', function() {
            showTooltip(this, this.getAttribute('data-tooltip'));
        });
        
        EventUtils.on(element, 'mouseleave', hideTooltip);
    });
}

// 顯示工具提示 - 優化版本
function showTooltip(element, text) {
    // 移除現有的工具提示
    hideTooltip();
    
    const tooltip = DOMUtils.create('div', {
        className: 'tooltip-popup',
        textContent: text
    });
    
    document.body.appendChild(tooltip);
    
    // 使用更精確的定位
    const rect = element.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    
    let top = rect.top - tooltipRect.height - 5;
    let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
    
    // 確保工具提示不會超出視窗邊界
    if (top < 0) {
        top = rect.bottom + 5;
        DOMUtils.addClass(tooltip, 'tooltip-bottom');
    }
    
    if (left < 0) {
        left = 5;
    } else if (left + tooltipRect.width > window.innerWidth) {
        left = window.innerWidth - tooltipRect.width - 5;
    }
    
    tooltip.style.position = 'fixed';
    tooltip.style.top = top + 'px';
    tooltip.style.left = left + 'px';
    tooltip.style.zIndex = '1002';
}

// 隱藏工具提示
function hideTooltip() {
    const tooltip = DOMUtils.select('.tooltip-popup');
    if (tooltip) {
        tooltip.remove();
    }
}

// 更新使用者介面
function updateUserInterface(user) {
    if (user) {
        const userNameElement = DOMUtils.select('.user-name');
        if (userNameElement) {
            userNameElement.textContent = user.name || '使用者';
        }
        
        const userAvatarElement = DOMUtils.select('.user-avatar');
        if (userAvatarElement && user.avatar) {
            userAvatarElement.src = user.avatar;
        }
    }
}

// 通用功能函數 - 重構版本
function showProfile() {
    NotificationUtils.show('個人資料功能開發中...', 'info');
}

function showSettings() {
    window.location.href = 'settings.html';
}

// 初始化所有服務
function initializeServices() {
    // 將實例附加到 window 物件，使其在全域可用
    window.apiClient = new ApiClient();
    window.subscriberService = new SubscriberService(window.apiClient);
    window.categoryService = new CategoryService(window.apiClient);
    console.log('所有服務已初始化');
}

// 全域函數
function logout() {
    if (confirm('確定要登出嗎？')) {
        if (window.appState) {
            window.appState.setState('loading', true);
        }
        NotificationUtils.show('正在登出...', 'info');
        
        // 清除本地存儲
        StorageUtils.clear();
        
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 1000);
    }
}

// 載入狀態管理 - 使用新的狀態管理系統
function showLoading(selector) {
    const element = typeof selector === 'string' ? DOMUtils.select(selector) : selector;
    
    if (element) {
        element.innerHTML = '<div class="loading"></div>';
        DOMUtils.addClass(element, 'loading-state');
    }
}

function hideLoading(selector, content = '') {
    const element = typeof selector === 'string' ? DOMUtils.select(selector) : selector;
    
    if (element) {
        element.innerHTML = content;
        DOMUtils.removeClass(element, 'loading-state');
    }
}

// 表單驗證 - 使用 ValidationUtils
function validateForm(formElement) {
    const inputs = DOMUtils.selectAll('input[required], select[required], textarea[required]', formElement);
    let isValid = true;
    
    inputs.forEach(input => {
        clearFieldError(input);
        
        const value = input.value.trim();
        let fieldValid = true;
        let errorMessage = '';
        
        // 基本必填驗證
        if (!value) {
            fieldValid = false;
            errorMessage = '此欄位為必填';
        } else {
            // 特定類型驗證
            const inputType = input.type || input.tagName.toLowerCase();
            
            switch (inputType) {
                case 'email':
                    if (!ValidationUtils.isValidEmail(value)) {
                        fieldValid = false;
                        errorMessage = '請輸入有效的電子郵件地址';
                    }
                    break;
                case 'url':
                    if (!ValidationUtils.isValidURL(value)) {
                        fieldValid = false;
                        errorMessage = '請輸入有效的網址';
                    }
                    break;
                case 'tel':
                    if (!ValidationUtils.isValidPhone(value)) {
                        fieldValid = false;
                        errorMessage = '請輸入有效的電話號碼';
                    }
                    break;
                case 'password':
                    const strength = ValidationUtils.getPasswordStrength(value);
                    if (strength.score < 3) {
                        fieldValid = false;
                        errorMessage = '密碼強度不足：' + strength.feedback.join(', ');
                    }
                    break;
            }
        }
        
        if (!fieldValid) {
            showFieldError(input, errorMessage);
            isValid = false;
        }
    });
    
    return isValid;
}

function showFieldError(input, message) {
    clearFieldError(input);
    
    const errorElement = DOMUtils.create('div', {
        className: 'field-error',
        textContent: message
    });
    
    input.parentNode.appendChild(errorElement);
    DOMUtils.addClass(input, 'error');
}

function clearFieldError(input) {
    const existingError = DOMUtils.select('.field-error', input.parentNode);
    if (existingError) {
        existingError.remove();
    }
    DOMUtils.removeClass(input, 'error');
}

// 匯出全域函數和變數
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.validateForm = validateForm;
window.showFieldError = showFieldError;
window.clearFieldError = clearFieldError;

// 初始化性能監控
PerformanceUtils.startTimer('page-load');
window.addEventListener('load', () => {
    PerformanceUtils.endTimer('page-load');
    console.log('頁面載入完成');
});
