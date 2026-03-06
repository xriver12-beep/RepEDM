// 管理員登入頁面功能
class AdminLoginManager {
    constructor() {
        this.form = document.getElementById('loginForm');
        this.usernameInput = document.getElementById('username');
        this.passwordInput = document.getElementById('password');
        this.passwordToggle = document.getElementById('passwordToggle');
        this.rememberMeCheckbox = document.getElementById('rememberMe');
        this.loginBtn = document.getElementById('loginBtn');
        this.loginError = document.getElementById('loginError');
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.checkExistingAuth();
        this.loadRememberedUsername();
        this.setupDemoAccounts();
    }

    bindEvents() {
        // 表單提交
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
        
        // 密碼顯示/隱藏切換
        this.passwordToggle.addEventListener('click', () => this.togglePassword());
        
        // 輸入驗證
        this.usernameInput.addEventListener('blur', () => this.validateUsername());
        this.passwordInput.addEventListener('blur', () => this.validatePassword());
        
        // 清除錯誤訊息
        this.usernameInput.addEventListener('input', () => this.clearError('usernameError'));
        this.passwordInput.addEventListener('input', () => this.clearError('passwordError'));
        
        // Enter 鍵處理
        this.usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.passwordInput.focus();
            }
        });
        
        this.passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.form.dispatchEvent(new Event('submit'));
            }
        });
    }

    // 設置測試帳號點擊功能
    setupDemoAccounts() {
        const demoAccounts = document.querySelectorAll('.demo-account');
        demoAccounts.forEach(account => {
            account.addEventListener('click', () => {
                const username = account.getAttribute('data-username');
                const password = account.getAttribute('data-password');
                this.usernameInput.value = username;
                this.passwordInput.value = password;
                this.clearAllErrors();
            });
        });
    }

    // 檢查是否已經登入
    checkExistingAuth() {
        if (window.adminAuth && adminAuth.isAuthenticated()) {
            // 已經登入，重定向到儀表板
            window.location.href = 'dashboard.html';
        }
    }

    // 載入記住的用戶名
    loadRememberedUsername() {
        try {
            const rememberedUsername = localStorage.getItem('rememberedUsername');
            if (rememberedUsername) {
                this.usernameInput.value = rememberedUsername;
                this.rememberMeCheckbox.checked = true;
            }
        } catch (error) {
            // 無痕模式下 localStorage 可能無法使用，忽略錯誤
            console.warn('無法載入記住的用戶名（可能是無痕模式）:', error);
        }
    }

    // 處理表單提交
    async handleSubmit(e) {
        e.preventDefault();
        
        // 清除之前的錯誤
        this.hideLoginError();
        
        // 驗證表單
        if (!this.validateForm()) {
            return;
        }

        // 顯示載入狀態
        this.setLoading(true);

        try {
            const username = this.usernameInput.value.trim();
            const password = this.passwordInput.value;
            const rememberMe = this.rememberMeCheckbox.checked;

            // 呼叫管理員登入 API
            if (!window.adminAuth) {
                throw new Error('認證服務未載入');
            }
            const response = await adminAuth.login(username, password);
            
            // 處理記住我功能
            try {
                if (rememberMe) {
                    localStorage.setItem('rememberedUsername', username);
                } else {
                    localStorage.removeItem('rememberedUsername');
                }
            } catch (error) {
                // 無痕模式下 localStorage 可能無法使用，忽略錯誤
                console.warn('無法保存記住我設定（可能是無痕模式）:', error);
            }

            // 登入成功，根據角色重定向
            this.showSuccessMessage('登入成功！正在跳轉...');
            
            setTimeout(() => {
                const user = window.adminAuth.getUser();
                if (user && (user.role === 'User' || user.role === 'Viewer')) {
                    window.location.href = 'user-dashboard.html';
                } else {
                    window.location.href = 'dashboard.html';
                }
            }, 1000);

        } catch (error) {
            console.error('登入錯誤:', error);
            this.showLoginError(this.getErrorMessage(error));
        } finally {
            this.setLoading(false);
        }
    }

    // 表單驗證
    validateForm() {
        let isValid = true;
        
        if (!this.validateUsername()) {
            isValid = false;
        }
        
        if (!this.validatePassword()) {
            isValid = false;
        }
        
        return isValid;
    }

    // 用戶名驗證
    validateUsername() {
        const username = this.usernameInput.value.trim();
        
        if (!username) {
            this.showError('usernameError', '請輸入用戶名');
            return false;
        }
        
        if (username.length < 3) {
            this.showError('usernameError', '用戶名至少需要3個字符');
            return false;
        }
        
        this.clearError('usernameError');
        return true;
    }

    // 密碼驗證
    validatePassword() {
        const password = this.passwordInput.value;
        
        if (!password) {
            this.showError('passwordError', '請輸入密碼');
            return false;
        }
        
        if (password.length < 6) {
            this.showError('passwordError', '密碼至少需要6個字符');
            return false;
        }
        
        this.clearError('passwordError');
        return true;
    }

    // 密碼顯示/隱藏切換
    togglePassword() {
        const type = this.passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        this.passwordInput.setAttribute('type', type);
        
        const icon = this.passwordToggle.querySelector('i');
        if (type === 'password') {
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        } else {
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        }
    }

    // 顯示錯誤訊息
    showError(elementId, message) {
        const errorElement = document.getElementById(elementId);
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.style.display = 'block';
        }
    }

    // 清除錯誤訊息
    clearError(elementId) {
        const errorElement = document.getElementById(elementId);
        if (errorElement) {
            errorElement.style.display = 'none';
        }
    }

    // 清除所有錯誤訊息
    clearAllErrors() {
        this.clearError('usernameError');
        this.clearError('passwordError');
        this.hideLoginError();
    }

    // 顯示登入錯誤
    showLoginError(message) {
        this.loginError.textContent = message;
        this.loginError.style.display = 'block';
        this.loginError.classList.add('shake');
        
        setTimeout(() => {
            this.loginError.classList.remove('shake');
        }, 500);
    }

    // 隱藏登入錯誤
    hideLoginError() {
        this.loginError.style.display = 'none';
    }

    // 顯示成功訊息
    showSuccessMessage(message) {
        this.loginError.textContent = message;
        this.loginError.style.display = 'block';
        this.loginError.style.color = '#28a745';
        this.loginError.style.backgroundColor = '#d4edda';
        this.loginError.style.borderColor = '#c3e6cb';
    }

    // 設置載入狀態
    setLoading(loading) {
        if (loading) {
            this.loginBtn.disabled = true;
            this.loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 登入中...';
        } else {
            this.loginBtn.disabled = false;
            this.loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> 登入';
        }
    }

    // 獲取錯誤訊息
    getErrorMessage(error) {
        if (error.message) {
            return error.message;
        }
        
        switch (error.status) {
            case 401:
                return '用戶名或密碼錯誤';
            case 403:
                return '帳號已被停用';
            case 429:
                return '登入嘗試次數過多，請稍後再試';
            case 500:
                return '伺服器錯誤，請稍後再試';
            default:
                return '登入失敗，請檢查網路連線';
        }
    }
}

// 頁面載入完成後初始化
window.addEventListener('load', () => {
    // 等待adminAuth可用
    const initLoginManager = () => {
        if (window.adminAuth) {
            new AdminLoginManager();
        } else {
            // 如果adminAuth還沒有載入，等待一下再試
            setTimeout(initLoginManager, 100);
        }
    };
    
    initLoginManager();
});