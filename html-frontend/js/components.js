// 組件系統 - 提升代碼可重用性和可維護性

// 基礎組件類
class Component {
    constructor(element, options = {}) {
        this.element = typeof element === 'string' ? DOMUtils.$(element) : element;
        this.options = DataUtils.merge({}, this.defaultOptions, options);
        this.state = {};
        this.listeners = [];
        this.children = [];
        this.parent = null;
        
        if (this.element) {
            this.element._component = this;
            this.init();
        }
    }

    // 預設選項
    get defaultOptions() {
        return {};
    }

    // 初始化組件
    init() {
        this.render();
        this.bindEvents();
        this.onInit();
    }

    // 渲染組件
    render() {
        // 子類實現
    }

    // 綁定事件
    bindEvents() {
        // 子類實現
    }

    // 初始化完成回調
    onInit() {
        // 子類實現
    }

    // 設置狀態
    setState(newState, callback) {
        const oldState = { ...this.state };
        this.state = { ...this.state, ...newState };
        
        this.onStateChange(this.state, oldState);
        
        if (callback) {
            callback(this.state, oldState);
        }
        
        return this;
    }

    // 狀態變化回調
    onStateChange(newState, oldState) {
        // 子類實現
    }

    // 添加事件監聽器
    addEventListener(element, event, handler, options = {}) {
        const listener = { element, event, handler, options };
        this.listeners.push(listener);
        element.addEventListener(event, handler, options);
        return this;
    }

    // 移除所有事件監聽器
    removeAllEventListeners() {
        this.listeners.forEach(({ element, event, handler, options }) => {
            element.removeEventListener(event, handler, options);
        });
        this.listeners = [];
        return this;
    }

    // 添加子組件
    addChild(child) {
        if (child instanceof Component) {
            this.children.push(child);
            child.parent = this;
        }
        return this;
    }

    // 移除子組件
    removeChild(child) {
        const index = this.children.indexOf(child);
        if (index > -1) {
            this.children.splice(index, 1);
            child.parent = null;
            child.destroy();
        }
        return this;
    }

    // 查找子組件
    findChild(predicate) {
        return this.children.find(predicate);
    }

    // 查找所有子組件
    findChildren(predicate) {
        return this.children.filter(predicate);
    }

    // 發送事件到父組件
    emit(eventName, data) {
        if (this.parent) {
            this.parent.onChildEvent(eventName, data, this);
        }
        return this;
    }

    // 處理子組件事件
    onChildEvent(eventName, data, child) {
        // 子類實現
    }

    // 顯示組件
    show() {
        if (this.element) {
            this.element.style.display = '';
            this.element.classList.remove('hidden');
        }
        return this;
    }

    // 隱藏組件
    hide() {
        if (this.element) {
            this.element.style.display = 'none';
            this.element.classList.add('hidden');
        }
        return this;
    }

    // 切換顯示狀態
    toggle() {
        if (this.element) {
            const isHidden = this.element.style.display === 'none' || 
                           this.element.classList.contains('hidden');
            return isHidden ? this.show() : this.hide();
        }
        return this;
    }

    // 銷毀組件
    destroy() {
        this.onDestroy();
        this.removeAllEventListeners();
        
        // 銷毀所有子組件
        this.children.forEach(child => child.destroy());
        this.children = [];
        
        if (this.element) {
            delete this.element._component;
        }
        
        this.element = null;
        this.parent = null;
    }

    // 銷毀前回調
    onDestroy() {
        // 子類實現
    }
}

// 模態框組件
class Modal extends Component {
    constructor(element, options = {}) {
        super(element, options);
        
        // 如果提供了 title 或 content，在渲染後設置它們
        if (this.options.title || this.options.content) {
            // 確保元素已渲染
            if (!this.element) {
                this.render();
            }
            
            if (this.options.title) {
                this.setTitle(this.options.title);
            }
            
            if (this.options.content) {
                this.setBody(this.options.content);
            }
        }
    }

    get defaultOptions() {
        return {
            closable: true,
            backdrop: true,
            keyboard: true,
            size: 'medium', // small, medium, large, xl
            animation: 'fade',
            autoFocus: true,
            title: '',
            content: ''
        };
    }

    render() {
        if (!this.element) {
            this.element = this.createElement();
            document.body.appendChild(this.element);
            // 設置組件引用並初始化
            this.element._component = this;
            this.init();
        }
        
        // 適應現有的 HTML 結構
        this.backdrop = this.element.querySelector('.modal-backdrop');
        this.dialog = this.element.querySelector('.modal-dialog') || this.element;
        this.content = this.element.querySelector('.modal-content');
        this.header = this.element.querySelector('.modal-header');
        this.body = this.element.querySelector('.modal-body');
        this.footer = this.element.querySelector('.modal-footer');
    }

    createElement() {
        const attributes = {
            class: `modal modal-${this.options.size}`,
            tabindex: '-1',
            role: 'dialog'
        };

        if (this.options.id) {
            attributes.id = this.options.id;
        }

        const modal = DOMUtils.createElement('div', attributes);

        modal.innerHTML = `
            ${this.options.backdrop ? '<div class="modal-backdrop"></div>' : ''}
            <div class="modal-dialog" role="document">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title"></h5>
                        ${this.options.closable ? '<button type="button" class="modal-close" aria-label="關閉">&times;</button>' : ''}
                    </div>
                    <div class="modal-body"></div>
                    <div class="modal-footer"></div>
                </div>
            </div>
        `;

        return modal;
    }

    bindEvents() {
        if (this.options.closable) {
            const closeBtn = this.element.querySelector('.modal-close');
            if (closeBtn) {
                this.addEventListener(closeBtn, 'click', () => this.hide());
            }
        }

        if (this.options.backdrop && this.backdrop) {
            this.addEventListener(this.backdrop, 'click', () => this.hide());
        }

        // ESC 鍵監聽器將在 show() 時動態添加，在 hide() 時移除
        // 這樣可以避免與其他頁面的自定義 ESC 鍵監聽器衝突
        this.escapeHandler = null;
    }

    setTitle(title) {
        const titleElement = this.element.querySelector('.modal-title');
        if (titleElement) {
            titleElement.textContent = title;
        }
        return this;
    }

    setBody(content) {
        if (this.body) {
            if (typeof content === 'string') {
                this.body.innerHTML = content;
            } else {
                this.body.innerHTML = '';
                this.body.appendChild(content);
            }
        }
        return this;
    }

    setFooter(content) {
        if (this.footer) {
            if (typeof content === 'string') {
                this.footer.innerHTML = content;
            } else {
                this.footer.innerHTML = '';
                this.footer.appendChild(content);
            }
        }
        return this;
    }

    show() {
        // 確保元素已經渲染
        if (!this.element) {
            this.render();
        }
        
        this.element.style.display = 'flex';
        this.element.classList.add('show');
        document.body.classList.add('modal-open');
        
        // 動態添加 ESC 鍵監聽器
        if (this.options.keyboard && !this.escapeHandler) {
            this.escapeHandler = (e) => {
                // 只有當前模態框可見且是最頂層的模態框時才響應 ESC 鍵
                if (e.key === 'Escape' && this.isVisible() && this.isTopMost()) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.hide();
                }
            };
            document.addEventListener('keydown', this.escapeHandler);
        }
        
        if (this.options.autoFocus) {
            const focusable = this.element.querySelector('input, button, select, textarea, [tabindex]:not([tabindex="-1"])');
            if (focusable) {
                focusable.focus();
            }
        }
        
        this.onShow();
        return this;
    }

    hide() {
        this.element.classList.remove('show');
        
        // 移除 ESC 鍵監聽器
        if (this.escapeHandler) {
            document.removeEventListener('keydown', this.escapeHandler);
            this.escapeHandler = null;
        }
        
        setTimeout(() => {
            this.element.style.display = 'none';
            document.body.classList.remove('modal-open');
        }, 150);
        
        this.onHide();
        return this;
    }

    isVisible() {
        return this.element.classList.contains('show');
    }

    isTopMost() {
        // 檢查當前模態框是否是最頂層的可見模態框
        const visibleModals = document.querySelectorAll('.modal.show');
        if (visibleModals.length === 0) return false;
        
        // 獲取最後一個（最頂層）可見的模態框
        const topModal = visibleModals[visibleModals.length - 1];
        return topModal === this.element;
    }

    onShow() {
        // 子類實現
    }

    onHide() {
        // 子類實現
    }

    destroy() {
        // 確保移除 ESC 鍵監聽器
        if (this.escapeHandler) {
            document.removeEventListener('keydown', this.escapeHandler);
            this.escapeHandler = null;
        }
        
        // 調用父類的 destroy 方法
        super.destroy();
    }
}

// 表格組件
class DataTable extends Component {
    get defaultOptions() {
        return {
            data: [],
            columns: [],
            pagination: true,
            pageSize: 10,
            sortable: true,
            filterable: false,
            selectable: false,
            searchable: false,
            responsive: true,
            emptyMessage: '沒有數據'
        };
    }

    init() {
        this.currentPage = 1;
        this.sortColumn = null;
        this.sortDirection = 'asc';
        this.searchTerm = '';
        this.selectedRows = new Set();
        this.isLoading = false;
        
        super.init();
    }

    setLoading(loading) {
        this.isLoading = loading;
        this.renderBody();
    }

    render() {
        console.log('🔧 DataTable render 開始執行');
        console.log('📋 this.element:', this.element);
        this.element.innerHTML = `
            ${this.options.searchable ? this.renderSearch() : ''}
            <div class="table-container">
                <table class="data-table">
                    <thead></thead>
                    <tbody></tbody>
                </table>
            </div>
            ${this.options.pagination ? this.renderPagination() : ''}
        `;

        this.table = this.element.querySelector('.data-table');
        this.thead = this.table.querySelector('thead');
        this.tbody = this.table.querySelector('tbody');
        this.searchInput = this.element.querySelector('.table-search input');
        this.paginationContainer = this.element.querySelector('.table-pagination');

        console.log('📊 DataTable 元素已創建:');
        console.log('  - table:', this.table);
        console.log('  - thead:', this.thead);
        console.log('  - tbody:', this.tbody);

        this.renderTable();
        console.log('✅ DataTable render 完成');
    }

    renderSearch() {
        return `
            <div class="table-search">
                <input type="text" placeholder="搜尋..." class="form-control">
            </div>
        `;
    }

    renderPagination() {
        return `
            <div class="table-pagination">
                <div class="pagination-info"></div>
                <div class="pagination-controls"></div>
            </div>
        `;
    }

    renderTable() {
        this.renderHeader();
        this.renderBody();
        if (this.options.pagination) {
            this.renderPaginationControls();
        }
    }

    renderHeader() {
        const headerRow = document.createElement('tr');
        
        if (this.options.selectable) {
            const selectAllCell = document.createElement('th');
            selectAllCell.innerHTML = '<input type="checkbox" class="select-all">';
            headerRow.appendChild(selectAllCell);
        }

        this.options.columns.forEach(column => {
            const th = document.createElement('th');
            th.textContent = column.title;
            th.dataset.key = column.key;
            
            if (this.options.sortable && column.sortable !== false) {
                th.classList.add('sortable');
                th.innerHTML += ' <span class="sort-indicator"></span>';
            }
            
            headerRow.appendChild(th);
        });

        this.thead.innerHTML = '';
        this.thead.appendChild(headerRow);
    }

    renderBody() {
        console.log('🔧 DataTable renderBody 開始執行');
        
        if (this.isLoading) {
            this.tbody.innerHTML = `
                <tr>
                    <td colspan="${this.options.columns.length + (this.options.selectable ? 1 : 0)}" class="text-center p-5">
                        <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">Loading...</span>
                        </div>
                        <div class="mt-2 text-muted">載入中...</div>
                    </td>
                </tr>
            `;
            return;
        }

        const filteredData = this.getFilteredData();
        console.log('📊 filteredData.length:', filteredData.length);
        const paginatedData = this.options.pagination ? 
            this.getPaginatedData(filteredData) : filteredData;
        console.log('📊 paginatedData.length:', paginatedData.length);
        console.log('📋 this.tbody:', this.tbody);

        this.tbody.innerHTML = '';

        if (paginatedData.length === 0) {
            const emptyRow = document.createElement('tr');
            const emptyCell = document.createElement('td');
            emptyCell.colSpan = this.options.columns.length + (this.options.selectable ? 1 : 0);
            emptyCell.textContent = this.options.emptyMessage;
            emptyCell.classList.add('text-center', 'text-muted');
            emptyRow.appendChild(emptyCell);
            this.tbody.appendChild(emptyRow);
            return;
        }

        console.log('🔄 開始創建表格行，數據數量:', paginatedData.length);
        paginatedData.forEach((row, index) => {
            console.log(`📋 創建第 ${index + 1} 行，數據:`, row);
            const tr = document.createElement('tr');
            tr.dataset.index = index;
            
            if (this.options.selectable) {
                const selectCell = document.createElement('td');
                selectCell.innerHTML = `<input type="checkbox" class="row-select" value="${row.id || index}">`;
                tr.appendChild(selectCell);
            }

            this.options.columns.forEach(column => {
                const td = document.createElement('td');
                
                if (column.render) {
                    const rendered = column.render(row[column.key], row, index);
                    if (typeof rendered === 'string') {
                        td.innerHTML = rendered;
                    } else {
                        td.appendChild(rendered);
                    }
                } else {
                    td.textContent = row[column.key] || '';
                }
                
                tr.appendChild(td);
            });

            console.log('📋 將行添加到 tbody:', tr);
            this.tbody.appendChild(tr);
        });
        console.log('✅ 表格行創建完成，tbody 子元素數量:', this.tbody.children.length);
    }

    renderPaginationControls() {
        if (!this.paginationContainer) return;

        const filteredData = this.getFilteredData();
        const totalPages = Math.ceil(filteredData.length / this.options.pageSize);
        const startItem = (this.currentPage - 1) * this.options.pageSize + 1;
        const endItem = Math.min(this.currentPage * this.options.pageSize, filteredData.length);

        // 更新信息 - 修復格式以匹配 HTML 中的期望格式
        const infoElement = this.paginationContainer.querySelector('.pagination-info');
        if (infoElement) {
            infoElement.textContent = `顯示 ${startItem} - ${endItem} 項，共 ${filteredData.length} 項`;
        }
        
        // 更新控制按鈕
        const controlsElement = this.paginationContainer.querySelector('.pagination-controls');
        controlsElement.innerHTML = `
            <div class="pagination-size-selector" style="display: inline-flex; align-items: center; margin-right: 15px;">
                <span style="margin-right: 5px;">每頁顯示:</span>
                <select class="form-select form-select-sm page-size-select" style="width: auto;">
                    <option value="10" ${this.options.pageSize === 10 ? 'selected' : ''}>10</option>
                    <option value="20" ${this.options.pageSize === 20 ? 'selected' : ''}>20</option>
                    <option value="50" ${this.options.pageSize === 50 ? 'selected' : ''}>50</option>
                </select>
            </div>
            <button class="btn btn-sm" ${this.currentPage === 1 ? 'disabled' : ''} data-action="first">首頁</button>
            <button class="btn btn-sm" ${this.currentPage === 1 ? 'disabled' : ''} data-action="prev">上一頁</button>
            <span class="page-info">第 ${this.currentPage} 頁，共 ${totalPages} 頁</span>
            <button class="btn btn-sm" ${this.currentPage === totalPages ? 'disabled' : ''} data-action="next">下一頁</button>
            <button class="btn btn-sm" ${this.currentPage === totalPages ? 'disabled' : ''} data-action="last">末頁</button>
        `;
    }

    bindEvents() {
        // 搜尋事件
        if (this.searchInput) {
            this.addEventListener(this.searchInput, 'input', 
                EventUtils.debounce((e) => {
                    this.searchTerm = e.target.value;
                    this.currentPage = 1;
                    this.renderTable();
                }, 300)
            );
        }

        // 排序事件
        if (this.options.sortable) {
            this.addEventListener(this.thead, 'click', (e) => {
                const th = e.target.closest('th.sortable');
                if (th) {
                    const key = th.dataset.key;
                    if (this.sortColumn === key) {
                        this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
                    } else {
                        this.sortColumn = key;
                        this.sortDirection = 'asc';
                    }
                    this.updateSortIndicators();
                    this.renderTable();
                }
            });
        }

        // 分頁事件
        if (this.options.pagination && this.paginationContainer) {
            this.addEventListener(this.paginationContainer, 'click', (e) => {
                const button = e.target.closest('button[data-action]');
                if (button && !button.disabled) {
                    const action = button.dataset.action;
                    const filteredData = this.getFilteredData();
                    const totalPages = Math.ceil(filteredData.length / this.options.pageSize);
                    
                    switch (action) {
                        case 'first':
                            this.currentPage = 1;
                            break;
                        case 'prev':
                            this.currentPage = Math.max(1, this.currentPage - 1);
                            break;
                        case 'next':
                            this.currentPage = Math.min(totalPages, this.currentPage + 1);
                            break;
                        case 'last':
                            this.currentPage = totalPages;
                            break;
                    }
                    this.renderTable();
                }
            });

            // 每頁顯示數量變更事件
            this.addEventListener(this.paginationContainer, 'change', (e) => {
                if (e.target.classList.contains('page-size-select')) {
                    this.options.pageSize = parseInt(e.target.value);
                    this.currentPage = 1; // 重置到第一頁
                    this.renderTable();
                }
            });
        }

        // 選擇事件
        if (this.options.selectable) {
            // 全選
            this.addEventListener(this.thead, 'change', (e) => {
                if (e.target.classList.contains('select-all')) {
                    const checkboxes = this.tbody.querySelectorAll('.row-select');
                    checkboxes.forEach(checkbox => {
                        checkbox.checked = e.target.checked;
                        if (e.target.checked) {
                            this.selectedRows.add(checkbox.value);
                        } else {
                            this.selectedRows.delete(checkbox.value);
                        }
                    });
                    this.onSelectionChange();
                }
            });

            // 單選
            this.addEventListener(this.tbody, 'change', (e) => {
                if (e.target.classList.contains('row-select')) {
                    if (e.target.checked) {
                        this.selectedRows.add(e.target.value);
                    } else {
                        this.selectedRows.delete(e.target.value);
                    }
                    this.updateSelectAllState();
                    this.onSelectionChange();
                }
            });
        }
    }

    updateSortIndicators() {
        const indicators = this.thead.querySelectorAll('.sort-indicator');
        indicators.forEach(indicator => {
            indicator.className = 'sort-indicator';
        });

        if (this.sortColumn) {
            const th = this.thead.querySelector(`th[data-key="${this.sortColumn}"]`);
            if (th) {
                const indicator = th.querySelector('.sort-indicator');
                indicator.className = `sort-indicator sort-${this.sortDirection}`;
            }
        }
    }

    updateSelectAllState() {
        const selectAll = this.thead.querySelector('.select-all');
        const checkboxes = this.tbody.querySelectorAll('.row-select');
        const checkedCount = this.tbody.querySelectorAll('.row-select:checked').length;
        
        if (selectAll) {
            selectAll.checked = checkedCount === checkboxes.length;
            selectAll.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
        }
    }

    getFilteredData() {
        let data = [...this.options.data];

        // 搜尋過濾
        if (this.searchTerm) {
            data = data.filter(row => {
                return this.options.columns.some(column => {
                    const value = row[column.key];
                    return value && value.toString().toLowerCase().includes(this.searchTerm.toLowerCase());
                });
            });
        }

        // 排序
        if (this.sortColumn) {
            data.sort((a, b) => {
                const aVal = a[this.sortColumn];
                const bVal = b[this.sortColumn];
                
                if (aVal < bVal) return this.sortDirection === 'asc' ? -1 : 1;
                if (aVal > bVal) return this.sortDirection === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return data;
    }

    getPaginatedData(data) {
        const startIndex = (this.currentPage - 1) * this.options.pageSize;
        const endIndex = startIndex + this.options.pageSize;
        return data.slice(startIndex, endIndex);
    }

    setData(data) {
        this.options.data = data;
        this.currentPage = 1;
        this.selectedRows.clear();
        this.renderTable();
        return this;
    }

    getSelectedRows() {
        return Array.from(this.selectedRows);
    }

    clearSelection() {
        this.selectedRows.clear();
        const checkboxes = this.element.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => checkbox.checked = false);
        return this;
    }

    onSelectionChange() {
        // 子類實現
    }
}

// 表單組件
class Form extends Component {
    get defaultOptions() {
        return {
            validation: true,
            autoSubmit: false,
            resetAfterSubmit: false,
            showErrors: true
        };
    }

    init() {
        this.fields = new Map();
        this.validators = new Map();
        this.errors = new Map();
        
        super.init();
        this.scanFields();
    }

    scanFields() {
        const inputs = this.element.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            this.addField(input);
        });
    }

    addField(input, validator = null) {
        const name = input.name || input.id;
        if (name) {
            this.fields.set(name, input);
            if (validator) {
                this.validators.set(name, validator);
            }
        }
        return this;
    }

    addValidator(fieldName, validator) {
        this.validators.set(fieldName, validator);
        return this;
    }

    bindEvents() {
        this.addEventListener(this.element, 'submit', (e) => {
            e.preventDefault();
            this.handleSubmit();
        });

        if (this.options.validation) {
            this.addEventListener(this.element, 'blur', (e) => {
                if (e.target.matches('input, select, textarea')) {
                    this.validateField(e.target.name || e.target.id);
                }
            }, true);
        }
    }

    handleSubmit() {
        if (this.options.validation && !this.validate()) {
            return;
        }

        const formData = this.getData();
        this.onSubmit(formData);

        if (this.options.resetAfterSubmit) {
            this.reset();
        }
    }

    validate() {
        this.errors.clear();
        let isValid = true;

        this.validators.forEach((validator, fieldName) => {
            const field = this.fields.get(fieldName);
            if (field) {
                const error = validator(field.value, this.getData());
                if (error) {
                    this.errors.set(fieldName, error);
                    isValid = false;
                }
            }
        });

        if (this.options.showErrors) {
            this.displayErrors();
        }

        return isValid;
    }

    validateField(fieldName) {
        const validator = this.validators.get(fieldName);
        const field = this.fields.get(fieldName);
        
        if (validator && field) {
            const error = validator(field.value, this.getData());
            if (error) {
                this.errors.set(fieldName, error);
            } else {
                this.errors.delete(fieldName);
            }
            
            if (this.options.showErrors) {
                this.displayFieldError(fieldName);
            }
        }
    }

    displayErrors() {
        // 清除所有錯誤顯示
        this.element.querySelectorAll('.field-error').forEach(el => el.remove());
        this.element.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));

        // 顯示新錯誤
        this.errors.forEach((error, fieldName) => {
            this.displayFieldError(fieldName);
        });
    }

    displayFieldError(fieldName) {
        const field = this.fields.get(fieldName);
        if (!field) return;

        // 移除舊錯誤
        const oldError = field.parentNode.querySelector('.field-error');
        if (oldError) oldError.remove();
        field.classList.remove('is-invalid');

        // 顯示新錯誤
        const error = this.errors.get(fieldName);
        if (error) {
            field.classList.add('is-invalid');
            const errorElement = DOMUtils.createElement('div', {
                class: 'field-error text-danger'
            });
            errorElement.textContent = error;
            field.parentNode.appendChild(errorElement);
        }
    }

    getData() {
        const data = {};
        this.fields.forEach((field, name) => {
            if (field.type === 'checkbox') {
                data[name] = field.checked;
            } else if (field.type === 'radio') {
                if (field.checked) {
                    data[name] = field.value;
                }
            } else {
                data[name] = field.value;
            }
        });
        return data;
    }

    setData(data) {
        Object.keys(data).forEach(key => {
            const field = this.fields.get(key);
            if (field) {
                if (field.type === 'checkbox') {
                    field.checked = !!data[key];
                } else if (field.type === 'radio') {
                    field.checked = field.value === data[key];
                } else {
                    field.value = data[key] || '';
                }
            }
        });
        return this;
    }

    reset() {
        this.element.reset();
        this.errors.clear();
        this.displayErrors();
        return this;
    }

    onSubmit(data) {
        // 子類實現
    }
}

// 組件註冊器
class ComponentRegistry {
    constructor() {
        this.components = new Map();
        this.autoInit = true;
    }

    // 靜態方法用於創建組件
    static create(name, options = {}) {
        return window.componentRegistry.create(name, options);
    }

    // 靜態方法用於註冊組件
    static register(name, componentClass) {
        if (window.componentRegistry) {
            window.componentRegistry.register(name, componentClass);
        }
        return this;
    }

    create(name, options = {}) {
        const ComponentClass = this.components.get(name);
        if (!ComponentClass) {
            console.error(`Component "${name}" not registered`);
            return null;
        }

        let container;
        if (options.container) {
            container = typeof options.container === 'string' ? 
                document.querySelector(options.container) : options.container;
            delete options.container;
        }

        if (options.id && !container) {
            container = document.getElementById(options.id);
        }

        return new ComponentClass(container, options);
    }

    register(name, componentClass) {
        this.components.set(name, componentClass);
        
        if (this.autoInit) {
            this.initComponents(name);
        }
        
        return this;
    }

    initComponents(name = null) {
        if (name) {
            const componentClass = this.components.get(name);
            if (componentClass) {
                const elements = DOMUtils.$$(`[data-component="${name}"]`);
                elements.forEach(element => {
                    if (!element._component) {
                        const options = this.parseOptions(element);
                        new componentClass(element, options);
                    }
                });
            }
        } else {
            this.components.forEach((componentClass, componentName) => {
                this.initComponents(componentName);
            });
        }
        
        return this;
    }

    parseOptions(element) {
        const optionsAttr = element.getAttribute('data-options');
        if (optionsAttr) {
            try {
                return JSON.parse(optionsAttr);
            } catch (e) {
                console.warn('Invalid component options:', optionsAttr);
            }
        }
        return {};
    }

    get(name) {
        return this.components.get(name);
    }

    create(name, options = {}) {
        const ComponentClass = this.components.get(name);
        if (!ComponentClass) {
            console.error(`Component "${name}" not registered`);
            return null;
        }

        let container;
        if (options.container) {
            container = typeof options.container === 'string' ? 
                document.querySelector(options.container) : options.container;
            delete options.container;
        }

        if (options.id && !container) {
            container = document.getElementById(options.id);
        }

        return new ComponentClass(container, options);
    }

    destroy(element) {
        if (element._component) {
            element._component.destroy();
        }
        return this;
    }
}

// 簡單的圖表組件
class SimpleChart extends Component {
    constructor(element, options = {}) {
        super(element, options);
        this.type = options.type || 'line';
        this.data = options.data || [];
        this.render();
    }

    get defaultOptions() {
        return {
            type: 'line',
            data: [],
            width: '100%',
            height: '300px'
        };
    }

    render() {
        const data = this.data || this.options.data || [];
        const type = this.type || this.options.type || 'line';
        
        this.element.innerHTML = `
            <div class="chart-container" style="width: ${this.options.width}; height: ${this.options.height};">
                <div class="chart-placeholder">
                    <p>圖表組件 (${type})</p>
                    <p>數據點: ${data.length}</p>
                </div>
            </div>
        `;
    }

    updateData(data) {
        this.data = data;
        this.render();
    }
}

// 創建全域組件註冊器
const componentRegistry = new ComponentRegistry();

// 註冊內建組件
componentRegistry
    .register('Modal', Modal)
    .register('modal', Modal)
    .register('DataTable', DataTable)
    .register('data-table', DataTable)
    .register('Chart', SimpleChart)
    .register('chart', SimpleChart)
    .register('Form', Form)
    .register('form', Form);

// 自動初始化組件
document.addEventListener('DOMContentLoaded', () => {
    componentRegistry.initComponents();
});

// 導出到全域
window.Component = Component;
window.Modal = Modal;
window.DataTable = DataTable;
window.SimpleChart = SimpleChart;
window.Form = Form;
window.ComponentRegistry = ComponentRegistry;
window.componentRegistry = componentRegistry;