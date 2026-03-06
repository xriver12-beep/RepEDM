/**
 * 管理員帳號管理器
 * 處理管理員帳號頁面的所有邏輯和交互
 */
class AdminUserManager {
    constructor() {
        this.currentPage = 1;
        this.pageSize = 10;
        this.searchTerm = '';
        this.selectedUsers = new Set();
        this.sortField = 'CreatedAt';
        this.sortOrder = 'desc';
        this.roleFilter = '';
        this.statusFilter = 'active'; // 預設顯示啟用
        this.users = [];
        this.stats = {};
        
        // 模態框實例
        this.userModal = null;
        this.deleteModal = null;
        this.resetPasswordModal = null;
        
        this.init();
    }

    /**
     * 初始化
     */
    async init() {
        try {
            // Initialize Auth Guard
            const authGuard = new AdminAuthGuard();
            await authGuard.init();

            await this.initializeComponents();
            await this.loadInitialData();
            this.bindEvents();
        } catch (error) {
            console.error('初始化失敗:', error);
            notification.error('頁面初始化失敗，請重新載入頁面');
        }
    }

    /**
     * 初始化組件
     */
    async initializeComponents() {
        // 初始化模態框
        this.userModal = new Modal(document.getElementById('userModal'));
        this.deleteModal = new Modal(document.getElementById('deleteConfirmModal'));
        this.resetPasswordModal = new Modal(document.getElementById('resetPasswordModal'));
    }

    /**
     * 載入初始數據
     */
    async loadInitialData() {
        const loadingId = notification.loading('載入數據中...');
        
        try {
            // 載入用戶列表
            await this.loadUsers();
            
            notification.remove(loadingId);
        } catch (error) {
            notification.remove(loadingId);
            throw error;
        }
    }

    /**
     * 搜尋用戶
     */
    searchUsers() {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            this.searchTerm = searchInput.value.trim();
        }
        this.currentPage = 1;
        this.loadUsers();
    }

    /**
     * 綁定事件
     */
    bindEvents() {
        // 搜尋功能
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            let searchTimeout;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    this.searchTerm = e.target.value.trim();
                    this.currentPage = 1;
                    this.loadUsers();
                }, 300);
            });
            // Handle Enter key
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.searchUsers();
                }
            });
        }

        const searchBtn = document.getElementById('searchBtn');
        if (searchBtn) {
            searchBtn.addEventListener('click', () => this.searchUsers());
        }

        // Filters
        const roleFilter = document.getElementById('roleFilter');
        if (roleFilter) {
            roleFilter.addEventListener('change', () => this.filterByRole());
        }

        const statusFilter = document.getElementById('statusFilter');
        if (statusFilter) {
            statusFilter.addEventListener('change', () => this.filterByStatus());
        }

        // 新增用戶按鈕
        const addUserBtn = document.getElementById('addUserBtn');
        if (addUserBtn) {
            addUserBtn.addEventListener('click', () => this.showUserModal());
        }

        const refreshUsersBtn = document.getElementById('refreshUsersBtn');
        if (refreshUsersBtn) {
            refreshUsersBtn.addEventListener('click', () => this.loadUsers());
        }

        // 表單提交
        const userForm = document.getElementById('userForm');
        if (userForm) {
            userForm.addEventListener('submit', (e) => this.handleUserSubmit(e));
        }

        const resetPasswordForm = document.getElementById('resetPasswordForm');
        if (resetPasswordForm) {
            resetPasswordForm.addEventListener('submit', (e) => this.handlePasswordReset(e));
        }

        // 全選功能
        const selectAllCheckbox = document.getElementById('selectAll');
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', (e) => this.handleSelectAll(e));
        }

        // Modals Close Buttons
        document.getElementById('closeUserModalBtn')?.addEventListener('click', () => this.closeUserModal());
        document.getElementById('cancelUserModalBtn')?.addEventListener('click', () => this.closeUserModal());
        
        document.getElementById('closeResetPasswordModalBtn')?.addEventListener('click', () => this.closeResetPasswordModal());
        document.getElementById('cancelResetPasswordModalBtn')?.addEventListener('click', () => this.closeResetPasswordModal());
        
        document.getElementById('closeDeleteConfirmModalBtn')?.addEventListener('click', () => this.closeDeleteConfirmModal());
        document.getElementById('cancelDeleteConfirmModalBtn')?.addEventListener('click', () => this.closeDeleteConfirmModal());
        
        document.getElementById('confirmDeleteBtn')?.addEventListener('click', () => this.confirmDelete());

        // Password Visibility Toggle
        document.querySelectorAll('.toggle-password-visibility').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetId = e.currentTarget.dataset.target;
                this.togglePasswordVisibility(targetId);
            });
        });

        // Table Event Delegation
        const usersTableBody = document.getElementById('usersTableBody');
        if (usersTableBody) {
            usersTableBody.addEventListener('click', (e) => {
                const target = e.target.closest('button');
                if (!target) return;

                const userId = target.dataset.userId;
                const action = target.dataset.action;

                if (userId && action) {
                    if (action === 'edit') {
                        this.editUser(userId);
                    } else if (action === 'reset-password') {
                        this.showResetPasswordModal(userId);
                    } else if (action === 'toggle-status') {
                        const isActive = target.dataset.isActive === 'true';
                        this.toggleUserStatus(userId, !isActive);
                    } else if (action === 'delete') {
                        this.deleteUser(userId);
                    }
                }
            });
        }

        // Pagination Event Delegation
        const paginationContainer = document.getElementById('paginationContainer');
        if (paginationContainer) {
            paginationContainer.addEventListener('click', (e) => {
                const target = e.target.closest('.pagination-btn');
                if (!target || target.disabled) return;
                
                const page = parseInt(target.dataset.page);
                if (!isNaN(page)) {
                    this.goToPage(page);
                }
            });
        }
    }

    /**
     * 載入用戶列表
     */
    async loadUsers() {
        try {
            this.showLoading(true);
            
            const response = await adminUserService.getUsers(
                this.currentPage,
                this.pageSize,
                this.searchTerm,
                this.roleFilter,
                this.statusFilter
            );
            
            this.users = response.data?.users || [];
            this.updateUsersTable();
            this.updatePagination(response.data?.pagination);
            
            // 更新統計顯示 (簡單版) - 已改由 loadStats 處理
            // if (document.getElementById('totalUsers')) {
            //     document.getElementById('totalUsers').textContent = response.data?.pagination?.total || 0;
            // }
            // if (document.getElementById('activeUsers')) {
            //      // 這裡只能顯示當前頁的活躍數，或者不顯示
            //      // 如果後端沒給統計API，就先放著
            //      document.getElementById('activeUsers').textContent = '-'; 
            // }

        } catch (error) {
            console.error('載入管理員列表失敗:', error);
            notification.error('載入管理員列表失敗: ' + error.message);
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * 獲取角色顯示名稱
     */
    getRoleDisplayName(role) {
        if (!role) return '未知';
        return role; // 直接顯示 Role 字符串，或者做映射
    }

    /**
     * 獲取角色標籤樣式
     */
    getRoleBadgeClass(role) {
        if (!role) return 'badge-secondary';
        
        const styleMap = {
            'Admin': 'badge-primary',
            'Manager': 'badge-info',
            'Editor': 'badge-success',
            'Viewer': 'badge-secondary'
        };
        
        return styleMap[role] || 'badge-secondary';
    }

    /**
     * 更新用戶表格
     */
    updateUsersTable() {
        const tbody = document.querySelector('#usersTable tbody');
        if (!tbody) return;

        if (this.users.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center py-4">
                        <div class="empty-state">
                            <i class="fas fa-users fa-3x text-muted mb-3"></i>
                            <p class="text-muted">沒有找到管理員</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = this.users.map(user => `
            <tr data-user-id="${user.id}">
                <td>
                    <input type="checkbox" class="user-checkbox" value="${user.id}" 
                           ${this.selectedUsers.has(user.id) ? 'checked' : ''}>
                </td>
                <td>
                    <div class="user-name">${this.escapeHtml(user.username)}</div>
                </td>
                <td>
                    <div class="user-fullname">${this.escapeHtml(user.displayName || '')}</div>
                </td>
                <td>
                    <div class="user-email">${this.escapeHtml(user.email || '')}</div>
                </td>
                <td>
                    <span class="badge ${this.getRoleBadgeClass(user.role)}">
                        ${this.getRoleDisplayName(user.role)}
                    </span>
                </td>
                <td>
                    <span class="status-badge ${user.isActive ? 'active' : 'inactive'}">
                        ${user.isActive ? '啟用' : '停用'}
                    </span>
                </td>
                <td>${this.formatDate(user.lastLoginAt)}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-sm btn-outline-primary" 
                                data-action="edit" data-user-id="${user.id}"
                                title="編輯">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-warning" 
                                data-action="reset-password" data-user-id="${user.id}"
                                title="重置密碼">
                            <i class="fas fa-key"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-${user.isActive ? 'secondary' : 'success'}" 
                                data-action="toggle-status" data-user-id="${user.id}" data-is-active="${user.isActive}"
                                title="${user.isActive ? '停用' : '啟用'}">
                            <i class="fas fa-${user.isActive ? 'ban' : 'check'}"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger" 
                                data-action="delete" data-user-id="${user.id}"
                                title="刪除">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    /**
     * 更新分頁
     */
    updatePagination(pagination) {
        const paginationContainer = document.getElementById('paginationContainer');
        if (!paginationContainer || !pagination) return;

        const currentPage = pagination.page;
        const totalPages = pagination.pages;
        const totalItems = pagination.total;
        
        let paginationHTML = '';
        
        // 上一頁
        paginationHTML += `
            <button class="btn btn-outline-primary btn-sm pagination-btn" 
                    ${currentPage <= 1 ? 'disabled' : ''} 
                    data-page="${currentPage - 1}">
                <i class="fas fa-chevron-left"></i>
            </button>
        `;

        // 頁碼
        const startPage = Math.max(1, currentPage - 2);
        const endPage = Math.min(totalPages, currentPage + 2);

        if (startPage > 1) {
            paginationHTML += `<button class="btn btn-outline-primary btn-sm pagination-btn" data-page="1">1</button>`;
            if (startPage > 2) {
                paginationHTML += `<span class="pagination-ellipsis">...</span>`;
            }
        }

        for (let i = startPage; i <= endPage; i++) {
            paginationHTML += `
                <button class="btn ${i === currentPage ? 'btn-primary' : 'btn-outline-primary'} btn-sm pagination-btn" 
                        data-page="${i}">
                    ${i}
                </button>
            `;
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                paginationHTML += `<span class="pagination-ellipsis">...</span>`;
            }
            paginationHTML += `<button class="btn btn-outline-primary btn-sm pagination-btn" data-page="${totalPages}">${totalPages}</button>`;
        }

        // 下一頁
        paginationHTML += `
            <button class="btn btn-outline-primary btn-sm pagination-btn" 
                    ${currentPage >= totalPages ? 'disabled' : ''} 
                    data-page="${currentPage + 1}">
                <i class="fas fa-chevron-right"></i>
            </button>
        `;

        const start = (currentPage - 1) * this.pageSize + 1;
        const end = Math.min(currentPage * this.pageSize, totalItems);
        const infoHTML = `<div class="pagination-info" style="margin-top: 10px; text-align: center; color: #666;">顯示 ${start}-${end} 項，共 ${totalItems} 項</div>`;

        paginationContainer.innerHTML = paginationHTML + infoHTML;
    }

    /**
     * 跳轉到指定頁面
     */
    async goToPage(page) {
        if (page < 1 || page === this.currentPage) return;
        this.currentPage = page;
        await this.loadUsers();
    }

    /**
     * 顯示用戶模態框
     */
    showUserModal(userId = null) {
        const form = document.getElementById('userForm');
        const modalTitle = document.getElementById('userModalTitle');
        
        if (userId) {
            modalTitle.textContent = '編輯管理員';
            const passwordGroup = document.getElementById('passwordGroup');
            if (passwordGroup) passwordGroup.style.display = 'none';
            
            this.loadUserForEdit(userId);
        } else {
            modalTitle.textContent = '新增管理員';
            form.reset();
            form.dataset.userId = '';
            
            const passwordGroup = document.getElementById('passwordGroup');
            if (passwordGroup) passwordGroup.style.display = 'block';
        }
        
        this.userModal.show();
    }

    /**
     * 載入用戶進行編輯
     */
    async loadUserForEdit(userId) {
        try {
            const response = await adminUserService.getUser(userId);
            const user = response.data.user;
            const form = document.getElementById('userForm');
            
            form.dataset.userId = userId;
            form.username.value = user.username;
            form.email.value = user.email || '';
            form.displayName.value = user.displayName || '';
            form.firstName.value = user.firstName || '';
            form.lastName.value = user.lastName || '';
            form.department.value = user.department || '';
            form.position.value = user.position || '';
            form.role.value = user.role;
            form.is_active.checked = user.isActive;
            
        } catch (error) {
            notification.error('載入管理員信息失敗: ' + error.message);
        }
    }

    /**
     * 處理用戶表單提交
     */
    async handleUserSubmit(e) {
        e.preventDefault();
        
        const form = e.target;
        const formData = new FormData(form);
        const userId = form.dataset.userId;
        
        const userData = {
            username: formData.get('username'),
            email: formData.get('email'),
            displayName: formData.get('displayName'),
            firstName: formData.get('firstName'),
            lastName: formData.get('lastName'),
            department: formData.get('department'),
            position: formData.get('position'),
            role: formData.get('role'),
            isActive: formData.has('is_active')
        };

        if (!userId) {
            userData.password = formData.get('password');
        }

        try {
            if (userId) {
                await adminUserService.updateUser(userId, userData);
                notification.success('管理員更新成功');
            } else {
                await adminUserService.createUser(userData);
                notification.success('管理員創建成功');
            }
            
            this.userModal.hide();
            await this.loadUsers();
            
        } catch (error) {
            notification.error('操作失敗: ' + error.message);
        }
    }

    /**
     * 編輯用戶
     */
    editUser(userId) {
        this.showUserModal(userId);
    }

    /**
     * 刪除用戶
     */
    deleteUser(userId) {
        const user = this.users.find(u => u.id === userId); // AdminUserID is string (GUID)
        if (!user) return;

        const userNameEl = document.getElementById('deleteUserName');
        const userIdEl = document.getElementById('deleteUserId');
        
        if (userNameEl) userNameEl.textContent = user.username;
        if (userIdEl) userIdEl.value = userId;
        
        if (this.deleteModal) {
            this.deleteModal.show();
        }
    }

    /**
     * 確認刪除
     */
    async confirmDelete() {
        const userIdEl = document.getElementById('deleteUserId');
        if (!userIdEl || !userIdEl.value) return;
        
        const userId = userIdEl.value;
        const user = this.users.find(u => u.id === userId);
        const isHardDelete = user && !user.isActive;

        try {
            await adminUserService.deleteUser(userId);
            notification.success(isHardDelete ? '管理員已永久刪除' : '管理員已停用');
            this.closeDeleteConfirmModal();
            await this.loadUsers();
        } catch (error) {
            notification.error((isHardDelete ? '刪除失敗: ' : '停用失敗: ') + error.message);
        }
    }

    /**
     * 切換用戶狀態
     */
    async toggleUserStatus(userId, isActive) {
        try {
            await adminUserService.toggleUserStatus(userId, isActive);
            notification.success(`管理員${isActive ? '啟用' : '停用'}成功`);
            await this.loadUsers();
        } catch (error) {
            notification.error('操作失敗: ' + error.message);
        }
    }

    /**
     * 顯示重置密碼模態框
     */
    showResetPasswordModal(userId) {
        const user = this.users.find(u => u.id == userId);
        if (!user) return;

        const form = document.getElementById('resetPasswordForm');
        const userInfo = document.getElementById('resetPasswordUserInfo');
        
        form.dataset.userId = userId;
        const hiddenInput = document.getElementById('resetUserId');
        if (hiddenInput) hiddenInput.value = userId;

        userInfo.textContent = `重置管理員 "${user.username}" 的密碼`;
        form.reset();
        
        this.resetPasswordModal.show();
    }

    /**
     * 處理密碼重置
     */
    async handlePasswordReset(e) {
        e.preventDefault();
        
        const form = e.target;
        const userId = form.dataset.userId || document.getElementById('resetUserId')?.value;
        const newPassword = form.newPassword.value;
        const confirmPassword = form.confirmPassword.value;

        if (!userId) {
            notification.error('錯誤：無法識別用戶 ID');
            return;
        }

        if (newPassword !== confirmPassword) {
            notification.error('密碼確認不匹配');
            return;
        }

        if (newPassword.length < 8) {
            notification.error('密碼長度至少需要 8 個字元');
            return;
        }

        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;
        if (!passwordRegex.test(newPassword)) {
            notification.error('密碼必須包含大小寫字母和數字');
            return;
        }

        try {
            await adminUserService.resetPassword(userId, newPassword);
            notification.success('密碼重置成功');
            this.resetPasswordModal.hide();
        } catch (error) {
            notification.error('密碼重置失敗: ' + error.message);
        }
    }

    /**
     * 關閉模態框
     */
    closeUserModal() { if (this.userModal) this.userModal.hide(); }
    closeResetPasswordModal() { if (this.resetPasswordModal) this.resetPasswordModal.hide(); }
    closeDeleteConfirmModal() { if (this.deleteModal) this.deleteModal.hide(); }

    /**
     * 角色過濾
     */
    filterByRole() {
        const roleFilter = document.getElementById('roleFilter');
        this.roleFilter = roleFilter.value;
        this.currentPage = 1;
        this.loadUsers();
    }

    /**
     * 狀態過濾
     */
    filterByStatus() {
        const statusFilter = document.getElementById('statusFilter');
        this.statusFilter = statusFilter.value;
        this.currentPage = 1;
        this.loadUsers();
    }

    /**
     * 全選
     */
    handleSelectAll(e) {
        const isChecked = e.target.checked;
        const checkboxes = document.querySelectorAll('.user-checkbox');
        
        checkboxes.forEach(checkbox => {
            checkbox.checked = isChecked;
            const userId = checkbox.value; // string for GUID
            if (isChecked) {
                this.selectedUsers.add(userId);
            } else {
                this.selectedUsers.delete(userId);
            }
        });
    }

    /**
     * 顯示載入中
     */
    showLoading(show) {
        const tbody = document.querySelector('#usersTable tbody');
        if (!tbody) return;
        
        if (show) {
            // Keep current content but maybe dim it, or show loading overlay
            // For now just simpler:
        }
    }

    togglePasswordVisibility(inputId) {
        const input = document.getElementById(inputId);
        const icon = document.getElementById(`${inputId}-icon`);
        if (!input || !icon) return;
        
        if (input.type === 'password') {
            input.type = 'text';
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        } else {
            input.type = 'password';
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        }
    }

    formatDate(dateString) {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleString('zh-TW');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.adminUserManager = new AdminUserManager();
});
