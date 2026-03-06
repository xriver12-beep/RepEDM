// 設定頁面 JavaScript - Restored Version
// 修復了 ReferenceError: showNotification is not defined

class SettingsManager {
    constructor() {
        this.currentSection = 'general';
        this.settings = {};
        this.confirmCallback = null;
        this.components = {};
        this.cache = new Map();
        
        // 動態決定後端 API URL
        const hostname = window.location.hostname;
        const protocol = window.location.protocol;
        const port = window.location.port;
        
        if (port === '3443' || (protocol === 'https:' && !port)) {
             this.baseURL = '/api';
        } else {
             const apiHost = hostname === '127.0.0.1' ? 'localhost' : hostname;
             this.baseURL = `http://${apiHost}:3001/api`;
        }

        // 分類管理相關
        this.categories = [];
        this.currentCategoryType = 'identity';
        this.currentEditingCategory = null;
    }

    // --- 憑證管理 ---

    async loadCertificates() {
        try {
            const response = await window.apiClient.get('/settings/certificates');
            if (response.success) {
                const tbody = document.getElementById('certTableBody');
                tbody.innerHTML = '';

                response.data.forEach(cert => {
                    const tr = document.createElement('tr');
                    const validTo = new Date(cert.valid_to).toLocaleString();
                    const statusBadge = cert.is_active ? 
                        '<span class="badge badge-success" style="background: #28a745; color: white; padding: 2px 8px; border-radius: 4px;">使用中</span>' : '';

                    tr.innerHTML = `
                        <td>${cert.common_name}</td>
                        <td>${cert.issuer}</td>
                        <td>${validTo}</td>
                        <td>
                            ${statusBadge}
                            ${!cert.is_active ? `<button class="btn-sm btn-primary" data-action="bind-cert" data-id="${cert.id}">綁定</button>` : ''}
                            <button class="btn-sm btn-danger" data-action="delete-cert" data-id="${cert.id}">刪除</button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            }
        } catch (error) {
            console.error('載入憑證失敗:', error);
            NotificationUtils.show('載入憑證列表失敗', 'error');
        }
    }

    async uploadCertificate() {
        const certFile = document.getElementById('certFile').files[0];
        const keyFile = document.getElementById('keyFile').files[0];

        if (!certFile) {
            NotificationUtils.show('請選擇憑證檔案', 'warning');
            return;
        }

        // 如果不是 pfx，則必須有 keyFile
        if (!certFile.name.endsWith('.pfx') && !keyFile) {
             NotificationUtils.show('請上傳私鑰檔案 (.key)', 'warning');
             return;
        }

        const formData = new FormData();
        formData.append('cert', certFile);
        if (keyFile) formData.append('key', keyFile);
        
        const password = document.getElementById('pfxPassword').value;
        if (password) formData.append('password', password);

        let loaderId;
        try {
            loaderId = LoadingUtils.show('正在上傳憑證...');
            const response = await window.apiClient.post('/settings/certificates/upload', formData);
            if (response.success) {
                NotificationUtils.show('憑證上傳成功', 'success');
                document.getElementById('certFile').value = '';
                document.getElementById('keyFile').value = '';
                this.loadCertificates();
            } else {
                NotificationUtils.show(response.message || '上傳失敗', 'error');
            }
        } catch (error) {
            console.error('上傳失敗:', error);
            NotificationUtils.show('上傳失敗: ' + error.message, 'error');
        } finally {
            LoadingUtils.hide(loaderId);
        }
    }

    async bindCertificate(id) {
        if (!confirm('確定要綁定此憑證嗎？伺服器可能需要重啟才能生效。')) return;

        let loaderId;
        try {
            loaderId = LoadingUtils.show('正在綁定憑證...');
            const response = await window.apiClient.post(`/settings/certificates/${id}/bind`);
            if (response.success) {
                NotificationUtils.show('憑證綁定成功', 'success');
                this.loadCertificates();
            } else {
                NotificationUtils.show(response.message || '綁定失敗', 'error');
            }
        } catch (error) {
            console.error('綁定失敗:', error);
            NotificationUtils.show('綁定失敗: ' + error.message, 'error');
        } finally {
            LoadingUtils.hide(loaderId);
        }
    }

    async deleteCertificate(id) {
        if (!confirm('確定要刪除此憑證嗎？此操作無法撤銷。')) return;

        let loaderId;
        try {
            loaderId = LoadingUtils.show('正在刪除憑證...');
            const response = await window.apiClient.delete(`/settings/certificates/${id}`);
            if (response.success) {
                NotificationUtils.show('憑證刪除成功', 'success');
                this.loadCertificates();
            } else {
                NotificationUtils.show(response.message || '刪除失敗', 'error');
            }
        } catch (error) {
            console.error('刪除失敗:', error);
            NotificationUtils.show('刪除失敗: ' + error.message, 'error');
        } finally {
            LoadingUtils.hide(loaderId);
        }
    }

    async saveCA() {
        const caFile = document.getElementById('caFile').files[0];
        if (!caFile) {
            NotificationUtils.show('請選擇 CA 檔案', 'warning');
            return;
        }

        const formData = new FormData();
        formData.append('caFile', caFile);

        let loaderId;
        try {
            loaderId = LoadingUtils.show('正在儲存 CA...');
            const response = await window.apiClient.post('/settings/certificates/ca', formData);
            if (response.success) {
                NotificationUtils.show('CA 儲存成功', 'success');
                document.getElementById('caFile').value = '';
                this.loadCA(); // Reload to show content
            } else {
                NotificationUtils.show(response.message || '儲存失敗', 'error');
            }
        } catch (error) {
            console.error('儲存失敗:', error);
            NotificationUtils.show('儲存失敗: ' + error.message, 'error');
        } finally {
            LoadingUtils.hide(loaderId);
        }
    }

    async loadCA() {
        try {
            const response = await window.apiClient.get('/settings/certificates/ca');
            if (response.success) {
                document.getElementById('caContent').value = response.data || '未載入 CA';
            }
        } catch (error) {
            console.error('載入 CA 失敗:', error);
        }
    }

    previewCA(input) {
        if (input.files && input.files[0]) {
            const reader = new FileReader();
            reader.onload = function(e) {
                document.getElementById('caContent').value = e.target.result;
            };
            reader.readAsText(input.files[0]);
        }
    }

    // 設置事件監聽器
    setupEventListeners() {
        // 一般設定
        this.bindClick('saveGeneralSettingsBtn', () => this.saveGeneralSettings());
        this.bindClick('resetGeneralSettingsBtn', () => this.resetGeneralSettings());
        this.bindClick('logoUploadBtn', () => document.getElementById('logoUpload').click());
        
        // 郵件設定
        this.bindClick('testEmailBtn', () => this.testEmailSettings());
        this.bindClick('saveEmailSettingsBtn', () => this.saveEmailSettings());
        
        // SMTP 設定
        this.bindClick('saveSmtpSettingsBtn', () => this.saveSmtpSettings());
        this.bindClick('testSmtpConnectionBtn', () => this.testSmtpConnection());
        
        // 安全設定
        this.bindClick('saveSecuritySettingsBtn', () => this.saveSecuritySettings());
        this.bindClick('resetSecuritySettingsBtn', () => this.resetSecuritySettings());
        
        // 憑證管理
        this.bindClick('uploadCertificateBtn', () => this.uploadCertificate());
        this.bindClick('clearCAContentBtn', () => {
            document.getElementById('caFile').value = '';
            document.getElementById('caContent').value = '';
        });
        this.bindClick('saveCABtn', () => this.saveCA());
        
        // 通知設定
        this.bindClick('saveNotificationSettingsBtn', () => this.saveNotificationSettings());
        this.bindClick('testNotificationsBtn', () => this.testNotifications());
        
        // 整合設定
        this.bindClick('saveIntegrationSettingsBtn', () => this.saveIntegrationSettings());
        this.bindClick('testWebhookBtn', () => this.testWebhook());
        
        // 備份還原
        this.bindClick('createBackupBtn', () => this.createBackup());
        this.bindClick('downloadBackupBtn', () => this.downloadBackup());
        this.bindClick('restoreBackupBtn', () => this.restoreBackup());

        // 工作流程設定
        this.bindClick('saveWorkflowSettingsBtn', () => this.saveWorkflowSettings());
        
        // 頻率控管設定
        this.bindClick('saveFrequencySettingsBtn', () => this.saveFrequencySettings());

        this.bindClick('addReviewerBtn', () => this.addReviewer());
        this.bindClick('closeAddReviewerModalBtn', () => this.closeAddReviewerModal());
        this.bindClick('cancelAddReviewerModalBtn', () => this.closeAddReviewerModal());
        this.bindClick('userSearchBtn', () => this.searchUsersToAdd());
        
        // 工作流程定義
        this.bindClick('createWorkflowBtn', () => this.openWorkflowEditor());
        this.bindClick('cancelEditWorkflowBtn', () => this.closeWorkflowEditor());
        this.bindClick('saveWorkflowDefinitionBtn', () => this.saveWorkflowDefinition());
        this.bindClick('addStepBtn', () => this.addStepRow());

        // 監聽工作流程定義搜尋框 Enter 鍵
        const userSearchInput = document.getElementById('userSearchInput');
        if (userSearchInput) {
            userSearchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.searchUsersToAdd();
            });
        }
        
        // 工作流程子標籤切換
        document.querySelectorAll('.workflow-tabs .tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                // Remove active class from all buttons
                document.querySelectorAll('.workflow-tabs .tab-btn').forEach(b => b.classList.remove('active'));
                // Add active class to clicked button
                btn.classList.add('active');
                
                // Hide all tab content by removing active class
                document.querySelectorAll('#workflow .tab-pane').forEach(pane => {
                    pane.classList.remove('active');
                    // Also clear inline style if any (from HTML)
                    pane.style.display = '';
                });
                
                // Show target tab content
                const targetId = btn.getAttribute('data-tab');
                const targetPane = document.getElementById(targetId);
                if (targetPane) {
                    targetPane.classList.add('active');
                }
            });
        });

        // 進階設定
        this.bindClick('saveAdvancedSettingsBtn', () => this.saveAdvancedSettings());
        this.bindClick('clearCacheBtn', () => this.clearCache());
        this.bindClick('resetAllSettingsBtn', () => this.resetAllSettings());
        
        // 模態框
        this.bindClick('closeConfirmModalBtn', () => this.closeConfirmModal());
        // Category modal events are handled in category-management.js
        
        // 處理動態生成的按鈕 (例如憑證列表的刪除按鈕)，使用事件委派
        document.addEventListener('click', (e) => {
            if (e.target.matches('[data-action="delete-cert"]')) {
                const id = e.target.getAttribute('data-id');
                this.deleteCertificate(id);
            } else if (e.target.matches('[data-action="bind-cert"]')) {
                const id = e.target.getAttribute('data-id');
                this.bindCertificate(id);
            } else if (e.target.matches('[data-action="download-backup"]')) {
                const filename = e.target.getAttribute('data-filename');
                this.downloadBackup(filename);
            } else if (e.target.matches('[data-action="restore-backup"]')) {
                const filename = e.target.getAttribute('data-filename');
                this.restoreBackup(filename);
            } else if (e.target.matches('[data-action="delete-backup"]')) {
                const filename = e.target.getAttribute('data-filename');
                this.deleteBackup(filename);
            } else if (e.target.closest('.remove-reviewer-btn')) {
                const btn = e.target.closest('.remove-reviewer-btn');
                const id = btn.getAttribute('data-id');
                this.removeReviewer(id);
            } else if (e.target.closest('.user-add-btn')) {
                const btn = e.target.closest('.user-add-btn');
                const id = btn.getAttribute('data-id');
                this.confirmAddReviewer(id);
            } else if (e.target.closest('.edit-workflow-btn')) {
                const btn = e.target.closest('.edit-workflow-btn');
                const id = btn.getAttribute('data-id');
                this.openWorkflowEditor(id);
            } else if (e.target.closest('.delete-workflow-btn')) {
                const btn = e.target.closest('.delete-workflow-btn');
                const id = btn.getAttribute('data-id');
                this.deleteWorkflow(id);
            } else if (e.target.closest('.set-default-workflow-btn')) {
                const btn = e.target.closest('.set-default-workflow-btn');
                const id = btn.getAttribute('data-id');
                this.setAsDefault(id);
            } else if (e.target.closest('.remove-step-btn')) {
                const btn = e.target.closest('.remove-step-btn');
                btn.closest('.step-row').remove();
                this.updateStepNumbers();
            }
        });

        // 標籤切換
        document.querySelectorAll('.settings-nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const section = item.dataset.section;
                if (section) this.showSection(section);
            });
        });

        // 監聽憑證檔案選擇，如果是 pfx 則顯示密碼欄位
        const certFileInput = document.getElementById('certFile');
        if (certFileInput) {
            certFileInput.addEventListener('change', function(e) {
                const file = e.target.files[0];
                const pfxGroup = document.getElementById('pfxPasswordGroup');
                const keyInput = document.getElementById('keyFile');
                
                if (file) {
                    const fileName = file.name.toLowerCase();
                    if (fileName.endsWith('.pfx') || fileName.endsWith('.p12')) {
                        if (pfxGroup) pfxGroup.style.display = 'block';
                        if (keyInput) keyInput.disabled = true;
                    } else {
                        if (pfxGroup) pfxGroup.style.display = 'none';
                        if (keyInput) keyInput.disabled = false;
                    }
                }
            });
        }

        // Logo 上傳監聽
        const logoUpload = document.getElementById('logoUpload');
        if (logoUpload) {
            logoUpload.addEventListener('change', (e) => this.handleLogoUpload(e));
        }

        // CA 檔案預覽監聽
        const caFile = document.getElementById('caFile');
        if (caFile) {
            caFile.addEventListener('change', (e) => this.previewCA(e.target));
        }

        // CSV 匯入預覽監聽
        const csvFile = document.getElementById('csvFile');
        if (csvFile) {
            csvFile.addEventListener('change', (e) => this.previewCsvImport(e.target));
        }
    }

    bindClick(id, handler) {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('click', handler);
        }
    }

    async init() {
        try {
            // 刷新API客戶端的認證token
            if (window.apiClient) {
                window.apiClient.refreshToken();
            }
            
            this.setupEventListeners();
            await this.loadAllSettings();
            this.showSection('general');
            
            console.log('SettingsManager initialized');
        } catch (error) {
            console.error('初始化設定管理器失敗:', error);
            NotificationUtils.show('初始化失敗', 'error');
        }
    }

    async loadAllSettings() {
        let loaderId;
        try {
            loaderId = LoadingUtils.show();
            const response = await window.apiClient.get('/settings');
            if (response && response.success) {
                this.settings = response.data;
                this.populateForms();
            }
        } catch (error) {
            console.error('載入設定失敗:', error);
            NotificationUtils.show('載入設定失敗', 'error');
        } finally {
            LoadingUtils.hide(loaderId);
        }
    }

    populateForms() {
        // 填充一般設定
        if (this.settings.general) {
            const general = this.settings.general;
            if (document.getElementById('companyName')) document.getElementById('companyName').value = general.companyName || '';
            
            // 填充 Logo
            if (general.companyLogo) {
                const preview = document.getElementById('logoPreview');
                const placeholder = document.querySelector('.logo-placeholder');
                if (preview && placeholder) {
                    // 如果 URL 是相對路徑且不以 / 開頭（雖然通常後端返回 /uploads/...），可以處理一下
                    // 但我們假設後端返回正確的相對 URL (e.g. /uploads/logos/...)
                    // 需要加上 backend URL 嗎？
                    // 如果前端和後端不同 port，且圖片 URL 是相對的，則需要。
                    // settings.js 有 this.baseURL = 'http://localhost:3001/api';
                    // 圖片 URL 應該是 http://localhost:3001/uploads/...
                    
                    // 檢查是否為完整 URL
                    let logoUrl = general.companyLogo;
                    if (logoUrl && !logoUrl.startsWith('http')) {
                        // 假設 baseURL 是 http://localhost:3001/api，我们需要 http://localhost:3001
                        const origin = this.baseURL.replace('/api', '');
                        logoUrl = `${origin}${logoUrl}`;
                    }
                    
                    preview.src = logoUrl;
                    preview.style.display = 'block';
                    placeholder.style.display = 'none';

                    // 檢查圖片是否有效
                    const statusEl = document.getElementById('logoStatus');
                    preview.onerror = () => {
                        if (statusEl) {
                            statusEl.textContent = '圖片載入失敗';
                            statusEl.className = 'logo-status error';
                        }
                    };
                    preview.onload = () => {
                        if (statusEl) {
                            statusEl.textContent = '已上傳';
                            statusEl.className = 'logo-status success';
                        }
                    };
                }
            }

            if (document.getElementById('timezone')) document.getElementById('timezone').value = general.timezone || 'Asia/Taipei';
            if (document.getElementById('dateFormat')) document.getElementById('dateFormat').value = general.dateFormat || 'YYYY-MM-DD';
            if (document.getElementById('timeFormat')) document.getElementById('timeFormat').value = general.timeFormat || '24h';
            if (document.getElementById('language')) document.getElementById('language').value = general.language || 'zh-TW';
        }

        // 填充通知設定
        if (this.settings.notifications) {
            const notif = this.settings.notifications;
            if (document.getElementById('campaignCompleteNotif')) document.getElementById('campaignCompleteNotif').checked = !!notif.campaignCompleteNotif;
            if (document.getElementById('newSubscriberNotif')) document.getElementById('newSubscriberNotif').checked = !!notif.newSubscriberNotif;
            if (document.getElementById('systemAlertNotif')) document.getElementById('systemAlertNotif').checked = !!notif.systemAlertNotif;
            if (document.getElementById('dailyReportNotif')) document.getElementById('dailyReportNotif').checked = !!notif.dailyReportNotif;
            if (document.getElementById('weeklyReportNotif')) document.getElementById('weeklyReportNotif').checked = !!notif.weeklyReportNotif;
            if (document.getElementById('notifEmail')) document.getElementById('notifEmail').value = notif.email || '';
            if (document.getElementById('systemErrorNotif')) document.getElementById('systemErrorNotif').checked = !!notif.systemErrorNotif;
            if (document.getElementById('browserNotif')) document.getElementById('browserNotif').checked = !!notif.browserNotif;
            if (document.getElementById('soundNotif')) document.getElementById('soundNotif').checked = !!notif.soundNotif;
            if (document.getElementById('reportFrequency')) document.getElementById('reportFrequency').value = notif.reportFrequency || 'daily';
            if (document.getElementById('reportEmail')) document.getElementById('reportEmail').value = notif.reportEmail || '';
        }

        // 填充工作流程設定
        if (this.settings.workflow) {
            const workflow = this.settings.workflow;
            if (document.getElementById('autoAssignReviewer')) document.getElementById('autoAssignReviewer').checked = !!workflow.autoAssignReviewer;
            if (document.getElementById('requireMultipleApprovals')) document.getElementById('requireMultipleApprovals').checked = !!workflow.requireMultipleApprovals;
            if (document.getElementById('approvalTimeout')) document.getElementById('approvalTimeout').value = workflow.approvalTimeout || 24;
            if (document.getElementById('emailNotifications')) document.getElementById('emailNotifications').checked = !!workflow.emailNotifications;
            if (document.getElementById('slackNotifications')) document.getElementById('slackNotifications').checked = !!workflow.slackNotifications;
            if (document.getElementById('reminderNotifications')) document.getElementById('reminderNotifications').checked = !!workflow.reminderNotifications;
            
            // 載入審核者列表
            this.loadReviewersList();
            // 載入工作流程定義
            this.loadWorkflows();
        }

        // 填充郵件設定
        if (this.settings.email) {
            const email = this.settings.email;
            if (document.getElementById('fromName')) document.getElementById('fromName').value = email.fromName || '';
            if (document.getElementById('fromEmail')) document.getElementById('fromEmail').value = email.fromEmail || '';
            if (document.getElementById('replyToEmail')) document.getElementById('replyToEmail').value = email.replyToEmail || '';
            if (document.getElementById('unsubscribeUrl')) document.getElementById('unsubscribeUrl').value = email.unsubscribeUrl || '';
            if (document.getElementById('trackingEnabled')) document.getElementById('trackingEnabled').checked = !!email.trackingEnabled;
            if (document.getElementById('openTracking')) document.getElementById('openTracking').checked = !!email.openTracking;
            if (document.getElementById('clickTracking')) document.getElementById('clickTracking').checked = !!email.clickTracking;
        }

        // 填充 SMTP 設定
        if (this.settings.smtp) {
            const smtp = this.settings.smtp;
            if (document.getElementById('smtpEnabled')) document.getElementById('smtpEnabled').checked = !!smtp.enabled;
            if (document.getElementById('smtpHost')) document.getElementById('smtpHost').value = smtp.host || '';
            if (document.getElementById('smtpPort')) document.getElementById('smtpPort').value = smtp.port || '';
            if (document.getElementById('smtpSecurity')) document.getElementById('smtpSecurity').value = smtp.secure ? 'ssl' : (smtp.security || 'tls');
            if (document.getElementById('smtpUsername')) document.getElementById('smtpUsername').value = smtp.username || '';
            // 密碼通常不回填，或者回填為 placeholder
            if (document.getElementById('smtpPassword')) document.getElementById('smtpPassword').value = smtp.password || '';
        }

        // 填充安全設定
        if (this.settings.security) {
            const security = this.settings.security;
            if (document.getElementById('sessionTimeout')) document.getElementById('sessionTimeout').value = security.sessionTimeout || 30;
            if (document.getElementById('maxFailedAttempts')) document.getElementById('maxFailedAttempts').value = security.maxFailedAttempts || 5;
            if (document.getElementById('lockoutDurationMinutes')) document.getElementById('lockoutDurationMinutes').value = security.lockoutDurationMinutes || 30;
            if (document.getElementById('minPasswordLength')) document.getElementById('minPasswordLength').value = security.minPasswordLength || 8;
            if (document.getElementById('requireUppercase')) document.getElementById('requireUppercase').checked = !!security.requireUppercase;
            if (document.getElementById('requireLowercase')) document.getElementById('requireLowercase').checked = !!security.requireLowercase;
            if (document.getElementById('requireNumbers')) document.getElementById('requireNumbers').checked = !!security.requireNumbers;
            if (document.getElementById('requireSpecialChars')) document.getElementById('requireSpecialChars').checked = !!security.requireSpecialChars;
            if (document.getElementById('twoFactorAuth')) document.getElementById('twoFactorAuth').checked = !!security.twoFactorAuth;
            if (document.getElementById('ipWhitelist')) document.getElementById('ipWhitelist').value = security.ipWhitelist || '';
        }

        // 填充頻率控管設定
        if (this.settings.frequencyCapping) {
            const fc = this.settings.frequencyCapping;
            if (document.getElementById('fcEnabled')) document.getElementById('fcEnabled').checked = !!fc.enabled;
            if (document.getElementById('fcMaxEmails')) document.getElementById('fcMaxEmails').value = fc.maxEmails || 4;
            if (document.getElementById('fcPeriodDays')) document.getElementById('fcPeriodDays').value = fc.periodDays || 30;
            if (document.getElementById('fcExcludeTestEmails')) document.getElementById('fcExcludeTestEmails').checked = !!fc.excludeTestEmails;
            if (document.getElementById('fcExcludedDomains')) {
                document.getElementById('fcExcludedDomains').value = Array.isArray(fc.excludedDomains) ? fc.excludedDomains.join('\n') : '';
            }
            if (document.getElementById('fcExcludedEmails')) {
                document.getElementById('fcExcludedEmails').value = Array.isArray(fc.excludedEmails) ? fc.excludedEmails.join('\n') : '';
            }
            if (document.getElementById('fcExcludedTags')) {
                document.getElementById('fcExcludedTags').value = Array.isArray(fc.excludedTags) ? fc.excludedTags.join('\n') : '';
            }
        }
    }



    async handleLogoUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        // 驗證檔案類型
        if (!file.type.match('image.*')) {
            NotificationUtils.show('請上傳圖片檔案', 'error');
            return;
        }
        
        // 驗證檔案大小 (2MB)
        if (file.size > 2 * 1024 * 1024) {
            NotificationUtils.show('圖片大小不能超過 2MB', 'error');
            return;
        }

        const formData = new FormData();
        formData.append('logo', file);
        
        const statusEl = document.getElementById('logoStatus');
        if (statusEl) {
            statusEl.textContent = '上傳中...';
            statusEl.className = 'logo-status';
        }

        let loaderId;
        try {
            loaderId = LoadingUtils.show('正在上傳 Logo...');
            
            const response = await window.apiClient.post('/settings/upload-logo', formData);
            
            if (response.success) {
                const logoUrl = response.data.url;
                
                // 更新設定物件
                if (!this.settings.general) this.settings.general = {};
                this.settings.general.companyLogo = logoUrl;
                
                // 更新預覽
                const preview = document.getElementById('logoPreview');
                const placeholder = document.querySelector('.logo-placeholder');
                
                if (preview && placeholder) {
                    // 構建完整 URL 用於顯示，加上時間戳避免緩存
                    const origin = this.baseURL.replace('/api', '');
                    preview.src = `${origin}${logoUrl}?t=${Date.now()}`;
                    preview.style.display = 'block';
                    placeholder.style.display = 'none';
                    
                    // 綁定錯誤處理，如果圖片加載失敗
                    preview.onerror = () => {
                        console.error('Logo image failed to load');
                        if (statusEl) {
                            statusEl.textContent = '圖片載入失敗';
                            statusEl.className = 'logo-status error';
                        }
                    };
                    
                    preview.onload = () => {
                        if (statusEl) {
                            statusEl.textContent = '已上傳';
                            statusEl.className = 'logo-status success';
                        }
                    };
                }
                
                NotificationUtils.show('Logo 上傳成功', 'success');
            } else {
                throw new Error(response.message || '上傳失敗');
            }
        } catch (error) {
            console.error('Logo 上傳失敗:', error);
            NotificationUtils.show('Logo 上傳失敗: ' + error.message, 'error');
            if (statusEl) {
                statusEl.textContent = '上傳失敗';
                statusEl.className = 'logo-status error';
            }
        } finally {
            LoadingUtils.hide(loaderId);
            // 清空 input 讓使用者可以再次選擇同一個檔案
            event.target.value = '';
        }
    }

    showSection(sectionId) {
        // 隱藏所有區塊
        document.querySelectorAll('.settings-section').forEach(el => {
            el.style.display = 'none';
            el.classList.remove('active');
        });
        
        // 移除導航激活狀態
        document.querySelectorAll('.settings-nav-item').forEach(el => el.classList.remove('active'));
        
        // 顯示目標區塊
        const targetSection = document.getElementById(sectionId);
        if (targetSection) {
            targetSection.style.display = 'block';
            targetSection.classList.add('active');
            this.currentSection = sectionId;
            
            // 激活對應導航
            const navItem = document.querySelector(`.settings-nav-item[data-section="${sectionId}"]`);
            if (navItem) navItem.classList.add('active');
            
            // 如果是分類區塊，載入分類
            if (sectionId === 'categories') {
                if (window.categoryManagement) {
                    // Ensure it is initialized if not already or re-render if needed
                    // For now, assume auto-init in constructor works if container exists
                    // But if user navigates away and back, we might need to refresh?
                    // CategoryManagement handles its own state.
                    if (document.getElementById('categoryManagementRoot') && document.getElementById('categoryManagementRoot').innerHTML.trim() === '') {
                         window.categoryManagement.init();
                    }
                }
            }

            // 如果是備份區塊，載入備份列表
            if (sectionId === 'backup') {
                this.loadBackups();
            }

            // 如果是憑證管理區塊，載入憑證列表與CA
            if (sectionId === 'certificates') {
                this.loadCertificates();
                this.loadCA();
            }

            // 如果是工作流程區塊，載入設定
            if (sectionId === 'workflow') {
                this.loadWorkflowSettings();
            }
        }
    }

    // --- 通知設定 ---

    async saveNotificationSettings() {
        let loaderId;
        try {
            loaderId = LoadingUtils.show();
            
            const settings = {
                campaignCompleteNotif: document.getElementById('campaignCompleteNotif')?.checked,
                newSubscriberNotif: document.getElementById('newSubscriberNotif')?.checked,
                systemErrorNotif: document.getElementById('systemErrorNotif')?.checked,
                browserNotif: document.getElementById('browserNotif')?.checked,
                soundNotif: document.getElementById('soundNotif')?.checked,
                reportFrequency: document.getElementById('reportFrequency')?.value,
                reportEmail: document.getElementById('reportEmail')?.value
            };

            // 驗證郵件格式
            if (settings.reportEmail) {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(settings.reportEmail)) {
                    NotificationUtils.show('報告接收信箱格式不正確', 'error');
                    return;
                }
            }

            // 調用 API 保存
            const response = await window.apiClient.put('/settings/notifications', settings);
            
            if (response.success) {
                console.log('Notification settings saved:', settings);
                this.settings.notifications = { ...this.settings.notifications, ...settings };
                NotificationUtils.show('通知設定保存成功', 'success');
            } else {
                throw new Error(response.message || '保存失敗');
            }
            
        } catch (error) {
            console.error('保存通知設定失敗:', error);
            NotificationUtils.show('保存通知設定失敗: ' + error.message, 'error');
        } finally {
            LoadingUtils.hide(loaderId);
        }
    }

    async testEmailSettings() {
        let loaderId;
        try {
            const recipientEmail = document.getElementById('testRecipientEmail')?.value?.trim();
            
            // Validate email format if provided
            if (recipientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
                NotificationUtils.show('請輸入有效的測試郵件收件人信箱', 'error');
                return;
            }

            loaderId = LoadingUtils.show(`正在發送測試郵件${recipientEmail ? '至 ' + recipientEmail : ''}...`);
            
            const response = await window.apiClient.post('/settings/email/test-send', {
                to: recipientEmail
            });
            
            if (response.success) {
                NotificationUtils.show(`測試郵件已發送${recipientEmail ? '至 ' + recipientEmail : ''}，請檢查您的收件箱`, 'success');
            } else {
                throw new Error(response.message || '發送失敗');
            }
        } catch (error) {
            console.error('測試郵件失敗:', error);
            NotificationUtils.show('測試郵件失敗: ' + error.message, 'error');
        } finally {
            LoadingUtils.hide(loaderId);
        }
    }

    async testSmtpConnection() {
        let loaderId;
        try {
            loaderId = LoadingUtils.show('正在測試連線...');
            
            const security = document.getElementById('smtpSecurity')?.value;
            const settings = {
                host: document.getElementById('smtpHost')?.value,
                port: parseInt(document.getElementById('smtpPort')?.value || '0'),
                username: document.getElementById('smtpUsername')?.value,
                secure: security === 'ssl',
                security: security // Add this line to save the explicit security selection
            };
            
            const password = document.getElementById('smtpPassword')?.value;
            if (password) {
                settings.password = password;
            }

            const response = await window.apiClient.post('/settings/test-smtp', { smtpSettings: settings });
            
            if (response.success) {
                NotificationUtils.show('SMTP 連線測試成功', 'success');
            } else {
                throw new Error(response.message || '連線失敗');
            }
        } catch (error) {
            console.error('SMTP 連線測試失敗:', error);
            NotificationUtils.show('SMTP 連線測試失敗: ' + error.message, 'error');
        } finally {
            LoadingUtils.hide(loaderId);
        }
    }

    async testNotifications() {
        try {
            // 測試瀏覽器通知
            if ('Notification' in window) {
                if (Notification.permission === 'granted') {
                    new Notification('WintonEDM 測試通知', {
                        body: '這是一個測試通知',
                        icon: '/favicon.ico'
                    });
                    NotificationUtils.show('測試通知已發送', 'success');
                } else if (Notification.permission !== 'denied') {
                    const permission = await Notification.requestPermission();
                    if (permission === 'granted') {
                        new Notification('WintonEDM 測試通知', {
                            body: '這是一個測試通知',
                            icon: '/favicon.ico'
                        });
                        NotificationUtils.show('測試通知已發送', 'success');
                    } else {
                        NotificationUtils.show('請允許瀏覽器通知權限', 'warning');
                    }
                } else {
                    NotificationUtils.show('瀏覽器通知已被禁用', 'warning');
                }
            } else {
                NotificationUtils.show('瀏覽器不支援通知功能', 'warning');
            }
            
        } catch (error) {
            console.error('測試通知失敗:', error);
            NotificationUtils.show('測試通知失敗', 'error');
        }
    }

    // --- 分類管理 (簡化版) ---
    
    async loadCategories(type) {
        // 這裡應該調用 API
        console.log(`Loading categories for type: ${type}`);
    }

    switchCategoryType(type) {
        this.currentCategoryType = type;
        document.querySelectorAll('.category-type-tab').forEach(tab => tab.classList.remove('active'));
        document.querySelector(`[data-type="${type}"]`)?.classList.add('active');
        this.loadCategories(type);
    }
    
    // --- 其他設定區塊 (骨架) ---
    
    async saveGeneralSettings() {
        let loaderId;
        try {
            loaderId = LoadingUtils.show();
            const settings = {
                companyName: document.getElementById('companyName')?.value,
                companyLogo: this.settings.general?.companyLogo || '',
                timezone: document.getElementById('timezone')?.value,
                language: document.getElementById('language')?.value,
                dateFormat: document.getElementById('dateFormat')?.value,
                timeFormat: document.getElementById('timeFormat')?.value
            };
            
            const response = await window.apiClient.put('/settings/general', settings);
            
            if (response.success) {
                this.settings.general = { ...this.settings.general, ...settings };
                NotificationUtils.show('一般設定保存成功', 'success');
            } else {
                throw new Error(response.message || '保存失敗');
            }
        } catch (error) {
            console.error('保存一般設定失敗:', error);
            NotificationUtils.show('保存一般設定失敗: ' + error.message, 'error');
        } finally {
            LoadingUtils.hide(loaderId);
        }
    }

    async saveEmailSettings() {
        let loaderId;
        try {
            loaderId = LoadingUtils.show();
            const settings = {
                fromName: document.getElementById('fromName')?.value,
                fromEmail: document.getElementById('fromEmail')?.value,
                replyToEmail: document.getElementById('replyToEmail')?.value,
                unsubscribeUrl: document.getElementById('unsubscribeUrl')?.value,
                trackingEnabled: document.getElementById('trackingEnabled')?.checked,
                openTracking: document.getElementById('openTracking')?.checked,
                clickTracking: document.getElementById('clickTracking')?.checked
            };
            
            const response = await window.apiClient.put('/settings/email', settings);
            
            if (response.success) {
                this.settings.email = { ...this.settings.email, ...settings };
                NotificationUtils.show('郵件設定保存成功', 'success');
            } else {
                throw new Error(response.message || '保存失敗');
            }
        } catch (error) {
            console.error('保存郵件設定失敗:', error);
            NotificationUtils.show('保存郵件設定失敗: ' + error.message, 'error');
        } finally {
            LoadingUtils.hide(loaderId);
        }
    }

    async saveSmtpSettings() {
        let loaderId;
        try {
            loaderId = LoadingUtils.show();
            const security = document.getElementById('smtpSecurity')?.value;
            const settings = {
                enabled: document.getElementById('smtpEnabled')?.checked || false,
                host: document.getElementById('smtpHost')?.value,
                port: parseInt(document.getElementById('smtpPort')?.value || '0'),
                username: document.getElementById('smtpUsername')?.value,
                secure: security === 'ssl',
                security: security // Save security preference
            };
            
            // 密碼只有在有輸入時才更新
            const password = document.getElementById('smtpPassword')?.value;
            if (password) {
                settings.password = password;
            }
            
            const response = await window.apiClient.put('/settings/smtp', settings);
            
            if (response.success) {
                this.settings.smtp = { ...this.settings.smtp, ...settings };
                NotificationUtils.show('SMTP 設定保存成功', 'success');
            } else {
                throw new Error(response.message || '保存失敗');
            }
        } catch (error) {
            console.error('保存 SMTP 設定失敗:', error);
            NotificationUtils.show('保存 SMTP 設定失敗: ' + error.message, 'error');
        } finally {
            LoadingUtils.hide(loaderId);
        }
    }

    async saveSecuritySettings() {
        let loaderId;
        try {
            loaderId = LoadingUtils.show();
            
            const settings = {
                sessionTimeout: parseInt(document.getElementById('sessionTimeout')?.value || '30'),
                maxFailedAttempts: parseInt(document.getElementById('maxFailedAttempts')?.value || '5'),
                lockoutDurationMinutes: parseInt(document.getElementById('lockoutDurationMinutes')?.value || '30'),
                requireUppercase: document.getElementById('requireUppercase')?.checked,
                requireLowercase: document.getElementById('requireLowercase')?.checked,
                requireNumbers: document.getElementById('requireNumbers')?.checked,
                requireSpecialChars: document.getElementById('requireSpecialChars')?.checked,
                minPasswordLength: parseInt(document.getElementById('minPasswordLength')?.value || '8'),
                twoFactorAuth: document.getElementById('twoFactorAuth')?.checked,
                ipWhitelist: document.getElementById('ipWhitelist')?.value
            };

            // Validate session timeout
            if (settings.sessionTimeout < 5 || settings.sessionTimeout > 1440) {
                NotificationUtils.show('會話逾時必須在5-1440分鐘之間', 'error');
                return;
            }

            // Validate login limits
            if (settings.maxFailedAttempts < 1 || settings.maxFailedAttempts > 20) {
                NotificationUtils.show('最大登入失敗嘗試次數必須在1-20之間', 'error');
                return;
            }
            if (settings.lockoutDurationMinutes < 1 || settings.lockoutDurationMinutes > 1440) {
                NotificationUtils.show('帳號鎖定時間必須在1-1440分鐘之間', 'error');
                return;
            }

            // Validate min password length
            if (settings.minPasswordLength < 6 || settings.minPasswordLength > 50) {
                NotificationUtils.show('最小密碼長度必須在6-50之間', 'error');
                return;
            }

            // Call API to save
            const response = await window.apiClient.put('/settings/security', settings);
            
            if (response.success) {
                console.log('Security settings saved:', settings);
                this.settings.security = { ...this.settings.security, ...settings };
                NotificationUtils.show('安全設定保存成功', 'success');
            } else {
                throw new Error(response.message || '保存失敗');
            }
            
        } catch (error) {
            console.error('保存安全設定失敗:', error);
            NotificationUtils.show('保存安全設定失敗: ' + error.message, 'error');
        } finally {
            LoadingUtils.hide(loaderId);
        }
    }
    async saveIntegrationSettings() { NotificationUtils.show('整合設定保存功能尚未恢復', 'warning'); }
    async saveFrequencySettings() {
        const settings = {
            enabled: document.getElementById('fcEnabled').checked,
            maxEmails: parseInt(document.getElementById('fcMaxEmails').value) || 4,
            periodDays: parseInt(document.getElementById('fcPeriodDays').value) || 30,
            excludeTestEmails: document.getElementById('fcExcludeTestEmails').checked,
            excludedDomains: document.getElementById('fcExcludedDomains').value.split('\n').map(s => s.trim()).filter(s => s),
            excludedEmails: document.getElementById('fcExcludedEmails').value.split('\n').map(s => s.trim()).filter(s => s),
            excludedTags: document.getElementById('fcExcludedTags').value.split('\n').map(s => s.trim()).filter(s => s)
        };

        let loaderId;
        try {
            loaderId = LoadingUtils.show('正在保存頻率控管設定...');
            const response = await window.apiClient.put('/settings/frequencyCapping', settings);
            if (response.success) {
                NotificationUtils.show('頻率控管設定保存成功', 'success');
                this.settings.frequencyCapping = settings;
            } else {
                NotificationUtils.show(response.message || '保存失敗', 'error');
            }
        } catch (error) {
            console.error('保存失敗:', error);
            NotificationUtils.show('保存失敗: ' + error.message, 'error');
        } finally {
            LoadingUtils.hide(loaderId);
        }
    }

    async saveAdvancedSettings() { NotificationUtils.show('進階設定保存功能尚未恢復', 'warning'); }

    // --- 備份與還原 ---
    async createBackup() {
        if (!confirm('確定要立即建立系統備份嗎？這可能需要幾分鐘時間。')) return;
        
        let loaderId;
        try {
            loaderId = LoadingUtils.show('正在建立備份...');
            const response = await window.apiClient.post('/settings/backup/create');
            
            if (response.success) {
                NotificationUtils.show('備份建立成功', 'success');
                this.loadBackups(); // 重新載入列表
            } else {
                throw new Error(response.message || '建立失敗');
            }
        } catch (error) {
            console.error('建立備份失敗:', error);
            NotificationUtils.show('建立備份失敗: ' + error.message, 'error');
        } finally {
            LoadingUtils.hide(loaderId);
        }
    }

    async loadBackups() {
        try {
            const response = await window.apiClient.get('/settings/backups');
            const container = document.getElementById('backupHistory');
            
            if (!container) return;

            if (response.success && response.data && response.data.length > 0) {
                container.innerHTML = response.data.map(backup => `
                    <div class="backup-item">
                        <div class="backup-info">
                            <div class="backup-name">${backup.filename}</div>
                            <div class="backup-meta">
                                大小: ${this.formatSize(backup.size)} | 
                                時間: ${new Date(backup.created_at).toLocaleString()} | 
                                類型: ${backup.type}
                            </div>
                        </div>
                        <div class="backup-actions-small">
                            <button type="button" class="btn-secondary" data-action="download-backup" data-filename="${backup.filename}">下載</button>
                            <button type="button" class="btn-danger" data-action="restore-backup" data-filename="${backup.filename}">還原</button>
                            <button type="button" class="btn-danger" data-action="delete-backup" data-filename="${backup.filename}" style="margin-left: 5px;">刪除</button>
                        </div>
                    </div>
                `).join('');
            } else {
                container.innerHTML = '<p class="no-data">尚無備份紀錄</p>';
            }
        } catch (error) {
            console.error('載入備份列表失敗:', error);
            const container = document.getElementById('backupHistory');
            if (container) container.innerHTML = '<p class="error-text">無法載入備份紀錄</p>';
        }
    }

    async downloadBackup(filename) {
        if (!filename) {
            // 如果沒有指定文件名，嘗試獲取最新的備份
             try {
                const response = await window.apiClient.get('/settings/backups');
                if (response.success && response.data && response.data.length > 0) {
                    filename = response.data[0].filename;
                } else {
                    NotificationUtils.show('沒有可下載的備份', 'warning');
                    return;
                }
            } catch (error) {
                NotificationUtils.show('無法獲取備份列表', 'error');
                return;
            }
        }
        
        // 觸發下載
        window.location.href = `${this.baseURL}/settings/backup/download/${filename}?token=${localStorage.getItem('auth_token')}`;
    }

    async restoreBackup(filename) {
        // 如果傳入的是 filename (來自列表按鈕)，則確認後執行
        // 如果沒有參數 (來自上傳按鈕)，則檢查 file input
        
        let targetFile = null;
        let isUpload = false;

        if (filename && typeof filename === 'string') {
            if (!confirm(`確定要還原備份 ${filename} 嗎？此操作將覆蓋當前資料！`)) return;
            targetFile = filename;
        } else {
            const fileInput = document.getElementById('restoreFile');
            if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
                NotificationUtils.show('請先選擇要還原的檔案', 'warning');
                return;
            }
            if (!confirm('確定要從上傳的檔案還原嗎？此操作將覆蓋當前資料！')) return;
            targetFile = fileInput.files[0];
            isUpload = true;
        }

        let loaderId;
        try {
            loaderId = LoadingUtils.show('正在還原系統資料，請勿關閉視窗...');
            
            let response;
            if (isUpload) {
                const formData = new FormData();
                formData.append('backup', targetFile);
                response = await window.apiClient.post('/settings/backup/restore-upload', formData); // 修正: 使用 post 發送 FormData
            } else {
                response = await window.apiClient.post('/settings/backup/restore', { filename: targetFile });
            }

            if (response.success) {
                NotificationUtils.show('系統還原成功！頁面將在 3 秒後重新整理', 'success');
                setTimeout(() => window.location.reload(), 3000);
            } else {
                throw new Error(response.message || '還原失敗');
            }
        } catch (error) {
            console.error('還原失敗:', error);
            NotificationUtils.show('還原失敗: ' + error.message, 'error');
        } finally {
            LoadingUtils.hide(loaderId);
        }
    }

    async deleteBackup(filename) {
        if (!confirm(`確定要刪除備份 ${filename} 嗎？此操作無法復原！`)) return;

        let loaderId;
        try {
            loaderId = LoadingUtils.show('正在刪除備份...');
            const response = await window.apiClient.delete(`/settings/backup/${filename}`);

            if (response.success) {
                NotificationUtils.show('備份檔案已成功刪除', 'success');
                this.loadBackups(); // Reload list
            } else {
                throw new Error(response.message || '刪除失敗');
            }
        } catch (error) {
            console.error('刪除備份失敗:', error);
            NotificationUtils.show('刪除備份失敗: ' + error.message, 'error');
        } finally {
            LoadingUtils.hide(loaderId);
        }
    }

    formatSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    
    // 模態框操作
    showAddCategoryModal() { document.getElementById('categoryModal').style.display = 'block'; }
    closeCategoryModal() { document.getElementById('categoryModal').style.display = 'none'; }
    closeImportModal() { document.getElementById('importCategoryModal').style.display = 'none'; }
    importCategories() { document.getElementById('importCategoryModal').style.display = 'flex'; }

    // --- 工作流程設定 ---

    loadWorkflowSettings() {
        if (!this.settings.workflow) return;
        
        const settings = this.settings.workflow;
        if (document.getElementById('autoAssignReviewer')) document.getElementById('autoAssignReviewer').checked = !!settings.autoAssignReviewer;
        if (document.getElementById('requireMultipleApprovals')) document.getElementById('requireMultipleApprovals').checked = !!settings.requireMultipleApprovals;
        if (document.getElementById('approvalTimeout')) document.getElementById('approvalTimeout').value = settings.approvalTimeout || 24;
        if (document.getElementById('emailNotifications')) document.getElementById('emailNotifications').checked = !!settings.emailNotifications;
        if (document.getElementById('slackNotifications')) document.getElementById('slackNotifications').checked = !!settings.slackNotifications;
        if (document.getElementById('reminderNotifications')) document.getElementById('reminderNotifications').checked = !!settings.reminderNotifications;
        
        this.loadReviewersList();
        this.loadWorkflows();
    }

    async saveWorkflowSettings() {
        let loaderId;
        try {
            loaderId = LoadingUtils.show('正在保存工作流程設定...');
            
            const settings = {
                autoAssignReviewer: document.getElementById('autoAssignReviewer').checked,
                requireMultipleApprovals: document.getElementById('requireMultipleApprovals').checked,
                approvalTimeout: parseInt(document.getElementById('approvalTimeout').value),
                emailNotifications: document.getElementById('emailNotifications').checked,
                slackNotifications: document.getElementById('slackNotifications').checked,
                reminderNotifications: document.getElementById('reminderNotifications').checked
            };
            
            // 驗證設定
            if (settings.approvalTimeout < 1 || settings.approvalTimeout > 168) {
                NotificationUtils.show('審核超時時間必須在1-168小時之間', 'error');
                return;
            }
            
            // 使用 API 服務
            const response = await window.apiClient.put('/workflow/settings', settings);
            
            if (response.success) {
                this.settings.workflow = settings;
                NotificationUtils.show('工作流程設定保存成功', 'success');
            } else {
                throw new Error(response.message || '保存設定失敗');
            }
            
        } catch (error) {
            console.error('保存工作流程設定失敗:', error);
            NotificationUtils.show(error.message || '保存工作流程設定失敗', 'error');
        } finally {
            LoadingUtils.hide(loaderId);
        }
    }

    async loadReviewersList() {
        const reviewersList = document.getElementById('reviewersList');
        if (!reviewersList) return;

        try {
            reviewersList.innerHTML = '<div class="loading-spinner">載入中...</div>';
            
            const response = await window.apiClient.get('/reviewers');
            
            if (!response.success || !response.data) {
                reviewersList.innerHTML = '<div class="no-data">無法載入審核者列表</div>';
                return;
            }

            const reviewers = response.data;
            
            if (reviewers.length === 0) {
                reviewersList.innerHTML = '<div class="no-data">暫無審核者</div>';
                return;
            }

            reviewersList.innerHTML = reviewers.map(reviewer => {
                const avatar = reviewer.full_name ? reviewer.full_name.charAt(0) : (reviewer.username ? reviewer.username.charAt(0) : '?');
                return `
                <div class="reviewer-item">
                    <div class="reviewer-info">
                        <div class="reviewer-avatar">${avatar}</div>
                        <div class="reviewer-details">
                            <div class="reviewer-name">${reviewer.full_name || reviewer.username}</div>
                            <div class="reviewer-role">${this.getRoleDisplayName(reviewer.role)}</div>
                            <div class="reviewer-email">${reviewer.email}</div>
                        </div>
                    </div>
                    <div class="reviewer-actions">
                        <button class="btn-icon danger remove-reviewer-btn" data-id="${reviewer.id}">
                            <i class="fas fa-trash"></i> 移除
                        </button>
                    </div>
                </div>
            `}).join('');
        } catch (error) {
            console.error('載入審核者失敗:', error);
            reviewersList.innerHTML = '<div class="error-message">載入失敗</div>';
        }
    }

    getRoleDisplayName(role) {
        const roleMap = {
            'Admin': '管理員',
            'Manager': '經理',
            'Editor': '編輯',
            'Viewer': '訪客',
            'Approver': '審核員',
            'admin': '管理員',
            'manager': '經理',
            'user': '一般用戶'
        };
        return roleMap[role] || role;
    }

    addReviewer() {
        const modal = document.getElementById('addReviewerModal');
        const input = document.getElementById('userSearchInput');
        const results = document.getElementById('userSearchResults');
        
        if (modal) {
            if (input) input.value = '';
            if (results) results.innerHTML = '<div class="text-center text-muted" style="padding: 20px;">請輸入關鍵字進行搜尋</div>';
            modal.style.display = 'flex';
            if (input) input.focus();
        }
    }
    
    closeAddReviewerModal() {
        const modal = document.getElementById('addReviewerModal');
        if (modal) modal.style.display = 'none';
    }

    async searchUsersToAdd() {
        const input = document.getElementById('userSearchInput');
        const resultsContainer = document.getElementById('userSearchResults');
        const query = input.value.trim();
        
        if (!query) {
            NotificationUtils.show('請輸入搜尋關鍵字', 'warning');
            return;
        }

        try {
            resultsContainer.innerHTML = '<div class="text-center" style="padding: 20px;">搜尋中...</div>';
            
            const response = await window.apiClient.get('/reviewers/search', { q: query });
            
            if (response.success) {
                const users = response.data;
                if (users.length === 0) {
                    resultsContainer.innerHTML = '<div class="text-center text-muted" style="padding: 20px;">找不到符合的用戶</div>';
                    return;
                }

                resultsContainer.innerHTML = users.map(user => `
                    <div class="user-search-item" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #eee;">
                        <div class="user-info">
                            <div style="font-weight: bold;">${user.full_name || user.username}</div>
                            <div class="text-muted" style="font-size: 0.9em;">${user.email}</div>
                            <div class="text-muted" style="font-size: 0.8em;">部門: ${user.department || '-'} | ID: ${user.id}</div>
                        </div>
                        <button class="btn btn-sm btn-primary user-add-btn" data-id="${user.id}">
                            添加
                        </button>
                    </div>
                `).join('');
            } else {
                throw new Error(response.message || '搜尋失敗');
            }
        } catch (error) {
            console.error('搜尋用戶失敗:', error);
            resultsContainer.innerHTML = `<div class="error-message text-center" style="padding: 20px;">搜尋失敗: ${error.message}</div>`;
        }
    }

    async confirmAddReviewer(userId) {
        let loaderId;
        try {
            loaderId = LoadingUtils.show('正在添加審核者...');
            const response = await window.apiClient.post('/reviewers', { userId });
            
            if (response.success) {
                NotificationUtils.show('審核者添加成功', 'success');
                this.closeAddReviewerModal();
                this.loadReviewersList();
            } else {
                NotificationUtils.show(response.message || '添加失敗', 'error');
            }
        } catch (error) {
            console.error('添加審核者失敗:', error);
            NotificationUtils.show('添加審核者失敗', 'error');
        } finally {
            LoadingUtils.hide(loaderId);
        }
    }

    async removeReviewer(id) {
        if (!confirm('確定要移除此審核者嗎？該用戶將被降級為普通用戶。')) return;

        let loaderId;
        try {
            loaderId = LoadingUtils.show('正在移除審核者...');
            const response = await window.apiClient.delete(`/reviewers/${id}`);
            
            if (response.success) {
                NotificationUtils.show('審核者移除成功', 'success');
                this.loadReviewersList();
            } else {
                NotificationUtils.show(response.message || '移除失敗', 'error');
            }
        } catch (error) {
            console.error('移除審核者失敗:', error);
            NotificationUtils.show('移除審核者失敗', 'error');
        } finally {
            LoadingUtils.hide(loaderId);
        }
    }

    async loadWorkflows() {
        const container = document.getElementById('workflowsListBody');
        if (!container) return;

        try {
            container.innerHTML = '<tr><td colspan="5" class="text-center">載入中...</td></tr>';
            
            const response = await window.apiClient.get('/workflow/list');
            
            if (response.success) {
                const workflows = response.data;
                if (workflows.length === 0) {
                    container.innerHTML = '<tr><td colspan="5" class="text-center">暫無工作流程定義</td></tr>';
                    return;
                }

                container.innerHTML = workflows.map(wf => `
                    <tr>
                        <td>
                            ${wf.name}
                            ${wf.is_default ? '<span class="status-badge active" style="margin-left:5px; font-size:0.8em; background-color: #28a745;">預設</span>' : ''}
                        </td>
                        <td>${wf.description || '-'}</td>
                        <td>${wf.step_count}</td>
                        <td>
                            <span class="status-badge ${wf.is_active ? 'active' : 'inactive'}">
                                ${wf.is_active ? '啟用' : '停用'}
                            </span>
                        </td>
                        <td>
                            ${!wf.is_default ? `
                            <button class="btn-icon set-default-workflow-btn" data-id="${wf.id}" title="設為預設" style="color: #28a745;">
                                <i class="fas fa-check-circle"></i>
                            </button>
                            ` : ''}
                            <button class="btn-icon edit-workflow-btn" data-id="${wf.id}" title="編輯">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-icon danger delete-workflow-btn" data-id="${wf.id}" title="刪除">
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>
                    </tr>
                `).join('');
            } else {
                throw new Error(response.message || '載入失敗');
            }
        } catch (error) {
            console.error('載入工作流程列表失敗:', error);
            container.innerHTML = `<tr><td colspan="5" class="text-center error-text">載入失敗: ${error.message}</td></tr>`;
        }
    }

    async setAsDefault(id) {
        let loaderId;
        try {
            loaderId = LoadingUtils.show('正在設定預設流程...');
            const response = await window.apiClient.post(`/workflow/${id}/set-default`);
            if (response.success) {
                NotificationUtils.show('已設為預設工作流程', 'success');
                this.loadWorkflows();
            } else {
                throw new Error(response.message || '操作失敗');
            }
        } catch (error) {
            console.error('設定失敗:', error);
            NotificationUtils.show('設定失敗', 'error');
        } finally {
            LoadingUtils.hide(loaderId);
        }
    }

    async openWorkflowEditor(id = null) {
        const editor = document.getElementById('workflowEditor');
        const list = document.getElementById('workflowsListContainer');
        const title = document.getElementById('workflowEditorTitle');
        const form = document.getElementById('workflowDefinitionForm');
        
        if (!editor || !list) return;

        // Reset form
        form.reset();
        document.getElementById('workflowStepsBody').innerHTML = '';
        form.dataset.id = id || '';
        
        if (id) {
            title.textContent = '編輯工作流程';
            let loaderId;
            try {
                loaderId = LoadingUtils.show('正在載入工作流程...');
                // Load workflow details
                const response = await window.apiClient.get(`/workflow/${id}`);
                if (response.success) {
                    const { name, description, steps } = response.data;
                    document.getElementById('workflowName').value = name;
                    document.getElementById('workflowDescription').value = description || '';
                    
                    // Render steps
                    if (steps && steps.length > 0) {
                        steps.forEach(step => this.addStepRow(step));
                    } else {
                        this.addStepRow();
                    }
                }
            } catch (error) {
                console.error('載入工作流程詳情失敗:', error);
                NotificationUtils.show('載入詳情失敗', 'error');
                return;
            } finally {
                LoadingUtils.hide(loaderId);
            }
        } else {
            title.textContent = '新增工作流程';
            this.addStepRow();
        }

        list.style.display = 'none';
        editor.style.display = 'block';
    }
    
    closeWorkflowEditor() {
        document.getElementById('workflowEditor').style.display = 'none';
        document.getElementById('workflowsListContainer').style.display = 'block';
    }

    async saveWorkflowDefinition() {
        const form = document.getElementById('workflowDefinitionForm');
        const id = form.dataset.id;
        
        const name = document.getElementById('workflowName').value.trim();
        const description = document.getElementById('workflowDescription').value.trim();
        
        if (!name) {
            NotificationUtils.show('請輸入流程名稱', 'error');
            return;
        }

        // Collect steps
        const stepRows = document.querySelectorAll('.step-row');
        const steps = [];
        let isValid = true;

        stepRows.forEach((row, index) => {
            const stepName = row.querySelector('.step-name').value.trim();
            const approverType = row.querySelector('.approver-type').value;
            const approverId = row.querySelector('.approver-select').value;
            const isRequired = row.querySelector('.is-required').checked;

            if (!stepName) {
                isValid = false;
                NotificationUtils.show(`第 ${index + 1} 步缺少步驟名稱`, 'error');
                return;
            }

            if (!approverId) {
                isValid = false;
                NotificationUtils.show(`第 ${index + 1} 步未選擇審核者`, 'error');
                return;
            }

            steps.push({
                id: row.dataset.stepId || null,
                step_name: stepName,
                approver_type: approverType,
                approver_id: approverId,
                is_required: isRequired
            });
        });

        if (!isValid) return;

        let loaderId;
        try {
            loaderId = LoadingUtils.show('正在保存...');
            const payload = { name, description, steps };
            
            let response;
            if (id) {
                response = await window.apiClient.put(`/workflow/${id}/steps`, payload);
            } else {
                response = await window.apiClient.post('/workflow', payload);
            }

            if (response.success) {
                NotificationUtils.show('保存成功', 'success');
                this.closeWorkflowEditor();
                this.loadWorkflows();
            } else {
                throw new Error(response.message || '保存失敗');
            }
        } catch (error) {
            console.error('保存失敗:', error);
            NotificationUtils.show(error.message || '保存失敗', 'error');
        } finally {
            LoadingUtils.hide(loaderId);
        }
    }

    addStepRow(step = null) {
        const tbody = document.getElementById('workflowStepsBody');
        const row = document.createElement('tr');
        row.className = 'step-row';
        if (step && step.id) {
            row.dataset.stepId = step.id;
        }
        
        const stepName = step ? step.step_name : '';
        const approverType = step ? step.approver_type : 'Role';
        const approverId = step ? step.approver_id : '';
        const isRequired = step ? (step.is_required || step.is_required === 1) : true;

        const roleMap = {
            'Admin': '管理員 (Admin)',
            'Manager': '經理 (Manager)',
            'Editor': '編輯 (Editor)',
            'Viewer': '訪客 (Viewer)',
            'Approver': '審核員 (Approver)'
        };
        const roles = Object.keys(roleMap);
        
        row.innerHTML = `
            <td class="step-number"></td>
            <td>
                <input type="text" class="form-input step-name" value="${stepName}" placeholder="例如：部門主管審核" required style="width: 100%;">
            </td>
            <td>
                <select class="form-select approver-type" onchange="window.settingsManager.handleApproverTypeChange(this)">
                    <option value="Role" ${approverType === 'Role' ? 'selected' : ''}>角色</option>
                    <option value="User" ${approverType === 'User' ? 'selected' : ''}>特定用戶</option>
                </select>
            </td>
            <td>
                <select class="form-select approver-select" ${approverType === 'User' ? `data-initial-value="${approverId}"` : ''}>
                    ${roles.map(r => `<option value="${r}" ${approverType === 'Role' && approverId === r ? 'selected' : ''}>${roleMap[r]}</option>`).join('')}
                    ${approverType === 'User' ? `<option value="">載入中...</option>` : ''}
                </select>
            </td>
            <td class="text-center">
                <input type="checkbox" class="is-required" ${isRequired ? 'checked' : ''}>
            </td>
            <td>
                <button type="button" class="btn-icon danger remove-step-btn">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;

        tbody.appendChild(row);
        this.updateStepNumbers();
        
        if (approverType === 'User') {
             this.handleApproverTypeChange(row.querySelector('.approver-type'));
        }
    }

    handleApproverTypeChange(select) {
        const row = select.closest('tr');
        const targetSelect = row.querySelector('.approver-select');
        const type = select.value;
        
        let currentValue = targetSelect.dataset.initialValue;
        if (currentValue !== undefined) {
            delete targetSelect.dataset.initialValue;
            targetSelect.removeAttribute('data-initial-value');
        } else {
            currentValue = targetSelect.value;
        }
        
        if (type === 'Role') {
            const roleMap = {
                'Admin': '管理員 (Admin)',
                'Manager': '經理 (Manager)',
                'Editor': '編輯 (Editor)',
                'Viewer': '訪客 (Viewer)',
                'Approver': '審核員 (Approver)'
            };
            const roles = Object.keys(roleMap);
            targetSelect.innerHTML = roles.map(r => `<option value="${r}">${roleMap[r]}</option>`).join('');
        } else {
            targetSelect.innerHTML = '<option value="">載入中...</option>';
            window.apiClient.get('/reviewers').then(res => {
                if (res.success) {
                    if (res.data.length === 0) {
                        targetSelect.innerHTML = '<option value="">無可用審核者 (請先添加)</option>';
                    } else {
                        targetSelect.innerHTML = res.data.map(u => 
                            `<option value="${u.id}" ${u.id == currentValue ? 'selected' : ''}>${u.full_name || u.username}</option>`
                        ).join('');
                        
                        // 如果當前值存在但不在列表中（例如已刪除），則添加一個選項提示
                        if (currentValue && !res.data.find(u => u.id == currentValue)) {
                            targetSelect.innerHTML += `<option value="" disabled selected>原審核者已刪除</option>`;
                        }
                    }
                }
            });
        }
    }

    updateStepNumbers() {
        document.querySelectorAll('.step-row .step-number').forEach((el, index) => {
            el.textContent = index + 1;
        });
    }

    async deleteWorkflow(id) {
        if (!confirm('確定要刪除此工作流程嗎？此操作無法撤銷。')) return;

        let loaderId;
        try {
            loaderId = LoadingUtils.show('正在刪除...');
            const response = await window.apiClient.delete(`/workflow/${id}`);
            
            if (response.success) {
                NotificationUtils.show('刪除成功', 'success');
                this.loadWorkflows();
            } else {
                throw new Error(response.message || '刪除失敗');
            }
        } catch (error) {
            console.error('刪除失敗:', error);
            NotificationUtils.show('刪除失敗', 'error');
        } finally {
            LoadingUtils.hide(loaderId);
        }
    }
}

// 初始化
window.settingsManager = new SettingsManager();
// window.categoryManagement should be instantiated in category-management.js
// But we need to make sure it's available globally.
// In category-management.js: window.categoryManagement = new CategoryManagement();
document.addEventListener('DOMContentLoaded', () => {
    window.settingsManager.init();
});
