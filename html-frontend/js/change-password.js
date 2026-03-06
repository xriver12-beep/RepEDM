// 修改密碼頁面管理器
class ChangePasswordManager {
    constructor() {
        this.adminAuth = new AdminAuthService();
        this.form = null;
        this.currentPasswordInput = null;
        this.newPasswordInput = null;
        this.confirmPasswordInput = null;
        this.errorMessage = null;
        this.successMessage = null;
        this.submitBtn = null;
        
        this.init();
    }

    init() {
        // 檢查用戶是否已登入
        if (!this.adminAuth.isAuthenticated()) {
            window.location.href = 'login.html';
            return;
        }

        // 等待 DOM 載入完成
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initializeElements());
        } else {
            this.initializeElements();
        }
    }

    initializeElements() {
        // 獲取 DOM 元素
        this.form = document.getElementById('changePasswordForm');
        this.currentPasswordInput = document.getElementById('currentPassword');
        this.newPasswordInput = document.getElementById('newPassword');
        this.confirmPasswordInput = document.getElementById('confirmPassword');
        this.errorMessage = document.getElementById('errorMessage');
        this.successMessage = document.getElementById('successMessage');
        this.submitBtn = document.getElementById('changePasswordBtn');

        if (!this.form) {
            console.error('找不到修改密碼表單');
            return;
        }

        this.setupEventListeners();
        this.setupPasswordToggles();
    }

    setupEventListeners() {
        // 表單提交事件
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));

        // 密碼確認驗證
        this.confirmPasswordInput.addEventListener('input', () => this.validatePasswordMatch());
        this.newPasswordInput.addEventListener('input', () => this.validatePasswordMatch());

        // 清除錯誤訊息
        [this.currentPasswordInput, this.newPasswordInput, this.confirmPasswordInput].forEach(input => {
            input.addEventListener('input', () => this.clearMessages());
        });
    }

    setupPasswordToggles() {
        // 設置密碼顯示/隱藏切換
        const toggleButtons = document.querySelectorAll('.enhanced-password-toggle');
        toggleButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = button.getAttribute('data-target');
                const targetInput = document.getElementById(targetId);
                const icon = button.querySelector('i');

                if (targetInput.type === 'password') {
                    targetInput.type = 'text';
                    icon.classList.remove('fa-eye');
                    icon.classList.add('fa-eye-slash');
                    button.style.background = '#dbeafe';
                    button.style.color = '#3b82f6';
                } else {
                    targetInput.type = 'password';
                    icon.classList.remove('fa-eye-slash');
                    icon.classList.add('fa-eye');
                    button.style.background = '#f3f4f6';
                    button.style.color = '#6b7280';
                }
            });
        });
    }

    validatePasswordMatch() {
        const newPassword = this.newPasswordInput.value;
        const confirmPassword = this.confirmPasswordInput.value;

        if (confirmPassword && newPassword !== confirmPassword) {
            this.confirmPasswordInput.setCustomValidity('密碼不一致');
            this.showError('新密碼與確認密碼不一致');
        } else {
            this.confirmPasswordInput.setCustomValidity('');
            this.clearMessages();
        }
    }

    async handleSubmit(e) {
        e.preventDefault();
        
        const currentPassword = this.currentPasswordInput.value.trim();
        const newPassword = this.newPasswordInput.value.trim();
        const confirmPassword = this.confirmPasswordInput.value.trim();

        // 基本驗證
        if (!currentPassword || !newPassword || !confirmPassword) {
            this.showError('請填寫所有欄位');
            return;
        }

        if (newPassword !== confirmPassword) {
            this.showError('新密碼與確認密碼不一致');
            return;
        }

        if (newPassword.length < 8) {
            this.showError('新密碼至少需要 8 個字符');
            return;
        }

        if (currentPassword === newPassword) {
            this.showError('新密碼不能與目前密碼相同');
            return;
        }

        try {
            this.setLoading(true);
            this.clearMessages();

            // 調用 API 修改密碼
            await this.adminAuth.changePassword(currentPassword, newPassword);

            this.showSuccess('密碼修改成功！3 秒後將跳轉到儀表板...');
            
            // 3 秒後跳轉到儀表板
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 3000);

        } catch (error) {
            console.error('修改密碼失敗:', error);
            this.showError(error.message || '修改密碼失敗，請稍後再試');
        } finally {
            this.setLoading(false);
        }
    }

    setLoading(isLoading) {
        if (this.submitBtn) {
            this.submitBtn.disabled = isLoading;
            const icon = this.submitBtn.querySelector('i');
            const text = this.submitBtn.childNodes[1];
            
            if (isLoading) {
                icon.className = 'fas fa-spinner fa-spin';
                text.textContent = ' 處理中...';
            } else {
                icon.className = 'fas fa-save';
                text.textContent = ' 更新密碼';
            }
        }

        // 禁用表單輸入
        const inputs = this.form.querySelectorAll('input');
        inputs.forEach(input => {
            input.disabled = isLoading;
        });
    }

    showError(message) {
        if (this.errorMessage) {
            this.errorMessage.textContent = message;
            this.errorMessage.style.display = 'block';
        }
        if (this.successMessage) {
            this.successMessage.style.display = 'none';
        }
    }

    showSuccess(message) {
        if (this.successMessage) {
            this.successMessage.textContent = message;
            this.successMessage.style.display = 'block';
        }
        if (this.errorMessage) {
            this.errorMessage.style.display = 'none';
        }
    }

    clearMessages() {
        if (this.errorMessage) {
            this.errorMessage.style.display = 'none';
        }
        if (this.successMessage) {
            this.successMessage.style.display = 'none';
        }
    }
}

// 初始化修改密碼管理器
const changePasswordManager = new ChangePasswordManager();