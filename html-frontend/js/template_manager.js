document.addEventListener('DOMContentLoaded', () => {
    const btnParse = document.getElementById('btnParse');
    const btnUpdatePreview = document.getElementById('btnUpdatePreview');
    const btnSave = document.getElementById('btnSave');
    const htmlFileInput = document.getElementById('htmlFile');
    const templateNameInput = document.getElementById('templateName');
    const zoneConfigSection = document.getElementById('zoneConfigSection');
    const globalVarsSection = document.getElementById('globalVarsSection');
    const globalDateInput = document.getElementById('globalDate');
    const globalSubjectInput = document.getElementById('globalSubject');
    const actionsSection = document.getElementById('actionsSection');
    const zonesList = document.getElementById('zonesList');
    const previewFrame = document.getElementById('previewFrame');

    let currentHtmlContent = '';
    let detectedZones = [];

    // Helper: Read file
    const readFile = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file);
        });
    };

    // 1. Parse Button
    btnParse.addEventListener('click', async () => {
        const file = htmlFileInput.files[0];
        if (!file) {
            alert('請先選擇檔案');
            return;
        }

        try {
            // Use Upload API instead of client-side read
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/api/templates-modern/upload', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            if (result.success) {
                currentHtmlContent = result.html_content;
                detectedZones = result.zones;
                renderZonesList(detectedZones);
                zoneConfigSection.style.display = 'block';
                actionsSection.style.display = 'block';
                
                // Auto preview once
                triggerPreview();
            } else {
                alert('解析失敗: ' + result.message);
            }
        } catch (error) {
            console.error(error);
            alert('發生錯誤');
        }
    });

    // Render Zones UI
    function renderZonesList(zones) {
        zonesList.innerHTML = '';
        if (zones.length === 0) {
            zonesList.innerHTML = '<div style="padding:10px; color:#666;">未偵測到動態區塊</div>';
            return;
        }

        zones.forEach((zone, index) => {
            const div = document.createElement('div');
            div.className = 'zone-item';
            div.innerHTML = `
                <div class="zone-header">
                    <strong>${zone.zone_key}</strong>
                    <span>Detected</span>
                </div>
                <div class="form-group">
                    <label>顯示名稱 (Label)</label>
                    <input type="text" class="zone-label" value="${zone.label || zone.zone_key}" data-index="${index}">
                </div>
                <div class="form-group">
                    <label>預設文章數: <span id="count-display-${index}">${zone.default_count}</span></label>
                    <input type="range" class="zone-count" min="0" max="${zone.max_count}" value="${zone.default_count}" data-index="${index}" oninput="document.getElementById('count-display-${index}').innerText = this.value">
                </div>
            `;
            zonesList.appendChild(div);
        });
    }

    // 2. Preview Logic
    btnUpdatePreview.addEventListener('click', triggerPreview);

    async function triggerPreview() {
        // Collect config
        const config = {};
        const articles = {}; // Mock data

        const countInputs = document.querySelectorAll('.zone-count');
        countInputs.forEach(input => {
            const index = input.getAttribute('data-index');
            const zone = detectedZones[index];
            const count = parseInt(input.value);
            
            // Config for Handlebars: zone_1_count
            config[`${zone.zone_key}_count`] = count;

            // Mock Data for Handlebars: articles_zone_1
            // Generate mock articles based on count
            const mockList = [];
            for (let i = 1; i <= count; i++) {
                mockList.push({
                    title: `範例文章標題 ${i} (${zone.zone_key})`,
                    summary: `這是第 ${i} 篇文章的摘要內容。測試動態渲染效果。`,
                    image: 'https://via.placeholder.com/300x200?text=Image+' + i,
                    url: '#'
                });
            }
            articles[`articles_${zone.zone_key}`] = mockList;
        });

        try {
            const response = await fetch('/api/templates-modern/render', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    html_content: currentHtmlContent,
                    config: config,
                    articles: articles,
                    date: globalDateInput.value,
                    subject: globalSubjectInput.value
                })
            });

            const result = await response.json();
            if (result.success) {
                const doc = previewFrame.contentWindow.document;
                doc.open();
                doc.write(result.html);
                doc.close();
            } else {
                alert('預覽失敗: ' + result.message);
            }
        } catch (error) {
            console.error(error);
            alert('預覽錯誤');
        }
    }

    // 3. Save Logic
    btnSave.addEventListener('click', async () => {
        const name = templateNameInput.value.trim();
        if (!name) {
            alert('請輸入樣板名稱');
            return;
        }

        // Collect final zone config
        const finalZones = [];
        const labelInputs = document.querySelectorAll('.zone-label');
        const countInputs = document.querySelectorAll('.zone-count');

        labelInputs.forEach((input, i) => {
            const zone = detectedZones[i];
            finalZones.push({
                zone_key: zone.zone_key,
                label: input.value,
                default_count: parseInt(countInputs[i].value),
                max_count: 10
            });
        });

        try {
            const response = await fetch('/api/templates-modern/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name,
                    html_content: currentHtmlContent,
                    zones: finalZones,
                    preview_image: '' // Optional: could capture from iframe
                })
            });

            const result = await response.json();
            if (result.success) {
                alert('樣板儲存成功！ID: ' + result.id);
                // Redirect or clear
                window.location.reload();
            } else {
                alert('儲存失敗: ' + result.message);
            }
        } catch (error) {
            console.error(error);
            alert('儲存錯誤');
        }
    });
});
