/**
 * 用戶管理器
 * 處理用戶頁面的所有邏輯和交互
 */
class UserManager {
    constructor() {
        this.currentPage = 1;
        this.pageSize = 10;
        this.searchTerm = '';
        this.selectedUsers = new Set();
        this.sortField = 'created_at';
        this.sortOrder = 'desc';
        this.roleFilter = '';
        this.statusFilter = 'active'; // 預設顯示啟用用戶
        this.users = [];
        this.roles = [];
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
            this.setupKeyboardShortcuts();
        } catch (error) {
            console.error('初始化失敗:', error);
            // 顯示具體的錯誤訊息，如果有的話
            notification.error(error.message || '頁面初始化失敗，請重新載入頁面');
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
        
        // 設置表單驗證
        this.setupFormValidation();
    }

    /**
     * 載入初始數據
     */
    async loadInitialData() {
        const loadingId = notification.loading('載入數據中...');
        
        try {
            // 並行載入數據
            const [statsResult, rolesResult, workflowsResult] = await Promise.all([
                userService.getUserStats(),
                userService.getRoles(),
                userService.getWorkflows()
            ]);
            
            this.stats = statsResult.data || statsResult;
            this.roles = rolesResult.data || rolesResult;
            this.workflows = workflowsResult.data || workflowsResult;
            
            // 更新統計顯示
            this.updateStatsDisplay();

            // 更新角色選項 (包括過濾器)
            this.loadRoleOptions();

            // 更新工作流程選項
            this.loadWorkflowOptions();
            
            // 載入用戶列表
            await this.loadUsers();
            
            notification.remove(loadingId);
            notification.success('數據載入完成');
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

        // Toolbar Buttons
        const exportUsersBtn = document.getElementById('exportUsersBtn');
        if (exportUsersBtn) {
            exportUsersBtn.addEventListener('click', () => this.exportUsers());
        }

        const refreshUsersBtn = document.getElementById('refreshUsersBtn');
        if (refreshUsersBtn) {
            refreshUsersBtn.addEventListener('click', () => this.refreshData());
        }

        // 批量操作按鈕
        const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
        if (bulkDeleteBtn) {
            bulkDeleteBtn.addEventListener('click', () => this.handleBulkDelete());
        }

        const bulkExportBtn = document.getElementById('bulkExportBtn');
        if (bulkExportBtn) {
            bulkExportBtn.addEventListener('click', () => this.handleExport());
        }

        // 頁面大小選擇
        const pageSizeSelect = document.getElementById('pageSizeSelect');
        if (pageSizeSelect) {
            pageSizeSelect.addEventListener('change', (e) => {
                this.pageSize = parseInt(e.target.value);
                this.currentPage = 1;
                this.loadUsers();
            });
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
     * 設置鍵盤快捷鍵
     */
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl+N: 新增用戶
            if (e.ctrlKey && e.key === 'n') {
                e.preventDefault();
                this.showUserModal();
            }
            
            // Ctrl+F: 聚焦搜尋框
            if (e.ctrlKey && e.key === 'f') {
                e.preventDefault();
                const searchInput = document.getElementById('searchInput');
                if (searchInput) searchInput.focus();
            }
            
            // Delete: 刪除選中的用戶
            if (e.key === 'Delete' && this.selectedUsers.size > 0) {
                e.preventDefault();
                this.handleBulkDelete();
            }
        });
    }

    /**
     * 載入用戶列表
     */
    async loadUsers() {
        try {
            this.showLoading(true);
            
            const response = await userService.getUsers(
                this.currentPage,
                this.pageSize,
                this.searchTerm,
                this.roleFilter,
                this.statusFilter
            );
            
            this.users = response.data?.users || [];
            this.updateUsersTable();
            this.updatePagination(response.data?.pagination);
            
        } catch (error) {
            console.error('載入用戶列表失敗:', error);
            notification.error('載入用戶列表失敗: ' + error.message);
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * 更新統計顯示
     */
    updateStatsDisplay() {
        const elements = {
            totalUsers: document.getElementById('totalUsers'),
            activeUsers: document.getElementById('activeUsers'),
            adminUsers: document.getElementById('adminUsers'),
            managerUsers: document.getElementById('managerUsers')
        };

        if (elements.totalUsers) elements.totalUsers.textContent = this.stats.totalUsers || 0;
        if (elements.activeUsers) elements.activeUsers.textContent = this.stats.activeUsers || 0;
        if (elements.adminUsers) elements.adminUsers.textContent = this.stats.usersByRole?.admin || 0;
        if (elements.managerUsers) elements.managerUsers.textContent = this.stats.usersByRole?.manager || 0;
    }

    /**
     * 獲取角色顯示名稱
     */
    getRoleDisplayName(role) {
        if (!role) return '未知';
        
        const roleMap = {
            'admin': '管理員',
            'manager': '經理',
            'user': '一般使用者',
            'viewer': '檢視者',
            'approver': '審核員'
        };
        
        return roleMap[role.toLowerCase()] || role;
    }

    /**
     * 獲取角色標籤樣式
     */
    getRoleBadgeClass(role) {
        if (!role) return 'badge-secondary';
        
        const styleMap = {
            'admin': 'badge-primary',   // 藍色
            'manager': 'badge-info',    // 青色/深藍
            'user': 'badge-secondary',  // 灰色
            'viewer': 'badge-light',    // 淺灰
            'approver': 'badge-warning' // 黃色/橘色
        };
        
        return styleMap[role.toLowerCase()] || 'badge-secondary';
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
                    <td colspan="6" class="text-center py-4">
                        <div class="empty-state">
                            <i class="fas fa-users fa-3x text-muted mb-3"></i>
                            <p class="text-muted">沒有找到用戶</p>
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
                    <div class="user-fullname">${this.escapeHtml(user.fullName || '')}</div>
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
                    <div class="user-workflow">${this.escapeHtml(user.assignedWorkflowName || '-')}</div>
                </td>
                <td>
                    <span class="status-badge ${user.isActive ? 'active' : 'inactive'}">
                        ${user.isActive ? '啟用' : '禁用'}
                    </span>
                </td>
                <td>${this.formatDate(user.createdAt)}</td>
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
                                title="${user.isActive ? '禁用' : '啟用'}">
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

        // 重新綁定複選框事件
        this.bindCheckboxEvents();
    }

    /**
     * 綁定複選框事件
     */
    bindCheckboxEvents() {
        const checkboxes = document.querySelectorAll('.user-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const userId = parseInt(e.target.value);
                if (e.target.checked) {
                    this.selectedUsers.add(userId);
                } else {
                    this.selectedUsers.delete(userId);
                }
                this.updateBulkActionButtons();
                this.updateSelectAllCheckbox();
            });
        });
    }

    /**
     * 更新分頁
     */
    updatePagination(pagination) {
        const paginationContainer = document.getElementById('paginationContainer');
        if (!paginationContainer || !pagination) return;

        // 兼容不同的屬性名稱 (後端返回 page/pages/total，前端可能預期 currentPage/totalPages/totalItems)
        const currentPage = pagination.currentPage || pagination.page || 1;
        const totalPages = pagination.totalPages || pagination.pages || 1;
        const totalItems = pagination.totalItems || pagination.total || 0;
        
        // 生成分頁按鈕
        let paginationHTML = '';
        
        // 上一頁
        paginationHTML += `
            <button class="btn btn-outline-primary btn-sm pagination-btn" 
                    ${currentPage <= 1 ? 'disabled' : ''} 
                    data-page="${currentPage - 1}">
                <i class="fas fa-chevron-left"></i>
            </button>
        `;

        // 頁碼按鈕
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

        // 添加信息顯示 (如果需要的話，可以加在容器內或外)
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
            // 編輯模式
            modalTitle.textContent = '編輯用戶';
            // 確保密碼欄位隱藏
            const passwordGroup = document.getElementById('passwordGroup');
            if (passwordGroup) passwordGroup.style.display = 'none';
            
            this.loadUserForEdit(userId);
        } else {
            // 新增模式
            modalTitle.textContent = '新增用戶';
            form.reset();
            form.dataset.userId = '';
            
            // 顯示密碼欄位
            const passwordGroup = document.getElementById('passwordGroup');
            if (passwordGroup) passwordGroup.style.display = 'block';
        }
        
        // 載入角色選項
        this.loadRoleOptions();
        // 載入工作流程選項
        this.loadWorkflowOptions();
        
        this.userModal.show();
    }

    /**
     * 載入用戶進行編輯
     */
    async loadUserForEdit(userId) {
        try {
            const response = await userService.getUser(userId);
            const user = response.data.user;
            const form = document.getElementById('userForm');
            
            form.dataset.userId = userId;
            form.username.value = user.username;
            form.email.value = user.email || '';
            form.fullName.value = user.fullName || '';
            form.role.value = user.role;
            form.is_active.checked = user.isActive;
            if (form.assignedWorkflow) {
                form.assignedWorkflow.value = user.assignedWorkflowId || '';
            }
            
            // 隱藏密碼欄位（編輯時不需要）
            const passwordGroup = form.querySelector('.password-group');
            if (passwordGroup) {
                passwordGroup.style.display = 'none';
            }
            
        } catch (error) {
            notification.error('載入用戶信息失敗: ' + error.message);
        }
    }

    /**
     * 載入角色選項
     */
    loadRoleOptions() {
        // 1. 填充用戶編輯模態框的角色下拉選單
        const roleSelect = document.getElementById('role'); 
        
        // 2. 填充主頁面的角色過濾器
        const roleFilter = document.getElementById('roleFilter');

        // 如果沒有載入到角色數據，不執行操作
        if (!this.roles || this.roles.length === 0) {
            return;
        }

        const optionsHTML = this.roles.map(role => {
            let roleValue, roleLabel;
            
            if (typeof role === 'string') {
                roleValue = role;
                roleLabel = this.getRoleDisplayName(role);
            } else {
                roleValue = role.value || role.name || role.id;
                roleLabel = role.label || role.display_name || this.getRoleDisplayName(roleValue);
            }
            
            return `<option value="${roleValue}">${roleLabel}</option>`;
        }).join('');

        if (roleSelect) {
            roleSelect.innerHTML = '<option value="">請選擇角色</option>' + optionsHTML;
        }

        if (roleFilter) {
            // 保存當前選中的值
            const currentValue = roleFilter.value;
            roleFilter.innerHTML = '<option value="">所有角色</option>' + optionsHTML;
            roleFilter.value = currentValue;
        }
    }

    /**
     * 載入工作流程選項
     */
    loadWorkflowOptions() {
        const workflowSelect = document.getElementById('assignedWorkflow');
        if (!workflowSelect) return;

        if (!this.workflows || this.workflows.length === 0) {
            workflowSelect.innerHTML = '<option value="">無可用工作流程</option>';
            return;
        }

        const activeWorkflows = this.workflows.filter(wf => wf.is_active);
        
        const optionsHTML = activeWorkflows.map(wf => `
            <option value="${wf.id}">${wf.name}${wf.is_default ? ' (預設)' : ''}</option>
        `).join('');

        workflowSelect.innerHTML = '<option value="">使用預設流程</option>' + optionsHTML;
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
            fullName: formData.get('fullName'),
            role: formData.get('role'),
            assignedWorkflowId: formData.get('assignedWorkflow') || null,
            isActive: formData.has('is_active')
        };

        // 新增用戶時需要密碼
        if (!userId) {
            userData.password = formData.get('password');
        }

        try {
            if (userId) {
                await userService.updateUser(userId, userData);
                notification.success('用戶更新成功');
            } else {
                await userService.createUser(userData);
                notification.success('用戶創建成功');
            }
            
            this.userModal.hide();
            await this.loadUsers();
            await this.loadInitialData(); // 重新載入統計
            
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
        const user = this.users.find(u => u.id === parseInt(userId));
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
        const user = this.users.find(u => u.id === parseInt(userId));
        const isHardDelete = user && !user.isActive;

        try {
            await userService.deleteUser(userId);
            notification.success(isHardDelete ? '用戶已永久刪除' : '用戶已停用');
            this.closeDeleteConfirmModal();
            await this.loadUsers();
            await this.loadInitialData();
        } catch (error) {
            notification.error((isHardDelete ? '刪除失敗: ' : '停用失敗: ') + error.message);
        }
    }

    /**
     * 切換用戶狀態
     */
    async toggleUserStatus(userId, isActive) {
        try {
            await userService.toggleUserStatus(userId, isActive);
            notification.success(`用戶${isActive ? '啟用' : '禁用'}成功`);
            await this.loadUsers();
            await this.loadInitialData();
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
        // Also set the hidden input value for redundancy
        const hiddenInput = document.getElementById('resetUserId');
        if (hiddenInput) hiddenInput.value = userId;

        userInfo.textContent = `重置用戶 "${user.username}" 的密碼`;
        form.reset();
        
        this.resetPasswordModal.show();
    }

    /**
     * 處理密碼重置
     */
    async handlePasswordReset(e) {
        e.preventDefault();
        
        const form = e.target;
        // Try to get userId from dataset or hidden input
        const userId = form.dataset.userId || document.getElementById('resetUserId')?.value;
        const newPassword = form.newPassword.value;
        const confirmPassword = form.confirmPassword.value;

        if (!userId) {
            notification.error('錯誤：無法識別用戶 ID');
            console.error('Reset Password Error: userId is missing');
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
            await userService.resetPassword(userId, newPassword);
            notification.success('密碼重置成功');
            this.resetPasswordModal.hide();
        } catch (error) {
            console.error('Reset Password Error:', error);
            notification.error('密碼重置失敗: ' + error.message);
        }
    }

    /**
     * 關閉重置密碼模態框
     */
    closeResetPasswordModal() {
        this.resetPasswordModal.hide();
    }

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
     * 處理全選
     */
    handleSelectAll(e) {
        const isChecked = e.target.checked;
        const checkboxes = document.querySelectorAll('.user-checkbox');
        
        checkboxes.forEach(checkbox => {
            checkbox.checked = isChecked;
            const userId = parseInt(checkbox.value);
            if (isChecked) {
                this.selectedUsers.add(userId);
            } else {
                this.selectedUsers.delete(userId);
            }
        });
        
        this.updateBulkActionButtons();
    }

    /**
     * 更新全選複選框狀態
     */
    updateSelectAllCheckbox() {
        const selectAllCheckbox = document.getElementById('selectAll');
        if (!selectAllCheckbox) return;

        const checkboxes = document.querySelectorAll('.user-checkbox');
        const checkedCount = this.selectedUsers.size;
        
        if (checkedCount === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        } else if (checkedCount === checkboxes.length) {
            selectAllCheckbox.checked = true;
            selectAllCheckbox.indeterminate = false;
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = true;
        }
    }

    /**
     * 更新批量操作按鈕
     */
    updateBulkActionButtons() {
        const bulkActions = document.getElementById('bulkActions');
        const selectedCount = document.getElementById('selectedCount');
        
        if (bulkActions) {
            bulkActions.style.display = this.selectedUsers.size > 0 ? 'block' : 'none';
        }
        
        if (selectedCount) {
            selectedCount.textContent = this.selectedUsers.size;
        }
    }

    /**
     * 處理批量刪除
     */
    handleBulkDelete() {
        if (this.selectedUsers.size === 0) return;

        notification.confirm(
            `確定要刪除選中的 ${this.selectedUsers.size} 個用戶嗎？此操作無法撤銷。`,
            async () => {
                try {
                    await userService.bulkOperation('delete', Array.from(this.selectedUsers));
                    notification.success('批量刪除成功');
                    this.selectedUsers.clear();
                    await this.loadUsers();
                    await this.loadInitialData();
                    this.updateBulkActionButtons();
                } catch (error) {
                    notification.error('批量刪除失敗: ' + error.message);
                }
            }
        );
    }

    /**
     * 切換密碼可見性
     */
    togglePasswordVisibility(inputId) {
        const input = document.getElementById(inputId);
        const icon = document.getElementById(`${inputId}-icon`);
        
        if (!input || !icon) return;
        
        if (input.type === 'password') {
            input.type = 'text';
            // Show password (Visible) -> Slashed Eye (Click to hide)
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        } else {
            input.type = 'password';
            // Hide password (Hidden) -> Eye (Click to show)
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    }

    /**
     * 處理導出
     */
    async handleExport() {
        try {
            const blob = await userService.exportUsers('csv', {
                search: this.searchTerm
            });
            
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `users_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            notification.success('用戶數據導出成功');
        } catch (error) {
            notification.error('導出失敗: ' + error.message);
        }
    }

    /**
     * 設置表單驗證
     */
    setupFormValidation() {
        const form = document.getElementById('userForm');
        if (!form) return;

        // 用戶名驗證
        const usernameInput = form.username;
        if (usernameInput) {
            usernameInput.addEventListener('blur', () => {
                this.validateUsername(usernameInput.value);
            });
        }

        // 郵箱驗證
        const emailInput = form.email;
        if (emailInput) {
            emailInput.addEventListener('blur', () => {
                this.validateEmail(emailInput.value);
            });
        }

        // 密碼驗證
        const passwordInput = form.password;
        const confirmPasswordInput = form.confirmPassword;
        
        if (passwordInput && confirmPasswordInput) {
            confirmPasswordInput.addEventListener('blur', () => {
                this.validatePasswordMatch(passwordInput.value, confirmPasswordInput.value);
            });
        }
    }

    /**
     * 驗證用戶名
     */
    validateUsername(username) {
        const isValid = username.length >= 3 && /^[a-zA-Z0-9_]+$/.test(username);
        this.showFieldValidation('username', isValid, '用戶名至少3個字符，只能包含字母、數字和下劃線');
        return isValid;
    }

    /**
     * 驗證郵箱
     */
    validateEmail(email) {
        const isValid = !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        this.showFieldValidation('email', isValid, '請輸入有效的郵箱地址');
        return isValid;
    }

    /**
     * 驗證密碼匹配
     */
    validatePasswordMatch(password, confirmPassword) {
        const isValid = password === confirmPassword;
        this.showFieldValidation('confirmPassword', isValid, '密碼確認不匹配');
        return isValid;
    }

    /**
     * 顯示欄位驗證結果
     */
    showFieldValidation(fieldName, isValid, message) {
        const field = document.querySelector(`[name="${fieldName}"]`);
        if (!field) return;

        const feedback = field.parentNode.querySelector('.invalid-feedback') || 
                        document.createElement('div');
        
        if (!isValid) {
            field.classList.add('is-invalid');
            field.classList.remove('is-valid');
            feedback.className = 'invalid-feedback';
            feedback.textContent = message;
            if (!feedback.parentNode) {
                field.parentNode.appendChild(feedback);
            }
        } else {
            field.classList.remove('is-invalid');
            field.classList.add('is-valid');
            if (feedback.parentNode) {
                feedback.parentNode.removeChild(feedback);
            }
        }
    }

    /**
     * 匯出用戶數據
     */
    async exportUsers() {
        try {
            const loadingId = notification.loading('正在匯出用戶數據...');
            
            const blob = await userService.exportUsers('csv', {
                search: this.searchTerm,
                role: this.currentRole
            });
            
            // 創建下載連結
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `users_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            notification.remove(loadingId);
            notification.success('用戶數據匯出成功');
        } catch (error) {
            console.error('匯出用戶數據失敗:', error);
            notification.error('匯出用戶數據失敗');
        }
    }

    /**
     * 重新整理數據
     */
    async refreshData() {
        try {
            const loadingId = notification.loading('正在重新整理數據...');
            
            // 重新載入統計數據
            const statsResult = await userService.getUserStats();
            this.stats = statsResult.data || statsResult;
            this.updateStatsDisplay();
            
            // 重新載入用戶列表
            await this.loadUsers();
            
            notification.remove(loadingId);
            notification.success('數據重新整理完成');
        } catch (error) {
            console.error('重新整理數據失敗:', error);
            notification.error('重新整理數據失敗');
        }
    }

    /**
     * 顯示/隱藏載入狀態
     */
    showLoading(show) {
        const loadingElement = document.getElementById('tableLoading');
        const tableElement = document.getElementById('usersTable');
        
        if (loadingElement) {
            loadingElement.style.display = show ? 'block' : 'none';
        }
        
        if (tableElement) {
            tableElement.style.opacity = show ? '0.5' : '1';
        }
    }

    /**
     * 格式化日期
     */
    formatDate(dateString) {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleString('zh-TW');
    }

    /**
     * HTML 轉義
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }



    /**
     * 關閉用戶模態框
     */
    closeUserModal() {
        if (this.userModal) {
            this.userModal.hide();
        }
    }

    /**
     * 關閉重置密碼模態框
     */
    closeResetPasswordModal() {
        if (this.resetPasswordModal) {
            this.resetPasswordModal.hide();
        }
    }

    /**
     * 關閉刪除確認模態框
     */
    closeDeleteConfirmModal() {
        if (this.deleteModal) {
            this.deleteModal.hide();
        }
    }
}

// 頁面載入完成後初始化
document.addEventListener('DOMContentLoaded', () => {
    window.userManager = new UserManager();
});