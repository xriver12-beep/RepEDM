/**
 * 審核管理系統
 * 處理審核項目的顯示、篩選、排序和操作
 */

class ApprovalsManager {
    constructor() {
        this.approvals = [];
        this.filteredApprovals = [];
        this.selectedItems = new Set();
        this.currentPage = 1;
        this.itemsPerPage = 10;
        this.sortBy = 'created_date';
        this.sortOrder = 'desc';
        this.filters = {
            status: 'active', // 改回預設顯示所有進行中，避免使用者找不到項目
            type: '',
            priority: '',
            search: ''
        };
        
        // 取得當前使用者資訊
        this.currentUser = null;
        if (window.UserAuthService) {
            const authService = new UserAuthService();
            this.currentUser = authService.getUser();
        } else {
             // Fallback: 嘗試從 localStorage 直接讀取
             const userStr = localStorage.getItem('user');
             if (userStr) {
                 try {
                     this.currentUser = JSON.parse(userStr);
                 } catch (e) {
                     console.error('Failed to parse user info', e);
                 }
             }
        }
        console.log('Current user loaded:', this.currentUser);
        
        // 組件實例
        this.dataTable = null;
        this.modals = null;
        
        // 當前查看的審核詳情
        this.currentApproval = null;
        
        this.init();
    }

    async init() {
        try {
            await this.setupComponents();
            this.setupEventListeners();
            await this.loadApprovals();
            this.updateStats();
            
            // 設置自動刷新
            this.setupAutoRefresh();
            
            // 檢查 URL 參數是否有 highlight
            this.checkUrlParams();
            
            console.log('ApprovalsManager initialized successfully');
        } catch (error) {
            console.error('Failed to initialize ApprovalsManager:', error);
            NotificationUtils.show('初始化審核管理器失敗', 'error');
        }
    }

    async setupComponents() {
        // 初始化 DataTable 組件
        this.dataTable = new DataTable('#approvalsContainer', {
            itemsPerPage: this.itemsPerPage,
            sortable: true,
            selectable: true,
            onSort: (field, order) => this.handleSort(field, order),
            onSelect: (selectedIds) => this.handleSelection(selectedIds),
            onPageChange: (page) => this.goToPage(page)
        });

        // 初始化 Modals 組件
        // this.modals = new Modals({
        //     onClose: () => this.handleModalClose()
        // });
    }

    setupAutoRefresh() {
        // 每30秒自動刷新數據
        setInterval(() => {
            if (document.visibilityState === 'visible') {
                this.loadApprovals(false); // 靜默刷新
            }
        }, 30000);
    }

    setupEventListeners() {
        // 處理登出按鈕 - 修復登出無效的問題
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (typeof window.handleLogout === 'function') {
                    window.handleLogout();
                } else {
                    console.error('handleLogout function not found');
                    // 備用登出邏輯
                    localStorage.removeItem('authToken');
                    localStorage.removeItem('user');
                    window.location.href = 'user-login.html';
                }
            });
        }

        // 篩選器
        const statusFilter = document.getElementById('statusFilter');
        const typeFilter = document.getElementById('typeFilter');
        const priorityFilter = document.getElementById('priorityFilter');
        const searchInput = document.getElementById('searchInput');

        if (statusFilter) {
            statusFilter.addEventListener('change', (e) => {
                this.filters.status = e.target.value;
                this.applyFilters();
            });
        }

        if (typeFilter) {
            typeFilter.addEventListener('change', (e) => {
                this.filters.type = e.target.value;
                this.applyFilters();
            });
        }

        if (priorityFilter) {
            priorityFilter.addEventListener('change', (e) => {
                this.filters.priority = e.target.value;
                this.applyFilters();
            });
        }

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filters.search = e.target.value;
                this.debounceFilter();
            });
        }

        // 搜尋按鈕
        const searchBtn = document.querySelector('.search-btn');
        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                this.applyFilters();
            });
        }

        // 批量操作按鈕
        const bulkApproveBtn = document.getElementById('bulkApproveBtn');
        const bulkRejectBtn = document.getElementById('bulkRejectBtn');

        if (bulkApproveBtn) {
            bulkApproveBtn.addEventListener('click', () => {
                this.confirmBulkAction('approve');
            });
        }

        if (bulkRejectBtn) {
            bulkRejectBtn.addEventListener('click', () => {
                this.confirmBulkAction('reject');
            });
        }



        // 全選複選框
        const selectAllCheckbox = document.getElementById('selectAll');
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', (e) => {
                this.toggleSelectAll(e.target.checked);
            });
        }

        // 排序選擇
        const sortSelect = document.getElementById('sortBy');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                this.sortBy = e.target.value;
                this.renderApprovals();
            });
        }



        // 分頁控制
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('page-number')) {
                const page = parseInt(e.target.dataset.page);
                this.goToPage(page);
            }
            if (e.target.id === 'approvalsPrevPage') {
                this.goToPage(this.currentPage - 1);
            }
            if (e.target.id === 'approvalsNextPage') {
                this.goToPage(this.currentPage + 1);
            }
        });

        // 模態框控制
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.closeModal();
            }
            if (e.target.classList.contains('modal-close')) {
                this.closeModal();
            }
        });

        // 標籤頁切換
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('tab-btn')) {
                this.switchTab(e.target.dataset.tab);
            }
        });

        // 常用理由選擇
        const cannedReasonSelect = document.getElementById('cannedReasonSelect');
        if (cannedReasonSelect) {
            cannedReasonSelect.addEventListener('change', (e) => {
                const reasonTextarea = document.getElementById('decisionReason');
                if (reasonTextarea) {
                    if (e.target.value === 'custom') {
                        reasonTextarea.value = '';
                        reasonTextarea.focus();
                    } else if (e.target.value) {
                        reasonTextarea.value = e.target.value;
                    }
                }
            });
        }

        // 審核決定按鈕
        document.addEventListener('click', (e) => {
            if (e.target.id === 'approveBtn') {
                this.openDecisionModal('approve');
            }
            if (e.target.id === 'revisionBtn') {
                this.openDecisionModal('revision');
            }
            if (e.target.id === 'rejectBtn') {
                this.openDecisionModal('reject');
            }
            if (e.target.id === 'emergencyApproveBtn') {
                this.openDecisionModal('emergency');
            }
            if (e.target.id === 'confirmDecisionBtn') {
                this.confirmDecision();
            }
            if (e.target.id === 'cancelDecisionBtn') {
                this.closeModal();
            }
            if (e.target.id === 'cancelBtn') {
                this.closeModal();
            }
        });

        // 評論功能
        const addCommentBtn = document.getElementById('addCommentBtn');
        if (addCommentBtn) {
            addCommentBtn.addEventListener('click', () => {
                this.addComment();
            });
        }



        // 預覽模式切換
        document.addEventListener('click', (e) => {
            if (e.target.id === 'previewModeBtn') {
                this.switchPreviewMode('preview');
            }
            if (e.target.id === 'sourceCodeBtn') {
                this.switchPreviewMode('source');
            }
        });



        // 鍵盤快捷鍵
        document.addEventListener('keydown', this.handleKeyboardShortcuts.bind(this));
    }

    debounceFilter() {
        clearTimeout(this.filterTimeout);
        this.filterTimeout = setTimeout(() => {
            this.applyFilters();
        }, 300);
    }

    // 新增的輔助方法
    handleKeyboardShortcuts(e) {
        // Ctrl/Cmd + A: 全選
        if ((e.ctrlKey || e.metaKey) && e.key === 'a' && !e.target.matches('input, textarea')) {
            e.preventDefault();
            const selectAllCheckbox = document.getElementById('selectAll');
            if (selectAllCheckbox) {
                selectAllCheckbox.checked = !selectAllCheckbox.checked;
                this.toggleSelectAll(selectAllCheckbox.checked);
            }
        }
        
        // Escape: 關閉模態框
        if (e.key === 'Escape') {
            this.closeModal();
        }
        
        // Enter: 在搜尋框中觸發搜尋
        if (e.key === 'Enter' && e.target.id === 'searchInput') {
            this.applyFilters();
        }
    }

    confirmBulkAction(action) {
        if (this.selectedItems.size === 0) {
            NotificationUtils.show('請先選擇要操作的項目', 'warning');
            return;
        }

        const actionText = action === 'approve' ? '通過' : '拒絕';
        const message = `確定要批量${actionText} ${this.selectedItems.size} 個審核項目嗎？`;
        
        if (confirm(message)) {
            if (action === 'approve') {
                this.bulkApprove();
            } else {
                this.bulkReject();
            }
        }
    }

    checkUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const highlightId = urlParams.get('highlight');
        
        if (highlightId) {
            console.log('Highlighting approval item:', highlightId);
            // 延遲一下確保數據已加載
            setTimeout(() => {
                this.viewApprovalDetail(highlightId);
                
                // 清除 URL 參數
                const newUrl = window.location.pathname;
                window.history.replaceState({}, document.title, newUrl);
            }, 1000);
        }
    }

    async loadApprovals(forceRefresh = false) {
        try {
            showLoading('approvalsContainer');
            
            // 使用 API 服務載入數據
            const params = {
                page: this.currentPage,
                limit: this.itemsPerPage,
                sort: this.sortBy,
                order: this.sortOrder,
                ...this.filters
            };
            
            // 如果是強制刷新，加入時間戳以避開緩存
            if (forceRefresh) {
                params._t = new Date().getTime();
            }

            const response = await apiService.get('/approvals', params);
            
            if (response.success) {
                const backendItems = response.data.items || [];
                
                // 將後端數據轉換為前端模型
                this.approvals = backendItems.map(item => {
                    // 計算是否為當前審核人
                    let isCurrentApprover = false;
                    if (this.currentUser && (item.status === 'pending' || item.status === 'in_review')) {
                        const userId = this.currentUser.id;
                        const userRole = this.currentUser.role;
                        
                        if (item.ApproverType === 'SpecificUser' || item.ApproverType === 'User') {
                            isCurrentApprover = (item.RequiredUserID == userId);
                        } else if (item.ApproverType === 'Manager') {
                            isCurrentApprover = (item.SubmitterManagerID == userId);
                        } else if (item.ApproverType === 'Role') {
                            isCurrentApprover = (userRole && item.RequiredRole && 
                                               userRole.toLowerCase() === item.RequiredRole.toLowerCase());
                        }
                    }

                    return {
                        id: item.ApprovalID,
                        title: item.CampaignName,
                        type: (item.type || 'campaign').toLowerCase(),
                        status: (item.status || 'pending').toLowerCase(),
                        priority: (item.priority || 'normal').toLowerCase(),
                        submitter: item.SubmitterName,
                        created_date: item.SubmittedAt,
                        description: item.subject || '無主題',
                        content: '', 
                        comments: [],
                        history: [],
                        // 新增欄位
                        current_step: item.current_step,
                        total_steps: item.total_steps,
                        step_name: item.StepName,
                        current_approver: item.CurrentApprover,
                        recipient_count: item.recipient_count || 0,
                        recipient_count_details: item.recipient_count_details,
                        is_current_approver: isCurrentApprover,
                        // 保留原始欄位供除錯或後續使用
                        raw_approver_type: item.ApproverType,
                        raw_required_user_id: item.RequiredUserID
                    };
                });

                // 如果沒有數據，顯示空列表而不是模擬數據
                if (this.approvals.length === 0) {
                    // console.log('No approvals found');
                }

                this.filteredApprovals = this.getFilteredApprovals();
                this.renderApprovals();
            } else {
                throw new Error(response.message || '載入失敗');
            }
            
        } catch (error) {
            console.error('載入審核資料失敗:', error);
            NotificationUtils.show('載入審核資料失敗', 'error');
            
            // 使用模擬數據作為後備
            this.approvals = this.generateMockApprovalData();
            this.filteredApprovals = this.getFilteredApprovals();
            this.renderApprovals();
        } finally {
            hideLoading('approvalsContainer');
        }
    }

    generateMockApprovalData() {
        const types = ['campaign', 'template', 'content'];
        const statuses = ['pending', 'approved', 'rejected', 'revision'];
        const priorities = ['high', 'medium', 'low'];
        const submitters = ['張小明', '李小華', '王大偉', '陳美玲', '林志強'];
        
        const items = [
            '春季促銷活動郵件',
            '新產品發布模板',
            '會員專屬優惠內容',
            '週年慶活動設計',
            '夏日清倉郵件模板'
        ];

        return Array.from({ length: 5 }, (_, i) => {
            const createdDate = new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000);
            const type = types[Math.floor(Math.random() * types.length)];
            const status = statuses[Math.floor(Math.random() * statuses.length)];
            const priority = priorities[Math.floor(Math.random() * priorities.length)];
            
            return {
                id: String(i + 1),
                title: items[Math.floor(Math.random() * items.length)] + ` ${i + 1}`,
                type: type,
                status: status,
                priority: priority,
                submitter: submitters[Math.floor(Math.random() * submitters.length)],
                created_date: createdDate,
                description: `這是一個${this.getTypeLabel(type)}的審核項目，需要進行內容審核和批准。`,
                content: this.generateMockContent(type),
                comments: this.generateMockComments(),
                history: this.generateMockHistory(status, createdDate)
            };
        });
    }

    getTypeLabel(type) {
        const labels = {
            campaign: '活動',
            template: '模板',
            content: '內容',
            promotional: '促銷活動',
            transactional: '訊息通知',
            newsletter: '電子報',
            announcement: '公告通知',
            welcome: '歡迎郵件',
            regular: '一般活動',
            Regular: '一般活動',
            automated: '節日',
            Automated: '節日'
        };
        return labels[type] || type;
    }

    generateMockContent(type) {
        const contents = {
            campaign: `
                <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
                    <h1 style="color: #333; text-align: center;">春季促銷活動</h1>
                    <p>親愛的會員，春天來了！我們為您準備了豐富的促銷活動。</p>
                    <div style="background: #f0f8ff; padding: 20px; border-radius: 8px;">
                        <h2>特惠內容：</h2>
                        <ul>
                            <li>全館商品 8 折優惠</li>
                            <li>滿千送百活動</li>
                            <li>免費送貨服務</li>
                        </ul>
                    </div>
                    <p style="text-align: center;">
                        <a href="#" style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
                            立即購買
                        </a>
                    </p>
                </div>
            `,
            template: `
                <div style="max-width: 600px; margin: 0 auto;">
                    <header style="background: #667eea; color: white; padding: 20px; text-align: center;">
                        <h1>{{title}}</h1>
                    </header>
                    <main style="padding: 20px;">
                        <p>{{content}}</p>
                        <div style="text-align: center; margin: 20px 0;">
                            <a href="{{link}}" style="background: #38a169; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
                                {{button_text}}
                            </a>
                        </div>
                    </main>
                    <footer style="background: #f7fafc; padding: 15px; text-align: center; font-size: 12px; color: #718096;">
                        {{footer_text}}
                    </footer>
                </div>
            `,
            content: `
                <h2>會員專屬優惠</h2>
                <p>感謝您一直以來的支持，我們為會員準備了專屬優惠：</p>
                <ul>
                    <li>VIP 會員享有額外 5% 折扣</li>
                    <li>生日月份特別優惠</li>
                    <li>積分兌換禮品</li>
                </ul>
                <p>優惠期限：即日起至月底</p>
            `
        };
        return contents[type] || '<p>內容預覽</p>';
    }

    generateMockComments() {
        const comments = [
            {
                id: 1,
                author: '審核員A',
                content: '整體設計不錯，但建議調整一下顏色搭配。',
                created_at: new Date(Date.now() - 2 * 60 * 60 * 1000)
            },
            {
                id: 2,
                author: '設計師B',
                content: '已根據建議調整了顏色，請再次審核。',
                created_at: new Date(Date.now() - 1 * 60 * 60 * 1000)
            }
        ];
        return Math.random() > 0.5 ? comments : [];
    }

    generateMockHistory(status, createdDate) {
        const history = [
            {
                action: '提交審核',
                user: '提交者',
                time: createdDate,
                comment: '提交新的審核項目'
            }
        ];

        if (status !== 'pending') {
            history.push({
                action: status === 'approved' ? '審核通過' : status === 'rejected' ? '審核拒絕' : '需要修改',
                user: '審核員',
                time: new Date(createdDate.getTime() + Math.random() * 24 * 60 * 60 * 1000),
                comment: '已完成審核'
            });
        }

        return history;
    }

    async updateStats() {
        try {
            // 從後端獲取真實統計數據
            if (window.apiClient) {
                try {
                    const response = await window.apiClient.get('/approvals/stats/summary');
                    if (response.success && response.data) {
                        const { pendingCount, approvedToday, rejectedToday, avgProcessTime } = response.data;
                        
                        const pendingElement = document.querySelector('[data-stat="pendingApprovals"]');
                        const approvedElement = document.querySelector('[data-stat="approvedToday"]');
                        const rejectedElement = document.querySelector('[data-stat="rejectedToday"]');
                        const avgTimeElement = document.querySelector('[data-stat="avgProcessTime"]');

                        if (pendingElement) this.animateNumber(pendingElement, 0, pendingCount, 1000);
                        if (approvedElement) this.animateNumber(approvedElement, 0, approvedToday, 1000);
                        if (rejectedElement) this.animateNumber(rejectedElement, 0, rejectedToday, 1000);
                        if (avgTimeElement) this.animateNumber(avgTimeElement, 0, avgProcessTime || 0, 1000);
                        return;
                    }
                } catch (err) {
                    console.error('獲取後端統計失敗，使用前端計算:', err);
                }
            }

            // Fallback: Use frontend calculation if API fails
            const pendingCount = this.approvals.filter(item => item.status === 'pending').length;
            const approvedToday = this.approvals.filter(item => {
                const today = new Date();
                const itemDate = new Date(item.created_date);
                return item.status === 'approved' && 
                       itemDate.toDateString() === today.toDateString();
            }).length;
            const rejectedToday = this.approvals.filter(item => {
                const today = new Date();
                const itemDate = new Date(item.created_date);
                return item.status === 'rejected' && 
                       itemDate.toDateString() === today.toDateString();
            }).length;
            const avgProcessTime = 0; 

            // 更新統計數字
            const pendingElement = document.querySelector('[data-stat="pendingApprovals"]');
            const approvedElement = document.querySelector('[data-stat="approvedToday"]');
            const rejectedElement = document.querySelector('[data-stat="rejectedToday"]');
            const avgTimeElement = document.querySelector('[data-stat="avgProcessTime"]');

            if (pendingElement) {
                this.animateNumber(pendingElement, 0, pendingCount, 1000);
            }
            if (approvedElement) {
                this.animateNumber(approvedElement, 0, approvedToday, 1000);
            }
            if (rejectedElement) {
                this.animateNumber(rejectedElement, 0, rejectedToday, 1000);
            }
            if (avgTimeElement) {
                this.animateNumber(avgTimeElement, 0, avgProcessTime, 1000);
            }

        } catch (error) {
            console.error('更新統計失敗:', error);
        }
    }

    animateNumber(element, start, end, duration) {
        const startTime = performance.now();
        const difference = end - start;

        const updateNumber = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            const easeOutQuart = 1 - Math.pow(1 - progress, 4);
            const current = start + (difference * easeOutQuart);
            
            element.textContent = Math.round(current);

            if (progress < 1) {
                requestAnimationFrame(updateNumber);
            }
        };

        requestAnimationFrame(updateNumber);
    }

    applyFilters() {
        this.currentPage = 1;
        this.filteredApprovals = this.getFilteredApprovals();
        this.renderApprovals();
        this.updateStats();
    }

    getFilteredApprovals() {
        return this.approvals.filter(approval => {
            let matchesStatus = true;
            if (this.filters.status) {
                if (this.filters.status === 'active') {
                    // 所有進行中
                    matchesStatus = ['pending', 'in_review'].includes(approval.status);
                } else if (this.filters.status === 'pending_my_approval') {
                    // 待我審核 (狀態為進行中 且 當前使用者是審核人)
                    matchesStatus = ['pending', 'in_review'].includes(approval.status) && approval.is_current_approver;
                } else {
                    matchesStatus = approval.status === this.filters.status;
                }
            }
            const matchesType = !this.filters.type || approval.type === this.filters.type;
            const matchesPriority = !this.filters.priority || approval.priority === this.filters.priority;
            const matchesSearch = !this.filters.search || 
                approval.title.toLowerCase().includes(this.filters.search.toLowerCase()) ||
                approval.submitter.toLowerCase().includes(this.filters.search.toLowerCase()) ||
                approval.description.toLowerCase().includes(this.filters.search.toLowerCase());
            
            return matchesStatus && matchesType && matchesPriority && matchesSearch;
        });
    }

    handleSort(field, order) {
        this.sortBy = field;
        this.sortOrder = order;
        this.renderApprovals();
    }

    handleSelection(selectedIds) {
        this.selectedItems = new Set(selectedIds);
        this.updateBulkActionButtons();
    }

    handleModalClose() {
        // 清空表單數據
        this.clearFormData();
    }

    clearFormData() {
        const forms = document.querySelectorAll('textarea, input[type="text"]');
        forms.forEach(input => {
            if (input.id === 'decisionReason' || input.id === 'revisionNotes' || input.id === 'newComment') {
                input.value = '';
            }
        });
    }

    // 獲取預計發送數量的提示文字
    getRecipientCountTooltip(item) {
        if (item.recipient_count_details && item.recipient_count_details.inactive > 0) {
            const d = item.recipient_count_details;
            let details = [];
            if (d.unsubscribed > 0) details.push(`退訂: ${d.unsubscribed}`);
            if (d.bounced > 0) details.push(`信箱無效: ${d.bounced}`);
            if (d.deleted > 0) details.push(`已刪除: ${d.deleted}`);
            // Fallback for older records or generic inactive
            if (details.length === 0) details.push(`無效/刪除: ${d.inactive}`);
            
            return `預計發送: ${item.recipient_count} (活躍)\n總訂閱者: ${d.total}\n差異原因:\n- ${details.join('\n- ')}`;
        }
        return '預計發送數量 (活躍訂閱者)';
    }

    // 獲取預計發送數量的警告標示
    getRecipientCountWarning(item) {
        if (item.recipient_count_details && item.recipient_count_details.inactive > 0) {
            return ' <span style="color: #f59e0b; cursor: help;">⚠️</span>';
        }
        return '';
    }

    // 獲取預計發送數量的詳細說明 HTML
    getRecipientCountDetails(item) {
        if (item.recipient_count_details && item.recipient_count_details.inactive > 0) {
            return `<span style="color: #d9534f; font-size: 0.9em; margin-left: 5px;">(含 ${item.recipient_count_details.inactive} 位無效/刪除)</span>`;
        }
        return '';
    }

    renderApprovals() {
        const container = document.getElementById('approvalsContainer');
        if (!container) return;

        // 使用已過濾的數據
        const filteredApprovals = this.filteredApprovals.length > 0 ? this.filteredApprovals : this.getFilteredApprovals();
        
        // 排序
        const sortedApprovals = [...filteredApprovals].sort((a, b) => {
            let result = 0;
            switch (this.sortBy) {
                case 'priority':
                    const priorityOrder = { urgent: 4, high: 3, medium: 2, normal: 2, low: 1 };
                    const pA = priorityOrder[a.priority] || 0;
                    const pB = priorityOrder[b.priority] || 0;
                    result = pB - pA;
                    break;
                case 'type':
                    result = a.type.localeCompare(b.type);
                    break;
                case 'status':
                    result = a.status.localeCompare(b.status);
                    break;
                case 'submitter':
                    result = a.submitter.localeCompare(b.submitter);
                    break;
                case 'title':
                    result = a.title.localeCompare(b.title);
                    break;
                default: // created_date
                    result = new Date(b.created_date) - new Date(a.created_date);
            }
            return this.sortOrder === 'desc' ? result : -result;
        });

        // 分頁
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const pageData = sortedApprovals.slice(startIndex, endIndex);

        if (pageData.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📋</div>
                    <h3>沒有找到審核項目</h3>
                    <p>請調整篩選條件或稍後再試</p>
                </div>
            `;
        } else {
            container.innerHTML = pageData.map(approval => {
                const priorityClass = approval.priority === 'urgent' ? 'approval-item urgent-item' : 'approval-item';
                const urgentBadge = approval.priority === 'urgent' ? '<span class="badge badge-danger ml-2">緊急</span>' : '';
                
                return `
                <div class="${priorityClass}" style="${approval.priority === 'urgent' ? 'border-left: 5px solid #dc3545; background-color: #fff5f5;' : ''}">
                    <div class="approval-checkbox">
                        <input type="checkbox" id="approval_${approval.id}" 
                               onchange="approvalsManager.toggleSelection('${approval.id}', this.checked)">
                    </div>
                    <div class="approval-info">
                        <div>
                            <div class="approval-title" onclick="approvalsManager.viewApprovalDetail('${approval.id}')">
                                ${approval.title} ${urgentBadge}
                            </div>
                            <div class="approval-meta">
                                由 ${approval.submitter} 提交於 ${FormatUtils.formatDate(approval.created_date)}
                                <span class="meta-separator">|</span>
                                <span class="recipient-count" title="${this.getRecipientCountTooltip(approval)}">
                                    👥 ${approval.recipient_count}
                                    ${this.getRecipientCountDetails(approval)}
                                </span>
                            </div>
                        </div>
                        <div>
                            <span class="approval-type ${approval.type}">
                                ${this.getTypeLabel(approval.type)}
                            </span>
                        </div>
                        <div>
                            <span class="approval-priority ${approval.priority}">
                                ${this.getPriorityLabel(approval.priority)}
                            </span>
                        </div>
                        <div>
                            <span class="approval-status ${approval.status}">
                                ${this.getStatusLabel(approval.status)}
                            </span>
                        </div>
                        <div class="approval-stage-info">
                            ${approval.status === 'pending' || approval.status === 'in_review' ? `
                                <span class="stage-badge">
                                    <i class="icon">🔄</i> 
                                    ${approval.step_name || '審核中'} 
                                    ${approval.current_approver ? `(${approval.current_approver})` : ''}
                                </span>
                            ` : ''}
                        </div>
                        <div>
                            ${FormatUtils.formatDate(approval.created_date)}
                        </div>
                        <div class="approval-actions">
                            ${((approval.status === 'pending' || approval.status === 'in_review') && approval.is_current_approver) ? `
                                <button class="action-btn approve" onclick="approvalsManager.quickApprove('${approval.id}')" title="快速通過">
                                    ✓
                                </button>
                                <button class="action-btn reject" onclick="approvalsManager.quickReject('${approval.id}')" title="快速拒絕">
                                    ✗
                                </button>
                            ` : ''}
                            <button class="action-btn" onclick="approvalsManager.viewApprovalDetail('${approval.id}')" title="查看詳情">
                                👁
                            </button>
                        </div>
                    </div>
                </div>
            `}).join('');
        }

        this.renderPagination(filteredApprovals.length);
        this.updateBulkActionButtons();
    }

    getPriorityLabel(priority) {
        const labels = {
            urgent: '緊急',
            high: '高',
            medium: '中',
            normal: '中',
            low: '低'
        };
        return labels[priority] || priority;
    }

    getStatusLabel(status) {
        const labels = {
            pending: '待審核',
            in_review: '審核中',
            approved: '已通過',
            rejected: '已拒絕',
            revision: '需修改',
            cancelled: '已取消'
        };
        return labels[status] || status;
    }

    renderPagination(totalItems) {
        const totalPages = Math.ceil(totalItems / this.itemsPerPage);
        const startItem = (this.currentPage - 1) * this.itemsPerPage + 1;
        const endItem = Math.min(this.currentPage * this.itemsPerPage, totalItems);

        // 更新分頁資訊
        const paginationInfo = document.getElementById('approvalsInfo');
        if (paginationInfo) {
            paginationInfo.textContent = `顯示 ${startItem}-${endItem} 項，共 ${totalItems} 項`;
        }

        // 更新分頁按鈕
        const prevBtn = document.getElementById('approvalsPrevPage');
        const nextBtn = document.getElementById('approvalsNextPage');
        
        if (prevBtn) prevBtn.disabled = this.currentPage === 1;
        if (nextBtn) nextBtn.disabled = this.currentPage === totalPages;

        // 更新頁碼
        const pageNumbers = document.getElementById('approvalsPageNumbers');
        if (pageNumbers) {
            const pages = this.generatePageNumbers(this.currentPage, totalPages);
            pageNumbers.innerHTML = pages.map(page => {
                if (page === '...') {
                    return '<span class="page-ellipsis">...</span>';
                }
                return `
                    <button class="page-number ${page === this.currentPage ? 'active' : ''}" 
                            data-page="${page}">${page}</button>
                `;
            }).join('');
        }
    }

    generatePageNumbers(current, total) {
        const pages = [];
        const delta = 2;

        for (let i = Math.max(2, current - delta); i <= Math.min(total - 1, current + delta); i++) {
            pages.push(i);
        }

        if (current - delta > 2) {
            pages.unshift('...');
        }
        if (current + delta < total - 1) {
            pages.push('...');
        }

        pages.unshift(1);
        if (total > 1) {
            pages.push(total);
        }

        return [...new Set(pages)];
    }

    goToPage(page) {
        const filteredApprovals = this.getFilteredApprovals();
        const totalPages = Math.ceil(filteredApprovals.length / this.itemsPerPage);
        
        if (page >= 1 && page <= totalPages) {
            this.currentPage = page;
            this.renderApprovals();
        }
    }

    toggleSelection(id, checked) {
        if (checked) {
            this.selectedItems.add(id);
        } else {
            this.selectedItems.delete(id);
        }
        this.updateBulkActionButtons();
        this.updateSelectAllCheckbox();
    }

    toggleSelectAll(checked) {
        const filteredApprovals = this.getFilteredApprovals();
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const pageData = filteredApprovals.slice(startIndex, endIndex);

        pageData.forEach(approval => {
            const checkbox = document.getElementById(`approval_${approval.id}`);
            if (checkbox) {
                checkbox.checked = checked;
                if (checked) {
                    this.selectedItems.add(approval.id);
                } else {
                    this.selectedItems.delete(approval.id);
                }
            }
        });

        this.updateBulkActionButtons();
    }

    updateSelectAllCheckbox() {
        const selectAllCheckbox = document.getElementById('selectAll');
        if (!selectAllCheckbox) return;

        const filteredApprovals = this.getFilteredApprovals();
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const pageData = filteredApprovals.slice(startIndex, endIndex);

        const selectedOnPage = pageData.filter(approval => this.selectedItems.has(approval.id)).length;
        
        if (selectedOnPage === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        } else if (selectedOnPage === pageData.length) {
            selectAllCheckbox.checked = true;
            selectAllCheckbox.indeterminate = false;
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = true;
        }
    }

    updateBulkActionButtons() {
        const bulkApproveBtn = document.getElementById('bulkApproveBtn');
        const bulkRejectBtn = document.getElementById('bulkRejectBtn');
        
        const hasSelection = this.selectedItems.size > 0;
        
        if (bulkApproveBtn) bulkApproveBtn.disabled = !hasSelection;
        if (bulkRejectBtn) bulkRejectBtn.disabled = !hasSelection;
    }

    async quickApprove(id) {
        console.log('quickApprove called for id:', id);
        // Ensure ID comparison handles both string and number types
        const approval = this.approvals.find(item => String(item.id) === String(id));
        if (!approval) {
            console.error('Approval item not found:', id);
            return;
        }

        // 保存原始狀態以便失敗時還原
        const originalStatus = approval.status;
        const originalHistory = [...approval.history];

        try {
            // 顯示處理中提示
            NotificationUtils.show('處理中，請稍候...', 'info');

            // 樂觀更新 (Optimistic Update) - 先更新 UI
            approval.status = 'approved';
            approval.history.push({
                action: '審核通過',
                user: '當前用戶',
                time: new Date(),
                comment: '快速審核通過'
            });
            
            // 使用 applyFilters 重新過濾並渲染，確保列表狀態正確 (例如從待審核列表中移除)
            this.applyFilters();
            NotificationUtils.show('已快速通過', 'success');
            
            // 後台發送請求
            const response = await apiService.post(`/approvals/${id}/action`, {
                comments: '快速審核通過',
                action: 'Approved'
            });
            
            if (!response.success) {
                throw new Error(response.message || '審核失敗');
            }
            
        } catch (error) {
            console.error('審核失敗:', error);
            
            // 發生錯誤時還原狀態
            approval.status = originalStatus;
            approval.history = originalHistory;
            this.applyFilters();
            
            NotificationUtils.show(error.message || '審核失敗，已還原狀態', 'error');
        }
    }

    async quickReject(id) {
        console.log('quickReject called for id:', id);
        // Ensure ID comparison handles both string and number types
        const approval = this.approvals.find(item => String(item.id) === String(id));
        if (!approval) {
            console.error('Approval item not found:', id);
            return;
        }

        // 保存原始狀態以便失敗時還原
        const originalStatus = approval.status;
        const originalHistory = [...approval.history];

        try {
            // 顯示處理中提示
            NotificationUtils.show('處理中，請稍候...', 'info');

            // 樂觀更新 (Optimistic Update)
            approval.status = 'rejected';
            approval.history.push({
                action: '審核拒絕',
                user: '當前用戶',
                time: new Date(),
                comment: '快速審核拒絕'
            });
            
            this.applyFilters();
            NotificationUtils.show('已快速拒絕', 'success');
            
            // 後台發送請求
            const response = await apiService.post(`/approvals/${id}/action`, {
                comments: '快速審核拒絕',
                action: 'Rejected'
            });
            
            if (!response.success) {
                throw new Error(response.message || '審核失敗');
            }
            
        } catch (error) {
            console.error('審核失敗:', error);
            
            // 發生錯誤時還原狀態
            approval.status = originalStatus;
            approval.history = originalHistory;
            this.applyFilters();
            
            NotificationUtils.show(error.message || '審核失敗，已還原狀態', 'error');
        }
    }

    async bulkApprove() {
        if (this.selectedItems.size === 0) {
            NotificationUtils.show('請先選擇要審核的項目', 'warning');
            return;
        }

        const selectedIds = Array.from(this.selectedItems);
        const indicator = document.getElementById('processingIndicator');
        if (indicator) indicator.style.display = 'block';
        
        try {
            NotificationUtils.show(`正在批量通過 ${selectedIds.length} 個項目，請稍候...`, 'info');
            
            // 使用 API 服務批量操作
            const response = await apiService.post('/approvals/bulk-approve', {
                ids: selectedIds,
                comment: '批量操作審核通過'
            });
            
            if (response.success) {
                // 更新本地數據
                selectedIds.forEach(id => {
                    const approval = this.approvals.find(item => item.id == id);
                    if (approval && (approval.status === 'pending' || approval.status === 'in_review')) {
                        approval.status = 'approved';
                        approval.history.push({
                            action: '批量審核通過',
                            user: '當前用戶',
                            time: new Date(),
                            comment: '批量操作審核通過'
                        });
                    }
                });
                
                this.selectedItems.clear();
                this.filteredApprovals = this.getFilteredApprovals();
                this.renderApprovals();
                this.updateStats();
                NotificationUtils.show(`成功批量通過 ${selectedIds.length} 個項目`, 'success');
            } else {
                throw new Error(response.message || '批量審核失敗');
            }
            
        } catch (error) {
            console.error('批量審核失敗:', error);
            NotificationUtils.show(error.message || '批量審核失敗', 'error');
        } finally {
            if (indicator) indicator.style.display = 'none';
        }
    }

    async bulkReject() {
        if (this.selectedItems.size === 0) {
            NotificationUtils.show('請先選擇要審核的項目', 'warning');
            return;
        }

        const selectedIds = Array.from(this.selectedItems);
        const indicator = document.getElementById('processingIndicator');
        if (indicator) indicator.style.display = 'block';
        
        try {
            NotificationUtils.show(`正在批量拒絕 ${selectedIds.length} 個項目，請稍候...`, 'info');
            
            // 使用 API 服務批量操作
            const response = await apiService.post('/approvals/bulk-reject', {
                ids: selectedIds,
                comment: '批量操作審核拒絕'
            });
            
            if (response.success) {
                // 更新本地數據
                selectedIds.forEach(id => {
                    const approval = this.approvals.find(item => item.id == id);
                    if (approval && (approval.status === 'pending' || approval.status === 'in_review')) {
                        approval.status = 'rejected';
                        approval.history.push({
                            action: '批量審核拒絕',
                            user: '當前用戶',
                            time: new Date(),
                            comment: '批量操作審核拒絕'
                        });
                    }
                });
                
                this.selectedItems.clear();
                this.filteredApprovals = this.getFilteredApprovals();
                this.renderApprovals();
                this.updateStats();
                NotificationUtils.show(`成功批量拒絕 ${selectedIds.length} 個項目`, 'success');
            } else {
                throw new Error(response.message || '批量審核失敗');
            }
            
        } catch (error) {
            console.error('批量審核失敗:', error);
            NotificationUtils.show(error.message || '批量審核失敗', 'error');
        } finally {
            if (indicator) indicator.style.display = 'none';
        }
    }

    async viewApprovalDetail(id) {
        console.log('viewApprovalDetail called with ID:', id, 'Type:', typeof id);
        
        if (!id) {
            console.error('Invalid approval ID:', id);
            NotificationUtils.show('無效的審核項目 ID', 'error');
            return;
        }

        // 強制轉換 ID 為字串以進行比較
        const strId = String(id).toLowerCase();
        
        // Debug: 檢查本地數據
        console.log(`Searching for ID ${strId} in ${this.approvals.length} items`);
        
        // 先嘗試從本地緩存獲取基本資訊 (不區分大小寫)
        let approval = this.approvals.find(item => String(item.id).toLowerCase() === strId);
        
        console.log('Found local approval:', approval);

        const modal = document.getElementById('approvalDetailModal');
        if (modal) {
            // 如果有本地數據，先顯示基本內容
            if (approval) {
                this.renderApprovalDetailModal(approval);
            } else {
                // 如果找不到本地數據，先清空或顯示載入中
                this.clearDetailModal();
                
                // 設置標題為載入中
                const titleEl = document.getElementById('approvalDetailTitle');
                if (titleEl) titleEl.textContent = '審核詳情 - 載入中...';
            }
            
            modal.classList.add('show');
            // modal.style.display = '';
            // 保存原始 ID (可能是 UUID 格式)
            modal.dataset.approvalId = id; 
            
            // 顯示載入指示
            const timeline = document.getElementById('historyTimeline');
            if (timeline) {
                timeline.innerHTML = '<div class="loading-spinner">載入歷史紀錄中...</div>';
            }
            
            // 顯示內容區塊的載入指示
            const previewContainer = document.getElementById('contentPreview');
            if (previewContainer && (!approval || !approval.content)) {
                previewContainer.innerHTML = '<div class="loading-spinner">載入內容中...</div>';
            }

            try {
                // 從後端獲取完整詳情
                const response = await apiService.get(`/approvals/${id}`);
                console.log('API Response:', response);
                
                if (response.success && response.data && response.data.approval) {
                    const data = response.data;
                    const detail = data.approval;
                    const history = data.history || [];
                    
                    // 從歷史記錄中提取評論
                    const comments = history
                        .filter(h => h.status === 'Comment')
                        .map(h => ({
                            author: h.ReviewerName || '系統',
                            content: h.comments,
                            created_at: h.approved_at || h.created_at
                        }));

                    // 轉換後端數據格式 - 兼容 camelCase (新版 API) 和 PascalCase (舊版 API)
                    const fullApproval = {
                        id: detail.id || detail.ApprovalID,
                        title: detail.title || detail.CampaignName || '未命名項目',
                        type: (detail.type || detail.ObjectType || 'campaign').toLowerCase(),
                        status: (detail.status || detail.Status || 'pending').toLowerCase(),
                        priority: (detail.priority || detail.Priority || 'normal').toLowerCase(),
                        submitter: detail.submitter || detail.SubmitterName || '未知提交者',
                        created_date: detail.created_date || detail.SubmittedAt || new Date(),
                        description: detail.subject || detail.Subject || detail.Description || '無主題',
                        targetAudience: detail.targetAudience || detail.TargetAudience,
                        targetFilter: detail.targetFilter || detail.TargetFilter,
                        categoryNames: detail.categoryNames || detail.CategoryNames,
                        content: (detail.content || detail.HTMLContent || detail.PlainTextContent || '').trim(),
                        comments: comments,
                        history: history.map(h => ({
                            action: this.translateAction(h.status),
                            user: h.ReviewerName || '系統',
                            time: h.approved_at || h.created_at,
                            comment: h.comments || '無評論'
                        }))
                    };
                    
                    // 更新本地緩存
                    const index = this.approvals.findIndex(item => String(item.id).toLowerCase() === strId);
                    if (index !== -1) {
                        this.approvals[index] = { ...this.approvals[index], ...fullApproval };
                    } else {
                        // 如果本地沒有，添加到列表
                        this.approvals.push(fullApproval);
                    }

                    // 更新當前緩存 (Critical for persistence across auto-refreshes)
                    this.currentApproval = fullApproval;

                    // 重新渲染模態框
                    this.renderApprovalDetailModal(fullApproval);
                } else {
                    throw new Error(response.message || '無法獲取詳情 (資料不完整)');
                }
            } catch (error) {
                console.error('Failed to load approval details:', error);
                NotificationUtils.show('無法載入完整詳細資料: ' + error.message, 'error');
                
                if (timeline) {
                    timeline.innerHTML = `<div class="error-message">載入失敗: ${error.message}</div>`;
                }
                
                // 如果完全沒有資料顯示，在概覽頁面也顯示錯誤
                if (!approval) {
                    const descEl = document.getElementById('detailDescription');
                    if (descEl) descEl.textContent = `無法載入資料: ${error.message}`;
                    
                    const titleEl = document.getElementById('approvalDetailTitle');
                    if (titleEl) titleEl.textContent = '審核詳情 - 載入失敗';
                }
            }
            
            // 切換到概覽標籤
            this.switchTab('overview');
        }
    }

    isMockId(id) {
        return typeof id === 'number' || (typeof id === 'string' && /^\d+$/.test(id));
    }

    generateSingleMockApproval(id) {
        const types = ['campaign', 'template', 'content'];
        const type = types[Math.floor(Math.random() * types.length)];
        return {
            id: String(id),
            title: `模擬項目 ${id}`,
            type: type,
            status: 'pending',
            priority: 'medium',
            submitter: '模擬用戶',
            created_date: new Date(),
            description: '這是一個自動生成的模擬項目詳情。',
            targetAudience: 'all',
            targetFilter: null,
            content: this.generateMockContent(type),
            comments: [],
            history: this.generateMockHistory('pending', new Date())
        };
    }

    clearDetailModal() {
        document.getElementById('detailItemName').textContent = '-';
        document.getElementById('detailItemType').textContent = '-';
        document.getElementById('detailSubmitter').textContent = '-';
        document.getElementById('detailSubmitTime').textContent = '-';
        document.getElementById('detailPriority').textContent = '-';
        document.getElementById('detailStatus').textContent = '-';
        document.getElementById('detailDescription').textContent = '-';
        document.getElementById('detailTargetAudience').textContent = '-';
        this.updateContentPreview('');
        this.updateHistoryTimeline([]);
        this.updateCommentsList([]);
    }

    async fetchCategoryNames(ids) {
        try {
            if (!ids || ids.length === 0) return '';
            
            // Filter invalid IDs
            const validIds = ids.filter(id => id !== null && id !== undefined && String(id).trim() !== '');
            if (validIds.length === 0) return '';
            
            console.log('API Request IDs:', validIds);

            // 構建查詢參數
            // Add timestamp to bypass cache and ensure we get specific categories
            const params = {
                ids: validIds.join(','),
                _t: Date.now()
            };
            
            // Ensure ids param is definitely set and not empty
            if (!params.ids) {
                 console.warn('Empty IDs param generated, skipping API call');
                 return '';
            }

            const response = await apiService.get('/categories', params);
            if (response.success && response.data && response.data.categories) {
                let categories = response.data.categories;
                // console.log(`[fetchCategoryNames] Requested ${validIds.length} IDs, got ${categories.length} categories`);
                
                // Safety check: if we requested specific IDs but got way more categories, filter them locally
                // This prevents "all categories" from being shown if backend ignores the ids param
                if (validIds.length > 0 && categories.length > validIds.length + 5) {
                     // console.warn('[fetchCategoryNames] Mismatch detected! Filtering locally.');
                     categories = categories.filter(c => validIds.includes(String(c.id)) || validIds.includes(c.id));
                }

                const names = categories.map(c => {
                    const count = c.subscriberCount !== undefined ? c.subscriberCount : (c.subscriber_count || 0);
                    return `${c.name} (${count})`;
                });
                // 如果數量太多，進行截斷顯示
                if (names.length > 5) {
                    const shown = names.slice(0, 5).join(', ');
                    const remaining = names.length - 5;
                    return `${shown}... 等 ${remaining} 個`;
                }
                return names.join(', ');
            }
        } catch (error) {
            console.error('Fetch category names failed:', error);
        }
        return '';
    }

    renderApprovalDetailModal(approval) {
        if (!approval) return;

        const safeText = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text || '-';
        };

        safeText('approvalDetailTitle', `審核詳情 - ${approval.title || '未命名'}`);
        safeText('detailItemName', approval.title);
        safeText('detailItemType', this.getTypeLabel(approval.type));
        safeText('detailSubmitter', approval.submitter);
        safeText('detailSubmitTime', FormatUtils.formatDate(approval.created_date));
        safeText('detailPriority', this.getPriorityLabel(approval.priority));
        safeText('detailStatus', this.getStatusLabel(approval.status));
        safeText('detailDescription', approval.description);

        const targetAudienceEl = document.getElementById('detailTargetAudience');
        if (targetAudienceEl) {
             targetAudienceEl.innerHTML = ''; // Clear previous content
             
             let audienceText = '-';
             let viewDetailsBtn = null;

             if (approval.targetAudience === 'all') {
                 audienceText = '所有訂閱者';
             } else if (approval.targetAudience === 'filter') {
                 audienceText = `篩選條件: ${approval.targetFilter || '未指定'}`;
             } else if (approval.targetAudience === 'category') {
                  try {
                     let ids = typeof approval.targetFilter === 'string' ? JSON.parse(approval.targetFilter || '[]') : approval.targetFilter;
                     
                     // 處理單一 ID 的情況
                     if (!Array.isArray(ids) && (typeof ids === 'number' || (typeof ids === 'string' && ids.trim() !== ''))) {
                         ids = [ids];
                     }

                     const count = Array.isArray(ids) ? ids.length : 0;
                     if (approval.categoryNames) {
                        audienceText = `分類受眾為: ${approval.categoryNames}`;
                        if (approval.recipient_count_details && approval.recipient_count_details.inactive > 0) {
                             audienceText += ` (活躍: ${approval.recipient_count_details.active}, 總數: ${approval.recipient_count_details.total}, 包含 ${approval.recipient_count_details.inactive} 位無效/已刪除)`;
                        }
                    } else if (count > 0) {
                        // Fallback: 嘗試從後端獲取分類名稱
                        audienceText = `分類受眾為: (載入中...)`;
                        
                        // 非同步獲取名稱並更新 UI
                        this.fetchCategoryNames(ids).then(names => {
                            if (names) {
                                // 檢查 DOM 元素是否仍然存在且需要更新
                                const el = document.getElementById('detailTargetAudience');
                                // 只有當內容包含預設文字時才更新，避免覆蓋
                                if (el && (el.textContent.includes('分類受眾為') || el.textContent === '-')) {
                                    el.innerHTML = '';
                                    let finalText = `分類受眾為: ${names}`;
                                    if (approval.recipient_count_details && approval.recipient_count_details.inactive > 0) {
                                         const d = approval.recipient_count_details;
                                         let details = [];
                                         if (d.unsubscribed > 0) details.push(`${d.unsubscribed} 退訂`);
                                         if (d.bounced > 0) details.push(`${d.bounced} 無效`);
                                         if (d.deleted > 0) details.push(`${d.deleted} 刪除`);
                                         if (details.length === 0) details.push(`${d.inactive} 無效`);
                                         
                                         finalText += ` (活躍: ${d.active}, 總數: ${d.total}, 包含 ${details.join(', ')})`;
                                    }
                                    el.textContent = finalText;
                                    // Update cache
                                    approval.categoryNames = names;
                                }
                            } else {
                                // 如果獲取失敗或沒有名稱 (例如無效 ID)，顯示預設
                                const el = document.getElementById('detailTargetAudience');
                                if (el && (el.textContent === '-' || el.textContent.includes('載入中'))) {
                                    el.textContent = `分類受眾為: (${count} 個分類)`;
                                }
                            }
                        });
                    } else {
                        audienceText = `分類受眾為: (未選擇分類)`;
                    }
                  } catch (e) {
                     audienceText = '指定分類';
                  }
             } else if (approval.targetAudience === 'custom') {
                  try {
                     const filter = typeof approval.targetFilter === 'string' ? JSON.parse(approval.targetFilter) : approval.targetFilter;
                     if (filter && filter.method === 'emails' && Array.isArray(filter.emails)) {
                         const count = filter.emails.length;
                         const preview = filter.emails.slice(0, 3).join(', ');
                         audienceText = `自定義名單 (${count} 個信箱): ${preview}${count > 3 ? '...' : ''}`;
                         
                         if (count > 3) {
                             viewDetailsBtn = document.createElement('button');
                             viewDetailsBtn.className = 'btn btn-sm btn-link p-0 ms-2';
                             viewDetailsBtn.textContent = '查看全部';
                             viewDetailsBtn.onclick = () => this.showAudienceDetailModal(filter.emails);
                         }
                     } else if (filter && filter.method === 'filters') {
                         audienceText = '自定義篩選';
                     } else {
                         audienceText = '自定義名單';
                     }
                  } catch (e) {
                      audienceText = `自定義 (${approval.targetFilter})`;
                  }
             } else if (approval.targetAudience === 'list') {
                  // 這裡可以考慮進一步獲取 List Name，但目前先顯示 ID
                  audienceText = `指定名單ID: ${approval.targetFilter || '未指定'}`;
             } else if (approval.targetAudience) {
                  audienceText = approval.targetAudience;
                  if (approval.targetFilter) {
                      audienceText += ` (${approval.targetFilter})`;
                  }
             }
             
             const textNode = document.createTextNode(audienceText);
             targetAudienceEl.appendChild(textNode);
             if (viewDetailsBtn) {
                 targetAudienceEl.appendChild(viewDetailsBtn);
             }
        }

        // 更新內容預覽
        this.updateContentPreview(approval.content);
        
        // 更新歷史記錄
        this.updateHistoryTimeline(approval.history || []);
        
        // 更新評論
        this.updateCommentsList(approval.comments || []);
    }

    showAudienceDetailModal(list) {
        if (!list || !Array.isArray(list)) return;
        
        const modal = document.getElementById('audienceDetailModal');
        const listEl = document.getElementById('audienceList');
        const totalCountEl = document.getElementById('audienceTotalCount');
        const paginationControls = document.getElementById('audiencePaginationControls');
        const prevBtn = document.getElementById('audiencePrevBtn');
        const nextBtn = document.getElementById('audienceNextBtn');
        const pageInfo = document.getElementById('audiencePageInfo');
        const closeBtn = document.getElementById('closeAudienceDetailBtn');
        const closeXBtn = modal.querySelector('.modal-close');

        if (!modal || !listEl) return;

        // Reset state
        this.audienceList = list;
        this.audiencePage = 1;
        this.audienceLimit = 50; // Show 50 per page in the modal

        const renderPage = () => {
             const start = (this.audiencePage - 1) * this.audienceLimit;
             const end = Math.min(start + this.audienceLimit, this.audienceList.length);
             const pageItems = this.audienceList.slice(start, end);
             
             listEl.innerHTML = pageItems.map(item => `
                 <li class="list-group-item">${item}</li>
             `).join('');

             // Update pagination info
             const totalPages = Math.ceil(this.audienceList.length / this.audienceLimit);
             pageInfo.textContent = `${this.audiencePage} / ${totalPages}`;
             
             prevBtn.disabled = this.audiencePage <= 1;
             nextBtn.disabled = this.audiencePage >= totalPages;

             totalCountEl.textContent = `總共 ${this.audienceList.length} 筆資料`;
             
             // Show pagination controls only if needed
             paginationControls.style.display = totalPages > 1 ? 'flex' : 'none';
        };

        // Bind events
        const closeModal = () => {
             modal.style.display = 'none';
        };

        // Remove old listeners to prevent duplicates (simple way)
        const newPrevBtn = prevBtn.cloneNode(true);
        prevBtn.parentNode.replaceChild(newPrevBtn, prevBtn);
        newPrevBtn.onclick = () => {
             if (this.audiencePage > 1) {
                 this.audiencePage--;
                 renderPage();
             }
        };

        const newNextBtn = nextBtn.cloneNode(true);
        nextBtn.parentNode.replaceChild(newNextBtn, nextBtn);
        newNextBtn.onclick = () => {
             const totalPages = Math.ceil(this.audienceList.length / this.audienceLimit);
             if (this.audiencePage < totalPages) {
                 this.audiencePage++;
                 renderPage();
             }
        };

        const newCloseBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
        newCloseBtn.onclick = closeModal;

        const newCloseXBtn = closeXBtn.cloneNode(true);
        closeXBtn.parentNode.replaceChild(newCloseXBtn, closeXBtn);
        newCloseXBtn.onclick = closeModal;

        // Initial render
        renderPage();
        modal.style.display = 'flex';
    }

    translateAction(action) {
        const map = {
            'Approved': '審核通過',
            'Rejected': '審核拒絕',
            'Returned': '退回修改',
            'Pending': '待審核',
            'In_Review': '審核中',
            'Delegated': '委派',
            'Submitted': '提交審核',
            'Comment': '評論'
        };
        // 嘗試忽略大小寫匹配
        const key = Object.keys(map).find(k => k.toLowerCase() === action.toLowerCase());
        return key ? map[key] : action;
    }

    updateContentPreview(content) {
        const previewContainer = document.getElementById('contentPreview');
        if (!previewContainer) return;

        if (!content) {
            previewContainer.innerHTML = '<div class="no-content" style="padding: 2rem; text-align: center; color: #718096;">暫無內容預覽</div>';
            return;
        }

        // Check if we are in source mode
        const sourceCodeBtn = document.getElementById('sourceCodeBtn');
        if (sourceCodeBtn && sourceCodeBtn.classList.contains('active')) {
             previewContainer.innerHTML = `<pre style="white-space: pre-wrap; word-wrap: break-word; background: #f5f5f5; padding: 1rem; border-radius: 4px; max-height: 500px; overflow: auto;"><code>${content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`;
             return;
        }

        // Use iframe for better preview isolation
        previewContainer.innerHTML = '<iframe id="contentPreviewFrame" style="width: 900px; height: 500px; border: 1px solid #e2e8f0; border-radius: 4px;"></iframe>';
        const iframe = document.getElementById('contentPreviewFrame');
        
        if (iframe) {
            try {
                const doc = iframe.contentDocument || iframe.contentWindow.document;
                doc.open();
                
                let htmlContent = content;
                const lowerContent = content.trim().toLowerCase();
                
                // Simple check if content is already a full page
                if (!lowerContent.startsWith('<!doctype') && !lowerContent.startsWith('<html')) {
                    // Wrap content in a proper HTML structure with default styles
                    htmlContent = `
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <meta charset="utf-8">
                            <style>
                                body { 
                                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; 
                                    padding: 1.5rem; 
                                    margin: 0; 
                                    word-wrap: break-word;
                                    color: #2d3748;
                                    line-height: 1.5;
                                }
                                img { max-width: 100%; height: auto; }
                                pre { white-space: pre-wrap; word-wrap: break-word; background: #f7fafc; padding: 1rem; border-radius: 4px; }
                                table { width: 100%; border-collapse: collapse; }
                                td, th { border: 1px solid #e2e8f0; padding: 0.5rem; }
                            </style>
                        </head>
                        <body>
                            ${content}
                        </body>
                        </html>
                    `;
                }
                
                doc.write(htmlContent);
                doc.close();
                
                // Adjust height after load with improved calculation
                const resizeIframe = () => {
                    try {
                        const bodyHeight = doc.body ? doc.body.scrollHeight : 0;
                        const docHeight = doc.documentElement ? doc.documentElement.scrollHeight : 0;
                        const height = Math.max(bodyHeight, docHeight) + 50;
                        
                        if (height > 50) {
                            iframe.style.height = Math.max(height, 300) + 'px';
                        }
                    } catch (e) {
                        console.warn('Cannot resize iframe', e);
                    }
                };

                // Resize immediately if possible
                if (doc.body) {
                    resizeIframe();
                }

                // Resize again on load (for images)
                iframe.onload = resizeIframe;
                
                // Polling for dynamic content or late loading images
                setTimeout(resizeIframe, 100);
                setTimeout(resizeIframe, 500);
                setTimeout(resizeIframe, 1000);
                
            } catch (e) {
                console.error('Error writing to iframe:', e);
                // Fallback to direct HTML injection if iframe fails
                previewContainer.innerHTML = content;
            }
        }
    }

    updateHistoryTimeline(history) {
        const timeline = document.getElementById('historyTimeline');
        if (!timeline) return;

        if (!history || history.length === 0) {
            timeline.innerHTML = '<div class="no-content" style="padding: 2rem; text-align: center; color: #718096;">暫無歷史記錄</div>';
            return;
        }

        timeline.innerHTML = history.map(item => `
            <div class="history-item">
                <div class="history-header">
                    <span class="history-action">${item.action}</span>
                    <span class="history-time">${FormatUtils.formatDate(item.time)}</span>
                </div>
                <div class="history-user">由 ${item.user}</div>
                <div class="history-comment">${item.comment}</div>
            </div>
        `).join('');
    }

    updateCommentsList(comments) {
        const commentsList = document.getElementById('commentsList');
        if (!commentsList) return;

        if (comments.length === 0) {
            commentsList.innerHTML = '<p style="text-align: center; color: #718096; padding: 2rem;">暫無評論</p>';
        } else {
            commentsList.innerHTML = comments.map(comment => `
                <div class="comment-item">
                    <div class="comment-header">
                        <span class="comment-author">${comment.author}</span>
                        <span class="comment-time">${FormatUtils.formatDate(comment.created_at)}</span>
                    </div>
                    <div class="comment-content">${comment.content}</div>
                </div>
            `).join('');
        }
    }

    switchTab(tabName) {
        // 更新標籤按鈕
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // 更新標籤內容
        document.querySelectorAll('.tab-pane').forEach(pane => {
            pane.classList.remove('active');
        });
        document.getElementById(tabName).classList.add('active');

        // Load data for specific tabs
        if (tabName === 'workflow-definitions') {
            this.loadWorkflows();
        }
    }

    switchPreviewMode(mode) {
        const previewModeBtn = document.getElementById('previewModeBtn');
        const sourceCodeBtn = document.getElementById('sourceCodeBtn');
        
        const modal = document.getElementById('approvalDetailModal');
        const approvalId = modal.dataset.approvalId;
        
        // 優先使用 this.currentApproval，避免因 auto-refresh 導致 content 丟失
        let approval = this.currentApproval;
        
        if (!approval || String(approval.id).toLowerCase() !== String(approvalId).toLowerCase()) {
             // 如果 currentApproval 不匹配，嘗試從列表查找
             approval = this.approvals.find(item => String(item.id).toLowerCase() === String(approvalId).toLowerCase());
        }

        if (mode === 'preview') {
            previewModeBtn.classList.add('active');
            sourceCodeBtn.classList.remove('active');
        } else {
            sourceCodeBtn.classList.add('active');
            previewModeBtn.classList.remove('active');
        }
        
        // 使用 updateContentPreview 統一處理內容渲染（包含 iframe 和原始碼模式）
        if (approval) {
            this.updateContentPreview(approval.content);
        }
    }

    openDecisionModal(decision) {
        const modal = document.getElementById('approvalDecisionModal');
        const titleElement = document.getElementById('decisionModalTitle');
        const revisionInstructions = document.getElementById('revisionInstructions');
        const cannedReasonGroup = document.getElementById('cannedReasonGroup');
        const cannedReasonSelect = document.getElementById('cannedReasonSelect');
        
        if (modal && titleElement) {
            const titles = {
                approve: '審核通過',
                reject: '審核拒絕',
                revision: '需要修改'
            };
            
            titleElement.textContent = titles[decision];
            
            // 顯示/隱藏修改說明欄位
            if (revisionInstructions) {
                revisionInstructions.style.display = decision === 'revision' ? 'block' : 'none';
            }

            // 顯示常用理由選單
            if (cannedReasonGroup && cannedReasonSelect) {
                cannedReasonGroup.style.display = 'block';
                
                // 定義常用理由選項
                const cannedOptions = {
                    approve: [
                        { value: '符合發送標準', text: '符合發送標準' },
                        { value: '內容正確無誤', text: '內容正確無誤' },
                        { value: '排版精美', text: '排版精美' },
                        { value: '主管已確認', text: '主管已確認' }
                    ],
                    reject: [ // Also used for revision
                        { value: '內容資訊有誤', text: '內容資訊有誤' },
                        { value: '排版格式跑版', text: '排版格式跑版' },
                        { value: '連結測試失效', text: '連結測試失效' },
                        { value: '圖片解析度不足', text: '圖片解析度不足' },
                        { value: '不符合品牌規範', text: '不符合品牌規範' }
                    ]
                };

                // Revision uses same reasons as reject
                const options = cannedOptions[decision] || cannedOptions.reject;
                
                // 重新生成選項
                let html = '<option value="">-- 請選擇常用理由 --</option>';
                options.forEach(opt => {
                    html += `<option value="${opt.value}">${opt.text}</option>`;
                });
                html += '<option value="custom">自訂理由</option>';
                
                cannedReasonSelect.innerHTML = html;
                cannedReasonSelect.value = '';
            }
            
            modal.classList.add('show');
            modal.dataset.decision = decision;
        }
    }

    async confirmDecision() {
        const modal = document.getElementById('approvalDecisionModal');
        // Ensure decision is defined from modal dataset
        const decision = modal.dataset.decision;
        
        if (!decision) {
            console.error('Decision is undefined in confirmDecision');
            NotificationUtils.show('系統錯誤：無法取得審核決定類型', 'error');
            return;
        }

        const reason = document.getElementById('decisionReason').value.trim();
        const revisionNotes = document.getElementById('revisionNotes').value.trim();
        
        // 驗證輸入
        const validation = this.validateDecisionInput(decision, reason, revisionNotes);
        if (!validation.isValid) {
            NotificationUtils.show(validation.message, 'error');
            return;
        }

        // 防止重複點擊：禁用按鈕並顯示 Loading
        const confirmBtn = document.getElementById('confirmDecisionBtn');
        const originalBtnText = confirmBtn ? confirmBtn.innerHTML : '';
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 處理中...';
        }

        // Show main processing indicator
        const indicator = document.getElementById('processingIndicator');
        if (indicator) indicator.style.display = 'block';

        const approvalDetailModal = document.getElementById('approvalDetailModal');
        const approvalId = approvalDetailModal ? approvalDetailModal.dataset.approvalId : null;

        if (!approvalId) {
            console.error('Cannot find approval ID');
            NotificationUtils.show('系統錯誤：無法取得審核項目 ID', 'error');
            if (indicator) indicator.style.display = 'none';
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = originalBtnText;
            }
            return;
        }

        try {
            NotificationUtils.show('處理中，請稍候...', 'info');
            
            // Map frontend decision to backend action
            const actionMap = {
                'approve': 'Approved',
                'reject': 'Rejected',
                'revision': 'Returned'
            };

            // Combine reason and revision notes
            const fullComment = reason + (revisionNotes ? `\n修改說明：${revisionNotes}` : '');

            // 使用 API 服務
            const response = await apiService.post(`/approvals/${approvalId}/action`, {
                action: actionMap[decision],
                comments: fullComment
            });
            
            if (response.success) {
                console.log(`審核成功: ID=${approvalId}, 決定=${decision}`);
                
                // 清除 API 緩存以確保獲取最新數據
                if (window.apiService && typeof window.apiService.clearCache === 'function') {
                    window.apiService.clearCache();
                }

                // 更新本地數據
                // 使用弱型別比較 (==) 以容許字串與數字的 ID 差異
                const approval = this.approvals.find(item => item.id == approvalId);
                if (approval) {
                    console.log('找到本地項目，更新狀態:', decision);
                    approval.status = decision;
                    approval.history.push({
                        action: decision === 'approve' ? '審核通過' : decision === 'reject' ? '審核拒絕' : '需要修改',
                        user: '當前用戶',
                        time: new Date(),
                        comment: reason + (revisionNotes ? `\n修改說明：${revisionNotes}` : '')
                    });
                } else {
                    console.warn('未找到本地項目:', approvalId);
                }
                
                this.closeModal();
                // 重新過濾以移除不再符合當前視圖（如待處理）的項目
                this.filteredApprovals = this.getFilteredApprovals();
                this.renderApprovals();
                this.updateStats();
                
                const messages = {
                    approve: '審核通過成功',
                    reject: '審核拒絕成功',
                    revision: '已標記為需要修改',
                    emergency: '緊急放行成功'
                };
                NotificationUtils.show(messages[decision], 'success');

                // 延遲後強制刷新列表，以確保與後端狀態同步 (例如進入下一階段)
                setTimeout(() => {
                    this.loadApprovals(true);
                }, 1000);
            } else {
                throw new Error(response.message || '處理審核決定失敗');
            }
            
        } catch (error) {
            // 重新獲取 approvalId 以防閉包變數失效 (雖然不應發生，但為了安全)
            const currentModal = document.getElementById('approvalDetailModal');
            const safeApprovalId = approvalId || (currentModal ? currentModal.dataset.approvalId : null);

            // 特別處理「重複操作/狀態已變更」的錯誤
            if (error.message && (
                error.message.includes('已被處理') || 
                error.message.includes('找不到') || 
                error.message.includes('資源不存在') ||
                error.message.includes('重複提交') ||
                error.message.includes('已經審核過')
            )) {
                console.warn('狀態同步提示:', error.message);
                NotificationUtils.show('此審核項目狀態已更新，正在同步最新數據...', 'info');
                
                this.closeModal();
                
                // 清除 API 緩存以確保獲取最新數據
                if (window.apiService && typeof window.apiService.clearCache === 'function') {
                    window.apiService.clearCache();
                }

                // 優化使用者體驗：先手動更新本地狀態，讓項目立即消失或更新
                // 使用弱型別比較 (==) 以容許字串與數字的 ID 差異
                const approval = this.approvals.find(item => item.id == safeApprovalId);
                if (approval) {
                    console.log('手動更新本地項目狀態以提供即時回饋:', safeApprovalId);
                    // 根據當前操作猜測狀態，或者直接設為 'approved' (最常見情況)
                    // 如果是在 'active' (待處理) 列表，改為 'approved' 會讓它消失
                    approval.status = decision === 'reject' ? 'rejected' : 'approved';
                    
                    // 重新渲染以立即反映變更 (例如從列表中移除)
                    this.filteredApprovals = this.getFilteredApprovals();
                    this.renderApprovals();
                    this.updateStats();
                }
                
                // 強制刷新列表 (略過緩存)
                setTimeout(() => {
                    this.loadApprovals(true);
                }, 300); 
            } else {
                console.error('處理審核決定失敗:', error);
                NotificationUtils.show(error.message || '處理審核決定失敗', 'error');
            }
        } finally {
            if (indicator) indicator.style.display = 'none';
            // 無論成功或失敗，如果按鈕還存在（例如 Modal 未關閉或下次打開），都應該還原狀態
            // 但如果 Modal 已經關閉，還原狀態也是安全的，為下次打開做準備
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = originalBtnText;
            }
        }
    }

    validateDecisionInput(decision, reason, revisionNotes) {
        if (!reason) {
            return { isValid: false, message: '請輸入審核理由' };
        }
        
        if (decision === 'revision' && !revisionNotes) {
            return { isValid: false, message: '請輸入修改說明' };
        }
        
        return { isValid: true };
    }

    async addComment() {
        const textarea = document.getElementById('newComment');
        const content = textarea.value.trim();
        
        if (!content) {
            NotificationUtils.show('請輸入評論內容', 'error');
            return;
        }
        
        if (content.length < 2) {
            NotificationUtils.show('評論內容至少需要2個字符', 'error');
            return;
        }

        try {
            NotificationUtils.show('正在添加評論...', 'info');
            
            const modal = document.getElementById('approvalDetailModal');
            // 不要強制轉換為整數，以支持 UUID
            const approvalId = modal.dataset.approvalId;
            
            // 檢查是否為模擬數據
            const isMockId = /^\d+$/.test(String(approvalId));
            
            if (isMockId) {
                console.log('Mock data detected in addComment, skipping API call');
                // 模擬延遲
                await new Promise(resolve => setTimeout(resolve, 300));
                
                // 模擬成功響應
                const approval = this.approvals.find(item => String(item.id) === String(approvalId));
                if (approval) {
                    const newComment = {
                        id: approval.comments.length + 1,
                        author: '當前用戶',
                        content: content,
                        created_at: new Date()
                    };
                    
                    approval.comments.push(newComment);
                    this.updateCommentsList(approval.comments);
                    
                    // 同步更新歷史記錄
                    approval.history.push({
                        action: '評論',
                        user: '當前用戶',
                        time: new Date(),
                        comment: content
                    });
                    this.updateHistoryTimeline(approval.history);

                    textarea.value = '';
                    NotificationUtils.show('評論添加成功', 'success');
                }
                return;
            }

            // 使用 API 服務
            const response = await apiService.post(`/approvals/${approvalId}/comments`, {
                content: content
            });
            
            if (response.success) {
                // 更新本地數據
                const approval = this.approvals.find(item => String(item.id) === String(approvalId));
                if (approval) {
                    const newComment = {
                        id: response.data.id || (approval.comments.length + 1),
                        author: '當前用戶',
                        content: content,
                        created_at: new Date()
                    };
                    
                    approval.comments.push(newComment);
                    this.updateCommentsList(approval.comments);
                    
                    // 同步更新歷史記錄
                    approval.history.push({
                        action: '評論',
                        user: '當前用戶',
                        time: new Date(),
                        comment: content
                    });
                    this.updateHistoryTimeline(approval.history);

                    textarea.value = '';
                    NotificationUtils.show('評論添加成功', 'success');
                }
            } else {
                throw new Error(response.message || '添加評論失敗');
            }
            
        } catch (error) {
            console.error('添加評論失敗:', error);
            NotificationUtils.show(error.message || '添加評論失敗', 'error');
        }
    }



    closeModal() {
        if (this.modals) {
            this.modals.closeAll();
        } else {
            // 後備方案
            const modals = document.querySelectorAll('.modal');
            modals.forEach(modal => {
                modal.classList.remove('show');
            });
        }
        
        // 清空表單數據
        this.clearFormData();
    }



    destroy() {
        // 清理事件監聽器
        if (this.dataTable) {
            this.dataTable.destroy();
        }
        
        if (this.modals) {
            this.modals.destroy();
        }
        
        // 清理定時器
        if (this.filterTimeout) {
            clearTimeout(this.filterTimeout);
        }
        
        // 清理數據
        this.approvals = [];
        this.filteredApprovals = [];
        this.selectedItems.clear();
        
        console.log('ApprovalsManager destroyed');
    }
}

// 初始化審核管理器
// Make it global so inline event handlers can access it
window.approvalsManager = null;

document.addEventListener('DOMContentLoaded', () => {
    // Prevent multiple initializations
    if (!window.approvalsManager) {
        window.approvalsManager = new ApprovalsManager();
    }
});