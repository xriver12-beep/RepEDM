// EDM管理頁面 JavaScript

class TemplatesManager {
    constructor() {
        this.templates = [];
        this.categories = [];
        this.currentFilters = {
            page: 1,
            limit: 10,
            search: '',
            categoryId: '',
            scope: 'all', // all, my, public
            sortBy: 'created_at',
            sortOrder: 'desc'
        };
        this.isLoading = false;
        this.init();
    }

    async init() {
        try {
            this.setupEventListeners();
            this.setupDynamicSectionListeners(); // Add this
            await this.loadCategories();
            this.setupDetailModalListeners();
            this.setupFileUploadListeners();
            // Initial render of dynamic sections based on default values (1, 0, 0)
            this.renderDynamicSections(); 
            await this.loadTemplates();
            this.updateStats(); 
        } catch (error) {
            console.error('Initialization failed:', error);
            this.showToast('初始化失敗: ' + error.message, 'error');
        }
    }

    setupDynamicSectionListeners() {
        ['section1Count', 'section2Count', 'section3Count'].forEach(id => {
            const select = document.getElementById(id);
            if (select) {
                select.addEventListener('change', () => {
                    this.renderDynamicSections();
                });
            }
        });
    }

    renderDynamicSections() {
        const containerInputs = document.getElementById('dynamicSectionsInputs');
        const containerPreviews = document.getElementById('dynamicSectionsPreviews');
        if (!containerInputs || !containerPreviews) return;

        // Helper to create input group HTML
        // IDs must match loadUrl expectations: ${type}Upload and ${type}Url
        const createInputHTML = (section, article) => `
            <div class="form-group dynamic-article" data-section="${section}" data-article="${article}">
                <label>第 ${section} 區塊 - 文章 ${article}</label>
                <input type="file" id="section${section}_article${article}Upload" accept="image/*,.html,.htm" class="file-input">
                <div class="url-input-group" style="display: flex; gap: 5px; margin-top: 5px;">
                    <input type="text" id="section${section}_article${article}Url" class="form-input" placeholder="或輸入網址" style="flex: 1;">
                    <button type="button" class="btn btn-sm btn-info" onclick="templatesManager.loadUrl('section${section}_article${article}')">載入</button>
                </div>
            </div>
        `;

        // Helper to create preview HTML
        // ID must match loadUrl expectation: preview${Type} (capitalized)
        const createPreviewHTML = (section, article) => `
            <div id="previewSection${section}_article${article}" class="dynamic-preview" data-section="${section}" data-article="${article}" style="margin: 0; line-height: 0;">
                <img src="" alt="Preview S${section} A${article}" style="max-width: 100%; display: none;">
                <iframe class="html-preview" style="display: none; width: 100%; border: none; overflow: hidden;" scrolling="no"></iframe>
                <div class="placeholder" style="padding: 40px; background: #fff; border-top: 1px dashed #ccc; border-bottom: 1px dashed #ccc; line-height: normal;">
                    第 ${section} 區塊 - 文章 ${article} 預覽
                </div>
            </div>
        `;

        // We want to preserve existing inputs/previews to avoid losing state when other sections change
        // But simplified: Just re-render everything based on current counts.
        // To preserve state, we could detach elements and re-attach, but that's complex.
        // For now, let's just clear and rebuild. 
        // OPTIMIZATION: Check if specific section count changed?
        // Actually, let's try to be smart.
        
        // Strategy: Iterate 1 to 3. For each section, check target count.
        // Sync DOM to match target count.
        
        for (let s = 1; s <= 3; s++) {
            const count = parseInt(document.getElementById(`section${s}Count`).value) || 0;
            
            // Sync Inputs
            for (let a = 1; a <= 5; a++) {
                const inputId = `section${s}_article${a}Upload`;
                const existingInputGroup = containerInputs.querySelector(`.dynamic-article[data-section="${s}"][data-article="${a}"]`);
                
                if (a <= count) {
                    if (!existingInputGroup) {
                        // Create
                        const div = document.createElement('div');
                        div.innerHTML = createInputHTML(s, a).trim(); // trim to avoid text node
                        const newGroup = div.firstChild;
                        
                        // Insert in correct order?
                        // Simple append to container is fine if we process s=1..3, a=1..5 in order
                        // But since we might have mixed existing nodes, we should use appendChild (moves existing) or insertBefore.
                        // To ensure order:
                        containerInputs.appendChild(newGroup);
                        
                        // Bind listener
                        this.bindFileUploadListener(inputId, `previewSection${s}_article${a}`);
                    } else {
                         // Ensure order
                         containerInputs.appendChild(existingInputGroup);
                    }
                } else {
                    if (existingInputGroup) {
                        existingInputGroup.remove();
                    }
                }

                // Sync Previews
                const previewId = `previewSection${s}_article${a}`;
                const existingPreview = containerPreviews.querySelector(`.dynamic-preview[data-section="${s}"][data-article="${a}"]`);
                
                if (a <= count) {
                     if (!existingPreview) {
                        const div = document.createElement('div');
                        div.innerHTML = createPreviewHTML(s, a).trim();
                        const newPreview = div.firstChild;
                        containerPreviews.appendChild(newPreview);
                     } else {
                        containerPreviews.appendChild(existingPreview);
                     }
                } else {
                    if (existingPreview) {
                        existingPreview.remove();
                    }
                }
            }
        }
    }

    bindFileUploadListener(inputId, previewId) {
        const input = document.getElementById(inputId);
        if (!input) return;
        
        // Remove existing listeners? Cloning node is easiest way to strip listeners
        // but we want to keep properties.
        // Actually, adding multiple listeners is fine if we don't duplicate.
        // But since we create new elements in renderDynamicSections, we are fine.
        // If element existed, we didn't recreate it, so listener persists.
        // So we only need to call this for NEW elements.
        
        input.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            try {
                const result = await this.readFile(file);
                const container = document.getElementById(previewId);
                const img = container.querySelector('img');
                const htmlPreview = container.querySelector('.html-preview');
                const placeholder = container.querySelector('.placeholder');

                if (img) img.style.display = 'none';
                if (htmlPreview) {
                    htmlPreview.style.display = 'none';
                    htmlPreview.innerHTML = '';
                }
                if (placeholder) placeholder.style.display = 'none';

                if (result.type === 'image') {
                    if (img) {
                        img.src = result.content;
                        img.style.display = 'block';
                        img.style.margin = '0 auto';
                    }
                } else {
                    if (htmlPreview) {
                        htmlPreview.style.display = 'block';
                        const doc = htmlPreview.contentWindow.document;
                        doc.open();
                        
                        let content = result.content;
                        if (!content.toLowerCase().includes('<html')) {
                            content = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;"><center>${content}</center></body></html>`;
                        } else {
                            content = content.replace(/<body([^>]*)>/i, '<body$1 style="margin:0;padding:0;"><center>');
                            content = content.replace(/<\/body>/i, '</center></body>');
                        }
                        
                        doc.write(content);
                        doc.close();
                        
                        // Auto resize
                        const resize = () => {
                            const height = doc.documentElement.scrollHeight || doc.body.scrollHeight;
                            if (height > 0) htmlPreview.style.height = height + 'px';
                        };
                        setTimeout(resize, 100);
                        htmlPreview.onload = resize;
                        const imgs = doc.getElementsByTagName('img');
                        for(let img of imgs) img.onload = resize;
                    }
                }
            } catch (err) {
                console.error('Preview error', err);
                this.showToast('無法預覽檔案', 'error');
            }
        });
    }

    setupFileUploadListeners() {
        this.bindFileUploadListener('headerUpload', 'previewHeader');
        this.bindFileUploadListener('footerUpload', 'previewFooter');
        // Main upload is now dynamic, handled in renderDynamicSections
    }

    setupEventListeners() {
        // 搜尋功能
        const searchInput = document.getElementById('searchInput');
        const searchBtn = document.getElementById('searchBtn');
        
        if (searchInput) {
            // Debounce search
            let timeout;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    this.currentFilters.search = e.target.value;
                    this.currentFilters.page = 1;
                    this.loadTemplates();
                }, 500);
            });
        }
        
        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                this.currentFilters.search = searchInput.value;
                this.currentFilters.page = 1;
                this.loadTemplates();
            });
        }

        // 分類標籤 (Tabs)
        const categoryTabs = document.getElementById('categoryTabs');
        if (categoryTabs) {
            categoryTabs.addEventListener('click', (e) => {
                if (e.target.classList.contains('tab-btn')) {
                    // Update UI
                    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
                    e.target.classList.add('active');

                    // Update filters
                    const category = e.target.dataset.category;
                    if (['all', 'my', 'public'].includes(category)) {
                        this.currentFilters.scope = category;
                        this.currentFilters.categoryId = '';
                    } else {
                        this.currentFilters.scope = 'all'; // Or keep previous scope? Let's reset to all for simplicity
                        this.currentFilters.categoryId = category;
                    }
                    this.currentFilters.page = 1;
                    this.loadTemplates();
                }
            });
        }

        // 建立EDM按鈕
        const createTemplateBtn = document.getElementById('createTemplateBtn');
        if (createTemplateBtn) {
            createTemplateBtn.addEventListener('click', () => {
                this.showCreateTemplateModal();
            });
        }

        // 分類管理按鈕
        const manageCategoriesBtn = document.getElementById('manageCategoriesBtn');
        if (manageCategoriesBtn) {
            manageCategoriesBtn.addEventListener('click', () => {
                this.showCategoryManager();
            });
        }

        // 新增分類按鈕
        const addCategoryBtn = document.getElementById('addCategoryBtn');
        if (addCategoryBtn) {
            addCategoryBtn.addEventListener('click', () => {
                this.addCategory();
            });
        }

        // 匯入EDM按鈕
        const importTemplateBtn = document.getElementById('importTemplateBtn');
        if (importTemplateBtn) {
            importTemplateBtn.addEventListener('click', () => {
                this.showImportTemplateModal();
            });
        }

        // 匯入EDM表單
        const importForm = document.getElementById('importTemplateForm');
        if (importForm) {
            importForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleImportSubmit(e);
            });
        }

        // 分頁按鈕
        const prevPageBtn = document.getElementById('prevPage');
        const nextPageBtn = document.getElementById('nextPage');
        
        if (prevPageBtn) {
            prevPageBtn.addEventListener('click', () => {
                if (this.currentFilters.page > 1) {
                    this.currentFilters.page--;
                    this.loadTemplates();
                }
            });
        }
        
        if (nextPageBtn) {
            nextPageBtn.addEventListener('click', () => {
                if (this.totalPages && this.currentFilters.page < this.totalPages) {
                    this.currentFilters.page++;
                    this.loadTemplates();
                }
            });
        }

        // 模態框關閉
        document.querySelectorAll('.modal-close, .modal, .modal-cancel').forEach(el => {
            el.addEventListener('click', (e) => {
                // Prevent closing when clicking backdrop of createTemplateModal
                if (e.target === el && el.id === 'createTemplateModal') {
                    return;
                }

                if (e.target === el || e.target.classList.contains('modal-close') || e.target.classList.contains('modal-cancel')) {
                    this.closeModal();
                }
            });
        });

        // 綁定預覽按鈕事件
        ['header', 'main', 'footer'].forEach(section => {
            const btn = document.getElementById(`preview${section.charAt(0).toUpperCase() + section.slice(1)}Btn`);
            if (btn) {
                btn.addEventListener('click', () => {
                    const urlInput = document.getElementById(`${section}Url`);
                    if (urlInput && urlInput.value) {
                        this.loadUrl(section, urlInput.value);
                    }
                });
            }
        });

        // 另存新EDM按鈕
        const saveAsBtn = document.getElementById('saveAsTemplateBtn');
        if (saveAsBtn) {
            saveAsBtn.addEventListener('click', (e) => {
                this.handleTemplateSaveAs(e);
            });
        }

        // 表單提交
        const createForm = document.getElementById('createTemplateForm');
        if (createForm) {
            createForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleTemplateSubmit(e);
            });
        }
    }

    async loadCategories() {
        try {
            const response = await apiClient.get(API_ENDPOINTS.templates.categories);
            if (response.success) {
                this.categories = response.data;
                this.renderCategoryTabs();
                this.renderCategorySelect();
            }
        } catch (error) {
            console.error('Failed to load categories:', error);
            this.showToast('載入分類失敗', 'error');
        }
    }

    renderCategoryTabs() {
        const tabsContainer = document.getElementById('categoryTabs');
        if (!tabsContainer) return;

        // Keep existing static tabs (All, My, Public)
        // They are already in HTML, so we just append dynamic ones or ensure they exist
        // But re-rendering might duplicate if not careful. 
        // Let's clear and rebuild to be safe, or just append.
        
        // Rebuild base structure
        tabsContainer.innerHTML = `
            <button class="tab-btn ${this.currentFilters.scope === 'all' && !this.currentFilters.categoryId ? 'active' : ''}" data-category="all">所有EDM</button>
            <button class="tab-btn ${this.currentFilters.scope === 'my' ? 'active' : ''}" data-category="my">我的EDM</button>
            <button class="tab-btn ${this.currentFilters.scope === 'public' ? 'active' : ''}" data-category="public">公共EDM</button>
        `;

        this.categories.forEach(cat => {
            const isActive = this.currentFilters.categoryId == cat.id; // loose equality for string/number
            const btn = document.createElement('button');
            btn.className = `tab-btn ${isActive ? 'active' : ''}`;
            btn.dataset.category = cat.id;
            btn.textContent = cat.name;
            tabsContainer.appendChild(btn);
        });
    }

    // Old setupFileUploadListeners removed


    async loadUrl(type) {
        const inputId = `${type}Url`;
        const urlInput = document.getElementById(inputId);
        if (!urlInput || !urlInput.value) return;

        const url = urlInput.value;
        const btn = urlInput.nextElementSibling;
        const originalText = btn.textContent;
        btn.textContent = '載入中...';
        btn.disabled = true;

        try {
            const response = await apiClient.post('/templates/fetch-url', { url });
            if (response.success) {
                const result = response.data;
                const previewId = `preview${type.charAt(0).toUpperCase() + type.slice(1)}`;
                
                // Store loaded content in a way that submit handler can pick it up
                // We'll attach it to the file input element as a custom property 'loadedContent'
                const fileInput = document.getElementById(`${type}Upload`);
                if (fileInput) {
                    fileInput.loadedContent = result;
                    fileInput.value = ''; // Clear file selection
                }

                // Update UI
                const container = document.getElementById(previewId);
                const img = container.querySelector('img');
                const htmlPreview = container.querySelector('.html-preview');
                const placeholder = container.querySelector('.placeholder');

                if (img) {
                    img.style.display = 'none';
                    img.src = ''; // Clear src to prevent broken image icon if display leaks
                }
                if (htmlPreview) {
                    htmlPreview.style.display = 'none';
                    // clear iframe content
                    const doc = htmlPreview.contentWindow.document;
                    doc.open();
                    doc.write('');
                    doc.close();
                }
                if (placeholder) placeholder.style.display = 'none';

                if (result.type === 'image') {
                    if (img) {
                        img.src = result.content;
                        img.style.display = 'block';
                        img.style.margin = '0 auto';
                    }
                } else {
                    if (htmlPreview) {
                        htmlPreview.style.display = 'block';
                        const doc = htmlPreview.contentWindow.document;
                        doc.open();
                        
                        // We rely on backend to rewrite URLs to absolute, so we don't inject base tag anymore
                        // to avoid CSP "base-uri 'self'" violation.
                        // However, we still handle basic HTML structure wrapping if needed.
                        let content = result.content;
                        if (!content.toLowerCase().includes('<html')) {
                             content = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;"><center>${content}</center></body></html>`;
                        } else {
                             // Inject margin reset
                             content = content.replace(/<body([^>]*)>/i, '<body$1 style="margin:0;padding:0;"><center>');
                             content = content.replace(/<\/body>/i, '</center></body>');
                        }

                        doc.write(content);
                        doc.close();
                        
                        // Auto resize iframe
                        const resize = () => {
                            const height = doc.documentElement.scrollHeight || doc.body.scrollHeight;
                            if (height > 0) htmlPreview.style.height = height + 'px';
                        };
                        // Initial
                        setTimeout(resize, 100);
                        // On load
                        htmlPreview.onload = resize;
                        // On images load
                        const imgs = doc.getElementsByTagName('img');
                        for(let img of imgs) {
                            img.onload = resize;
                        }
                    }
                }
                
                this.showToast('載入成功', 'success');
            }
        } catch (e) {
            console.error('URL load error', e);
            this.showToast('載入失敗: ' + e.message, 'error');
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }

    renderCategorySelect() {
        const select = document.getElementById('templateCategory');
        if (select) {
            select.innerHTML = '<option value="">未分類</option>' + 
                this.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        }
        
        // Update filter dropdown if it exists
        const filter = document.getElementById('categoryFilter');
        if (filter) {
             filter.innerHTML = '<option value="">所有分類</option>' + 
                this.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        }

        // Update editor category dropdown
        const editorSelect = document.getElementById('editorTemplateCategory');
        if (editorSelect) {
            editorSelect.innerHTML = '<option value="">未分類</option>' + 
                this.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        }
    }

    setupDetailModalListeners() {
        // Tab switching in Detail Modal
        const detailTabs = document.querySelector('.template-detail-tabs');
        if (detailTabs) {
            detailTabs.addEventListener('click', (e) => {
                if (e.target.classList.contains('tab-btn')) {
                    // Update active tab button
                    detailTabs.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
                    e.target.classList.add('active');

                    // Show corresponding content
                    const tabName = e.target.dataset.tab;
                    const modalBody = document.querySelector('#templateDetailModal .modal-body');
                    if (modalBody) {
                        modalBody.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
                        const activePane = modalBody.querySelector(`#${tabName}`);
                        if (activePane) activePane.classList.add('active');
                    }
                }
            });
        }

        // Device preview switching 已移除，預設僅顯示桌面預覽

        // Edit button in detail modal
        const editBtn = document.getElementById('editTemplateBtn');
        if (editBtn) {
            editBtn.addEventListener('click', () => {
                const id = editBtn.dataset.id;
                if (id) {
                    this.closeModal('templateDetailModal');
                    this.editTemplate(id);
                }
            });
        }
    }

    async showTemplateDetail(id, tab = 'overview') {
        try {
            const response = await apiClient.get(API_ENDPOINTS.templates.update(id)); // Reuse GET /templates/:id
            if (response.success) {
                const t = response.data;
                
                // Populate Overview
                const setText = (id, text) => {
                    const el = document.getElementById(id);
                    if (el) el.textContent = text || '-';
                };
                
                setText('detailName', t.name);
                setText('detailCategory', t.categoryName);
                
                const statusEl = document.getElementById('detailStatus');
                if (statusEl) {
                    statusEl.textContent = t.isActive ? '啟用' : '停用';
                    statusEl.className = `status-badge ${t.isActive ? 'status-active' : 'status-inactive'}`;
                }
                
                setText('detailCreated', FormatUtils.formatDate(t.createdAt));
                setText('detailModified', FormatUtils.formatDate(t.updatedAt));
                setText('detailUsageCount', t.usageCount || 0); // Assuming API returns usage count

                // Populate Content
                setText('detailSubject', t.subject);
                setText('detailHtmlContent', t.htmlContent);
                setText('detailTextContent', t.textContent || '無純文字內容');

                // Populate Preview
                const iframe = document.getElementById('previewIframe');
                if (iframe) {
                    // Use srcdoc or write to doc
                    // iframe.srcdoc = t.htmlContent || ''; 
                    // Better cross-browser way:
                    const doc = iframe.contentWindow.document;
                    doc.open();
                    doc.write(t.htmlContent || '');
                    doc.close();
                }

                // Show Modal
                this.showModal('templateDetailModal');

                // Switch to requested tab
                const tabBtn = document.querySelector(`.template-detail-tabs .tab-btn[data-tab="${tab}"]`);
                if (tabBtn) tabBtn.click();

                // Set ID for edit button
                const editBtn = document.getElementById('editTemplateBtn');
                if (editBtn) editBtn.dataset.id = t.id;

            }
        } catch (error) {
            console.error('Failed to load template detail:', error);
            this.showToast('無法載入EDM詳情', 'error');
        }
    }

    async updateStats() {
        console.log('Stats: Updating stats...');
        try {
            const response = await apiClient.get('/templates/stats', { _t: Date.now() });
            console.log('Stats response:', response);
            if (response.success && response.data) {
                const stats = response.data;
                const totalEl = document.querySelector('.stat-value[data-stat="total"]');
                const publishedEl = document.querySelector('.stat-value[data-stat="published"]');
                const draftsEl = document.querySelector('.stat-value[data-stat="drafts"]');
                const usedEl = document.querySelector('.stat-value[data-stat="used"]');

                if (totalEl) totalEl.textContent = stats.total || 0;
                if (publishedEl) publishedEl.textContent = stats.published || 0;
                if (draftsEl) draftsEl.textContent = stats.drafts || 0;
                if (usedEl) usedEl.textContent = stats.used || 0;
            } else {
                console.error('Stats update failed: Response unsuccessful or no data');
            }
        } catch (error) {
            console.error('Failed to update stats:', error);
        }
    }

    async loadTemplates() {
        if (this.isLoading) return;
        this.isLoading = true;

        const listContainer = document.getElementById('templatesList');
        if (listContainer) {
            listContainer.innerHTML = '<tr><td colspan="7" class="text-center">載入中...</td></tr>';
        }

        try {
            const response = await apiClient.get(API_ENDPOINTS.templates.list, this.currentFilters);
            
            if (response.success) {
                // Handle new response structure { data: { templates: [], pagination: {} } }
                if (response.data && response.data.templates) {
                    this.templates = response.data.templates;
                    if (response.data.pagination) {
                        this.updatePagination(response.data.pagination);
                    }
                } else if (Array.isArray(response.data)) {
                    this.templates = response.data;
                } else {
                    this.templates = [];
                }
                this.renderTemplates();
            } else {
                this.templates = [];
                this.renderTemplates();
            }
        } catch (error) {
            console.error('Failed to load templates:', error);
            if (listContainer) {
                listContainer.innerHTML = `<tr><td colspan="7" class="text-center text-danger">載入失敗: ${error.message}</td></tr>`;
            }
        } finally {
            this.isLoading = false;
        }
    }

    updatePagination(pagination) {
        const { page, limit, total, totalPages } = pagination;
        this.totalPages = totalPages; // Store for next/prev button logic
        
        // Update info text
        const infoEl = document.querySelector('.pagination-info');
        if (infoEl) {
            const start = total === 0 ? 0 : (page - 1) * limit + 1;
            const end = Math.min(page * limit, total);
            infoEl.textContent = `顯示 ${start}-${end} 項，共 ${total} 項`;
        }

        // Update buttons state
        const prevBtn = document.getElementById('prevPage');
        const nextBtn = document.getElementById('nextPage');
        
        if (prevBtn) prevBtn.disabled = page <= 1;
        if (nextBtn) nextBtn.disabled = page >= totalPages;
    }

    renderTemplates() {
        const templatesList = document.getElementById('templatesList');
        if (!templatesList) return;

        if (this.templates.length === 0) {
            templatesList.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 20px;">
                        沒有找到EDM
                    </td>
                </tr>
            `;
            return;
        }

        templatesList.innerHTML = this.templates.map(t => {
            const statusBadge = t.isActive 
                ? '<span class="badge badge-success">啟用</span>' 
                : '<span class="badge badge-secondary">停用</span>';
            
            const scopeBadge = t.isPublic
                ? '<span class="badge badge-info">公共</span>'
                : '<span class="badge badge-secondary">私有</span>';

            return `
            <tr>
                <td>
                    <div style="font-weight: bold;">${t.name}</div>
                    <div style="font-size: 0.85em; color: #666;">${t.subject || ''}</div>
                </td>
                <td>
                    ${t.categoryName ? `<span class="badge badge-primary">${t.categoryName}</span>` : '<span class="text-muted">未分類</span>'}
                </td>
                <td>
                    ${statusBadge}
                    ${scopeBadge}
                </td>
                <td>
                    <div>${FormatUtils.formatDate(t.createdAt)}</div>
                    <div style="font-size: 0.8em; color: #888;">by ${t.createdByName || 'Unknown'}</div>
                </td>
                <td>
                    <div class="btn-group">
                         <button class="btn btn-sm btn-info" onclick="templatesManager.showTemplateDetail(${t.id}, 'preview')">
                            預覽
                        </button>
                    </div>
                </td>
                <td>
                    <div class="btn-group">
                        <button class="btn btn-sm btn-outline" onclick="templatesManager.editTemplate(${t.id})">
                            修改
                        </button>
                    </div>
                </td>
                <td>
                    <div class="btn-group">
                        <button class="btn btn-sm btn-danger" onclick="templatesManager.deleteTemplate(${t.id})">
                            刪除
                        </button>
                    </div>
                </td>
            </tr>
        `}).join('');
    }

    async handleTemplateSaveAs(e) {
        const form = document.getElementById('createTemplateForm');
        if (!form) return;

        // 手動驗證表單
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const originalId = this.currentEditId;
        this.currentEditId = null; // 強制設為建立模式 (null ID)

        try {
            // 模擬事件對象
            await this.handleTemplateSubmit({ target: form, preventDefault: () => {} });
        } finally {
            // 恢復原始 ID (如果需要)
            this.currentEditId = originalId;
        }
    }

    async handleTemplateSubmit(e) {
        const form = e.target;
        const formData = new FormData(form);
        
        // Basic validation
        const name = formData.get('name');
        if (!name) {
            this.showToast('請輸入EDM名稱', 'error');
            return;
        }

        const subject = formData.get('subject');
        if (!subject) {
            this.showToast('請輸入EDM主旨', 'error');
            return;
        }

        const payload = {
            name: name,
            subject: subject,
            categoryId: formData.get('categoryId') || null,
            isPublic: formData.get('isPublic') === 'on',
            templateType: 'email'
        };
        
        try {
            // Handle file uploads (Client-side Base64 for now)
            
            const headerUpload = document.getElementById('headerUpload');
            const footerUpload = document.getElementById('footerUpload');

            const headerFile = headerUpload.files[0];
            const footerFile = footerUpload.files[0];

            const getSectionContent = async (file, inputEl, previewId) => {
                // 1. New file uploaded
                if (file) {
                    return this.readFile(file);
                } 
                // 2. URL loaded content
                else if (inputEl && inputEl.loadedContent) {
                    return inputEl.loadedContent;
                }
                // 3. Fallback: Existing content from Preview (for Edit or SaveAs)
                else {
                    const container = document.getElementById(previewId);
                    if (container) {
                        const img = container.querySelector('img');
                        const iframe = container.querySelector('.html-preview');
                        
                        if (img && img.style.display !== 'none' && img.src && img.src.length > 50) {
                            return { type: 'image', content: img.src };
                        }
                        if (iframe && iframe.style.display !== 'none') {
                            try {
                                const doc = iframe.contentWindow.document;
                                // Get content from body, keeping the structure we see in preview
                                return { type: 'html', content: doc.body.innerHTML };
                            } catch(e) {
                                console.warn('Preview fallback failed', e);
                            }
                        }
                    }
                }
                return null;
            };

            const headerContent = await getSectionContent(headerFile, headerUpload, 'previewHeader');
            const footerContent = await getSectionContent(footerFile, footerUpload, 'previewFooter');

            // Gather Dynamic Sections
            const dynamicContents = [];
            for(let s=1; s<=3; s++) {
                for(let a=1; a<=5; a++) {
                    const inputId = `section${s}_article${a}Upload`;
                    const previewId = `previewSection${s}_article${a}`;
                    const inputEl = document.getElementById(inputId);
                    
                    // If input exists (meaning it's selected in UI)
                    if (inputEl) {
                        const content = await getSectionContent(inputEl.files[0], inputEl, previewId);
                        if (content) {
                            dynamicContents.push({ s, a, content });
                        }
                    }
                }
            }

            // Check if this is a "Raw Import" (Raw HTML) case
            // If we have importedHtmlContent, and NO standard sections are active (or detected), use raw content.
            // We check if header/footer/dynamicContents are empty or if importedHtmlContent matches previewHeader content.
            
            let useRawImport = false;
            if (this.importedHtmlContent) {
                 // Check if dynamic sections are empty
                 if (dynamicContents.length === 0) {
                     // Check if header/footer are effectively just wrappers or empty
                     // Actually, if populateTemplateForm put the content into header, headerContent will contain it.
                     // But headerContent will be wrapped in <div class="header">...</div> by processSection later.
                     // We want to avoid that wrapper if it's a raw import.
                     useRawImport = true;
                 }
            }

            // Add main image to payload for list view thumbnail if it's an image
            // Try to find first image from dynamic sections, or header
            let mainImageContent = null;
            if (dynamicContents.length > 0) {
                const firstImg = dynamicContents.find(d => d.content.type === 'image');
                if (firstImg) mainImageContent = firstImg.content;
            }
            if (!mainImageContent && headerContent && headerContent.type === 'image') {
                mainImageContent = headerContent;
            }

            if (mainImageContent && mainImageContent.content) {
                payload.mainImage = mainImageContent.content;
            } else if (this.currentEditId) {
                // Keep existing main image logic if editing (handled by backend usually if not provided)
            }

            // Construct HTML
            // Remove max-width restriction to allow full width banners (like 900px)
            let htmlContent = '';
            
            if (useRawImport) {
                htmlContent = this.importedHtmlContent;
            } else {
                htmlContent = '<div style="width: 100%; margin: 0 auto; font-family: Arial, sans-serif; line-height: normal;">';
                
                const processSection = (contentObj, sectionName) => {
                    if (!contentObj) return '';
    
                    if (contentObj.type === 'image') {
                        // Use display: block to remove bottom gap of inline images
                        // Outlook extra space fix: add font-size: 0px
                        return `<div class="${sectionName}" style="margin: 0; padding: 0; line-height: 0; font-size: 0px;"><img src="${contentObj.content}" style="width: 100%; display: block; border: 0;"></div>`;
                    } else {
                        // HTML Content
                        let fullHtml = contentObj.content;
                        let innerContent = fullHtml;
                        let wrapperStyle = 'margin: 0; padding: 0;';
                        let styles = '';
    
                        // Extract styles to preserve them
                        const styleMatches = fullHtml.match(/<style[^>]*>[\s\S]*?<\/style>/gi);
                        if (styleMatches) {
                            styles = styleMatches.join('\n');
                        }
                        
                        // Extract body content and attributes
                        const bodyMatch = fullHtml.match(/<body([^>]*)>([\s\S]*)<\/body>/i);
                        if (bodyMatch) {
                            const attrs = bodyMatch[1];
                            innerContent = bodyMatch[2];
                            
                            // Try to preserve background color/image from body
                            const bgcolor = attrs.match(/bgcolor=["']?([^"'\s>]+)["']?/i);
                            if (bgcolor) wrapperStyle += `background-color: ${bgcolor[1]};`;
                            
                            const bg = attrs.match(/background=["']?([^"'\s>]+)["']?/i);
                            if (bg) wrapperStyle += `background-image: url('${bg[1]}');`;
                        }
                        
                        return `<div class="${sectionName}" style="${wrapperStyle}">${styles}${innerContent}</div>`;
                    }
                };
    
                htmlContent += processSection(headerContent, 'header');
                
                // Group dynamic contents by section
                const sections = { 1: [], 2: [], 3: [] };
                dynamicContents.forEach(item => {
                    if (sections[item.s]) sections[item.s].push(item);
                });
    
                // Section 1: Stacked (Horizontal Split)
                sections[1].forEach(item => {
                    htmlContent += processSection(item.content, `section${item.s}_article${item.a}`);
                });

                // Section 2: Side-by-side (Vertical Split) - "直切區塊"
                if (sections[2].length > 0) {
                    htmlContent += '<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:0; padding:0; border-collapse: collapse;"><tr>';
                    const widthPercent = Math.floor(100 / sections[2].length);
                    
                    sections[2].forEach(item => {
                        htmlContent += `<td valign="top" width="${widthPercent}%" style="padding:0; margin:0; vertical-align: top;">`;
                        htmlContent += processSection(item.content, `section${item.s}_article${item.a}`);
                        htmlContent += '</td>';
                    });
                    htmlContent += '</tr></table>';
                }
    
                // Section 3: Stacked (Horizontal Split)
                sections[3].forEach(item => {
                    htmlContent += processSection(item.content, `section${item.s}_article${item.a}`);
                });
    
                htmlContent += processSection(footerContent, 'footer');
    
                htmlContent += '</div>';
            }
            
            payload.htmlContent = htmlContent;
            payload.textContent = 'EDM Template: ' + payload.name; // Simple text fallback

            let response;
            if (this.currentEditId) {
                response = await apiClient.put(API_ENDPOINTS.templates.update(this.currentEditId), payload);
            } else {
                response = await apiClient.post(API_ENDPOINTS.templates.create, payload);
            }

            if (response.success) {
                this.showToast(this.currentEditId ? '更新成功' : '建立成功', 'success');
                this.closeModal();
                this.loadTemplates();
                this.updateStats();
            } else {
                 this.showToast('操作失敗', 'error');
            }
        } catch (error) {
            console.error('Submit error:', error);
            this.showToast(error.message, 'error');
        }
    }
    
    // Helper to read file as DataURL or Text
    readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            const fileName = file.name.toLowerCase();
            
            if (file.type.match('image.*')) {
                reader.onload = () => resolve({ type: 'image', content: reader.result });
                reader.readAsDataURL(file);
            } else if (fileName.endsWith('.html') || fileName.endsWith('.htm')) {
                 reader.onload = () => resolve({ type: 'html', content: reader.result });
                 reader.readAsText(file);
            } else {
                 // Default treat as html/text if not image
                 reader.onload = () => resolve({ type: 'html', content: reader.result });
                 reader.readAsText(file);
            }
            
            reader.onerror = reject;
        });
    }

    async editTemplate(id) {
        try {
            const response = await apiClient.get(API_ENDPOINTS.templates.update(id)); // Reuse update endpoint which is /templates/:id
            if (response.success) {
                const t = response.data;
                this.currentEditId = t.id;
                this.populateTemplateForm(t);
                document.getElementById('modalTitle').textContent = '修改EDM';
                this.showModal('createTemplateModal');
            }
        } catch (error) {
            console.error(error);
            this.showToast('載入EDM詳情失敗', 'error');
        }
    }

    populateTemplateForm(t) {
        // Clear any stale state
        if (this.resetPreviews) this.resetPreviews();
        
        const form = document.getElementById('createTemplateForm');
        if (form) {
            form.elements['name'].value = t.name || '';
            if (form.elements['subject']) {
                form.elements['subject'].value = t.subject || '';
            }
            if (form.elements['categoryId']) {
                form.elements['categoryId'].value = t.categoryId || '';
            }
            if (form.elements['isPublic']) {
                form.elements['isPublic'].checked = t.isPublic || false;
            }
            
            // Parse HTML Content to extract parts for preview
            const parser = new DOMParser();
            const doc = parser.parseFromString(t.htmlContent || '', 'text/html');
            
            // Infer counts for dynamic sections
            const counts = [0, 0, 0];
            let hasSections = false;

            for(let s=1; s<=3; s++) {
                for(let a=1; a<=5; a++) {
                    // Look for class sectionS_articleA
                    if (doc.querySelector(`.section${s}_article${a}`)) {
                        counts[s-1] = a;
                        hasSections = true;
                    }
                }
            }

            // Check if standard header/footer exist
            const hasHeader = !!doc.querySelector('.header');
            const hasFooter = !!doc.querySelector('.footer');

            // If no standard sections found (Raw HTML Import), treat entire content as Header preview
            if (!hasSections && !hasHeader && !hasFooter && t.htmlContent && t.htmlContent.length > 0) {
                 // Force clear counts
                 counts[0] = 0;
                 counts[1] = 0;
                 counts[2] = 0;
                 
                 // Update Selects
                 document.getElementById('section1Count').value = 0;
                 document.getElementById('section2Count').value = 0;
                 document.getElementById('section3Count').value = 0;
                 
                 this.renderDynamicSections();

                 // Manually set previewHeader to full content
                 const container = document.getElementById('previewHeader');
                 if (container) {
                    const img = container.querySelector('img');
                    const htmlPreview = container.querySelector('.html-preview');
                    const placeholder = container.querySelector('.placeholder');

                    if (img) img.style.display = 'none';
                    if (placeholder) placeholder.style.display = 'none';
                    if (htmlPreview) {
                        htmlPreview.style.display = 'block';
                        const iframeDoc = htmlPreview.contentWindow.document;
                        iframeDoc.open();
                        iframeDoc.write(t.htmlContent);
                        iframeDoc.close();
                        
                        // Resize
                        const resize = () => {
                            const height = iframeDoc.documentElement.scrollHeight || iframeDoc.body.scrollHeight;
                            if (height > 0) htmlPreview.style.height = height + 'px';
                        };
                        setTimeout(resize, 100);
                        htmlPreview.onload = resize;
                    }
                 }
                 return;
            }
            
            // Standard Processing
            
            // Update Selects
            document.getElementById('section1Count').value = counts[0];
            document.getElementById('section2Count').value = counts[1];
            document.getElementById('section3Count').value = counts[2];
            
            // Re-render inputs based on inferred counts
            this.renderDynamicSections();

            const updatePreview = (partClass, containerId) => {
                const partEl = doc.querySelector(`.${partClass}`);
                const container = document.getElementById(containerId);
                if (!container) return;

                const img = container.querySelector('img');
                const htmlPreview = container.querySelector('.html-preview');
                const placeholder = container.querySelector('.placeholder');
                
                // Reset
                if (img) {
                    img.style.display = 'none';
                    img.src = '';
                }
                if (htmlPreview) {
                    htmlPreview.style.display = 'none';
                    htmlPreview.style.height = '0px';
                }
                if (placeholder) placeholder.style.display = 'flex';

                if (partEl) {
                    // Check if it's an image-only wrapper
                    const innerImg = partEl.querySelector('img');
                    // Heuristic: if it has an img and little text
                    if (innerImg && partEl.textContent.trim().length < 5) {
                        if (img) {
                            img.src = innerImg.src;
                            img.style.display = 'block';
                            img.style.margin = '0 auto';
                        }
                        if (placeholder) placeholder.style.display = 'none';
                    } else {
                        // It's HTML content
                        if (htmlPreview) {
                            htmlPreview.style.display = 'block';
                            const iframeDoc = htmlPreview.contentWindow.document;
                            iframeDoc.open();
                            
                            let content = partEl.innerHTML;
                            let bodyStyle = 'margin:0;padding:0;';
                            
                            // Transfer background styles from the wrapper div to the body
                            if (partEl.style.backgroundColor) bodyStyle += `background-color:${partEl.style.backgroundColor};`;
                            if (partEl.style.backgroundImage) bodyStyle += `background-image:${partEl.style.backgroundImage};`;
                            
                            content = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="${bodyStyle}"><center>${content}</center></body></html>`;
                            
                            iframeDoc.write(content);
                            iframeDoc.close();
                            
                            // Resize
                            const resize = () => {
                                const height = iframeDoc.documentElement.scrollHeight || iframeDoc.body.scrollHeight;
                                if (height > 0) htmlPreview.style.height = height + 'px';
                            };
                            setTimeout(resize, 100);
                            htmlPreview.onload = resize;
                            const imgs = iframeDoc.getElementsByTagName('img');
                            for(let img of imgs) img.onload = resize;
                        }
                        if (placeholder) placeholder.style.display = 'none';
                    }
                }
            };

            updatePreview('header', 'previewHeader');
            updatePreview('footer', 'previewFooter');
            
            // Update dynamic section previews
            for(let s=1; s<=3; s++) {
                for(let a=1; a<=5; a++) {
                    if (a <= counts[s-1]) {
                        updatePreview(`section${s}_article${a}`, `previewSection${s}_article${a}`);
                    }
                }
            }
        }
    }

    async deleteTemplate(id) {
        if (!confirm('確定要刪除此EDM嗎？')) return;
        
        try {
            const response = await apiClient.delete(API_ENDPOINTS.templates.delete(id));
            if (response.success) {
                this.showToast('刪除成功', 'success');
                this.loadTemplates();
                this.updateStats();
            }
        } catch (error) {
            this.showToast('刪除失敗: ' + error.message, 'error');
        }
    }

    async exportTemplates() {
        if (!this.templates || this.templates.length === 0) {
            this.showToast('沒有EDM可匯出', 'warning');
            return;
        }

        try {
            // 準備匯出資料
            const exportData = this.templates.map(t => ({
                'ID': t.id,
                '名稱': t.name,
                '主旨': t.subject || '',
                '分類': t.categoryName || '未分類',
                '狀態': t.isActive ? '啟用' : '停用',
                '公開': t.isPublic ? '是' : '否',
                '建立時間': FormatUtils.formatDate(t.createdAt),
                '建立者': t.createdByName || 'Unknown'
            }));

            // 使用 XLSX 庫建立工作表
            if (typeof XLSX === 'undefined') {
                throw new Error('Excel 匯出庫未載入');
            }

            const ws = XLSX.utils.json_to_sheet(exportData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Templates");

            // 產生檔名
            const dateStr = new Date().toISOString().slice(0, 10);
            const fileName = `templates_export_${dateStr}.xlsx`;

            // 下載檔案
            XLSX.writeFile(wb, fileName);
            this.showToast('匯出成功', 'success');
        } catch (error) {
            console.error('Export error:', error);
            this.showToast('匯出失敗: ' + error.message, 'error');
        }
    }

    async loadDefaultAssets() {
        // 使用與「文中標準EDM」完全一致的 HTML 結構與樣式
        // 參考 backend/scripts/add_standard_template_v2.js
        
        const wrapperStyle = 'margin:0; padding:0; background-color:#ffffff; background-image:url(\'https://www.winton.com.tw/winton/edm/model/sale/images/pattern.gif\');';

        const headerHtml = `<div class="header" style="${wrapperStyle}">
    <center>
        <table border="0" width="900" id="table9" cellspacing="0" cellpadding="0" style="margin:0; padding:0; border-collapse:collapse;">
            <tr>
                <td style="padding:0; margin:0; line-height:0; font-size:0;"><map name="FPMap0">
                <area target="_blank" coords="18, 16, 276, 60" shape="rect" href="http://www.winton.com.tw">
                </map>
                <img border="0" src="https://www.winton.com.tw/winton/edm/model/sale/images/head_900px.jpg" width="900" height="82" usemap="#FPMap0" style="display:block; border:0; vertical-align:bottom;"></td>
            </tr>
        </table>
    </center>
</div>`;

        const footerHtml = `<div class="footer" style="${wrapperStyle}">
    <center>
        <table border="0" width="900" id="table13" cellspacing="0" cellpadding="0" style="margin:0; padding:0; border-collapse:collapse;">
            <tr>
                <td style="padding:0; margin:0; line-height:0; font-size:0;">
                <img border="0" src="https://www.winton.com.tw/winton/edm/model/sale/images/b.gif" width="900" height="18" style="display:block; border:0; vertical-align:bottom;"></td>
            </tr>
            <tr>
                <td bgcolor="#3474E9" style="padding:0; margin:0;">
                <p align="center" style="margin:0; padding: 10px 0; line-height: 1.5;">
                <font color="#FFFFFF"><span style="font-family: 新細明體"><font size="2">
                § 隱私權聲明 § </font></span><span lang="EN-US" style="font-family: Times New Roman"><font size="2"><br>
                </font></span><span style="font-family: 新細明體"><font size="2">為表示對您個人隱私的尊重與保障，您的資料僅提供文中資訊作為行銷用途，絕對保密，不會提供第三者或轉作其他用途。<br>
                如您點選【我不要再收到商品訊息郵件】，我們將會把您的資料由電子郵件名單中刪除！文中資訊版權所有，未經確認授權，嚴禁轉貼節錄。</font></span></font></td>
            </tr>
            <tr>
                <td bgcolor="#3474E9" style="padding:0; margin:0;">
                <p align="center" style="margin:0; padding: 5px 0; line-height: 1.5;"><font size="2"><strong style="font-weight: 400">
                <font color="#FFFFFF">
                <font color="#FFFFFF">&nbsp;&nbsp;</font>
                <a href="{{unsubscribe_url}}" target="_blank" style="text-decoration:none;">
                <font color="#FFFFFF" face="新細明體">【我不要再收到商品訊息郵件】</font></a>
                <a href="mailto:hrsales@winton.com.tw?subject=我要修改電子郵件地址" style="text-decoration:none;">
                <font color="#FFFFFF">【
                我要修改電子信箱】</font></a></font></strong></font></td>
            </tr>
            <tr>
                <td bgcolor="#3474E9" style="padding:0; margin:0;">
                <p align="center" style="margin:0; padding: 10px 0; line-height: 1.5;"><span style="font-family: 新細明體,serif; color: #FFF500;"><font size="2">
                <span><b>本信函為系統自動發出，請勿直接回覆電子郵件至此帳號</b></span><font color="#FFFFFF">，若您有任何問題或者需要更進一步的諮詢服務，<br>
                請至文中網站 </font><span lang="EN-US">
                <a title="https://www.winton.com.tw/" style="color: #FFFFFF; text-decoration: underline" href="https://www.winton.com.tw/">
                https://www.winton.com.tw</a><font color="#FFFFFF"> </font></span>
                <font color="#FFFFFF">尋求協助。</font></font></span></td>
            </tr>
            <tr>
                <td bgcolor="#CCCCCC" style="padding:0; margin:0; line-height:0; font-size:0;">
                <img border="0" src="https://www.winton.com.tw/winton/edm/model/sale/images/foot_SE_900px.jpg" width="900" height="89" style="display:block; border:0; vertical-align:bottom;"></td>
            </tr>
        </table>
    </center>
</div>`;

        const setContent = (type, content) => {
            this.updatePreviewContent(type, content);
            const fileInput = document.getElementById(`${type}Upload`);
            if (fileInput) {
                fileInput.loadedContent = { type: 'html', content: content };
            }
        };

        setContent('header', headerHtml);
        setContent('footer', footerHtml);
    }

    updatePreviewContent(type, content) {
        const containerId = `preview${type.charAt(0).toUpperCase() + type.slice(1)}`;
        const container = document.getElementById(containerId);
        if (!container) return;

        const img = container.querySelector('img');
        const htmlPreview = container.querySelector('.html-preview');
        const placeholder = container.querySelector('.placeholder');

        if (img) img.style.display = 'none';
        if (placeholder) placeholder.style.display = 'none';

        if (htmlPreview) {
            htmlPreview.style.display = 'block';
            const doc = htmlPreview.contentWindow.document;
            doc.open();
            
            if (!content.toLowerCase().includes('<html')) {
                 content = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;"><center>${content}</center></body></html>`;
            }
            
            doc.write(content);
            doc.close();
            
            const resize = () => {
                const height = doc.documentElement.scrollHeight || doc.body.scrollHeight;
                if (height > 0) htmlPreview.style.height = height + 'px';
            };
            setTimeout(resize, 100);
            htmlPreview.onload = resize;
            const imgs = doc.getElementsByTagName('img');
            for(let img of imgs) img.onload = resize;
        }
    }

    resetPreviews() {
        ['header', 'main', 'footer'].forEach(section => {
            const containerId = `preview${section.charAt(0).toUpperCase() + section.slice(1)}`;
            const container = document.getElementById(containerId);
            if (container) {
                const img = container.querySelector('img');
                const htmlPreview = container.querySelector('.html-preview');
                const placeholder = container.querySelector('.placeholder');
                
                if (img) {
                    img.style.display = 'none';
                    img.src = '';
                }
                if (htmlPreview) {
                    htmlPreview.style.display = 'none';
                    try {
                        const doc = htmlPreview.contentWindow.document;
                        doc.open(); doc.write(''); doc.close();
                    } catch(e) {}
                }
                if (placeholder) placeholder.style.display = 'flex';
            }
            
            const input = document.getElementById(`${section}Upload`);
            if (input) delete input.loadedContent;
        });
    }

    showCreateTemplateModal() {
        this.currentEditId = null;
        const form = document.getElementById('createTemplateForm');
        if (form) {
            form.reset();
            this.resetPreviews();
            this.loadDefaultAssets();
            document.getElementById('modalTitle').textContent = '建立新EDM';
            this.showModal('createTemplateModal');
        }
    }

    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('show');
            // Remove inline display if present to let CSS take over, 
            // OR if the CSS requires display:flex, classList.add('show') should handle it if defined in CSS.
            // Based on components.css: .modal.show { display: flex; }
            modal.style.display = ''; 
            document.body.style.overflow = 'hidden';
        }
    }

    closeModal() {
        document.querySelectorAll('.modal, .modal-overlay').forEach(el => {
            el.classList.remove('show');
            el.style.display = ''; // Clear inline styles
        });
        document.body.style.overflow = '';
    }
    
    handleFilePreview(e, section) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = document.querySelector(`#preview${section.charAt(0).toUpperCase() + section.slice(1)} img`);
            const placeholder = document.querySelector(`#preview${section.charAt(0).toUpperCase() + section.slice(1)} .placeholder`);
            if (img) {
                img.src = e.target.result;
                img.style.display = 'block';
                img.style.margin = '0 auto';
            }
            if (placeholder) {
                placeholder.style.display = 'none';
            }
        };
        reader.readAsDataURL(file);
    }

    showImportTemplateModal() {
        const form = document.getElementById('importTemplateForm');
        if (form) {
            form.reset();
            this.showModal('importTemplateModal');
        }
    }

    async handleImportSubmit(e) {
        const fileInput = document.getElementById('importFile');
        const file = fileInput.files[0];
        
        if (!file) {
            this.showToast('請選擇檔案', 'error');
            return;
        }

        try {
            let templateData = {};
            const fileName = file.name.toLowerCase();

            if (fileName.endsWith('.json')) {
                const content = await this.readTextFile(file);
                try {
                    templateData = JSON.parse(content);
                } catch (err) {
                    throw new Error('JSON 格式錯誤');
                }
            } else if (fileName.endsWith('.zip') || fileName.endsWith('.html') || fileName.endsWith('.htm')) {
                // Upload to server for parsing (supports HTML and ZIP)
                const formData = new FormData();
                formData.append('file', file);
                
                this.showToast('正在處理檔案...', 'info');
                const response = await apiClient.post(API_ENDPOINTS.templates.upload, formData);
                
                if (response.success) {
                    templateData = {
                        name: file.name.replace(/\.[^/.]+$/, ""),
                        subject: 'Imported: ' + file.name,
                        htmlContent: response.html_content
                    };
                } else {
                    throw new Error(response.message || '上傳解析失敗');
                }
            } else {
                throw new Error('不支援的檔案格式');
            }

            this.closeModal();
            this.showCreateTemplateModal();
            
            setTimeout(() => {
                const form = document.getElementById('createTemplateForm');
                if (form) {
                    this.populateTemplateForm(templateData);
                    this.importedHtmlContent = templateData.htmlContent;
                    this.showToast('EDM已載入，請確認後儲存', 'success');
                }
            }, 100);

        } catch (error) {
            console.error('Import failed:', error);
            this.showToast('匯入失敗: ' + error.message, 'error');
        }
    }

    readTextFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    updatePagination(pagination) {
        if (!pagination) return;
        
        const prevBtn = document.getElementById('prevPage');
        const nextBtn = document.getElementById('nextPage');
        const pageInfo = document.querySelector('.pagination-info');
        const pageNumbers = document.querySelector('.page-numbers');
        
        if (prevBtn) prevBtn.disabled = pagination.page <= 1;
        if (nextBtn) nextBtn.disabled = pagination.page >= pagination.totalPages;
        
        if (pageInfo) {
            const start = (pagination.page - 1) * this.currentFilters.limit + 1;
            const end = Math.min(pagination.page * this.currentFilters.limit, pagination.total);
            pageInfo.textContent = `顯示 ${start}-${end} 項，共 ${pagination.total} 項`;
        }

        if (pageNumbers) {
            let html = '';
            for (let i = 1; i <= pagination.totalPages; i++) {
                if (i === pagination.page) {
                    html += `<span class="page-number active" style="padding: 5px 10px; margin: 0 2px; border: 1px solid #007bff; background: #007bff; color: white; border-radius: 4px; display: inline-block;">${i}</span>`;
                } else {
                     if (i === 1 || i === pagination.totalPages || (i >= pagination.page - 2 && i <= pagination.page + 2)) {
                        html += `<button class="page-number" onclick="templatesManager.goToPage(${i})" style="padding: 5px 10px; margin: 0 2px; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer;">${i}</button>`;
                    } else if (i === pagination.page - 3 || i === pagination.page + 3) {
                        html += `<span class="page-ellipsis" style="margin: 0 5px;">...</span>`;
                    }
                }
            }
            pageNumbers.innerHTML = html;
        }
        
        this.currentFilters.page = pagination.page;
        this.totalPages = pagination.totalPages;
    }

    goToPage(page) {
        this.currentFilters.page = page;
        this.loadTemplates();
    }

    showToast(message, type = 'info') {
        // Assuming there is a global toast function or implement simple one
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toast.style.position = 'fixed';
        toast.style.bottom = '20px';
        toast.style.right = '20px';
        toast.style.padding = '10px 20px';
        toast.style.background = type === 'error' ? '#e74c3c' : '#2ecc71';
        toast.style.color = 'white';
        toast.style.borderRadius = '4px';
        toast.style.zIndex = '9999';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
    


    showCategoryManager() {
        const modal = document.getElementById('categoryManagerModal');
        if (modal) {
            this.renderCategoryList();
            modal.classList.add('show');
        }
    }

    renderCategoryList() {
        const list = document.getElementById('categoryList');
        if (list) {
            list.innerHTML = this.categories.map(c => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #eee;">
                    <span>${c.name} ${c.is_system ? '<span class="badge badge-secondary" style="font-size:0.7em">系統</span>' : ''}</span>
                    ${!c.is_system ? `<button class="btn btn-sm btn-danger" onclick="templatesManager.deleteCategory('${c.id}')">刪除</button>` : ''}
                </div>
            `).join('');
        }
    }

    async addCategory() {
        const input = document.getElementById('newCategoryName');
        const name = input.value.trim();
        if (name) {
            try {
                const response = await apiClient.post(API_ENDPOINTS.templates.categories, { name });
                if (response.success) {
                    this.showToast('分類新增成功', 'success');
                    input.value = '';
                    await this.loadCategories(); // Reload categories (will update tabs and select)
                    this.renderCategoryList();
                }
            } catch (error) {
                this.showToast('新增失敗: ' + error.message, 'error');
            }
        }
    }

    async deleteCategory(id) {
        if (!confirm('確定要刪除此分類嗎？')) return;
        
        try {
            const response = await apiClient.delete(`${API_ENDPOINTS.templates.categories}/${id}`);
            if (response.success) {
                this.showToast('分類刪除成功', 'success');
                await this.loadCategories();
                this.renderCategoryList();
            }
        } catch (error) {
            this.showToast('刪除失敗: ' + error.message, 'error');
        }
    }
}

// Initialize
const templatesManager = new TemplatesManager();
