// 活動管理頁面 JavaScript

/**
 * 活動管理模組 - 電子郵件行銷工具管理系統
 */
class CampaignManager {
    constructor() {
        console.log('🏗️ CampaignManager 構造函數開始執行');
        this.campaigns = [];
        this.templates = []; // EDM列表
        this.templateCategories = []; // EDM分類列表
        this.audienceCategories = []; // 受眾分類列表
        this.filteredCampaigns = [];
        this.selectedCampaigns = new Set();
        this.selectedCategoryIds = new Set(); // 初始化分類選擇 Set
        this.lastRange = null; // 用於保存編輯器選取範圍
        this.currentStep = 1;
        this.totalSteps = 4;
        this.itemsPerPage = 10;
        this.currentPage = 1;
        this.modals = new Map();
        this.editingCampaignId = null; // 用於編輯模式
        this.filters = {
            search: '',
            status: 'all',
            type: 'all'
        };

        // Template Pagination State
        this.currentTemplatePage = 1;
        this.templatesPerPage = 12; // Adjusted for smaller height (was 18)
        this.templateSearchQuery = '';
        this.currentTemplateCategory = 'all';

        console.log('🏗️ CampaignManager 構造函數完成，準備調用 init()');
        this.init();
    }

    async init() {
        await this.loadTemplates();
        // await this.loadCategories(); // Lazy load
        this.initializeDataTable();
        this.setupEventListeners();
        this.setupStepNavigation();
        this.loadCampaigns();
        this.loadStats();
        
        // Render initial templates
        this.renderCampaignTemplates();
    }

    async loadTemplates() {
        try {
            // Load categories from API
            const categoryResponse = await apiService.get('/templates/categories');
            if (categoryResponse.success && categoryResponse.data) {
                this.templateCategories = categoryResponse.data;
            } else {
                this.templateCategories = [];
            }
        } catch (e) {
            console.error('Failed to load categories from API', e);
            this.templateCategories = [];
        }

        // Ensure custom category exists (for blank/custom templates)
        if (!this.templateCategories.find(c => c.id === 'custom')) {
            this.templateCategories.push({ id: 'custom', name: '自訂/空白' });
        }

        try {
            // Load templates from API
            // We want all templates available to the user (my + public)
            const templateResponse = await apiService.get('/templates?scope=all&limit=100'); 
            
            if (templateResponse.success) {
                // Handle new response structure { data: { templates: [], pagination: {} } }
                let apiTemplates = [];
                if (templateResponse.data && templateResponse.data.templates) {
                    apiTemplates = templateResponse.data.templates;
                } else if (Array.isArray(templateResponse.data)) {
                    apiTemplates = templateResponse.data;
                }

                // Map API templates to local format if needed, or just use them
                // API returns: id, name, subject, templateType, isActive, isPublic, categoryId, mainImage...
                // campaigns.js expects: id, categoryId, name, description, mainImage...
                
                this.templates = apiTemplates.map(t => ({
                    id: t.id,
                    categoryId: t.categoryId || 'custom',
                    name: t.name,
                    description: t.subject || '', // subject as description
                    mainImage: t.mainImage || '',
                    content: t.content // content might not be in list response!
                }));
                
                // Note: The list API might not return the full content. 
                // If the user selects a template, we might need to fetch details.
                // But for now, let's assume we just need the list for display.
                // When selecting, we might need to fetch content if it's not here.
                
            } else {
                this.templates = [];
            }
        } catch (e) {
            console.error('Failed to load templates from API', e);
            this.templates = [];
        }

        // Add blank template
        this.templates.push({ 
            id: 'tpl_blank', 
            categoryId: 'custom', 
            name: '空白畫布', 
            description: '完全空白的編輯區域，適合自訂內容', 
            mainImage: '', 
            headerImage: '', 
            footerImage: '' 
        });
    }

    renderCampaignTemplates(categoryId = null) {
        if (categoryId) {
            this.currentTemplateCategory = categoryId;
            this.currentTemplatePage = 1; // Reset to first page on category change
        }

        const listContainer = document.getElementById('campaignTemplateList');
        const tabsContainer = document.getElementById('campaignTemplateCategories');
        
        if (!listContainer || !tabsContainer) return;

        // 1. 渲染分類 Tabs
        tabsContainer.innerHTML = `
            <button type="button" class="btn btn-sm btn-outline-primary ${this.currentTemplateCategory === 'all' ? 'active' : ''}" data-category="all">所有EDM</button>
            ${this.templateCategories.map(cat => `
                <button type="button" class="btn btn-sm btn-outline-primary ${this.currentTemplateCategory === cat.id ? 'active' : ''}" data-category="${cat.id}">${cat.name}</button>
            `).join('')}
        `;

        // 2. 過濾EDM (Category + Search)
        let filteredTemplates = this.templates;
        
        // Category Filter
        if (this.currentTemplateCategory !== 'all') {
            filteredTemplates = filteredTemplates.filter(t => String(t.categoryId) === String(this.currentTemplateCategory));
        }

        // Search Filter
        if (this.templateSearchQuery) {
            const query = this.templateSearchQuery.toLowerCase();
            filteredTemplates = filteredTemplates.filter(t => 
                t.name.toLowerCase().includes(query) || 
                (t.description && t.description.toLowerCase().includes(query))
            );
        }

        // 3. 分頁邏輯
        const totalItems = filteredTemplates.length;
        const totalPages = Math.ceil(totalItems / this.templatesPerPage);
        
        // Ensure current page is valid
        if (this.currentTemplatePage > totalPages) this.currentTemplatePage = totalPages || 1;
        if (this.currentTemplatePage < 1) this.currentTemplatePage = 1;

        const startIndex = (this.currentTemplatePage - 1) * this.templatesPerPage;
        const endIndex = Math.min(startIndex + this.templatesPerPage, totalItems);
        const pagedTemplates = filteredTemplates.slice(startIndex, endIndex);

        // 4. 渲染EDM列表
        if (filteredTemplates.length === 0) {
            listContainer.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 20px; color: #666;">
                    ${this.templateSearchQuery ? '找不到符合搜尋條件的EDM' : '此分類尚無EDM'}
                </div>
            `;
        } else {
            listContainer.innerHTML = pagedTemplates.map(t => `
                <div class="template-option" data-template-id="${t.id}">
                    <div class="template-preview">
                        <div class="template-image">
                            ${t.mainImage ? `<img src="${t.mainImage}" style="width: 100%; height: 100%; object-fit: cover;">` : '<span style="font-size: 1.5rem;">📝</span>'}
                        </div>
                        <div class="template-name" title="${t.name}">${t.name}</div>
                        <div class="template-desc" title="${t.description || ''}">${t.description || '無描述'}</div>
                    </div>
                </div>
            `).join('');
        }

        // 5. 渲染分頁控制
        this.renderTemplatePagination(totalItems, totalPages);

        // 重新綁定點擊事件
        this.bindTemplateClickEvents();
    }

    renderTemplatePagination(totalItems, totalPages) {
        const container = document.getElementById('campaignTemplatePagination');
        if (!container) return;

        if (totalItems <= this.templatesPerPage) {
            container.innerHTML = ''; // No pagination needed
            return;
        }

        let paginationHTML = `
            <button type="button" class="btn btn-sm btn-outline-secondary prev-page" ${this.currentTemplatePage === 1 ? 'disabled' : ''}>&lt;</button>
            <span class="align-self-center text-muted small">第 ${this.currentTemplatePage} / ${totalPages} 頁</span>
            <button type="button" class="btn btn-sm btn-outline-secondary next-page" ${this.currentTemplatePage === totalPages ? 'disabled' : ''}>&gt;</button>
        `;
        
        container.innerHTML = paginationHTML;

        // Bind events
        const prevBtn = container.querySelector('.prev-page');
        const nextBtn = container.querySelector('.next-page');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (this.currentTemplatePage > 1) {
                    this.currentTemplatePage--;
                    this.renderCampaignTemplates();
                }
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                if (this.currentTemplatePage < totalPages) {
                    this.currentTemplatePage++;
                    this.renderCampaignTemplates();
                }
            });
        }
    }

    bindTemplateClickEvents() {
        document.querySelectorAll('.template-option').forEach(el => {
            el.addEventListener('click', () => {
                if (this.viewingMode) return;
                document.querySelectorAll('.template-option').forEach(opt => opt.classList.remove('selected'));
                el.classList.add('selected');
                this.applyTemplate(el.dataset.templateId);
            });
        });

        // 綁定 Tab 點擊事件
        const tabs = document.querySelectorAll('#campaignTemplateCategories button');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                this.renderCampaignTemplates(tab.dataset.category);
            });
        });

        // Bind Search Input (if not already bound or just re-bind carefully)
        const searchInput = document.getElementById('templateSearchInput');
        if (searchInput && !searchInput.dataset.bound) {
            searchInput.dataset.bound = 'true';
            let debounceTimer;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    this.templateSearchQuery = e.target.value.trim();
                    this.currentTemplatePage = 1; // Reset to first page on search
                    this.renderCampaignTemplates();
                }, 300);
            });
        }
    }

    wrapWithOutlookFix(content) {
        return `
<table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
        <td align="center" valign="top" style="background-color: #ffffff;">
            <!--[if (gte mso 9)|(IE)]>
            <table width="600" align="center" cellpadding="0" cellspacing="0" border="0" style="border-spacing:0;">
            <tr>
            <td style="padding:0;">
            <![endif]-->
            <table border="0" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%; border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; margin: 0 auto;"><tr><td align="center" style="padding: 0;">${content}</td></tr></table>
            <!--[if (gte mso 9)|(IE)]>
            </td>
            </tr>
            </table>
            <![endif]-->
        </td>
    </tr>
</table>`;
    }

    async applyTemplate(templateId) {
        let template = this.templates.find(t => t.id == templateId);
        
        if (!template && templateId !== 'tpl_blank') {
            // Try to find in categories if strict match failed (e.g. string vs int)
            template = this.templates.find(t => t.id == templateId);
        }

        if (templateId === 'tpl_blank') {
             const input = document.getElementById('campaignTemplate');
             if (input) input.value = templateId;
             
             // ... existing blank logic ...
             const editor = document.getElementById('campaignContent');
             const sourceEditor = document.getElementById('campaignContentSource');
             if (editor) {
                 editor.innerHTML = '';
                 editor.dispatchEvent(new Event('input', { bubbles: true }));
             }
             if (sourceEditor) sourceEditor.value = '';
             NotificationUtils.show('已切換至空白畫布模式', 'success');
             return;
        }
        
        if (template) {
            const input = document.getElementById('campaignTemplate');
            if (input) input.value = templateId;

            const editor = document.getElementById('campaignContent');
            const sourceEditor = document.getElementById('campaignContentSource');

            let htmlContent = '';

            // If we have content directly (e.g. from API fetch details or previously loaded)
            if (template.content) {
                // Ensure content is wrapped with Outlook fix
                htmlContent = this.wrapWithOutlookFix(template.content);
            } else if (template.id && !template.id.toString().startsWith('tpl_')) {
                // It's likely an API template and we don't have content yet.
                try {
                    this.showLoading();
                    const response = await apiService.get(`/templates/${template.id}`);
                    if (response.success && response.data) {
                        // Backend returns { id, name, htmlContent, ... } or similar
                        
                        const rawContent = response.data.content || response.data.htmlContent || '';
                        // Wrap content in Outlook fix if not empty
                        if (rawContent) {
                            htmlContent = this.wrapWithOutlookFix(rawContent);
                        } else {
                            htmlContent = '';
                        }
                        
                        // Cache it so we don't fetch again (cache the wrapped version? No, better cache raw but for now cache wrapped is simpler for display)
                        // Actually, better to cache raw if we want to re-wrap later, but here we just cache what we display
                        template.content = rawContent; // Store raw for future use if needed
                        if (rawContent) htmlContent = this.wrapWithOutlookFix(rawContent);
                    }
                } catch (e) {
                    console.error('Failed to fetch template details', e);
                    NotificationUtils.show('無法載入EDM內容', 'error');
                    return;
                } finally {
                    this.hideLoading();
                }
            } else {
                // Fallback to old logic (constructing from image parts)
                let parts = '';
                // Top Banner
                if (template.headerImage) {
                    parts += `<table width="100%" border="0" cellspacing="0" cellpadding="0" role="presentation"><tr><td align="center" style="line-height: 0; font-size: 0; padding: 0;"><img src="${template.headerImage}" width="600" style="display: block; width: 600px; max-width: 100%; height: auto; border: 0;" alt="Header"></td></tr></table>`;
                }

                // Main Content
                if (template.mainImage) {
                    parts += `<table width="100%" border="0" cellspacing="0" cellpadding="0" role="presentation"><tr><td align="center" style="line-height: 0; font-size: 0; padding: 0;"><img src="${template.mainImage}" width="600" style="display: block; width: 600px; max-width: 100%; height: auto; border: 0;" alt="Main Content"></td></tr></table>`;
                } else if (!template.headerImage && !template.footerImage) {
                    // Only show placeholder if absolutely no images and no content
                     parts += `<div style="padding: 20px; margin: 0; text-align: center; line-height: 1.5; font-size: 16px;">(主要內容區域)</div>`;
                }

                // Bottom Banner
                if (template.footerImage) {
                    parts += `<table width="100%" border="0" cellspacing="0" cellpadding="0" role="presentation"><tr><td align="center" style="line-height: 0; font-size: 0; padding: 0;"><img src="${template.footerImage}" width="700" style="display: block; width: 700px; max-width: 100%; height: auto; border: 0;" alt="Footer"></td></tr></table>`;
                }
                
                htmlContent = this.wrapWithOutlookFix(parts);
            }

            if (editor) {
                editor.innerHTML = htmlContent;
                editor.dispatchEvent(new Event('input', { bubbles: true }));
            }
            
            if (sourceEditor) {
                sourceEditor.value = htmlContent;
            }
            
            NotificationUtils.show(`已套用EDM：${template.name}`, 'success');
        }
    }

    getRecipientCountTooltip(row) {
        if (row.status === 'sent' || row.status === 'completed') {
            return '實際發送數量 (已完成發送)';
        }

        if (row.recipient_count_details && row.recipient_count_details.inactive > 0) {
            const d = row.recipient_count_details;
            let details = [];
            if (d.unsubscribed > 0) details.push(`退訂: ${d.unsubscribed}`);
            if (d.bounced > 0) details.push(`信箱無效: ${d.bounced}`);
            if (d.deleted > 0) details.push(`已刪除: ${d.deleted}`);
            // Fallback for older records or generic inactive
            if (details.length === 0) details.push(`無效/刪除: ${d.inactive}`);
            
            return `預計發送: ${row.recipient_count} (活躍)\n總訂閱者: ${d.total}\n差異原因:\n- ${details.join('\n- ')}`;
        }
        return '預計發送數量 (活躍訂閱者)';
    }

    getRecipientCountWarning(row) {
        if (row.recipient_count_details && row.recipient_count_details.inactive > 0) {
            return ' <span style="color: #f59e0b; cursor: help;">⚠️</span>';
        }
        return '';
    }

    // 獲取預計發送數量的詳細說明 HTML
    getRecipientCountDetails(row) {
        if (row.recipient_count_details && row.recipient_count_details.inactive > 0) {
            return `<span style="color: #d9534f; font-size: 0.8em; margin-left: 5px;">(含 ${row.recipient_count_details.inactive} 位無效/刪除)</span>`;
        }
        return '';
    }

    initializeDataTable() {
        const tableContainer = DOMUtils.getElement('#campaignsList');
        if (!tableContainer) return;
        
        this.dataTable = new DataTable(tableContainer, {
            columns: [
                { key: 'name', title: '活動名稱', sortable: true },
                { 
                    key: 'type', 
                    title: '類型', 
                    sortable: true,
                    render: (value) => this.renderType(value)
                },
                { 
                    key: 'recipient_count', 
                    title: '發送數量', 
                    sortable: true,
                    render: (value, row) => `
                        <span class="badge badge-info" title="${this.getRecipientCountTooltip(row)}">👥 ${value || 0}</span>
                        ${this.getRecipientCountDetails(row)}
                    `
                },
                { 
                    key: 'status',  
                    title: '狀態', 
                    render: (value, row) => this.renderStatusBadge(value, row)
                },
                {
                    key: 'workflow_name',
                    title: '審核流程',
                    sortable: true,
                    render: (value) => value ? `<span style="font-weight: bold; color: #333;">${value}</span>` : '<span style="color: #999;">無</span>'
                },
                {
                    key: 'createdByName',
                    title: '排版者',
                    sortable: true,
                    render: (value) => value || '排版者'
                },
                {
                    key: 'createdAt',
                    title: '建立時間',
                    sortable: true,
                    render: (value) => this.formatDate(value)
                },
                { 
                    key: 'actions', 
                    title: '操作', 
                    sortable: false,
                    render: (value, row) => {
                        const status = row.status || '';
                        const isPending = status === 'pending_approval';
                        const isSent = status === 'sent';
                        const isDisabled = isPending ? 'disabled' : '';
                        const disabledClass = isPending ? 'disabled' : '';
                        const disabledStyle = isPending ? 'style="pointer-events: none; opacity: 0.6; cursor: not-allowed;"' : '';
                        const titleAttr = isPending ? 'title="審核中無法刪除"' : '';
                        const editTitleAttr = isPending ? 'title="審核中無法編輯"' : '';
                        
                        return `
                        <div class="action-buttons">
                            <button class="btn btn-sm btn-primary" onclick="campaignManager.viewCampaign('${row.id}')">
                                <i class="fas fa-eye"></i> 查看
                            </button>
                            ${isSent ? `
                            <button class="btn btn-sm btn-info" onclick="campaignManager.sendReport('${row.id}')" title="發送成效報告">
                                <i class="fas fa-chart-line"></i> 報告
                            </button>
                            ` : ''}
                            <button class="btn btn-sm btn-warning ${disabledClass}" onclick="campaignManager.editCampaign('${row.id}')" ${isDisabled} ${disabledStyle} ${editTitleAttr}>
                                <i class="fas fa-edit"></i> 編輯
                            </button>
                            <button class="btn btn-sm btn-danger ${disabledClass}" onclick="campaignManager.deleteCampaign('${row.id}')" ${isDisabled} ${disabledStyle} ${titleAttr}>
                                <i class="fas fa-trash"></i> 刪除
                            </button>
                        </div>
                    `;
                    }
                }
            ],
            pagination: { enabled: true, pageSize: 10, showInfo: true },
            search: { enabled: true, placeholder: '搜索活動...' },
            sorting: { enabled: true, defaultSort: { column: 'createdAt', direction: 'desc' } }
        });
        
        this.initializeModals();
    }

    initializeModals() {
        // Init modals if any
    }

    setupEventListeners() {
        const searchInput = DOMUtils.getElement('#campaignSearch');
        const searchBtn = DOMUtils.getElement('#searchBtn');
        const searchClearBtn = DOMUtils.getElement('#searchClearBtn');

        if (searchInput) {
            // Input event with debounce
            EventUtils.debounce(searchInput, 'input', (e) => {
                const val = e.target.value;
                this.filters.search = val;
                this.filterCampaigns();
                
                // Toggle clear button
                if (searchClearBtn) {
                    if (val && val.length > 0) searchClearBtn.classList.add('visible');
                    else searchClearBtn.classList.remove('visible');
                }
            }, 300);

            // Handle Enter key
            EventUtils.on(searchInput, 'keypress', (e) => {
                if (e.key === 'Enter') {
                    this.filters.search = searchInput.value;
                    this.filterCampaigns();
                }
            });
        }

        if (searchBtn) {
            EventUtils.on(searchBtn, 'click', () => {
                if (searchInput) {
                    this.filters.search = searchInput.value;
                    this.filterCampaigns();
                }
            });
        }

        if (searchClearBtn) {
            EventUtils.on(searchClearBtn, 'click', () => {
                if (searchInput) {
                    searchInput.value = '';
                    this.filters.search = '';
                    searchClearBtn.classList.remove('visible');
                    this.filterCampaigns();
                    searchInput.focus();
                }
            });
        }

        const statusFilter = DOMUtils.getElement('#statusFilter');
        if (statusFilter) {
            EventUtils.on(statusFilter, 'change', (e) => {
                this.filters.status = e.target.value;
                this.filterCampaigns();
            });
        }

        const typeFilter = DOMUtils.getElement('#typeFilter');
        if (typeFilter) {
            EventUtils.on(typeFilter, 'change', (e) => {
                this.filters.type = e.target.value;
                this.filterCampaigns();
            });
        }

        const createBtn = DOMUtils.getElement('#createCampaignBtn');
        if (createBtn) {
            EventUtils.on(createBtn, 'click', () => {
                this.showCreateModal();
                setTimeout(() => this.renderCampaignTemplates(), 100);
            });
        }

        // File Import Handler
        const importBtn = DOMUtils.getElement('#importCampaignBtn');
        const importInput = DOMUtils.getElement('#importFileInput');

        if (importBtn && importInput) {
            EventUtils.on(importBtn, 'click', () => {
                importInput.click();
            });

            EventUtils.on(importInput, 'change', (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (event) => {
                    const content = event.target.result;
                    
                    // Open Create Modal
                    this.showCreateModal();
                    
                    // Set Name from filename
                    const nameInput = document.getElementById('campaignName');
                    if (nameInput) {
                        nameInput.value = file.name.replace(/\.[^/.]+$/, "");
                    }

                    // Set Content
                    const editor = document.getElementById('campaignContent');
                    const sourceEditor = document.getElementById('campaignContentSource');
                    const templateInput = document.getElementById('campaignTemplate');

                    if (editor) {
                        editor.innerHTML = content;
                        editor.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                    if (sourceEditor) {
                        sourceEditor.value = content;
                    }
                    if (templateInput) {
                        templateInput.value = 'tpl_blank';
                    }
                    
                    // Switch to content step (Step 2)
                    this.currentStep = 2;
                    this.updateStepUI();

                    NotificationUtils.show(`已匯入檔案: ${file.name}`, 'success');
                    
                    // Reset input
                    importInput.value = '';
                };
                reader.readAsText(file);
            });
        }

        // URL Import handler
        const importUrlBtn = document.getElementById('importUrlBtn');
        if (importUrlBtn) {
            importUrlBtn.addEventListener('click', async () => {
                const urlInput = document.getElementById('importUrlInput');
                const url = urlInput ? urlInput.value.trim() : '';
                
                if (!url) {
                    NotificationUtils.show('請輸入有效的網址', 'warning');
                    return;
                }
                
                // Basic URL validation
                try {
                    new URL(url);
                } catch (e) {
                    NotificationUtils.show('網址格式不正確，請包含 http:// 或 https://', 'warning');
                    return;
                }
                
                const originalText = importUrlBtn.innerHTML;
                importUrlBtn.disabled = true;
                importUrlBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 讀取中...';
                
                try {
                    const response = await apiClient.post('/campaigns/fetch-url', { url });
                    
                    if (response.success && response.data && response.data.content) {
                        const editor = document.getElementById('campaignContent');
                        const sourceEditor = document.getElementById('campaignContentSource');
                        
                        if (editor) {
                            // 嘗試保留 Header 和 Footer
                            const parser = new DOMParser();
                            const doc = parser.parseFromString(editor.innerHTML, 'text/html');
                            
                            let header = doc.querySelector('.header');
                            let footer = doc.querySelector('.footer');
                            let main = doc.querySelector('.main');

                            // 如果沒有 class，嘗試使用啟發式偵測 (針對舊版或手動建立的結構)
                            if (!header && !footer) {
                                const children = Array.from(doc.body.children);
                                if (children.length > 0) {
                                    // 檢查第一個元素是否像 Header (含有圖片的 div)
                                    const first = children[0];
                                    if (first.tagName === 'DIV' && first.querySelector('img')) {
                                        header = first;
                                    }
                                    
                                    // 檢查最後一個元素是否像 Footer (含有圖片的 div，且不是同一個)
                                    const last = children[children.length - 1];
                                    if (last !== first && last.tagName === 'DIV' && last.querySelector('img')) {
                                        footer = last;
                                    }
                                    
                                    // 如果找到了 Header 或 Footer，嘗試定位 Main
                                    if (header || footer) {
                                        if (header && footer) {
                                            if (children.length > 2) {
                                                main = children[1];
                                            }
                                        } else if (header) {
                                            if (children.length > 1) main = children[1];
                                        } else if (footer) {
                                            if (children.length > 1) main = children[0];
                                        }
                                    }
                                }
                            }

                            let finalContent = response.data.content;

                            // 只有在檢測到 header 或 footer 時才進行結構化替換
                            if (header || footer) {
                                if (main) {
                                    // Wrap content in a centered container inside main
                                    main.innerHTML = `<table width="100%" border="0" cellspacing="0" cellpadding="0"><tr><td align="center">${response.data.content}</td></tr></table>`;
                                } else {
                                    // 如果沒有 main class，嘗試建立結構
                                    const newMain = doc.createElement('div');
                                    newMain.className = 'main';
                                    newMain.style.padding = '0';
                                    newMain.style.margin = '0 auto'; // Center the main container
                                    newMain.style.maxWidth = '100%';
                                    newMain.innerHTML = `<table width="100%" border="0" cellspacing="0" cellpadding="0"><tr><td align="center">${response.data.content}</td></tr></table>`;

                                    if (header) {
                                        header.after(newMain);
                                    } else if (footer) {
                                        footer.before(newMain);
                                    } else {
                                        doc.body.appendChild(newMain);
                                    }
                                }
                                finalContent = doc.body.innerHTML;
                            } else {
                                // No header/footer structure, wrap the whole content
                                finalContent = `<table width="100%" border="0" cellspacing="0" cellpadding="0"><tr><td align="center">${response.data.content}</td></tr></table>`;
                            }

                            editor.innerHTML = finalContent;
                            editor.dispatchEvent(new Event('input', { bubbles: true }));
                            
                            if (sourceEditor) {
                                sourceEditor.value = finalContent;
                            }
                        }
                        
                        NotificationUtils.show('網頁內容讀取成功', 'success');
                    } else {
                        throw new Error(response.message || '讀取失敗');
                    }
                } catch (error) {
                    console.error('Fetch URL error:', error);
                    NotificationUtils.show(error.message || '無法讀取該網址內容，請確認網址是否公開可訪問', 'error');
                } finally {
                    importUrlBtn.disabled = false;
                    importUrlBtn.innerHTML = originalText;
                }
            });
        }

        this.setupAudienceSelection();
        this.setupContentEditor();

        EventUtils.delegate(document, 'input[name="schedule"]', 'change', (e) => {
            const scheduleDateTime = DOMUtils.getElement('.schedule-datetime');
            if (scheduleDateTime) {
                DOMUtils.toggleDisplay(scheduleDateTime, e.target.value === 'later');
            }
        });
        
        EventUtils.delegate(document, '#campaignName, #campaignSubject, #senderName', 'input', () => {
            this.updatePreview();
        });
        
        EventUtils.delegate(document, '#campaignType, input[name="audience"], input[name="schedule"]', 'change', () => {
            this.updatePreview();
        });
        
        EventUtils.delegate(document, 'input[name="targetCategories"]', 'change', () => {
            this.updatePreview();
        });

        EventUtils.delegate(document, '#campaignContent', 'input', () => {
            this.updatePreview();
        });

        EventUtils.delegate(document, '.tab-btn', 'click', (e) => {
            this.switchTab(e.target.dataset.tab);
        });

        EventUtils.delegate(document, '.device-btn', 'click', (e) => {
            const btn = e.target;
            const device = btn.dataset.device;
            document.querySelectorAll('.device-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const previewContainer = document.querySelector('.email-preview-frame');
            if (previewContainer) {
                if (device === 'mobile') {
                    previewContainer.style.maxWidth = '375px';
                    previewContainer.style.margin = '0 auto';
                    previewContainer.style.border = '1px solid #ddd';
                    previewContainer.style.borderRadius = '20px';
                    previewContainer.style.overflow = 'hidden';
                } else {
                    previewContainer.style.maxWidth = '100%';
                    previewContainer.style.margin = '0';
                    previewContainer.style.border = '1px solid #e2e8f0';
                    previewContainer.style.borderRadius = '4px';
                }
            }
        });

        // 原始碼模式切換
        const btnToggleSource = document.getElementById('btnToggleSource');
        const editor = document.getElementById('campaignContent');
        const sourceEditor = document.getElementById('campaignContentSource');

        if (btnToggleSource && editor && sourceEditor) {
            btnToggleSource.addEventListener('click', () => {
                const isSourceMode = sourceEditor.style.display === 'block';

                if (isSourceMode) {
                    editor.innerHTML = sourceEditor.value;
                    sourceEditor.style.display = 'none';
                    editor.style.display = 'block';
                    btnToggleSource.classList.remove('active');
                    editor.dispatchEvent(new Event('input', { bubbles: true }));
                } else {
                    sourceEditor.value = editor.innerHTML;
                    editor.style.display = 'none';
                    sourceEditor.style.display = 'block';
                    btnToggleSource.classList.add('active');
                }
            });

            sourceEditor.addEventListener('input', () => {
                editor.innerHTML = sourceEditor.value;
                editor.dispatchEvent(new Event('input', { bubbles: true }));
            });
        }

        // Global modal close handlers
        document.querySelectorAll('.modal-close').forEach(btn => {
            EventUtils.on(btn, 'click', () => this.closeAllModals());
        });
        
        // Close on backdrop click - Disabled to prevent accidental closing
        /*
        document.querySelectorAll('.modal').forEach(modal => {
            EventUtils.on(modal, 'click', (e) => {
                if (e.target === modal) {
                    this.closeAllModals();
                }
            });
        });
        */
    }

    setupStepNavigation() {
        const nextBtn = DOMUtils.getElement('#nextStepBtn');
        const prevBtn = DOMUtils.getElement('#prevStepBtn');
        const cancelBtn = DOMUtils.getElement('#cancelBtn');
        const createBtn = DOMUtils.getElement('#createBtn');

        if (nextBtn) EventUtils.on(nextBtn, 'click', () => this.nextStep());
        if (prevBtn) EventUtils.on(prevBtn, 'click', () => this.prevStep());
        if (cancelBtn) EventUtils.on(cancelBtn, 'click', () => this.closeAllModals());
        if (createBtn) EventUtils.on(createBtn, 'click', (e) => this.handleCreateSubmit(e));
    }

    setupAudienceSelection() {
        const audienceOptions = DOMUtils.selectAll('.audience-option');
        const customSettings = DOMUtils.getElement('.custom-audience-settings');
        const categorySettings = DOMUtils.getElement('.category-audience-settings');

        audienceOptions.forEach(option => {
            EventUtils.on(option, 'click', () => {
                if (this.viewingMode) return;

                audienceOptions.forEach(opt => DOMUtils.removeClass(opt, 'selected'));
                DOMUtils.addClass(option, 'selected');

                const radio = option.querySelector('input[type="radio"]');
                if (radio) radio.checked = true;

                DOMUtils.toggleDisplay(customSettings, option.dataset.audience === 'custom');
                DOMUtils.toggleDisplay(categorySettings, option.dataset.audience === 'category');

                if (option.dataset.audience === 'category') {
                    this.loadCategories();
                }
            });
        });

        EventUtils.delegate(document, 'input[name="targetCategories"]', 'change', (e) => {
            const label = e.target.closest('.category-checkbox-item');
            const val = e.target.value;
            
            if (e.target.checked) {
                if (label) label.classList.add('checked');
                this.selectedCategoryIds.add(val);
            } else {
                if (label) label.classList.remove('checked');
                this.selectedCategoryIds.delete(val);
            }
            this.updatePreview(); 
            this.updateAudienceCardUI();
        });

        // Add category search listener
        const searchInput = document.getElementById('categorySearchInput');
        if (searchInput) {
            EventUtils.on(searchInput, 'input', (e) => {
                this.filterAudienceCategories(e.target.value);
            });
        }

        // Add custom emails listener
        const customEmailsInput = document.getElementById('customEmails');
        if (customEmailsInput) {
            EventUtils.on(customEmailsInput, 'input', () => {
                this.updateAudienceCardUI();
            });
        }

        // Add custom method listener
        EventUtils.delegate(document, 'input[name="customMethod"]', 'change', (e) => {
             const method = e.target.value;
             const emailsSection = document.querySelector('.custom-emails-section');
             const filtersSection = document.querySelector('.custom-filters-section');
             
             if (emailsSection) DOMUtils.toggleDisplay(emailsSection, method === 'emails');
             if (filtersSection) DOMUtils.toggleDisplay(filtersSection, method === 'filters');
        });

        // Add filter builder listeners
        EventUtils.delegate(document, '.btn-add-filter', 'click', () => {
            const filterBuilder = document.querySelector('.filter-builder');
            if (filterBuilder) {
                const firstRow = filterBuilder.querySelector('.filter-row');
                if (firstRow) {
                    const newRow = firstRow.cloneNode(true);
                    newRow.querySelector('input').value = '';
                    filterBuilder.appendChild(newRow);
                }
            }
        });

        EventUtils.delegate(document, '.btn-remove-filter', 'click', (e) => {
            const row = e.target.closest('.filter-row');
            const builder = row.parentElement;
            if (builder.querySelectorAll('.filter-row').length > 1) {
                row.remove();
            } else {
                // If it's the last row, just clear values
                row.querySelector('input').value = '';
            }
        });
    }

    async loadCategories() {
        try {
            const response = await apiClient.get('/categories');
            if (response.success) {
                // Handle response structure { data: { categories: [] } }
                const categories = response.data.categories || response.data || [];
                this.audienceCategories = Array.isArray(categories) ? categories : [];
                this.initCategorySelectionUI(document.getElementById('categorySelectionContainer'), this.audienceCategories);
            }
        } catch (error) {
            console.error('Failed to load categories', error);
            const container = document.getElementById('categorySelectionContainer');
            if (container) {
                container.innerHTML = '<div class="error-message">載入分類失敗，請稍後再試</div>';
            }
        }
    }

    filterAudienceCategories(term) {
        const container = document.getElementById('categorySelectionContainer');
        if (!term) {
            this.initCategorySelectionUI(container, this.audienceCategories);
            return;
        }
        
        term = term.toLowerCase();
        const filtered = this.audienceCategories.filter(cat => 
            cat.name.toLowerCase().includes(term) || 
            (cat.id && cat.id.toString().includes(term))
        );
        this.initCategorySelectionUI(container, filtered);
    }

    initCategorySelectionUI(container, categories) {
        if (!container) return;
        if (categories.length === 0) {
            container.innerHTML = '<div class="no-data">暫無分類</div>';
            return;
        }

        // Sort categories by subscriberCount (descending)
        const sortedCategories = [...categories].sort((a, b) => (b.subscriberCount || 0) - (a.subscriberCount || 0));

        container.innerHTML = sortedCategories.map(cat => {
            const isChecked = this.selectedCategoryIds.has(cat.id.toString()) || this.selectedCategoryIds.has(cat.id);
            return `
            <label class="category-checkbox-item ${isChecked ? 'checked' : ''}">
                <input type="checkbox" name="targetCategories" value="${cat.id}" ${isChecked ? 'checked' : ''}>
                <span>${cat.name} (${cat.subscriberCount || 0})</span>
            </label>
            `;
        }).join('');
        
        this.updateAudienceCardUI();
    }

    setupContentEditor() {
        const editor = document.getElementById('campaignContent');
        
        // 1. 設置選取範圍保存機制與編輯器事件
        if (editor) {
            const saveSelection = () => {
                const sel = window.getSelection();
                if (sel.rangeCount > 0) {
                    const range = sel.getRangeAt(0);
                    // 確保選取範圍在編輯器內
                    if (editor.contains(range.commonAncestorContainer)) {
                        this.lastRange = range;
                    }
                }
            };
            
            editor.addEventListener('keyup', saveSelection);
            editor.addEventListener('mouseup', saveSelection);
            editor.addEventListener('blur', saveSelection);
            
            // 監聽輸入事件以清除不必要的間隙
            editor.addEventListener('input', () => this.cleanEditorContent(editor));
            // 監聽貼上事件
            editor.addEventListener('paste', () => setTimeout(() => this.cleanEditorContent(editor), 10));
        }

        // 2. 設置按鈕事件
        document.querySelectorAll('.editor-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                // Use currentTarget to ensure we catch the button element even if child is clicked
                const action = e.currentTarget.dataset.action;
                
                // Skip if no action (e.g. source toggle button which has its own listener)
                if (!action && e.currentTarget.id === 'btnToggleSource') return;

                // 嘗試恢復選取範圍 (除了 banner 操作外，其他操作通常需要選取範圍或焦點)
                if (editor && ['link', 'image', 'bold', 'italic', 'underline', 'justifyLeft', 'justifyCenter', 'justifyRight'].includes(action)) {
                    editor.focus();
                    if (this.lastRange) {
                        try {
                            const sel = window.getSelection();
                            sel.removeAllRanges();
                            sel.addRange(this.lastRange);
                        } catch (err) {
                            console.warn('Selection restore failed:', err);
                        }
                    }
                }

                if (action === 'link') {
                    const url = prompt('請輸入連結網址 (URL):', 'https://');
                    if (url) {
                        // Prompt 可能導致焦點丟失，再次恢復
                        if (editor) editor.focus();
                        if (this.lastRange) {
                            try {
                                const sel = window.getSelection();
                                sel.removeAllRanges();
                                sel.addRange(this.lastRange);
                            } catch (err) {}
                        }
                        document.execCommand('createLink', false, url);
                    }
                } else if (action === 'image') {
                    const url = prompt('請輸入圖片網址 (URL):', 'https://');
                    if (url) {
                        if (editor) editor.focus();
                        if (this.lastRange) {
                            try {
                                const sel = window.getSelection();
                                sel.removeAllRanges();
                                sel.addRange(this.lastRange);
                            } catch (err) {}
                        }
                        document.execCommand('insertImage', false, url);
                    }
                } else if (action === 'top-banner') {
                    const url = prompt('請輸入頂部 Banner 圖片網址 (URL):', 'https://');
                    if (url) {
                        const bannerHtml = `<div style="width:100%; text-align:center; margin-bottom: 15px;"><img src="${url}" style="max-width:100%; height:auto; display:block; margin:0 auto;" alt="Top Banner"></div>`;
                        editor.innerHTML = bannerHtml + editor.innerHTML;
                        editor.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                } else if (action === 'bottom-banner') {
                    const url = prompt('請輸入底部 Banner 圖片網址 (URL):', 'https://');
                    if (url) {
                        const bannerHtml = `<div style="width:100%; text-align:center; margin-top: 15px;"><img src="${url}" style="max-width:100%; height:auto; display:block; margin:0 auto;" alt="Bottom Banner"></div>`;
                        editor.innerHTML = editor.innerHTML + bannerHtml;
                        editor.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                } else if (action) {
                    // Standard commands: bold, italic, underline, etc.
                    document.execCommand(action, false, null);
                }
            });
        });
    }

    cleanEditorContent(editor) {
        if (!editor) return;
        
        // 1. 確保所有圖片為 block 顯示且無 margin
        const images = editor.querySelectorAll('img');
        images.forEach(img => {
            img.style.display = 'block';
            img.style.margin = '0 auto';
            img.style.verticalAlign = 'bottom'; 
            img.style.maxWidth = '100%';
            img.style.height = 'auto';
            img.style.border = '0';
        });

        // 2. 處理包含圖片的容器，消除 line-height 間隙
        const blocks = editor.querySelectorAll('p, div, figure, span');
        blocks.forEach(block => {
            const hasImg = block.querySelector('img');
            if (hasImg && block.textContent.trim() === '') {
                block.style.margin = '0';
                block.style.padding = '0';
                block.style.lineHeight = '0';
                block.style.fontSize = '0';
                block.style.display = 'block';
                
                // 移除可能的 br 標籤
                const brs = block.querySelectorAll('br');
                brs.forEach(br => br.remove());
            }
        });
    }

    showCreateModal(isEdit = false) {
        const modal = document.getElementById('createCampaignModal');
        if (modal) {
            modal.classList.add('show');
            document.body.style.overflow = 'hidden'; // Prevent body scroll
            this.currentStep = 1;
            this.updateStepUI();
            
            // 如果不是編輯模式，重置表單
            if (!isEdit) {
                this.resetForm();
            }
        }
    }

    resetForm() {
        this.editingCampaignId = null;
        this.viewingMode = false;
        this.selectedCategoryIds.clear();
        
        // 重置輸入欄位
        document.getElementById('campaignName').value = '';
        document.getElementById('campaignSubject').value = '';
        const desc = document.getElementById('campaignDescription');
        if (desc) desc.value = '';
        
        // 設定預設值
        const senderNameInput = document.getElementById('senderName');
        if (senderNameInput) senderNameInput.value = 'epaper@winton.com.tw';
        
        const priorityNormal = document.querySelector('input[name="priority"][value="normal"]');
        if (priorityNormal) priorityNormal.checked = true;
        
        const replyToInput = document.getElementById('replyTo');
        if (replyToInput) replyToInput.value = 'hrsales@winton.com.tw';

        // 重置編輯器
        const editor = document.getElementById('campaignContent');
        if (editor) editor.innerHTML = '';
        
        // 重置按鈕狀態
        const createBtn = document.getElementById('createBtn');
        if (createBtn) {
            createBtn.innerHTML = '建立活動';
            createBtn.style.display = 'none'; // Step 1 doesn't show create btn
        }
        
        // 重置標題
        const modalTitle = document.querySelector('#createCampaignModal .modal-title');
        if (modalTitle) modalTitle.textContent = '建立新活動';

        // 重置步驟按鈕
        const nextBtn = document.getElementById('nextStepBtn');
        if (nextBtn) {
            nextBtn.style.display = 'inline-block';
            nextBtn.innerHTML = '下一步';
        }
    }

    closeAllModals() {
        document.querySelectorAll('.modal, .modal-overlay').forEach(el => {
            el.classList.remove('show');
            el.style.display = ''; // Clear inline styles to let CSS take over
        });
    }

    nextStep() {
        if (this.currentStep < this.totalSteps + 1) {
             if (!this.validateStep(this.currentStep)) return;
             this.currentStep++;
             this.updateStepUI();
        }
    }

    prevStep() {
        if (this.currentStep > 1) {
            this.currentStep--;
            this.updateStepUI();
        }
    }

    validateStep(step) {
        if (step === 1) {
            const name = document.getElementById('campaignName').value;
            if (!name) {
                NotificationUtils.show('請輸入活動名稱', 'warning');
                return false;
            }

            const type = document.getElementById('campaignType').value;
            if (!type) {
                NotificationUtils.show('請選擇活動類型', 'warning');
                return false;
            }

            const subject = document.getElementById('campaignSubject').value;
            if (!subject) {
                NotificationUtils.show('請輸入郵件主旨', 'warning');
                return false;
            }
        }

        if (step === 3) {
            const audienceType = document.querySelector('input[name="audience"]:checked')?.value;
            
            if (audienceType === 'category') {
                const selectedCategories = document.querySelectorAll('input[name="targetCategories"]:checked');
                if (selectedCategories.length === 0) {
                    NotificationUtils.show('請選擇分類群組', 'warning');
                    return false;
                }
            }

            if (audienceType === 'custom') {
                const customMethod = document.querySelector('input[name="customMethod"]:checked')?.value;
                
                if (customMethod === 'emails') {
                    const emails = document.getElementById('customEmails').value.trim();
                    if (!emails) {
                        NotificationUtils.show('請輸入收件者電子郵件', 'warning');
                        return false;
                    }
                }
            }
        }

        return true;
    }

    updateStepUI() {
        document.querySelectorAll('.step').forEach(s => {
            const sStep = parseInt(s.dataset.step);
            s.classList.toggle('active', sStep === this.currentStep);
            s.classList.toggle('completed', sStep < this.currentStep);
        });
        document.querySelectorAll('.step-content').forEach(c => {
            c.classList.toggle('active', parseInt(c.dataset.step) === this.currentStep);
        });
        
        const prevBtn = document.getElementById('prevStepBtn');
        const nextBtn = document.getElementById('nextStepBtn');
        const createBtn = document.getElementById('createBtn');

        if (prevBtn) prevBtn.disabled = this.currentStep === 1;
        
        if (this.currentStep === 5) { // Preview
            if (nextBtn) nextBtn.style.display = 'none';
            if (createBtn) {
                // 在查看模式下隱藏建立/更新按鈕
                createBtn.style.display = this.viewingMode ? 'none' : 'inline-block';
            }
            this.updatePreview();
        } else {
            if (nextBtn) {
                nextBtn.style.display = 'inline-block';
                nextBtn.innerHTML = this.currentStep === 4 ? '預覽活動' : '下一步';
            }
            if (createBtn) createBtn.style.display = 'none';
        }
    }

    async handleCreateSubmit(e) {
        e.preventDefault();
        
        if (this.viewingMode) {
            NotificationUtils.show('查看模式下無法變更活動', 'warning');
            return;
        }
        
        const createBtn = document.getElementById('createBtn');
        const originalText = createBtn.innerHTML;
        createBtn.disabled = true;
        createBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 建立中...';

        try {
            // 1. 收集表單數據
            const name = document.getElementById('campaignName').value;
            const typeRaw = document.getElementById('campaignType').value;
            let type = typeRaw; // 預設使用原始值 (newsletter, promotional)
            
            // 對應後端舊有的類型命名慣例
            if (typeRaw === 'transactional') type = 'Transactional';
            else if (typeRaw === 'automated') type = 'Automated';
            // Capitalize new types to match backend enum convention
            else if (typeRaw === 'newsletter') type = 'Newsletter';
            else if (typeRaw === 'promotional') type = 'Promotional';
            // 不再將 newsletter 和 promotional 強制轉為 Regular，以區分兩者
            // 但如果後端資料庫對於舊資料有相容性問題，這裡保留 typeRaw 即可

            if (!type || type === 'undefined' || type === 'null') {
                throw new Error('請選擇有效的活動類型');
            }


            const subject = document.getElementById('campaignSubject').value;
            const description = document.getElementById('campaignDescription')?.value;
            const templateId = document.getElementById('campaignTemplate').value;
            const htmlContent = document.getElementById('campaignContent').innerHTML;
            const senderName = document.getElementById('senderName').value;
            const replyTo = document.getElementById('replyTo').value;
            
            // 2. 處理受眾
            const audienceType = document.querySelector('input[name="audience"]:checked').value;
            let recipientGroups = [];
            let recipientEmails = [];
            let targetFilter = null;
            
            if (audienceType === 'all') recipientGroups.push('all_subscribers');
            else if (audienceType === 'active') recipientGroups.push('active_users');
            else if (audienceType === 'category') {
                recipientGroups = Array.from(this.selectedCategoryIds);
            } else if (audienceType === 'custom') {
                const customMethod = document.querySelector('input[name="customMethod"]:checked').value;
                if (customMethod === 'emails') {
                     const emails = document.getElementById('customEmails').value;
                     if (emails) {
                         recipientEmails = emails.split(/[\n,]+/).map(e => e.trim()).filter(e => e);
                     }
                } else if (customMethod === 'filters') {
                     const rows = document.querySelectorAll('.filter-row');
                     const criteria = [];
                     rows.forEach(row => {
                         const field = row.querySelector('.filter-field').value;
                         const operator = row.querySelector('.filter-operator').value;
                         const value = row.querySelector('.filter-value').value;
                         if (value) {
                             criteria.push({ field, operator, value });
                         }
                     });
                     
                     if (criteria.length > 0) {
                        targetFilter = JSON.stringify({ method: 'filters', criteria });
                    }
                }
            }

            // 3. 處理排程
            const scheduleType = document.querySelector('input[name="schedule"]:checked').value;
            let scheduledAt = null;
            let status = 'draft';
            
            // 收集優先級
            let priority = 'normal';
            const priorityInput = document.querySelector('input[name="priority"]:checked');
            if (priorityInput) {
                priority = priorityInput.value;
            }
            
            if (scheduleType === 'later') {
                scheduledAt = document.getElementById('scheduleTime').value;
                status = 'pending_approval'; // 改為待審核
            } else if (scheduleType === 'now') {
                status = 'pending_approval'; // 改為待審核
            }

            const trackOpens = document.querySelector('input[name="trackOpens"]').checked;
            const trackClicks = document.querySelector('input[name="trackClicks"]').checked;

            const payload = {
                name,
                type,
                subject, // Add subject to payload
                templateId,
                htmlContent,
                textContent: description || '', 
                senderName,
                senderEmail: 'service@winton.com.tw',
                replyTo,
                status,
                priority,
                scheduledAt,
                recipientGroups,
                recipientEmails,
                targetFilter: targetFilter || '',
                trackOpens,
                trackClicks,
                includeUnsubscribe: true,
                targetAudience: audienceType
            };
            
            let response;
            // Use window.apiClient if available, otherwise fallback to apiService
            const client = window.apiClient || apiService;
            
            if (this.editingCampaignId) {
                response = await client.put(`/campaigns/${this.editingCampaignId}`, payload);
            } else {
                response = await client.post('/campaigns', payload);
            }
            
            if (response.success) {
                NotificationUtils.show(this.editingCampaignId ? '活動更新成功！' : '活動建立成功！', 'success');
                this.closeAllModals();
                this.loadCampaigns();
                this.loadStats();
            } else {
                throw new Error(response.message || (this.editingCampaignId ? '更新失敗' : '建立失敗'));
            }

        } catch (error) {
            console.error('Create campaign error:', error);
            NotificationUtils.show(`建立活動失敗: ${error.message}`, 'error');
        } finally {
            createBtn.disabled = false;
            createBtn.innerHTML = originalText;
        }
    }

    async updatePreview() {
        const name = document.getElementById('campaignName')?.value || '-';
        const type = document.getElementById('campaignType')?.value || '-';
        const subject = document.getElementById('campaignSubject')?.value || '-';
        
        const summaryName = document.getElementById('summaryName');
        const summaryType = document.getElementById('summaryType');
        const summarySubject = document.getElementById('summarySubject');
        
        if (summaryName) summaryName.textContent = name;
        if (summaryType) summaryType.textContent = this.renderType(type);
        if (summarySubject) summarySubject.textContent = subject;

        // 更新目標受眾資訊
        const summaryAudience = document.getElementById('summaryAudience');
        const summaryCount = document.getElementById('summaryCount');
        const summaryCappedContainer = document.getElementById('summaryCappedContainer');
        const summaryCappedCount = document.getElementById('summaryCappedCount');
        const audienceType = document.querySelector('input[name="audience"]:checked')?.value;
        
        if (summaryAudience) {
            let audienceText = '-';
            let countText = '-';
            let targetFilter = null;
            
            if (audienceType === 'all') {
                audienceText = '所有訂閱者';
                const count = document.getElementById('allSubscribersCount')?.textContent || '0';
                countText = `約 ${count} 人`;
            } else if (audienceType === 'active') {
                audienceText = '活躍用戶';
                const count = document.getElementById('activeUsersCount')?.textContent || '0';
                countText = `約 ${count} 人`;
            } else if (audienceType === 'category') {
                if (this.selectedCategoryIds.size > 0) {
                    const names = Array.from(this.selectedCategoryIds).map(id => {
                        const cat = this.audienceCategories.find(c => c.id == id);
                        return cat ? `${cat.name} (${cat.subscriberCount || 0})` : id;
                    });
                    audienceText = `分類: ${names.join(', ')}`;
                    countText = '計算中...';
                    targetFilter = JSON.stringify(Array.from(this.selectedCategoryIds));
                } else {
                    audienceText = '未選擇分類';
                }
            } else if (audienceType === 'custom') {
                audienceText = '自訂名單';
                const emails = document.getElementById('customEmails')?.value;
                if (emails) {
                    const count = emails.split(/[\n,]+/).filter(e => e.trim()).length;
                    countText = `約 ${count} 人`;
                    const emailList = emails.split(/[\n,]+/).map(e => e.trim()).filter(e => e);
                    targetFilter = JSON.stringify({ emails: emailList });
                }
            }
            
            summaryAudience.textContent = audienceText;
            if (summaryCount) summaryCount.textContent = countText;

            // Call Backend to get accurate stats including frequency capping
            if (audienceType && (audienceType !== 'category' || this.selectedCategoryIds.size > 0)) {
                try {
                    if (summaryCount) summaryCount.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 計算中...';
                    
                    const payload = {
                        targetAudience: audienceType,
                        targetFilter: targetFilter,
                        forceSend: false // Preview always assumes normal send
                    };
                    
                    // Use apiService directly
                    const client = window.apiClient || apiService;
                    const response = await client.post('/campaigns/preview-stats', payload);
                    
                    if (response.success) {
                        if (summaryCount) summaryCount.textContent = `${response.data.total} 人 (預計發送 ${response.data.effective} 人)`;
                        
                        if (response.data.capped > 0) {
                            if (summaryCappedContainer) summaryCappedContainer.style.display = 'flex';
                            if (summaryCappedCount) summaryCappedCount.textContent = `${response.data.capped} 人`;
                        } else {
                            if (summaryCappedContainer) summaryCappedContainer.style.display = 'none';
                        }
                    }
                } catch (e) {
                    console.error('Error fetching preview stats:', e);
                    if (summaryCount) summaryCount.textContent = '計算失敗';
                }
            } else {
                 if (summaryCappedContainer) summaryCappedContainer.style.display = 'none';
            }
        }

        // 更新發送設定資訊
        const summarySchedule = document.getElementById('summarySchedule');
        const summarySender = document.getElementById('summarySender');
        
        if (summarySchedule) {
            const scheduleType = document.querySelector('input[name="schedule"]:checked')?.value;
            let priorityText = '';
            const priorityVal = document.querySelector('input[name="priority"]:checked')?.value;
            if (priorityVal === 'urgent') priorityText = ' <span class="badge badge-danger">緊急</span>';
            else if (priorityVal === 'high') priorityText = ' <span class="badge badge-warning">高</span>';
            
            if (scheduleType === 'now') {
                summarySchedule.innerHTML = '立即發送' + priorityText;
            } else if (scheduleType === 'later') {
                const time = document.getElementById('scheduleTime')?.value;
                summarySchedule.innerHTML = (time ? `排程: ${new Date(time).toLocaleString()}` : '排程發送 (未設定時間)') + priorityText;
            } else if (scheduleType === 'draft') {
                summarySchedule.innerHTML = '儲存為草稿';
            }
        }

        const senderName = document.getElementById('senderName')?.value || '-';
        if (summarySender) summarySender.textContent = senderName;

        // 更新郵件預覽區塊
        const previewSender = document.getElementById('previewSender');
        const previewSubject = document.getElementById('previewSubject');
        const previewContent = document.getElementById('previewContent');
        const content = document.getElementById('campaignContent')?.innerHTML || '';

        if (previewSender) previewSender.textContent = senderName;
        if (previewSubject) previewSubject.textContent = subject;
        if (previewContent) previewContent.innerHTML = content;
    }

    updateAudienceCardUI() {
        // Update Category Card
        const categoryCardCount = document.querySelector('.audience-option[data-audience="category"] .audience-count');
        if (categoryCardCount) {
            if (this.selectedCategoryIds.size > 0) {
                const names = [];
                this.selectedCategoryIds.forEach(id => {
                    const cat = (this.audienceCategories || []).find(c => c.id == id);
                    if (cat) names.push(cat.name);
                });
                
                if (names.length > 0) {
                    const displayNames = names.slice(0, 3).join(', ');
                    const remaining = names.length - 3;
                    categoryCardCount.textContent = remaining > 0 
                        ? `已選: ${displayNames}... 等 ${names.length} 個` 
                        : `已選: ${displayNames}`;
                    categoryCardCount.style.color = '#2c3e50';
                    categoryCardCount.style.fontWeight = 'bold';
                } else {
                    categoryCardCount.textContent = '點擊選擇分類';
                    categoryCardCount.style.color = '';
                    categoryCardCount.style.fontWeight = '';
                }
            } else {
                categoryCardCount.textContent = '點擊選擇分類';
                categoryCardCount.style.color = '';
                categoryCardCount.style.fontWeight = '';
            }
        }

        // Update Custom Card
        const customCardCount = document.querySelector('.audience-option[data-audience="custom"] .audience-count');
        const customEmailsInput = document.getElementById('customEmails');
        if (customCardCount && customEmailsInput) {
             const val = customEmailsInput.value || '';
             const emails = val.split(/[\n,]+/).map(e => e.trim()).filter(e => e);
             if (emails.length > 0) {
                 const firstEmail = emails[0];
                 const remaining = emails.length - 1;
                 customCardCount.textContent = remaining > 0
                    ? `已輸入: ${firstEmail}... 等 ${emails.length} 個`
                    : `已輸入: ${firstEmail}`;
                 customCardCount.style.color = '#2c3e50';
                 customCardCount.style.fontWeight = 'bold';
             } else {
                 customCardCount.textContent = '點擊設定條件';
                 customCardCount.style.color = '';
                 customCardCount.style.fontWeight = '';
             }
        }
    }

    formatDate(dateString) {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleString('zh-TW');
    }

    renderType(type) {
        const types = {
            'newsletter': '電子報',
            'promotional': '促銷',
            'transactional': '訊息通知',
            'automated': '節日',
            'Regular': '一般活動',
            'Transactional': '訊息通知',
            'Automated': '節日',
            'AB_Test': 'A/B 測試',
            'Newsletter': '電子報',
            'Promotional': '促銷'
        };
        return types[type] || type;
    }

    renderStatusBadge(status, row) {
        const badges = {
            'draft': 'badge-secondary',
            'scheduled': 'badge-info',
            'preparing': 'badge-info', // 準備中
            'processing': 'badge-info',
            'sending': 'badge-warning',
            'sent': 'badge-success',
            'paused': 'badge-warning',
            'completed': 'badge-success',
            'pending_approval': 'badge-primary',
            'approved': 'badge-success',
            'rejected': 'badge-danger',
            'returned': 'badge-warning',
            'cancelled': 'badge-secondary',
            'failed': 'badge-danger'
        };
        const labels = {
            'draft': '草稿',
            'scheduled': '已排程',
            'preparing': '準備中',
            'processing': '處理中',
            'sending': '發送中',
            'sent': '已發送',
            'paused': '已暫停',
            'completed': '已完成',
            'pending_approval': '審核中',
            'approved': '已核准',
            'rejected': '已拒絕',
            'returned': '已退回',
            'cancelled': '已取消',
            'failed': '失敗'
        };
        
        let label = labels[status] || status;
        
        if (status === 'pending_approval' && row) {
             if (row.currentStep && row.totalSteps) {
                 label = `審核中 (第 ${row.currentStep}/${row.totalSteps} 階)`;
                 if (row.currentApprover) {
                     label += `<br><small style="font-weight:normal; opacity:0.9;">${row.currentApprover}</small>`;
                 }
             } else {
                 label = '審核中';
             }
        } else if ((status === 'rejected' || status === 'returned') && row && row.rejectedBy) {
             label += `<br><small style="font-weight:normal; opacity:0.9;">由 ${row.rejectedBy} ${status === 'rejected' ? '拒絕' : '退回'}</small>`;
        }
        
        return `<span class="badge ${badges[status] || 'badge-secondary'}">${label}</span>`;
    }

    async loadCampaigns() {
        try {
            this.showLoading();
            // 獲取所有活動以支援前端分頁和篩選 (limit=1000)
            const response = await apiService.get(`/campaigns?limit=1000&_t=${Date.now()}`);
            
            if (response.success && response.data) {
                this.campaigns = response.data.campaigns || [];
                // 使用 setData 更新表格數據，而不是直接賦值
                this.dataTable.setData(this.campaigns);
            } else {
                throw new Error(response.message || '載入活動失敗');
            }
        } catch (error) {
            console.error('Load campaigns error:', error);
            NotificationUtils.show(`載入活動失敗: ${error.message}`, 'error');
            this.campaigns = [];
            this.dataTable.setData([]);
        } finally {
            this.hideLoading();
        }
    }

    async loadStats() {
        try {
            const response = await apiService.get('/campaigns/stats');
            if (response.success && response.data) {
                const stats = response.data;
                const totalEl = document.querySelector('.stat-number[data-stat="total"]');
                const activeEl = document.querySelector('.stat-number[data-stat="active"]');
                const completedEl = document.querySelector('.stat-number[data-stat="completed"]');
                const scheduledEl = document.querySelector('.stat-number[data-stat="scheduled"]');

                if (totalEl) totalEl.textContent = stats.total || 0;
                if (activeEl) activeEl.textContent = stats.active || 0;
                if (completedEl) completedEl.textContent = stats.completed || 0;
                if (scheduledEl) scheduledEl.textContent = stats.scheduled || 0;
            }
        } catch (error) {
            console.error('Failed to load campaign stats:', error);
        }
    }

    showLoading() {
        if (this.dataTable) {
            this.dataTable.setLoading(true);
        }
    }

    hideLoading() {
        if (this.dataTable) {
            this.dataTable.setLoading(false);
        }
    }
    
    filterCampaigns() {
        let filtered = this.campaigns;
        if (this.filters.type !== 'all') {
            const filterType = this.filters.type;
            
            filtered = filtered.filter(c => {
                const type = c.type;
                if (!type) return false;

                if (filterType === 'newsletter') {
                    // 電子報：包含 'newsletter', 'Newsletter' 以及 'Regular' (一般活動)
                    return type === 'newsletter' || type === 'Newsletter' || type === 'Regular';
                } else if (filterType === 'promotional') {
                    // 促銷
                    return type === 'promotional' || type === 'Promotional';
                } else if (filterType === 'transactional') {
                    // 訊息通知
                    return type === 'transactional' || type === 'Transactional';
                } else if (filterType === 'automated') {
                    // 節日
                    return type === 'automated' || type === 'Automated';
                }
                
                return type === filterType;
            });
        }
        if (this.filters.status !== 'all') {
             const filterStatus = this.filters.status.toLowerCase();
             filtered = filtered.filter(c => {
                 if (!c.status) return false;
                 const status = c.status.toLowerCase();

                 // Mapping for better UX
                 if (filterStatus === 'sending') {
                     return ['sending', 'preparing', 'processing'].includes(status);
                 }
                 if (filterStatus === 'sent') {
                     return ['sent', 'completed'].includes(status);
                 }
                 
                 return status === filterStatus;
             });
        }
        if (this.filters.search) {
            const term = this.filters.search.toLowerCase();
            filtered = filtered.filter(c => c.name.toLowerCase().includes(term) || (c.subject && c.subject.toLowerCase().includes(term)));
        }
        this.dataTable.setData(filtered);
    }
    
    switchTab(tabId) {
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`.tab-btn[data-tab="${tabId}"]`).classList.add('active');
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(`${tabId}-tab`).classList.add('active');
    }
    
    async viewCampaign(id) {
        try {
            this.showLoading();
            const response = await apiService.get(`/campaigns/${id}`);
            if (response.success) {
                this.fillForm(response.data);
                this.viewingMode = true;
                this.editingCampaignId = id;
                
                this.setReadOnly(true);
                this.showCreateModal(true);
                
                const modalTitle = document.querySelector('#createCampaignModal .modal-title');
                if (modalTitle) modalTitle.textContent = '查看活動詳情';
                
                // Hide Create/Update button in view mode
                const createBtn = document.getElementById('createBtn');
                if (createBtn) createBtn.style.display = 'none';
            }
        } catch (error) {
            console.error(error);
            NotificationUtils.show('無法載入活動詳情', 'error');
        } finally {
            this.hideLoading();
        }
    }

    async editCampaign(id) {
        try {
            this.showLoading();
            const response = await apiService.get(`/campaigns/${id}`);
            if (response.success) {
                this.fillForm(response.data);
                this.viewingMode = false;
                this.editingCampaignId = id;
                
                this.setReadOnly(false);
                this.showCreateModal(true);
                
                const modalTitle = document.querySelector('#createCampaignModal .modal-title');
                if (modalTitle) modalTitle.textContent = '編輯活動';
                
                const createBtn = document.getElementById('createBtn');
                if (createBtn) {
                    if (response.data.status === 'rejected' || response.data.status === 'returned') {
                        createBtn.innerHTML = '更新並重新送審';
                    } else {
                        createBtn.innerHTML = '更新活動';
                    }
                }
            }
        } catch (error) {
            console.error(error);
            NotificationUtils.show('無法載入活動詳情', 'error');
        } finally {
            this.hideLoading();
        }
    }

    fillForm(data) {
        document.getElementById('campaignName').value = data.name || '';
        document.getElementById('campaignSubject').value = data.subject || '';
        const desc = document.getElementById('campaignDescription');
        if (desc) desc.value = data.textContent || '';
        
        const typeSelect = document.getElementById('campaignType');
        if (typeSelect) {
            let frontendType = 'newsletter'; // Default fallback
            
            if (data.type) {
                const backendType = data.type.toLowerCase();
                
                if (backendType === 'transactional') {
                    frontendType = 'transactional';
                } else if (backendType === 'automated') {
                    frontendType = 'automated';
                } else if (backendType === 'regular') {
                    // Try to guess based on other fields or just default to newsletter
                    // Ideally backend should store the subtype. 
                    // For now, if it's Regular, we map it to newsletter as it's the most common
                    frontendType = 'newsletter';
                } else {
                     // Try to match directly if the backend stores 'newsletter' or 'promotional'
                     const validTypes = ['newsletter', 'promotional', 'transactional', 'automated'];
                     if (validTypes.includes(backendType)) {
                         frontendType = backendType;
                     }
                }
            }
            
            typeSelect.value = frontendType;
        }

        document.getElementById('senderName').value = data.senderName || '';
        document.getElementById('replyTo').value = data.replyTo || '';
        
        const editor = document.getElementById('campaignContent');
        if (editor) {
            editor.innerHTML = data.htmlContent || '';
        }
        
        if (data.templateId) {
             const templateInput = document.getElementById('campaignTemplate');
             if (templateInput) templateInput.value = data.templateId;
             
             document.querySelectorAll('.template-option').forEach(opt => {
                 if (opt.dataset.templateId == data.templateId) {
                     opt.classList.add('selected');
                 } else {
                     opt.classList.remove('selected');
                 }
             });
        }
        
        // Handle target audience and filter
        this.selectedCategoryIds.clear();
        
        if (data.targetFilter) {
             try {
                 const filter = typeof data.targetFilter === 'string' 
                     ? JSON.parse(data.targetFilter) 
                     : data.targetFilter;
                 
                 if (data.targetAudience === 'category' && Array.isArray(filter)) {
                     filter.forEach(id => this.selectedCategoryIds.add(id.toString()));
                 } else if (data.targetAudience === 'custom' && filter && filter.emails && Array.isArray(filter.emails)) {
                     const emailsInput = document.getElementById('customEmails');
                     if (emailsInput) {
                         emailsInput.value = filter.emails.join('\n');
                     }
                     // Ensure "emails" method is selected
                     const methodRadio = document.querySelector('input[name="customMethod"][value="emails"]');
                     if (methodRadio) {
                         methodRadio.checked = true;
                     }
                 }
             } catch (e) {
                 console.error('Error parsing targetFilter:', e);
             }
        }

        if (data.targetAudience) {
            const radio = document.querySelector(`input[name="audience"][value="${data.targetAudience}"]`);
            if (radio) {
                radio.click();
            }
        }
        
        if (data.scheduledAt) {
            const laterRadio = document.querySelector('input[name="schedule"][value="later"]');
            if (laterRadio) {
                laterRadio.click();
                const timeInput = document.getElementById('scheduleTime');
                if (timeInput) {
                    const date = new Date(data.scheduledAt);
                    const localIsoString = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
                    timeInput.value = localIsoString;
                }
            }
        } else {
            // Default to 'now' or 'draft' depending on status, but radio click handles visibility
            // If status is draft, maybe select 'later' without time or 'draft' option if exists?
            // Currently UI has 'now' and 'later'.
        }

        this.updatePreview();
        this.updateAudienceCardUI();
    }
    
    setReadOnly(readonly) {
        const inputs = document.querySelectorAll('#createCampaignModal input, #createCampaignModal select, #createCampaignModal textarea');
        inputs.forEach(input => {
            input.disabled = readonly;
        });
        
        const editor = document.getElementById('campaignContent');
        if (editor) {
            editor.contentEditable = !readonly;
        }
        
        const editorToolbar = document.querySelector('.editor-toolbar');
        if (editorToolbar) {
            editorToolbar.style.display = readonly ? 'none' : 'flex';
        }
    }

    async sendReport(id) {
        if (!confirm('確定要發送此活動的成效報告到您的信箱嗎？')) {
            return;
        }

        try {
            this.showLoading();
            const response = await apiService.post(`/campaigns/${id}/send-report`);
            if (response.success) {
                NotificationUtils.show('報告已發送', 'success');
            } else {
                NotificationUtils.show(response.message || '發送失敗', 'error');
            }
        } catch (error) {
            console.error('Failed to send report', error);
            NotificationUtils.show('發送報告時發生錯誤', 'error');
        } finally {
            this.hideLoading();
        }
    }

    async deleteCampaign(id) {
        // 使用 NotificationService 的確認對話框（如果可用）
        const confirmed = await new Promise((resolve) => {
            if (window.notification && typeof window.notification.confirm === 'function') {
                window.notification.confirm(
                    '確定要刪除此活動嗎？',
                    () => resolve(true),
                    () => resolve(false)
                );
            } else {
                // 回退到原生 confirm
                resolve(confirm('確定要刪除此活動嗎？'));
            }
        });

        if (!confirmed) return;

        try {
            const response = await apiService.delete(`/campaigns/${id}`);
            if (response.success) {
                NotificationUtils.show('活動已刪除', 'success');
                this.loadCampaigns();
                this.loadStats();
            } else {
                // 如果 API 返回 success: false，顯示後端返回的訊息
                NotificationUtils.show(response.message || '刪除失敗', 'error');
            }
        } catch (e) {
            console.error('刪除活動失敗:', e);
            // 嘗試從錯誤物件中獲取詳細訊息
            const errorMsg = e.message || '刪除失敗';
            NotificationUtils.show(errorMsg, 'error');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.campaignManager = new CampaignManager();
});