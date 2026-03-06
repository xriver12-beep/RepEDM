document.addEventListener('DOMContentLoaded', async () => {
    // Initialize UI components
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userDropdown = document.getElementById('userDropdown');
    const logoutBtn = document.getElementById('logoutBtn');
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('mainContent');
    const sidebarToggle = document.getElementById('sidebarToggle');

    // Toggle User Menu
    if (userMenuBtn && userDropdown) {
        userMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            userDropdown.classList.toggle('active');
        });

        document.addEventListener('click', (e) => {
            if (!userMenuBtn.contains(e.target) && !userDropdown.contains(e.target)) {
                userDropdown.classList.remove('active');
            }
        });
    }

    // Logout
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            AuthGuard.logout();
        });
    }

    // Sidebar Toggle
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            mainContent.classList.toggle('expanded');
        });
    }

    // Mobile Menu
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            sidebar.classList.toggle('active');
        });
    }

    // Load User Info
    loadUserInfo();

    // Initialize Manager
    const manager = new InvalidEmailsManager();
    manager.init();
});

async function loadUserInfo() {
    try {
        const user = userAuth.getUser();
        if (user) {
            document.querySelectorAll('.user-name').forEach(el => el.textContent = user.name || user.username);
            document.querySelectorAll('.user-name-large').forEach(el => el.textContent = user.name || user.username);
            document.querySelectorAll('.user-email').forEach(el => el.textContent = user.email || '');
            
            // Check role for admin link
            if (user.role === 'admin' || user.role === 'super_admin') {
                const sidebarMenu = document.querySelector('.sidebar-menu');
                if (sidebarMenu && !document.querySelector('a[href="admin-dashboard.html"]')) {
                    // Optional: Add admin link
                }
            }
        }
    } catch (error) {
        console.error('Error loading user info:', error);
    }
}

class InvalidEmailsManager {
    constructor() {
        this.currentPage = 1;
        this.pageSize = 50;
        this.totalItems = 0;
        this.loading = false;
        this.currentStatus = 'invalid';
    }

    async init() {
        this.cacheDOM();
        this.initDataTable();
        this.bindEvents();
        // Expose switchStatus to window for HTML onclick handlers
        window.switchStatus = (status) => this.switchStatus(status);
        
        // Initial load
        await Promise.all([
            this.loadData(),
            this.loadStatistics()
        ]);
    }

    cacheDOM() {
        this.listContainer = document.getElementById('invalidEmailsList');
        // this.tableBody = document.getElementById('invalidTableBody'); // Removed
        // this.pagination = document.getElementById('pagination'); // Removed
        this.invalidCount = document.getElementById('invalidCount');
        this.unsubscribedCount = document.getElementById('unsubscribedCount');
        this.searchInput = document.getElementById('searchInput');
        this.clearSearchBtn = document.getElementById('clearSearchBtn');
        this.exportBtn = document.getElementById('exportInvalidBtn');
        this.checkBounceBtn = document.getElementById('checkBounceBtn');

        // Import Modal Elements
        this.importBtn = document.getElementById('importInvalidBtn');
        this.importUnsubscribeBtn = document.getElementById('importUnsubscribeBtn');
        this.importModal = document.getElementById('importModal');
        this.importModalTitle = this.importModal ? this.importModal.querySelector('h3') : null;
        
        if (!this.importBtn) console.error('Import button not found');
        if (!this.importModal) console.error('Import modal not found');

        this.importEmailText = document.getElementById('importEmailText');
        this.importEmailFile = document.getElementById('importEmailFile');
        this.confirmImportBtn = document.getElementById('confirmImportBtn');
        this.importResult = document.getElementById('importResult');
        this.importCampaignId = document.getElementById('importCampaignId');
        this.importCampaignGroup = this.importCampaignId ? this.importCampaignId.closest('.form-group') : null;

        // Unsubscribe Manager Modal Elements
        this.unsubscribeManagerBtn = document.getElementById('unsubscribeManagerBtn');
        this.unsubscribeModal = document.getElementById('unsubscribeModal');
        this.unsubServer = document.getElementById('unsubServer');
        this.unsubUser = document.getElementById('unsubUser');
        this.unsubPassword = document.getElementById('unsubPassword');
        this.unsubPort = document.getElementById('unsubPort');
        this.unsubTls = document.getElementById('unsubTls');
        this.unsubscribeCheckBtn = document.getElementById('unsubscribeCheckBtn');
    }

    initDataTable() {
        this.dataTable = new DataTable('#invalidEmailsList', {
            columns: [
                { title: '電子郵件', key: 'email', sortable: true, width: '25%', render: (value) => 
                    `<div class="email-cell"><i class="fas fa-envelope text-muted me-2"></i><span class="email-text">${this.escapeHtml(value)}</span></div>` 
                },
                { title: '姓名', key: 'name', sortable: true, width: '15%', render: (value, row) => 
                    `${this.escapeHtml(row.firstName || '')} ${this.escapeHtml(row.lastName || '')}` 
                },
                { title: '公司名稱', key: 'companyName', sortable: true, width: '15%' },
                { title: '標記時間', key: 'updated_at', sortable: true, width: '15%', render: (value) => this.formatDate(value) },
                { title: '來源活動', key: 'lastBouncedCampaign', sortable: false, width: '15%', render: (value) => 
                    value ? `<span class="badge badge-info">${this.escapeHtml(value)}</span>` : '<span class="text-muted">-</span>' 
                },
                { title: '退信原因 / 錯誤訊息', key: 'bounceReason', sortable: false, width: '20%', render: (value, row) => {
                    // 如果有自定義的 formatReason 邏輯，可以在這裡使用
                    return this.formatReason(value, row);
                }},
                { title: '操作', key: 'actions', sortable: false, width: '10%', render: (value, row) => 
                    `<button class="btn btn-sm btn-outline-primary" onclick="window.location.href='subscribers.html?search=${encodeURIComponent(row.email)}'">查看詳情</button>` 
                }
            ],
            pagination: true,
            pageSize: 10,
            searchable: false, // 我們使用外部搜尋框
            sortable: true,
            emptyMessage: '沒有找到無效信箱'
        });
    }

    bindEvents() {
        // Status Tabs
        document.querySelectorAll('.status-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const status = tab.dataset.status;
                if (status) this.switchStatus(status);
            });
        });

        // Search
        let debounceTimer;
        this.searchInput.addEventListener('input', (e) => {
            this.toggleClearButton(e.target.value);
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                this.currentPage = 1;
                this.loadData(e.target.value);
            }, 500);
        });

        if (this.clearSearchBtn) {
            this.clearSearchBtn.addEventListener('click', () => {
                this.searchInput.value = '';
                this.toggleClearButton('');
                this.currentPage = 1;
                this.loadData('');
            });
        }

        // Export
        if (this.exportBtn) {
            this.exportBtn.addEventListener('click', () => this.exportData());
        }

        // Import
        if (this.importBtn) {
            this.importBtn.addEventListener('click', () => this.openImportModal('invalid'));
        } else {
            console.error('Import button not found in DOM');
        }

        if (this.importUnsubscribeBtn) {
            this.importUnsubscribeBtn.addEventListener('click', () => this.openImportModal('unsubscribed'));
        }

        if (this.confirmImportBtn) {
            this.confirmImportBtn.addEventListener('click', () => this.submitImport());
        }

        // Check Bounces
       if (this.checkBounceBtn) {
            this.checkBounceBtn.addEventListener('click', () => this.checkBounces());
        }

        // Unsubscribe Manager
        if (this.unsubscribeManagerBtn) {
            this.unsubscribeManagerBtn.addEventListener('click', () => this.openUnsubscribeModal());
        }

        if (this.unsubscribeCheckBtn) {
            this.unsubscribeCheckBtn.addEventListener('click', () => this.checkUnsubscribes());
        }
    }

    switchStatus(status) {
        if (this.currentStatus === status) return;
        this.currentStatus = status;
        this.currentPage = 1;
        
        this.updateActiveTab();
        this.loadData();
    }

    updateActiveTab() {
        document.querySelectorAll('.status-tab').forEach(tab => {
            if (tab.dataset.status === this.currentStatus) {
                tab.classList.add('active');
                tab.style.borderBottom = `3px solid ${this.currentStatus === 'invalid' ? '#dc3545' : '#6c757d'}`;
                tab.style.color = this.currentStatus === 'invalid' ? '#dc3545' : '#6c757d';
            } else {
                tab.classList.remove('active');
                tab.style.borderBottom = '3px solid transparent';
                tab.style.color = '#6c757d';
            }
        });
    }

    openUnsubscribeModal() {
        if (this.unsubscribeModal) {
            this.unsubscribeModal.style.display = 'flex';
            this.unsubscribeModal.classList.add('show');
            
            // Pre-fill with default values if empty
            if (!this.unsubServer.value) this.unsubServer.value = 'mail.winton.com.tw';
            if (!this.unsubUser.value) this.unsubUser.value = 'Unsubscribe@winton.com.tw';
            if (!this.unsubPassword.value) this.unsubPassword.value = 'Wint0n2k00';
            // Update port and TLS if not set
            if (!this.unsubPort.value) this.unsubPort.value = '993';
            if (this.unsubTls) this.unsubTls.checked = true;
        }
    }

    async checkUnsubscribes() {
        const config = {
            user: this.unsubUser.value,
            password: this.unsubPassword.value,
            host: this.unsubServer.value,
            port: parseInt(this.unsubPort.value) || 993,
            tls: this.unsubTls.checked,
            authTimeout: 3000
        };

        if (!config.user || !config.password || !config.host) {
            alert('請填寫完整連線資訊');
            return;
        }

        try {
            this.unsubscribeCheckBtn.disabled = true;
            this.unsubscribeCheckBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 檢查中...';

            const token = window.apiClient ? window.apiClient.getCorrectToken() : localStorage.getItem('token');
            const baseUrl = window.apiClient ? window.apiClient.baseURL : '/api';

            const response = await fetch(`${baseUrl}/subscribers/unsubscribe/check`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(config)
            });

            const result = await response.json();

            if (result.success) {
                alert(result.message);
                this.unsubscribeModal.style.display = 'none';
                this.unsubscribeModal.classList.remove('show');
                // Reload data to reflect any changes
                this.loadData();
                this.loadStatistics(); // Also reload statistics
            } else {
                alert('檢查失敗: ' + (result.message || '未知錯誤'));
            }
        } catch (error) {
            console.error('Error checking unsubscribes:', error);
            alert('發生錯誤: ' + error.message);
        } finally {
            this.unsubscribeCheckBtn.disabled = false;
            this.unsubscribeCheckBtn.innerHTML = '<i class="fas fa-check"></i> 開始檢查';
        }
    }

    openImportModal(type = 'invalid') {
        console.log('Opening import modal...', type);
        this.importType = type;
        
        if (this.importModal) {
            // Update title based on type
            if (this.importModalTitle) {
                this.importModalTitle.textContent = type === 'unsubscribed' ? '匯入取消訂閱名單' : '匯入無效名單';
            }

            // Show/Hide Campaign Selector
            if (this.importCampaignGroup) {
                if (type === 'invalid') {
                    this.importCampaignGroup.style.display = 'block';
                    this.loadCampaigns();
                } else {
                    this.importCampaignGroup.style.display = 'none';
                }
            }

            // Use flex to match CSS component style for centering
            this.importModal.style.display = 'flex';
            this.importModal.style.opacity = '1'; // Ensure visibility
            this.importModal.classList.add('show'); // Add show class for transitions/styles
            
            this.importModal.style.zIndex = '9999'; // Ensure it's on top
            this.importEmailText.value = '';
            this.importEmailFile.value = '';
            this.importResult.style.display = 'none';
        } else {
            console.error('Cannot open modal: element not found');
            alert('無法開啟匯入視窗：元件未找到');
        }
    }

    async loadCampaigns() {
        if (!this.importCampaignId) return;
        
        try {
            const token = window.apiClient ? window.apiClient.getCorrectToken() : localStorage.getItem('token');
            const baseUrl = window.apiClient ? window.apiClient.baseURL : '/api';
            
            // Get recent campaigns
            // Note: Assuming /campaigns endpoint supports sorting and limit. 
            // If not, we might get all and slice. But usually listing endpoints do.
            // Based on previous knowledge, let's try a simple get first or assume default order (usually recent first).
            const response = await fetch(`${baseUrl}/campaigns`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await response.json();
            
            if (result.success) {
                // Clear and add default
                this.importCampaignId.innerHTML = '<option value="">自動判斷 (最近一次發送)</option>';
                
                // Sort by sent_at desc if not already
                const campaigns = result.data.sort((a, b) => new Date(b.sent_at || 0) - new Date(a.sent_at || 0));
                
                campaigns.forEach(c => {
                    if (c.status === 'sent') { // Only show sent campaigns
                        const date = c.sent_at ? new Date(c.sent_at).toLocaleDateString() : '未發送';
                        const option = document.createElement('option');
                        option.value = c.id;
                        option.textContent = `${c.name} (${date})`;
                        this.importCampaignId.appendChild(option);
                    }
                });
            }
        } catch (e) {
            console.error('Failed to load campaigns', e);
        }
    }

    toggleClearButton(value) {
        if (this.clearSearchBtn) {
            this.clearSearchBtn.style.display = value ? 'flex' : 'none';
        }
    }

    async submitImport() {
        const text = this.importEmailText.value.trim();
        const file = this.importEmailFile.files[0];
        const campaignId = this.importCampaignId ? this.importCampaignId.value : null;
        let items = []; // Changed from emails (strings) to items (objects)

        if (!text && !file) {
            alert('請輸入 Email 或上傳檔案');
            return;
        }

        // Process text input
        if (text) {
            const textEmails = text.split(/[\n,;]+/).map(e => e.trim()).filter(e => e);
            items = items.concat(textEmails.map(email => ({ email, reason: '' })));
        }

        // Process file input
        if (file) {
            try {
                const fileContent = await this.readFile(file);
                const fileLines = fileContent.split(/[\n\r]+/).map(e => e.trim()).filter(e => e);
                
                const fileItems = fileLines.map(line => {
                    // Split by comma, handle potential quotes? Simple split for now as per previous logic
                    const parts = line.split(',');
                    const email = parts[0].trim();
                    // Join the rest as reason, in case reason contains commas (though simple split might break)
                    // Better: just take the second part if exists.
                    let reason = '';
                    if (parts.length > 1) {
                        reason = parts.slice(1).join(',').trim();
                        // Remove quotes if present
                        if (reason.startsWith('"') && reason.endsWith('"')) {
                            reason = reason.slice(1, -1);
                        }
                    }
                    return { email, reason };
                }).filter(item => item.email && item.email.includes('@'));
                
                items = items.concat(fileItems);
            } catch (error) {
                console.error('File read error:', error);
                alert('讀取檔案失敗');
                return;
            }
        }

        // Remove duplicates (based on email)
        const uniqueItems = [];
        const seenEmails = new Set();
        
        for (const item of items) {
            // Ensure email is a string
            if (typeof item.email !== 'string') continue;

            const lowerEmail = item.email.toLowerCase();
            if (!seenEmails.has(lowerEmail)) {
                seenEmails.add(lowerEmail);
                uniqueItems.push(item);
            }
        }

        if (uniqueItems.length === 0) {
            alert('沒有找到有效的 Email');
            return;
        }

        // Send to backend
        try {
            this.confirmImportBtn.disabled = true;
            this.confirmImportBtn.textContent = '處理中...';

            const token = window.apiClient ? window.apiClient.getCorrectToken() : localStorage.getItem('token');
            const baseUrl = window.apiClient ? window.apiClient.baseURL : '/api';
            
            const endpoint = this.importType === 'unsubscribed' 
                ? '/subscribers/unsubscribe/import' 
                : '/subscribers/bounces/import';

            const response = await fetch(`${baseUrl}${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ 
                    emails: uniqueItems,
                    campaignId: this.importType === 'invalid' ? campaignId : undefined
                }) 
            });

            const result = await response.json();

            if (result.success) {
                this.importResult.style.display = 'block';
                this.importResult.innerHTML = `
                    <div class="alert alert-success" style="padding: 10px; background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb; border-radius: 4px;">
                        <strong>匯入成功!</strong><br>
                        成功標記: ${result.data.updatedCount} 筆<br>
                        未找到: ${result.data.notFoundCount} 筆
                        ${result.data.notFoundCount > 0 ? `<br><small style="display:block; max-height:100px; overflow-y:auto; margin-top:5px;">未找到的 Email: ${result.data.notFoundEmails.join(', ')}</small>` : ''}
                    </div>
                `;
                
                // Reload list
                this.loadData();
                
                // Reset button
                this.confirmImportBtn.disabled = false;
                this.confirmImportBtn.textContent = '確認匯入';
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            console.error('Import error:', error);
            alert('匯入失敗: ' + error.message);
            this.confirmImportBtn.disabled = false;
            this.confirmImportBtn.textContent = '確認匯入';
        }
    }

    readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file);
        });
    }

    async checkBounces() {
        if (confirm('確定要立即檢查退信嗎？這可能需要一點時間。')) {
            try {
                this.checkBounceBtn.disabled = true;
                this.checkBounceBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 檢查中...';
                
                const token = window.apiClient ? window.apiClient.getCorrectToken() : localStorage.getItem('token');
                const baseUrl = window.apiClient ? window.apiClient.baseURL : '/api';
                
                const response = await fetch(`${baseUrl}/subscribers/bounces/check`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                const result = await response.json();
                
                if (result.success) {
                    const stats = result.data;
                    let msg = '檢查完成！\n';
                    if (stats) {
                        msg += `[退信檢查]\n`;
                        msg += `檢查資料夾數: ${stats.checkedFolders}\n`;
                        msg += `發現退信郵件: ${stats.foundMessages}\n`;
                        msg += `成功標記無效: ${stats.invalidatedSubscribers}\n`;
                        msg += `忽略(找不到訂閱者): ${stats.ignoredSubscribers}\n\n`;
                        
                        if (stats.unsubscribes) {
                             msg += `[取消訂閱檢查]\n`;
                             msg += `處理數量: ${stats.unsubscribes.count || 0}\n`;
                             if (stats.unsubscribes.error) {
                                 msg += `錯誤: ${stats.unsubscribes.error}\n`;
                             }
                        }

                        if (stats.errors && stats.errors.length > 0) {
                            msg += `\n警告: 檢查過程中有 ${stats.errors.length} 個錯誤，請檢查日誌。`;
                        }
                    } else {
                        msg += '檢查已在背景啟動';
                    }
                    alert(msg);
                    
                    // Reload data
                    setTimeout(() => {
                        this.loadData(this.searchInput.value);
                        this.loadStatistics();
                    }, 1000);
                } else {
                    alert('檢查失敗: ' + (result.message || '未知錯誤'));
                }
            } catch (error) {
                console.error('Error checking bounces:', error);
                alert('發生錯誤');
            } finally {
                this.checkBounceBtn.disabled = false;
                this.checkBounceBtn.innerHTML = '<i class="fas fa-sync-alt"></i> 立即檢查';
            }
        }
    }

    async loadStatistics() {
        // Load invalid count
        try {
            const invalidRes = await subscriberService.getSubscribers({ limit: 1, status: 'invalid', sortBy: 'updated_at', _t: Date.now() });
            if (invalidRes.success) {
                 const total = invalidRes.data.pagination ? invalidRes.data.pagination.total : (Array.isArray(invalidRes.data) ? invalidRes.data.length : 0);
                 if (this.invalidCount) this.invalidCount.textContent = total;
            }
        } catch (e) {
            console.error('Failed to load invalid stats', e);
        }

        // Load unsubscribed count
        try {
            const unsubRes = await subscriberService.getSubscribers({ limit: 1, status: 'unsubscribed', sortBy: 'updated_at', _t: Date.now() });
            if (unsubRes.success) {
                 const total = unsubRes.data.pagination ? unsubRes.data.pagination.total : (Array.isArray(unsubRes.data) ? unsubRes.data.length : 0);
                 if (this.unsubscribedCount) this.unsubscribedCount.textContent = total;
            }
        } catch (e) {
            console.error('Failed to load unsubscribed stats', e);
        }
    }

    async loadData(search = '') {
        // Capture the status at the start of the request
        const requestStatus = this.currentStatus;
        
        this.loading = true;
        if (this.dataTable) {
            this.dataTable.setLoading(true);
        }

        try {
            const params = {
                // page: this.currentPage, // 移除後端分頁
                // limit: this.pageSize, // 移除後端分頁
                limit: 10000, // 獲取足夠多的數據以供前端分頁 (增加到 10000 以確保能獲取所有數據)
                timeout: 60000, // 增加超時時間到 60 秒，避免大量數據載入時超時
                status: requestStatus, // Use captured status
                sortOrder: 'desc',
                sortBy: 'updated_at',
                _t: Date.now() // Prevent browser caching
            };

            if (search) {
                params.search = search;
            }

            // Update header text based on status - DataTable will handle this via column updates if needed, 
            // but for now we just change the column title dynamically if we want, or keep it generic.
            // Actually, we can update the DataTable column title if we want to be precise, 
            // but "退信原因 / 錯誤訊息" covers both cases reasonably well.
            // Let's stick to the static column definition for simplicity as it covers both.

            // Use subscriberService from api.js
            const response = await subscriberService.getSubscribers(params);
            
            // Check if status changed while we were waiting
            if (this.currentStatus !== requestStatus) {
                console.log('Status changed during load, ignoring result');
                return;
            }
            
            if (response.success) {
                const { subscribers, pagination } = response.data;
                // this.renderTable(subscribers); // Removed
                // this.renderPagination(pagination); // Removed
                
                // Update DataTable
                this.dataTable.setData(subscribers || []);

                // Update the total items for stats
                if (pagination) {
                    this.totalItems = pagination.total;
                    
                    // Also update the stats card for the current status
                    if (requestStatus === 'invalid') {
                        if (this.invalidCount) this.invalidCount.textContent = pagination.total; // Use total from backend
                    } else {
                        if (this.unsubscribedCount) this.unsubscribedCount.textContent = pagination.total; // Use total from backend
                    }
                }
            } else {
                throw new Error(response.message || '載入失敗');
            }
        } catch (error) {
            // Check if status changed while we were waiting
            if (this.currentStatus !== requestStatus) return;

            console.error('Failed to load emails:', error);
            // Show error in DataTable
            this.dataTable.element.innerHTML = `
                <div class="text-center text-danger p-4">
                    載入失敗: ${error.message}
                </div>
            `;
        } finally {
            if (this.currentStatus === requestStatus) {
                this.loading = false;
                if (this.dataTable) {
                    this.dataTable.setLoading(false);
                }
            }
        }
    }

    renderLoading() {
        if (this.listContainer) {
            this.listContainer.innerHTML = `
                <div class="text-center p-5">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <div class="mt-2 text-muted">載入中...</div>
                </div>
            `;
        }
    }

    formatReason(value, row) {
        const rawReason = value || row.bounceReason || row.bounce_reason;

        // 如果有具體的退信原因，優先顯示
        if (rawReason && rawReason !== 'Manual Import' && rawReason !== 'Bounce detected') {
             const translatedReason = this.translateBounceReason(rawReason);
             return `
                <span class="status-badge status-invalid" style="white-space: normal; text-align: left; display: block;" title="${this.escapeHtml(rawReason)}">
                    ${this.escapeHtml(translatedReason)}
                </span>`;
        }

        // 特殊情況處理
        if (rawReason === 'Manual Import') {
             return `
                <span class="status-badge status-invalid" style="white-space: normal; text-align: left; display: block;">
                    手動匯入
                </span>`;
        }

        // 根據狀態顯示默認訊息
        if (this.currentStatus === 'invalid') {
            const translatedReason = rawReason ? this.translateBounceReason(rawReason) : '未記錄原因';
            return `
                <span class="status-badge status-invalid" style="white-space: normal; text-align: left; display: block;" title="${this.escapeHtml(rawReason || '')}">
                    ${this.escapeHtml(translatedReason)}
                </span>`;
        } else {
            return `
                <span class="status-badge" style="background-color: #6c757d; color: white;">
                    已取消訂閱
                </span>
                <div style="font-size: 0.85em; color: #666; margin-top: 4px;">用戶主動取消 / 系統退訂</div>`;
        }
    }

    translateBounceReason(reason) {
        if (!reason) return '未記錄原因';
        
        const lowerReason = reason.toLowerCase();
        
        if (lowerReason.includes('bounce detected')) return '系統偵測到退信';
        if (lowerReason.includes('no such user') || lowerReason.includes('user unknown') || lowerReason.includes('recipient not found')) return '此信箱不存在';
        if (lowerReason.includes('quota exceeded') || lowerReason.includes('mailbox full')) return '信箱容量已滿';
        if (lowerReason.includes('domain not found') || lowerReason.includes('host unknown') || lowerReason.includes('host not found')) return '找不到該網域 / 主機';
        if (lowerReason.includes('relay access denied')) return '拒絕轉寄';
        if (lowerReason.includes('dmarc') || lowerReason.includes('authentication checks') || lowerReason.includes('policy') || lowerReason.includes('verification')) return '驗證失敗 (DMARC/SPF)';
        if (lowerReason.includes('spam') || lowerReason.includes('blocked')) return '被視為垃圾郵件 / 封鎖';
        if (lowerReason.includes('user reject')) return '用戶拒收 / 黑名單';
        
        // Server Errors
        if (lowerReason.includes('service unavailable')) return '服務暫時無法使用 (Service Unavailable)';
        if (lowerReason.includes('access denied')) return '存取被拒絕 (Access Denied)';

        // Network and Connection Errors
        if (lowerReason.includes('connection timed out')) return '連線逾時 (Connection Timed Out)';
        if (lowerReason.includes('connection refused')) return '連線被拒 (Connection Refused)';
        if (lowerReason.includes('network is unreachable')) return '網路無法連線 (Network Unreachable)';
        if (lowerReason.includes('name service error')) return 'DNS 解析錯誤 (Name Service Error)';
        if (lowerReason.includes('message expired')) return '郵件過期 (Message Expired)';
        if (lowerReason.match(/4\.4\.[0-9]/)) return '網路傳輸錯誤 (4.4.x)';

        // Return original if no match, maybe truncate if too long
        return reason.length > 50 ? reason.substring(0, 50) + '...' : reason;
    }

    async exportData() {
        try {
            const token = window.apiClient ? window.apiClient.getCorrectToken() : localStorage.getItem('token');
            const baseUrl = window.apiClient ? window.apiClient.baseURL : '/api';
            
            const response = await fetch(`${baseUrl}/subscribers/export?status=${this.currentStatus}&format=csv`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${this.currentStatus}_emails_${new Date().toISOString().split('T')[0]}.csv`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            } else {
                alert('匯出失敗');
            }
        } catch (error) {
            console.error('Export error:', error);
            alert('匯出發生錯誤');
        }
    }

    escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    formatDate(dateString) {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleString('zh-TW', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
}
