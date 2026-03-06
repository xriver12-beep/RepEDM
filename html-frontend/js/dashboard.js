// 儀表板專用 JavaScript - 重構版本
// 使用新的工具和組件系統

// 儀表板數據管理
class DashboardManager {
    constructor() {
        this.data = {
            stats: {
                totalSubscribers: 0,
                activeSubscribers: 0,
                emailsSent: 0,
                openRate: 0
            },
            activities: [],
            allCampaigns: [], // 新增：全站活動列表
            campaignsPagination: {
                page: 1,
                limit: 10,
                total: 0,
                totalPages: 0
            },
            charts: {}
        };
        
        this.refreshInterval = null;
        this.isLoading = false;
    }
    
    // 初始化儀表板
    async initialize() {
        try {
            PerformanceUtils.startTimer('dashboard-init');
            
            // 設定載入狀態
            this.setLoadingState(true);
            
            // 載入儀表板數據
            await this.loadData();
            
            // 更新 UI
            this.updateUI();
            
            // 初始化圖表
            this.initializeCharts();
            
            // 設定自動刷新
            this.setupAutoRefresh();
            
            PerformanceUtils.endTimer('dashboard-init');
            console.log('儀表板初始化完成');
            
        } catch (error) {
            console.error('儀表板初始化失敗:', error);
            NotificationUtils.show('儀表板載入失敗', 'error');
        } finally {
            this.setLoadingState(false);
        }
    }
    
    // 設定載入狀態
    setLoadingState(isLoading) {
        this.isLoading = isLoading;
        if (window.appState) {
            appState.setState('loading', isLoading);
        }
        
        if (isLoading) {
            showLoading('.stats-grid');
            showLoading('.recent-activity');
            showLoading('.chart-container');
        }
    }
    
    // 載入儀表板數據
    async loadData() {
        try {
            // 嘗試從 API 載入數據
            if (window.apiClient) {
                // 使用 apiClient.get 方法，它現在已經能夠正確處理 URL
                const response = await window.apiClient.get('/analytics/dashboard');
                // 轉換後端數據格式為前端期望的格式
                if (response.success && response.data) {
                    this.data.stats = {
                        onlineUserCount: response.data.onlineUserCount || 0,
                        successfulSends: response.data.emailSendStats?.successfulSends || 0,
                        failedSends: response.data.emailSendStats?.failedSends || 0,
                        emailsSent: response.data.performance?.totalSent || 0,
                        openRate: response.data.performance?.avgOpenRate || 0
                    };
                    
                    // 儲存登入日誌
                    if (response.data.loginLogs) {
                        this.data.loginLogs = response.data.loginLogs;
                    }
                    
                    // 儲存系統資訊
                    if (response.data.systemInfo) {
                        this.data.systemInfo = response.data.systemInfo;
                    }
                    
                    // 儲存活動數據
                    if (response.data.activities) {
                        this.data.activities = response.data.activities;
                    }
                    
                    // 儲存圖表數據
                    if (response.data.charts) {
                        this.data.charts = response.data.charts;
                    }
                }
                
                // 載入全站活動列表
                await this.loadAllCampaigns();
            } else {
                console.error('API client not found');
                NotificationUtils.show('無法連接到伺服器', 'error');
            }
            
            // 儲存到本地存儲以供離線使用
            StorageUtils.setItem('dashboard-data', this.data, 5 * 60 * 1000); // 5分鐘過期
            
        } catch (error) {
            console.error('API 載入失敗:', error);
            
            // 嘗試從本地存儲載入
            const cachedData = StorageUtils.getItem('dashboard-data');
            if (cachedData) {
                this.data = cachedData;
                NotificationUtils.show('使用快取數據', 'warning');
            } else {
                NotificationUtils.show('載入數據失敗', 'error');
            }
        }
    }

    // 載入全站活動數據
    async loadAllCampaigns(page = 1) {
        try {
            this.data.campaignsPagination.page = page;
            
            // 顯示載入中狀態
            const tbody = document.getElementById('campaignStatusBody');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center"><div class="loading-spinner"></div> 載入中...</td></tr>';
            }

            let response;
            if (window.apiClient) {
                 response = await window.apiClient.get('/campaigns', { 
                     page: this.data.campaignsPagination.page,
                     limit: this.data.campaignsPagination.limit 
                 });
            }
            
            if (response && response.success && response.data && response.data.campaigns) {
                this.data.allCampaigns = response.data.campaigns;
                
                // 更新分頁資訊
                if (response.data.pagination) {
                    this.data.campaignsPagination = {
                        ...this.data.campaignsPagination,
                        total: response.data.pagination.total || 0,
                        totalPages: response.data.pagination.totalPages || 1
                    };
                }
                
                this.updateCampaignStatusTable();
            }
        } catch (error) {
            console.error('載入全站活動失敗:', error);
            const tbody = document.getElementById('campaignStatusBody');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center text-error">載入失敗，請稍後再試</td></tr>';
            }
        }
    }

    // 更新系統資訊
    updateSystemInfo() {
        const sysInfoPanel = document.getElementById('systemInfoPanel');
        if (!sysInfoPanel) return;
        
        if (this.data.systemInfo) {
            sysInfoPanel.style.display = 'block';
            
            const sysHostname = document.getElementById('sysHostname');
            if (sysHostname) {
                const host = this.data.systemInfo.hostname || '-';
                const ip = this.data.systemInfo.ip || '';
                sysHostname.textContent = ip ? `${host} (${ip})` : host;
            }
            
            const dbHostDisplay = document.getElementById('dbHostDisplay');
            if (dbHostDisplay) dbHostDisplay.textContent = this.data.systemInfo.dbHost || '-';
            
            const dbNameDisplay = document.getElementById('dbNameDisplay');
            if (dbNameDisplay) dbNameDisplay.textContent = this.data.systemInfo.dbName || '-';
        }
    }

    // 更新 UI
    updateUI() {
        this.updateSystemInfo();
        this.updateStatistics();
        this.updateRecentActivities();
        this.updateLoginLogs();
        this.updateCampaignStatusTable();
        this.updateCharts();
    }
    
    // 更新登入日誌
    updateLoginLogs() {
        const tbody = document.getElementById('loginLogsBody');
        if (!tbody) return;

        if (!this.data.loginLogs || this.data.loginLogs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">尚無登入記錄</td></tr>';
            return;
        }

        const html = this.data.loginLogs.map(log => {
            const loginTime = new Date(log.login_time).toLocaleString('zh-TW');
            const logoutTime = log.logout_time ? new Date(log.logout_time).toLocaleString('zh-TW') : '-';
            
            // 判斷狀態：有登出時間=已登出，否則檢查最後活躍時間
            let isOnline = false;
            if (!log.logout_time) {
                // 如果沒有最後活躍時間，假設為登入時間
                const lastActive = log.last_active_at ? new Date(log.last_active_at) : new Date(log.login_time);
                // 5分鐘內有活動視為線上
                const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
                isOnline = lastActive > fiveMinutesAgo;
            }

            const status = log.logout_time ? 
                '<span class="badge badge-secondary" style="background:#6c757d;color:white;padding:3px 8px;border-radius:10px;font-size:0.8em">已登出</span>' : 
                (isOnline ? 
                    '<span class="badge badge-success" style="background:#28a745;color:white;padding:3px 8px;border-radius:10px;font-size:0.8em">線上</span>' :
                    '<span class="badge badge-warning" style="background:#ffc107;color:black;padding:3px 8px;border-radius:10px;font-size:0.8em">離線 (逾時)</span>'
                );
            
            return `
                <tr>
                    <td>
                        <div style="display:flex;align-items:center">
                            <div style="width:30px;height:30px;background:#e9ecef;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-right:10px;font-weight:bold">
                                ${log.username.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <div style="font-weight:600">${log.full_name || log.username}</div>
                                <div style="color:#6c757d;font-size:0.85em">${log.username}</div>
                            </div>
                        </div>
                    </td>
                    <td>${log.ip_address || '-'}</td>
                    <td>${loginTime}</td>
                    <td>${logoutTime}</td>
                    <td>${status}</td>
                </tr>
            `;
        }).join('');

        tbody.innerHTML = html;
    }

    // 更新統計數據
    updateStatistics() {
        const statsContainer = DOMUtils.select('.stats-grid');
        if (!statsContainer) return;
        
        const statsHTML = `
            <div class="stat-card" data-component="stat-card">
                <div class="stat-icon" style="background:rgba(40, 167, 69, 0.1);color:#28a745">👥</div>
                <div class="stat-content">
                    <div class="stat-value">${this.data.stats.onlineUserCount}</div>
                    <div class="stat-label">線上前台使用者</div>
                </div>
                <div class="stat-trend positive">24小時內</div>
            </div>

            <div class="stat-card" data-component="stat-card">
                <div class="stat-icon">📤</div>
                <div class="stat-content">
                    <div class="stat-value">${FormatUtils.formatNumber(this.data.stats.successfulSends)}</div>
                    <div class="stat-label">成功寄送</div>
                </div>
                <div class="stat-trend positive">30天</div>
            </div>
            
            <div class="stat-card" data-component="stat-card">
                <div class="stat-icon">❌</div>
                <div class="stat-content">
                    <div class="stat-value">${FormatUtils.formatNumber(this.data.stats.failedSends)}</div>
                    <div class="stat-label">寄送失敗</div>
                </div>
                <div class="stat-trend negative">30天</div>
            </div>
            
            <div class="stat-card" data-component="stat-card">
                <div class="stat-icon">📧</div>
                <div class="stat-content">
                    <div class="stat-value">${FormatUtils.formatNumber(this.data.stats.emailsSent)}</div>
                    <div class="stat-label">本月發送</div>
                </div>
                <div class="stat-trend positive">+15%</div>
            </div>
            
            <div class="stat-card" data-component="stat-card">
                <div class="stat-icon">📊</div>
                <div class="stat-content">
                    <div class="stat-value">${this.data.stats.openRate}%</div>
                    <div class="stat-label">開信率</div>
                </div>
                <div class="stat-trend ${this.data.stats.openRate > 20 ? 'positive' : 'negative'}">
                    ${this.data.stats.openRate > 20 ? '+' : ''}3%
                </div>
            </div>
        `;
        
        hideLoading(statsContainer, statsHTML);
        
        // 添加動畫效果
        this.animateStatCards();
    }
    
    // 動畫統計卡片
    animateStatCards() {
        const statCards = DOMUtils.selectAll('.stat-card');
        
        statCards.forEach((card, index) => {
            PerformanceUtils.defer(() => {
                DOMUtils.addClass(card, 'animate-in');
            }, index * 100);
        });
    }
    
    // 更新最近活動
    updateRecentActivities() {
        const activitiesContainer = DOMUtils.select('.recent-activity');
        if (!activitiesContainer) return;
        
        // 按時間排序活動
        const sortedActivities = DataUtils.sortBy(this.data.activities, 'timestamp', 'desc');
        
        const activitiesHTML = `
            <div class="activity-list">
                ${sortedActivities.map(activity => this.createActivityItem(activity)).join('')}
            </div>
            <div class="activity-footer">
                <button class="btn btn-outline" onclick="window.location.href='activities.html'">
                    查看所有活動
                </button>
            </div>
        `;
        
        hideLoading(activitiesContainer, activitiesHTML);
    }
    
    // 創建活動項目
    createActivityItem(activity) {
        return `
            <div class="activity-item" data-activity-id="${activity.id}">
                <div class="activity-icon activity-${activity.color || 'gray'}">
                    ${this.getActivityIcon(activity.type)}
                </div>
                <div class="activity-content">
                    <div class="activity-title">${activity.title || '(無標題)'}</div>
                    <div class="activity-description">${activity.description || ''}</div>
                    <div class="activity-time">${activity.time || ''}</div>
                </div>
                <div class="activity-actions">
                    <button class="btn-icon" data-tooltip="查看詳情" onclick="dashboard.viewActivityDetail(${activity.id})">
                        👁️
                    </button>
                </div>
            </div>
        `;
    }
    
    // 獲取活動圖示
    getActivityIcon(type) {
        const icons = {
            email_sent: '📧',
            subscriber_added: '👤',
            template_updated: '📝',
            campaign_completed: '🎯',
            approval_pending: '⏳',
            error: '❌'
        };
        return icons[type] || '📋';
    }
    
    // 查看活動詳情
    viewActivityDetail(activityId) {
        const activity = this.data.activities.find(a => a.id === activityId);
        if (!activity) return;
        
        // 使用 Modal 組件顯示詳情
        const modal = new Modal(null, {
            title: activity.title,
            content: `
                <div class="activity-detail">
                    <div class="detail-row">
                        <label>類型：</label>
                        <span>${this.getActivityTypeLabel(activity.type)}</span>
                    </div>
                    <div class="detail-row">
                        <label>時間：</label>
                        <span>${FormatUtils.formatDate(new Date(activity.timestamp), 'YYYY-MM-DD HH:mm')}</span>
                    </div>
                    <div class="detail-row">
                        <label>描述：</label>
                        <span>${activity.description}</span>
                    </div>
                </div>
            `,
            size: 'medium',
            closable: true
        });
        
        modal.show();
    }
    
    // 獲取活動類型標籤
    getActivityTypeLabel(type) {
        const labels = {
            email_sent: '電子報發送',
            subscriber_added: '訂閱者新增',
            template_updated: 'EDM更新',
            campaign_completed: '活動完成',
            approval_pending: '等待審核',
            error: '錯誤'
        };
        return labels[type] || '未知';
    }
    
    // 更新全站活動狀態表格
    updateCampaignStatusTable() {
        const tbody = document.getElementById('campaignStatusBody');
        if (!tbody) return;

        const campaigns = this.data.allCampaigns || [];
        
        if (campaigns.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center">暫無活動數據</td></tr>';
            this.renderPagination(); // 即使沒有數據也要清除分頁
            return;
        }

        tbody.innerHTML = campaigns.map(campaign => {
            let statusText = this.getCampaignStatusText(campaign.status);
            
            if (campaign.status === 'pending_approval') {
                if (campaign.currentStep && campaign.totalSteps) {
                    statusText = `審核中 (第 ${campaign.currentStep}/${campaign.totalSteps} 階)`;
                    if (campaign.currentApprover) {
                        statusText += `<br><small style="font-weight:normal; opacity:0.9;">${campaign.currentApprover}</small>`;
                    }
                } else {
                    statusText = '審核中';
                }
            } else if ((campaign.status === 'rejected' || campaign.status === 'returned') && campaign.rejectedBy) {
                 statusText += `<br><small style="font-weight:normal; opacity:0.9;">由 ${campaign.rejectedBy} ${campaign.status === 'rejected' ? '拒絕' : '退回'}</small>`;
            }

            const statusClass = this.getCampaignStatusClass(campaign.status);
            
            // 格式化日期
            let createdDate = '-';
            if (campaign.createdAt) {
                const date = new Date(campaign.createdAt);
                createdDate = FormatUtils.formatDate(date, 'YYYY-MM-DD HH:mm:ss');
            }

            // 格式化發送時間 (有發送時間顯示發送時間，否則顯示預計發送時間)
            let timeDisplay = '-';
            if (campaign.sentAt) {
                timeDisplay = FormatUtils.formatDate(new Date(campaign.sentAt), 'YYYY-MM-DD HH:mm:ss');
            } else if (campaign.scheduledAt) {
                timeDisplay = FormatUtils.formatDate(new Date(campaign.scheduledAt), 'YYYY-MM-DD HH:mm:ss');
            }
            
            // 計算開信率與點擊率
            // recipient_count 在根目錄 (active count), 但 stats 裡有 totalRecipients/sentCount
            // 我們使用 stats 裡的數據來計算率，或者根目錄的 recipient_count
            // 注意: campaign.recipient_count 是 "active" recipients (如果計算過 details), 或者是原始 count
            // 為了計算率，我們應該使用實際發送數量 (sentCount)
            
            const sentCount = campaign.stats?.sentCount || campaign.recipient_count || 0;
            const openedCount = campaign.stats?.openedCount || 0;
            const clickedCount = campaign.stats?.clickedCount || 0;
            const cappedCount = campaign.stats?.cappedCount || 0;
            
            // 計算實際發送數（排除被頻率控管的）
            const actualSentCount = sentCount > cappedCount ? sentCount - cappedCount : sentCount;
            
            const openRate = actualSentCount > 0 ? ((openedCount / actualSentCount) * 100).toFixed(1) + '%' : '0.0%';
            const clickRate = actualSentCount > 0 ? ((clickedCount / actualSentCount) * 100).toFixed(1) + '%' : '0.0%';

            // 建構接收者顯示 HTML
            let recipientDisplay = `👥 ${campaign.recipient_count || 0}`;
            
            // 如果有被頻率控管的用戶，顯示在旁邊
            if (cappedCount > 0) {
                recipientDisplay += ` <span class="badge badge-warning" style="font-size:0.8em; padding: 2px 5px;" title="已達發送頻率上限: ${cappedCount} 位使用者">-${cappedCount}</span>`;
            }
            
            // 添加警告標示（針對無效信箱等）
            recipientDisplay += this.getRecipientCountWarning(campaign);

            return `
                <tr>
                    <td class="status-col"><span class="badge ${statusClass}">${statusText}</span></td>
                    <td>${campaign.name || campaign.subject || '(無名稱)'}</td>
                    <td>${timeDisplay}</td>
                    <td><span title="${this.getRecipientCountTooltip(campaign)}">${recipientDisplay}</span></td>
                    <td>${openRate}</td>
                    <td>${clickRate}</td>
                    <td>${campaign.createdByName || '未知'}</td>
                    <td>${createdDate}</td>
                </tr>
            `;
        }).join('');

        this.renderPagination();
    }

    // 獲取預計發送數量的提示文字
    getRecipientCountTooltip(row) {
        const cappedCount = row.stats?.cappedCount || 0;
        let baseTooltip = '';
        
        if (row.status === 'sent' || row.status === 'completed') {
            baseTooltip = '實際發送數量';
            if (cappedCount > 0) {
                baseTooltip += `\n(已排除 ${cappedCount} 位達到頻率上限的使用者)`;
            }
            return baseTooltip;
        }

        if (row.recipient_count_details && row.recipient_count_details.inactive > 0) {
            const d = row.recipient_count_details;
            let details = [];
            if (d.unsubscribed > 0) details.push(`退訂: ${d.unsubscribed}`);
            if (d.bounced > 0) details.push(`信箱無效: ${d.bounced}`);
            if (d.deleted > 0) details.push(`已刪除: ${d.deleted}`);
            // Fallback for older records or generic inactive
            if (details.length === 0) details.push(`無效/刪除: ${d.inactive}`);
            
            return `預計發送: ${row.recipient_count} (活躍)\n總訂閱者: ${d.total}\n差異原因:\n- ${details.join('\n- ')}`;
        }
        return '預計發送數量 (活躍訂閱者)';
    }

    // 獲取預計發送數量的警告標示
    getRecipientCountWarning(row) {
        if (row.recipient_count_details && row.recipient_count_details.inactive > 0) {
            return ' <span style="color: #f59e0b; cursor: help;">⚠️</span>';
        }
        return '';
    }

    // 獲取預計發送數量的詳細說明 HTML
    getRecipientCountDetails(row) {
        if (row.recipient_count_details && row.recipient_count_details.inactive > 0) {
            return `<div style="color: #d9534f; font-size: 0.8em;">(含 ${row.recipient_count_details.inactive} 位無效/刪除)</div>`;
        }
        return '';
    }

    // 更新分頁控制
    renderPagination() {
        const container = document.getElementById('campaignPagination');
        if (!container) return;

        const { page, totalPages } = this.data.campaignsPagination;
        
        if (totalPages <= 1) {
            container.innerHTML = '';
            return;
        }

        let html = '<div class="pagination">';
        
        // 上一頁
        html += `<button class="page-btn ${page === 1 ? 'disabled' : ''}" 
                 data-page="${page - 1}" 
                 ${page === 1 ? 'disabled' : ''}>&lt;</button>`;

        // 頁碼
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) {
                html += `<button class="page-btn ${i === page ? 'active' : ''}" 
                         data-page="${i}">${i}</button>`;
            } else if (i === page - 2 || i === page + 2) {
                html += '<span class="page-dots">...</span>';
            }
        }

        // 下一頁
        html += `<button class="page-btn ${page === totalPages ? 'disabled' : ''}" 
                 data-page="${page + 1}" 
                 ${page === totalPages ? 'disabled' : ''}>&gt;</button>`;
        
        html += '</div>';
        
        container.innerHTML = html;

        // 綁定事件
        const buttons = container.querySelectorAll('.page-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const page = parseInt(e.target.dataset.page);
                if (page && !e.target.disabled) this.changePage(page);
            });
        });
    }

    // 切換頁面
    changePage(newPage) {
        if (newPage < 1 || newPage > this.data.campaignsPagination.totalPages) return;
        this.loadAllCampaigns(newPage);
    }

    getCampaignStatusText(status) {
        if (!status) return '未知狀態';
        const statusMap = {
            'draft': '草稿',
            'scheduled': '排程中',
            'sending': '發送中',
            'sent': '已發送',
            'completed': '已完成',
            'failed': '發送失敗',
            'pending_approval': '審核中',
            'approved': '審核通過，待寄送',
            'rejected': '已退回',
            'paused': '已暫停',
            'returned': '尚未完成',
            'cancelled': '已取消'
        };
        return statusMap[status] || status;
    }
    
    getCampaignStatusClass(status) {
        // success, warning, error, info
        switch (status) {
            case 'sent':
            case 'completed':
            case 'approved':
                return 'success';
            case 'draft':
            case 'pending_approval':
            case 'scheduled':
                return 'warning';
            case 'preparing':
            case 'processing':
            case 'sending':
            case 'paused':
                return 'info';
            case 'failed':
            case 'rejected':
            case 'returned':
            case 'cancelled':
                return 'error';
            default:
                return 'info';
        }
    }

    // 初始化圖表
    initializeCharts() {
        this.initializeSubscriberChart();
        this.initializePerformanceChart();
    }
    
    // 更新圖表
    updateCharts() {
        // 重新初始化所有圖表
        this.initializeCharts();
    }
    
    // 初始化訂閱者成長圖表
    initializeSubscriberChart() {
        const chartContainer = DOMUtils.select('#subscriberChart');
        if (!chartContainer) return;
        
        // 簡單的 SVG 圖表實現
        const data = this.data.charts.subscriberGrowth;
        const chartHTML = this.createLineChart(data, {
            title: '訂閱者成長趨勢',
            color: '#4F46E5',
            height: 200
        });
        
        chartContainer.innerHTML = chartHTML;
    }
    
    // 初始化效能圖表
    initializePerformanceChart() {
        const chartContainer = DOMUtils.select('#performanceChart');
        if (!chartContainer) return;
        
        const data = this.data.charts.emailPerformance;
        const chartHTML = this.createBarChart(data, {
            title: '電子報效能',
            colors: ['#10B981', '#F59E0B'],
            height: 200
        });
        
        chartContainer.innerHTML = chartHTML;
    }
    
    // 創建線圖
    createLineChart(data, options) {
        const { title, color, height } = options;
        
        if (!data || data.length === 0) {
            return `
                <div class="chart-header">
                    <h3>${title}</h3>
                </div>
                <div class="chart-empty" style="height: ${height}px; display: flex; align-items: center; justify-content: center; color: #6b7280;">
                    暫無數據
                </div>
            `;
        }

        const maxValue = Math.max(...data.map(d => d.value));
        const points = data.map((d, i) => {
            const x = (i / (data.length - 1)) * 100;
            const y = maxValue === 0 ? 100 : 100 - (d.value / maxValue) * 80;
            return `${x},${y}`;
        }).join(' ');
        
        return `
            <div class="chart-header">
                <h3>${title}</h3>
            </div>
            <svg class="chart-svg" viewBox="0 0 100 100" style="height: ${height}px;">
                <polyline
                    fill="none"
                    stroke="${color}"
                    stroke-width="2"
                    points="${points}"
                />
                ${data.map((d, i) => {
                    const x = (i / (data.length - 1)) * 100;
                    const y = maxValue === 0 ? 100 : 100 - (d.value / maxValue) * 80;
                    return `<circle cx="${x}" cy="${y}" r="2" fill="${color}" />`;
                }).join('')}
            </svg>
            <div class="chart-labels">
                ${data.slice(0, 5).map(d => `<span>${d.date}</span>`).join('')}
            </div>
        `;
    }
    
    // 創建柱狀圖
    createBarChart(data, options) {
        const { title, colors, height } = options;
        
        if (!data || data.length === 0) {
            return `
                <div class="chart-header">
                    <h3>${title}</h3>
                </div>
                <div class="chart-empty" style="height: ${height}px; display: flex; align-items: center; justify-content: center; color: #6b7280;">
                    暫無數據
                </div>
            `;
        }

        const maxValue = Math.max(...data.flatMap(d => [d.opens, d.clicks]));
        
        return `
            <div class="chart-header">
                <h3>${title}</h3>
                <div class="chart-legend">
                    <span class="legend-item">
                        <span class="legend-color" style="background: ${colors[0]}"></span>
                        開信數
                    </span>
                    <span class="legend-item">
                        <span class="legend-color" style="background: ${colors[1]}"></span>
                        點擊數
                    </span>
                </div>
            </div>
            <svg class="chart-svg" viewBox="0 0 100 100" style="height: ${height}px;">
                ${data.slice(-7).map((d, i) => {
                    const x = i * 14;
                    const openHeight = (d.opens / maxValue) * 80;
                    const clickHeight = (d.clicks / maxValue) * 80;
                    
                    return `
                        <rect x="${x}" y="${100 - openHeight}" width="6" height="${openHeight}" fill="${colors[0]}" />
                        <rect x="${x + 7}" y="${100 - clickHeight}" width="6" height="${clickHeight}" fill="${colors[1]}" />
                    `;
                }).join('')}
            </svg>
        `;
    }
    
    // 設定自動刷新
    setupAutoRefresh() {
        // 清除現有的定時器
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        
        // 設定 5 分鐘自動刷新
        this.refreshInterval = setInterval(() => {
            if (!this.isLoading) {
                this.refreshData();
            }
        }, 5 * 60 * 1000);
    }
    
    // 刷新數據
    async refreshData() {
        try {
            console.log('自動刷新儀表板數據...');
            await this.loadData();
            this.updateUI();
            NotificationUtils.show('數據已更新', 'success', 2000);
        } catch (error) {
            console.error('自動刷新失敗:', error);
        }
    }
    
    // 手動刷新
    async manualRefresh() {
        if (this.isLoading) return;
        
        try {
            this.setLoadingState(true);
            await this.loadData();
            this.updateUI();
            NotificationUtils.show('數據刷新成功', 'success');
        } catch (error) {
            NotificationUtils.show('數據刷新失敗', 'error');
        } finally {
            this.setLoadingState(false);
        }
    }
    
    // 銷毀
    destroy() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }
}

// 全域儀表板實例
let dashboard = null;

// 頁面載入完成後初始化儀表板
document.addEventListener('DOMContentLoaded', function() {
    initializeDashboard();
});

// 初始化儀表板
async function initializeDashboard() {
    try {
        dashboard = new DashboardManager();
        await dashboard.initialize();
        
        // 設定刷新按鈕
        setupRefreshButton();
        
        // 設定操作按鈕
        setupActionButtons();
        
        // 設定快捷鍵
        setupKeyboardShortcuts();
        
    } catch (error) {
        console.error('儀表板初始化失敗:', error);
        NotificationUtils.show('儀表板初始化失敗', 'error');
    }
}

// 設定刷新按鈕
function setupRefreshButton() {
    const refreshBtn = DOMUtils.select('#refreshBtn');
    if (refreshBtn) {
        EventUtils.on(refreshBtn, 'click', () => {
            dashboard.manualRefresh();
        });
    }
}

// 設定操作按鈕
function setupActionButtons() {
    const createCampaignBtn = DOMUtils.select('#createCampaignBtn');
    if (createCampaignBtn) {
        EventUtils.on(createCampaignBtn, 'click', () => {
            window.location.href = 'campaigns.html';
        });
    }
    
    const manageSubscribersBtn = DOMUtils.select('#manageSubscribersBtn');
    if (manageSubscribersBtn) {
        EventUtils.on(manageSubscribersBtn, 'click', () => {
            window.location.href = 'subscribers.html';
        });
    }
    
    const editTemplatesBtn = DOMUtils.select('#editTemplatesBtn');
    if (editTemplatesBtn) {
        EventUtils.on(editTemplatesBtn, 'click', () => {
            window.location.href = 'templates.html';
        });
    }

    const viewAnalyticsBtn = DOMUtils.select('#viewAnalyticsBtn');
    if (viewAnalyticsBtn) {
        EventUtils.on(viewAnalyticsBtn, 'click', () => {
            window.location.href = 'analytics.html';
        });
    }
}

// 設定鍵盤快捷鍵
function setupKeyboardShortcuts() {
    EventUtils.on(document, 'keydown', (event) => {
        // Ctrl/Cmd + R: 刷新數據
        if ((event.ctrlKey || event.metaKey) && event.key === 'r') {
            event.preventDefault();
            dashboard.manualRefresh();
        }
    });
}

// 頁面卸載時清理
window.addEventListener('beforeunload', () => {
    if (dashboard) {
        dashboard.destroy();
    }
});

// 匯出全域函數
window.dashboard = dashboard;