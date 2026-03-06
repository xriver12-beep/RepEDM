class ActivitiesManager {
    constructor() {
        this.activitiesContainer = document.getElementById('activitiesContainer');
        this.paginationContainer = document.getElementById('pagination');
        this.searchInput = document.getElementById('searchActivity');
        this.filterType = document.getElementById('filterType');
        this.refreshBtn = document.getElementById('refreshBtn');
        
        this.currentPage = 1;
        this.itemsPerPage = 20;
        this.activities = [];
        this.filteredActivities = [];

        this.init();
    }

    async init() {
        this.attachEventListeners();
        await this.loadActivities();
    }

    attachEventListeners() {
        if (this.refreshBtn) {
            this.refreshBtn.addEventListener('click', () => this.loadActivities());
        }

        if (this.searchInput) {
            this.searchInput.addEventListener('input', () => this.filterActivities());
        }

        if (this.filterType) {
            this.filterType.addEventListener('change', () => this.filterActivities());
        }
    }

    async loadActivities() {
        this.showLoading();
        
        try {
            // 嘗試從後端獲取數據
            // 使用正確的 API 端點 /dashboard/activities
            const response = await apiService.fetchOptional('/dashboard/activities', { 
                success: false, 
                data: [] 
            });
            
            if (response && response.success && Array.isArray(response.data)) {
                this.activities = response.data;
            } else if (Array.isArray(response)) {
                this.activities = response; // 兼容直接返回數組的情況
            } else {
                // 如果 API 失敗，清空列表
                console.warn('無法獲取活動數據');
                this.activities = [];
            }

            this.filterActivities();
        } catch (error) {
            console.error('載入活動失敗:', error);
            this.activitiesContainer.innerHTML = `<div class="text-center text-danger">載入失敗: ${error.message}</div>`;
        }
    }

    filterActivities() {
        const searchTerm = this.searchInput ? this.searchInput.value.toLowerCase() : '';
        const typeFilter = this.filterType ? this.filterType.value : 'all';

        this.filteredActivities = this.activities.filter(activity => {
            const matchesSearch = (activity.title && activity.title.toLowerCase().includes(searchTerm)) || 
                                  (activity.description && activity.description.toLowerCase().includes(searchTerm));
            const matchesType = typeFilter === 'all' || activity.type === typeFilter;
            
            return matchesSearch && matchesType;
        });

        this.currentPage = 1;
        this.renderActivities();
        this.renderPagination();
    }

    renderActivities() {
        if (!this.activitiesContainer) return;

        if (this.filteredActivities.length === 0) {
            this.activitiesContainer.innerHTML = '<div class="text-center p-4 text-muted">沒有找到活動記錄</div>';
            return;
        }

        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const pageItems = this.filteredActivities.slice(startIndex, endIndex);

        const html = pageItems.map(activity => this.createActivityItem(activity)).join('');
        this.activitiesContainer.innerHTML = html;
    }

    createActivityItem(activity) {
        // 根據類型決定顏色
        let colorClass = 'blue';
        if (activity.type === 'subscriber') colorClass = 'green';
        if (activity.type === 'template') colorClass = 'orange';
        if (activity.type === 'system') colorClass = 'gray';
        if (activity.color) colorClass = activity.color; // 優先使用 API 返回的顏色

        const timeString = this.formatTime(activity.timestamp || activity.created_at);

        return `
            <div class="activity-item">
                <div class="activity-indicator ${colorClass}"></div>
                <div class="activity-content">
                    <div class="activity-title">${activity.title || '未命名活動'}</div>
                    <div class="activity-description">${activity.description || ''}</div>
                    <div class="activity-time">${timeString}</div>
                </div>
            </div>
        `;
    }

    renderPagination() {
        if (!this.paginationContainer) return;

        const totalPages = Math.ceil(this.filteredActivities.length / this.itemsPerPage);
        
        if (totalPages <= 1) {
            this.paginationContainer.innerHTML = '';
            return;
        }

        let html = '';
        
        // 上一頁
        html += `<button class="page-btn" ${this.currentPage === 1 ? 'disabled' : ''} onclick="activitiesManager.changePage(${this.currentPage - 1})">&lt;</button>`;
        
        // 頁碼 (簡化版，只顯示當前附近的頁碼)
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= this.currentPage - 2 && i <= this.currentPage + 2)) {
                html += `<button class="page-btn ${i === this.currentPage ? 'active' : ''}" onclick="activitiesManager.changePage(${i})">${i}</button>`;
            } else if (i === this.currentPage - 3 || i === this.currentPage + 3) {
                html += `<span class="px-2">...</span>`;
            }
        }
        
        // 下一頁
        html += `<button class="page-btn" ${this.currentPage === totalPages ? 'disabled' : ''} onclick="activitiesManager.changePage(${this.currentPage + 1})">&gt;</button>`;

        this.paginationContainer.innerHTML = html;
    }

    changePage(page) {
        if (page < 1 || page > Math.ceil(this.filteredActivities.length / this.itemsPerPage)) return;
        this.currentPage = page;
        this.renderActivities();
        this.renderPagination();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    formatTime(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        // 如果是今天，顯示 "2 小時前" 之類的
        const now = new Date();
        const diffMs = now - date;
        const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
        
        if (diffHrs < 24) {
            if (diffHrs === 0) {
                const diffMins = Math.floor(diffMs / (1000 * 60));
                return `${diffMins} 分鐘前`;
            }
            return `${diffHrs} 小時前`;
        }
        
        return date.toLocaleString('zh-TW', { hour12: false });
    }

    showLoading() {
        if (this.activitiesContainer) {
            this.activitiesContainer.innerHTML = '<div class="text-center p-5"><i class="fas fa-spinner fa-spin fa-2x"></i><div class="mt-2">載入中...</div></div>';
        }
    }
}

// 初始化
let activitiesManager;
document.addEventListener('DOMContentLoaded', () => {
    activitiesManager = new ActivitiesManager();
    // 暴露給全域以便 HTML onclick 調用
    window.activitiesManager = activitiesManager;
});
