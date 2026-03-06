// 訂閱者管理系統 - 重新設計版本
class SubscribersManager {
    constructor() {
        // this.apiClient = new ApiClient(); // Removed this line
        // this.subscriberService = new SubscriberService(this.apiClient); // Removed this line
        this.currentPage = 1;
        this.pageSize = 50;
        this.totalPages = 1;
        this.totalItems = 0;
        this.sortField = 'created_at';
        this.sortDirection = 'desc';
        
        this.dom = {}; // Initialize dom object

        this.filters = {
            search: '',
            status: '',
            // categoryId: 'all', // Removed, replaced by quickCategoryIds
            hierarchyType: '',
            category: '',
            advancedCategoryIds: new Set()
        };
        
        this.selectedSubscribers = new Set();
        this.selectAllMatching = false; // Flag for selecting all matching items across pages
        this.selectedCategories = new Set();
        this.quickCategoryIds = new Set(); // For multi-select dropdown
        this.tempAdvancedCategoryIds = new Set(); // For advanced filter modal
        this.allSubscribers = [];
        this.categories = [];
        this.stats = {
            total: 0,
            active: 0,
            inactive: 0,
            unsubscribed: 0
        };
        
        this.currentUser = null;

        // 匯入功能狀態
        this.importState = {
            step: 1,
            file: null,
            data: [],
            headers: [],
            mapping: {},
            preview: []
        };
        
        // 分類群組 (Aligned with hierarchy_type)
        this.categoryGroups = {
            customer: { name: '客戶分類', icon: 'fas fa-users', expanded: false, categories: [] },
            organization: { name: '組織分類', icon: 'fas fa-sitemap', expanded: false, categories: [] },
            geography: { name: '地理區域', icon: 'fas fa-map-marked-alt', expanded: false, categories: [] },
            department: { name: '部門分類', icon: 'fas fa-building', expanded: false, categories: [] },
            contract: { name: '合約分類', icon: 'fas fa-file-contract', expanded: false, categories: [] },
            product: { name: '產品分類', icon: 'fas fa-box', expanded: false, categories: [] },
            identity: { name: '身份分類', icon: 'fas fa-id-badge', expanded: false, categories: [] }
        };
        
        this.init();
    }
    
    async init() {
        try {
            console.log('init called');
            this.cacheDOMElements(); // Cache DOM elements first
            this.showLoadingState(); // 強制顯示
            this.setupEventListeners();
            this.setupImportEventListeners();

            // Check URL parameters
            const urlParams = new URLSearchParams(window.location.search);
            const searchParam = urlParams.get('search');
            if (searchParam) {
                this.filters.search = searchParam;
                if (this.dom.searchInput) {
                    this.dom.searchInput.value = searchParam;
                }
                if (this.dom.clearSearchBtn) {
                    this.dom.clearSearchBtn.style.display = 'block';
                }
            }
            
            await this.loadInitialData();
            this.updateUI();
            this.checkPermissions();
        } catch (error) {
            console.error('初始化失敗:', error);
            this.showError('系統初始化失敗，請重新整理頁面');
            if (this.dom.tableInfo) {
                this.dom.tableInfo.textContent = '載入失敗';
            }
        } 
     finally {
            this.hideLoadingState();
        }
    }
    
    canManageSubscribers() {
        // Try to get user if not present
        if (!this.currentUser) {
            if (window.userAuth) {
                this.currentUser = window.userAuth.getUser();
            } else {
                 // Fallback to reading localStorage directly
                 try {
                     const userStr = localStorage.getItem('user');
                     if (userStr) this.currentUser = JSON.parse(userStr);
                 } catch (e) { console.warn('Failed to parse user from storage'); }
            }
        }
        
        if (!this.currentUser) return false; // Default to restricted if no user
        
        const role = this.currentUser.role || '';
        const normalizedRole = role.toLowerCase().trim();
        return ['admin', 'manager'].includes(normalizedRole);
    }

    checkPermissions() {
        const canManage = this.canManageSubscribers();
        console.log('Checking permissions. User:', this.currentUser, 'Can manage:', canManage);

        if (!canManage) {
            console.log('Applying restrictions for Restricted User');
            
            // Hide Import Button
            if (this.dom.showImportModalBtn) {
                this.dom.showImportModalBtn.style.display = 'none';
            }
            
            // Hide Export Button
            if (this.dom.exportSubscribersBtn) {
                this.dom.exportSubscribersBtn.style.display = 'none';
            }

            // Hide Bulk Delete and Export Buttons
            if (this.dom.bulkDeleteBtn) {
                this.dom.bulkDeleteBtn.style.display = 'none';
            }
            if (this.dom.bulkExportBtn) {
                this.dom.bulkExportBtn.style.display = 'none';
            }
            if (this.dom.bulkActionsBtn) {
                this.dom.bulkActionsBtn.style.display = 'none';
            }
        }
    }

    cacheDOMElements() {
        this.dom = {
            statsContainer: document.getElementById('statsContainer'),
            categoryTree: document.getElementById('categoryTree'),
            subscribersTableBody: document.getElementById('subscribersTableBody'),
            pagination: document.getElementById('pagination'),
            loadingOverlay: document.getElementById('loadingOverlay'),
            tableContainer: document.getElementById('tableContainer'),
            searchInput: document.getElementById('searchInput'),
            statusFilter: document.getElementById('statusFilter'),
            showImportModalBtn: document.getElementById('showImportModalBtn'),
            triggerImportFileBtn: document.getElementById('triggerImportFileBtn'),
            importFile: document.getElementById('importFile'),
            showAddSubscriberModalBtn: document.getElementById('showAddSubscriberModalBtn'),
            showAdvancedFiltersBtn: document.getElementById('showAdvancedFiltersBtn'),
            exportSubscribersBtn: document.getElementById('exportSubscribersBtn'),
            bulkActionsBtn: document.getElementById('bulkActionsBtn'),
            hideBulkActionsBtn: document.getElementById('hideBulkActionsBtn'),
            bulkAddCategoriesBtn: document.getElementById('bulkAddCategoriesBtn'),
            bulkRemoveCategoriesBtn: document.getElementById('bulkRemoveCategoriesBtn'),
            bulkDeleteBtn: document.getElementById('bulkDeleteBtn'),
            bulkCorrectEmailBtn: document.getElementById('bulkCorrectEmailBtn'),
            bulkExportBtn: document.getElementById('bulkExportBtn'),
            clearAllFiltersBtn: document.getElementById('clearAllFiltersBtn'),
            resetAdvancedFiltersBtn: document.getElementById('resetAdvancedFiltersBtn'),
            applyAdvancedFiltersBtn: document.getElementById('applyAdvancedFiltersBtn'),
            cancelAddSubscriberBtn: document.getElementById('cancelAddSubscriberBtn'),
            submitAddSubscriberBtn: document.getElementById('submitAddSubscriberBtn'),
            cancelEditSubscriberBtn: document.getElementById('cancelEditSubscriberBtn'),
            submitUpdateSubscriberBtn: document.getElementById('submitUpdateSubscriberBtn'),
            cancelBulkCategoryBtn: document.getElementById('cancelBulkCategoryBtn'),
            submitBulkCategoryBtn: document.getElementById('submitBulkCategoryBtn'),
            cancelBulkEmailCorrectionBtn: document.getElementById('cancelBulkEmailCorrectionBtn'),
            submitBulkEmailCorrectionBtn: document.getElementById('submitBulkEmailCorrectionBtn'),
            closeCategoryManagementBtn: document.getElementById('closeCategoryManagementBtn'),
            // quickCategoryFilter: document.getElementById('quickCategoryFilter'), // Removed
            quickCategoryTrigger: document.getElementById('quickCategoryTrigger'),
            quickCategoryOptions: document.getElementById('quickCategoryOptions'),
            quickCategoryFilterContainer: document.getElementById('quickCategoryFilterContainer'),
            advancedCategoryTrigger: document.getElementById('advancedCategoryTrigger'),
            advancedCategoryOptions: document.getElementById('advancedCategoryOptions'),
            advancedCategoryContainer: document.getElementById('advancedCategoryContainer'),
            pageSizeSelect: document.getElementById('pageSizeSelect'),
            selectAllCheckbox: document.getElementById('selectAll'),
            selectAllHeaderCheckbox: document.getElementById('selectAllHeader'),
            clearSearchBtn: document.getElementById('clearSearchBtn'),
            manageCategoriesBtn: document.getElementById('manageCategoriesBtn'),
            tableInfo: document.getElementById('tableInfo')
        };
    }
    
    setupImportEventListeners() {
        // 綁定匯入步驟按鈕事件
        const nextStepBtn = document.getElementById('nextStepBtn');
        const prevStepBtn = document.getElementById('prevStepBtn');
        const importBtn = document.getElementById('importBtn');
        const importFile = document.getElementById('importFile');
        
        if (nextStepBtn) {
            nextStepBtn.onclick = () => this.nextImportStep();
        }
        if (prevStepBtn) {
            prevStepBtn.onclick = () => this.previousImportStep();
        }
        if (importBtn) {
            importBtn.onclick = () => this.executeImport();
        }
        if (importFile) {
            importFile.addEventListener('change', (e) => this.handleFileSelection(e));
        }
    }
    
    setupEventListeners() {
        // 綁定按鈕事件
        if (this.dom.showImportModalBtn) this.dom.showImportModalBtn.addEventListener('click', () => this.showImportModal());
        if (this.dom.triggerImportFileBtn) this.dom.triggerImportFileBtn.addEventListener('click', () => {
            if (this.dom.importFile) this.dom.importFile.click();
        });
        if (this.dom.showAddSubscriberModalBtn) this.dom.showAddSubscriberModalBtn.addEventListener('click', () => this.showAddSubscriberModal());
        if (this.dom.showAdvancedFiltersBtn) this.dom.showAdvancedFiltersBtn.addEventListener('click', () => this.showAdvancedFilters());
        if (this.dom.exportSubscribersBtn) this.dom.exportSubscribersBtn.addEventListener('click', () => this.exportSubscribers());
        // bulkActionsBtn is handled by showBulkActions logic, but needs event listener
        if (this.dom.bulkActionsBtn) this.dom.bulkActionsBtn.addEventListener('click', () => this.showBulkActions());
        if (this.dom.hideBulkActionsBtn) this.dom.hideBulkActionsBtn.addEventListener('click', () => this.hideBulkActions());
        if (this.dom.bulkAddCategoriesBtn) this.dom.bulkAddCategoriesBtn.addEventListener('click', () => this.bulkUpdateCategories('add'));
        if (this.dom.bulkRemoveCategoriesBtn) this.dom.bulkRemoveCategoriesBtn.addEventListener('click', () => this.bulkUpdateCategories('remove'));
        if (this.dom.bulkDeleteBtn) this.dom.bulkDeleteBtn.addEventListener('click', () => this.bulkDelete());
        if (this.dom.bulkCorrectEmailBtn) this.dom.bulkCorrectEmailBtn.addEventListener('click', () => this.showBulkEmailCorrectionModal());
        if (this.dom.bulkExportBtn) this.dom.bulkExportBtn.addEventListener('click', () => this.bulkExport());
        if (this.dom.clearAllFiltersBtn) this.dom.clearAllFiltersBtn.addEventListener('click', () => this.clearAllFilters());
        
        if (this.dom.resetAdvancedFiltersBtn) this.dom.resetAdvancedFiltersBtn.addEventListener('click', () => this.resetAdvancedFilters());
        if (this.dom.applyAdvancedFiltersBtn) this.dom.applyAdvancedFiltersBtn.addEventListener('click', () => this.applyAdvancedFilters());
        
        if (this.dom.cancelAddSubscriberBtn) this.dom.cancelAddSubscriberBtn.addEventListener('click', () => this.closeModal('addSubscriberModal'));
        if (this.dom.submitAddSubscriberBtn) this.dom.submitAddSubscriberBtn.addEventListener('click', () => this.addSubscriber());
        
        if (this.dom.cancelEditSubscriberBtn) this.dom.cancelEditSubscriberBtn.addEventListener('click', () => this.closeModal('editSubscriberModal'));
        if (this.dom.submitUpdateSubscriberBtn) this.dom.submitUpdateSubscriberBtn.addEventListener('click', () => this.updateSubscriber());
        
        if (this.dom.cancelBulkCategoryBtn) this.dom.cancelBulkCategoryBtn.addEventListener('click', () => this.closeModal('bulkCategoryModal'));
        if (this.dom.submitBulkCategoryBtn) this.dom.submitBulkCategoryBtn.addEventListener('click', () => this.submitBulkCategoryAction());

        if (this.dom.cancelBulkEmailCorrectionBtn) this.dom.cancelBulkEmailCorrectionBtn.addEventListener('click', () => this.closeModal('bulkEmailCorrectionModal'));
        if (this.dom.submitBulkEmailCorrectionBtn) this.dom.submitBulkEmailCorrectionBtn.addEventListener('click', () => this.submitBulkEmailCorrection());

        if (this.dom.closeCategoryManagementBtn) this.dom.closeCategoryManagementBtn.addEventListener('click', () => this.closeModal('categoryManagementModal'));

        if (this.dom.quickCategoryTrigger) {
            this.dom.quickCategoryTrigger.addEventListener('click', (e) => {
                console.log('Quick category trigger clicked');
                e.stopPropagation();
                this.toggleQuickCategoryDropdown();
            });
        }
        
        // Add global click listener to close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (this.dom.quickCategoryOptions && this.dom.quickCategoryOptions.classList.contains('show')) {
                if (!this.dom.quickCategoryFilterContainer.contains(e.target)) {
                    this.dom.quickCategoryOptions.classList.remove('show');
                }
            }
        });
        
        if (this.dom.advancedCategoryTrigger) {
            this.dom.advancedCategoryTrigger.addEventListener('click', () => this.toggleAdvancedCategoryDropdown());
        }

        // Modal Close Buttons (Delegation)
        document.addEventListener('click', (e) => {
            const closeBtn = e.target.closest('.modal-close');
            if (closeBtn) {
                const modalId = closeBtn.dataset.modal;
                if (modalId) this.closeModal(modalId);
            }
        });

        // Table Sort Headers
        const sortHeaders = document.querySelectorAll('.sort-header');
        sortHeaders.forEach(header => {
            header.addEventListener('click', () => {
                const field = header.dataset.sort;
                this.sortTable(field);
            });
        });

        // Category Tabs in Add Modal
        const addCategoryTabs = document.getElementById('addCategoryTabs');
        if (addCategoryTabs) {
            addCategoryTabs.addEventListener('click', (e) => {
                const tab = e.target.closest('.category-tab');
                if (tab) {
                    const type = tab.dataset.type;
                    this.switchCategoryTab(type);
                }
            });
        }

        // Category Tabs in Edit Modal
        const editCategoryTabs = document.getElementById('editCategoryTabs');
        if (editCategoryTabs) {
            editCategoryTabs.addEventListener('click', (e) => {
                const tab = e.target.closest('.category-tab');
                if (tab) {
                    const type = tab.dataset.type;
                    this.switchEditCategoryTab(type, e);
                }
            });
        }

        // Bulk Update Status button
        const bulkUpdateStatusBtn = document.getElementById('bulkUpdateStatusBtn');
        if (bulkUpdateStatusBtn) {
            bulkUpdateStatusBtn.addEventListener('click', () => {
                this.showBulkStatusUpdateModal();
            });
        }

        // Bulk Update Status Modal Buttons
        const cancelBulkUpdateStatusBtn = document.getElementById('cancelBulkUpdateStatusBtn');
        if (cancelBulkUpdateStatusBtn) {
            cancelBulkUpdateStatusBtn.addEventListener('click', () => {
                this.closeModal('bulkUpdateStatusModal');
            });
        }

        const submitBulkUpdateStatusBtn = document.getElementById('submitBulkUpdateStatusBtn');
        if (submitBulkUpdateStatusBtn) {
            submitBulkUpdateStatusBtn.addEventListener('click', () => {
                this.submitBulkStatusUpdate();
            });
        }

        // Category Tabs in Bulk Modal
        const bulkCategoryTabs = document.getElementById('bulkCategoryTabs');
        if (bulkCategoryTabs) {
            bulkCategoryTabs.addEventListener('click', (e) => {
                const tab = e.target.closest('.category-tab');
                if (tab) {
                    const type = tab.dataset.type;
                    this.switchBulkCategoryTab(type, e);
                }
            });
        }

        // 搜尋功能
        if (this.dom.searchInput) {
            this.dom.searchInput.addEventListener('input', this.debounce((e) => {
                this.filters.search = e.target.value;
                if (this.dom.clearSearchBtn) {
                    this.dom.clearSearchBtn.style.display = this.filters.search ? 'block' : 'none';
                }
                this.currentPage = 1;
                this.loadData();
            }, 300));
        }

        if (this.dom.clearSearchBtn) {
            this.dom.clearSearchBtn.addEventListener('click', () => {
                this.clearSearch();
            });
        }
        
        // 篩選器
        if (this.dom.statusFilter) {
            this.dom.statusFilter.addEventListener('change', () => {
                this.filters.status = this.dom.statusFilter.value;
                this.currentPage = 1;
                this.loadData();
            });
        }
        
        // Quick Category Filter Change Listener (Delegation)
        if (this.dom.quickCategoryOptions) {
            this.dom.quickCategoryOptions.addEventListener('change', (e) => {
                if (e.target.type === 'checkbox') {
                    this.handleQuickCategoryChange(e.target);
                }
            });
        }
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (this.dom.quickCategoryFilterContainer && 
                !this.dom.quickCategoryFilterContainer.contains(e.target)) {
                if (this.dom.quickCategoryOptions) {
                    this.dom.quickCategoryOptions.classList.remove('show');
                }
            }

            if (this.dom.advancedCategoryContainer && 
                !this.dom.advancedCategoryContainer.contains(e.target)) {
                if (this.dom.advancedCategoryOptions) {
                    this.dom.advancedCategoryOptions.classList.remove('show');
                }
            }
        });
        
        // 每頁顯示數量
        if (this.dom.pageSizeSelect) {
            this.dom.pageSizeSelect.addEventListener('change', () => {
                this.pageSize = parseInt(this.dom.pageSizeSelect.value);
                this.currentPage = 1;
                this.loadData();
            });
        }
        
        // 全選功能
        const handleSelectAll = (e) => {
            this.toggleSelectAll(e.target.checked);
        };

        if (this.dom.selectAllCheckbox) {
            this.dom.selectAllCheckbox.addEventListener('change', handleSelectAll);
        }
        if (this.dom.selectAllHeaderCheckbox) {
            this.dom.selectAllHeaderCheckbox.addEventListener('change', handleSelectAll);
        }
        
        // 分類管理按鈕
        if (this.dom.manageCategoriesBtn) {
            this.dom.manageCategoriesBtn.addEventListener('click', () => {
                this.showCategoryManagementModal();
            });
        }
        
        // 分類樹點擊事件
        if (this.dom.categoryTree) {
            this.dom.categoryTree.addEventListener('click', (event) => {
                // 處理群組展開/收合
                const header = event.target.closest('.category-group-header');
                if (header) {
                    const groupType = header.parentElement.dataset.groupType;
                    if (groupType) {
                        this.toggleCategoryGroup(groupType);
                    }
                    return;
                }

                // 處理分類篩選
                const categoryItem = event.target.closest('.category-item');
                if (categoryItem) {
                    const categoryId = categoryItem.dataset.categoryId;
                    this.toggleCategoryFilter(categoryId);
                }
            });
        }

        // 表格操作事件委派
        if (this.dom.subscribersTableBody) {
            this.dom.subscribersTableBody.addEventListener('click', (event) => {
                const target = event.target.closest('button');
                
                // 檢查是否點擊了分類徽章
                if (event.target.classList.contains('category-badge')) {
                    const categoryId = event.target.dataset.categoryId;
                    console.log('Category badge clicked:', categoryId);
                    if (categoryId) {
                        this.toggleCategoryFilter(categoryId);
                    } else {
                        console.warn('Category badge clicked but no ID found');
                    }
                    return;
                }

                // 檢查是否點擊了標籤徽章
                if (event.target.classList.contains('tag-badge')) {
                    const tag = event.target.dataset.tag;
                    console.log('Tag badge clicked:', tag);
                    if (tag) {
                        const filterTagsInput = document.getElementById('filterTags');
                        if (filterTagsInput) {
                            filterTagsInput.value = tag;
                            this.applyAdvancedFilters();
                            // Optional: Show feedback or scroll to top
                        }
                    }
                    return;
                }

                if (!target) return;

                const subscriberId = target.dataset.id;

                console.log('Table click event:', { target, subscriberId, classList: target.classList });

                if (target.classList.contains('btn-edit')) {
                    console.log('Edit button clicked for subscriber:', subscriberId);
                    this.handleEdit(subscriberId);
                } else if (target.classList.contains('btn-delete')) {
                    console.log('Delete button clicked for subscriber:', subscriberId);
                    this.handleDelete(subscriberId);
                }
            });

            // 監聽 Checkbox 變更事件
            this.dom.subscribersTableBody.addEventListener('change', (event) => {
                if (event.target.classList.contains('subscriber-checkbox')) {
                    this.handleSelectSubscriber(event.target);
                }
            });
        } else {
            console.error('subscribersTableBody element not found during event binding');
        }

        // 進階篩選 - 分類群組變更事件
        const filterCategoryGroup = document.getElementById('filterCategoryGroup');
        if (filterCategoryGroup) {
            filterCategoryGroup.addEventListener('change', (e) => {
                this.updateFilterCategories(e.target.value);
            });
        }

        // 分頁事件委派
        if (this.dom.pagination) {
            this.dom.pagination.addEventListener('click', (event) => {
                const target = event.target.closest('button');
                if (!target || target.disabled) return;

                event.preventDefault();
                
                const action = target.dataset.action;
                const page = target.dataset.page;

                console.log('Pagination button clicked:', { action, page, target });

                if (action === 'previous') {
                    this.previousPage();
                } else if (action === 'next') {
                    this.nextPage();
                } else if (page) {
                    this.goToPage(parseInt(page));
                }
            });
        }
    }

    async handleEdit(subscriberId) {
        try {
            console.log(`編輯訂閱者: ${subscriberId}`);
            console.log('handleEdit method called with subscriberId:', subscriberId);
            
            if (!subscriberId) {
                console.error('subscriberId is undefined or null');
                this.showError('無效的訂閱者 ID');
                return;
            }
            
            // 載入訂閱者詳細資料
            const response = await window.apiClient.request(`/subscribers/${subscriberId}`, {
                method: 'GET'
            });

            console.log('API response:', response);

            if (response.success) {
                const subscriber = response.data.subscriber;
                console.log('Subscriber data loaded:', subscriber);
                this.showEditSubscriberModal(subscriber);
            } else {
                console.error('API response failed:', response);
                this.showError('載入訂閱者資料失敗');
            }
        } catch (error) {
            console.error('載入訂閱者資料錯誤:', error);
            this.showError('載入訂閱者資料失敗');
        }
    }

    showEditSubscriberModal(subscriber) {
        console.log('showEditSubscriberModal called with subscriber:', subscriber);
        
        // 填入表單資料
        document.getElementById('editSubscriberId').value = subscriber.id;
        document.getElementById('editSubscriberEmail').value = subscriber.email || '';
        
        let status = (subscriber.status || 'active').toLowerCase();
        // 如果狀態是 subscribed，對應到 active
        if (status === 'subscribed') status = 'active';
        document.getElementById('editSubscriberStatus').value = status;
        
        document.getElementById('editSubscriberFirstName').value = subscriber.firstName || '';
        document.getElementById('editSubscriberLastName').value = subscriber.lastName || '';
        document.getElementById('editSubscriberCompany').value = subscriber.companyName || '';
        document.getElementById('editSubscriberPhone').value = subscriber.phone || '';
        
        // 處理性別大小寫
        let gender = subscriber.gender || '';
        if (gender) {
            const genderLower = gender.toLowerCase();
            if (genderLower === 'male') gender = 'Male';
            else if (genderLower === 'female') gender = 'Female';
            else if (genderLower === 'other') gender = 'Other';
        }
        document.getElementById('editSubscriberGender').value = gender;
        
        document.getElementById('editSubscriberCountry').value = subscriber.country || '';
        document.getElementById('editSubscriberCity').value = subscriber.city || '';

        // 顯示模態框
        const modal = document.getElementById('editSubscriberModal');
        console.log('Modal element found:', modal);
        
        if (modal) {
            console.log('Setting modal display to show');
            modal.classList.add('show');
            
            // 載入分類設定（只載入一次）
            this.loadEditCategoryAssignment(subscriber.id);
        } else {
            console.error('editSubscriberModal element not found!');
        }
    }

    showAddSubscriberModal() {
        console.log('showAddSubscriberModal called');
        
        // 清空表單
        const form = document.getElementById('addSubscriberForm');
        if (form) {
            form.reset();
        }

        // 顯示模態框
        const modal = document.getElementById('addSubscriberModal');
        console.log('Modal element found:', modal);
        
        if (modal) {
            console.log('Setting modal display to show');
            modal.classList.add('show');
            
            // 載入分類設定
            this.loadAddCategoryAssignment();
        } else {
            console.error('addSubscriberModal element not found!');
        }
    }

    showImportModal() {
        const modal = document.getElementById('importModal');
        if (modal) {
            modal.classList.add('show');
            // Reset UI if needed
            const fileInput = document.getElementById('importFile');
            if (fileInput) fileInput.value = '';
            
            // Reset steps UI
            const steps = modal.querySelectorAll('.step');
            steps.forEach((step, index) => {
                if (index === 0) step.classList.add('active');
                else step.classList.remove('active');
            });
            
            // Hide preview
            const preview = document.getElementById('importPreview');
            if (preview) preview.style.display = 'none';
            
            // Reset buttons
            const importBtn = document.getElementById('importBtn');
            if (importBtn) importBtn.style.display = 'none';
        }
    }

    async loadAddCategoryAssignment() {
        try {
            // 顯示載入狀態
            const contentContainer = document.getElementById('categoryAssignmentContent');
            if (contentContainer) {
                contentContainer.innerHTML = '<div class="loading">載入分類資料中...</div>';
            }

            // 載入所有分類
            const categoriesResponse = await window.categoryService.getCategories();
            const allCategories = categoriesResponse.data?.categories || [];

            console.log('All categories loaded for add modal:', allCategories);

            // 緩存數據到實例變量
            this.addCategoryData = {
                allCategories,
                categoriesByType: this.organizeCategoriesByTypeForEdit(allCategories)
            };

            console.log('Categories by type for add:', this.addCategoryData.categoriesByType);
            // 渲染分類選項
            this.renderAddCategoryAssignment();
        } catch (error) {
            console.error('載入分類資料錯誤:', error);
            const contentContainer = document.getElementById('categoryAssignmentContent');
            if (contentContainer) {
                contentContainer.innerHTML = '<div class="error">載入分類資料失敗</div>';
            }
        }
    }

    renderAddCategoryAssignment() {
        const contentContainer = document.getElementById('categoryAssignmentContent');
        if (!contentContainer || !this.addCategoryData) return;

        // 預設顯示客戶分類
        this.renderAddCategoryContent('customer');
    }

    renderAddCategoryContent(categoryType) {
        const contentContainer = document.getElementById('categoryAssignmentContent');
        if (!contentContainer || !this.addCategoryData) return;

        const categories = this.addCategoryData.categoriesByType[categoryType] || [];
        
        let html = '<div class="category-grid">';
        
        if (categories.length === 0) {
            html = '<p class="no-categories">此分類類型暫無可用選項</p>';
        } else {
            categories.forEach(category => {
                html += `
                    <label class="category-checkbox">
                        <input type="checkbox" name="categories" value="${category.id}">
                        <span class="category-label">${category.name}</span>
                    </label>
                `;
            });
            html += '</div>';
        }
        
        contentContainer.innerHTML = html;
    }

    switchCategoryTab(categoryType) {
        console.log('switchCategoryTab called with:', categoryType);
        
        // 更新標籤樣式
        const tabs = document.querySelectorAll('#addCategoryTabs .category-tab');
        tabs.forEach(tab => {
            tab.classList.remove('active');
            if (tab.dataset.type === categoryType) {
                tab.classList.add('active');
            }
        });
        
        // 渲染對應分類的內容
        this.renderAddCategoryContent(categoryType);
    }

    async addSubscriber() {
        try {
            console.log('addSubscriber called');
            
            const form = document.getElementById('addSubscriberForm');
            if (!form) {
                this.showError('找不到表單');
                return;
            }

            const formData = new FormData(form);
            
            // 獲取基本資料
            const subscriberData = {
                email: formData.get('email'),
                firstName: formData.get('firstName'),
                lastName: formData.get('lastName'),
                companyName: formData.get('company'),
                phone: formData.get('phone'),
                gender: formData.get('gender'),
                country: formData.get('country'),
                city: formData.get('city')
            };

            // 驗證必填欄位
            if (!subscriberData.email) {
                this.showError('請輸入電子郵件');
                return;
            }

            // 獲取選中的分類
            const selectedCategories = [];
            const categoryCheckboxes = form.querySelectorAll('input[name="categories"]:checked');
            categoryCheckboxes.forEach(checkbox => {
                selectedCategories.push(parseInt(checkbox.value));
            });

            subscriberData.categories = selectedCategories;

            console.log('Subscriber data to save:', subscriberData);

            // 發送API請求
            const response = await window.apiClient.request('/subscribers', {
                method: 'POST',
                body: JSON.stringify(subscriberData),
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.success) {
                this.showSuccess('訂閱者新增成功');
                this.closeModal('addSubscriberModal');
                // 重新載入資料
                await this.loadData();
                await this.loadStats();
            } else {
                this.showError(response.message || '新增訂閱者失敗');
            }
        } catch (error) {
            console.error('新增訂閱者錯誤:', error);
            this.showError('新增訂閱者失敗');
        }
    }

    async loadEditCategoryAssignment(subscriberId) {
        try {
            // 顯示載入狀態
            const contentContainer = document.getElementById('editCategoryAssignmentContent');
            if (contentContainer) {
                contentContainer.innerHTML = '<div class="loading">載入分類資料中...</div>';
            }

            // 並行載入所有分類和訂閱者分類
            const [categoriesResponse, subscriberCategoriesResponse] = await Promise.all([
                window.categoryService.getCategories(),
                window.apiClient.request(`/subscribers/${subscriberId}/categories`, { method: 'GET' })
            ]);

            const allCategories = categoriesResponse.data?.categories || [];
            const subscriberCategories = subscriberCategoriesResponse.data?.categories || [];
            const subscriberCategoryIds = subscriberCategories.map(cat => cat.id);

            console.log('All categories loaded:', allCategories);
            console.log('Subscriber categories:', subscriberCategories);
            console.log('Subscriber category IDs:', subscriberCategoryIds);

            // 緩存數據到實例變量
            this.editCategoryData = {
                allCategories,
                subscriberCategoryIds,
                categoriesByType: this.organizeCategoriesByTypeForEdit(allCategories)
            };

            console.log('Categories by type:', this.editCategoryData.categoriesByType);
            
            // Debug: Check specific groups
            Object.keys(this.categoryGroups).forEach(key => {
                const count = this.editCategoryData.categoriesByType[key]?.length || 0;
                console.log(`Group ${key}: ${count} categories`);
            });

            // 渲染分類選項
            this.renderEditCategoryAssignment();
        } catch (error) {
            console.error('載入分類資料錯誤:', error);
            const contentContainer = document.getElementById('editCategoryAssignmentContent');
            if (contentContainer) {
                contentContainer.innerHTML = '<div class="error">載入分類資料失敗</div>';
            }
        }
    }

    organizeCategoriesByTypeForEdit(categories) {
        const categoriesByType = {};
        categories.forEach(category => {
            const type = this.mapCategoryToGroup(category);
            if (!categoriesByType[type]) {
                categoriesByType[type] = [];
            }
            categoriesByType[type].push(category);
        });
        return categoriesByType;
    }

    renderEditCategoryAssignment() {
        if (!this.editCategoryData) return;

        const tabsContainer = document.getElementById('editCategoryTabs');
        const contentContainer = document.getElementById('editCategoryAssignmentContent');

        if (!tabsContainer || !contentContainer) return;

        // 綁定事件監聽器以保存狀態 (使用事件委派)
        // 先移除舊的監聽器避免重複綁定 (雖然這裡每次都重新渲染，但為了保險起見)
        const newContentContainer = contentContainer.cloneNode(true);
        contentContainer.parentNode.replaceChild(newContentContainer, contentContainer);
        
        // 重新獲取引用
        const currentContentContainer = document.getElementById('editCategoryAssignmentContent');
        currentContentContainer.addEventListener('change', (e) => {
            if (e.target.name === 'editCategoryIds' && this.editCategoryData) {
                const categoryId = parseInt(e.target.value);
                if (e.target.checked) {
                    if (!this.editCategoryData.subscriberCategoryIds.includes(categoryId)) {
                        this.editCategoryData.subscriberCategoryIds.push(categoryId);
                    }
                } else {
                    const index = this.editCategoryData.subscriberCategoryIds.indexOf(categoryId);
                    if (index > -1) {
                        this.editCategoryData.subscriberCategoryIds.splice(index, 1);
                    }
                }
                console.log('Updated subscriberCategoryIds:', this.editCategoryData.subscriberCategoryIds);
            }
        });

        const { categoriesByType } = this.editCategoryData;

        // 使用 categoryGroups 定義的順序和名稱
        const groupKeys = Object.keys(this.categoryGroups);
        
        const tabs = groupKeys.map((type, index) => {
            const group = this.categoryGroups[type];
            // 計算該群組的分類數量，用於顯示 (可選)
            const count = categoriesByType[type]?.length || 0;
            return `<button type="button" class="category-tab ${index === 0 ? 'active' : ''}" 
                     data-type="${type}"
                     onclick="window.subscribersManager.switchEditCategoryTab('${type}', event)">
                <i class="${group.icon}"></i> ${group.name} 
                <span class="badge ${count > 0 ? 'badge-info' : 'badge-secondary'}" style="margin-left: 5px; font-size: 0.8em;">${count}</span>
            </button>`;
        }).join('');

        tabsContainer.innerHTML = tabs;

        // 渲染第一個分類內容
        const firstType = groupKeys[0];
        this.renderEditCategoryContent(firstType);
    }

    switchEditCategoryTab(categoryType, event) {
        console.log(`Switching edit category tab to: ${categoryType}`);
        
        // 更新標籤狀態
        document.querySelectorAll('#editCategoryTabs .category-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        
        // 如果是點擊觸發，使用 event target
        if (event && event.target) {
            const button = event.target.closest('button');
            if (button) {
                button.classList.add('active');
            }
        } else {
            // 如果是程式觸發，根據 data-type 查找
            const tab = document.querySelector(`#editCategoryTabs .category-tab[data-type="${categoryType}"]`);
            if (tab) tab.classList.add('active');
        }

        // 只渲染內容，不重新載入數據
        this.renderEditCategoryContent(categoryType);
    }

    renderEditCategoryContent(categoryType) {
        if (!this.editCategoryData) {
            console.warn('editCategoryData is missing');
            return;
        }

        const contentContainer = document.getElementById('editCategoryAssignmentContent');
        if (!contentContainer) return;

        const { categoriesByType, subscriberCategoryIds } = this.editCategoryData;
        const categories = categoriesByType[categoryType] || [];
        
        console.log(`Rendering content for ${categoryType}, found ${categories.length} categories`);

        const content = `
            <div class="category-assignment-section">
                <div class="category-grid">
                    ${categories.length > 0 ? categories.map(category => `
                        <label class="category-checkbox">
                            <input type="checkbox" 
                                   name="editCategoryIds" 
                                   value="${category.id}"
                                   ${subscriberCategoryIds.includes(category.id) ? 'checked' : ''}>
                            <span class="category-label">${category.name}</span>
                        </label>
                    `).join('') : '<div class="no-categories">此分類群組無可用選項</div>'}
                </div>
            </div>
        `;

        contentContainer.innerHTML = content;
    }

    async updateSubscriber() {
        try {
            const form = document.getElementById('editSubscriberForm');
            const formData = new FormData(form);
            
            const subscriberId = formData.get('id');
            
            // 收集表單資料
            const updateData = {
                email: formData.get('email'),
                status: formData.get('status'),
                firstName: formData.get('firstName') || '',
                lastName: formData.get('lastName') || '',
                companyName: formData.get('company') || '',
                phone: formData.get('phone') || '',
                gender: formData.get('gender') || '',
                country: formData.get('country') || '',
                city: formData.get('city') || ''
            };

            // 收集選中的分類
            const selectedCategories = Array.from(document.querySelectorAll('input[name="editCategoryIds"]:checked'))
                .map(checkbox => parseInt(checkbox.value));

            console.log('更新訂閱者資料:', { subscriberId, updateData, selectedCategories });

            // 更新基本資料
            const updateResponse = await window.apiClient.request(`/subscribers/${subscriberId}`, {
                method: 'PUT',
                body: updateData
            });

            if (!updateResponse.success) {
                throw new Error(updateResponse.message || '更新基本資料失敗');
            }

            // 更新分類關聯
            if (selectedCategories.length >= 0) {
                const categoryResponse = await window.apiClient.request(`/subscribers/${subscriberId}/categories`, {
                    method: 'PUT',
                    body: { categoryIds: selectedCategories }
                });

                if (!categoryResponse.success) {
                    console.error('分類更新失敗:', categoryResponse);
                    throw new Error(categoryResponse.message || '更新分類資料失敗');
                }
            }

            this.showSuccess('訂閱者資料更新成功');
            this.closeModal('editSubscriberModal');
            
            // 重新載入資料
            setTimeout(() => {
                this.loadData();
                this.loadStats();
            }, 200);
            
        } catch (error) {
            console.error('更新訂閱者錯誤:', error);
            this.showError(error.message || '更新訂閱者失敗');
        }
    }

    async handleDelete(subscriberId) {
        if (!this.canManageSubscribers()) {
            this.showError('您沒有權限執行此操作');
            return;
        }

        if (!confirm('確定要將此訂閱者標記為刪除嗎？')) {
            return;
        }

        try {
            const response = await window.apiClient.request(`/subscribers/${subscriberId}`, {
                method: 'DELETE'
            });

            if (response.success) {
                this.showSuccess('訂閱者刪除成功');
                setTimeout(() => {
                    this.loadData();
                    this.loadStats();
                }, 200); // Reload the table and stats
            } else {
                throw new Error(response.message || '刪除失敗');
            }
        } catch (error) {
            console.error('刪除訂閱者錯誤:', error);
            this.showError(error.message || '刪除訂閱者失敗');
        }
    }

    // Category management is now handled by category-management.js
    showCategoryManagementModal() {
        const modal = document.getElementById('categoryManagementModal');
        if (modal) {
            modal.classList.add('show');
            if (window.categoryManagement) {
                // Initialize the layout if needed and load data
                window.categoryManagement.renderLayout();
                window.categoryManagement.switchCategoryType('customer');
            } else {
                console.error('CategoryManagement module not loaded');
            }
        }
    }

    // 批量操作方法
    async bulkUpdateCategories(action = 'add') {
        const selectedIds = await this.getAllMatchingIds();
        if (selectedIds.length === 0) {
            NotificationUtils.show('請先選擇要操作的訂閱者', 'warning');
            return;
        }

        this.currentBulkAction = action;

        const modal = document.getElementById('bulkCategoryModal');
        const title = document.getElementById('bulkCategoryModalTitle');
        const message = document.getElementById('bulkCategoryModalMessage');
        
        if (modal) {
            if (action === 'add') {
                if (title) title.textContent = '批量添加分類';
                if (message) message.textContent = `為選中的 ${selectedIds.length} 位訂閱者添加分類：`;
            } else {
                if (title) title.textContent = '批量移除分類';
                if (message) message.textContent = `為選中的 ${selectedIds.length} 位訂閱者移除分類：`;
            }
            
            modal.classList.add('show');
            this.loadBulkCategoryAssignment();
        }
    }

    async loadBulkCategoryAssignment() {
        try {
            const contentContainer = document.getElementById('bulkCategoryContent');
            if (contentContainer) {
                contentContainer.innerHTML = '<div class="loading">載入分類資料中...</div>';
            }
            
            const categoriesResponse = await window.categoryService.getCategories();
            const allCategories = categoriesResponse.data?.categories || [];

            this.bulkCategoryData = {
                categoriesByType: this.organizeCategoriesByTypeForEdit(allCategories)
            };

            this.renderBulkCategoryAssignment();
        } catch (error) {
            console.error('載入分類資料錯誤:', error);
            const contentContainer = document.getElementById('bulkCategoryContent');
            if (contentContainer) {
                contentContainer.innerHTML = '<div class="error">載入分類資料失敗</div>';
            }
        }
    }

    renderBulkCategoryAssignment() {
        if (!this.bulkCategoryData) return;

        const tabsContainer = document.getElementById('bulkCategoryTabs');
        const contentContainer = document.getElementById('bulkCategoryContent');

        if (!tabsContainer || !contentContainer) return;

        const groupKeys = Object.keys(this.categoryGroups);
        
        const tabs = groupKeys.map((type, index) => {
            const group = this.categoryGroups[type];
            return `<button type="button" class="category-tab ${index === 0 ? 'active' : ''}" 
                     onclick="window.subscribersManager.switchBulkCategoryTab('${type}', event)">
                <i class="${group.icon}"></i> ${group.name}
            </button>`;
        }).join('');

        tabsContainer.innerHTML = tabs;

        // Render first tab
        const firstType = groupKeys[0];
        this.renderBulkCategoryContent(firstType);
    }

    switchBulkCategoryTab(categoryType, event) {
        document.querySelectorAll('#bulkCategoryTabs .category-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        if (event && event.target) {
            const button = event.target.closest('button');
            if (button) {
                button.classList.add('active');
            }
        }

        this.renderBulkCategoryContent(categoryType);
    }

    renderBulkCategoryContent(categoryType) {
        if (!this.bulkCategoryData) return;

        const contentContainer = document.getElementById('bulkCategoryContent');
        if (!contentContainer) return;

        const { categoriesByType } = this.bulkCategoryData;
        const categories = categoriesByType[categoryType] || [];
        
        const content = `
            <div class="category-assignment-section">
                <div class="category-grid">
                    ${categories.map(category => `
                        <label class="category-checkbox">
                            <input type="checkbox" 
                                   name="bulkCategoryIds" 
                                   value="${category.id}">
                            <span class="category-label">${category.name}</span>
                        </label>
                    `).join('')}
                </div>
            </div>
        `;

        contentContainer.innerHTML = content;
    }

    async submitBulkCategoryAction() {
        const selectedIds = await this.getAllMatchingIds();
        const action = this.currentBulkAction || 'add';
        
        const selectedCategoryCheckboxes = document.querySelectorAll('#bulkCategoryContent input[name="bulkCategoryIds"]:checked');
        const categoryIds = Array.from(selectedCategoryCheckboxes).map(cb => cb.value);

        if (categoryIds.length === 0) {
            NotificationUtils.show('請先選擇要操作的分類', 'warning');
            return;
        }

        try {
            this.showLoadingState();
            const response = await window.subscriberService.bulkUpdateCategories(
                selectedIds, 
                categoryIds, 
                action
            );
            
            if (response.success) {
                this.showSuccess(`批量${action === 'add' ? '添加' : '移除'}分類成功`);
                this.closeModal('bulkCategoryModal');
                setTimeout(() => {
                    this.loadData();
                    this.loadStats();
                }, 200);
                this.clearSelection();
            } else {
                this.showError(response.message || '批量操作失敗');
            }
        } catch (error) {
            console.error('批量更新分類失敗:', error);
            this.showError('批量操作失敗，請稍後再試');
        } finally {
            this.hideLoadingState();
        }
    }

    async showBulkEmailCorrectionModal() {
        const selectedIds = await this.getAllMatchingIds();
        if (selectedIds.length === 0) {
            NotificationUtils.show('請先選擇要操作的訂閱者', 'warning');
            return;
        }

        const modal = document.getElementById('bulkEmailCorrectionModal');
        if (modal) {
            // Reset form
            const form = document.getElementById('bulkEmailCorrectionForm');
            if (form) form.reset();
            
            modal.classList.add('show');
        }
    }

    async submitBulkEmailCorrection() {
        const selectedIds = await this.getAllMatchingIds();
        if (selectedIds.length === 0) {
            NotificationUtils.show('請先選擇要操作的訂閱者', 'warning');
            return;
        }

        const findStrInput = document.getElementById('findStr');
        const replaceStrInput = document.getElementById('replaceStr');
        
        const findStr = findStrInput ? findStrInput.value.trim() : '';
        const replaceStr = replaceStrInput ? replaceStrInput.value.trim() : '';

        if (!findStr) {
            NotificationUtils.show('請輸入要搜尋的字串', 'warning');
            return;
        }

        try {
            this.showLoadingState();
            
            const response = await window.subscriberService.bulkCorrectEmails(
                selectedIds,
                findStr,
                replaceStr
            );

            if (response.success) {
                this.showSuccess(response.message || '批量修正 Email 成功');
                this.closeModal('bulkEmailCorrectionModal');
                await this.loadData();
                this.loadStats();
                this.clearSelection();
            } else {
                this.showError(response.message || '批量操作失敗');
            }
        } catch (error) {
            console.error('批量修正 Email 失敗:', error);
            this.showError(error.message || '批量操作失敗，請稍後再試');
        } finally {
            this.hideLoadingState();
        }
    }

    async showBulkStatusUpdateModal() {
        const selectedIds = await this.getAllMatchingIds();
        if (selectedIds.length === 0) {
            NotificationUtils.show('請先選擇要操作的訂閱者', 'warning');
            return;
        }

        const modal = document.getElementById('bulkUpdateStatusModal');
        if (modal) {
            // Reset form
            const form = document.getElementById('bulkUpdateStatusForm');
            if (form) form.reset();
            
            modal.classList.add('show');
        }
    }

    async submitBulkStatusUpdate() {
        const selectedIds = await this.getAllMatchingIds();
        if (selectedIds.length === 0) {
            NotificationUtils.show('請先選擇要操作的訂閱者', 'warning');
            return;
        }

        const statusSelect = document.getElementById('bulkStatusSelect');
        if (!statusSelect || !statusSelect.value) {
            NotificationUtils.show('請選擇新狀態', 'warning');
            return;
        }

        const status = statusSelect.value;
        const statusText = statusSelect.options[statusSelect.selectedIndex].text;

        if (!confirm(`確定要將這 ${selectedIds.length} 位訂閱者的狀態更新為 "${statusText}" 嗎？`)) {
            return;
        }

        try {
            this.showLoadingState();
            
            const response = await window.subscriberService.bulkUpdateStatus(selectedIds, status);

            if (response.success) {
                this.showSuccess(response.message || '批量更新狀態成功');
                this.closeModal('bulkUpdateStatusModal');
                await this.loadData();
                this.loadStats();
                this.clearSelection();
            } else {
                this.showError(response.message || '批量操作失敗');
            }
        } catch (error) {
            console.error('批量更新狀態失敗:', error);
            this.showError(error.message || '批量操作失敗，請稍後再試');
        } finally {
            this.hideLoadingState();
        }
    }

    getSelectedCategories() {
        // 從 UI 中獲取選中的分類
        const selectedCategoryElements = document.querySelectorAll('.category-item.selected');
        return Array.from(selectedCategoryElements).map(element => ({
            id: element.dataset.categoryId,
            name: element.querySelector('.category-name').textContent
        }));
    }

    clearSelection() {
        this.selectedSubscribers.clear();
        document.querySelectorAll('.subscriber-checkbox').forEach(checkbox => {
            checkbox.checked = false;
        });
        document.querySelectorAll('.subscriber-row').forEach(row => {
            row.classList.remove('selected');
        });
        // Reset select all checkboxes
        if (this.dom.selectAllCheckbox) this.dom.selectAllCheckbox.checked = false;
        if (this.dom.selectAllHeaderCheckbox) this.dom.selectAllHeaderCheckbox.checked = false;
        
        this.updateBulkActionButtons();
    }

    handleSelectSubscriber(checkbox) {
        const id = checkbox.dataset.id;
        // 確保 ID 類型一致
        const subscriber = this.allSubscribers.find(s => s.id == id);
        const realId = subscriber ? subscriber.id : id;

        if (checkbox.checked) {
            this.selectedSubscribers.add(realId);
            const row = checkbox.closest('tr');
            if (row) row.classList.add('selected');
        } else {
            this.selectedSubscribers.delete(realId);
            const row = checkbox.closest('tr');
            if (row) row.classList.remove('selected');
            
            // If we were selecting all matching, and user deselects one, we are no longer selecting all matching
            this.selectAllMatching = false;
        }

        // Check if all visible subscribers are selected
        const allSelected = this.allSubscribers.length > 0 && this.allSubscribers.every(s => this.selectedSubscribers.has(s.id));
        
        if (this.dom.selectAllCheckbox) this.dom.selectAllCheckbox.checked = allSelected;
        if (this.dom.selectAllHeaderCheckbox) this.dom.selectAllHeaderCheckbox.checked = allSelected;

        this.updateBulkActionButtons();
    }

    toggleSelectAll(checked) {
        if (checked) {
            // Select all currently visible subscribers
            this.allSubscribers.forEach(subscriber => {
                this.selectedSubscribers.add(subscriber.id);
            });
        } else {
            // Deselect all currently visible subscribers
            this.allSubscribers.forEach(subscriber => {
                this.selectedSubscribers.delete(subscriber.id);
            });
            this.selectAllMatching = false; // Reset full selection
        }
        
        // Update UI
        if (this.dom.selectAllCheckbox) this.dom.selectAllCheckbox.checked = checked;
        if (this.dom.selectAllHeaderCheckbox) this.dom.selectAllHeaderCheckbox.checked = checked;
        
        const checkboxes = document.querySelectorAll('.subscriber-checkbox');
        checkboxes.forEach(cb => {
            cb.checked = checked;
            const row = cb.closest('tr');
            if (row) {
                if (checked) row.classList.add('selected');
                else row.classList.remove('selected');
            }
        });
        
        this.updateBulkActionButtons();
    }

    clearSearch() {
        this.filters.search = '';
        if (this.dom.searchInput) {
            this.dom.searchInput.value = '';
        }
        if (this.dom.clearSearchBtn) {
            this.dom.clearSearchBtn.style.display = 'none';
        }
        this.currentPage = 1;
        this.loadData();
    }

    updateBulkActionButtons() {
        const selectedCount = this.selectedSubscribers.size;
        const bulkActions = document.querySelector('.bulk-actions');
        if (bulkActions) {
            bulkActions.style.display = selectedCount > 0 ? 'block' : 'none';
        }
        
        // 更新選擇計數顯示
        const selectionCount = document.querySelector('.selection-count');
        if (selectionCount) {
            if (this.selectAllMatching) {
                selectionCount.textContent = `已選擇所有 ${this.totalItems} 位訂閱者`;
            } else {
                selectionCount.textContent = `已選擇 ${selectedCount} 位訂閱者`;
            }
        }

        // 更新表格上方選擇計數顯示
        const topSelectedCount = document.getElementById('selectedCount');
        if (topSelectedCount) {
            if (this.selectAllMatching) {
                topSelectedCount.textContent = `已選擇 ${this.totalItems} 項`;
            } else {
                topSelectedCount.textContent = `已選擇 ${selectedCount} 項`;
            }
        }

        // 更新批量操作按鈕顯示
        const bulkActionsBtn = document.getElementById('bulkActionsBtn');
        if (bulkActionsBtn) {
            if (this.canManageSubscribers()) {
                bulkActionsBtn.style.display = selectedCount > 0 ? 'inline-block' : 'none';
            } else {
                bulkActionsBtn.style.display = 'none';
            }
        }

        // Handle "Select All Matching" Banner
        this.updateSelectAllBanner(selectedCount);
    }

    updateSelectAllBanner(selectedCount) {
        if (!this.canManageSubscribers()) return;

        let selectAllBanner = document.getElementById('selectAllBanner');
        const panel = document.getElementById('bulkActionsPanel');
        
        if (!panel) return;

        // If banner doesn't exist, create it
        if (!selectAllBanner) {
            selectAllBanner = document.createElement('div');
            selectAllBanner.id = 'selectAllBanner';
            selectAllBanner.className = 'alert alert-info p-2 mt-2 mb-2 text-center';
            selectAllBanner.style.cursor = 'pointer';
            selectAllBanner.style.display = 'none';
            
            const header = panel.querySelector('.bulk-actions-header');
            if (header) {
                header.insertAdjacentElement('afterend', selectAllBanner);
            } else {
                panel.prepend(selectAllBanner);
            }
            
            selectAllBanner.addEventListener('click', () => this.handleSelectAllMatching());
        }

        // Logic to show/hide/update banner
        if (this.selectAllMatching) {
            selectAllBanner.innerHTML = `<strong>已選擇符合當前篩選條件的所有 ${this.totalItems} 筆資料</strong> <span class="text-primary ml-2" style="text-decoration: underline;">清除選擇</span>`;
            selectAllBanner.style.display = 'block';
        } else if (selectedCount > 0 && selectedCount === this.allSubscribers.length && this.totalItems > this.allSubscribers.length) {
            selectAllBanner.innerHTML = `已選擇本頁 ${selectedCount} 筆資料。 <strong class="text-primary" style="text-decoration: underline;">點擊此處以選擇符合篩選條件的所有 ${this.totalItems} 筆資料</strong>`;
            selectAllBanner.style.display = 'block';
        } else {
            selectAllBanner.style.display = 'none';
        }
    }

    handleSelectAllMatching() {
        if (this.selectAllMatching) {
            // Currently selecting all, so clear selection
            this.clearSelection();
        } else {
            // Switch to select all matching
            this.selectAllMatching = true;
            this.updateBulkActionButtons();
        }
    }


    showBulkActions() {
        const panel = document.getElementById('bulkActionsPanel');
        if (panel) {
            panel.style.display = 'block';
        }
    }

    hideBulkActions() {
        const panel = document.getElementById('bulkActionsPanel');
        if (panel) {
            panel.style.display = 'none';
        }
    }

    async bulkDelete() {
        const selectedIds = await this.getAllMatchingIds();
        if (selectedIds.length === 0) {
            this.showError('請先選擇要刪除的訂閱者');
            return;
        }

        if (!confirm(`確定要將這 ${selectedIds.length} 位訂閱者標記為刪除嗎？`)) {
            return;
        }

        try {
            this.showLoadingState();
            
            const response = await window.apiClient.request('/subscribers/bulk-delete', {
                method: 'POST',
                body: { ids: selectedIds }
            });

            if (response.success) {
                if (typeof NotificationUtils !== 'undefined') {
                    NotificationUtils.success(response.message || '批量刪除成功');
                } else {
                    alert('批量刪除成功');
                }
                this.clearSelection();
                this.loadData();
                this.loadStats();
            } else {
                this.showError(response.message || '批量刪除失敗');
            }
        } catch (error) {
            console.error('Bulk delete error:', error);
            this.showError('批量刪除過程發生錯誤');
        } finally {
            this.hideLoadingState();
        }
    }

    async bulkExport() {
        const selectedIds = await this.getAllMatchingIds();
        if (selectedIds.length === 0) {
            NotificationUtils.show('請先選擇要匯出的訂閱者', 'warning');
            return;
        }

        try {
            const response = await window.subscriberService.exportSubscribers('csv', {
                subscriber_ids: selectedIds
            });
            
            // 創建下載連結
            const blob = new Blob([response], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `selected_subscribers_${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            window.URL.revokeObjectURL(url);
            
            this.showSuccess(`成功匯出 ${selectedIds.length} 位訂閱者`);
        } catch (error) {
            console.error('匯出訂閱者失敗:', error);
            this.showError('匯出失敗，請稍後再試');
        }
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('show');
        }
    }


    async loadInitialData() {
        // 優化載入順序：優先載入列表數據，避免統計或分類數據阻塞 UI
        try {
            await this.loadData();
        } catch (error) {
            console.error('優先載入列表失敗:', error);
        }

        // 後台異步載入統計和分類數據
        Promise.all([
            this.loadStats(),
            this.loadCategories()
        ]).catch(error => {
            console.warn('後台載入次要數據失敗:', error);
        });
    }
    
    async loadStats() {
        try {
            console.log('🔧 載入統計資料');
            const response = await window.subscriberService.getStats({ _t: Date.now() });
            this.stats = response.data;
            this.updateStatsDisplay();
        } catch (error) {
            console.error('載入統計資料失敗:', error);
        }
    }
    
    async loadCategories() {
        try {
            console.log('🔧 載入分類資料');
            const response = await window.categoryService.getCategories();
            console.log('🔧 分類資料回應:', response);
            
            if (response.success && response.data && Array.isArray(response.data.categories)) {
                this.categories = response.data.categories;
                console.log(`🔧 成功載入 ${this.categories.length} 個分類`);
            } else if (Array.isArray(response)) {
                this.categories = response;
                console.log(`🔧 成功載入 ${this.categories.length} 個分類 (直接數組)`);
            } else {
                console.warn('分類資料格式不正確:', response);
                this.categories = [];
            }

            this.organizeCategoriesByType();
            
            // Debug category groups
            Object.keys(this.categoryGroups).forEach(key => {
                const count = this.categoryGroups[key].categories.length;
                if (count > 0) {
                    console.log(`🔧 群組 ${key} 有 ${count} 個分類`);
                }
            });

            this.updateCategoryTree();
            this.populateQuickCategoryFilter();
        } catch (error) {
            console.error('載入分類資料失敗:', error);
            this.categories = []; // 確保 categories 始終是數組
            this.organizeCategoriesByType();
            this.updateCategoryTree();
            this.populateQuickCategoryFilter();
        }
    }
    
    organizeCategoriesByType() {
        // 重置分類群組
        Object.keys(this.categoryGroups).forEach(key => {
            this.categoryGroups[key].categories = [];
        });
        
        // 確保 categories 是數組
        if (!Array.isArray(this.categories)) {
            this.categories = [];
            return;
        }
        
        // 根據分類類型組織分類
        this.categories.forEach(category => {
            const groupType = this.mapCategoryToGroup(category); 
            if (this.categoryGroups[groupType]) {
                this.categoryGroups[groupType].categories.push(category);
            }
        });
    }
    
    mapCategoryToGroup(category) { 
        // 優先使用 hierarchy_type
        let type = category.hierarchyType || category.hierarchy_type;
        
        // Debug logging
        // console.log(`Mapping category: ${category.name}, hierarchyType: ${type}, categoryType: ${category.categoryType || category.category_type}`);

        if (type) {
             // 正規化類型名稱 (轉小寫並去空白)
             type = type.toString().toLowerCase().trim();
             
             // 處理已知的別名
             const aliasMap = {
                 'unit': 'organization',
                 'region': 'geography',
                 'identity': 'customer' // 根據需求調整，有時 identity 單獨存在
             };
             
             if (aliasMap[type]) {
                 type = aliasMap[type];
             }

             if (this.categoryGroups[type]) {
                 return type;
             } else {
                 console.warn(`Unknown hierarchyType: ${type} for category ${category.name}`);
             }
        }

        // 回退到 categoryType 映射
        const categoryType = category.categoryType || category.category_type;
        const mapping = {
            't1': 'customer',     // 原 identity -> customer
            't2': 'organization', // 原 unit -> organization
            't3': 'geography',    // 原 region -> geography
            't4': 'department',
            't5': 'contract',
            't6': 'product',
            'identity': 'identity'
        };
        
        const mappedType = mapping[categoryType];
        if (mappedType) {
             // 再次檢查映射後的類型是否有效
             if (this.categoryGroups[mappedType]) {
                 return mappedType;
             }
        }
        
        console.warn(`Fallback to customer for category ${category.name} with type ${categoryType}`);
        return 'customer'; // 默認為 customer
    }
    
    showAdvancedFilters() {
        const modal = document.getElementById('advancedFilterModal');
        if (modal) {
            modal.classList.add('show');
            // 填充當前篩選值
            document.getElementById('filterStartDate').value = this.filters.startDate || '';
            document.getElementById('filterEndDate').value = this.filters.endDate || '';
            
            const groupSelect = document.getElementById('filterCategoryGroup');
            groupSelect.value = this.filters.categoryGroup || 'all';
            
            // Initialize temp advanced categories
            this.tempAdvancedCategoryIds = new Set(this.filters.advancedCategoryIds);
            
            // Render categories based on group
            this.updateFilterCategories(this.filters.categoryGroup);

            // 設定選中的狀態
            const statusSelect = document.getElementById('filterAdvancedStatus');
            if (statusSelect) {
                // 如果 status 為空字符串，表示"所有狀態"，對應 select 的 'all'
                statusSelect.value = this.filters.status || 'all';
            }

            document.getElementById('filterTags').value = this.filters.tags || '';
        }
    }

    // 新增：根據分類群組更新分類選項
    updateFilterCategories(groupType) {
        const container = document.getElementById('advancedCategoryContainer');
        const optionsContainer = document.getElementById('advancedCategoryOptions');
        
        if (!container || !optionsContainer) return;
        
        if (!groupType || groupType === 'all') {
            container.style.display = 'none';
            this.tempAdvancedCategoryIds.clear();
            return;
        }
        
        container.style.display = 'block';
        optionsContainer.innerHTML = '';
        
        // 獲取該群組的分類
        const categories = this.categoryGroups[groupType]?.categories || [];
        
        if (categories.length === 0) {
             optionsContainer.innerHTML = '<div class="select-option" style="cursor:default;">無可用分類</div>';
             return;
        }

        // 添加選項
        categories.forEach(category => {
            const optionDiv = document.createElement('div');
            optionDiv.className = 'select-option';
            
            const label = document.createElement('label');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = category.id;
            // Check if in temp set
            checkbox.checked = this.tempAdvancedCategoryIds.has(String(category.id)) || this.tempAdvancedCategoryIds.has(Number(category.id));
            
            checkbox.onchange = (e) => {
                this.handleAdvancedCategoryChange(checkbox);
            };
            
            // Allow clicking row
            optionDiv.onclick = (e) => {
                 if (e.target !== checkbox && e.target !== label) {
                      checkbox.checked = !checkbox.checked;
                      this.handleAdvancedCategoryChange(checkbox);
                 }
            };

            const textSpan = document.createElement('span');
            textSpan.textContent = category.name;
            
            label.appendChild(checkbox);
            label.appendChild(textSpan);
            optionDiv.appendChild(label);
            optionsContainer.appendChild(optionDiv);
        });
        
        this.updateAdvancedCategoryDisplay();
    }

    toggleAdvancedCategoryDropdown() {
        if (this.dom.advancedCategoryOptions) {
            this.dom.advancedCategoryOptions.classList.toggle('show');
        }
    }

    handleAdvancedCategoryChange(checkbox) {
        const id = parseInt(checkbox.value);
        if (checkbox.checked) {
            this.tempAdvancedCategoryIds.add(id);
        } else {
            this.tempAdvancedCategoryIds.delete(id);
        }
        this.updateAdvancedCategoryDisplay();
    }

    updateAdvancedCategoryDisplay() {
        if (!this.dom.advancedCategoryTrigger) return;
        const textSpan = this.dom.advancedCategoryTrigger.querySelector('.selected-text');
        
        if (this.tempAdvancedCategoryIds.size === 0) {
            textSpan.textContent = '所有分類';
        } else {
            textSpan.textContent = `已選擇 ${this.tempAdvancedCategoryIds.size} 個分類`;
        }
    }

    populateQuickCategoryFilter() {
        console.log('Populating quick category filter...');
        const optionsContainer = this.dom.quickCategoryOptions;
        if (!optionsContainer) {
            console.error('Quick category options container not found!');
            this.dom.quickCategoryOptions = document.getElementById('quickCategoryOptions');
            if (!this.dom.quickCategoryOptions) return;
        }

        optionsContainer.innerHTML = '';
        
        let hasCategories = false;
        // Iterate groups
        Object.keys(this.categoryGroups).forEach(key => {
            const group = this.categoryGroups[key];
            if (group.categories && group.categories.length > 0) {
                hasCategories = true;
                const groupDiv = document.createElement('div');
                groupDiv.className = 'select-option-group';
                
                // Group Checkbox
                const groupLabel = document.createElement('label');
                groupLabel.style.cursor = 'pointer';
                groupLabel.style.display = 'flex';
                groupLabel.style.alignItems = 'center';
                groupLabel.style.width = '100%';
                
                const groupCheckbox = document.createElement('input');
                groupCheckbox.type = 'checkbox';
                groupCheckbox.style.marginRight = '8px';
                
                // Check if all children are selected
                const allSelected = group.categories.every(c => 
                    this.quickCategoryIds.has(c.id) || this.quickCategoryIds.has(String(c.id))
                );
                groupCheckbox.checked = allSelected;
                
                groupCheckbox.onclick = (e) => {
                     e.stopPropagation();
                     const isChecked = groupCheckbox.checked;
                     group.categories.forEach(c => {
                         if (isChecked) {
                             this.quickCategoryIds.add(c.id);
                         } else {
                             this.quickCategoryIds.delete(c.id);
                             this.quickCategoryIds.delete(String(c.id));
                         }
                     });
                     // Re-render to update children checkboxes
                     this.populateQuickCategoryFilter(); 
                     this.updateQuickCategoryDisplay();
                     this.currentPage = 1;
                     this.loadData();
                };

                const groupText = document.createElement('span');
                groupText.textContent = group.name;
                groupText.style.fontWeight = 'bold';
                
                groupLabel.appendChild(groupCheckbox);
                groupLabel.appendChild(groupText);
                groupDiv.appendChild(groupLabel);
                
                optionsContainer.appendChild(groupDiv);

                group.categories.forEach(category => {
                    const optionDiv = document.createElement('div');
                    optionDiv.className = 'select-option';
                    
                    const label = document.createElement('label');
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.value = category.id;
                    checkbox.checked = this.quickCategoryIds.has(String(category.id)) || this.quickCategoryIds.has(Number(category.id));
                    checkbox.onclick = (e) => {
                        // Stop propagation to prevent closing dropdown? No, label click toggles checkbox.
                        // We need to handle change.
                        e.stopPropagation(); // Prevent label click from bubbling to optionDiv if handled there
                        this.handleQuickCategoryChange(checkbox);
                    };
                    
                    // Allow clicking the row to toggle
                    optionDiv.onclick = (e) => {
                        if (e.target !== checkbox && e.target !== label) {
                             checkbox.checked = !checkbox.checked;
                             this.handleQuickCategoryChange(checkbox);
                        }
                    };

                    const textSpan = document.createElement('span');
                    textSpan.textContent = category.name;
                    
                    const countSpan = document.createElement('span');
                    countSpan.className = 'category-count';
                    countSpan.textContent = `(${category.subscriberCount || category.subscriber_count || 0})`;

                    label.appendChild(checkbox);
                    label.appendChild(textSpan);
                    label.appendChild(countSpan);
                    optionDiv.appendChild(label);
                    optionsContainer.appendChild(optionDiv);
                });
            }
        });
        
        console.log(`Populated quick category filter. Has categories: ${hasCategories}`);
        this.updateQuickCategoryDisplay();
    }

    toggleQuickCategoryDropdown() {
        if (!this.dom.quickCategoryOptions) {
            console.error('Quick category options element not found');
            // Try to re-cache
            this.dom.quickCategoryOptions = document.getElementById('quickCategoryOptions');
        }

        if (this.dom.quickCategoryOptions) {
            console.log('Toggling quick category dropdown. Current class:', this.dom.quickCategoryOptions.className);
            
            // Check if it's empty, if so, try to populate
            if (this.dom.quickCategoryOptions.children.length === 0) {
                console.warn('Quick category dropdown is empty, populating now...');
                this.populateQuickCategoryFilter();
            }

            this.dom.quickCategoryOptions.classList.toggle('show');
            
            // Force display block if show class doesn't work (fallback)
            if (this.dom.quickCategoryOptions.classList.contains('show')) {
                this.dom.quickCategoryOptions.style.display = 'block';
            } else {
                this.dom.quickCategoryOptions.style.display = '';
            }

            console.log('New class:', this.dom.quickCategoryOptions.className);
        }
    }

    handleQuickCategoryChange(checkbox) {
        const id = parseInt(checkbox.value);
        if (checkbox.checked) {
            this.quickCategoryIds.add(id);
        } else {
            this.quickCategoryIds.delete(id);
        }
        this.updateQuickCategoryDisplay();
        this.currentPage = 1;
        this.loadData();
    }

    updateQuickCategoryDisplay() {
        if (!this.dom.quickCategoryTrigger) return;
        const textSpan = this.dom.quickCategoryTrigger.querySelector('.selected-text');
        
        if (this.quickCategoryIds.size === 0) {
            textSpan.textContent = '所有分類標籤';
        } else {
            textSpan.textContent = `已選擇 ${this.quickCategoryIds.size} 個標籤`;
        }
    }

    applyAdvancedFilters() {
        this.filters.startDate = document.getElementById('filterStartDate').value;
        this.filters.endDate = document.getElementById('filterEndDate').value;
        this.filters.categoryGroup = document.getElementById('filterCategoryGroup').value;
        
        // 處理狀態篩選
        const statusSelect = document.getElementById('filterAdvancedStatus');
        if (statusSelect) {
            const statusVal = statusSelect.value;
            this.filters.status = (statusVal === 'all') ? '' : statusVal;
        }

        // Apply advanced categories
        this.filters.advancedCategoryIds = new Set(this.tempAdvancedCategoryIds);
        
        this.filters.tags = document.getElementById('filterTags').value.trim();
        
        // Log parameters for debugging
        console.log('Applying advanced filters:', {
            startDate: this.filters.startDate,
            endDate: this.filters.endDate,
            tags: this.filters.tags,
            advancedCategoryIds: Array.from(this.filters.advancedCategoryIds),
            status: this.filters.status
        });

        // 清除舊的欄位
        delete this.filters.gender;
        delete this.filters.city;
        delete this.filters.birthdayMonth;
        delete this.filters.categoryId;

        this.closeModal('advancedFilterModal');
        this.currentPage = 1;
        this.loadData();
    }

    resetAdvancedFilters() {
        document.getElementById('advancedFilterForm').reset();
        this.filters.startDate = '';
        this.filters.endDate = '';
        this.filters.categoryGroup = 'all';
        this.filters.advancedCategoryIds.clear();
        this.tempAdvancedCategoryIds.clear();
        this.filters.tags = '';
        this.filters.status = ''; // Reset status
        
        // 清除舊的欄位
        delete this.filters.gender;
        delete this.filters.city;
        delete this.filters.birthdayMonth;
        delete this.filters.categoryId;
        
        // 重置分類下拉選單
        this.updateFilterCategories('all');
    }

    getFilterParams() {
        // 處理分類 ID
        let categoryIds = Array.from(this.selectedCategories);
        // Add quick filters
        this.quickCategoryIds.forEach(id => categoryIds.push(id));
        
        // Add advanced filters
        if (this.filters.advancedCategoryIds) {
             this.filters.advancedCategoryIds.forEach(id => categoryIds.push(id));
        }

        // 去除重複
        categoryIds = [...new Set(categoryIds)];

        return {
            page: this.currentPage,
            limit: this.pageSize,
            sort: this.sortField,
            direction: this.sortDirection,
            search: this.filters.search,
            status: this.filters.status,
            category_ids: categoryIds.join(','),
            startDate: this.filters.startDate,
            endDate: this.filters.endDate,
            categoryGroup: this.filters.categoryGroup,
            tags: this.filters.tags
        };
    }

    async getAllMatchingIds() {
        if (this.selectAllMatching) {
            try {
                // Construct params same as loadData but with high limit
                const params = this.getFilterParams();
                params.page = 1;
                params.limit = 50000; // Use high limit to get all
                params._t = Date.now();

                // Show temporary loading indicator if needed, but usually the bulk action has its own loading state
                
                const response = await window.subscriberService.getSubscribers(params);
                if (response.success && response.data && response.data.subscribers) {
                    return response.data.subscribers.map(s => s.id);
                }
                return [];
            } catch (e) {
                console.error('Failed to fetch all IDs', e);
                this.showError('獲取所有資料失敗');
                return [];
            }
        } else {
            return Array.from(this.selectedSubscribers);
        }
    }

    async loadData() {
        if (this.isLoading) return;
        this.isLoading = true;
        this.showLoadingState();
        
        // Use a unique timer label or just remove it to avoid console warnings
        // const timerLabel = `loadData-${Date.now()}`;
        // console.time(timerLabel);

        try {
            const params = this.getFilterParams();
            // 加入時間戳以防止瀏覽器緩存
            params._t = Date.now();

            const response = await window.subscriberService.getSubscribers(params);

            if (response.data) {
                this.allSubscribers = response.data.subscribers || [];
                this.totalItems = response.data.pagination.total;
                this.totalPages = response.data.pagination.totalPages;
                this.updateUI();
                this.updateActiveFiltersDisplay();
            } else {
                throw new Error(response.message || '無法載入訂閱者資料');
            }
        } catch (error) {
            this.showError(`資料載入失敗: ${error.message}`);
        } finally {
            this.isLoading = false;
            this.hideLoadingState();
            // console.timeEnd(timerLabel);
        }
    }
    
    updateActiveFiltersDisplay() {
        const container = document.getElementById('selectedCategories');
        const list = document.getElementById('selectedCategoriesList');
        
        if (!container || !list) return;
        
        const activeFilters = [];
        
        // 1. Sidebar Selected Categories
        this.selectedCategories.forEach(id => {
            // Find category name (this is a bit inefficient, but acceptable for small lists)
            let name = `Category ID: ${id}`;
            for (const group in this.categoryGroups) {
                if (!this.categoryGroups[group] || !this.categoryGroups[group].categories) continue;
                const found = this.categoryGroups[group].categories.find(c => c.id == id);
                if (found) {
                    name = found.name;
                    break;
                }
            }
            activeFilters.push({ type: 'category', label: `分類: ${name}`, id: id, key: 'sidebar_cat' });
        });

        // 2. Quick Filter Selected Categories
        this.quickCategoryIds.forEach(id => {
            let name = `Category ID: ${id}`;
            for (const group in this.categoryGroups) {
                if (!this.categoryGroups[group] || !this.categoryGroups[group].categories) continue;
                const found = this.categoryGroups[group].categories.find(c => c.id == id);
                if (found) {
                    name = found.name;
                    break;
                }
            }
            activeFilters.push({ type: 'category_quick', label: `篩選: ${name}`, id: id, key: 'quick_cat' });
        });

        // 3. Advanced Filter Selected Categories
        if (this.filters.advancedCategoryIds) {
            this.filters.advancedCategoryIds.forEach(id => {
                let name = `Category ID: ${id}`;
                for (const group in this.categoryGroups) {
                    if (!this.categoryGroups[group] || !this.categoryGroups[group].categories) continue;
                    const found = this.categoryGroups[group].categories.find(c => c.id == id);
                    if (found) {
                        name = found.name;
                        break;
                    }
                }
                activeFilters.push({ type: 'category_adv', label: `進階: ${name}`, id: id, key: 'adv_cat' });
            });
        }

        // 4. Other Advanced Filters
        if (this.filters.startDate) {
            activeFilters.push({ type: 'date', label: `開始日期: ${this.filters.startDate}`, key: 'startDate' });
        }
        if (this.filters.endDate) {
            activeFilters.push({ type: 'date', label: `結束日期: ${this.filters.endDate}`, key: 'endDate' });
        }
        if (this.filters.categoryGroup && this.filters.categoryGroup !== 'all') {
             const groupName = this.categoryGroups[this.filters.categoryGroup]?.name || this.filters.categoryGroup;
             activeFilters.push({ type: 'group', label: `分類群組: ${groupName}`, key: 'categoryGroup' });
        }
        if (this.filters.tags) {
            activeFilters.push({ type: 'tag', label: `標籤: ${this.filters.tags}`, key: 'tags' });
        }
        
        if (this.filters.status && this.filters.status !== 'all') {
            const statusMap = {
                'active': '活躍',
                'inactive': '非活躍',
                'unsubscribed': '已取消訂閱',
                'bounced': '退回',
                'complained': '投訴',
                'invalid': '無效'
            };
            const label = statusMap[this.filters.status] || this.filters.status;
            activeFilters.push({ type: 'status', label: `狀態: ${label}`, key: 'status' });
        }
        
        // Render
        if (activeFilters.length > 0) {
            container.style.display = 'block';
            list.innerHTML = activeFilters.map(filter => `
                <span class="category-tag">
                    ${filter.label}
                    <i class="fas fa-times" onclick="removeFilter('${filter.key}', '${filter.id || ''}')"></i>
                </span>
            `).join('');
        } else {
            container.style.display = 'none';
            list.innerHTML = '';
        }
    }

    removeFilter(key, id) {
        console.log(`Removing filter: key=${key}, id=${id}`);
        if (key === 'sidebar_cat') {
            // 直接操作 selectedCategories 並更新樹狀圖，避免透過 toggleCategoryFilter 造成重複載入
            const catId = parseInt(id);
            if (this.selectedCategories.has(catId)) {
                this.selectedCategories.delete(catId);
                this.updateCategoryTree();
            }
        } else if (key === 'quick_cat') {
            const catId = parseInt(id);
            this.quickCategoryIds.delete(catId);
            this.populateQuickCategoryFilter(); // Re-render to update checkboxes and text
        } else if (key === 'adv_cat') {
            const catId = parseInt(id);
            if (this.filters.advancedCategoryIds) {
                this.filters.advancedCategoryIds.delete(catId);
            }
        } else if (key === 'startDate') {
            this.filters.startDate = '';
        } else if (key === 'endDate') {
            this.filters.endDate = '';
        } else if (key === 'categoryGroup') {
            this.filters.categoryGroup = 'all';
            if (this.filters.advancedCategoryIds) {
                this.filters.advancedCategoryIds.clear();
            }
            this.updateFilterCategories('all');
        } else if (key === 'categoryId') {
             // Legacy
             if (this.filters.advancedCategoryIds) {
                 this.filters.advancedCategoryIds.clear();
             }
        } else if (key === 'tags') {
            this.filters.tags = '';
        } else if (key === 'status') {
            this.filters.status = '';
            if (this.dom.statusFilter) this.dom.statusFilter.value = '';
            const advancedStatus = document.getElementById('filterAdvancedStatus');
            if (advancedStatus) advancedStatus.value = 'all';
        }
        
        this.currentPage = 1;
        this.loadData();
    }

    clearAllFilters() {
        this.selectedCategories.clear();
        this.quickCategoryIds.clear();
        this.populateQuickCategoryFilter();
        this.resetAdvancedFilters();
        // resetAdvancedFilters calls loadData via updateFilterCategories('all')? No, it just resets form.
        // We need to trigger loadData explicitly if resetAdvancedFilters doesn't.
        // Let's check resetAdvancedFilters implementation... it calls updateFilterCategories but not loadData.
        
        // So we explicitly load data here.
        this.currentPage = 1;
        this.loadData();
    }

    async exportSubscribers() {
        if (!this.canManageSubscribers()) {
            this.showError('您沒有權限執行此操作');
            return;
        }

        try {
            this.showLoadingState();
            const params = this.getFilterParams();
            delete params.page;
            delete params.limit;
            
            // Filter out undefined, null, or 'undefined' string values
            Object.keys(params).forEach(key => {
                if (params[key] === undefined || params[key] === null || params[key] === 'undefined') {
                    delete params[key];
                }
            });

            params.format = 'csv'; // Force CSV for now or get from UI

            const queryString = new URLSearchParams(params).toString();
            const token = window.apiClient.getAuthToken();
            const url = `${window.apiClient.baseURL}/subscribers/export?${queryString}`;

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Export failed');

            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = `subscribers_${new Date().toISOString().slice(0,10)}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(downloadUrl);
            
            this.showSuccess('匯出成功');

        } catch (error) {
            console.error('匯出失敗:', error);
            this.showError('匯出失敗');
        } finally {
            this.hideLoadingState();
        }
    }

    updateUI() {
        this.updateStatsDisplay();
        this.updateCategoryTree();
        this.renderSubscribers(this.allSubscribers);
        this.updatePaginationUI();
    }

    updatePaginationUI() {
        if (!this.dom.pagination) return;

        const pageInfo = this.dom.pagination.querySelector('.page-info');
        const pageLinks = this.dom.pagination.querySelector('.page-links');
        
        // Calculate pagination text
        const start = this.totalItems > 0 ? (this.currentPage - 1) * this.pageSize + 1 : 0;
        const end = Math.min(this.currentPage * this.pageSize, this.totalItems);
        const text = `顯示第 ${start} 到 ${end} 項，共 ${this.totalItems} 項記錄`;

        if (pageInfo) {
            // console.log('Updating pagination UI. Total items:', this.totalItems);
            pageInfo.textContent = text;
        }

        if (this.dom.tableInfo) {
            this.dom.tableInfo.textContent = text;
        }

        if (pageLinks) {
            let linksHtml = '';
            // Previous page link
            linksHtml += `<button class="pagination-btn" data-action="previous" ${this.currentPage === 1 ? 'disabled' : ''}>上一頁</button>`;

            // Smart pagination logic
            const maxVisiblePages = 7; // 最多顯示7個頁碼按鈕
            let startPage = 1;
            let endPage = this.totalPages;

            if (this.totalPages > maxVisiblePages) {
                const halfVisible = Math.floor(maxVisiblePages / 2);
                
                if (this.currentPage <= halfVisible + 1) {
                    // 當前頁在前面，顯示前面的頁碼
                    endPage = maxVisiblePages;
                } else if (this.currentPage >= this.totalPages - halfVisible) {
                    // 當前頁在後面，顯示後面的頁碼
                    startPage = this.totalPages - maxVisiblePages + 1;
                } else {
                    // 當前頁在中間，顯示當前頁周圍的頁碼
                    startPage = this.currentPage - halfVisible;
                    endPage = this.currentPage + halfVisible;
                }
            }

            // 第一頁按鈕（如果不在顯示範圍內）
            if (startPage > 1) {
                linksHtml += `<button class="pagination-btn" data-page="1">1</button>`;
                if (startPage > 2) {
                    linksHtml += `<span class="page-ellipsis">...</span>`;
                }
            }

            // 頁碼按鈕
            for (let i = startPage; i <= endPage; i++) {
                const isActive = i === this.currentPage;
                linksHtml += `<button class="pagination-btn ${isActive ? 'active' : ''}" data-page="${i}" ${isActive ? 'disabled' : ''}>${i}</button>`;
            }

            // 最後一頁按鈕（如果不在顯示範圍內）
            if (endPage < this.totalPages) {
                if (endPage < this.totalPages - 1) {
                    linksHtml += `<span class="page-ellipsis">...</span>`;
                }
                linksHtml += `<button class="pagination-btn" data-page="${this.totalPages}">${this.totalPages}</button>`;
            }

            // Next page link
            linksHtml += `<button class="pagination-btn" data-action="next" ${this.currentPage === this.totalPages ? 'disabled' : ''}>下一頁</button>`;

            pageLinks.innerHTML = linksHtml;
        }
    }

    updateStatsDisplay() {
        if (!this.dom.statsContainer) return;
        this.dom.statsContainer.querySelector('[data-stat="total"]').textContent = this.stats.total || 0;
        this.dom.statsContainer.querySelector('[data-stat="active"]').textContent = this.stats.active || 0;
        this.dom.statsContainer.querySelector('[data-stat="newThisMonth"]').textContent = this.stats.newThisMonth || 0;
        this.dom.statsContainer.querySelector('[data-stat="unsubscribed"]').textContent = this.stats.unsubscribed || 0;
        this.dom.statsContainer.querySelector('[data-stat="invalid"]').textContent = this.stats.invalid || 0;
    }

    updateCategoryTree() {
        if (!this.dom.categoryTree) return;

        let html = '';
        for (const groupType in this.categoryGroups) {
            const group = this.categoryGroups[groupType];
            html += `
                <div class="category-group" data-group-type="${groupType}">
                    <div class="category-group-header">
                        <i class="${group.icon}"></i>
                        <span>${group.name}</span>
                        <i class="fas fa-chevron-down group-toggle-icon ${group.expanded ? 'expanded' : ''}"></i>
                    </div>
                    <ul class="category-list ${group.expanded ? 'expanded' : ''}">
                        ${group.categories.map(category => {
                            const isSelected = this.selectedCategories.has(category.id) || this.selectedCategories.has(Number(category.id));
                            return `
                            <li class="category-item ${isSelected ? 'selected' : ''}" data-category-id="${category.id}">
                                <span class="category-name">${category.name}</span>
                                <span class="category-count">${category.subscribers_count || 0}</span>
                            </li>
                            `;
                        }).join('')}
                    </ul>
                </div>
            `;
        }
        this.dom.categoryTree.innerHTML = html;
    }

    toggleCategoryGroup(groupType) {
        if (this.categoryGroups[groupType]) {
            this.categoryGroups[groupType].expanded = !this.categoryGroups[groupType].expanded;
            this.updateCategoryTree();
        }
    }

    toggleCategoryFilter(categoryId) {
        categoryId = parseInt(categoryId);
        
        // 如果已經選中，則取消選中
        if (this.selectedCategories.has(categoryId)) {
            this.selectedCategories.delete(categoryId);
        } else {
            // 單選模式：清空其他選擇，只選這個
            this.selectedCategories.clear();
            this.selectedCategories.add(categoryId);
        }
        
        this.currentPage = 1;
        this.loadData();
        this.updateCategoryTree();
    }

    showLoadingState() {
        window.showLoading('#subscriberTableBody');
    }

    hideLoadingState() {
        window.hideLoading('#subscriberTableBody');
        if (this.dom.loadingOverlay) {
            this.dom.loadingOverlay.style.display = 'none';
        }
    }

    renderSubscribers(subscribers) {
        console.log('Rendering subscribers:', subscribers);
        if (!this.dom.subscribersTableBody) {
            console.error('Element with ID "subscribersTableBody" not found.');
            return;
        }

        // Ensure currentUser is set if possible (double check)
        if (!this.currentUser && window.userAuth) {
             this.currentUser = window.userAuth.getUser();
        }

        if (subscribers.length === 0) {
            this.dom.subscribersTableBody.innerHTML = '<tr><td colspan="8" class="text-center">沒有找到符合條件的訂閱者。</td></tr>';
            return;
        }

        const rows = subscribers.map(subscriber => {
            // console.log('Subscriber data:', subscriber); // Removed for performance
            const isChecked = this.selectedSubscribers.has(subscriber.id);

            // 提取所有分類名稱與標籤
            let categoryNames = subscriber.categories ? subscriber.categories.map(c => 
                `<span class="category-badge" data-category-id="${c.id}" style="cursor:pointer; display:inline-block; padding:2px 6px; margin:2px; background:#e9ecef; border-radius:4px; font-size:0.85em;">${c.name}</span>`
            ).join('') : '';

            // 如果有標籤 (Tags)，也顯示出來
            if (subscriber.tags) {
                const tags = subscriber.tags.split(',').map(t => t.trim()).filter(t => t);
                if (tags.length > 0) {
                    const tagBadges = tags.map(tag => 
                        `<span class="tag-badge" data-tag="${tag}" style="cursor:pointer; display:inline-block; padding:2px 6px; margin:2px; background:#e3f2fd; color:#0d47a1; border-radius:4px; font-size:0.85em; border:1px solid #bbdefb;">🏷️ ${tag}</span>`
                    ).join('');
                    categoryNames += (categoryNames ? '<br>' : '') + tagBadges;
                }
            }

            // Check permissions for delete button
            // Only allow delete if user exists AND is NOT User
            const role = this.currentUser ? (this.currentUser.role || '') : '';
            const canDelete = this.currentUser && role !== 'User' && role !== 'user';
            
            const deleteBtn = canDelete ? 
                `<button class="action-btn delete btn-delete" data-id="${subscriber.id}">刪除</button>` : '';

            return `
                <tr data-id="${subscriber.id}" class="${isChecked ? 'selected' : ''}">
                    <td><input type="checkbox" class="subscriber-checkbox" data-id="${subscriber.id}" ${isChecked ? 'checked' : ''}></td>
                    <td>${subscriber.email || ''}</td>
                    <td>${subscriber.firstName || ''} ${subscriber.lastName || ''}</td>
                    <td>${subscriber.companyName || ''}</td>
                    <td>${this.getStatusText(subscriber.status)}</td>
                    <td>${categoryNames}</td>
                    <td>${this.formatDate(subscriber.created_at)}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="action-btn edit btn-edit" data-id="${subscriber.id}">編輯</button>
                            ${deleteBtn}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        this.dom.subscribersTableBody.innerHTML = rows;

        // Update Select All checkbox state based on current page selection
        const allSelected = this.allSubscribers.length > 0 && this.allSubscribers.every(s => this.selectedSubscribers.has(s.id));
        if (this.dom.selectAllCheckbox) this.dom.selectAllCheckbox.checked = allSelected;
        if (this.dom.selectAllHeaderCheckbox) this.dom.selectAllHeaderCheckbox.checked = allSelected;
    }

    // 工具函數
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('zh-TW');
    }

    getStatusText(status) {
        const statusMap = {
            'active': '活躍',
            'subscribed': '活躍',
            'inactive': '非活躍',
            'unsubscribed': '已取消訂閱',
            'bounced': '退信',
            'complained': '投訴',
            'invalid': '無效'
        };
        return statusMap[status] || status;
    }

    showSuccess(message) {
        NotificationUtils.show(message, 'success');
    }

    showError(message) {
        NotificationUtils.show(message, 'error');
    }

    // 分頁方法
    goToPage(page) {
        console.log(`goToPage called with page: ${page}`);
        if (page >= 1 && page <= this.totalPages) {
            this.currentPage = page;
            this.loadData();
        }
    }

    nextPage() {
        console.log('nextPage called');
        this.goToPage(this.currentPage + 1);
    }

    previousPage() {
        console.log('previousPage called');
        this.goToPage(this.currentPage - 1);
    }

    // ==========================================
    // 匯入功能實作
    // ==========================================

    getSystemFields() {
        return [
            { id: 'email', name: 'Email (必填)', required: true },
            { id: 'name', name: '姓名', required: false },
            { id: 'phone', name: '電話', required: false },
            { id: 'company', name: '公司', required: false },
            { id: 'job_title', name: '職稱', required: false },
            { id: 'city', name: '城市', required: false },
            { id: 'tags', name: '標籤 (逗號分隔)', required: false },
            { id: 'status', name: '狀態 (Active/Inactive)', required: false }
        ];
    }

    handleFileSelection(event) {
        const file = event.target.files[0];
        if (!file) return;

        this.importState.file = file;
        this.processImportFile(file);
    }

    processImportFile(file) {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            const data = e.target.result;
            
            if (file.name.endsWith('.csv')) {
                if (typeof Papa === 'undefined') {
                    this.showError('CSV 解析庫未載入，請檢查網路連線或重新整理頁面');
                    return;
                }
                Papa.parse(data, {
                    header: true,
                    skipEmptyLines: true,
                    complete: (results) => {
                        this.handleParsedData(results.data, results.meta.fields);
                    },
                    error: (error) => {
                        this.showError('CSV 解析失敗: ' + error.message);
                    }
                });
            } else {
                // Excel processing
                if (typeof XLSX === 'undefined') {
                    this.showError('Excel 解析庫未載入，請檢查網路連線或重新整理頁面');
                    return;
                }
                try {
                    const workbook = XLSX.read(data, { type: 'binary' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    
                    if (json.length > 0) {
                        const headers = json[0];
                        const rows = json.slice(1).map(row => {
                            const obj = {};
                            headers.forEach((header, index) => {
                                obj[header] = row[index];
                            });
                            return obj;
                        });
                        this.handleParsedData(rows, headers);
                    } else {
                        this.showError('Excel 檔案為空');
                    }
                } catch (error) {
                    this.showError('Excel 解析失敗: ' + error.message);
                }
            }
        };

        if (file.name.endsWith('.csv')) {
            reader.readAsText(file);
        } else {
            reader.readAsBinaryString(file);
        }
    }

    handleParsedData(data, headers) {
        if (!data || data.length === 0) {
            this.showError('檔案中沒有資料');
            return;
        }

        this.importState.data = data;
        this.importState.headers = headers;
        
        // 自動對應欄位
        this.autoMapFields(headers);
        
        // 更新 UI 顯示檔案資訊
        const fileInfo = document.querySelector('.file-upload-area .file-info');
        if (fileInfo) {
            fileInfo.innerHTML = `
                <div class="success-message">
                    <i class="fas fa-check-circle"></i> 
                    已讀取 ${data.length} 筆資料
                </div>
                <div class="file-name">${this.importState.file.name}</div>
            `;
        }
        
        // 啟用下一步按鈕
        document.getElementById('nextStepBtn').disabled = false;
    }

    autoMapFields(headers) {
        const systemFields = this.getSystemFields();
        this.importState.mapping = {};

        systemFields.forEach(sysField => {
            // 簡單的模糊匹配
            const match = headers.find(header => 
                header.toLowerCase().includes(sysField.id) || 
                header.toLowerCase().includes(sysField.name.split(' ')[0].toLowerCase())
            );
            
            if (match) {
                this.importState.mapping[sysField.id] = match;
            }
        });
    }

    nextImportStep() {
        if (this.importState.step === 1) {
            if (!this.importState.data || this.importState.data.length === 0) {
                this.showError('請先選擇有效的檔案');
                return;
            }
            this.importState.step = 2;
            this.renderFieldMapping();
        } else if (this.importState.step === 2) {
            // 驗證必填欄位
            const emailMapping = this.importState.mapping['email'];
            if (!emailMapping) {
                this.showError('請設定 Email 欄位對應');
                return;
            }
            this.importState.step = 3;
            this.renderImportPreview();
        }
        
        this.updateImportStepUI();
    }

    previousImportStep() {
        if (this.importState.step > 1) {
            this.importState.step--;
            this.updateImportStepUI();
        }
    }

    updateImportStepUI() {
        // 更新步驟指示器
        document.querySelectorAll('.import-steps .step').forEach(step => {
            const stepNum = parseInt(step.dataset.step);
            if (stepNum === this.importState.step) {
                step.classList.add('active');
                step.style.display = 'block';
            } else {
                step.classList.remove('active');
                step.style.display = 'none'; // 隱藏非當前步驟的內容
            }
        });

        // 更新按鈕狀態
        const prevBtn = document.getElementById('prevStepBtn');
        const nextBtn = document.getElementById('nextStepBtn');
        const importBtn = document.getElementById('importBtn');

        if (prevBtn) prevBtn.style.display = this.importState.step === 1 ? 'none' : 'inline-block';
        
        if (this.importState.step === 3) {
            if (nextBtn) nextBtn.style.display = 'none';
            if (importBtn) importBtn.style.display = 'inline-block';
        } else {
            if (nextBtn) nextBtn.style.display = 'inline-block';
            if (importBtn) importBtn.style.display = 'none';
        }
    }

    renderFieldMapping() {
        const container = document.getElementById('fieldMapping');
        if (!container) return;

        const systemFields = this.getSystemFields();
        const headers = this.importState.headers;

        let html = '<div class="mapping-table">';
        
        systemFields.forEach(field => {
            const currentMapping = this.importState.mapping[field.id] || '';
            
            html += `
                <div class="mapping-row">
                    <div class="system-field ${field.required ? 'required' : ''}">
                        ${field.name}
                    </div>
                    <div class="arrow"><i class="fas fa-arrow-right"></i></div>
                    <div class="file-field">
                        <select class="form-select mapping-select" data-field="${field.id}" onchange="window.subscribersManager.updateMapping('${field.id}', this.value)">
                            <option value="">(不匯入)</option>
                            ${headers.map(h => `<option value="${h}" ${h === currentMapping ? 'selected' : ''}>${h}</option>`).join('')}
                        </select>
                    </div>
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;
    }

    updateMapping(fieldId, value) {
        if (value) {
            this.importState.mapping[fieldId] = value;
        } else {
            delete this.importState.mapping[fieldId];
        }
    }

    renderImportPreview() {
        const container = document.getElementById('importPreview');
        if (!container) return;

        const previewData = this.importState.data.slice(0, 5); // 顯示前 5 筆
        const mapping = this.importState.mapping;

        let html = `
            <div class="preview-info">
                <p>總共將匯入 <strong>${this.importState.data.length}</strong> 筆資料</p>
                <p class="text-muted">以下顯示前 5 筆預覽：</p>
            </div>
            <div class="table-responsive">
                <table class="table">
                    <thead>
                        <tr>
                            ${Object.keys(mapping).map(key => `<th>${this.getFieldName(key)}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
        `;

        previewData.forEach(row => {
            html += '<tr>';
            Object.keys(mapping).forEach(key => {
                const fileHeader = mapping[key];
                html += `<td>${row[fileHeader] || '-'}</td>`;
            });
            html += '</tr>';
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = html;
    }

    getFieldName(fieldId) {
        const field = this.getSystemFields().find(f => f.id === fieldId);
        return field ? field.name : fieldId;
    }

    async executeImport() {
        try {
            this.showLoadingState();
            
            // 準備資料
            const importData = this.importState.data.map(row => {
                const item = {};
                Object.entries(this.importState.mapping).forEach(([sysField, fileHeader]) => {
                    let value = row[fileHeader];
                    // 簡單清理
                    if (typeof value === 'string') value = value.trim();
                    item[sysField] = value;
                });

                // 處理姓名分割
                if (item.name) {
                    const nameParts = item.name.split(/\s+/);
                    item.firstName = nameParts[0] || '';
                    item.lastName = nameParts.slice(1).join(' ') || '';
                }

                // 確保必要欄位存在
                if (!item.firstName) item.firstName = '';
                if (!item.lastName) item.lastName = '';

                return item;
            });

            const response = await window.apiClient.request('/subscribers/bulk-import', {
                method: 'POST',
                body: { subscribers: importData }
            });

            if (response.success) {
                // 顯示詳細結果
                const result = response.data;
                let message = `匯入完成：成功 ${result.success} 筆`;
                if (result.failed > 0) {
                    message += `，失敗 ${result.failed} 筆`;
                    // 可以顯示失敗原因，這裡暫時簡化
                    console.warn('匯入失敗項目:', result.errors);
                    if (result.errors.length > 0) {
                         message += `\n(首個錯誤: ${result.errors[0]})`;
                    }
                }
                
                this.showSuccess(message);
                this.closeModal('importModal');
                this.loadData(); // 重新載入列表
            } else {
                this.showError(response.message || '匯入失敗');
            }

        } catch (error) {
            console.error('Import error:', error);
            this.showError('匯入過程發生錯誤: ' + (error.message || '未知錯誤'));
        } finally {
            this.hideLoadingState();
        }
    }
}

// 全域實例

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    window.subscribersManager = new SubscribersManager();
    window.subscribersManager.init(); // Initialize after DOM is loaded
});

// 模態框控制函數
function showAddSubscriberModal() {
    if (window.subscribersManager) {
        window.subscribersManager.showAddSubscriberModal();
    }
}

function showImportModal() {
    if (window.subscribersManager) {
        window.subscribersManager.showImportModal();
    }
}

function showCategoryManagementModal() {
    if (window.subscribersManager) {
        window.subscribersManager.showCategoryManagementModal();
    }
}

function closeModal(modalId) {
    if (window.subscribersManager) {
        window.subscribersManager.closeModal(modalId);
    }
}

// 表單提交函數
function submitAddSubscriber() {
    if (window.subscribersManager) {
        window.subscribersManager.addSubscriber();
    }
}

function submitUpdateSubscriber() {
    if (window.subscribersManager) {
        window.subscribersManager.updateSubscriber();
    }
}

function removeFilter(key, id) {
    if (window.subscribersManager) {
        window.subscribersManager.removeFilter(key, id);
    }
}

function submitBulkCategoryAction() {
    if (window.subscribersManager) {
        window.subscribersManager.submitBulkCategoryAction();
    }
}

// 批量操作函數
function bulkDelete() {
    if (window.subscribersManager) {
        window.subscribersManager.bulkDelete();
    }
}

function exportSubscribers() {
    if (window.subscribersManager) {
        window.subscribersManager.exportSubscribers();
    }
}

// 分類管理函數 - 委派給 CategoryManagement
function switchCategoryType(type) {
    if (window.categoryManagement) {
        window.categoryManagement.switchCategoryType(type);
    }
}

function saveCategoryChanges() {
    if (window.categoryManagement) {
        window.categoryManagement.saveCategoryForm();
    }
}

// 批量分類操作函數
function bulkAddCategories() {
    if (window.subscribersManager) {
        window.subscribersManager.bulkUpdateCategories('add');
    }
}

function bulkRemoveCategories() {
    if (window.subscribersManager) {
        window.subscribersManager.bulkUpdateCategories('remove');
    }
}

// 批量操作面板控制函數
function showBulkActions() {
    if (window.subscribersManager) {
        window.subscribersManager.showBulkActions();
    }
}

function hideBulkActions() {
    if (window.subscribersManager) {
        window.subscribersManager.hideBulkActions();
    }
}

function bulkExport() {
    if (window.subscribersManager) {
        window.subscribersManager.bulkExport();
    }
}

function switchEditCategoryTab(categoryType, event) {
    if (window.subscribersManager) {
        window.subscribersManager.switchEditCategoryTab(categoryType, event);
    }
}

function switchCategoryTab(categoryType) {
    if (window.subscribersManager) {
        window.subscribersManager.switchCategoryTab(categoryType);
    }
}

// Advanced Filter Functions
function showAdvancedFilters() {
    if (window.subscribersManager) {
        window.subscribersManager.showAdvancedFilters();
    }
}

function applyAdvancedFilters() {
    if (window.subscribersManager) {
        window.subscribersManager.applyAdvancedFilters();
    }
}

function resetAdvancedFilters() {
    if (window.subscribersManager) {
        window.subscribersManager.resetAdvancedFilters();
    }
}

function removeFilter(key, id) {
    if (window.subscribersManager) {
        window.subscribersManager.removeFilter(key, id);
    }
}

function clearAllFilters() {
    if (window.subscribersManager) {
        window.subscribersManager.clearAllFilters();
    }
}
