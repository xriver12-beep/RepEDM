// 工具函數模組 - 提升性能和可維護性

// DOM 操作工具
class DOMUtils {
    // 高效的元素選擇器
    static $(selector, context = document) {
        return context.querySelector(selector);
    }

    static select(selector, context = document) {
        return this.$(selector, context);
    }

    static $$(selector, context = document) {
        return Array.from(context.querySelectorAll(selector));
    }

    static selectAll(selector, context = document) {
        return this.$$(selector, context);
    }

    // 批量設置屬性
    static setAttributes(element, attributes) {
        Object.keys(attributes).forEach(key => {
            element.setAttribute(key, attributes[key]);
        });
    }

    // 批量設置樣式
    static setStyles(element, styles) {
        Object.assign(element.style, styles);
    }

    // 創建元素並設置屬性
    static createElement(tag, attributes = {}, styles = {}) {
        const element = document.createElement(tag);
        this.setAttributes(element, attributes);
        this.setStyles(element, styles);
        return element;
    }

    // 安全的 innerHTML 設置（防止 XSS）
    static setHTML(element, html) {
        // 簡單的 HTML 清理
        const cleanHTML = html
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+\s*=/gi, '');
        element.innerHTML = cleanHTML;
    }

    // 平滑滾動到元素
    static scrollToElement(element, offset = 0) {
        const elementPosition = element.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - offset;

        window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
        });
    }

    // 檢查元素是否在視窗內
    static isInViewport(element) {
        const rect = element.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
    }

    // 別名方法
    static find(selector, context = document) {
        return this.$(selector, context);
    }

    static getElement(selector, context = document) {
        return this.$(selector, context);
    }

    // CSS 類操作方法
    static addClass(element, className) {
        if (typeof element === 'string') element = this.$(element);
        if (element && className) {
            element.classList.add(className);
        }
    }

    static removeClass(element, className) {
        if (typeof element === 'string') element = this.$(element);
        if (element && className) {
            element.classList.remove(className);
        }
    }

    static toggleClass(element, className) {
        if (typeof element === 'string') element = this.$(element);
        if (element && className) {
            element.classList.toggle(className);
        }
    }

    static hasClass(element, className) {
        if (typeof element === 'string') element = this.$(element);
        return element && element.classList.contains(className);
    }

    // 顯示/隱藏元素
    static show(element) {
        if (element) {
            element.style.display = '';
        }
    }

    static hide(element) {
        if (element) {
            element.style.display = 'none';
        }
    }

    static toggleDisplay(element, show = null) {
        if (element) {
            if (show === null) {
                element.style.display = element.style.display === 'none' ? '' : 'none';
            } else {
                element.style.display = show ? '' : 'none';
            }
        }
    }

    // 更新元素文本內容
    static updateText(element, text) {
        if (element) {
            element.textContent = text;
        }
    }

    // 更新元素 HTML 內容
    static updateHTML(element, html) {
        if (element) {
            element.innerHTML = html;
        }
    }
}

// 事件處理工具
class EventUtils {
    // 防抖函數
    static debounce(func, wait, immediate = false) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                timeout = null;
                if (!immediate) func.apply(this, args);
            };
            const callNow = immediate && !timeout;
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
            if (callNow) func.apply(this, args);
        };
    }

    // 節流函數
    static throttle(func, limit) {
        let inThrottle;
        return function executedFunction(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    // 委託事件處理
    static delegate(parent, selector, event, handler) {
        parent.addEventListener(event, (e) => {
            const target = e.target.closest(selector);
            if (target && parent.contains(target)) {
                handler.call(target, e);
            }
        });
    }

    // 一次性事件監聽
    static once(element, event, handler) {
        const onceHandler = (e) => {
            handler.call(element, e);
            element.removeEventListener(event, onceHandler);
        };
        element.addEventListener(event, onceHandler);
    }

    // 基本事件監聽
    static on(element, event, handler) {
        if (typeof element === 'string') {
            element = document.querySelector(element);
        }
        if (element && event && handler) {
            element.addEventListener(event, handler);
        }
    }

    // 移除事件監聽
    static off(element, event, handler) {
        if (element && event && handler) {
            element.removeEventListener(event, handler);
        }
    }
}

// 數據處理工具
class DataUtils {
    // 深拷貝 (支持循環引用)
    static deepClone(obj, hash = new WeakMap()) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj.getTime());
        if (hash.has(obj)) return hash.get(obj); // 處理循環引用

        if (obj instanceof Array) {
            const result = [];
            hash.set(obj, result);
            obj.forEach(item => result.push(this.deepClone(item, hash)));
            return result;
        }
        
        if (typeof obj === 'object') {
            const clonedObj = {};
            hash.set(obj, clonedObj);
            Object.keys(obj).forEach(key => {
                clonedObj[key] = this.deepClone(obj[key], hash);
            });
            return clonedObj;
        }
    }

    // 對象合併
    static merge(target, ...sources) {
        if (!sources.length) return target;
        const source = sources.shift();

        if (this.isObject(target) && this.isObject(source)) {
            for (const key in source) {
                if (this.isObject(source[key])) {
                    if (!target[key]) Object.assign(target, { [key]: {} });
                    this.merge(target[key], source[key]);
                } else {
                    Object.assign(target, { [key]: source[key] });
                }
            }
        }

        return this.merge(target, ...sources);
    }

    // 檢查是否為對象
    static isObject(item) {
        return item && typeof item === 'object' && !Array.isArray(item);
    }

    // 數組去重
    static unique(array, key = null) {
        if (key) {
            const seen = new Set();
            return array.filter(item => {
                const value = item[key];
                if (seen.has(value)) {
                    return false;
                } else {
                    seen.add(value);
                    return true;
                }
            });
        }
        return [...new Set(array)];
    }

    // 數組分組
    static groupBy(array, key) {
        return array.reduce((groups, item) => {
            const group = item[key];
            groups[group] = groups[group] || [];
            groups[group].push(item);
            return groups;
        }, {});
    }

    // 數組排序
    static sortBy(array, key, direction = 'asc') {
        return array.sort((a, b) => {
            const aVal = key ? a[key] : a;
            const bVal = key ? b[key] : b;
            
            if (direction === 'asc') {
                return aVal > bVal ? 1 : -1;
            } else {
                return aVal < bVal ? 1 : -1;
            }
        });
    }

    // 分頁處理
    static paginate(array, page, pageSize) {
        const startIndex = (page - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        return {
            data: array.slice(startIndex, endIndex),
            totalPages: Math.ceil(array.length / pageSize),
            currentPage: page,
            totalItems: array.length,
            hasNext: endIndex < array.length,
            hasPrev: page > 1
        };
    }
}

// 格式化工具
class FormatUtils {
    // 格式化日期
    static formatDate(date, format = 'YYYY-MM-DD') {
        if (!date) return '';
        
        const d = new Date(date);
        if (isNaN(d.getTime())) return '';

        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const seconds = String(d.getSeconds()).padStart(2, '0');

        return format
            .replace('YYYY', year)
            .replace('MM', month)
            .replace('DD', day)
            .replace('HH', hours)
            .replace('mm', minutes)
            .replace('ss', seconds);
    }

    // 相對時間
    static timeAgo(date) {
        const now = new Date();
        const past = new Date(date);
        const diffInSeconds = Math.floor((now - past) / 1000);

        const intervals = [
            { label: '年', seconds: 31536000 },
            { label: '個月', seconds: 2592000 },
            { label: '天', seconds: 86400 },
            { label: '小時', seconds: 3600 },
            { label: '分鐘', seconds: 60 },
            { label: '秒', seconds: 1 }
        ];

        for (const interval of intervals) {
            const count = Math.floor(diffInSeconds / interval.seconds);
            if (count > 0) {
                return `${count} ${interval.label}前`;
            }
        }

        return '剛剛';
    }

    // 格式化數字
    static formatNumber(num, decimals = 0) {
        if (isNaN(num)) return '0';
        return Number(num).toLocaleString('zh-TW', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });
    }

    // 格式化文件大小
    static formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // 格式化百分比
    static formatPercentage(value, total, decimals = 1) {
        if (total === 0) return '0%';
        const percentage = (value / total) * 100;
        return `${percentage.toFixed(decimals)}%`;
    }

    // 截斷文字
    static truncate(text, length, suffix = '...') {
        if (!text || text.length <= length) return text;
        return text.substring(0, length) + suffix;
    }
}

// 驗證工具
class ValidationUtils {
    // 郵件驗證
    static isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    // URL 驗證
    static isValidURL(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    // 手機號碼驗證（台灣）
    static isValidPhone(phone) {
        const phoneRegex = /^09\d{8}$/;
        return phoneRegex.test(phone);
    }

    // 表單驗證
    static validateForm(formData, rules) {
        const errors = {};

        Object.keys(rules).forEach(field => {
            const value = formData[field];
            const rule = rules[field];

            if (rule.required && (!value || value.trim() === '')) {
                errors[field] = rule.message || `${field} 為必填欄位`;
                return;
            }

            if (value && rule.type) {
                switch (rule.type) {
                    case 'email':
                        if (!this.isValidEmail(value)) {
                            errors[field] = rule.message || '請輸入有效的郵件地址';
                        }
                        break;
                    case 'url':
                        if (!this.isValidURL(value)) {
                            errors[field] = rule.message || '請輸入有效的 URL';
                        }
                        break;
                    case 'phone':
                        if (!this.isValidPhone(value)) {
                            errors[field] = rule.message || '請輸入有效的手機號碼';
                        }
                        break;
                }
            }

            if (value && rule.minLength && value.length < rule.minLength) {
                errors[field] = rule.message || `${field} 至少需要 ${rule.minLength} 個字符`;
            }

            if (value && rule.maxLength && value.length > rule.maxLength) {
                errors[field] = rule.message || `${field} 不能超過 ${rule.maxLength} 個字符`;
            }
        });

        return {
            isValid: Object.keys(errors).length === 0,
            errors
        };
    }

    // 清除表單錯誤
    static clearErrors(form) {
        if (!form) return;
        
        // 移除錯誤樣式
        const invalidElements = form.querySelectorAll('.is-invalid');
        invalidElements.forEach(el => el.classList.remove('is-invalid'));
        
        // 清除錯誤訊息
        const errorMessages = form.querySelectorAll('.invalid-feedback');
        errorMessages.forEach(el => {
            el.textContent = '';
            el.style.display = 'none';
        });

        // 隱藏錯誤提示容器
        const errorContainers = form.querySelectorAll('.error-container, .alert-danger');
        errorContainers.forEach(el => el.style.display = 'none');
    }
}

// 性能監控工具
class PerformanceUtils {
    static timers = new Map();
    static memoCache = new Map();

    // 兼容 API: 開始計時
    static startTiming(label) {
        if (window.performance && window.performance.mark) {
            window.performance.mark(`${label}_start`);
        }
        this.startTimer(label);
    }

    // 兼容 API: 結束計時
    static endTiming(label) {
        if (window.performance && window.performance.mark && window.performance.measure) {
            window.performance.mark(`${label}_end`);
            try {
                window.performance.measure(label, `${label}_start`, `${label}_end`);
                const entries = window.performance.getEntriesByName(label);
                if (entries.length > 0) {
                    return entries[entries.length - 1].duration;
                }
            } catch (e) {
                console.warn(`Performance measurement failed for ${label}:`, e);
            }
        }
        return this.endTimer(label) || 0;
    }

    // 兼容 API: 記錄日誌
    static log(label, duration) {
        console.log(`⏱️ ${label}: ${duration.toFixed(2)}ms`);
    }

    // 開始計時
    static startTimer(name) {
        this.timers.set(name, performance.now());
    }

    // 結束計時
    static endTimer(name) {
        const startTime = this.timers.get(name);
        if (startTime) {
            const duration = performance.now() - startTime;
            this.timers.delete(name);
            console.log(`⏱️ ${name}: ${duration.toFixed(2)}ms`);
            return duration;
        }
        return null;
    }

    // 記憶體使用情況
    static getMemoryUsage() {
        if (performance.memory) {
            return {
                used: Math.round(performance.memory.usedJSHeapSize / 1048576),
                total: Math.round(performance.memory.totalJSHeapSize / 1048576),
                limit: Math.round(performance.memory.jsHeapSizeLimit / 1048576)
            };
        }
        return null;
    }

    // 延遲執行
    static defer(callback) {
        if (window.requestIdleCallback) {
            requestIdleCallback(callback);
        } else {
            setTimeout(callback, 0);
        }
    }

    // 記憶化函數（緩存結果）
    static memoize(fn, keyGenerator = (...args) => JSON.stringify(args)) {
        return (...args) => {
            const key = keyGenerator(...args);
            if (this.memoCache.has(key)) {
                return this.memoCache.get(key);
            }
            const result = fn(...args);
            this.memoCache.set(key, result);
            return result;
        };
    }

    // 清除記憶化緩存
    static clearMemoCache() {
        this.memoCache.clear();
    }

    // 懶加載圖片
    static lazyLoadImages(selector = 'img[data-src]') {
        const images = document.querySelectorAll(selector);
        
        if ('IntersectionObserver' in window) {
            const imageObserver = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        img.src = img.dataset.src;
                        img.classList.remove('lazy');
                        imageObserver.unobserve(img);
                    }
                });
            });

            images.forEach(img => imageObserver.observe(img));
        } else {
            // 降級處理
            images.forEach(img => {
                img.src = img.dataset.src;
                img.classList.remove('lazy');
            });
        }
    }

    // 虛擬滾動（大列表優化）
    static createVirtualScroll(container, items, itemHeight, renderItem) {
        const containerHeight = container.clientHeight;
        const visibleCount = Math.ceil(containerHeight / itemHeight) + 2;
        let startIndex = 0;

        const scrollHandler = EventUtils.throttle(() => {
            const scrollTop = container.scrollTop;
            const newStartIndex = Math.floor(scrollTop / itemHeight);
            
            if (newStartIndex !== startIndex) {
                startIndex = newStartIndex;
                render();
            }
        }, 16);

        const render = () => {
            const endIndex = Math.min(startIndex + visibleCount, items.length);
            const visibleItems = items.slice(startIndex, endIndex);
            
            container.innerHTML = '';
            container.style.height = `${items.length * itemHeight}px`;
            container.style.paddingTop = `${startIndex * itemHeight}px`;
            
            visibleItems.forEach((item, index) => {
                const element = renderItem(item, startIndex + index);
                container.appendChild(element);
            });
        };

        container.addEventListener('scroll', scrollHandler);
        render();

        return {
            refresh: render,
            destroy: () => container.removeEventListener('scroll', scrollHandler)
        };
    }
}

// 通知工具
class NotificationUtils {
    static defaultOptions = {
        duration: 3000,
        position: 'top-right',
        closable: true
    };

    // 獲取類型顏色
    static getTypeColor(type) {
        const colors = {
            success: '#48bb78',
            error: '#f56565',
            warning: '#ed8936',
            info: '#4299e1'
        };
        return colors[type] || colors.info;
    }

    // 顯示通知
    static show(message, type = 'info', options = {}) {
        // 檢查是否已有相同內容的通知正在顯示
        const existingContainer = DOMUtils.$('.notification-container');
        if (existingContainer) {
            const existingNotifications = existingContainer.querySelectorAll('.notification');
            for (const note of existingNotifications) {
                if (note.dataset.message === message) {
                    return;
                }
            }
        }

        const config = { ...this.defaultOptions, ...options };
        
        // 兼容 window.Toast 如果存在
        if (window.Toast && !options.forceCustom) {
            window.Toast.fire({
                icon: type,
                title: message
            });
            return;
        }

        // 創建通知容器（如果不存在）
        let container = DOMUtils.$('.notification-container');
        if (!container) {
            container = DOMUtils.createElement('div', {
                class: 'notification-container'
            }, {
                position: 'fixed',
                top: '80px', // 避開頂部導航欄
                right: '20px',
                zIndex: '100000', // 確保在最上層
                pointerEvents: 'none',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))'
            });
            document.body.appendChild(container);
        }

        // 創建通知元素
        const notification = DOMUtils.createElement('div', {
            class: `notification notification-${type}`,
            'data-message': message
        }, {
            background: this.getTypeColor(type),
            color: '#ffffff',
            padding: '16px 20px',
            borderRadius: '8px',
            marginBottom: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            opacity: '0', // 初始透明度為0，用於動畫
            transform: 'translateX(20px)', // 初始位置向右偏移
            transition: 'all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)', // 彈性動畫
            pointerEvents: 'auto',
            width: '320px', // 固定寬度確保可見性
            maxWidth: '90vw',
            wordWrap: 'break-word',
            border: '1px solid rgba(255,255,255,0.2)',
            fontSize: '14px',
            lineHeight: '1.5',
            position: 'relative'
        });

        // 動畫顯示
        requestAnimationFrame(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateX(0)';
        });

        // 創建消息內容
        const messageDiv = DOMUtils.createElement('div', {}, {
            marginBottom: '12px',
            lineHeight: '1.4'
        });
        messageDiv.textContent = message;
        notification.appendChild(messageDiv);

        // 創建按鈕容器
        const buttonContainer = DOMUtils.createElement('div', {}, {
            textAlign: 'right',
            borderTop: '1px solid rgba(255,255,255,0.2)',
            paddingTop: '12px',
            marginTop: '12px'
        });
        notification.appendChild(buttonContainer);

        // 添加確認按鈕
        const confirmBtn = DOMUtils.createElement('button', {
            class: 'notification-confirm-btn'
        }, {
            background: 'rgba(255,255,255,0.2)',
            color: 'white',
            border: '1px solid rgba(255,255,255,0.3)',
            padding: '6px 16px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '500'
        });
        confirmBtn.textContent = '確認';
        confirmBtn.onclick = () => this.remove(notification);
        buttonContainer.appendChild(confirmBtn);

        // 添加關閉按鈕（X）
        if (config.closable) {
            const closeBtn = DOMUtils.createElement('span', {
                class: 'notification-close'
            }, {
                position: 'absolute',
                top: '8px',
                right: '12px',
                cursor: 'pointer',
                fontSize: '18px',
                opacity: '0.8'
            });
            closeBtn.innerHTML = '&times;';
            closeBtn.onclick = () => this.remove(notification);
            notification.appendChild(closeBtn);
        }

        container.appendChild(notification);

        // 自動關閉
        if (config.duration > 0) {
            setTimeout(() => {
                this.remove(notification);
            }, config.duration);
        }
    }

    // 移除通知
    static remove(notification) {
        if (notification && notification.parentNode) {
            // 添加淡出動畫
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            notification.style.transition = 'all 0.3s ease';
            
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }
    }

    // 便捷方法
    static success(message, options) {
        this.show(message, 'success', options);
    }

    static error(message, options) {
        this.show(message, 'error', options);
    }

    static warning(message, options) {
        this.show(message, 'warning', options);
    }

    static info(message, options) {
        this.show(message, 'info', options);
    }
}

// 加載狀態工具
class LoadingUtils {
    static activeLoaders = new Set();

    static show(message = '載入中...') {
        // 創建或獲取容器
        let container = DOMUtils.$('.loading-overlay');
        if (!container) {
            container = DOMUtils.createElement('div', {
                class: 'loading-overlay'
            }, {
                position: 'fixed',
                top: '0',
                left: '0',
                width: '100%',
                height: '100%',
                background: 'rgba(0, 0, 0, 0.5)',
                zIndex: '9999',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                flexDirection: 'column',
                color: 'white'
            });

            const spinner = DOMUtils.createElement('div', {
                class: 'loading-spinner'
            }, {
                width: '40px',
                height: '40px',
                border: '4px solid #f3f3f3',
                borderTop: '4px solid #3b82f6',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                marginBottom: '10px'
            });

            // 添加 spin 動畫
            const style = document.createElement('style');
            style.textContent = `
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);

            const text = DOMUtils.createElement('div', {
                class: 'loading-text'
            }, {
                fontSize: '16px',
                fontWeight: '500'
            });

            container.appendChild(spinner);
            container.appendChild(text);
            document.body.appendChild(container);
        }

        // 更新文字
        const textElement = container.querySelector('.loading-text');
        if (textElement) {
            textElement.textContent = message;
        }

        // 顯示容器
        container.style.display = 'flex';

        // 生成 ID
        const id = Date.now().toString();
        this.activeLoaders.add(id);

        return id;
    }

    static hide(id) {
        if (id) {
            this.activeLoaders.delete(id);
        }

        // 如果沒有活動的加載器，則隱藏容器
        if (this.activeLoaders.size === 0) {
            const container = DOMUtils.$('.loading-overlay');
            if (container) {
                container.style.display = 'none';
            }
        }
    }
}

// 密碼強度檢查
class PasswordUtils {
    static checkStrength(password) {
        let strength = 0;
        if (password.length >= 8) strength++;
        if (password.match(/[a-z]+/)) strength++;
        if (password.match(/[A-Z]+/)) strength++;
        if (password.match(/[0-9]+/)) strength++;
        if (password.match(/[$@#&!]+/)) strength++;
        return strength;
    }

    static checkPasswordStrength(password) {
        const checks = {
            length: password.length >= 8,
            uppercase: /[A-Z]/.test(password),
            lowercase: /[a-z]/.test(password),
            numbers: /\d/.test(password),
            special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
        };

        const score = Object.values(checks).filter(Boolean).length;
        
        let strength = 'weak';
        if (score >= 4) strength = 'strong';
        else if (score >= 3) strength = 'medium';

        return { checks, score, strength };
    }

    // 獲取密碼強度（與 main.js 兼容）
    static getPasswordStrength(password) {
        const result = this.checkPasswordStrength(password);
        const feedback = [];
        
        if (!result.checks.length) feedback.push('至少需要8個字符');
        if (!result.checks.uppercase) feedback.push('需要大寫字母');
        if (!result.checks.lowercase) feedback.push('需要小寫字母');
        if (!result.checks.numbers) feedback.push('需要數字');
        if (!result.checks.special) feedback.push('需要特殊字符');
        
        return {
            score: result.score,
            strength: result.strength,
            feedback: feedback
        };
    }
}

// 本地存儲工具
class StorageUtils {
    // 設置本地存儲（支援對象）
    static setItem(key, value, expiry = null) {
        const item = {
            value: value,
            expiry: expiry ? Date.now() + expiry : null
        };
        localStorage.setItem(key, JSON.stringify(item));
    }

    // 獲取本地存儲
    static getItem(key) {
        try {
            const itemStr = localStorage.getItem(key);
            if (!itemStr) return null;

            const item = JSON.parse(itemStr);
            
            // 檢查是否過期
            if (item.expiry && Date.now() > item.expiry) {
                localStorage.removeItem(key);
                return null;
            }

            return item.value;
        } catch {
            return null;
        }
    }

    // 移除本地存儲
    static removeItem(key) {
        localStorage.removeItem(key);
    }

    // 清空本地存儲
    static clear() {
        localStorage.clear();
    }

    // 獲取存儲大小
    static getStorageSize() {
        let total = 0;
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                total += localStorage[key].length + key.length;
            }
        }
        return total;
    }
}

// 優化工具
class OptimizationUtils {
    // 預載入關鍵資源
    static preloadCriticalResources(resources) {
        if (!resources || !Array.isArray(resources)) return;
        
        resources.forEach(resource => {
            const link = document.createElement('link');
            link.rel = 'preload';
            link.href = resource;
            
            if (resource.endsWith('.css')) {
                link.as = 'style';
            } else if (resource.endsWith('.js')) {
                link.as = 'script';
            } else if (resource.match(/\.(woff2?|ttf|eot)$/)) {
                link.as = 'font';
                link.crossOrigin = 'anonymous';
            } else if (resource.match(/\.(png|jpg|jpeg|gif|webp|svg)$/)) {
                link.as = 'image';
            }
            
            document.head.appendChild(link);
        });
    }

    // 移除未使用的 CSS (模擬)
    static removeUnusedCSS() {
        // 這裡只是一個模擬實現，實際移除未使用 CSS 需要複雜的分析
        // 返回一個空的數組或模擬數據
        return [];
    }
}

// 全局事件總線
class EventBus {
    constructor() {
        this.events = {};
    }

    on(event, callback) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(callback);
    }

    off(event, callback) {
        if (!this.events[event]) return;
        this.events[event] = this.events[event].filter(cb => cb !== callback);
    }

    emit(event, data) {
        if (!this.events[event]) return;
        this.events[event].forEach(callback => callback(data));
    }
}

// 初始化全局事件總線
window.eventBus = new EventBus();

// 全局通知函數
window.showNotification = NotificationUtils.show.bind(NotificationUtils);
