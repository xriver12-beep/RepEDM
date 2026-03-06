// 開發模式配置
const DEV_CONFIG = {
    // 是否啟用開發模式
    DEV_MODE: false,
    
    // 是否跳過認證檢查
    SKIP_AUTH: false,
    
    // 模擬用戶數據
    MOCK_USER: {
        id: 1,
        username: 'dev_admin',
        email: 'dev@example.com',
        full_name: '開發管理員',
        role: 'admin',
        is_active: true
    },
    
    // 模擬認證 token
    MOCK_TOKEN: 'dev_mock_token_12345'
};

// 檢查是否為開發模式
function isDevMode() {
    return DEV_CONFIG.DEV_MODE && window.location.hostname === 'localhost';
}

// 檢查是否跳過認證
function shouldSkipAuth() {
    return isDevMode() && DEV_CONFIG.SKIP_AUTH;
}

// 獲取模擬用戶數據
function getMockUser() {
    return DEV_CONFIG.MOCK_USER;
}

// 獲取模擬 token
function getMockToken() {
    return DEV_CONFIG.MOCK_TOKEN;
}

// 導出配置
window.DevConfig = {
    isDevMode,
    shouldSkipAuth,
    getMockUser,
    getMockToken,
    DEV_CONFIG
};
