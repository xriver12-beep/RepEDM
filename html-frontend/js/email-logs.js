class EmailLogsManager {
    constructor() {
        this.currentPage = 1;
        this.currentFilters = {};
        this.adminAuthService = window.adminAuth || new AdminAuthService();
        
        // 動態決定後端 API URL
        const hostname = window.location.hostname;
        const protocol = window.location.protocol;
        const port = window.location.port;
        
        if (port === '3443' || (protocol === 'https:' && !port)) {
             this.apiBaseURL = '/api';
        } else {
             const apiHost = hostname === '127.0.0.1' ? 'localhost' : hostname;
             this.apiBaseURL = `http://${apiHost}:3001/api`;
        }
    }

    async initialize() {
        if (!this.adminAuthService.isAuthenticated()) {
            window.location.href = 'login.html';
            return;
        }

        await this.loadUserInfo();
        this.setupEventListeners();
        
        // Set default date range (Last 7 days)
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);

        const formatDate = (date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        const startDateStr = formatDate(startDate);
        const endDateStr = formatDate(endDate);

        const startDateInput = document.getElementById('startDateFilter');
        const endDateInput = document.getElementById('endDateFilter');

        if (startDateInput) startDateInput.value = startDateStr;
        if (endDateInput) endDateInput.value = endDateStr;

        this.currentFilters.startDate = startDateStr;
        this.currentFilters.endDate = endDateStr;
        
        // Initial load
        this.loadStats();
        this.loadLogs();
    }

    setupEventListeners() {
        // Search filter
        const searchFilter = document.getElementById('searchFilter');
        if (searchFilter) {
            searchFilter.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.applyFilters();
                }
            });
        }

        // Limit filter
        const limitFilter = document.getElementById('limitFilter');
        if (limitFilter) {
            limitFilter.addEventListener('change', () => {
                this.loadLogs(1);
            });
        }

        // Filter buttons
        const applyFiltersBtn = document.getElementById('applyFiltersBtn');
        if (applyFiltersBtn) {
            applyFiltersBtn.addEventListener('click', () => this.applyFilters());
        }

        const clearFiltersBtn = document.getElementById('clearFiltersBtn');
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', () => this.clearFilters());
        }

        const refreshLogsBtn = document.getElementById('refreshLogsBtn');
        if (refreshLogsBtn) {
            refreshLogsBtn.addEventListener('click', () => this.refreshLogs());
        }

        // Event Delegation for Table (Show Detail)
        const logsTableBody = document.getElementById('logsTableBody');
        if (logsTableBody) {
            logsTableBody.addEventListener('click', (e) => {
                const btn = e.target.closest('.view-log-btn');
                if (btn) {
                    const logId = btn.dataset.id;
                    this.showLogDetail(logId);
                }
            });
        }

        // Event Delegation for Pagination
        const pagination = document.getElementById('pagination');
        if (pagination) {
            pagination.addEventListener('click', (e) => {
                e.preventDefault();
                const link = e.target.closest('.page-link');
                if (link && !link.parentElement.classList.contains('disabled')) {
                    const page = parseInt(link.dataset.page);
                    if (!isNaN(page)) {
                        this.loadLogs(page);
                    }
                }
            });
        }
    }

    async loadUserInfo() {
        try {
            const user = await this.adminAuthService.getCurrentUser();
            
            if (user) {
                const userName = user.displayName || user.username || user.email;
                const userRole = this.getRoleText(user.role);
                
                const userNameEls = document.querySelectorAll('.user-name');
                userNameEls.forEach(el => el.textContent = userName);
                
                const userRoleEls = document.querySelectorAll('.user-role');
                userRoleEls.forEach(el => el.textContent = userRole);

                const userNameLarge = document.querySelector('.user-name-large');
                if (userNameLarge) userNameLarge.textContent = userName;
                
                const userEmail = document.querySelector('.user-email');
                if (userEmail) userEmail.textContent = user.email;

                const avatarLetter = userName.charAt(0).toUpperCase();
                const userAvatars = document.querySelectorAll('.user-avatar, .user-avatar-large');
                userAvatars.forEach(el => el.textContent = avatarLetter);

                const settingsItem = document.querySelector('[data-role-required="Admin"]');
                if (settingsItem) {
                    if (user.role !== 'Admin') {
                        settingsItem.style.display = 'none';
                    }
                }
            }
        } catch (error) {
            console.error('載入用戶資訊時發生錯誤:', error);
            if (!this.adminAuthService.isAuthenticated()) {
                window.location.href = 'login.html';
            }
        }
    }

    getRoleText(role) {
        const roleMap = {
            'Admin': '管理員',
            'Editor': '編輯者',
            'Viewer': '檢視者'
        };
        return roleMap[role] || role;
    }

    async loadStats() {
        try {
            const token = this.adminAuthService.getToken();
            const params = new URLSearchParams(this.currentFilters);
            const response = await fetch(`${this.apiBaseURL}/settings/email-logs/stats?${params}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const result = await response.json();
                const stats = result.data.total;
                
                document.getElementById('totalEmails').textContent = stats.total || 0;
                document.getElementById('sentEmails').textContent = stats.success || 0;
                document.getElementById('failedEmails').textContent = stats.failed || 0;
                
                const avgTime = stats.avgProcessingTime;
                document.getElementById('avgProcessingTime').textContent = 
                    avgTime ? `${Math.round(avgTime)}ms` : '-';
            }
        } catch (error) {
            console.error('載入統計失敗:', error);
        }
    }

    async loadLogs(page = 1) {
        try {
            const token = this.adminAuthService.getToken();
            const params = new URLSearchParams({
                page: page,
                limit: document.getElementById('limitFilter').value,
                ...this.currentFilters
            });

            const response = await fetch(`${this.apiBaseURL}/settings/email-logs?${params}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const result = await response.json();
                this.displayLogs(result.data.logs);
                this.displayPagination(result.data.pagination);
                this.currentPage = page;
            } else {
                throw new Error('載入日誌失敗');
            }
        } catch (error) {
            console.error('載入日誌失敗:', error);
            document.getElementById('logsTableBody').innerHTML = `
                <tr>
                    <td colspan="7" class="text-center py-4 text-danger">
                        <i class="fas fa-exclamation-triangle me-2"></i>載入日誌失敗
                    </td>
                </tr>
            `;
        }
    }

    displayLogs(logs) {
        const tbody = document.getElementById('logsTableBody');
        
        if (logs.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center py-4 text-muted">
                        <i class="fas fa-inbox me-2"></i>暫無日誌記錄
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = logs.map(log => `
            <tr>
                <td>${this.formatDateTime(log.created_at)}</td>
                <td>
                    <span class="badge bg-secondary">${this.getEmailTypeText(log.email_type)}</span>
                </td>
                <td>${log.recipient_email}</td>
                <td class="text-truncate" style="max-width: 200px;" title="${log.subject || '-'}">${log.subject || '-'}</td>
                <td>
                    <span class="badge status-badge ${log.status === 'sent' ? 'status-sent' : 'status-failed'}">
                        <i class="fas ${log.status === 'sent' ? 'fa-check' : 'fa-times'} me-1"></i>
                        ${log.status === 'sent' ? '已發送' : '發送失敗'}
                    </span>
                </td>
                <td>${log.processing_time_ms}ms</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary view-log-btn" data-id="${log.id}">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    displayPagination(pagination) {
        const paginationEl = document.getElementById('pagination');
        const paginationInfoEl = document.getElementById('paginationInfo');
        const { page, totalPages, total, limit } = pagination;
        
        if (paginationInfoEl) {
            const start = (page - 1) * limit + 1;
            const end = Math.min(page * limit, total);
            paginationInfoEl.textContent = `顯示第 ${start} 到 ${end} 筆，共 ${total} 筆資料`;
        }

        if (totalPages <= 1) {
            paginationEl.innerHTML = '';
            return;
        }

        let paginationHTML = '';
        
        paginationHTML += `
            <li class="page-item ${page === 1 ? 'disabled' : ''}">
                <a class="page-link" href="#" data-page="1" title="首頁">
                    <i class="fas fa-angle-double-left"></i>
                </a>
            </li>
        `;

        paginationHTML += `
            <li class="page-item ${page === 1 ? 'disabled' : ''}">
                <a class="page-link" href="#" data-page="${page - 1}" title="上一頁">
                    <i class="fas fa-angle-left"></i>
                </a>
            </li>
        `;
        
        let startPage = Math.max(1, page - 2);
        let endPage = Math.min(totalPages, page + 2);

        if (startPage <= 2) {
            endPage = Math.min(totalPages, 5);
        }
        if (endPage >= totalPages - 1) {
            startPage = Math.max(1, totalPages - 4);
        }
        
        for (let i = startPage; i <= endPage; i++) {
            paginationHTML += `
                <li class="page-item ${i === page ? 'active' : ''}">
                    <a class="page-link" href="#" data-page="${i}">${i}</a>
                </li>
            `;
        }
        
        paginationHTML += `
            <li class="page-item ${page === totalPages ? 'disabled' : ''}">
                <a class="page-link" href="#" data-page="${page + 1}" title="下一頁">
                    <i class="fas fa-angle-right"></i>
                </a>
            </li>
        `;

        paginationHTML += `
            <li class="page-item ${page === totalPages ? 'disabled' : ''}">
                <a class="page-link" href="#" data-page="${totalPages}" title="末頁">
                    <i class="fas fa-angle-double-right"></i>
                </a>
            </li>
        `;
        
        paginationEl.innerHTML = paginationHTML;
    }

    applyFilters() {
        this.currentFilters = {};
        
        const status = document.getElementById('statusFilter').value;
        const emailType = document.getElementById('emailTypeFilter').value;
        const startDate = document.getElementById('startDateFilter').value;
        const endDate = document.getElementById('endDateFilter').value;
        const search = document.getElementById('searchFilter').value.trim();
        
        if (status) this.currentFilters.status = status;
        if (emailType) this.currentFilters.emailType = emailType;
        if (startDate) this.currentFilters.startDate = startDate;
        if (endDate) this.currentFilters.endDate = endDate;
        if (search) this.currentFilters.search = search;
        
        this.loadLogs(1);
        this.loadStats();
    }

    clearFilters() {
        document.getElementById('statusFilter').value = '';
        document.getElementById('emailTypeFilter').value = '';
        document.getElementById('startDateFilter').value = '';
        document.getElementById('endDateFilter').value = '';
        document.getElementById('searchFilter').value = '';
        
        this.currentFilters = {};
        this.loadLogs(1);
        this.loadStats();
    }

    refreshLogs() {
        this.loadLogs(this.currentPage);
        this.loadStats();
    }

    async showLogDetail(logId) {
        try {
            const token = this.adminAuthService.getToken();
            const response = await fetch(`${this.apiBaseURL}/settings/email-logs/${logId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const result = await response.json();
                const log = result.data;
                
                document.getElementById('logDetailContent').innerHTML = `
                    <div class="row">
                        <div class="col-md-6">
                            <h6>基本資訊</h6>
                            <table class="table table-sm">
                                <tr><td><strong>ID:</strong></td><td>${log.id}</td></tr>
                                <tr><td><strong>類型:</strong></td><td>${this.getEmailTypeText(log.email_type)}</td></tr>
                                <tr><td><strong>狀態:</strong></td><td>
                                    <span class="badge ${log.status === 'sent' ? 'bg-success' : 'bg-danger'}">
                                        ${log.status === 'sent' ? '已發送' : '發送失敗'}
                                    </span>
                                </td></tr>
                                <tr><td><strong>建立時間:</strong></td><td>${this.formatDateTime(log.created_at)}</td></tr>
                                <tr><td><strong>處理時間:</strong></td><td>${log.processing_time_ms}ms</td></tr>
                            </table>
                        </div>
                        <div class="col-md-6">
                            <h6>郵件資訊</h6>
                            <table class="table table-sm">
                                <tr><td><strong>收件人:</strong></td><td>${log.recipient_email}</td></tr>
                                <tr><td><strong>發件人:</strong></td><td>${log.sender_email}</td></tr>
                                <tr><td><strong>發件人名稱:</strong></td><td>${log.sender_name || '-'}</td></tr>
                                <tr><td><strong>主題:</strong></td><td>${log.subject || '-'}</td></tr>
                                <tr><td><strong>訊息ID:</strong></td><td>${log.message_id || '-'}</td></tr>
                            </table>
                        </div>
                    </div>
                    <div class="row mt-3">
                        <div class="col-md-6">
                            <h6>SMTP 資訊</h6>
                            <table class="table table-sm">
                                <tr><td><strong>SMTP 主機:</strong></td><td>${log.smtp_host}</td></tr>
                                <tr><td><strong>SMTP 埠號:</strong></td><td>${log.smtp_port}</td></tr>
                            </table>
                        </div>
                        <div class="col-md-6">
                            ${log.status === 'failed' ? `
                                <h6>錯誤資訊</h6>
                                <table class="table table-sm">
                                    <tr><td><strong>錯誤代碼:</strong></td><td>${log.error_code || '-'}</td></tr>
                                    <tr><td><strong>錯誤訊息:</strong></td><td class="text-danger">${log.error_message || '-'}</td></tr>
                                </table>
                            ` : ''}
                        </div>
                    </div>
                    ${log.smtp_response ? `
                        <div class="row mt-3">
                            <div class="col-12">
                                <h6>SMTP 回應</h6>
                                <pre class="bg-light p-2 rounded">${log.smtp_response}</pre>
                            </div>
                        </div>
                    ` : ''}
                `;
                
                new bootstrap.Modal(document.getElementById('logDetailModal')).show();
            } else {
                throw new Error('載入日誌詳情失敗');
            }
        } catch (error) {
            console.error('載入日誌詳情失敗:', error);
            alert('載入日誌詳情失敗');
        }
    }

    formatDateTime(dateString) {
        const date = new Date(dateString);
        return date.toLocaleString('zh-TW');
    }

    getEmailTypeText(type) {
        const types = {
            'test_email': '測試郵件',
            'campaign': '行銷活動',
            'notification': '通知郵件',
            'approval_notification': '審核通知',
            'approval_rejection': '審核拒絕',
            'approval_completion': '審核通過',
            'smtp_test': 'SMTP 測試'
        };
        return types[type] || type;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.emailLogsManager = new EmailLogsManager();
    window.emailLogsManager.initialize();
});
