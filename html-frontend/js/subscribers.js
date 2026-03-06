// 訂閱者管理系統 - 重新設計版本
class SubscribersManager {
    constructor() {
        // this.apiClient = new ApiClient(); // Removed this line
        // this.subscriberService = new SubscriberService(this.apiClient); // Removed this line
        this.isLoading = false;
        this.currentUser = null;
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
        
        this.selectAllMatching = false; // Flag for cross-page selection
        this.selectedSubscribers = new Set();
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
        
        // this.init(); // Defer initialization
    }
    
    async init() {
        try {
            console.log('init called');
            this.cacheDOMElements(); // Cache DOM elements first
            
            // 獲取當前用戶並檢查權限
            if (window.userAuth) {
                this.currentUser = window.userAuth.getUser();
            }
            this.checkUserPermissions();

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
        } catch (error) {
            console.error('初始化失敗:', error);
            this.showError('系統初始化失敗，請重新整理頁面');
        } 
     finally {
            this.hideLoadingState();
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
            cancelImportBtn: document.getElementById('cancelImportBtn'),
            cancelAddSubscriberBtn: document.getElementById('cancelAddSubscriberBtn'),
            submitAddSubscriberBtn: document.getElementById('submitAddSubscriberBtn'),
            cancelEditSubscriberBtn: document.getElementById('cancelEditSubscriberBtn'),
            submitUpdateSubscriberBtn: document.getElementById('submitUpdateSubscriberBtn'),
            cancelBulkCategoryBtn: document.getElementById('cancelBulkCategoryBtn'),
            submitBulkCategoryBtn: document.getElementById('submitBulkCategoryBtn'),
            cancelBulkEmailCorrectionBtn: document.getElementById('cancelBulkEmailCorrectionBtn'),
            submitBulkEmailCorrectionBtn: document.getElementById('submitBulkEmailCorrectionBtn'),
            bulkUpdateStatusBtn: document.getElementById('bulkUpdateStatusBtn'),
            cancelBulkUpdateStatusBtn: document.getElementById('cancelBulkUpdateStatusBtn'),
            submitBulkUpdateStatusBtn: document.getElementById('submitBulkUpdateStatusBtn'),
            bulkUpdateDataBtn: document.getElementById('bulkUpdateDataBtn'),
            cancelBulkUpdateDataBtn: document.getElementById('cancelBulkUpdateDataBtn'),
            submitBulkUpdateDataBtn: document.getElementById('submitBulkUpdateDataBtn'),
            bulkUpdateCountry: document.getElementById('bulkUpdateCountry'),
            bulkUpdateCity: document.getElementById('bulkUpdateCity'),
            bulkStatusSelect: document.getElementById('bulkStatusSelect'),
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
    
    checkUserPermissions() {
        if (!this.currentUser) return;
        
        // 檢查是否為一般使用者 (User)
        const isGeneralUser = this.currentUser.role === 'User';
        
        if (isGeneralUser) {
            // 隱藏匯入按鈕
            if (this.dom.showImportModalBtn) this.dom.showImportModalBtn.style.display = 'none';
            
            // 隱藏匯出按鈕
            if (this.dom.exportSubscribersBtn) this.dom.exportSubscribersBtn.style.display = 'none';
            
            // 隱藏批量操作按鈕
            if (this.dom.bulkActionsBtn) this.dom.bulkActionsBtn.style.display = 'none';
            
            // 隱藏進階篩選按鈕
            if (this.dom.showAdvancedFiltersBtn) this.dom.showAdvancedFiltersBtn.style.display = 'none';

            // 隱藏表格標題的全選複選框
            if (this.dom.selectAllHeaderCheckbox) {
                const th = this.dom.selectAllHeaderCheckbox.closest('th');
                if (th) th.style.display = 'none';
            }

            // 隱藏表格上方的全選複選框
            if (this.dom.selectAllCheckbox) {
                const label = this.dom.selectAllCheckbox.closest('label');
                if (label) label.style.display = 'none';
            }

            // 隱藏已選擇數量文字 (因為無法選擇，顯示0項沒有意義)
            const selectedCount = document.getElementById('selectedCount');
            if (selectedCount) selectedCount.style.display = 'none';
        }
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
        if (this.dom.cancelImportBtn) this.dom.cancelImportBtn.addEventListener('click', () => this.closeModal('importModal'));
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
        if (this.dom.bulkUpdateStatusBtn) this.dom.bulkUpdateStatusBtn.addEventListener('click', () => this.showBulkUpdateStatusModal());
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

        if (this.dom.cancelBulkUpdateStatusBtn) this.dom.cancelBulkUpdateStatusBtn.addEventListener('click', () => this.closeModal('bulkUpdateStatusModal'));
        if (this.dom.submitBulkUpdateStatusBtn) this.dom.submitBulkUpdateStatusBtn.addEventListener('click', () => this.submitBulkUpdateStatus());

        if (this.dom.bulkUpdateDataBtn) this.dom.bulkUpdateDataBtn.addEventListener('click', () => this.showBulkUpdateDataModal());
        if (this.dom.cancelBulkUpdateDataBtn) this.dom.cancelBulkUpdateDataBtn.addEventListener('click', () => this.closeModal('bulkUpdateDataModal'));
        if (this.dom.submitBulkUpdateDataBtn) this.dom.submitBulkUpdateDataBtn.addEventListener('click', () => this.submitBulkUpdateData());

        if (this.dom.closeCategoryManagementBtn) this.dom.closeCategoryManagementBtn.addEventListener('click', () => this.closeModal('categoryManagementModal'));

        if (this.dom.quickCategoryTrigger) {
            this.dom.quickCategoryTrigger.addEventListener('click', () => this.toggleQuickCategoryDropdown());
        }
        
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
        
        // Removed quickCategoryFilter change listener
        
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
            
            // Reset import state completely
            this.importState = {
                step: 1,
                file: null,
                data: [],
                headers: [],
                mapping: {},
                preview: [],
                targetCategoryId: null,
                duplicates: { count: 0, duplicates: [] }
            };

            // Reset UI elements
            const fileInput = document.getElementById('importFile');
            if (fileInput) fileInput.value = '';
            
            // Reset file info text
            const fileInfo = document.querySelector('.file-upload-area .file-info');
            if (fileInfo) {
                fileInfo.innerHTML = '支援 CSV, Excel (.xlsx, .xls) 格式';
            }

            // Reset buttons
            const nextStepBtn = document.getElementById('nextStepBtn');
            if (nextStepBtn) {
                nextStepBtn.disabled = true;
                nextStepBtn.style.display = 'inline-block';
            }
            
            const prevBtn = document.getElementById('prevStepBtn');
            if (prevBtn) prevBtn.style.display = 'none';

            const importBtn = document.getElementById('importBtn');
            if (importBtn) importBtn.style.display = 'none';

            // Reset steps UI using the standard method
            this.updateImportStepUI();
            
            // Hide preview container explicitly
            const preview = document.querySelector('#importModal #importPreview');
            if (preview) preview.style.display = 'none';
            
            // Reset progress UI
            const progressContainer = document.getElementById('importProgressContainer');
            if (progressContainer) progressContainer.style.display = 'none';
             
            const actionButtons = document.getElementById('importActionButtons');
            if (actionButtons) actionButtons.style.display = 'block';

            const closeBtn = document.querySelector('#importModal .modal-close');
            if (closeBtn) closeBtn.style.display = 'block';
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
            console.log('Using token:', window.apiClient.getAuthToken());
            const response = await window.apiClient.request('/subscribers', {
                method: 'POST',
                body: subscriberData,
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
            if (error.message.includes('未授權')) {
                this.showError('您的登入已過期或權限不足，請重新登入');
            } else {
                this.showError('新增訂閱者失敗: ' + error.message);
            }
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
        const selectedCount = this.selectedSubscribers.size;
        if (selectedCount === 0 && !this.selectAllMatching) {
            NotificationUtils.show('請先選擇要操作的訂閱者', 'warning');
            return;
        }

        this.currentBulkAction = action;

        const modal = document.getElementById('bulkCategoryModal');
        const title = document.getElementById('bulkCategoryModalTitle');
        const message = document.getElementById('bulkCategoryModalMessage');
        
        if (modal) {
            const countDisplay = this.selectAllMatching ? this.totalItems : selectedCount;
            if (action === 'add') {
                if (title) title.textContent = '批量添加分類';
                if (message) message.textContent = `為選中的 ${countDisplay} 位訂閱者添加分類：`;
            } else {
                if (title) title.textContent = '批量移除分類';
                if (message) message.textContent = `為選中的 ${countDisplay} 位訂閱者移除分類：`;
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
        const { categoriesByType } = this.bulkCategoryData;

        // Find first group with categories to set as active
        let activeType = groupKeys[0];
        for (const type of groupKeys) {
            if (categoriesByType[type] && categoriesByType[type].length > 0) {
                activeType = type;
                break;
            }
        }
        
        const tabs = groupKeys.map(type => {
            const group = this.categoryGroups[type];
            const isActive = type === activeType;
            return `<button type="button" class="category-tab ${isActive ? 'active' : ''}" 
                     onclick="window.subscribersManager.switchBulkCategoryTab('${type}', event)">
                <i class="${group.icon}"></i> ${group.name}
            </button>`;
        }).join('');

        tabsContainer.innerHTML = tabs;

        // Render active tab
        this.renderBulkCategoryContent(activeType);
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
                    ${categories.length > 0 ? categories.map(category => `
                        <label class="category-checkbox">
                            <input type="checkbox" 
                                   name="bulkCategoryIds" 
                                   value="${category.id}">
                            <span class="category-label">${category.name}</span>
                        </label>
                    `).join('') : '<div class="no-categories" style="padding: 20px; text-align: center; color: #666;">此分類群組無可用選項</div>'}
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

    showBulkEmailCorrectionModal() {
        const selectedCount = this.selectedSubscribers.size;
        if (selectedCount === 0 && !this.selectAllMatching) {
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

    showBulkUpdateStatusModal() {
        const selectedCount = this.selectedSubscribers.size;
        // If we are in "select all matching" mode, we treat it as having selected items.
        if (selectedCount === 0 && !this.selectAllMatching) {
            NotificationUtils.show('請先選擇要操作的訂閱者', 'warning');
            return;
        }

        const modal = document.getElementById('bulkUpdateStatusModal');
        if (modal) {
            // Reset select
            if (this.dom.bulkStatusSelect) {
                this.dom.bulkStatusSelect.value = '';
            }
            modal.classList.add('show');
        }
    }

    async submitBulkUpdateStatus() {
        const selectedIds = await this.getAllMatchingIds();
        if (selectedIds.length === 0) {
            NotificationUtils.show('請先選擇要操作的訂閱者', 'warning');
            return;
        }

        const statusSelect = this.dom.bulkStatusSelect;
        const status = statusSelect ? statusSelect.value : '';

        if (!status) {
            NotificationUtils.show('請選擇新狀態', 'warning');
            return;
        }

        try {
            this.showLoadingState();
            
            const response = await window.subscriberService.bulkUpdateStatus(
                selectedIds,
                status
            );

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

    showBulkUpdateDataModal() {
        const selectedCount = this.selectedSubscribers.size;
        if (selectedCount === 0 && !this.selectAllMatching) {
            NotificationUtils.show('請先選擇要操作的訂閱者', 'warning');
            return;
        }

        const modal = document.getElementById('bulkUpdateDataModal');
        if (modal) {
            // Reset inputs
            if (this.dom.bulkUpdateCountry) this.dom.bulkUpdateCountry.value = '';
            if (this.dom.bulkUpdateCity) this.dom.bulkUpdateCity.value = '';
            modal.classList.add('show');
        }
    }

    async submitBulkUpdateData() {
        const selectedIds = await this.getAllMatchingIds();
        if (selectedIds.length === 0) {
            NotificationUtils.show('請先選擇要操作的訂閱者', 'warning');
            return;
        }

        const country = this.dom.bulkUpdateCountry ? this.dom.bulkUpdateCountry.value.trim() : '';
        const city = this.dom.bulkUpdateCity ? this.dom.bulkUpdateCity.value.trim() : '';

        if (!country && !city) {
            NotificationUtils.show('請至少輸入一個要更新的欄位', 'warning');
            return;
        }

        const data = {};
        if (country) data.country = country;
        if (city) data.city = city;

        try {
            this.showLoadingState();
            
            const response = await window.subscriberService.bulkUpdateData(
                selectedIds,
                data
            );

            if (response.success) {
                this.showSuccess(response.message || '批量更新資料成功');
                this.closeModal('bulkUpdateDataModal');
                await this.loadData();
                this.loadStats();
                this.clearSelection();
            } else {
                this.showError(response.message || '批量操作失敗');
            }
        } catch (error) {
            console.error('批量更新資料失敗:', error);
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
        this.selectAllMatching = false;
        
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

        // Reset cross-page selection if user manually interacts
        if (this.selectAllMatching) {
            this.selectAllMatching = false;
            // When unchecking one item from "all matching", we theoretically revert to "all selected except one".
            // However, "all selected except one" is complex to manage with just a Set of selected IDs if the total is large.
            // For simplicity and common UX patterns, we often either:
            // 1. Convert "all matching" to "all loaded IDs" (if possible) and then uncheck the one.
            // 2. Or just clear "select all matching" and fallback to current selection (which might be just the current page).
            // Given the implementation of toggleSelectAll, let's keep it simple: 
            // If they interact manually, we assume they are refining selection.
            // Since we don't have all IDs loaded, we can't easily populate selectedSubscribers with "All - 1".
            // So we'll just disable the "Select All Matching" mode. 
            // Ideally, we should maybe warn or fetch all IDs, but fetching all IDs to select them is heavy.
            // Let's stick to: Manual interaction -> Disable "Select All Matching".
            // If they had "Select All Matching" active, and they click a checkbox:
            // - If they uncheck a box: They want to deselect that one.
            // - If they check a box: (Unlikely if select all matching was true, unless it was somehow unchecked locally).
            
            // To properly support "Deselect one from 10,000", we would need a "exclude list" logic.
            // But we only have "include list" (selectedSubscribers).
            // Implementing "exclude list" requires backend support for "All Except ...".
            // Current backend bulk endpoints generally take "ids" list.
            // So we cannot easily support "Select All Except One" without fetching all IDs.
            
            // Current Compromise:
            // If user manually clicks, we turn off selectAllMatching.
            // If they were in selectAllMatching mode, this effectively deselects everything else invisible.
            // This might be confusing. 
            // A better UX for "Select All Matching" + "Deselect One" is hard without "Exclude Mode".
            // Let's assume for now: Resetting selectAllMatching is acceptable, 
            // OR we could try to fetch all IDs if the count isn't too huge? No, that's risky.
            
            // Let's check how other systems do it (e.g. Gmail). 
            // Gmail: "All 50 conversations on this page are selected. Select all 1,234 conversations in Primary"
            // If you click "Select all 1,234", then uncheck one, it usually reverts to "page selection" or keeps "all except one" if supported.
            
            // For this task, "Select All" feature usually implies just the ability to select all.
            // Complex "All except one" might be out of scope.
            // So, if I touch a checkbox, I lose "Select All Matching" status.
        }

        if (checkbox.checked) {
            this.selectedSubscribers.add(realId);
            const row = checkbox.closest('tr');
            if (row) row.classList.add('selected');
        } else {
            this.selectedSubscribers.delete(realId);
            const row = checkbox.closest('tr');
            if (row) row.classList.remove('selected');
        }

        // Check if all visible subscribers are selected
        const allSelected = this.allSubscribers.length > 0 && this.allSubscribers.every(s => this.selectedSubscribers.has(s.id));
        
        if (this.dom.selectAllCheckbox) this.dom.selectAllCheckbox.checked = allSelected;
        if (this.dom.selectAllHeaderCheckbox) this.dom.selectAllHeaderCheckbox.checked = allSelected;

        this.updateBulkActionButtons();
    }

    toggleSelectAll(checked) {
        this.selectAllMatching = false; // Always reset cross-page selection on manual toggle

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
        
        // Determine if we should show the "Select all matching" option
        // Show if:
        // 1. Current page has items and all are selected
        // 2. Total items in DB is greater than currently selected items (so there's more to select)
        const isCurrentPageFullySelected = this.allSubscribers.length > 0 && 
                                          this.allSubscribers.every(s => this.selectedSubscribers.has(s.id));
        
        const showSelectAllMatching = isCurrentPageFullySelected && 
                                     this.totalItems > selectedCount;

        const bulkActions = document.querySelector('.bulk-actions');
        if (bulkActions) {
            bulkActions.style.display = (selectedCount > 0 || this.selectAllMatching) ? 'block' : 'none';
        }
        
        // Check for existing banner or create one
        let selectAllBanner = document.getElementById('selectAllBanner');
        if (!selectAllBanner && document.querySelector('.table-container')) {
            selectAllBanner = document.createElement('div');
            selectAllBanner.id = 'selectAllBanner';
            selectAllBanner.className = 'alert alert-info text-center py-2 mb-0';
            selectAllBanner.style.display = 'none';
            selectAllBanner.style.cursor = 'pointer';
            // Insert before table
            const tableContainer = document.querySelector('.table-container');
            tableContainer.parentNode.insertBefore(selectAllBanner, tableContainer);
        }

        if (this.selectAllMatching) {
             if (selectAllBanner) {
                 selectAllBanner.innerHTML = `已選擇所有 <b>${this.totalItems}</b> 位訂閱者。 <a href="#" id="clearSelectionLink" class="text-primary fw-bold">取消選取</a>`;
                 selectAllBanner.style.display = 'block';
                 
                 const clearLink = selectAllBanner.querySelector('#clearSelectionLink');
                 if (clearLink) {
                     clearLink.onclick = (e) => {
                         e.preventDefault();
                         this.clearSelection();
                     };
                 }
             }
        } else if (showSelectAllMatching) {
             if (selectAllBanner) {
                 selectAllBanner.innerHTML = `已選擇本頁 <b>${selectedCount}</b> 位訂閱者。 <a href="#" id="selectAllMatchingLink" class="text-primary fw-bold">選擇所有符合條件的 ${this.totalItems} 位訂閱者</a>`;
                 selectAllBanner.style.display = 'block';

                 const selectAllLink = selectAllBanner.querySelector('#selectAllMatchingLink');
                 if (selectAllLink) {
                     selectAllLink.onclick = (e) => {
                         e.preventDefault();
                         this.handleSelectAllMatching();
                     };
                 }
             }
        } else {
             if (selectAllBanner) selectAllBanner.style.display = 'none';
        }
        
        // 更新選擇計數顯示
        const selectionCount = document.querySelector('.selection-count');
        if (selectionCount) {
            if (this.selectAllMatching) {
                selectionCount.textContent = `已選擇 ${this.totalItems} 位訂閱者`;
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
            bulkActionsBtn.style.display = (selectedCount > 0 || this.selectAllMatching) ? 'inline-block' : 'none';
        }
    }

    handleSelectAllMatching() {
        this.selectAllMatching = true;
        this.updateBulkActionButtons();
    }

    async getAllMatchingIds() {
        if (this.selectAllMatching) {
            // Fetch all IDs matching current filters
            try {
                this.showLoadingState();
                const params = this.getFilterParams();
                // Remove pagination params to get all
                delete params.page;
                delete params.limit;
                
                const response = await window.subscriberService.getAllSubscriberIds(params);
                if (response && response.success) {
                    return response.data; // Array of IDs
                } else {
                    console.error('Failed to fetch all matching IDs');
                    return [];
                }
            } catch (error) {
                console.error('Error fetching all IDs:', error);
                this.showError('無法獲取所有選取的訂閱者ID');
                return [];
            } finally {
                this.hideLoadingState();
            }
        } else {
            return Array.from(this.selectedSubscribers);
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
            const response = await window.subscriberService.exportSubscribers({
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
            } else if (Array.isArray(response)) {
                this.categories = response;
            } else {
                console.warn('分類資料格式不正確:', response);
                this.categories = [];
            }

            this.organizeCategoriesByType();
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
                 // 'identity': 'customer' // 根據需求調整，有時 identity 單獨存在
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
            't1': 'identity',     // 原 identity -> customer
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
        const optionsContainer = this.dom.quickCategoryOptions;
        if (!optionsContainer) return;

        optionsContainer.innerHTML = '';
        
        // 1. Add "All Categories" option (implicit when nothing is selected, but good to have a clearer?)
        // Actually, for multi-select, "All" usually means clearing selection.
        // Let's rely on clearing selection = All.
        
        // Iterate groups
        Object.keys(this.categoryGroups).forEach(key => {
            const group = this.categoryGroups[key];
            if (group.categories && group.categories.length > 0) {
                const groupDiv = document.createElement('div');
                groupDiv.className = 'select-option-group';
                groupDiv.textContent = group.name;
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
        
        this.updateQuickCategoryDisplay();
    }

    toggleQuickCategoryDropdown() {
        if (this.dom.quickCategoryOptions) {
            this.dom.quickCategoryOptions.classList.toggle('show');
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
        
        this.filters.tags = document.getElementById('filterTags').value;
        this.filters.country = document.getElementById('filterCountry').value;
        this.filters.city = document.getElementById('filterCity').value;
        
        // 清除舊的欄位
        delete this.filters.gender;
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
        this.filters.country = '';
        this.filters.city = '';
        this.filters.status = ''; // Reset status
        
        // 清除舊的欄位
        delete this.filters.gender;
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
            tags: this.filters.tags,
            country: this.filters.country,
            city: this.filters.city
        };
    }

    sortTable(field) {
        if (this.sortField === field) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortField = field;
            this.sortDirection = 'desc';
        }
        
        this.updateSortIcons();
        this.currentPage = 1;
        this.loadData();
    }

    updateSortIcons() {
        const headers = document.querySelectorAll('.sort-header');
        headers.forEach(header => {
            header.classList.remove('sort-asc', 'sort-desc');
            // Reset icon if exists
            const icon = header.querySelector('i');
            if (icon) {
                icon.className = 'fas fa-sort';
            }

            if (header.dataset.sort === this.sortField) {
                header.classList.add(`sort-${this.sortDirection}`);
                if (icon) {
                    icon.className = this.sortDirection === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
                }
            }
        });
    }

    async loadData() {
        if (this.isLoading) return;
        this.isLoading = true;
        this.showLoadingState();
        // Ensure unique timer name or suppress if needed. 
        // Using a fixed name is fine if we ensure single execution via isLoading.
        const timerName = 'loadData'; 
        // Simple check to avoid "Timer already exists" if console.time was somehow left open
        try { console.timeEnd(timerName); } catch(e) {} 
        console.time(timerName);

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
            try { console.timeEnd(timerName); } catch(e) {}
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
        if (this.filters.country) {
            activeFilters.push({ type: 'text', label: `營業單位: ${this.filters.country}`, key: 'country' });
        }
        if (this.filters.city) {
            activeFilters.push({ type: 'text', label: `城市: ${this.filters.city}`, key: 'city' });
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
        if (key === 'sidebar_cat') {
            this.toggleCategoryFilter(id);
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
        } else if (key === 'country') {
            this.filters.country = '';
        } else if (key === 'city') {
            this.filters.city = '';
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
                        ${group.categories.map(category => `
                            <li class="category-item ${this.selectedCategories.has(category.id) ? 'selected' : ''}" data-category-id="${category.id}">
                                <span class="category-name">${category.name}</span>
                                <span class="category-count">${category.subscribers_count || 0}</span>
                            </li>
                        `).join('')}
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
    }

    renderSubscribers(subscribers) {
        console.log('Rendering subscribers:', subscribers);
        if (!this.dom.subscribersTableBody) {
            console.error('Element with ID "subscribersTableBody" not found.');
            return;
        }

        const isGeneralUser = this.currentUser && this.currentUser.role === 'User';

        if (subscribers.length === 0) {
            const colspan = isGeneralUser ? 9 : 10;
            this.dom.subscribersTableBody.innerHTML = `<tr><td colspan="${colspan}" class="text-center">沒有找到符合條件的訂閱者。</td></tr>`;
            return;
        }

        const rows = subscribers.map((subscriber, index) => {
            if (index === 0) console.log('First subscriber data:', subscriber);
            const isChecked = this.selectAllMatching || this.selectedSubscribers.has(subscriber.id);

            // 提取所有分類名稱
            const categoryNames = subscriber.categories ? subscriber.categories.map(c => c.name).join(', ') : '';

            return `
                <tr data-id="${subscriber.id}" class="${isChecked ? 'selected' : ''}">
                    ${!isGeneralUser ? `<td><input type="checkbox" class="subscriber-checkbox" data-id="${subscriber.id}" ${isChecked ? 'checked' : ''}></td>` : ''}
                    <td>${subscriber.email || ''}</td>
                    <td>${subscriber.firstName || ''} ${subscriber.lastName || ''}</td>
                    <td>${subscriber.companyName || ''}</td>
                    <td>${subscriber.country || ''}</td>
                    <td>${subscriber.city || ''}</td>
                    <td>${this.getStatusText(subscriber.status)}</td>
                    <td>${categoryNames}</td>
                    <td>${this.formatDate(subscriber.created_at)}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="action-btn edit btn-edit" data-id="${subscriber.id}">編輯</button>
                            ${!isGeneralUser ? `<button class="action-btn delete btn-delete" data-id="${subscriber.id}">刪除</button>` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        this.dom.subscribersTableBody.innerHTML = rows;

        // Update Select All checkbox state based on current page selection
        const allSelected = this.selectAllMatching || (this.allSubscribers.length > 0 && this.allSubscribers.every(s => this.selectedSubscribers.has(s.id)));
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
            { id: 'country', name: '營業單位', required: false },
            { id: 'city', name: '城市', required: false },
            { id: 'tags', name: '標籤 (逗號分隔)', required: false, description: '多個標籤請用半形逗號分隔，例如: "VIP, 2024活動"' },
            { id: 'categories', name: '分類 (逗號分隔)', required: false, description: '填寫系統中已存在的分類名稱，例如: "企劃-電商名單20210701"' },
            { id: 'status', name: '狀態 (預設為 Active)', required: false }
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

    async checkDuplicates() {
        const emailMapping = this.importState.mapping['email'];
        // Get all emails from the import data
        const emails = this.importState.data
            .map(row => row[emailMapping])
            .filter(email => email && typeof email === 'string' && email.trim() !== '')
            .map(email => email.trim());
        
        const uniqueEmails = [...new Set(emails)];
        
        if (uniqueEmails.length === 0) {
            this.importState.duplicates = { count: 0, duplicates: [] };
            return;
        }

        const response = await window.apiClient.request('/subscribers/check-duplicates', {
            method: 'POST',
            body: { emails: uniqueEmails }
        });

        if (response.success) {
            this.importState.duplicates = response.data;
        } else {
            throw new Error(response.message || '無法檢查重複資料');
        }
    }

    async nextImportStep() {
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

            try {
                this.showLoadingState();
                await this.checkDuplicates();
                this.importState.step = 3;
                this.renderImportPreview();
            } catch (error) {
                console.error('Check duplicates error:', error);
                this.showError('檢查重複資料失敗: ' + error.message);
                return;
            } finally {
                this.hideLoadingState();
            }
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
            // 隱藏 tags 和 categories 欄位映射，防止混淆
            if (field.id === 'tags' || field.id === 'categories') {
                return;
            }

            const currentMapping = this.importState.mapping[field.id] || '';
            
            html += `
                <div class="mapping-row">
                    <div class="system-field ${field.required ? 'required' : ''}">
                        ${field.name}
                        ${field.description ? `<div class="text-muted small mt-1" style="font-size: 0.85em; font-weight: normal; color: #6c757d;">${field.description}</div>` : ''}
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

            // 將全域分類設定插入到城市欄位下方
            if (field.id === 'city') {
                html += `
                    <div class="mapping-row global-category-row" style="background-color: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 5px; border: 1px dashed #dee2e6;">
                        <div class="system-field">
                            <label class="form-label mb-0" style="font-weight: bold; color: #0d6efd;">全域設定: 加入分類</label>
                            <div class="text-muted small mt-1">將所有匯入對象加入此分類</div>
                        </div>
                        <div class="arrow"><i class="fas fa-level-down-alt" style="transform: rotate(90deg);"></i></div>
                        <div class="file-field">
                            <select class="form-select" id="importTargetCategory" onchange="window.subscribersManager.updateImportTargetCategory(this.value)">
                                <option value="">(不指定)</option>
                                ${this.generateCategoryOptions()}
                            </select>
                        </div>
                    </div>
                `;
            }
        });

        html += '</div>';

        container.innerHTML = html;
        
        // Restore selected value if any
        if (this.importState.targetCategoryId) {
            const select = document.getElementById('importTargetCategory');
            if (select) select.value = this.importState.targetCategoryId;
        }
    }

    generateCategoryOptions() {
        let options = '';
        for (const type in this.categoryGroups) {
            const group = this.categoryGroups[type];
            if (group.categories && group.categories.length > 0) {
                options += `<optgroup label="${group.name}">`;
                options += group.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
                options += `</optgroup>`;
            }
        }
        return options;
    }

    updateImportTargetCategory(value) {
        this.importState.targetCategoryId = value ? parseInt(value) : null;
    }

    updateMapping(fieldId, value) {
        if (value) {
            this.importState.mapping[fieldId] = value;
        } else {
            delete this.importState.mapping[fieldId];
        }
    }

    renderImportPreview() {
        const container = document.querySelector('#importModal #importPreview');
        if (!container) {
            console.error('Import preview container not found');
            return;
        }

        // Ensure container is visible
        container.style.display = 'block';

        const previewData = this.importState.data.slice(0, 5); // 顯示前 5 筆
        const mapping = this.importState.mapping;

        let html = '';

        // 總是顯示重複處理選項，方便用戶選擇覆蓋
        const duplicateCount = (this.importState.duplicates && this.importState.duplicates.count) || 0;
        const hasDuplicates = duplicateCount > 0;
        
        // 如果有重複資料，強制用戶選擇
        // 如果沒有重複資料，預設選中"跳過" (其實不影響，因為都是新增)
        const defaultChecked = hasDuplicates ? '' : 'checked';
        
        html += `
            <div class="alert alert-${hasDuplicates ? 'warning' : 'info'}">
                <div class="d-flex">
                    <i class="fas fa-${hasDuplicates ? 'exclamation-triangle' : 'info-circle'} me-3 mt-1" style="font-size: 1.5rem;"></i>
                    <div>
                        <h5 class="alert-heading">${hasDuplicates ? `發現 ${duplicateCount} 筆重複的 Email 資料` : '匯入設定'}</h5>
                        <p class="mb-2">若匯入的 Email 已存在於系統中，請選擇處理方式：</p>
                        
                        <div class="form-check mb-1">
                            <input class="form-check-input" type="radio" name="importDuplicateAction" id="actionSkip" value="skip" ${defaultChecked} onchange="window.subscribersManager.handleDuplicateActionChange()">
                            <label class="form-check-label" for="actionSkip">
                                跳過重複資料 (保留舊資料，不進行變更)
                            </label>
                        </div>
                        <div class="form-check">
                            <input class="form-check-input" type="radio" name="importDuplicateAction" id="actionOverwrite" value="overwrite" onchange="window.subscribersManager.handleDuplicateActionChange()">
                            <label class="form-check-label" for="actionOverwrite">
                                覆蓋現有資料 (使用新匯入的資料更新姓名、電話等資訊)
                            </label>
                        </div>
                    </div>
                </div>
            </div>
        `;

        html += `
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

        // 更新匯入按鈕狀態
        this.handleDuplicateActionChange();
    }

    handleDuplicateActionChange() {
        const importBtn = document.getElementById('importBtn');
        if (!importBtn) return;

        const selected = document.querySelector('input[name="importDuplicateAction"]:checked');
        if (selected) {
            importBtn.disabled = false;
            importBtn.title = '';
        } else {
            importBtn.disabled = true;
            importBtn.title = '請先選擇重複資料處理方式';
        }
    }

    getFieldName(fieldId) {
        const field = this.getSystemFields().find(f => f.id === fieldId);
        return field ? field.name : fieldId;
    }

    async executeImport() {
        // UI Elements for progress
        const progressContainer = document.getElementById('importProgressContainer');
        const progressBar = document.getElementById('importProgressBar');
        const progressText = document.getElementById('importProgressText');
        const progressPercent = document.getElementById('importProgressPercent');
        const actionButtons = document.getElementById('importActionButtons');
        const closeBtn = document.querySelector('#importModal .modal-close');

        // Helper to update progress
        const updateProgress = (processed, total) => {
            const percent = Math.round((processed / total) * 100);
            if (progressBar) progressBar.style.width = `${percent}%`;
            if (progressPercent) progressPercent.innerText = `${percent}%`;
            if (progressText) progressText.innerText = `正在匯入 ${processed} / ${total} 筆...`;
        };

        try {
            this.showLoadingState();
            
            // Get overwrite setting
            const overwriteRadio = document.querySelector('input[name="importDuplicateAction"]:checked');
            const overwrite = overwriteRadio ? overwriteRadio.value === 'overwrite' : false;

            // 準備資料
            // 簡單的 Email 格式驗證
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

            const rawData = this.importState.data.map(row => {
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
            }).filter(item => item.email && item.email.trim() !== ''); // 過濾掉沒有 Email 的資料

            // 分離有效和無效的 Email
            const importData = [];
            const invalidData = [];

            rawData.forEach(item => {
                if (emailRegex.test(item.email)) {
                    importData.push(item);
                } else {
                    invalidData.push(item);
                }
            });

            if (importData.length === 0) {
                this.showError('沒有有效的資料可匯入 (所有資料均無效或缺少 Email)');
                this.hideLoadingState();
                return;
            }

            // Show Progress UI
            if (progressContainer) progressContainer.style.display = 'block';
            if (actionButtons) actionButtons.style.display = 'none';
            if (closeBtn) closeBtn.style.display = 'none'; // Prevent closing during import
            updateProgress(0, importData.length);

            // Batch Processing
            const BATCH_SIZE = 500;
            const total = importData.length;
            const finalResults = {
                success: 0,
                updated: 0,
                failed: 0,
                duplicates: 0,
                errors: []
            };

            for (let i = 0; i < total; i += BATCH_SIZE) {
                const chunk = importData.slice(i, i + BATCH_SIZE);
                
                try {
                    const response = await window.apiClient.request('/subscribers/bulk-import', {
                        method: 'POST',
                        body: { 
                            subscribers: chunk,
                            overwrite: overwrite,
                            targetCategoryId: this.importState.targetCategoryId
                        }
                    });

                    if (response.success) {
                        const result = response.data;
                        finalResults.success += result.success || 0;
                        finalResults.updated += result.updated || 0;
                        finalResults.duplicates += result.duplicates || 0;
                        finalResults.failed += result.failed || 0;
                        if (result.errors && result.errors.length > 0) {
                            finalResults.errors.push(...result.errors);
                        }
                    } else {
                        finalResults.failed += chunk.length;
                        finalResults.errors.push(`Batch ${i/BATCH_SIZE + 1} failed: ${response.message}`);
                    }
                } catch (err) {
                    console.error(`Batch import error at index ${i}:`, err);
                    finalResults.failed += chunk.length;
                    finalResults.errors.push(`Batch ${i/BATCH_SIZE + 1} error: ${err.message}`);
                }

                updateProgress(Math.min(i + chunk.length, total), total);
            }

            // Reset UI
            if (progressContainer) progressContainer.style.display = 'none';
            if (actionButtons) actionButtons.style.display = 'block';
            if (closeBtn) closeBtn.style.display = 'block';

            // Show Results
            let message = `匯入完成：成功新增 ${finalResults.success} 筆`;
            
            if (finalResults.updated > 0) {
                message += `，更新 ${finalResults.updated} 筆`;
            }

            if (finalResults.duplicates > 0) {
                message += `，重複跳過 ${finalResults.duplicates} 筆`;
            }

            if (finalResults.failed > 0) {
                message += `，失敗 ${finalResults.failed} 筆`;
                console.warn('匯入失敗項目:', finalResults.errors);
                if (finalResults.errors.length > 0) {
                        message += `\n(首個錯誤: ${finalResults.errors[0]})`;
                }
            }

            if (invalidData.length > 0) {
                message += `\n(另有 ${invalidData.length} 筆 Email 格式錯誤已自動跳過)`;
            }
            
            this.showSuccess(message);
            this.closeModal('importModal');
            this.loadData(); // 重新載入列表

        } catch (error) {
            console.error('Import error:', error);
            this.showError('匯入過程發生錯誤: ' + (error.message || '未知錯誤'));
            
            // Ensure UI is reset on error
            if (progressContainer) progressContainer.style.display = 'none';
            if (actionButtons) actionButtons.style.display = 'block';
            if (closeBtn) closeBtn.style.display = 'block';
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
