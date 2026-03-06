/**
 * 分類管理功能 - 樹狀結構與拖曳排序版
 */
class CategoryManagement {
    constructor() {
        this.currentType = 'identity'; // Default to identity as per UI
        this.categories = []; // Flat list from API
        this.tree = []; // Nested tree structure
        this.draggedNodeId = null;
        this.dragOverNodeId = null;
        this.dragPosition = null; // 'top', 'bottom', 'inside'
        
        // Ensure categoryService is available
        this.service = window.categoryService;
        if (!this.service) {
            console.error('CategoryService not found. Make sure api.js is loaded.');
        }

        // Expanded nodes state (persist across re-renders)
        this.expandedNodes = new Set();
        
        // Cache and Map
        this.categoryCache = new Map();
        this.nodeMap = new Map();
        this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes

        // Auto-init if container exists
        if (document.getElementById('categoryManagementRoot')) {
            this.init();
        }
    }

    init() {
        this.renderLayout();
        this.loadCategories();
    }

    renderLayout() {
        const container = document.getElementById('categoryManagementRoot');
        if (!container) return;

        container.innerHTML = `
            <div class="category-type-selector">
                <div class="category-type-tabs">
                    <button class="category-type-tab ${this.currentType === 'identity' ? 'active' : ''}" data-type="identity">
                        <span class="tab-icon">👤</span>
                        <span class="tab-text">身份設定</span>
                    </button>
                    <button class="category-type-tab ${this.currentType === 'unit' ? 'active' : ''}" data-type="unit">
                        <span class="tab-icon">🏢</span>
                        <span class="tab-text">單位設定</span>
                    </button>
                    <button class="category-type-tab ${this.currentType === 'region' ? 'active' : ''}" data-type="region">
                        <span class="tab-icon">🌍</span>
                        <span class="tab-text">區域設定</span>
                    </button>
                    <button class="category-type-tab ${this.currentType === 'department' ? 'active' : ''}" data-type="department">
                        <span class="tab-icon">🏛️</span>
                        <span class="tab-text">部門設定</span>
                    </button>
                    <button class="category-type-tab ${this.currentType === 'contract' ? 'active' : ''}" data-type="contract">
                        <span class="tab-icon">📋</span>
                        <span class="tab-text">合約設定</span>
                    </button>
                    <button class="category-type-tab ${this.currentType === 'product' ? 'active' : ''}" data-type="product">
                        <span class="tab-icon">📦</span>
                        <span class="tab-text">產品設定</span>
                    </button>
                </div>
            </div>

            <div class="category-management-content-inner">
                <div class="category-management-header">
                    <h3 id="currentCategoryType">${this.getCategoryTypeName(this.currentType)}</h3>
                    <div class="category-actions">
                        <button id="addCategoryBtn" class="btn btn-primary">
                            <span class="btn-icon">➕</span> 新增分類
                        </button>
                        <button id="importBtn" class="btn btn-secondary">
                            <span class="btn-icon">📥</span> 匯入分類
                        </button>
                        <button id="exportBtn" class="btn btn-secondary">
                            <span class="btn-icon">📤</span> 匯出分類
                        </button>
                    </div>
                </div>

                <div class="category-toolbar">
                    <div class="search-box">
                        <i class="fas fa-search"></i>
                        <input type="text" id="categorySearch" placeholder="搜尋分類..." class="form-control">
                    </div>
                    <div class="actions">
                         <button id="refreshCategoriesBtn" class="btn btn-secondary btn-sm" title="重新整理">
                            <i class="fas fa-sync-alt"></i>
                        </button>
                    </div>
                </div>
                
                <div id="categoryTreeContainer" class="category-tree-container">
                    <div class="loading-state">
                        <div class="loading-spinner"></div>
                        <div>載入分類中...</div>
                    </div>
                </div>

                <div class="category-stats">
                    <div class="stat-item">
                        <span class="stat-label">總分類數</span>
                        <span class="stat-value" id="totalCategories">-</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">已使用分類</span>
                        <span class="stat-value" id="usedCategories">-</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">未使用分類</span>
                        <span class="stat-value" id="unusedCategories">-</span>
                    </div>
                </div>
            </div>
        `;

        this.bindEvents();
    }
    
    bindEvents() {
        // Tab Switching
        const container = document.getElementById('categoryManagementRoot');
        if (!container) return;

        container.querySelectorAll('.category-type-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const type = e.currentTarget.dataset.type;
                if (type) this.switchCategoryType(type);
            });
        });

        // Toolbar Actions
        const searchInput = document.getElementById('categorySearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.filterTree(e.target.value));
        }

        const addBtn = document.getElementById('addCategoryBtn');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.showAddCategoryModal());
        }

        const refreshBtn = document.getElementById('refreshCategoriesBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.loadCategories());
        }

        // Import/Export
        const importBtn = document.getElementById('importBtn');
        if (importBtn) {
            importBtn.addEventListener('click', () => this.showImportCategoryModal());
        }
        
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.handleExportCategories());
        }

        // Modal Events
        this.bindModalEvents();
    }

    bindModalEvents() {
        // Category Modal
        const closeCategoryBtn = document.getElementById('closeCategoryModalBtn');
        const cancelCategoryBtn = document.getElementById('cancelCategoryModalBtn');
        const saveCategoryBtn = document.getElementById('saveCategoryFormBtn');

        if (closeCategoryBtn) closeCategoryBtn.addEventListener('click', () => this.closeAddCategoryModal());
        if (cancelCategoryBtn) cancelCategoryBtn.addEventListener('click', () => this.closeAddCategoryModal());
        if (saveCategoryBtn) saveCategoryBtn.addEventListener('click', () => this.handleSaveCategory());

        // Category Type Change in Modal (to update parent options)
        const categoryTypeSelect = document.getElementById('categoryType');
        if (categoryTypeSelect) {
            categoryTypeSelect.addEventListener('change', (e) => {
                this.populateParentSelect(e.target.value);
            });
        }

        // Import Modal
        const closeImportBtn = document.getElementById('closeImportModalBtn');
        const cancelImportBtn = document.getElementById('cancelImportBtn');
        const confirmImportBtn = document.getElementById('confirmImportBtn');
        const csvFileInput = document.getElementById('csvFile');

        if (closeImportBtn) closeImportBtn.addEventListener('click', () => this.closeImportCategoryModal());
        if (cancelImportBtn) cancelImportBtn.addEventListener('click', () => this.closeImportCategoryModal());
        
        if (csvFileInput) {
            csvFileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    if (confirmImportBtn) confirmImportBtn.style.display = 'inline-block';
                }
            });
        }

        if (confirmImportBtn) {
            confirmImportBtn.addEventListener('click', () => this.handleImportCategories());
        }
    }

    showAddCategoryModal(parentId = null) {
        const modal = document.getElementById('categoryModal');
        if (!modal) return;

        // Reset form
        document.getElementById('categoryForm').reset();
        document.getElementById('categoryId').value = '';
        document.getElementById('categoryModalTitle').textContent = '新增分類';
        
        // Set default type
        const typeSelect = document.getElementById('categoryType');
        if (typeSelect) {
            typeSelect.value = this.currentType;
            // Trigger change to populate parents
            this.populateParentSelect(this.currentType);
        }

        // Set parent if provided
        if (parentId) {
            setTimeout(() => {
                const parentSelect = document.getElementById('categoryParent');
                if (parentSelect) parentSelect.value = parentId;
            }, 100);
        }

        modal.style.display = 'flex';
    }

    closeAddCategoryModal() {
        const modal = document.getElementById('categoryModal');
        if (modal) modal.style.display = 'none';
    }

    populateParentSelect(type, currentId = null) {
        const parentSelect = document.getElementById('categoryParent');
        if (!parentSelect) return;

        // Clear existing options except default
        parentSelect.innerHTML = '<option value="">無 (頂層分類)</option>';

        // Get categories of this type
        // Note: We need to map the UI type to API type for filtering if needed, 
        // but here we might just filter from loaded categories if they match.
        // Or fetch from API. Since we have this.categories loaded, let's use them if they match type.
        
        // The loaded categories are specific to the current tab (this.currentType).
        // If the modal type matches current tab, use this.categories.
        // Otherwise we might need to fetch or just show empty for now (simplification).
        
        let categoriesToShow = [];
        if (type === this.currentType) {
            categoriesToShow = this.categories;
        } else {
            // If user changes type in modal to something else, we might not have those loaded.
            // For now, let's assume user mostly adds to current type. 
            // Ideally we should fetch all categories or fetch on change.
            // To keep it simple and robust:
            // If types match, show. If not, maybe clear or show warning.
            // But actually, this.categories only contains currentType.
        }

        // Sort by hierarchy/name for display
        // We can use a flat list with indentation
        
        const addOptions = (nodes, level = 0) => {
            nodes.forEach(node => {
                // Skip self and children if editing (circular dependency check)
                if (currentId && (node.id == currentId)) return;
                
                const option = document.createElement('option');
                option.value = node.id;
                option.textContent = '　'.repeat(level) + node.name;
                parentSelect.appendChild(option);

                if (node.children && node.children.length > 0) {
                    addOptions(node.children, level + 1);
                }
            });
        };

        if (this.tree && this.tree.length > 0 && type === this.currentType) {
            addOptions(this.tree);
        }
    }

    async handleSaveCategory() {
        const form = document.getElementById('categoryForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const formData = new FormData(form);
        const rawType = formData.get('categoryType');
        const hierarchyType = this.getApiType(rawType);

        // Prepare data with correct camelCase fields for backend API
        const data = {
            id: formData.get('categoryId'),
            name: formData.get('categoryName'),
            description: formData.get('categoryDescription'),
            sortOrder: parseInt(formData.get('categoryOrder') || 0),
            isActive: document.getElementById('categoryActive').checked,
            
            // For Create (POST) mainly, but harmless for Update (PUT) as they might be ignored
            hierarchyType: hierarchyType,
            categoryType: hierarchyType, // Default categoryType to hierarchyType for new items
            parentId: formData.get('categoryParent') || null
        };

        try {
            let result;
            if (data.id) {
                // Update
                // Ensure we don't accidentally overwrite categoryType with hierarchyType if not intended
                // But since we don't have the original categoryType here easily without lookup, 
                // and backend ignores categoryType if undefined in PUT?
                // Actually backend uses: categoryType: categoryType || category.category_type
                // So if we send categoryType: 'customer', it will update it.
                // This might be what we want if new categories follow this rule.
                result = await this.service.updateCategory(data.id, data);
            } else {
                // Create
                result = await this.service.createCategory(data);
            }

            if (result && result.success) {
                alert('儲存成功');
                this.closeAddCategoryModal();
                this.loadCategories(); // Refresh tree
            } else {
                throw new Error(result.message || '儲存失敗');
            }
        } catch (error) {
            console.error('Save category error:', error);
            alert('儲存失敗: ' + error.message);
        }
    }

    showImportCategoryModal() {
        const modal = document.getElementById('importCategoryModal');
        if (modal) {
            modal.style.display = 'flex';
            document.getElementById('csvFile').value = '';
            document.getElementById('confirmImportBtn').style.display = 'none';
        }
    }

    closeImportCategoryModal() {
        const modal = document.getElementById('importCategoryModal');
        if (modal) modal.style.display = 'none';
    }

    async handleImportCategories() {
        const fileInput = document.getElementById('csvFile');
        if (!fileInput.files || fileInput.files.length === 0) {
            alert('請選擇 CSV 檔案');
            return;
        }

        const file = fileInput.files[0];
        const formData = new FormData();
        formData.append('file', file);
        formData.append('category_type', this.getApiType(this.currentType)); // Import to current type

        try {
            const result = await this.service.importCategories(formData);
            if (result && result.success) {
                alert(`匯入成功: ${result.message || '已完成'}`);
                this.closeImportCategoryModal();
                this.loadCategories();
            } else {
                throw new Error(result.message || '匯入失敗');
            }
        } catch (error) {
            console.error('Import error:', error);
            alert('匯入失敗: ' + error.message);
        }
    }

    async handleExportCategories() {
        try {
            const apiType = this.getApiType(this.currentType);
            
            // Use ApiClient to get the correct token (handles admin/user tokens)
            const token = this.service.apiClient.getCorrectToken();
            
            const response = await fetch(`${this.service.apiClient.baseURL}/categories/export?type=${apiType}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `categories_${this.currentType}_${new Date().toISOString().slice(0,10)}.csv`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                a.remove();
            } else {
                throw new Error('Export failed: ' + response.statusText);
            }
            
        } catch (error) {
            console.error('Export error:', error);
            alert('匯出失敗: ' + error.message);
        }
    }

    getCategoryTypeName(type) {
        const map = {
            'identity': '客戶設定',
            'unit': '單位設定',
            'region': '區域設定',
            'department': '部門設定',
            'contract': '合約設定',
            'product': '產品設定',
            'customer': '客戶分類'
        };
        return map[type] || '分類設定';
    }

    getApiType(uiType) {
        // Map UI types to Database hierarchy_types
        const map = {
            'identity': 'customer', // 身份 -> customer (資料庫中儲存為 customer)
            'unit': 'organization', // 單位 -> organization
            'region': 'geography', // 區域 -> geography
        };
        return map[uiType] || uiType;
    }

    switchCategoryType(type) {
        this.currentType = type;

        // 更新 UI 狀態 (Tabs)
        const container = document.getElementById('categoryManagementRoot');
        if (container) {
            container.querySelectorAll('.category-type-tab').forEach(tab => {
                tab.classList.remove('active');
                if (tab.dataset.type === type) {
                    tab.classList.add('active');
                }
            });
            // Update Title
            const titleEl = document.getElementById('currentCategoryType');
            if (titleEl) titleEl.textContent = this.getCategoryTypeName(type);
        }

        // 重新載入分類
        this.loadCategories();
    }

    async loadCategories() {
        if (!this.service) return;

        const container = document.getElementById('categoryTreeContainer');
        if (container) {
            container.innerHTML = `
                <div class="loading-state">
                    <div class="loading-spinner"></div>
                    <div>載入分類中...</div>
                </div>
            `;
        }
        
        // Reset stats display
        this.updateStats(0, 0, 0);

        try {
            const apiType = this.getApiType(this.currentType);
            const result = await this.service.getCategoriesByType(apiType);
            
            if (result && result.success) {
                this.categories = result.data.categories
                    .filter(cat => {
                        if (!cat || !cat.name) return false;
                        const name = cat.name.toLowerCase();
                        // Filter out Stress and Test categories
                        return !name.startsWith('stress') && !name.startsWith('test');
                    })
                    .map(cat => this.mapCategoryData(cat));
                
                this.buildTree();

                // Populate nodeMap from tree
                this.nodeMap.clear();
                const mapNodes = (nodes) => {
                    nodes.forEach(node => {
                        this.nodeMap.set(node.id, node);
                        if (node.children) mapNodes(node.children);
                    });
                };
                mapNodes(this.tree);
                
                this.renderTree();
                this.calculateStats();
                
                // Restore expanded state (lazy load children of expanded nodes)
                if (this.restoreTreeState) await this.restoreTreeState();
            } else {
                throw new Error(result.message || '載入分類失敗');
            }
            
        } catch (error) {
            console.error('載入分類錯誤:', error);
            if (container) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon" style="color: #ef4444;"><i class="fas fa-exclamation-circle"></i></div>
                        <div class="empty-state-title">載入失敗</div>
                        <div class="empty-state-description">${error.message}</div>
                        <button class="btn btn-sm btn btn-outline-primary" id="retryLoadCategoriesBtn">重試</button>
                    </div>
                `;
                document.getElementById('retryLoadCategoriesBtn').addEventListener('click', () => this.loadCategories());
            }
        }
    }

    calculateStats() {
        const total = this.categories.length;
        const used = this.categories.filter(c => c.subscriber_count > 0).length; // Approximate check
        const unused = total - used;
        this.updateStats(total, used, unused);
    }

    updateStats(total, used, unused) {
        const totalEl = document.getElementById('totalCategories');
        const usedEl = document.getElementById('usedCategories');
        const unusedEl = document.getElementById('unusedCategories');
        
        if (totalEl) totalEl.textContent = total;
        if (usedEl) usedEl.textContent = used;
        if (unusedEl) unusedEl.textContent = unused;
    }

    buildTree() {
        const map = {};
        const roots = [];
        
        // Initialize map
        this.categories.forEach(cat => {
            map[cat.id] = { ...cat, children: [] };
        });

        // Build hierarchy
        this.categories.forEach(cat => {
            if (cat.parent_id && map[cat.parent_id]) {
                map[cat.parent_id].children.push(map[cat.id]);
            } else {
                roots.push(map[cat.id]);
            }
        });

        // Sort by sort_order
        const sortNodes = (nodes) => {
            nodes.sort((a, b) => a.sort_order - b.sort_order);
            nodes.forEach(node => {
                if (node.children.length > 0) {
                    sortNodes(node.children);
                }
            });
        };

        sortNodes(roots);
        this.tree = roots;
    }

    renderTree() {
        const container = document.getElementById('categoryTreeContainer');
        if (!container) return;

        if (this.tree.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📁</div>
                    <div class="empty-state-title">沒有找到分類</div>
                    <div class="empty-state-description">
                        點擊上方「新增分類」按鈕來建立第一個分類
                    </div>
                </div>
            `;
            return;
        }

        container.innerHTML = `<ul class="tree-root">${this.renderNodes(this.tree)}</ul>`;
        this.bindTreeEvents(container);
    }

    renderNodes(nodes) {
        return nodes.map(node => {
            const hasChildren = (node.children && node.children.length > 0) || (node.child_count > 0);
            const isExpanded = this.expandedNodes.has(node.id.toString());
            
            return `
                <li class="tree-node" data-id="${node.id}" data-level="${node.level}">
                    <div class="tree-node-content" 
                         draggable="true" 
                         data-id="${node.id}">
                        
                        <div class="node-toggle ${hasChildren ? '' : 'invisible'} ${isExpanded ? 'expanded' : ''}" 
                             data-action="toggle" data-id="${node.id}">
                            <i class="fas fa-caret-right"></i>
                        </div>
                        
                        <div class="node-drag-handle">
                            <i class="fas fa-grip-vertical"></i>
                        </div>
                        
                        <div class="node-icon">
                            ${node.image_url 
                                ? `<img src="${node.image_url}" alt="icon">` 
                                : `<i class="far fa-folder${isExpanded ? '-open' : ''}"></i>`}
                        </div>
                        
                        <div class="node-label" title="${this.escapeHtml(node.description)}">
                            ${this.escapeHtml(node.name)}
                        </div>
                        
                        <div class="node-meta">
                            <span>${node.subscriber_count || 0}</span>
                        </div>
                        
                        <div class="node-actions">
                            <button class="btn-icon-only" title="新增子分類" data-action="add-child" data-id="${node.id}">
                                <i class="fas fa-plus"></i>
                            </button>
                            <button class="btn-icon-only" title="編輯" data-action="edit" data-id="${node.id}">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-icon-only text-danger" title="刪除" data-action="delete" data-id="${node.id}">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </div>
                    </div>
                    
                    ${hasChildren ? `
                        <ul class="tree-children ${isExpanded ? '' : 'hidden'}" id="children-${node.id}">
                            ${isExpanded ? this.renderNodes(node.children) : ''}
                        </ul>
                    ` : ''}
                </li>
            `;
        }).join('');
    }

    bindTreeEvents(container) {
        // Toggle Expand/Collapse
        container.querySelectorAll('[data-action="toggle"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleNode(btn.dataset.id);
            });
        });

        // Actions
        container.querySelectorAll('[data-action="add-child"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showAddCategoryModal(parseInt(btn.dataset.id));
            });
        });

        container.querySelectorAll('[data-action="edit"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.editCategory(parseInt(btn.dataset.id));
            });
        });

        container.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteCategory(parseInt(btn.dataset.id));
            });
        });

        // Drag and Drop
        const items = container.querySelectorAll('.tree-node-content');
        items.forEach(item => {
            item.addEventListener('dragstart', this.handleDragStart.bind(this));
            item.addEventListener('dragover', this.handleDragOver.bind(this));
            item.addEventListener('dragleave', this.handleDragLeave.bind(this));
            item.addEventListener('drop', this.handleDrop.bind(this));
            item.addEventListener('dragend', this.handleDragEnd.bind(this));
        });
    }

    mapCategoryData(cat) {
        return {
            id: cat.id,
            name: cat.name,
            type: cat.hierarchyType,
            category_type: cat.categoryType,
            parent_id: cat.parentId,
            level: cat.level,
            path: cat.path,
            sort_order: cat.sortOrder,
            is_leaf: cat.isLeaf,
            is_active: cat.isActive,
            subscriber_count: cat.subscriberCount,
            child_count: cat.childCount || 0,
            description: cat.description || '',
            image_url: cat.imageUrl || cat.image_url
        };
    }

    async toggleNode(nodeId) {
        const idStr = nodeId.toString();
        const childrenUl = document.getElementById(`children-${nodeId}`);
        const toggleBtn = document.querySelector(`.node-toggle[data-id="${nodeId}"]`);
        
        if (this.expandedNodes.has(idStr)) {
            // Collapse
            this.expandedNodes.delete(idStr);
            if (childrenUl) childrenUl.classList.add('hidden');
            if (toggleBtn) toggleBtn.classList.remove('expanded');
            
            const icon = toggleBtn.parentElement.querySelector('.node-icon i');
            if (icon && icon.classList.contains('fa-folder-open')) {
                icon.classList.replace('fa-folder-open', 'fa-folder');
            }
        } else {
            // Expand
            this.expandedNodes.add(idStr);
            if (toggleBtn) toggleBtn.classList.add('expanded');
            
            const icon = toggleBtn.parentElement.querySelector('.node-icon i');
            if (icon && icon.classList.contains('fa-folder')) {
                icon.classList.replace('fa-folder', 'fa-folder-open');
            }

            // Lazy Load Children if needed
            const node = this.nodeMap.get(parseInt(nodeId));
            
            // Check if we need to render existing children (Optimization: they are not rendered when collapsed)
            if (node && node.children && node.children.length > 0 && childrenUl && childrenUl.innerHTML.trim() === '') {
                 childrenUl.innerHTML = this.renderNodes(node.children);
                 this.bindTreeEvents(childrenUl);
            }

            if (node && (!node.children || node.children.length === 0) && node.child_count > 0) {
                // Show loading in childrenUl
                if (childrenUl) {
                    childrenUl.classList.remove('hidden');
                    childrenUl.innerHTML = '<li class="loading-node"><div class="loading-spinner-sm"></div> 載入子分類...</li>';
                }

                try {
                    // Check cache
                    const cacheKey = `${this.currentType}-${nodeId}`;
                    let result;

                    if (this.categoryCache.has(cacheKey) && (Date.now() - this.categoryCache.get(cacheKey).timestamp < this.CACHE_TTL)) {
                        result = this.categoryCache.get(cacheKey).data;
                    } else {
                        // Fetch children
                        const apiType = this.getApiType(this.currentType);
                        result = await this.service.getCategoriesByType(apiType, { 
                            parentId: nodeId,
                            includeChildren: true 
                        });

                        if (result && result.success) {
                            this.categoryCache.set(cacheKey, {
                                data: result,
                                timestamp: Date.now()
                            });
                        }
                    }

                    if (result && result.success) {
                        const children = result.data.categories.map(cat => this.mapCategoryData(cat));
                        node.children = children;
                        
                        // Update Map
                        children.forEach(child => this.nodeMap.set(child.id, child));
                        
                        // Render
                        if (childrenUl) {
                            childrenUl.innerHTML = this.renderNodes(children);
                            // Re-bind events for new nodes
                            this.bindTreeEvents(childrenUl);
                        }
                    }
                } catch (error) {
                    console.error('Lazy load error:', error);
                    if (childrenUl) {
                        childrenUl.innerHTML = `<li class="error-node">載入失敗 <button class="btn btn-link" data-action="retry-toggle" data-id="${nodeId}">重試</button></li>`;
                        const retryBtn = childrenUl.querySelector('[data-action="retry-toggle"]');
                        if (retryBtn) {
                            retryBtn.addEventListener('click', (e) => {
                                e.stopPropagation();
                                this.toggleNode(nodeId);
                            });
                        }
                    }
                }
            } else {
                 if (childrenUl) childrenUl.classList.remove('hidden');
            }
        }
    }

    // Drag and Drop Handlers
    handleDragStart(e) {
        this.draggedNodeId = e.currentTarget.dataset.id;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', this.draggedNodeId);
        e.currentTarget.classList.add('dragging');
    }

    handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const target = e.currentTarget;
        const targetId = target.dataset.id;
        
        // Don't allow dragging onto itself or its children (simple check: same id)
        if (this.draggedNodeId === targetId) return;

        // Calculate position relative to target
        const rect = target.getBoundingClientRect();
        const relY = e.clientY - rect.top;
        const height = rect.height;
        
        // 25% top -> insert before
        // 50% middle -> insert inside (as child)
        // 25% bottom -> insert after
        
        this.clearDragClasses();
        target.classList.add('drag-over');

        if (relY < height * 0.25) {
            this.dragPosition = 'before';
            target.classList.add('drag-over-top');
        } else if (relY > height * 0.75) {
            this.dragPosition = 'after';
            target.classList.add('drag-over-bottom');
        } else {
            this.dragPosition = 'inside';
            // Default style is enough for inside
        }
        
        this.dragOverNodeId = targetId;
    }

    handleDragLeave(e) {
        const target = e.currentTarget;
        // Check if we are really leaving the element (and not entering a child)
        // This part is tricky with native DnD, often flickering. 
        // We clear classes in dragOver instead to ensure only one is active.
    }

    async handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        this.clearDragClasses();
        
        if (!this.draggedNodeId || !this.dragOverNodeId || this.draggedNodeId === this.dragOverNodeId) return;

        const draggedId = parseInt(this.draggedNodeId);
        const targetId = parseInt(this.dragOverNodeId);
        const position = this.dragPosition;
        
        // Call API to move
        await this.moveCategory(draggedId, targetId, position);
    }

    handleDragEnd(e) {
        this.clearDragClasses();
        e.currentTarget.classList.remove('dragging');
        this.draggedNodeId = null;
        this.dragOverNodeId = null;
        this.dragPosition = null;
    }

    clearDragClasses() {
        document.querySelectorAll('.tree-node-content').forEach(el => {
            el.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
        });
    }

    async moveCategory(nodeId, targetId, position) {
        try {
            // Find target node to get its parent
            const targetNode = this.nodeMap.get(targetId);
            if (!targetNode) return;

            let newParentId = null;
            let newSortOrder = 0; // Backend should handle reordering, but we pass hints if needed

            if (position === 'inside') {
                newParentId = targetId;
            } else {
                newParentId = targetNode.parent_id;
            }

            // Show loading
            this.showLoading();

            const result = await this.service.moveCategory({
                nodeId,
                targetId,
                position,
                newParentId
            });

            if (result && result.success) {
                // Refresh tree
                await this.loadCategories();
                // Ensure target parent is expanded if we moved inside
                if (position === 'inside') {
                    this.expandedNodes.add(targetId.toString());
                } else if (newParentId) {
                    this.expandedNodes.add(newParentId.toString());
                }
                // Also expand the new parent of the moved node to show it
                if (newParentId) this.expandedNodes.add(newParentId.toString());
                
                this.renderTree();
            } else {
                throw new Error(result.message || '移動失敗');
            }

        } catch (error) {
            console.error('移動分類錯誤:', error);
            this.showError('移動分類失敗: ' + error.message);
            this.loadCategories(); // Reload to reset state
        }
    }

    // Modal & Form Handling
    


    async editCategory(id) {
        // Find category in flat list or try to find in nodeMap if flat list is incomplete
        let category = this.categories.find(c => c.id === id);
        
        if (!category && this.nodeMap.has(id)) {
            // Fallback to nodeMap if not found in flat list (e.g. lazy loaded children)
            const node = this.nodeMap.get(id);
            // Convert node back to category data structure if needed, or use node directly
            // mapCategoryData maps API format to internal format. Node is already internal format.
            category = node;
        }

        if (!category) {
            console.error('Category not found:', id);
            return;
        }

        let modal = document.getElementById('categoryModal');
        if (!modal) return;

        // Reset form first
        document.getElementById('categoryForm').reset();

        document.getElementById('categoryId').value = category.id;
        document.getElementById('categoryName').value = category.name;
        
        // Set type
        const typeSelect = document.getElementById('categoryType');
        if (typeSelect) {
             // If the category has a specific type field, use it, otherwise use currentType
             // Note: category.category_type might be API type (customer) vs UI type (identity)
             // But UI select expects UI values. 
             // We can rely on this.currentType for now as lists are separated by type.
             typeSelect.value = this.currentType; 
        }
        
        // Populate parents - pass currentId to avoid circular selection
        this.populateParentSelect(this.currentType, category.id);
        
        // Set parent value after options are populated
        setTimeout(() => {
            const parentSelect = document.getElementById('categoryParent');
            if (parentSelect) {
                parentSelect.value = category.parent_id || '';
            }
        }, 0);
        
        const orderInput = document.getElementById('categoryOrder');
        if (orderInput) orderInput.value = category.sort_order || 0;
        
        const descInput = document.getElementById('categoryDescription');
        if (descInput) descInput.value = category.description || '';
        
        const activeInput = document.getElementById('categoryActive');
        if (activeInput) activeInput.checked = category.is_active !== false; // Default true

        // Image preview (if elements exist)
        const previewContainer = document.getElementById('imagePreview');
        const previewImg = document.getElementById('previewImg');
        if (previewContainer && previewImg) {
            if (category.image_url) {
                previewImg.src = category.image_url;
                previewContainer.style.display = 'flex';
            } else {
                previewContainer.style.display = 'none';
                previewImg.src = '';
            }
        }

        const titleEl = document.getElementById('categoryModalTitle');
        if (titleEl) titleEl.textContent = '編輯分類';
        
        modal.style.display = 'flex';
    }

    async deleteCategory(id) {
        if (!confirm('確定要刪除此分類嗎？如果該分類下有子分類或已關聯數據，可能會被拒絕刪除。')) return;

        try {
            this.showLoading();
            const result = await this.service.deleteCategory(id);
            if (result && result.success) {
                this.showSuccess('分類已刪除');
                this.loadCategories();
            } else {
                throw new Error(result.message || '刪除失敗');
            }
        } catch (error) {
            this.showError(error.message);
            this.renderTree(); // Re-render to remove loading state
        }
    }

    // Filter Tree (Search)
    filterTree(searchTerm) {
        if (!searchTerm) {
            this.renderTree(); // Render full tree
            return;
        }

        const term = searchTerm.toLowerCase();
        
        // Helper to check if node matches or has matching children
        const filterNode = (node) => {
            const matches = node.name.toLowerCase().includes(term) || 
                          (node.description && node.description.toLowerCase().includes(term));
            
            let hasMatchingChildren = false;
            let filteredChildren = [];

            if (node.children) {
                node.children.forEach(child => {
                    const childMatch = filterNode(child);
                    if (childMatch) {
                        hasMatchingChildren = true;
                        filteredChildren.push(childMatch);
                    }
                });
            }

            if (matches || hasMatchingChildren) {
                // Return a copy of node with filtered children
                // We expand nodes that have matches
                if (hasMatchingChildren) {
                    this.expandedNodes.add(node.id.toString());
                }
                return { ...node, children: filteredChildren };
            }
            
            return null;
        };

        const filteredRoots = [];
        this.tree.forEach(root => {
            const match = filterNode(root);
            if (match) filteredRoots.push(match);
        });

        // Render filtered tree
        const container = document.getElementById('categoryTreeContainer');
        if (container) {
             if (filteredRoots.length === 0) {
                 container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">🔍</div>
                        <div class="empty-state-title">未找到相關分類</div>
                    </div>
                 `;
             } else {
                 container.innerHTML = `<ul class="tree-root">${this.renderNodes(filteredRoots)}</ul>`;
                 this.bindTreeEvents(container);
             }
        }
    }

    showLoading() {
        const container = document.getElementById('categoryTreeContainer');
        if (container) {
            // Keep content but overlay or just show simple loading if empty
            // For now simple replacement
            // container.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div></div>';
        }
    }

    showError(message) {
        if (window.showError) {
            window.showError(message);
        } else {
            alert('錯誤: ' + message);
        }
    }
    
    showSuccess(message) {
        if (window.showSuccess) {
            window.showSuccess(message);
        } else {
            alert(message);
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize
window.categoryManagement = new CategoryManagement();
