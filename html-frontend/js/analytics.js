// 分析頁面 JavaScript

/**
 * Analytics Manager - 分析管理器
 * 整合新的工具和組件系統，提供數據分析和報告功能
 */
class AnalyticsManager {
    constructor() {
        // Expose instance globally for onclick handlers
        window.analyticsManager = this;
        
        // 優先使用 adminAuth (如果存在)，否則使用 userAuth
        this.userAuth = window.adminAuth || window.userAuth;
        this.campaigns = [];
        this.analytics = {};
        this.charts = {};
        this.currentPage = 1;
        this.itemsPerPage = 10;
        this.sortBy = 'sent_date';
        this.dateRange = '30d';
        this.filterCountry = '';
        this.filterCity = '';
        this.isLoading = false;
        
        this.init();
    }

    async init() {
        try {
            PerformanceUtils.startTiming('analytics-init');
            
            // 初始化組件
            await this.initializeComponents();
            
            // 設置事件監聽器
            this.setupEventListeners();
            this.setupUserMenu();
            this.updateUserProfile();
            
            // 載入數據
            await this.loadData();
            
            // 初始化圖表
            this.initializeCharts();
            
            // 設置自動刷新
            this.setupAutoRefresh();
            
            PerformanceUtils.endTiming('analytics-init');
            NotificationUtils.show('分析頁面載入完成', 'success');
            
        } catch (error) {
            console.error('Analytics initialization failed:', error);
            NotificationUtils.show('分析頁面載入失敗', 'error');
        }
    }

    async initializeComponents() {
        // 初始化模態框組件
        const modalContent = `
            <div class="campaign-detail-info mb-4">
                <h4 id="detailCampaignName" class="mb-2"></h4>
                <div class="text-muted small">發送時間: <span id="modalCampaignDate"></span></div>
            </div>
            
            <div class="row mb-4 row-cols-5">
                <div class="col">
                    <div class="stat-card p-3 bg-light rounded text-center">
                        <div class="text-muted mb-1">發送數</div>
                        <div class="h4 mb-0" id="detailSent">0</div>
                    </div>
                </div>
                <div class="col">
                    <div class="stat-card p-3 bg-light rounded text-center">
                        <div class="text-muted mb-1">頻率控管</div>
                        <div class="h4 mb-0 text-warning" id="detailCapped">0</div>
                    </div>
                </div>
                <div class="col">
                    <div class="stat-card p-3 bg-light rounded text-center">
                        <div class="text-muted mb-1">開信數</div>
                        <div class="h4 mb-0" id="detailOpens">0</div>
                    </div>
                </div>
                <div class="col">
                    <div class="stat-card p-3 bg-light rounded text-center">
                        <div class="text-muted mb-1">點擊數</div>
                        <div class="h4 mb-0" id="detailClicks">0</div>
                    </div>
                </div>
                <div class="col">
                    <div class="stat-card p-3 bg-light rounded text-center">
                        <div class="text-muted mb-1">退訂數</div>
                        <div class="h4 mb-0" id="detailUnsubscribes">0</div>
                    </div>
                </div>
            </div>

            <div class="detail-section mb-4">
                <h5 class="mb-3">連結點擊追蹤</h5>
                <div class="table-responsive">
                    <table class="table table-hover">
                        <thead>
                            <tr>
                                <th>連結 URL</th>
                                <th>點擊數</th>
                                <th>點擊佔比</th>
                            </tr>
                        </thead>
                        <tbody id="linksTableBody">
                            <!-- 動態填充 -->
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="detail-section">
                <h5 class="mb-3">網域發送統計</h5>
                <div class="table-responsive" style="max-height: 300px; overflow-y: auto;">
                    <table class="table table-hover">
                        <thead>
                            <tr>
                                <th>網域</th>
                                <th>總發送</th>
                                <th>成功</th>
                                <th>失敗</th>
                                <th>頻率控管</th>
                                <th>成功率</th>
                                <th>失敗率</th>
                            </tr>
                        </thead>
                        <tbody id="domainsTableBody">
                            <!-- 動態填充 -->
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="detail-section">
                <h5 class="mb-3">失敗原因分析</h5>
                <div class="table-responsive" style="max-height: 300px; overflow-y: auto;">
                    <table class="table table-hover">
                        <thead>
                            <tr>
                                <th>網域</th>
                                <th>失敗原因</th>
                                <th>數量</th>
                            </tr>
                        </thead>
                        <tbody id="failuresTableBody">
                            <!-- 動態填充 -->
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        this.detailModal = ComponentRegistry.create('Modal', {
            id: 'campaignDetailModal',
            title: '活動詳情',
            size: 'large',
            content: modalContent
        });

        // 初始化圖表組件
        this.chartComponents = {
            trend: ComponentRegistry.create('Chart', {
                container: '#trendChart',
                type: 'line'
            }),
            device: ComponentRegistry.create('Chart', {
                container: '#deviceChart',
                type: 'pie'
            }),
            time: ComponentRegistry.create('Chart', {
                container: '#timeChart',
                type: 'bar'
            })
        };
    }

    updateUserProfile() {
        if (!this.userAuth) return;
        const user = this.userAuth.getUser();
        if (user) {
            const userNameElements = document.querySelectorAll('.user-name, .user-name-large');
            const userEmailElements = document.querySelectorAll('.user-email');
            const userRoleElements = document.querySelectorAll('.user-role');
            const userAvatarElements = document.querySelectorAll('.user-avatar, .user-avatar-large');
            
            userNameElements.forEach(el => el.textContent = user.displayName || user.username || user.name || 'User');
            userEmailElements.forEach(el => el.textContent = user.email || '');
            userRoleElements.forEach(el => el.textContent = user.role || 'User');
            
            // Initial
            const initial = (user.displayName || user.username || user.name || 'U').charAt(0).toUpperCase();
            userAvatarElements.forEach(el => el.textContent = initial);
        }
    }

    setupUserMenu() {
        const userMenuBtn = document.getElementById('userMenuBtn');
        const userDropdown = document.getElementById('userDropdown');
        const logoutBtn = document.getElementById('logoutBtn');

        if (userMenuBtn && userDropdown) {
            userMenuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                userDropdown.classList.toggle('show');
            });

            document.addEventListener('click', (e) => {
                if (!userMenuBtn.contains(e.target) && !userDropdown.contains(e.target)) {
                    userDropdown.classList.remove('show');
                }
            });
        }

        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (this.userAuth && typeof this.userAuth.clearAuth === 'function') {
                    this.userAuth.clearAuth();
                }
                window.location.href = 'login.html';
            });
        }
        
        // Mobile Menu
        const mobileMenuBtn = document.getElementById('mobileMenuBtn');
        const sidebar = document.getElementById('sidebar');
        
        if (mobileMenuBtn && sidebar) {
             mobileMenuBtn.addEventListener('click', () => {
                sidebar.classList.toggle('active');
            });
            
            // Close sidebar when clicking outside on mobile
            document.addEventListener('click', (e) => {
                if (window.innerWidth <= 768) {
                    if (!sidebar.contains(e.target) && !mobileMenuBtn.contains(e.target) && sidebar.classList.contains('active')) {
                        sidebar.classList.remove('active');
                    }
                }
            });
        }
    }

    setupEventListeners() {
        // 日期範圍選擇
        EventUtils.delegate(document, '#dateRange', 'change', (e) => {
            if (e.target.value === 'custom') {
                // Open Custom Date Modal
                const modal = document.getElementById('datePickerModal');
                if (modal) {
                    modal.classList.add('active');
                    // Set default dates (today)
                    const today = new Date().toISOString().split('T')[0];
                    document.getElementById('startDate').value = today;
                    document.getElementById('endDate').value = today;
                }
            } else {
                this.dateRange = e.target.value;
                this.loadData();
            }
        });

        // Custom Date Apply
        const applyCustomDateBtn = document.getElementById('applyCustomDate');
        if (applyCustomDateBtn) {
            applyCustomDateBtn.addEventListener('click', () => {
                const startDate = document.getElementById('startDate').value;
                const endDate = document.getElementById('endDate').value;
                
                if (startDate && endDate) {
                    if (new Date(startDate) > new Date(endDate)) {
                        NotificationUtils.show('開始日期不能晚於結束日期', 'error');
                        return;
                    }
                    
                    this.dateRange = 'custom';
                    this.customStartDate = startDate;
                    this.customEndDate = endDate;
                    
                    // Close modal
                    document.getElementById('datePickerModal').classList.remove('active');
                    
                    // Load data with custom range
                    this.loadData();
                } else {
                    NotificationUtils.show('請選擇開始與結束日期', 'warning');
                }
            });
        }

        // 營業單位與城市篩選
        const filterCountryInput = document.getElementById('filterCountry');
        if (filterCountryInput) {
            filterCountryInput.addEventListener('change', (e) => {
                this.filterCountry = e.target.value.trim();
                this.loadData();
            });
        }

        const filterCityInput = document.getElementById('filterCity');
        if (filterCityInput) {
            filterCityInput.addEventListener('change', (e) => {
                this.filterCity = e.target.value.trim();
                this.loadData();
            });
        }

        // 刷新按鈕
        EventUtils.on('#refreshBtn', 'click', () => {
            const icon = document.querySelector('#refreshBtn i');
            if (icon) icon.classList.add('fa-spin');
            this.loadData(true).finally(() => {
                if (icon) icon.classList.remove('fa-spin');
            });
        });

        // 匯出報告
        EventUtils.on('#exportReportBtn', 'click', () => this.exportReport());

        // 圖表控制
        EventUtils.delegate(document, '.chart-btn', 'click', (e) => {
            const metric = e.target.dataset.metric;
            this.switchChartMetric(metric);
        });

        // 排序
        EventUtils.delegate(document, '.sortable', 'click', (e) => {
            const sortBy = e.target.dataset.sort;
            this.sortBy = sortBy;
            this.renderCampaignPerformance();
        });

        // 分頁
        EventUtils.delegate(document, '.page-number', 'click', (e) => {
            const page = parseInt(e.target.dataset.page);
            this.goToPage(page);
        });

        EventUtils.on('#performancePrevPage', 'click', () => {
            if (this.currentPage > 1) {
                this.goToPage(this.currentPage - 1);
            }
        });

        EventUtils.on('#performanceNextPage', 'click', () => {
            const totalPages = Math.ceil(this.campaigns.length / this.itemsPerPage);
            if (this.currentPage < totalPages) {
                this.goToPage(this.currentPage + 1);
            }
        });

        // 模態框
        EventUtils.delegate(document, '.close-modal', 'click', () => this.closeModal());
        EventUtils.delegate(document, '.modal-overlay', 'click', (e) => {
            if (e.target.classList.contains('modal-overlay')) {
                this.closeModal();
            }
        });

        // 標籤切換
        EventUtils.delegate(document, '.tab-btn', 'click', (e) => {
            const tabName = e.target.dataset.tab;
            this.switchTab(tabName);
        });

        // 詳細報告
        EventUtils.delegate(document, '[data-report]', 'click', (e) => {
            const reportType = e.target.dataset.report;
            this.openDetailedReport(reportType);
        });

        // 列表操作按鈕
        EventUtils.delegate(document, '[data-action="view-detail"]', 'click', (e) => {
            const btn = e.target.closest('[data-id]');
            if (btn) {
                const id = parseInt(btn.dataset.id);
                this.viewCampaignDetail(id);
            }
        });

        EventUtils.delegate(document, '[data-action="export-report"]', 'click', (e) => {
            const btn = e.target.closest('[data-id]');
            if (btn) {
                const id = parseInt(btn.dataset.id);
                this.exportCampaignReport(id);
            }
        });

        // 鍵盤快捷鍵
        EventUtils.on(document, 'keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 'e':
                        e.preventDefault();
                        this.exportReport();
                        break;
                    case 'r':
                        e.preventDefault();
                        this.loadData(true);
                        break;
                }
            }
            
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });
    }

    async loadData(forceRefresh = false) {
        if (this.isLoading) return;
        
        try {
            this.isLoading = true;
            PerformanceUtils.startTiming('analytics-load');
            
            // 檢查緩存
            const cacheKey = `analytics_v2_${this.dateRange}_${this.filterCountry || ''}_${this.filterCity || ''}`;
            const cachedData = StorageUtils.getItem(cacheKey);
            
            if (!forceRefresh && cachedData && !this.shouldRefreshCache(cachedData.timestamp)) {
                this.campaigns = cachedData.campaigns;
                this.analytics = cachedData.analytics;
                this.chartData = cachedData.chartData;
            } else {
                // 從 API 載入數據
                const data = await this.fetchAnalyticsData();
                this.campaigns = data.campaigns;
                this.analytics = data.analytics;
                this.chartData = {
                    trend: data.trend,
                    devices: data.devices,
                    time: data.time,
                    geo: data.geo
                };
                
                // 緩存數據
                StorageUtils.setItem(cacheKey, {
                    campaigns: this.campaigns,
                    analytics: this.analytics,
                    chartData: this.chartData,
                    timestamp: Date.now()
                });
            }
            
            // 更新 UI
            this.updateAnalytics();
            this.renderCampaignPerformance();
            this.updateCharts();
            
            PerformanceUtils.endTiming('analytics-load');
            
        } catch (error) {
            console.error('載入分析數據失敗:', error);
            NotificationUtils.show('載入分析數據失敗', 'error');
        } finally {
            this.isLoading = false;
        }
    }

    shouldRefreshCache(timestamp) {
        const cacheAge = Date.now() - timestamp;
        return cacheAge > 5 * 60 * 1000; // 5分鐘
    }

    async fetchAnalyticsData() {
        try {
            // 使用 apiClient 處理認證和 Base URL
            if (!window.apiClient.getAuthToken()) {
                console.warn('未登入，使用空數據');
                return { campaigns: [], analytics: {}, trend: {}, devices: [], time: [] };
            }

            // 輔助函數：處理可選請求
            const fetchOptional = async (promise, fallback) => {
                try {
                    return await promise;
                } catch (error) {
                    console.warn('Optional fetch failed:', error);
                    return fallback;
                }
            };

            // 並行請求所有數據
            let commonParams = { days: this.dateRange === '30' ? 30 : (this.dateRange === '90' ? 90 : 7), _t: Date.now() };
            if (this.dateRange === 'custom') {
                commonParams = { 
                    startDate: this.customStartDate, 
                    endDate: this.customEndDate,
                    _t: Date.now()
                };
            }

            // Add filters to commonParams
            if (this.filterCountry) commonParams.country = this.filterCountry;
            if (this.filterCity) commonParams.city = this.filterCity;

            const campaignsParams = { limit: 5, _t: Date.now(), ...commonParams };
            // Note: campaigns endpoint uses specific params, but we pass commonParams which includes country/city

            const [dashboardData, campaignsData, trendData, devicesData, timeData, geoData] = await Promise.all([
                fetchOptional(window.apiClient.get('/analytics/dashboard', { ...commonParams, _t: Date.now() }), { totalSent: 0, openRate: 0, clickRate: 0 }),
                fetchOptional(window.apiClient.get('/campaigns', campaignsParams), []),
                fetchOptional(window.apiClient.get('/analytics/performance/trend', commonParams), { data: { sent: [], opens: [], clicks: [] } }),
                fetchOptional(window.apiClient.get('/analytics/campaigns/devices', commonParams), { data: { devices: [] } }),
                fetchOptional(window.apiClient.get('/analytics/optimal-send-time', commonParams), { data: [] }),
                // 改為獲取發送郵件的網域統計
                fetchOptional(window.apiClient.get('/analytics/sent-domains', { _t: Date.now(), ...commonParams }), { data: [] })
            ]);

            // 處理活動列表數據
            const campaigns = campaignsData.data.campaigns.map(c => {
                const sent = c.stats.sentCount || 0;
                const opens = c.stats.openedCount || 0;
                const clicks = c.stats.clickedCount || 0;
                const unsubscribes = c.stats.unsubscribedCount || 0;
                const bounces = c.stats.bouncedCount || 0;

                // 計算成功率與失敗率
                const failures = bounces;
                const successes = sent - failures;

                return {
                    id: c.id,
                    name: c.name,
                    status: c.status,
                    sent_date: c.sentAt,
                    sent,
                    opens,
                    clicks,
                    unsubscribes,
                    bounces,
                    successes,
                    failures,
                    open_rate: sent > 0 ? (opens / sent) * 100 : 0,
                    click_rate: sent > 0 ? (clicks / sent) * 100 : 0,
                    unsubscribe_rate: sent > 0 ? (unsubscribes / sent) * 100 : 0,
                    success_rate: sent > 0 ? (successes / sent) * 100 : 0,
                    failure_rate: sent > 0 ? (failures / sent) * 100 : 0
                };
            });

            // 處理儀表板統計數據
            const perf = dashboardData.data.performance || {};
            const analytics = {
                totalSent: perf.totalSent || 0,
                totalOpened: perf.totalOpened || 0,
                totalClicked: perf.totalClicked || 0
            };

            // 保存分頁資訊
            if (geoData.pagination) {
                this.geoPagination = geoData.pagination;
            }

            return { 
                campaigns, 
                analytics,
                trend: trendData.data,
                devices: devicesData.data.devices,
                time: timeData.data,
                geo: geoData.data
            };

        } catch (error) {
            console.error('獲取分析數據失敗:', error);
            NotificationUtils.show('獲取數據失敗，請稍後再試', 'error');
            return { campaigns: [], analytics: {}, trend: {}, devices: [], time: [] };
        }
    }

    updateAnalytics() {
        // 使用動畫更新統計數據
        this.animateCounter('#totalSent', this.analytics.totalSent);
        this.animateCounter('#totalOpened', this.analytics.totalOpened);
        this.animateCounter('#totalClicked', this.analytics.totalClicked);
    }

    animateCounter(selector, targetValue, suffix = '', decimals = 0) {
        const element = DOMUtils.find(selector);
        if (!element) return;

        const startValue = 0;
        const duration = 1000;
        const startTime = performance.now();

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            const currentValue = startValue + (targetValue - startValue) * this.easeOutQuart(progress);
            const displayValue = suffix === '$' ? 
                FormatUtils.currency(currentValue) : 
                FormatUtils.formatNumber(currentValue, decimals) + suffix;
            
            element.textContent = displayValue;
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    }

    easeOutQuart(t) {
        return 1 - Math.pow(1 - t, 4);
    }

    initializeCharts() {
        this.charts = {
            trend: this.initializeTrendChart(),
            device: this.initializeDeviceChart(),
            time: this.initializeTimeChart(),
            geo: this.initializeGeoChart()
        };
    }

    async fetchGeoData(page = 1) {
        try {
            // 改為獲取發送郵件的網域統計
            const response = await window.apiClient.request('/analytics/sent-domains', { 
                method: 'GET',
                params: { 
                    _t: Date.now(),
                    page: page,
                    limit: 10
                },
                timeout: 60000 // 60秒超時，因為數據量大時統計較慢
            });
            
            if (response.data) {
                this.chartData.geo = response.data;
                this.geoPagination = response.pagination;
                this.initializeGeoChart();
            }
        } catch (error) {
            console.error('Fetch geo data failed:', error);
            NotificationUtils.show('載入網域數據失敗', 'error');
        }
    }

    initializeGeoChart() {
        const container = DOMUtils.find('#geoChart');
        if (!container) return null;

        let html = '';
        const data = this.chartData && this.chartData.geo ? this.chartData.geo : [];
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
                    <div class="d-flex justify-content-between align-items-center mt-3 pt-2 border-top">
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
                if (pagination.page > 1) {
                    this.fetchGeoData(pagination.page - 1);
                }
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (pagination.page < pagination.totalPages) {
                    this.fetchGeoData(pagination.page + 1);
                }
            });
        }

        return { container };
    }

    initializeTrendChart() {
        const canvas = DOMUtils.find('#trendChart');
        if (!canvas) return null;

        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;

        this.updateTrendChart('sent');

        return { canvas };
    }

    initializeDeviceChart() {
        const canvas = DOMUtils.find('#deviceChart');
        if (!canvas) return null;

        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;

        let data = [];
        if (this.chartData && this.chartData.devices) {
            const devices = this.chartData.devices;
            const total = devices.reduce((sum, item) => sum + item.openCount, 0);
            
            if (total > 0) {
                const colors = ['#667eea', '#38a169', '#d69e2e', '#e53e3e', '#805ad5'];
                data = devices.map((item, index) => ({
                    label: item.device || '未分類',
                    value: Math.round((item.openCount / total) * 100),
                    color: colors[index % colors.length]
                }));
            }
        }
        
        if (data.length === 0) {
            data = [{ label: '無數據', value: 100, color: '#e2e8f0' }];
        }

        this.drawPieChart(canvas.getContext('2d'), data, canvas.width, canvas.height);

        return { canvas, data };
    }

    initializeTimeChart() {
        const canvas = DOMUtils.find('#timeChart');
        if (!canvas) return null;

        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;

        let data = new Array(24).fill(0);
        let labels = [];
        
        if (this.chartData && this.chartData.time) {
            this.chartData.time.forEach(item => {
                if (item.hour >= 0 && item.hour < 24) {
                    data[item.hour] += item.openCount;
                }
            });
        }
        
        for(let i=0; i<24; i++) {
            labels.push(i.toString());
        }

        this.drawBarChart(canvas.getContext('2d'), data, labels, canvas.width, canvas.height, '#38a169');

        return { canvas, data };
    }

    drawLineChart(ctx, data, labels, width, height, color) {
        const padding = { top: 25, right: 20, bottom: 35, left: 45 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        
        let maxValue = Math.max(...data);
        if (maxValue === 0) maxValue = 10;
        const step = Math.ceil(maxValue / 5);
        maxValue = step * 5;
        
        const minValue = 0;
        const valueRange = maxValue - minValue;

        // Clear
        ctx.clearRect(0, 0, width, height);

        // Draw Grid and Y-Labels
        ctx.fillStyle = '#718096';
        ctx.font = '12px Arial';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;

        // Horizontal lines
        for (let i = 0; i <= 5; i++) {
            const value = minValue + (valueRange / 5) * i;
            const y = padding.top + chartHeight - (chartHeight / 5) * i;
            
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(width - padding.right, y);
            ctx.stroke();
            
            ctx.fillText(Math.round(value), padding.left - 10, y);
        }

        // Draw Line
        if (data.length > 1) {
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.beginPath();

            data.forEach((value, index) => {
                const x = padding.left + (index / (data.length - 1)) * chartWidth;
                const y = padding.top + chartHeight - (value / maxValue) * chartHeight;
                
                if (index === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });

            ctx.stroke();
        }

        // Draw Points and Values
        const showValues = data.length <= 10;

        data.forEach((value, index) => {
            const x = data.length > 1 
                ? padding.left + (index / (data.length - 1)) * chartWidth
                : width / 2;
            const y = padding.top + chartHeight - (value / maxValue) * chartHeight;
            
            // Point
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, 2 * Math.PI);
            ctx.fill();
            ctx.stroke();

            // Value Label
            if (showValues && value > 0) {
                ctx.fillStyle = color;
                ctx.font = 'bold 12px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(value, x, y - 15);
            }

            // X-Axis Label
            const showLabel = data.length <= 10 || index % 5 === 0 || index === data.length - 1;
            
            if (showLabel && labels[index]) {
                ctx.fillStyle = '#718096';
                ctx.font = '12px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillText(labels[index], x, padding.top + chartHeight + 12);
            }
        });
    }

    drawPieChart(ctx, data, width, height) {
        const centerX = width / 2;
        const centerY = height / 2;
        // Moderate size: /2.8 (between /3 and /2.2) to leave space for labels
        const radius = Math.min(width, height) / 3.0;
        const total = data.reduce((sum, item) => sum + item.value, 0);

        let currentAngle = -Math.PI / 2;

        data.forEach(item => {
            const sliceAngle = (item.value / total) * 2 * Math.PI;
            const middleAngle = currentAngle + sliceAngle / 2;

            // Draw Slice
            ctx.fillStyle = item.color;
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
            ctx.closePath();
            ctx.fill();

            // Draw Labels (Outside)
            if (item.value > 0) {
                // Adjust label position for larger radius
                const labelRadius = radius * 1.25;
                const labelX = centerX + Math.cos(middleAngle) * labelRadius;
                const labelY = centerY + Math.sin(middleAngle) * labelRadius;
                
                // Connection Line
                const lineStartRadius = radius * 1.02;
                const lineEndRadius = radius * 1.15;
                const lineStartX = centerX + Math.cos(middleAngle) * lineStartRadius;
                const lineStartY = centerY + Math.sin(middleAngle) * lineStartRadius;
                const lineEndX = centerX + Math.cos(middleAngle) * lineEndRadius;
                const lineEndY = centerY + Math.sin(middleAngle) * lineEndRadius;
                
                ctx.strokeStyle = item.color;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(lineStartX, lineStartY);
                ctx.lineTo(lineEndX, lineEndY);
                ctx.stroke();

                // Text
                ctx.fillStyle = '#4a5568';
                ctx.font = 'bold 12px Arial';
                ctx.textBaseline = 'middle';
                
                // Ensure label doesn't go off canvas
                let drawX = labelX;
                if (labelX > centerX) {
                    drawX = Math.min(labelX, width - 60); // Reserve space for text
                    ctx.textAlign = 'left';
                    ctx.fillText(`${item.label} ${item.value}%`, drawX + 5, labelY);
                } else {
                    drawX = Math.max(labelX, 60); // Reserve space for text
                    ctx.textAlign = 'right';
                    ctx.fillText(`${item.label} ${item.value}%`, drawX - 5, labelY);
                }
            }

            currentAngle += sliceAngle;
        });
    }

    drawBarChart(ctx, data, labels, width, height, color) {
        const padding = { top: 25, right: 15, bottom: 35, left: 45 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        
        let maxValue = Math.max(...data);
        if (maxValue === 0) maxValue = 10;
        const step = Math.ceil(maxValue / 5);
        maxValue = step * 5;
        
        const slotWidth = chartWidth / data.length;
        const barWidth = slotWidth * 0.7;

        // Clear
        ctx.clearRect(0, 0, width, height);

        // Grid and Y-Axis
        ctx.fillStyle = '#718096';
        ctx.font = '12px Arial';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;

        for (let i = 0; i <= 5; i++) {
            const value = (maxValue / 5) * i;
            const y = padding.top + chartHeight - (chartHeight / 5) * i;
            
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(width - padding.right, y);
            ctx.stroke();
            
            ctx.fillText(Math.round(value), padding.left - 10, y);
        }

        // Bars
        ctx.fillStyle = color;
        data.forEach((value, index) => {
            const x = padding.left + index * slotWidth + (slotWidth - barWidth) / 2;
            const barHeight = (value / maxValue) * chartHeight;
            const y = padding.top + chartHeight - barHeight;
            
            ctx.fillRect(x, y, barWidth, barHeight);
            
            // Value Label (if > 0)
            if (value > 0) {
                ctx.fillStyle = '#4a5568';
                ctx.font = '11px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(value, x + barWidth / 2, y - 5);
                ctx.fillStyle = color; // Reset
            }

            // X-Axis Label (every 3rd or 6th hour)
            if (index % 3 === 0) {
                ctx.fillStyle = '#718096';
                ctx.font = '12px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillText(labels[index], x + barWidth / 2, padding.top + chartHeight + 12);
                ctx.fillStyle = color; // Reset
            }
        });
    }

    switchChartMetric(metric) {
        // 更新按鈕狀態
        DOMUtils.selectAll('.chart-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        DOMUtils.find(`[data-metric="${metric}"]`).classList.add('active');

        // 更新圖表數據
        this.updateTrendChart(metric);
    }

    renderTrendSummary(activeMetric) {
        const container = DOMUtils.find('#trendSummaryPanel');
        if (!container || !this.chartData || !this.chartData.trend) return;

        const data = this.chartData.trend;
        const metrics = [
            { key: 'sent', label: '總發送數', color: '#667eea', icon: 'paper-plane' },
            { key: 'opens', label: '總開信數', color: '#38a169', icon: 'envelope-open' },
            { key: 'clicks', label: '總點擊數', color: '#d69e2e', icon: 'mouse-pointer' },
            { key: 'unsubscribes', label: '總退訂數', color: '#e53e3e', icon: 'user-minus' }
        ];

        // Helper to sum counts in range
        const sumMetric = (key) => {
            const arr = data[key] || [];
            return arr.reduce((sum, item) => sum + (item.count || 0), 0);
        };

        const totalSent = sumMetric('sent');
        
        const html = metrics.map(m => {
            const total = sumMetric(m.key);
            let rate = 0;
            let rateLabel = '';
            
            if (m.key !== 'sent' && totalSent > 0) {
                rate = (total / totalSent * 100).toFixed(1);
                rateLabel = `${rate}%`;
            }

            const isActive = m.key === activeMetric;
            const borderStyle = isActive ? `border-left: 4px solid ${m.color};` : 'border-left: 4px solid transparent;';
            const bgStyle = isActive ? 'background: #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.05);' : '';

            return `
                <div class="summary-item" style="cursor: pointer; ${borderStyle} ${bgStyle}" 
                     onclick="window.analyticsManager.switchChartMetric('${m.key}')" role="button">
                    <div class="summary-label">
                        <span class="summary-dot" style="background-color: ${m.color}"></span>
                        ${m.label}
                    </div>
                    <div class="summary-value">${FormatUtils.formatNumber(total)}</div>
                    ${rateLabel ? `<div class="summary-sub">${rateLabel} (佔發送)</div>` : '<div class="summary-sub">&nbsp;</div>'}
                </div>
            `;
        }).join('');

        container.innerHTML = html;
    }

    updateTrendChart(metric) {
        const canvas = DOMUtils.find('#trendChart');
        if (!canvas || !this.charts.trend) return;

        // Render Summary Panel
        this.renderTrendSummary(metric);

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        // 根據指標生成不同的數據
        let data = [];
        let labels = [];
        let color;
        
        if (this.chartData && this.chartData.trend) {
            const trendData = this.chartData.trend[metric] || [];
            
            // 建立日期映射
            const dateMap = {};
            trendData.forEach(item => {
                const dateStr = new Date(item.date).toISOString().split('T')[0];
                dateMap[dateStr] = item.count;
            });

            // 生成日期序列
            const days = this.dateRange === '30d' ? 30 : 7;
            const today = new Date();
            
            for (let i = days - 1; i >= 0; i--) {
                const d = new Date(today);
                d.setDate(d.getDate() - i);
                const dateStr = d.toISOString().split('T')[0];
                data.push(dateMap[dateStr] || 0);
                // 生成 MM/DD 格式的標籤
                labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
            }
        } else {
             const days = this.dateRange === '30d' ? 30 : 7;
             data = new Array(days).fill(0);
             const today = new Date();
             for (let i = days - 1; i >= 0; i--) {
                 const d = new Date(today);
                 d.setDate(d.getDate() - i);
                 labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
             }
        }
        
        switch (metric) {
            case 'opens':
                color = '#38a169';
                break;
            case 'clicks':
                color = '#d69e2e';
                break;
            case 'unsubscribes':
                color = '#e53e3e';
                break;
            default: // sent
                color = '#667eea';
        }

        this.drawLineChart(ctx, data, labels, width, height, color);
    }

    updateCharts() {
        // 重新初始化所有圖表
        this.initializeCharts();
    }

    renderCampaignPerformance() {
        const tbody = DOMUtils.find('#performanceTableBody');
        if (!tbody) return;

        // 排序數據
        const sortedCampaigns = DataUtils.sortBy([...this.campaigns], this.sortBy, 'desc');

        // 分頁
        const paginatedData = DataUtils.paginate(sortedCampaigns, this.currentPage, this.itemsPerPage);

        tbody.innerHTML = paginatedData.data.map(campaign => `
            <tr>
                <td>
                    <div class="campaign-name" data-action="view-detail" data-id="${campaign.id}" style="cursor: pointer;">
                        ${campaign.name}
                    </div>
                </td>
                <td>
                    <span class="status-badge status-${campaign.status?.toLowerCase() || 'draft'}">
                        ${this.formatStatus(campaign.status)}
                    </span>
                </td>
                <td>${FormatUtils.formatDate(campaign.sent_date)}</td>
                <td>${FormatUtils.formatNumber(campaign.sent)}</td>
                <td>
                    <span class="performance-rate ${this.getRateClass(campaign.success_rate)}">
                        ${campaign.success_rate.toFixed(1)}%
                    </span>
                </td>
                <td>
                    <span class="performance-rate ${this.getRateClass(campaign.failure_rate, true)}">
                        ${campaign.failure_rate.toFixed(1)}%
                    </span>
                </td>
                <td>
                    <span class="performance-rate ${this.getRateClass(campaign.open_rate)}">
                        ${campaign.open_rate.toFixed(1)}%
                    </span>
                </td>
                <td>
                    <span class="performance-rate ${this.getRateClass(campaign.click_rate)}">
                        ${campaign.click_rate.toFixed(1)}%
                    </span>
                </td>
                <td>
                    <span class="performance-rate ${this.getRateClass(campaign.unsubscribe_rate, true)}">
                        ${campaign.unsubscribe_rate.toFixed(2)}%
                    </span>
                </td>

                <td>
                    <div class="performance-actions">
                        <button class="action-btn" data-action="view-detail" data-id="${campaign.id}" title="查看詳情">
                            👁
                        </button>
                        <button class="action-btn" data-action="export-report" data-id="${campaign.id}" title="匯出報告">
                            📊
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');

        this.renderPagination(paginatedData);
    }

    formatStatus(status) {
        const statusMap = {
            'draft': '草稿',
            'scheduled': '排程中',
            'sending': '發送中',
            'processing': '處理中',
            'sent': '已發送',
            'paused': '暫停',
            'cancelled': '已取消',
            'completed': '已完成',
            'failed': '失敗',
            'pending_approval': '待審核',
            'approved': '已核准',
            'rejected': '已退回',
            'returned': '已退回'
        };
        return statusMap[status?.toLowerCase()] || status || '未知';
    }

    getRateClass(rate, isNegative = false) {
        if (isNegative) {
            // 退訂率：越低越好
            if (rate < 0.5) return 'good';
            if (rate < 1.0) return 'average';
            return 'poor';
        } else {
            // 開信率、點擊率：越高越好
            if (rate > 25) return 'good';
            if (rate > 15) return 'average';
            return 'poor';
        }
    }

    renderPagination(paginatedData) {
        const { currentPage, totalPages, startItem, endItem, totalItems } = paginatedData;

        // 更新分頁資訊
        const paginationInfo = DOMUtils.find('#performancePaginationInfo');
        if (paginationInfo) {
            paginationInfo.textContent = `顯示 ${startItem}-${endItem} 項，共 ${totalItems} 項`;
        }

        // 更新分頁按鈕
        const prevBtn = DOMUtils.find('#performancePrevPage');
        const nextBtn = DOMUtils.find('#performanceNextPage');
        
        if (prevBtn) prevBtn.disabled = currentPage === 1;
        if (nextBtn) nextBtn.disabled = currentPage === totalPages;

        // 更新頁碼
        const pageNumbers = DOMUtils.find('#performancePageNumbers');
        if (pageNumbers) {
            const pages = this.generatePageNumbers(currentPage, totalPages);
            pageNumbers.innerHTML = pages.map(page => {
                if (page === '...') {
                    return '<span class="page-ellipsis">...</span>';
                }
                return `
                    <button class="page-number ${page === currentPage ? 'active' : ''}" 
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
        const totalPages = Math.ceil(this.campaigns.length / this.itemsPerPage);
        if (page >= 1 && page <= totalPages) {
            this.currentPage = page;
            this.renderCampaignPerformance();
        }
    }

    async viewCampaignDetail(id) {
        const campaign = this.campaigns.find(c => c.id === id);
        if (!campaign) return;

        // 先顯示列表中的緩存數據 (Optimistic UI)
        this.updateDetailModalContent(campaign);
        
        // 顯示模態框
        if (this.detailModal) {
            this.detailModal.show();
            this.detailModal.element.dataset.campaignId = id;
        } else {
            // Fallback
            const modal = DOMUtils.find('#campaignDetailModal');
            if (modal) {
                modal.classList.add('show');
                modal.dataset.campaignId = id;
            }
        }

        // 顯示載入中狀態
        const tbodyLinks = DOMUtils.find('#linksTableBody');
        if (tbodyLinks) {
            tbodyLinks.innerHTML = '<tr><td colspan="3" class="text-center"><i class="fas fa-spinner fa-spin me-2"></i>載入詳細數據中...</td></tr>';
        }
        
        const tbodyDomains = DOMUtils.find('#domainsTableBody');
        if (tbodyDomains) {
            tbodyDomains.innerHTML = '<tr><td colspan="7" class="text-center"><i class="fas fa-spinner fa-spin me-2"></i>載入詳細數據中...</td></tr>';
        }

        const tbodyFailures = DOMUtils.find('#failuresTableBody');
        if (tbodyFailures) {
            tbodyFailures.innerHTML = '<tr><td colspan="3" class="text-center"><i class="fas fa-spinner fa-spin me-2"></i>載入詳細數據中...</td></tr>';
        }

        try {
            // 獲取詳細報告
            const report = await window.analyticsService.getCampaignReport(id);
            
            if (report && report.success && report.data) {
                // 更新統計數據 (使用更準確的報告數據)
                const stats = report.data.stats;
                const updatedCampaign = {
                    ...campaign,
                    sent: stats.total_sent,
                    opens: stats.total_opened,
                    clicks: stats.total_clicked,
                    unsubscribes: stats.total_unsubscribed,
                    capped: stats.capped_count,
                    sent_date: stats.sent_at,
                    name: stats.campaign_name
                };
                
                this.updateDetailModalContent(updatedCampaign);
                
                // 更新連結追蹤表格
                this.updateLinksTable(report.data.links, stats.total_clicked);
                
                // 更新網域統計表格
                this.updateDomainsTable(report.data.domains);

                // 更新失敗原因表格
                this.updateFailuresTable(report.data.failures);
            }
        } catch (error) {
            console.error('獲取活動詳情失敗:', error);
            if (tbodyLinks) {
                tbodyLinks.innerHTML = '<tr><td colspan="3" class="text-center text-danger">無法載入詳細數據</td></tr>';
            }
            if (tbodyDomains) {
                tbodyDomains.innerHTML = '<tr><td colspan="7" class="text-center text-danger">無法載入詳細數據</td></tr>';
            }
            if (tbodyFailures) {
                tbodyFailures.innerHTML = '<tr><td colspan="3" class="text-center text-danger">無法載入詳細數據</td></tr>';
            }
        }
    }

    updateDetailModalContent(campaign) {
        // 更新模態框內容
        const nameEl = DOMUtils.find('#detailCampaignName');
        if (nameEl) nameEl.textContent = campaign.name;
        
        const modalDate = DOMUtils.find('#modalCampaignDate');
        if (modalDate) modalDate.textContent = FormatUtils.formatDate(campaign.sent_date);
        
        const sentEl = DOMUtils.find('#detailSent');
        if (sentEl) sentEl.textContent = FormatUtils.formatNumber(campaign.sent);
        
        const cappedEl = DOMUtils.find('#detailCapped');
        if (cappedEl) cappedEl.textContent = FormatUtils.formatNumber(campaign.capped || 0);

        const opensEl = DOMUtils.find('#detailOpens');
        if (opensEl) opensEl.textContent = FormatUtils.formatNumber(campaign.opens);
        
        const clicksEl = DOMUtils.find('#detailClicks');
        if (clicksEl) clicksEl.textContent = FormatUtils.formatNumber(campaign.clicks);
        
        const unsubsEl = DOMUtils.find('#detailUnsubscribes');
        if (unsubsEl) unsubsEl.textContent = FormatUtils.formatNumber(campaign.unsubscribes);
    }

    updateLinksTable(links, totalClicksFromStats) {
        const tbody = DOMUtils.find('#linksTableBody');
        if (!tbody) return;

        if (!links || links.length === 0) {
             tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">無點擊數據</td></tr>';
             return;
        }

        // Calculate total clicks from the links data itself to ensure percentages sum to 100%
        const totalLinkClicks = links.reduce((sum, link) => sum + (link.clickCount || 0), 0);

        tbody.innerHTML = links.map(link => {
            // 計算佔比 (如果總點擊數為0，則為0)
            const rate = totalLinkClicks > 0 ? ((link.clickCount / totalLinkClicks) * 100).toFixed(1) : '0.0';
            
            return `
            <tr>
                <td>
                    <a href="${link.url}" target="_blank" style="color: #667eea; text-decoration: none; word-break: break-all;">
                        ${link.url}
                    </a>
                </td>
                <td>${FormatUtils.formatNumber(link.clickCount)}</td>
                <td>${rate}%</td>
            </tr>
        `}).join('');
    }

    updateDomainsTable(domains) {
        const tbody = DOMUtils.find('#domainsTableBody');
        if (!tbody) return;

        if (!domains || domains.length === 0) {
             tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">無網域統計數據</td></tr>';
             return;
        }

        tbody.innerHTML = domains.map(item => {
            const total = item.total_sent || 0;
            const success = item.success_count || 0;
            const failed = item.failure_count || 0;
            const capped = item.capped_count || 0;
            
            const successRate = total > 0 ? ((success / total) * 100).toFixed(1) : '0.0';
            const failureRate = total > 0 ? ((failed / total) * 100).toFixed(1) : '0.0';
            
            // Highlight high failure rates
            const failClass = parseFloat(failureRate) > 10 ? 'text-danger fw-bold' : '';

            return `
            <tr>
                <td>${item.domain || 'Unknown'}</td>
                <td>${FormatUtils.formatNumber(total)}</td>
                <td class="text-success">${FormatUtils.formatNumber(success)}</td>
                <td class="text-danger">${FormatUtils.formatNumber(failed)}</td>
                <td class="text-warning">${FormatUtils.formatNumber(capped)}</td>
                <td class="text-success">${successRate}%</td>
                <td class="${failClass}">${failureRate}%</td>
            </tr>
        `}).join('');
    }

    translateFailureReason(reason) {
        if (!reason) return '未知錯誤';
        
        // 錯誤原因翻譯對照表
        const reasonMap = {
            'Frequency Capping Limit Reached': '已達發送頻率上限',
            'Daily Limit Reached': '已達每日發送上限',
            'Domain Limit Reached': '已達網域發送上限',
            'Invalid Email Address': '無效的電子郵件地址',
            'Mailbox Full': '信箱已滿',
            'Connection Timed Out': '連線逾時',
            'Spam Detected': '被標記為垃圾郵件',
            'Relay Access Denied': '拒絕轉寄 (Relay Access Denied)',
            'User Unknown': '使用者不存在'
        };

        // 1. 嘗試完全匹配
        if (reasonMap[reason]) return reasonMap[reason];

        // 2. 嘗試模糊匹配
        const lowerReason = reason.toLowerCase();
        if (lowerReason.includes('frequency capping')) return '已達發送頻率上限';
        if (lowerReason.includes('timed out') || lowerReason.includes('timeout')) return '連線逾時';
        if (lowerReason.includes('dns')) return 'DNS 解析錯誤';
        if (lowerReason.includes('quota')) return '信箱容量已滿 (Quota Exceeded)';
        if (lowerReason.includes('spam')) return '被標記為垃圾郵件';
        if (lowerReason.includes('blacklisted')) return 'IP 被列入黑名單';
        
        return reason;
    }

    updateFailuresTable(failures) {
        const tbody = DOMUtils.find('#failuresTableBody');
        if (!tbody) return;

        if (!failures || failures.length === 0) {
             tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">無失敗原因數據</td></tr>';
             return;
        }

        tbody.innerHTML = failures.map(item => {
            const translatedReason = this.translateFailureReason(item.reason);
            return `
            <tr>
                <td>${item.domain || 'Unknown'}</td>
                <td class="text-danger" style="word-break: break-all;" title="${item.reason || ''}">
                    ${translatedReason}
                </td>
                <td>${FormatUtils.formatNumber(item.count)}</td>
            </tr>
        `}).join('');
    }

    switchTab(tabName) {
        // 更新標籤按鈕
        DOMUtils.selectAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        DOMUtils.find(`[data-tab="${tabName}"]`).classList.add('active');

        // 更新標籤內容
        DOMUtils.selectAll('.tab-pane').forEach(pane => {
            pane.classList.remove('active');
        });
        DOMUtils.find(`#${tabName}`).classList.add('active');
    }

    closeModal() {
        const modals = DOMUtils.selectAll('.modal');
        modals.forEach(modal => {
            modal.classList.remove('show');
            modal.style.display = '';
        });
    }

    async exportReport() {
        try {
            NotificationUtils.show('正在生成綜合分析報告...', 'info');
            
            // 確保有數據
            if (!this.campaigns || this.campaigns.length === 0) {
                 NotificationUtils.show('無數據可匯出', 'warning');
                 return;
            }

            // 生成 HTML 報告
            const htmlContent = this.generateDashboardHTMLReport();
            
            // 開啟預覽視窗
            const previewWindow = window.open('', '_blank');
            if (previewWindow) {
                previewWindow.document.write(htmlContent);
                previewWindow.document.close();
                NotificationUtils.show('綜合分析報告預覽已開啟', 'success');
            } else {
                NotificationUtils.show('請允許彈出視窗以預覽報告', 'warning');
            }
            
        } catch (error) {
            console.error('匯出報告失敗:', error);
            NotificationUtils.show('匯出報告失敗: ' + error.message, 'error');
        }
    }

    generateDashboardHTMLReport() {
        // 準備數據
        const analytics = this.analytics;
        const campaigns = this.campaigns;
        const trend = this.chartData.trend || {};
        const devices = this.chartData.devices || [];
        // 修正: this.chartData.geo 本身就是陣列 (來自 geoData.data)
        const domains = Array.isArray(this.chartData.geo) ? this.chartData.geo : [];

        // 計算總體比率
        const totalSent = analytics.totalSent || 0;
        const openRate = totalSent > 0 ? ((analytics.totalOpened / totalSent) * 100).toFixed(1) : '0.0';
        const clickRate = totalSent > 0 ? ((analytics.totalClicked / totalSent) * 100).toFixed(1) : '0.0';
        
        // 準備圖表數據 - Trend
        const labels = [];
        const sentData = [];
        const openData = [];
        const clickData = [];
        
        // 假設 trend.sent, trend.opens 等是按日期排序的數組
        // 如果是後端返回的原始格式 (對象數組)，需要處理
        // 這裡假設後端返回的是 { sent: [{date:..., count:...}], ... }
        // 為了簡化，我們使用 generateTrendChartData 的邏輯重新生成一次數據結構
        
        // 構建日期映射
        const dateMap = {};
        const days = this.dateRange === '30d' ? 30 : (this.dateRange === '90d' ? 90 : 7);
        const today = new Date();
        
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const label = `${d.getMonth() + 1}/${d.getDate()}`;
            dateMap[dateStr] = { label, sent: 0, opens: 0, clicks: 0 };
            labels.push(label);
        }

        (trend.sent || []).forEach(item => {
            const d = new Date(item.date).toISOString().split('T')[0];
            if (dateMap[d]) dateMap[d].sent = item.count;
        });
        (trend.opens || []).forEach(item => {
            const d = new Date(item.date).toISOString().split('T')[0];
            if (dateMap[d]) dateMap[d].opens = item.count;
        });
        (trend.clicks || []).forEach(item => {
            const d = new Date(item.date).toISOString().split('T')[0];
            if (dateMap[d]) dateMap[d].clicks = item.count;
        });

        // 填充數據數組
        Object.keys(dateMap).sort().forEach(dateStr => {
            sentData.push(dateMap[dateStr].sent);
            openData.push(dateMap[dateStr].opens);
            clickData.push(dateMap[dateStr].clicks);
        });

        // 準備 Campaign Rows
        const campaignRows = campaigns.map(c => `
            <tr>
                <td>${c.name}</td>
                <td>${FormatUtils.formatDate(c.sent_date)}</td>
                <td>${FormatUtils.formatNumber(c.sent)}</td>
                <td>${c.success_rate.toFixed(1)}%</td>
                <td>${c.open_rate.toFixed(1)}%</td>
                <td>${c.click_rate.toFixed(1)}%</td>
                <td>${c.unsubscribe_rate.toFixed(1)}%</td>
            </tr>
        `).join('');

        // 準備 Domain Rows (Top 10)
        const domainRows = domains.slice(0, 10).map(d => `
            <tr>
                <td>${d.domain}</td>
                <td>${FormatUtils.formatNumber(d.count)}</td>
                <td>${d.percentage}%</td>
            </tr>
        `).join('');

        // 準備 Device Data
        // 修正: 後端返回的 key 是 openCount 而不是 count
        const deviceLabels = devices.map(d => d.name || d.device);
        const deviceValues = devices.map(d => d.count || d.openCount || 0);
        const deviceColors = ['#4e73df', '#1cc88a', '#36b9cc', '#f6c23e', '#e74a3b'];

        return `
<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>綜合分析報告</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body { font-family: "Microsoft JhengHei", sans-serif; background: #f8f9fa; padding: 20px; }
        .card { border: none; box-shadow: 0 2px 4px rgba(0,0,0,0.05); margin-bottom: 20px; border-radius: 8px; }
        .stat-card { text-align: center; padding: 20px; }
        .stat-value { font-size: 28px; font-weight: bold; color: #2c3e50; }
        .stat-label { font-size: 14px; color: #7f8c8d; margin-top: 5px; }
        .section-title { border-left: 4px solid #4e73df; padding-left: 10px; margin-bottom: 20px; color: #333; }
        .table th { background-color: #f1f3f9; }
        .chart-container { position: relative; height: 300px; width: 100%; }
        
        @media print {
            body { background: #fff; padding: 0; }
            .no-print { display: none !important; }
            .card { box-shadow: none; border: 1px solid #ddd; break-inside: avoid; page-break-inside: avoid; }
            .container { max-width: 100% !important; width: 100% !important; }
            .chart-container { height: 250px; } /* Adjust for print */
            h2, h4 { margin-top: 0; }
            .table-responsive { overflow: visible !important; height: auto !important; }
            
            /* A4 專業報告樣式 */
            @page {
                size: A4;
                margin: 1.5cm;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="d-flex justify-content-between align-items-center mb-4 no-print">
            <button onclick="window.print()" class="btn btn-primary">
                <i class="bi bi-printer"></i> 列印 / 儲存 PDF (A4 專業報告)
            </button>
            <button onclick="window.close()" class="btn btn-secondary">關閉預覽</button>
        </div>

        <div class="d-flex justify-content-between align-items-center mb-4">
            <div>
                <h2 class="mb-1">綜合分析報告</h2>
                <h4 class="text-primary">WintonEDM</h4>
            </div>
            <div class="text-end text-muted">
                <small>統計範圍: ${this.dateRange === 'custom' ? `${this.customStartDate} ~ ${this.customEndDate}` : `最近 ${this.dateRange.replace('d','')} 天`}</small><br>
                <small>生成時間: ${new Date().toLocaleString()}</small>
            </div>
        </div>

        <!-- 關鍵指標 -->
        <div class="row mb-4">
            <div class="col-md-3 col-6">
                <div class="card stat-card">
                    <div class="stat-value">${FormatUtils.formatNumber(totalSent)}</div>
                    <div class="stat-label">總發送數</div>
                </div>
            </div>
            <div class="col-md-3 col-6">
                <div class="card stat-card">
                    <div class="stat-value text-success">${openRate}%</div>
                    <div class="stat-label">平均開信率</div>
                </div>
            </div>
            <div class="col-md-3 col-6">
                <div class="card stat-card">
                    <div class="stat-value text-primary">${clickRate}%</div>
                    <div class="stat-label">平均點擊率</div>
                </div>
            </div>
            <div class="col-md-3 col-6">
                <div class="card stat-card">
                    <div class="stat-value text-info">${FormatUtils.formatNumber(analytics.totalOpened)}</div>
                    <div class="stat-label">總開信數</div>
                </div>
            </div>
        </div>

        <!-- 趨勢圖表 -->
        <div class="row mb-4">
            <div class="col-12">
                <div class="card p-4">
                    <h5 class="section-title">發送趨勢分析</h5>
                    <div class="chart-container">
                        <canvas id="trendChart"></canvas>
                    </div>
                </div>
            </div>
        </div>

        <div class="row mb-4">
            <!-- 裝置分佈 -->
            <div class="col-md-6">
                <div class="card p-4">
                    <h5 class="section-title">開啟裝置分佈</h5>
                    <div class="chart-container">
                        <canvas id="deviceChart"></canvas>
                    </div>
                </div>
            </div>
            <!-- 熱門網域 -->
            <div class="col-md-6">
                <div class="card p-4">
                    <h5 class="section-title">熱門收件網域 (Top 10)</h5>
                    <div class="table-responsive" style="height: 300px; overflow-y: auto;">
                        <table class="table table-hover table-sm">
                            <thead>
                                <tr>
                                    <th>網域</th>
                                    <th>發送數</th>
                                    <th>佔比</th>
                                </tr>
                            </thead>
                            <tbody>${domainRows || '<tr><td colspan="3" class="text-center">無數據</td></tr>'}</tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <!-- 活動列表 -->
        <div class="card p-4 mb-4">
            <h5 class="section-title">活動成效列表</h5>
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead>
                        <tr>
                            <th>活動名稱</th>
                            <th>發送日期</th>
                            <th>發送數</th>
                            <th>成功率</th>
                            <th>開信率</th>
                            <th>點擊率</th>
                            <th>退訂率</th>
                        </tr>
                    </thead>
                    <tbody>${campaignRows || '<tr><td colspan="7" class="text-center">無活動數據</td></tr>'}</tbody>
                </table>
            </div>
        </div>

    </div>

    <script>
        document.addEventListener('DOMContentLoaded', function() {
            // 趨勢圖
            const trendCtx = document.getElementById('trendChart').getContext('2d');
            new Chart(trendCtx, {
                type: 'line',
                data: {
                    labels: ${JSON.stringify(labels)},
                    datasets: [
                        {
                            label: '發送數',
                            data: ${JSON.stringify(sentData)},
                            borderColor: '#4e73df',
                            backgroundColor: 'rgba(78, 115, 223, 0.05)',
                            tension: 0.3,
                            fill: true
                        },
                        {
                            label: '開信數',
                            data: ${JSON.stringify(openData)},
                            borderColor: '#1cc88a',
                            backgroundColor: 'rgba(28, 200, 138, 0.05)',
                            tension: 0.3,
                            fill: true
                        },
                        {
                            label: '點擊數',
                            data: ${JSON.stringify(clickData)},
                            borderColor: '#36b9cc',
                            backgroundColor: 'rgba(54, 185, 204, 0.05)',
                            tension: 0.3,
                            fill: true
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: 'index',
                        intersect: false,
                    },
                    plugins: {
                        legend: { position: 'top' }
                    },
                    scales: {
                        y: { beginAtZero: true }
                    }
                }
            });

            // 裝置圖
            const deviceCtx = document.getElementById('deviceChart').getContext('2d');
            new Chart(deviceCtx, {
                type: 'doughnut',
                data: {
                    labels: ${JSON.stringify(deviceLabels)},
                    datasets: [{
                        data: ${JSON.stringify(deviceValues)},
                        backgroundColor: ${JSON.stringify(deviceColors)},
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'right' }
                    }
                }
            });
        });
    </script>
</body>
</html>
        `;
    }



    async exportCampaignReport(id) {
        try {
            const campaign = this.campaigns.find(c => c.id === id);
            if (!campaign) return;

            NotificationUtils.show('正在生成活動分析報告...', 'info');
            
            // 獲取完整報告數據
            const report = await window.analyticsService.getCampaignReport(id);
            
            if (!report || !report.success || !report.data) {
                throw new Error('無法獲取報告數據');
            }

            // 生成 HTML 報告
            const htmlContent = this.generateCampaignHTMLReport(campaign, report.data);
            
            // 開啟預覽視窗
            const previewWindow = window.open('', '_blank');
            if (previewWindow) {
                previewWindow.document.write(htmlContent);
                previewWindow.document.close();
                NotificationUtils.show('活動分析報告預覽已開啟', 'success');
            } else {
                NotificationUtils.show('請允許彈出視窗以預覽報告', 'warning');
            }
            
        } catch (error) {
            console.error('匯出活動報告失敗:', error);
            NotificationUtils.show('匯出活動報告失敗: ' + error.message, 'error');
        }
    }

    generateCampaignHTMLReport(campaign, data) {
        const stats = data.stats;
        const sentDate = FormatUtils.formatDate(stats.sent_at || campaign.sent_date);
        
        // 計算比率 (確保使用數值進行計算，避免 undefined/null 導致 NaN)
        const totalSent = stats.total_sent || 0;
        const totalOpened = stats.total_opened || 0;
        const totalClicked = stats.total_clicked || 0;
        const totalUnsubscribed = stats.total_unsubscribed || 0;
        const totalBounced = stats.total_bounced || 0;

        const openRate = totalSent > 0 ? ((totalOpened / totalSent) * 100).toFixed(1) : '0.0';
        const clickRate = totalSent > 0 ? ((totalClicked / totalSent) * 100).toFixed(1) : '0.0';
        const unsubRate = totalSent > 0 ? ((totalUnsubscribed / totalSent) * 100).toFixed(1) : '0.0';
        const bounceRate = totalSent > 0 ? ((totalBounced / totalSent) * 100).toFixed(1) : '0.0';
        const successRate = (100 - parseFloat(bounceRate)).toFixed(1);

        // 生成網域表格行
        const domainRows = (data.domains || []).map(d => `
            <tr>
                <td>${d.domain}</td>
                <td>${FormatUtils.formatNumber(d.total_sent)}</td>
                <td class="text-success">${FormatUtils.formatNumber(d.success_count)}</td>
                <td class="text-danger">${FormatUtils.formatNumber(d.failure_count)}</td>
                <td>${d.total_sent > 0 ? ((d.success_count / d.total_sent) * 100).toFixed(1) : '0.0'}%</td>
                <td>${d.total_sent > 0 ? ((d.failure_count / d.total_sent) * 100).toFixed(1) : '0.0'}%</td>
            </tr>
        `).join('');

        // 生成失敗原因表格行
        const failureRows = (data.failures || []).map(f => `
            <tr>
                <td>${f.domain}</td>
                <td class="text-danger">${f.reason}</td>
                <td>${FormatUtils.formatNumber(f.count)}</td>
            </tr>
        `).join('');

        // 生成連結點擊表格行
        const linkRows = (data.links || []).map(l => `
            <tr>
                <td><a href="${l.url}" target="_blank">${l.url}</a></td>
                <td>${FormatUtils.formatNumber(l.clickCount)}</td>
            </tr>
        `).join('');

        return `
<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>活動分析報告 - ${campaign.name}</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body { font-family: "Microsoft JhengHei", sans-serif; background: #f8f9fa; padding: 20px; }
        .card { border: none; box-shadow: 0 2px 4px rgba(0,0,0,0.05); margin-bottom: 20px; border-radius: 8px; }
        .stat-card { text-align: center; padding: 20px; }
        .stat-value { font-size: 28px; font-weight: bold; color: #2c3e50; }
        .stat-label { font-size: 14px; color: #7f8c8d; margin-top: 5px; }
        .section-title { border-left: 4px solid #4e73df; padding-left: 10px; margin-bottom: 20px; color: #333; }
        .table th { background-color: #f1f3f9; }
        .text-success { color: #1cc88a !important; }
        .text-danger { color: #e74a3b !important; }
        .chart-container { position: relative; height: 300px; width: 100%; }
        
        @media print {
            body { background: #fff; padding: 0; }
            .no-print { display: none !important; }
            .card { box-shadow: none; border: 1px solid #ddd; break-inside: avoid; page-break-inside: avoid; }
            .container { max-width: 100% !important; width: 100% !important; }
            .chart-container { height: 250px; } /* Adjust for print */
            h2, h4 { margin-top: 0; }
            .table-responsive { overflow: visible !important; height: auto !important; }
            
            /* A4 專業報告樣式 */
            @page {
                size: A4;
                margin: 1.5cm;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="d-flex justify-content-between align-items-center mb-4 no-print">
            <button onclick="window.print()" class="btn btn-primary">
                <i class="bi bi-printer"></i> 列印 / 儲存 PDF (A4 專業報告)
            </button>
            <button onclick="window.close()" class="btn btn-secondary">關閉預覽</button>
        </div>

        <div class="d-flex justify-content-between align-items-center mb-4">
            <div>
                <h2 class="mb-1">活動分析報告</h2>
                <h4 class="text-primary">${campaign.name}</h4>
            </div>
            <div class="text-end text-muted">
                <small>發送時間: ${sentDate}</small><br>
                <small>報告生成時間: ${new Date().toLocaleString()}</small>
            </div>
        </div>

        <!-- 關鍵指標 -->
        <div class="row mb-4">
            <div class="col-md-2 col-sm-4 col-6">
                <div class="card stat-card">
                    <div class="stat-value">${FormatUtils.formatNumber(stats.total_sent)}</div>
                    <div class="stat-label">總發送數</div>
                </div>
            </div>
            <div class="col-md-2 col-sm-4 col-6">
                <div class="card stat-card">
                    <div class="stat-value text-success">${successRate}%</div>
                    <div class="stat-label">成功率</div>
                </div>
            </div>
            <div class="col-md-2 col-sm-4 col-6">
                <div class="card stat-card">
                    <div class="stat-value text-primary">${openRate}%</div>
                    <div class="stat-label">開信率</div>
                </div>
            </div>
            <div class="col-md-2 col-sm-4 col-6">
                <div class="card stat-card">
                    <div class="stat-value text-info">${clickRate}%</div>
                    <div class="stat-label">點擊率</div>
                </div>
            </div>
            <div class="col-md-2 col-sm-4 col-6">
                <div class="card stat-card">
                    <div class="stat-value text-warning">${unsubRate}%</div>
                    <div class="stat-label">退訂率</div>
                </div>
            </div>
             <div class="col-md-2 col-sm-4 col-6">
                <div class="card stat-card">
                    <div class="stat-value text-danger">${bounceRate}%</div>
                    <div class="stat-label">失敗率</div>
                </div>
            </div>
        </div>

        <!-- 圖表分析 -->
        <div class="row mb-4">
            <div class="col-md-6">
                <div class="card p-4">
                    <h5 class="section-title">發送狀態分佈</h5>
                    <div class="chart-container">
                        <canvas id="deliveryChart"></canvas>
                    </div>
                </div>
            </div>
            <div class="col-md-6">
                <div class="card p-4">
                    <h5 class="section-title">活動成效統計</h5>
                    <div class="chart-container">
                        <canvas id="funnelChart"></canvas>
                    </div>
                </div>
            </div>
        </div>

        <!-- 網域統計 -->
        <div class="card p-4 mb-4">
            <h5 class="section-title">網域發送統計</h5>
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead>
                        <tr>
                            <th>網域</th>
                            <th>發送總數</th>
                            <th>成功</th>
                            <th>失敗</th>
                            <th>成功率</th>
                            <th>失敗率</th>
                        </tr>
                    </thead>
                    <tbody>${domainRows || '<tr><td colspan="6" class="text-center">無數據</td></tr>'}</tbody>
                </table>
            </div>
        </div>

        <!-- 失敗原因分析 -->
        <div class="row mb-4">
            <div class="col-12">
                <div class="card p-4">
                    <h5 class="section-title">失敗原因詳細分析</h5>
                    <div class="alert alert-info py-2">
                        <small><i class="fas fa-info-circle"></i> 僅顯示前 100 筆主要失敗原因</small>
                    </div>
                    <div class="table-responsive" style="max-height: 400px;">
                        <table class="table table-hover table-sm">
                            <thead>
                                <tr>
                                    <th style="width: 20%">網域</th>
                                    <th style="width: 65%">失敗原因</th>
                                    <th style="width: 15%">次數</th>
                                </tr>
                            </thead>
                            <tbody>${failureRows || '<tr><td colspan="3" class="text-center">無失敗數據</td></tr>'}</tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <!-- 連結點擊分析 -->
         <div class="card p-4 mb-4">
            <h5 class="section-title">熱門連結點擊</h5>
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead>
                        <tr>
                            <th>連結 URL</th>
                            <th>點擊次數</th>
                        </tr>
                    </thead>
                    <tbody>${linkRows || '<tr><td colspan="2" class="text-center">無點擊數據</td></tr>'}</tbody>
                </table>
            </div>
        </div>

    </div>

    <script>
        // 初始化圖表
        document.addEventListener('DOMContentLoaded', function() {
            // 1. 發送狀態圓餅圖
            const deliveryCtx = document.getElementById('deliveryChart').getContext('2d');
            new Chart(deliveryCtx, {
                type: 'doughnut',
                data: {
                    labels: ['成功送達', '發送失敗'],
                    datasets: [{
                        data: [${totalSent - totalBounced}, ${totalBounced}],
                        backgroundColor: ['#1cc88a', '#e74a3b'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom' }
                    }
                }
            });

            // 2. 互動漏斗圖 (使用長條圖模擬)
            const funnelCtx = document.getElementById('funnelChart').getContext('2d');
            new Chart(funnelCtx, {
                type: 'bar',
                data: {
                    labels: ['發送總數', '開啟', '點擊', '退訂'],
                    datasets: [{
                        label: '人數/次數',
                        data: [${totalSent}, ${totalOpened}, ${totalClicked}, ${totalUnsubscribed}],
                        backgroundColor: ['#4e73df', '#36b9cc', '#1cc88a', '#f6c23e'],
                        barPercentage: 0.6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    indexAxis: 'y', // 橫向長條圖
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        x: { beginAtZero: true }
                    }
                }
            });
        });
    </script>
</body>
</html>
        `;
    }

    // 舊的 CSV 生成方法保留作為備用或移除 (此處保留但不再被調用)
    generateCampaignCSVReport(campaign) {
        const headers = ['指標', '數值'];
        const rows = [
            ['活動名稱', campaign.name],
            ['發送日期', FormatUtils.formatDate(campaign.sent_date)],
            ['發送數', campaign.sent],
            ['開信數', campaign.opens],
            ['開信率', campaign.open_rate.toFixed(2) + '%'],
            ['點擊數', campaign.clicks],
            ['點擊率', campaign.click_rate.toFixed(2) + '%'],
            ['退訂數', campaign.unsubscribes],
            ['退訂率', campaign.unsubscribe_rate.toFixed(2) + '%']
        ];

        return [headers, ...rows].map(row => row.join(',')).join('\n');
    }

    openDetailedReport(reportType) {
        NotificationUtils.show(`正在開啟 ${reportType}...`, 'info');
        
        // 這裡可以實現詳細報告的邏輯
        setTimeout(() => {
            NotificationUtils.show(`${reportType} 功能開發中`, 'info');
        }, 1000);
    }

    setupAutoRefresh() {
        // 每5分鐘自動刷新數據
        setInterval(() => {
            if (!document.hidden) {
                this.loadData();
            }
        }, 5 * 60 * 1000);
    }
}

// 初始化分析管理器
let analyticsManager;

// 使用 appState 管理全局狀態
if (typeof appState !== 'undefined') {
    appState.setState('analyticsManager', null);
}

document.addEventListener('DOMContentLoaded', () => {
    // 確保工具類已經載入
    if (typeof PerformanceUtils === 'undefined') {
        window.PerformanceUtils = {
            startTiming: () => {},
            endTiming: () => {},
            log: () => {}
        };
    }
    
    // 確保通知工具已載入
    if (typeof NotificationUtils === 'undefined') {
        window.NotificationUtils = {
            show: (msg, type) => console.log(`[${type}] ${msg}`)
        };
    }

    analyticsManager = new AnalyticsManager();
    if (typeof appState !== 'undefined') {
        appState.setState('analyticsManager', analyticsManager);
    }
});

// 註冊到全局組件系統
ComponentRegistry.register('AnalyticsManager', AnalyticsManager);