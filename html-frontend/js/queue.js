
class QueueManager {
    constructor() {
        this.currentPage = 1;
        this.pageSize = 20;
        this.totalItems = 0;
        this.autoRefreshInterval = null;
        this.trafficChart = null;

        this.init();
    }

    async init() {
        this.bindEvents();
        await this.loadStats();
        await this.loadQueue();
        
        // Auto refresh stats every 10 seconds
        this.startAutoRefresh();
    }

    bindEvents() {
        // Filter change
        document.getElementById('statusFilter').addEventListener('change', () => {
            this.currentPage = 1;
            this.loadQueue();
        });

        // Search
        const searchInput = document.getElementById('searchInput');
        let debounceTimer;
        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                this.currentPage = 1;
                this.loadQueue();
            }, 500);
        });

        // Refresh button
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.loadStats();
            this.loadQueue();
        });

        // Pagination
        document.getElementById('prevPage').addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.loadQueue();
            }
        });

        document.getElementById('nextPage').addEventListener('click', () => {
            const totalPages = Math.ceil(this.totalItems / this.pageSize);
            if (this.currentPage < totalPages) {
                this.currentPage++;
                this.loadQueue();
            }
        });

        // Active Campaign Actions (Delegation)
        const activeList = document.getElementById('activeCampaignsList');
        if (activeList) {
            activeList.addEventListener('click', async (e) => {
                if (e.target.classList.contains('cancel-campaign-btn')) {
                    const id = e.target.dataset.id;
                    const name = e.target.dataset.name;
                    if (confirm(`確定要取消活動 "${name}" 嗎？\n取消後將停止所有尚未發送的郵件。`)) {
                        await this.cancelCampaign(id);
                    }
                }
            });
        }
    }

    async cancelCampaign(id) {
        try {
            const response = await apiClient.post(`/campaigns/${id}/cancel`);
            if (response.success) {
                alert('活動已取消');
                this.loadStats(); // Reload active campaigns
                this.loadQueue(); // Reload queue list to show status changes
            } else {
                alert('取消失敗: ' + (response.message || '未知錯誤'));
            }
        } catch (error) {
            console.error('Cancel failed:', error);
            alert('取消失敗: ' + (error.message || '無法連接伺服器'));
        }
    }

    startAutoRefresh() {
        if (this.autoRefreshInterval) clearInterval(this.autoRefreshInterval);
        this.autoRefreshInterval = setInterval(() => {
            this.loadStats();
            // Optional: refresh list if on first page
            if (this.currentPage === 1) {
                this.loadQueue();
            }
        }, 10000); // 10 seconds
    }

    async loadStats() {
        try {
            // Add timestamp to bypass cache
            const response = await apiClient.get('/queue/stats', { _t: Date.now() });
            if (response.success) {
                this.updateStatsUI(response);
            }
        } catch (error) {
            console.error('Failed to load stats:', error);
        }
    }

    updateStatsUI(data) {
        // Update counters
        const stats = data.queueStats || {};
        document.getElementById('statTotal').textContent = stats.total_queue || 0;
        document.getElementById('statActive').textContent = stats.active_count || 0;
        document.getElementById('statSent').textContent = stats.sent_count || 0;
        document.getElementById('statPending').textContent = stats.pending_count || 0;
        document.getElementById('statDeferred').textContent = stats.deferred_count || 0;
        document.getElementById('statHeld').textContent = stats.held_count || 0;
        document.getElementById('statFailed').textContent = stats.failed_count || 0;

        // Render Traffic Chart
        this.renderTrafficChart(data.trafficTrend || []);

        // Update Active Campaigns
        const activeSection = document.getElementById('activeCampaignsSection');
        const activeList = document.getElementById('activeCampaignsList');
        
        if (data.activeCampaigns && data.activeCampaigns.length > 0) {
            activeSection.style.display = 'block';
            activeList.innerHTML = data.activeCampaigns.map(campaign => {
                const total = campaign.total_recipients || 0;
                const sent = campaign.sent_count || 0;
                const failed = campaign.failed_count || 0;
                const pending = campaign.pending_count || 0;
                const processed = sent + failed;
                const percent = total > 0 ? Math.round((processed / total) * 100) : 0;
                
                return `
                <div style="padding: 15px; border-bottom: 1px solid #eee;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                        <div>
                            <strong>${this.escapeHtml(campaign.name)}</strong>
                            <span class="status-badge status-${campaign.status === 'sending' ? 'sending' : 'pending'}">
                                ${this.getStatusLabel(campaign.status)}
                            </span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            ${['sending', 'pending_approval', 'scheduled', 'approved', 'pending'].includes(campaign.status) ? 
                                `<button class="btn btn-sm btn-danger cancel-campaign-btn" data-id="${campaign.id}" data-name="${this.escapeHtml(campaign.name)}" style="padding: 2px 8px; font-size: 12px; background-color: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;">取消</button>` : ''
                            }
                            <small class="text-muted">
                                排程: ${new Date(campaign.scheduled_at || campaign.created_at).toLocaleString()}
                            </small>
                        </div>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.9em; color: #666; margin-bottom: 5px;">
                        <span>進度: ${percent}% (${processed}/${total})</span>
                        <span>
                            <span style="color: #28a745;">成功: ${sent}</span> | 
                            <span style="color: #dc3545;">失敗: ${failed}</span> | 
                            <span style="color: #ffc107;">等待: ${pending}</span>
                        </span>
                    </div>
                    <div style="background: #e9ecef; height: 8px; border-radius: 4px; overflow: hidden;">
                        <div style="background: #28a745; width: ${percent}%; height: 100%; transition: width 0.5s ease;"></div>
                    </div>
                </div>
            `}).join('');
        } else {
            activeSection.style.display = 'none';
        }
    }

    renderTrafficChart(trendData) {
        const ctx = document.getElementById('trafficChart');
        if (!ctx) return;

        // Prepare data
        // trendData is array of { hour: 14, count: 100 }
        // 改為顯示當日 00:00 ~ 23:00
        const labels = [];
        const dataPoints = [];
        
        for (let i = 0; i < 24; i++) {
            labels.push(`${i}:00`);
            
            // Find data for this hour
            const match = trendData.find(item => item.hour === i);
            dataPoints.push(match ? match.count : 0);
        }

        if (this.trafficChart) {
            this.trafficChart.data.labels = labels;
            this.trafficChart.data.datasets[0].data = dataPoints;
            this.trafficChart.update();
            return;
        }

        // Validate existing chart instance
        if (typeof Chart !== 'undefined' && Chart.getChart) {
            const existingChart = Chart.getChart(ctx);
            if (existingChart) {
                console.log('Found existing chart on canvas, destroying...');
                existingChart.destroy();
            }
        }

        if (typeof Chart === 'undefined') {
            console.error('Chart.js library is not loaded');
            return;
        }

        this.trafficChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: '發送量 (封/小時)',
                    data: dataPoints,
                    borderColor: '#007bff',
                    backgroundColor: 'rgba(0, 123, 255, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            borderDash: [2, 4]
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        }
                    }
                }
            }
        });
    }

    async loadQueue() {
        const tbody = document.getElementById('queueTableBody');
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">載入中...</td></tr>';

        try {
            const status = document.getElementById('statusFilter').value;
            const search = document.getElementById('searchInput').value;

            const queryParams = new URLSearchParams({
                page: this.currentPage,
                limit: this.pageSize,
                status: status,
                search: search,
                _t: Date.now() // Add timestamp to bypass cache
            });

            const response = await apiClient.get(`/queue?${queryParams.toString()}`);
            
            if (response.success) {
                this.renderTable(response.data);
                this.updatePagination(response.pagination);
            } else {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: red;">載入失敗</td></tr>';
            }
        } catch (error) {
            console.error('Failed to load queue:', error);
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: red;">發生錯誤: ${error.message}</td></tr>`;
        }
    }

    renderTable(items) {
        const tbody = document.getElementById('queueTableBody');
        
        if (!items || items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">無資料</td></tr>';
            return;
        }

        tbody.innerHTML = items.map(item => `
            <tr>
                <td>${item.arrival_time ? new Date(item.arrival_time).toLocaleString() : '-'}</td>
                <td>${this.escapeHtml(item.campaign_name || 'Unknown')}</td>
                <td>${this.escapeHtml(item.subject || '-')}</td>
                <td>${this.escapeHtml(item.sender || '-')}</td>
                <td>${this.escapeHtml(item.recipient)}</td>
                <td>
                    <span class="status-badge status-${item.status}">
                        ${this.getStatusLabel(item.status)}
                    </span>
                </td>
                <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${this.escapeHtml(item.error_log || '')}">
                    ${this.escapeHtml(item.error_log || '-')}
                </td>
            </tr>
        `).join('');
    }

    updatePagination(pagination) {
        this.totalItems = pagination.total;
        const totalPages = pagination.totalPages;

        const info = document.getElementById('paginationInfo');
        const start = (this.currentPage - 1) * this.pageSize + 1;
        const end = Math.min(start + this.pageSize - 1, this.totalItems);
        info.textContent = `顯示 ${this.totalItems === 0 ? 0 : start}-${end} 項，共 ${this.totalItems} 項`;

        document.getElementById('prevPage').disabled = this.currentPage <= 1;
        document.getElementById('nextPage').disabled = this.currentPage >= totalPages;

        const pageNumbers = document.getElementById('pageNumbers');
        pageNumbers.innerHTML = `<span>第 ${this.currentPage} 頁 / 共 ${totalPages || 1} 頁</span>`;
    }

    getStatusLabel(status) {
        const map = {
            'pending': '等待中',
            'processing': '處理中',
            'sent': '已發送',
            'failed': '失敗',
            'deferred': '延遲',
            'held': '保留',
            'corrupt': '損壞',
            'cancelled': '已取消',
            'scheduled': '已排程',
            'approved': '已核准',
            'pending_approval': '審核中',
            'sending': '發送中'
        };
        return map[status] || status;
    }

    escapeHtml(unsafe) {
        if (!unsafe && unsafe !== 0) return '';
        return String(unsafe)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize AdminAuthGuard
    if (typeof AdminAuthGuard === 'undefined') {
        console.error('AdminAuthGuard not defined');
        return;
    }

    const authGuard = new AdminAuthGuard();
    
    try {
        await authGuard.init();
        
        // Check if authenticated
        if (window.adminAuth && window.adminAuth.isAuthenticated()) {
            window.queueManager = new QueueManager();
            
            // Update User Interface
            const user = await window.adminAuth.getCurrentUser();
            if (user && authGuard.updateUserInterface) {
                authGuard.updateUserInterface(user);
            }
        }
    } catch (error) {
        console.error('Auth initialization failed:', error);
    }
});
