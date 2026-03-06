/**
 * 通知系統模組
 * 處理各種類型的通知顯示
 */
class NotificationService {
    constructor() {
        this.container = null;
        this.notifications = new Map();
        this.init();
    }

    /**
     * 初始化通知容器
     */
    init() {
        // 創建通知容器
        this.container = document.createElement('div');
        this.container.id = 'notification-container';
        this.container.className = 'notification-container';
        document.body.appendChild(this.container);

        // 添加樣式
        this.addStyles();
    }

    /**
     * 添加通知樣式
     */
    addStyles() {
        if (document.getElementById('notification-styles')) return;

        const style = document.createElement('style');
        style.id = 'notification-styles';
        style.textContent = `
            .notification-container {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10000;
                max-width: 400px;
            }

            .notification {
                background: white;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                margin-bottom: 10px;
                padding: 16px;
                border-left: 4px solid #007bff;
                position: relative;
                overflow: hidden;
            }

            .notification.success {
                border-left-color: #28a745;
            }

            .notification.error {
                border-left-color: #dc3545;
            }

            .notification.warning {
                border-left-color: #ffc107;
            }

            .notification.info {
                border-left-color: #17a2b8;
            }

            .notification-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 8px;
            }

            .notification-title {
                font-weight: 600;
                font-size: 14px;
                color: #333;
            }

            .notification-close {
                background: none;
                border: none;
                font-size: 18px;
                color: #999;
                cursor: pointer;
                padding: 0;
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .notification-close:hover {
                color: #666;
            }

            .notification-message {
                font-size: 13px;
                color: #666;
                line-height: 1.4;
                text-align: center;
                margin-top: 4px;
            }

            .notification-progress {
                position: absolute;
                bottom: 0;
                left: 0;
                height: 3px;
                background: rgba(0, 0, 0, 0.1);
                transition: width linear;
            }

            .notification.success .notification-progress {
                background: #28a745;
            }

            .notification.error .notification-progress {
                background: #dc3545;
            }

            .notification.warning .notification-progress {
                background: #ffc107;
            }

            .notification.info .notification-progress {
                background: #17a2b8;
            }

            /* 按鈕樣式 */
            .notification .btn {
                padding: 6px 12px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                font-weight: 500;
                text-decoration: none;
                display: inline-block;
                transition: background-color 0.2s;
            }

            .notification .btn-primary {
                background-color: #007bff;
                color: white;
            }

            .notification .btn-primary:hover {
                background-color: #0056b3;
            }

            .notification .btn-secondary {
                background-color: #6c757d;
                color: white;
            }

            .notification .btn-secondary:hover {
                background-color: #545b62;
            }

            .notification .btn-sm {
                padding: 4px 8px;
                font-size: 11px;
            }

            .notification-actions {
                margin-top: 16px;
                display: flex;
                justify-content: center;
                gap: 16px;
            }

            /* 確保沒有動畫效果 */
            .notification {
                animation: none !important;
                transform: none !important;
                transition: none !important;
            }


        `;
        document.head.appendChild(style);
    }

    /**
     * 顯示通知
     */
    show(message, type = 'info', options = {}) {
        const {
            title = this.getDefaultTitle(type),
            duration = 0, // 預設為 0，不自動消失
            persistent = true, // 預設為持久顯示
            showProgress = false // 預設不顯示進度條
        } = options;

        const id = this.generateId();
        const notification = this.createNotification(id, title, message, type, {
            persistent,
            showProgress,
            duration
        });

        this.container.appendChild(notification);
        this.notifications.set(id, notification);

        // 移除自動消失機制 - 所有通知都需要用戶手動關閉
        // 只有在明確設定 duration > 0 且 persistent = false 時才自動移除
        if (!persistent && duration > 0) {
            this.scheduleRemoval(id, duration);
        }

        return id;
    }

    /**
     * 創建通知元素
     */
    createNotification(id, title, message, type, options) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.dataset.id = id;

        notification.innerHTML = `
            <div class="notification-header">
                <div class="notification-title">${title}</div>
                <button class="notification-close" type="button">&times;</button>
            </div>
            <div class="notification-message">${message}</div>
            ${options.showProgress ? '<div class="notification-progress"></div>' : ''}
        `;

        // 添加關閉按鈕事件
        const closeBtn = notification.querySelector('.notification-close');
        closeBtn.addEventListener('click', () => this.remove(id));

        // 添加進度條動畫
        if (options.showProgress && options.duration > 0) {
            const progress = notification.querySelector('.notification-progress');
            if (progress) {
                setTimeout(() => {
                    progress.style.width = '100%';
                    progress.style.transition = `width ${options.duration}ms linear`;
                }, 100);
            }
        }

        return notification;
    }

    /**
     * 移除通知
     */
    remove(id) {
        const notification = this.notifications.get(id);
        if (!notification) return;

        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
        this.notifications.delete(id);
    }

    /**
     * 安排自動移除
     */
    scheduleRemoval(id, duration) {
        setTimeout(() => {
            this.remove(id);
        }, duration);
    }

    /**
     * 獲取默認標題
     */
    getDefaultTitle(type) {
        const titles = {
            success: '成功',
            error: '錯誤',
            warning: '警告',
            info: '信息'
        };
        return titles[type] || '通知';
    }

    /**
     * 生成唯一 ID
     */
    generateId() {
        return 'notification_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * 清除所有通知
     */
    clear() {
        this.notifications.forEach((notification, id) => {
            this.remove(id);
        });
    }

    /**
     * 快捷方法
     */
    success(message, options = {}) {
        return this.show(message, 'success', { persistent: false, duration: 3000, ...options });
    }

    error(message, options = {}) {
        return this.show(message, 'error', { persistent: false, duration: 5000, ...options });
    }

    warning(message, options = {}) {
        return this.show(message, 'warning', { persistent: false, duration: 5000, ...options });
    }

    info(message, options = {}) {
        return this.show(message, 'info', { persistent: false, duration: 3000, ...options });
    }

    /**
     * 顯示載入通知
     */
    loading(message = '載入中...', options = {}) {
        return this.show(message, 'info', {
            persistent: true,
            showProgress: false,
            ...options
        });
    }

    /**
     * 顯示確認通知
     */
    confirm(message, onConfirm, onCancel = null) {
        const id = this.generateId();
        const notification = document.createElement('div');
        notification.className = 'notification warning';
        notification.dataset.id = id;

        notification.innerHTML = `
            <div class="notification-header">
                <div class="notification-title">確認</div>
                <button class="notification-close" type="button">&times;</button>
            </div>
            <div class="notification-message">${message}</div>
            <div class="notification-actions">
                <button class="btn btn-sm btn-secondary me-2" data-action="cancel">取消</button>
                <button class="btn btn-sm btn-primary" data-action="confirm">確認</button>
            </div>
        `;

        // 添加事件監聽器
        notification.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            if (action === 'confirm') {
                onConfirm();
                this.remove(id);
            } else if (action === 'cancel' || e.target.classList.contains('notification-close')) {
                if (onCancel) onCancel();
                this.remove(id);
            }
        });

        this.container.appendChild(notification);
        this.notifications.set(id, notification);

        return id;
    }
}

// 創建全局實例
window.notification = new NotificationService();
