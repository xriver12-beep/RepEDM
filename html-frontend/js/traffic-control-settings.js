
document.addEventListener('DOMContentLoaded', () => {
    // Wait for other scripts to initialize
    setTimeout(initTrafficControlSettings, 500);
});

async function initTrafficControlSettings() {
    const section = document.querySelector('.settings-nav-item[data-section="traffic-control"]');
    if (!section) return;

    // Load initial data when section is clicked
    section.addEventListener('click', loadTrafficControlData);

    // Initial load if it's the active section (unlikely on fresh load but good practice)
    if (section.classList.contains('active')) {
        loadTrafficControlData();
    }

    // Bind Buttons
    const saveWarmupBtn = document.getElementById('saveWarmupSettingsBtn');
    if (saveWarmupBtn) {
        saveWarmupBtn.addEventListener('click', saveWarmupSettings);
    }

    const saveCacheBtn = document.getElementById('saveCacheSettingsBtn');
    if (saveCacheBtn) {
        saveCacheBtn.addEventListener('click', saveCacheSettings);
    }

    const addDomainRuleBtn = document.getElementById('addDomainRuleBtn');
    if (addDomainRuleBtn) {
        addDomainRuleBtn.addEventListener('click', openAddDomainRuleModal);
    }

    // Modal bindings
    const closeBtn = document.getElementById('closeDomainRuleModalBtn');
    const cancelBtn = document.getElementById('cancelDomainRuleModalBtn');
    const saveRuleBtn = document.getElementById('saveDomainRuleBtn');

    if (closeBtn) closeBtn.addEventListener('click', closeDomainRuleModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeDomainRuleModal);
    if (saveRuleBtn) saveRuleBtn.addEventListener('click', saveDomainRule);
}

async function loadTrafficControlData() {
    await Promise.all([
        loadWarmupSettings(),
        loadDomainRules(),
        loadCacheSettings()
    ]);
}

async function loadWarmupSettings() {
    try {
        const response = await apiClient.get('/traffic-control/warmup');
        if (response.success && response.data) {
            const settings = response.data;
            document.getElementById('warmupActive').checked = settings.is_active;
            
            if (settings.start_date) {
                // Format date to YYYY-MM-DD
                const date = new Date(settings.start_date);
                const dateStr = date.toISOString().split('T')[0];
                document.getElementById('warmupStartDate').value = dateStr;
            }
            
            document.getElementById('warmupDailyLimit').value = settings.daily_limit;
            document.getElementById('warmupMultiplier').value = settings.multiplier;
        } else {
            // Defaults
            document.getElementById('warmupActive').checked = false;
            document.getElementById('warmupDailyLimit').value = 1000;
            document.getElementById('warmupMultiplier').value = 1.5;
            document.getElementById('warmupStartDate').value = new Date().toISOString().split('T')[0];
        }
    } catch (error) {
        console.error('Error loading warmup settings:', error);
    }
}

async function loadDomainRules() {
    try {
        const response = await apiClient.get('/traffic-control/domains');
        const tbody = document.querySelector('#domainRulesTable tbody');
        tbody.innerHTML = '';

        if (response.success && Array.isArray(response.data)) {
            response.data.forEach(rule => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${escapeHtml(rule.domain)}</td>
                    <td>${rule.max_per_minute}</td>
                    <td>${rule.max_per_hour}</td>
                    <td>
                        <button class="btn-icon edit-rule" data-domain="${escapeHtml(rule.domain)}" 
                                data-minute="${rule.max_per_minute}" data-hour="${rule.max_per_hour}">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon delete-rule" data-domain="${escapeHtml(rule.domain)}">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            });

            // Bind dynamic buttons
            document.querySelectorAll('.edit-rule').forEach(btn => {
                btn.addEventListener('click', () => openEditDomainRuleModal(btn.dataset));
            });
            document.querySelectorAll('.delete-rule').forEach(btn => {
                btn.addEventListener('click', () => deleteDomainRule(btn.dataset.domain));
            });
        }
    } catch (error) {
        console.error('Error loading domain rules:', error);
    }
}

async function loadCacheSettings() {
    try {
        const response = await apiClient.get('/settings');
        if (response.success && response.data) {
            // Settings API returns an object { general: {...}, advanced: {...}, ... }
            const advancedSettings = response.data.advanced;
            if (advancedSettings && advancedSettings.cacheTimeout !== undefined) {
                document.getElementById('trafficCacheTimeout').value = advancedSettings.cacheTimeout;
            } else {
                document.getElementById('trafficCacheTimeout').value = 60; // Default
            }
        }
    } catch (error) {
        console.error('Error loading cache settings:', error);
    }
}

async function saveWarmupSettings() {
    const isActive = document.getElementById('warmupActive').checked;
    const startDate = document.getElementById('warmupStartDate').value;
    const dailyLimit = parseInt(document.getElementById('warmupDailyLimit').value);
    const multiplier = parseFloat(document.getElementById('warmupMultiplier').value);

    if (!startDate || isNaN(dailyLimit) || isNaN(multiplier)) {
        alert('請填寫所有欄位');
        return;
    }

    try {
        const response = await apiClient.put('/traffic-control/warmup', {
            is_active: isActive,
            start_date: startDate,
            daily_limit: dailyLimit,
            multiplier: multiplier
        });

        if (response.success) {
            alert('預熱設定已保存');
        } else {
            alert('保存失敗: ' + response.message);
        }
    } catch (error) {
        console.error('Error saving warmup settings:', error);
        alert('保存失敗，請檢查網路連線');
    }
}

async function saveCacheSettings() {
    const timeout = parseInt(document.getElementById('trafficCacheTimeout').value);
    if (isNaN(timeout) || timeout < 1) {
        alert('請輸入有效的快取時間 (秒)');
        return;
    }

    try {
        // Use PUT /settings/advanced to update specific section
        const response = await apiClient.put('/settings/advanced', { cacheTimeout: timeout });
        
        if (response.success) {
            alert('效能設定已保存');
        } else {
            alert('保存失敗: ' + response.message);
        }
    } catch (error) {
        console.error('Error saving cache settings:', error);
        alert('保存失敗');
    }
}

// Modal Functions
function openAddDomainRuleModal() {
    document.getElementById('ruleDomain').value = '';
    document.getElementById('ruleDomain').disabled = false; // Allow editing domain
    document.getElementById('ruleMaxPerMinute').value = '60';
    document.getElementById('ruleMaxPerHour').value = '3600';
    
    // Check if we are using the modal overlay class or simple display
    // The existing modal in settings.html uses class="modal-overlay" and id="domainRuleModal"
    // It is hidden with style="display: none;"
    const modal = document.getElementById('domainRuleModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function openEditDomainRuleModal(data) {
    document.getElementById('ruleDomain').value = data.domain;
    document.getElementById('ruleDomain').disabled = true; // Cannot change domain key
    document.getElementById('ruleMaxPerMinute').value = data.minute;
    document.getElementById('ruleMaxPerHour').value = data.hour;
    
    const modal = document.getElementById('domainRuleModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeDomainRuleModal() {
    const modal = document.getElementById('domainRuleModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

async function saveDomainRule() {
    const domain = document.getElementById('ruleDomain').value.trim();
    const maxPerMinute = parseInt(document.getElementById('ruleMaxPerMinute').value);
    const maxPerHour = parseInt(document.getElementById('ruleMaxPerHour').value);

    if (!domain || isNaN(maxPerMinute) || isNaN(maxPerHour)) {
        alert('請填寫完整資訊');
        return;
    }

    try {
        const response = await apiClient.post('/traffic-control/domains', {
            domain,
            max_per_minute: maxPerMinute,
            max_per_hour: maxPerHour
        });

        if (response.success) {
            closeDomainRuleModal();
            loadDomainRules(); // Reload table
        } else {
            alert('保存失敗: ' + response.message);
        }
    } catch (error) {
        console.error('Error saving domain rule:', error);
        alert('保存失敗');
    }
}

async function deleteDomainRule(domain) {
    if (!confirm(`確定要刪除 ${domain} 的速率規則嗎？`)) return;

    try {
        const response = await apiClient.delete(`/traffic-control/domains/${encodeURIComponent(domain)}`);
        if (response.success) {
            loadDomainRules();
        } else {
            alert('刪除失敗: ' + response.message);
        }
    } catch (error) {
        console.error('Error deleting domain rule:', error);
        alert('刪除失敗');
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
