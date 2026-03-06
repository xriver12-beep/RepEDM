document.addEventListener('DOMContentLoaded', () => {
    // Initialize API Service if available, otherwise mock it or assume global
    const api = window.apiService;

    // State
    let currentState = {
        page: 1,
        limit: 20,
        search: '',
        categoryId: '',
        view: 'grid' // 'grid' or 'list'
    };

    let categories = [];
    let currentAsset = null;

    // DOM Elements
    const elements = {
        assetsContainer: document.getElementById('assetsContainer'),
        pagination: document.getElementById('pagination'),
        searchInput: document.getElementById('assetSearch'),
        categoryFilter: document.getElementById('categoryFilter'),
        gridViewBtn: document.getElementById('gridViewBtn'),
        listViewBtn: document.getElementById('listViewBtn'),
        
        // Modals
        uploadModal: document.getElementById('uploadModal'),
        categoriesModal: document.getElementById('categoriesModal'),
        assetDetailModal: document.getElementById('assetDetailModal'),
        
        // Buttons
        uploadAssetBtn: document.getElementById('uploadAssetBtn'),
        manageCategoriesBtn: document.getElementById('manageCategoriesBtn'),
        uploadNewVersionBtn: document.getElementById('uploadNewVersionBtn'),
        
        // Upload Form
        uploadForm: document.getElementById('uploadForm'),
        fileInput: document.getElementById('fileInput'),
        dropZone: document.getElementById('dropZone'),
        filePreview: document.getElementById('filePreview'),
        uploadGroupId: document.getElementById('uploadGroupId'),
        
        // Category Form
        addCategoryForm: document.getElementById('addCategoryForm'),
        categoryList: document.getElementById('categoryList')
    };

    // --- Initialization ---
    init();

    async function init() {
        await loadCategories();
        loadAssets();
        setupEventListeners();
    }

    function setupEventListeners() {
        // Filter & View
        elements.searchInput.addEventListener('input', debounce(() => {
            currentState.search = elements.searchInput.value;
            currentState.page = 1;
            loadAssets();
        }, 500));

        elements.categoryFilter.addEventListener('change', () => {
            currentState.categoryId = elements.categoryFilter.value;
            currentState.page = 1;
            loadAssets();
        });

        elements.gridViewBtn.addEventListener('click', () => setView('grid'));
        elements.listViewBtn.addEventListener('click', () => setView('list'));

        // Modals
        elements.uploadAssetBtn.addEventListener('click', () => openUploadModal());
        elements.manageCategoriesBtn.addEventListener('click', () => openCategoriesModal());
        
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.target.closest('.modal').classList.remove('show');
            });
        });

        // Upload
        setupUploadHandlers();

        // Categories
        elements.addCategoryForm.addEventListener('submit', handleAddCategory);
        
        // Asset Actions
        document.getElementById('deleteAssetBtn').addEventListener('click', handleDeleteAsset);
        
        document.getElementById('copyLinkBtn').addEventListener('click', () => {
            if (currentAsset) {
                // Construct absolute URL
                const fullUrl = new URL(currentAsset.fileUrl, window.location.origin).href;
                navigator.clipboard.writeText(fullUrl).then(() => {
                    // Show a temporary tooltip or alert. Using alert for simplicity as requested.
                    alert('連結已複製到剪貼簿: ' + fullUrl);
                }).catch(err => {
                    console.error('Failed to copy: ', err);
                    alert('複製失敗');
                });
            }
        });

        elements.uploadNewVersionBtn.addEventListener('click', () => {
            if (currentAsset) {
                // Close detail modal, open upload modal with group_id
                elements.assetDetailModal.classList.remove('show');
                openUploadModal(currentAsset.group_id, currentAsset.category_id);
            }
        });
    }

    // --- Asset Loading & Display ---

    async function loadAssets() {
        showLoading();
        try {
            const params = {
                page: currentState.page,
                limit: currentState.limit,
                search: currentState.search,
                category_id: currentState.categoryId
            };
            
            const response = await api.get('/assets', params);
            if (response.success) {
                renderAssets(response.data.assets);
                renderPagination(response.data.pagination);
            }
        } catch (error) {
            console.error('Failed to load assets:', error);
            elements.assetsContainer.innerHTML = '<p class="text-center text-danger">載入失敗，請稍後再試</p>';
        }
    }

    function renderAssets(assets) {
        if (!assets || assets.length === 0) {
            elements.assetsContainer.innerHTML = '<div class="empty-state"><p>沒有找到素材</p></div>';
            return;
        }

        elements.assetsContainer.className = currentState.view === 'grid' ? 'assets-grid' : 'assets-list';
        
        elements.assetsContainer.innerHTML = assets.map(asset => {
            const isImage = asset.mime_type.startsWith('image/');
            const preview = isImage 
                ? `<img src="${asset.fileUrl}" alt="${asset.original_name}">`
                : `<i class="fas fa-file-alt file-icon"></i>`;

            if (currentState.view === 'grid') {
                return `
                    <div class="asset-card" data-id="${asset.id}">
                        <div class="asset-preview">${preview}</div>
                        <div class="asset-info">
                            <div class="asset-name" title="${asset.original_name}">${asset.original_name}</div>
                            <div class="asset-meta">
                                <span>${formatSize(asset.file_size)}</span>
                                <span class="asset-version-badge">v${asset.version}</span>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                return `
                    <div class="asset-list-item" data-id="${asset.id}">
                        <div class="list-preview">${preview}</div>
                        <div class="list-info">
                            <div>
                                <div class="asset-name">${asset.original_name}</div>
                                <small class="text-muted">${asset.category_name || 'General'}</small>
                            </div>
                            <div class="text-right">
                                <span class="asset-version-badge mr-2">v${asset.version}</span>
                                <small>${new Date(asset.created_at).toLocaleDateString()}</small>
                            </div>
                        </div>
                    </div>
                `;
            }
        }).join('');

        // Add click handlers
        document.querySelectorAll('.asset-card, .asset-list-item').forEach(el => {
            el.addEventListener('click', () => loadAssetDetail(el.dataset.id));
        });
    }

    // --- Asset Details ---

    async function loadAssetDetail(id) {
        try {
            // Since we don't have a single get endpoint that returns everything, we use the list data or fetch usage/versions
            // But we need the asset object. We can find it from the DOM or fetch it.
            // Let's assume we need to fetch fresh data or usage.
            
            // First, get basic info from the API (or find in current list if lazy)
            // But usage and versions are separate calls.
            // We'll just use the /assets?search=... or just fetch versions and usage and use what we have.
            // Wait, we should probably add GET /assets/:id. But I implemented GET /assets only.
            // I'll assume we can pass the data from the click if we store it, OR I should have added GET /assets/:id.
            // I did NOT add GET /assets/:id in the backend router explicitly (only /:id/versions).
            // Let's implement a quick client-side find since we have the list.
            // Update: Actually, looking at backend code, I missed GET /:id details.
            // However, I can get details from the list response if I stored it.
            // Ideally, backend should have GET /:id.
            // For now, I'll assume I can find it in the current loaded list.
            
            // Re-fetch list to find item is inefficient but robust enough for now if we didn't store global.
            // Actually, let's just use the `loadAssets` result if accessible.
            // To make it simple, I will fetch versions and usage, and use the list data for basic info.
            
            // Fetch usage and versions
            const [versionsRes, usageRes] = await Promise.all([
                api.get(`/assets/${id}/versions`),
                api.get(`/assets/${id}/usage`)
            ]);

            // We need basic info. Since we clicked on an item, we can try to find it in the container or better, store `assets` in a variable.
            // I'll rely on a quick search on the backend if needed, but since I didn't implement it, I'll iterate the DOM or just reload the list? No.
            // I'll change `renderAssets` to store the data.
            // Hack: I'll attach data to the DOM element.
            
            // Wait, I can just use the item from the list I just rendered. 
            // I need to save the current assets list.
            // Let's modify `loadAssets` to save to `currentAssetsList`.
            
        } catch (e) {
            console.error(e);
        }
    }
    
    // Improved loadAssetDetail
    // First, let's modify loadAssets to store data
    let currentAssetsList = [];
    // override loadAssets inner
    const originalRenderAssets = renderAssets;
    renderAssets = function(assets) {
        currentAssetsList = assets;
        originalRenderAssets(assets);
    };

    async function loadAssetDetail(id) {
        currentAsset = currentAssetsList.find(a => a.id === id);
        if (!currentAsset) return;

        // Populate Basic Info
        const modal = elements.assetDetailModal;
        const isImage = currentAsset.mime_type.startsWith('image/');
        
        document.getElementById('detailName').textContent = currentAsset.original_name;
        document.getElementById('detailCategory').textContent = currentAsset.category_name || 'General';
        document.getElementById('detailSize').textContent = formatSize(currentAsset.file_size);
        document.getElementById('detailType').textContent = currentAsset.mime_type;
        document.getElementById('detailUploader').textContent = currentAsset.uploader_name || 'Unknown';
        document.getElementById('detailDate').textContent = new Date(currentAsset.created_at).toLocaleString();
        document.getElementById('detailVersion').textContent = `v${currentAsset.version}`;
        document.getElementById('detailDescription').textContent = currentAsset.description || '無描述';
        
        const img = document.getElementById('detailImage');
        const icon = document.getElementById('detailFileIcon');
        
        if (isImage) {
            img.src = currentAsset.fileUrl;
            img.style.display = 'block';
            icon.style.display = 'none';
        } else {
            img.style.display = 'none';
            icon.style.display = 'flex';
        }

        document.getElementById('downloadBtn').href = currentAsset.fileUrl;

        modal.classList.add('show');

        // Load Async Data
        loadUsageStats(id);
        loadVersionHistory(id);
    }

    async function loadUsageStats(id) {
        const list = document.getElementById('usageList');
        const loading = document.getElementById('usageLoading');
        list.innerHTML = '';
        loading.style.display = 'block';

        try {
            const res = await api.get(`/assets/${id}/usage`);
            loading.style.display = 'none';
            
            if (res.success) {
                const { campaigns, templates } = res.data;
                
                if (campaigns.length === 0 && templates.length === 0) {
                    list.innerHTML = '<li>未使用</li>';
                    return;
                }

                campaigns.forEach(c => {
                    list.innerHTML += `<li><i class="fas fa-envelope"></i> 活動: <a href="campaigns.html?id=${c.CampaignID}">${c.Name}</a> (${c.Status})</li>`;
                });
                
                templates.forEach(t => {
                    list.innerHTML += `<li><i class="fas fa-file-code"></i> EDM: <a href="templates.html?id=${t.TemplateID}">${t.Name}</a></li>`;
                });
            }
        } catch (e) {
            loading.style.display = 'none';
            list.innerHTML = '<li class="text-danger">無法載入使用狀況</li>';
        }
    }

    async function loadVersionHistory(id) {
        const list = document.getElementById('versionList');
        list.innerHTML = '<li class="text-muted">載入中...</li>';
        
        try {
            const res = await api.get(`/assets/${id}/versions`);
            if (res.success) {
                list.innerHTML = res.data.map(v => `
                    <li>
                        <div class="d-flex justify-content-between">
                            <span>v${v.version} - ${new Date(v.created_at).toLocaleDateString()}</span>
                            <a href="${v.fileUrl}" target="_blank"><i class="fas fa-external-link-alt"></i></a>
                        </div>
                    </li>
                `).join('');
            }
        } catch (e) {
            list.innerHTML = '<li class="text-danger">無法載入版本歷史</li>';
        }
    }

    // --- Upload Logic ---

    function openUploadModal(groupId = null, categoryId = null) {
        elements.uploadForm.reset();
        elements.filePreview.style.display = 'none';
        elements.uploadGroupId.value = groupId || '';
        
        if (categoryId) {
            document.getElementById('uploadCategory').value = categoryId;
        } else if (elements.categoryFilter.value) {
            document.getElementById('uploadCategory').value = elements.categoryFilter.value;
        }

        if (groupId) {
            document.querySelector('#uploadModal h2').textContent = '上傳新版本';
        } else {
            document.querySelector('#uploadModal h2').textContent = '上傳素材';
        }
        
        elements.uploadModal.classList.add('show');
    }

    function setupUploadHandlers() {
        // File Input
        elements.dropZone.addEventListener('click', () => elements.fileInput.click());
        
        elements.fileInput.addEventListener('change', (e) => handleFileSelect(e.target.files[0]));
        
        // Drag & Drop
        elements.dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            elements.dropZone.classList.add('dragover');
        });
        
        elements.dropZone.addEventListener('dragleave', () => {
            elements.dropZone.classList.remove('dragover');
        });
        
        elements.dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            elements.dropZone.classList.remove('dragover');
            handleFileSelect(e.dataTransfer.files[0]);
        });

        // Form Submit
        elements.uploadForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // Check if file is selected (either via input or drag&drop)
            // If user used input, selectedFile might not be set if they didn't trigger change?
            // But change is triggered on selection.
            // Sync input files to selectedFile just in case
            if (elements.fileInput.files.length > 0) {
                selectedFile = elements.fileInput.files[0];
            }

            if (!selectedFile) {
                alert('請選擇檔案');
                return;
            }

            const additionalData = {
                category_id: document.getElementById('uploadCategory').value,
                description: document.getElementById('uploadDescription').value,
                group_id: elements.uploadGroupId.value
            };

            try {
                const res = await api.upload('/assets/upload', selectedFile, additionalData);
                if (res.success) {
                    alert('上傳成功');
                    elements.uploadModal.classList.remove('show');
                    loadAssets();
                    // Reset
                    elements.uploadForm.reset();
                    selectedFile = null;
                    elements.filePreview.style.display = 'none';
                }
            } catch (error) {
                console.error(error);
                alert('上傳失敗: ' + error.message);
            }
        });

        // Remove file
        document.querySelector('.remove-file').addEventListener('click', () => {
            selectedFile = null;
            elements.fileInput.value = '';
            elements.filePreview.style.display = 'none';
        });
    }

    let selectedFile = null;
    function handleFileSelect(file) {
        if (!file) return;
        selectedFile = file;
        
        // Update UI
        elements.filePreview.style.display = 'flex';
        elements.filePreview.querySelector('.file-name').textContent = file.name;
        elements.filePreview.querySelector('.file-size').textContent = formatSize(file.size);
    }

    // --- Category Management ---

    async function loadCategories() {
        try {
            const res = await api.get('/assets/categories');
            if (res.success) {
                categories = res.data;
                populateCategorySelects();
                renderCategoryList();
            }
        } catch (e) {
            console.error('Failed to load categories', e);
        }
    }

    function populateCategorySelects() {
        const options = categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        elements.categoryFilter.innerHTML = '<option value="">所有分類</option>' + options;
        document.getElementById('uploadCategory').innerHTML = '<option value="">選擇分類...</option>' + options;
    }

    function renderCategoryList() {
        elements.categoryList.innerHTML = categories.map(c => `
            <div class="category-item">
                <div>
                    <strong>${c.name}</strong>
                    <div class="text-muted small">${c.description || ''}</div>
                </div>
                <div class="category-actions">
                    <button class="delete-btn" onclick="deleteCategory(${c.id})"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `).join('');
    }

    function openCategoriesModal() {
        renderCategoryList();
        elements.categoriesModal.classList.add('show');
    }

    async function handleAddCategory(e) {
        e.preventDefault();
        const name = document.getElementById('newCategoryName').value;
        const description = document.getElementById('newCategoryDesc').value;
        
        try {
            const res = await api.post('/assets/categories', { name, description });
            if (res.success) {
                await loadCategories();
                elements.addCategoryForm.reset();
            }
        } catch (err) {
            alert('新增失敗: ' + err.message);
        }
    }

    // Expose delete to global
    window.deleteCategory = async (id) => {
        if (!confirm('確定要刪除此分類嗎？')) return;
        try {
            const res = await api.delete(`/assets/categories/${id}`);
            if (res.success) {
                await loadCategories();
            }
        } catch (err) {
            alert('刪除失敗: ' + err.message);
        }
    };

    // --- Utilities ---
    
    async function handleDeleteAsset() {
        if (!currentAsset || !confirm('確定要刪除此素材嗎？此操作無法復原。')) return;
        try {
            const res = await api.delete(`/assets/${currentAsset.id}`);
            if (res.success) {
                elements.assetDetailModal.classList.remove('show');
                loadAssets();
            }
        } catch (err) {
            alert('刪除失敗: ' + err.message);
        }
    }

    function showLoading() {
        elements.assetsContainer.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>載入中...</p></div>';
    }

    function formatSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function setView(view) {
        currentState.view = view;
        elements.gridViewBtn.classList.toggle('active', view === 'grid');
        elements.listViewBtn.classList.toggle('active', view === 'list');
        loadAssets(); // re-render
    }

    function renderPagination(pagination) {
        // Simple pagination
        let html = '';
        if (pagination.pages > 1) {
            html += `<button class="btn btn-sm btn-secondary" ${pagination.page === 1 ? 'disabled' : ''} onclick="changePage(${pagination.page - 1})">上一頁</button>`;
            html += `<span class="mx-2">第 ${pagination.page} / ${pagination.pages} 頁</span>`;
            html += `<button class="btn btn-sm btn-secondary" ${pagination.page === pagination.pages ? 'disabled' : ''} onclick="changePage(${pagination.page + 1})">下一頁</button>`;
        }
        elements.pagination.innerHTML = html;
    }

    window.changePage = (page) => {
        currentState.page = page;
        loadAssets();
    };

    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }
});
