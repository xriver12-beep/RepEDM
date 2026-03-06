// 狀態管理模組 - 集中管理應用程式狀態

class StateManager {
    constructor() {
        this.state = {};
        this.listeners = {};
        this.middleware = [];
        this.history = [];
        this.maxHistorySize = 50;
    }

    // 設置狀態
    setState(path, value, silent = false) {
        const oldState = DataUtils.deepClone(this.state);
        
        // 支援深層路徑設置 (例如: 'user.profile.name')
        if (typeof path === 'string' && path.includes('.')) {
            this._setNestedValue(this.state, path, value);
        } else if (typeof path === 'object') {
            // 批量設置
            Object.keys(path).forEach(key => {
                this._setNestedValue(this.state, key, path[key]);
            });
        } else {
            this.state[path] = value;
        }

        // 記錄歷史
        this._addToHistory(oldState, this.state, path);

        // 執行中間件
        this._runMiddleware('setState', { path, value, oldState, newState: this.state });

        // 通知監聽器
        if (!silent) {
            this._notifyListeners(path, value, oldState);
        }

        return this;
    }

    // 獲取狀態
    getState(path = null) {
        if (!path) return DataUtils.deepClone(this.state);
        
        if (typeof path === 'string' && path.includes('.')) {
            return this._getNestedValue(this.state, path);
        }
        
        return DataUtils.deepClone(this.state[path]);
    }

    // 監聽狀態變化
    subscribe(path, callback) {
        if (!this.listeners[path]) {
            this.listeners[path] = [];
        }
        
        this.listeners[path].push(callback);

        // 返回取消訂閱函數
        return () => {
            const index = this.listeners[path].indexOf(callback);
            if (index > -1) {
                this.listeners[path].splice(index, 1);
            }
        };
    }

    // 取消監聽
    unsubscribe(path, callback = null) {
        if (!this.listeners[path]) return;

        if (callback) {
            const index = this.listeners[path].indexOf(callback);
            if (index > -1) {
                this.listeners[path].splice(index, 1);
            }
        } else {
            delete this.listeners[path];
        }
    }

    // 添加中間件
    use(middleware) {
        this.middleware.push(middleware);
        return this;
    }

    // 重置狀態
    reset(keepHistory = false) {
        const oldState = DataUtils.deepClone(this.state);
        this.state = {};
        
        if (!keepHistory) {
            this.history = [];
        }

        this._notifyListeners('*', {}, oldState);
        return this;
    }

    // 撤銷操作
    undo() {
        if (this.history.length > 1) {
            this.history.pop(); // 移除當前狀態
            const previousState = this.history[this.history.length - 1];
            this.state = DataUtils.deepClone(previousState.state);
            this._notifyListeners('*', this.state, previousState.state);
        }
        return this;
    }

    // 獲取狀態歷史
    getHistory() {
        return this.history.map(item => ({
            timestamp: item.timestamp,
            action: item.action,
            path: item.path
        }));
    }

    // 計算衍生狀態
    computed(path, computeFn, dependencies = []) {
        const compute = () => {
            const deps = dependencies.map(dep => this.getState(dep));
            const result = computeFn(...deps, this.getState());
            this.setState(path, result, true); // 靜默設置，避免循環
        };

        // 初始計算
        compute();

        // 監聽依賴變化
        dependencies.forEach(dep => {
            this.subscribe(dep, compute);
        });

        return this;
    }

    // 批量操作
    batch(operations) {
        const oldState = DataUtils.deepClone(this.state);
        
        operations.forEach(op => {
            if (op.type === 'set') {
                this.setState(op.path, op.value, true);
            } else if (op.type === 'delete') {
                this._deleteNestedValue(this.state, op.path);
            }
        });

        this._addToHistory(oldState, this.state, 'batch');
        this._notifyListeners('*', this.state, oldState);
        
        return this;
    }

    // 私有方法：設置嵌套值
    _setNestedValue(obj, path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        const target = keys.reduce((current, key) => {
            if (!current[key] || typeof current[key] !== 'object') {
                current[key] = {};
            }
            return current[key];
        }, obj);
        target[lastKey] = value;
    }

    // 私有方法：獲取嵌套值
    _getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => {
            return current && current[key] !== undefined ? current[key] : undefined;
        }, obj);
    }

    // 私有方法：刪除嵌套值
    _deleteNestedValue(obj, path) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        const target = keys.reduce((current, key) => {
            return current && current[key] ? current[key] : null;
        }, obj);
        if (target) {
            delete target[lastKey];
        }
    }

    // 私有方法：通知監聽器
    _notifyListeners(path, value, oldState) {
        // 通知具體路徑的監聽器
        if (this.listeners[path]) {
            this.listeners[path].forEach(callback => {
                try {
                    callback(value, oldState, path);
                } catch (error) {
                    console.error('State listener error:', error);
                }
            });
        }

        // 通知全域監聽器
        if (this.listeners['*']) {
            this.listeners['*'].forEach(callback => {
                try {
                    callback(this.state, oldState, path);
                } catch (error) {
                    console.error('Global state listener error:', error);
                }
            });
        }

        // 通知父路徑監聽器
        if (typeof path === 'string' && path.includes('.')) {
            const pathParts = path.split('.');
            for (let i = pathParts.length - 1; i > 0; i--) {
                const parentPath = pathParts.slice(0, i).join('.');
                if (this.listeners[parentPath]) {
                    const parentValue = this._getNestedValue(this.state, parentPath);
                    this.listeners[parentPath].forEach(callback => {
                        try {
                            callback(parentValue, oldState, parentPath);
                        } catch (error) {
                            console.error('Parent state listener error:', error);
                        }
                    });
                }
            }
        }
    }

    // 私有方法：執行中間件
    _runMiddleware(action, data) {
        this.middleware.forEach(middleware => {
            try {
                middleware(action, data, this);
            } catch (error) {
                console.error('Middleware error:', error);
            }
        });
    }

    // 私有方法：添加到歷史
    _addToHistory(oldState, newState, action) {
        this.history.push({
            state: oldState,
            timestamp: Date.now(),
            action: action
        });

        // 限制歷史大小
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
        }
    }
}

// 創建全域狀態管理實例
const globalState = new StateManager();

// 預設中間件：日誌記錄
globalState.use((action, data) => {
    if (window.DEBUG_STATE) {
        console.group(`🔄 State ${action}`);
        console.log('Path:', data.path);
        console.log('Old State:', data.oldState);
        console.log('New State:', data.newState);
        console.groupEnd();
    }
});

// 預設中間件：本地存儲同步
globalState.use((action, data) => {
    if (action === 'setState') {
        // 同步特定狀態到本地存儲
        const persistentPaths = ['user', 'settings', 'preferences'];
        const path = typeof data.path === 'string' ? data.path : Object.keys(data.path)[0];
        
        if (persistentPaths.some(p => path.startsWith(p))) {
            StorageUtils.setItem(`state_${path}`, globalState.getState(path));
        }
    }
});

// 應用程式狀態模組
class AppState {
    constructor() {
        this.state = globalState;
        this._initializeState();
        this._loadPersistedState();
    }

    // 初始化預設狀態
    _initializeState() {
        this.state.setState('app', {
            loading: false,
            error: null,
            theme: 'light',
            language: 'zh-TW',
            sidebarCollapsed: false,
            notifications: []
        });

        this.state.setState('user', {
            isAuthenticated: false,
            profile: null,
            permissions: []
        });

        this.state.setState('ui', {
            modals: {},
            activeTab: null,
            selectedItems: [],
            filters: {},
            sorting: {}
        });
    }

    // 載入持久化狀態
    _loadPersistedState() {
        const persistentPaths = ['user', 'settings', 'preferences'];
        
        persistentPaths.forEach(path => {
            const saved = StorageUtils.getItem(`state_${path}`);
            if (saved) {
                this.state.setState(path, saved, true);
            }
        });
    }

    // 設置載入狀態
    setLoading(loading, message = null) {
        this.state.setState('app.loading', loading);
        if (message) {
            this.state.setState('app.loadingMessage', message);
        }
    }

    // 設置錯誤狀態
    setError(error) {
        this.state.setState('app.error', error);
        if (error) {
            console.error('App Error:', error);
        }
    }

    // 清除錯誤
    clearError() {
        this.state.setState('app.error', null);
    }

    // 設置用戶狀態
    setUser(user) {
        this.state.setState('user.profile', user);
        this.state.setState('user.isAuthenticated', !!user);
    }

    // 登出
    logout() {
        this.state.setState('user', {
            isAuthenticated: false,
            profile: null,
            permissions: []
        });
        
        // 清除相關本地存儲
        StorageUtils.removeItem('state_user');
        StorageUtils.removeItem('auth_token');
    }

    // 添加通知
    addNotification(notification) {
        const notifications = this.state.getState('app.notifications') || [];
        const newNotification = {
            id: Date.now(),
            timestamp: new Date(),
            ...notification
        };
        
        notifications.push(newNotification);
        this.state.setState('app.notifications', notifications);

        // 自動移除通知
        if (notification.autoRemove !== false) {
            setTimeout(() => {
                this.removeNotification(newNotification.id);
            }, notification.duration || 5000);
        }

        return newNotification.id;
    }

    // 移除通知
    removeNotification(id) {
        const notifications = this.state.getState('app.notifications') || [];
        const filtered = notifications.filter(n => n.id !== id);
        this.state.setState('app.notifications', filtered);
    }

    // 設置模態框狀態
    setModal(name, isOpen, data = null) {
        const modals = this.state.getState('ui.modals') || {};
        modals[name] = { isOpen, data };
        this.state.setState('ui.modals', modals);
    }

    // 設置選中項目
    setSelectedItems(items) {
        this.state.setState('ui.selectedItems', items);
    }

    // 切換項目選中狀態
    toggleSelectedItem(item) {
        const selected = this.state.getState('ui.selectedItems') || [];
        const index = selected.findIndex(s => s.id === item.id);
        
        if (index > -1) {
            selected.splice(index, 1);
        } else {
            selected.push(item);
        }
        
        this.state.setState('ui.selectedItems', selected);
    }

    // 設置過濾器
    setFilter(key, value) {
        const filters = this.state.getState('ui.filters') || {};
        filters[key] = value;
        this.state.setState('ui.filters', filters);
    }

    // 設置排序
    setSorting(key, direction) {
        this.state.setState('ui.sorting', { key, direction });
    }

    // 訂閱狀態變化
    subscribe(path, callback) {
        return this.state.subscribe(path, callback);
    }

    // 取消訂閱
    unsubscribe(path, callback) {
        return this.state.unsubscribe(path, callback);
    }

    // 獲取狀態
    getState(path) {
        return this.state.getState(path);
    }

    // 設置狀態
    setState(path, value, silent = false) {
        return this.state.setState(path, value, silent);
    }

    // 獲取狀態的便捷方法
    get loading() { return this.state.getState('app.loading'); }
    get error() { return this.state.getState('app.error'); }
    get user() { return this.state.getState('user.profile'); }
    get isAuthenticated() { return this.state.getState('user.isAuthenticated'); }
    get notifications() { return this.state.getState('app.notifications') || []; }
    get selectedItems() { return this.state.getState('ui.selectedItems') || []; }
    get filters() { return this.state.getState('ui.filters') || {}; }
    get sorting() { return this.state.getState('ui.sorting') || {}; }
}

// 創建全域應用程式狀態實例
const appState = new AppState();

// 導出到全域
window.StateManager = StateManager;
window.globalState = globalState;
window.appState = appState;

// 開發模式下啟用狀態調試
if (window.location.hostname === 'localhost') {
    window.DEBUG_STATE = true;
    window.state = globalState; // 方便在控制台調試
}