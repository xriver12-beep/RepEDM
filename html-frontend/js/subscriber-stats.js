class SubscriberStatsManager {
    constructor() {
        this.isLoading = false;
        this.geoPagination = { page: 1, limit: 10, totalPages: 1 };
        this.unsubPagination = { page: 1, limit: 20, totalPages: 1 };
        this.unsubSearch = '';
        this.chartData = { geo: [] };
        
        this.init();
    }

    async init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initializeApp());
        } else {
            this.initializeApp();
        }
    }

    initializeApp() {
        this.setupTabs(); // Initialize tabs
        this.setupEventListeners();
        this.fetchGeoData(1);
        this.fetchUnsubscribedReport();
    }

    setupEventListeners() {
        // 側邊欄切換
        const sidebarToggle = document.getElementById('sidebarToggle');
        const sidebar = document.getElementById('sidebar');
        if (sidebarToggle && sidebar) {
            sidebarToggle.addEventListener('click', () => {
                sidebar.classList.toggle('active');
            });
        }

        const mobileMenuBtn = document.getElementById('mobileMenuBtn');
        if (mobileMenuBtn) {
            mobileMenuBtn.addEventListener('click', () => {
                sidebar.classList.toggle('active');
            });
        }

        const refreshBtn = document.getElementById('refreshReportBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.fetchUnsubscribedReport(1);
            });
        }

        const searchBtn = document.getElementById('unsubSearchBtn');
        const searchInput = document.getElementById('unsubSearchInput');

        if (searchBtn && searchInput) {
            const performSearch = () => {
                this.unsubSearch = searchInput.value.trim();
                this.fetchUnsubscribedReport(1);
            };

            searchBtn.addEventListener('click', performSearch);
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') performSearch();
            });
        }
    }

    setupTabs() {
        const tabs = document.querySelectorAll('.nav-item[data-tab]');
        const contents = document.querySelectorAll('.tab-content');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // Remove active class from all tabs
                tabs.forEach(t => t.classList.remove('active'));
                // Add active class to clicked tab
                tab.classList.add('active');

                // Hide all contents
                contents.forEach(c => c.classList.remove('active'));
                
                // Show target content
                const targetId = tab.getAttribute('data-tab');
                const targetContent = document.getElementById(targetId);
                if (targetContent) {
                    targetContent.classList.add('active');
                }
            });
        });
    }

    async fetchUnsubscribedReport(page = 1) {
        const tbody = document.getElementById('unsubscribedReportBody');
        if (!tbody) return;

        try {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">載入中...</td></tr>';
            
            const response = await window.apiClient.get('/subscribers/unsubscribed-report', {
                page: page,
                limit: this.unsubPagination.limit,
                search: this.unsubSearch
            });
            
            if (response.success && response.data && response.data.length > 0) {
                this.unsubPagination = response.pagination;

                tbody.innerHTML = response.data.map(item => {
                    const dateObj = new Date(item.UnsubscribedAt);
                    const formattedDate = dateObj.toLocaleString('zh-TW', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                    
                    // Determine source display
                    const isManual = !item.campaign_name;
                    const sourceHtml = item.campaign_name || (isManual ? '<span class="status-badge status-draft">手動/管理員</span>' : '<span class="text-muted">-</span>');

                    // Determine status display
                    let statusHtml = '<span class="badge bg-secondary">未知</span>';
                    if (item.status === 'unsubscribed') {
                        statusHtml = '<span class="badge bg-warning text-dark">已取消訂閱</span>';
                    } else if (item.status === 'deleted') {
                        statusHtml = '<span class="badge bg-danger">已軟刪除</span>';
                    } else {
                        statusHtml = `<span class="badge bg-secondary">${item.status || '-'}</span>`;
                    }

                    return `
                    <tr>
                        <td class="col-date">${formattedDate}</td>
                        <td class="col-email">${item.email || '<span class="text-muted">已刪除用戶</span>'}</td>
                        <td>${(item.first_name || '') + ' ' + (item.last_name || '')}</td>
                        <td>${statusHtml}</td>
                        <td>${sourceHtml}</td>
                        <td class="text-muted font-monospace">${item.IPAddress || '-'}</td>
                    </tr>
                `}).join('');

                this.renderUnsubPagination();
            } else {
                tbody.innerHTML = '<tr><td colspan="6" class="empty-state">暫無退訂紀錄</td></tr>';
                this.unsubPagination = { ...this.unsubPagination, page: 1, total: 0, totalPages: 1 };
                this.renderUnsubPagination();
            }
        } catch (error) {
            console.error('Fetch unsubscribed report failed:', error);
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">載入失敗</td></tr>';
        }
    }

    renderUnsubPagination() {
        const paginationList = document.getElementById('unsubPagination');
        const infoDiv = document.getElementById('unsubPaginationInfo');
        
        if (!paginationList || !infoDiv) return;

        const { page, totalPages, total } = this.unsubPagination;

        // Update Info
        infoDiv.textContent = `共 ${total} 筆資料，第 ${page} / ${totalPages} 頁`;

        // Generate Pagination HTML
        let html = '';

        // Previous
        html += `<li class="page-item ${page <= 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" data-page="${page - 1}" aria-label="Previous">
                <span aria-hidden="true">&laquo;</span>
            </a>
        </li>`;

        // Page Numbers
        let startPage = Math.max(1, page - 2);
        let endPage = Math.min(totalPages, page + 2);

        if (startPage > 1) {
             html += `<li class="page-item"><a class="page-link" href="#" data-page="1">1</a></li>`;
             if (startPage > 2) html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        }

        for (let i = startPage; i <= endPage; i++) {
            html += `<li class="page-item ${i === page ? 'active' : ''}">
                <a class="page-link" href="#" data-page="${i}">${i}</a>
            </li>`;
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
            html += `<li class="page-item"><a class="page-link" href="#" data-page="${totalPages}">${totalPages}</a></li>`;
        }

        // Next
        html += `<li class="page-item ${page >= totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" data-page="${page + 1}" aria-label="Next">
                <span aria-hidden="true">&raquo;</span>
            </a>
        </li>`;

        paginationList.innerHTML = html;

        // Add Event Listeners
        paginationList.querySelectorAll('a.page-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetPage = parseInt(e.currentTarget.dataset.page);
                if (targetPage && targetPage !== page && targetPage >= 1 && targetPage <= totalPages) {
                    this.fetchUnsubscribedReport(targetPage);
                }
            });
        });
    }

    async fetchGeoData(page = 1) {
        // Ensure page is a number
        const pageNum = parseInt(page);
        console.log('[SubscriberStats] Fetching geo data for page:', pageNum);
        
        try {
            const container = DOMUtils.find('#geoChart');
            if (container) {
                container.innerHTML = '<div class="d-flex justify-content-center align-items-center h-100"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div></div>';
            }

            // 使用原始的訂閱者統計 API (全體訂閱者)
            const response = await window.apiClient.get('/analytics/subscribers/geo', { 
                _t: Date.now(),
                page: pageNum,
                limit: 60 // 增加每頁顯示數量以支援更多列
            });
            
            console.log('[SubscriberStats] API Response:', response);

            if (response.data) {
                this.chartData.geo = response.data;
                this.geoPagination = response.pagination;
                console.log('[SubscriberStats] Updated Pagination:', this.geoPagination);
                this.renderGeoStats();
            }
        } catch (error) {
            console.error('Fetch geo data failed:', error);
            NotificationUtils.show('載入網域數據失敗', 'error');
            const container = DOMUtils.find('#geoChart');
            if (container) {
                container.innerHTML = '<div class="text-center text-danger p-4">載入失敗</div>';
            }
        }
    }

    renderGeoStats() {
        const container = DOMUtils.find('#geoChart');
        if (!container) return;

        let html = '';
        const data = this.chartData.geo || [];
        const pagination = this.geoPagination || { page: 1, totalPages: 1 };
        
        if (data.length === 0) {
            html = '<div class="text-center text-muted p-4">暫無數據</div>';
        } else {
            // Render list
            data.forEach(item => {
                html += `
                    <div class="geo-item">
                        <div class="d-flex align-items-center mb-1">
                            <span class="geo-country" title="${item.domain}">${item.domain || item.country || 'Unknown'}</span>
                            <span class="text-muted small ms-2">(${item.count})</span>
                        </div>
                    </div>
                `;
            });

            // Pagination Controls
            if (pagination.totalPages > 1) {
                html += `
                    <div class="d-flex justify-content-between align-items-center mt-3 pt-2 border-top" style="grid-column: 1 / -1;">
                        <button class="btn btn-sm btn-outline-secondary geo-prev-btn" ${pagination.page <= 1 ? 'disabled' : ''}>
                            <i class="fas fa-chevron-left"></i>
                        </button>
                        <span class="text-muted small">第 ${pagination.page} / ${pagination.totalPages} 頁</span>
                        <button class="btn btn-sm btn-outline-secondary geo-next-btn" ${pagination.page >= pagination.totalPages ? 'disabled' : ''}>
                            <i class="fas fa-chevron-right"></i>
                        </button>
                    </div>
                `;
            }
        }
        
        container.innerHTML = html;

        // Bind events
        const prevBtn = container.querySelector('.geo-prev-btn');
        const nextBtn = container.querySelector('.geo-next-btn');

        if (prevBtn) {
            prevBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const currentPage = parseInt(pagination.page);
                console.log('[SubscriberStats] Prev clicked. Current:', currentPage);
                if (currentPage > 1) {
                    this.fetchGeoData(currentPage - 1);
                }
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const currentPage = parseInt(pagination.page);
                const totalPages = parseInt(pagination.totalPages);
                console.log('[SubscriberStats] Next clicked. Current:', currentPage, 'Total:', totalPages);
                
                if (currentPage < totalPages) {
                    this.fetchGeoData(currentPage + 1);
                }
            });
        }
    }
}

// 初始化管理器
const subscriberStatsManager = new SubscriberStatsManager();
