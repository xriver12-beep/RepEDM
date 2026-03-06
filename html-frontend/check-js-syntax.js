const fs = require('fs');
const path = require('path');

// 檢查 JavaScript 文件語法
function checkJSSyntax(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        // 嘗試解析 JavaScript
        new Function(content);
        console.log(`✅ ${path.basename(filePath)} - 語法正確`);
        return true;
    } catch (error) {
        console.log(`❌ ${path.basename(filePath)} - 語法錯誤:`, error.message);
        return false;
    }
}

// 檢查主要的 JavaScript 文件
const jsFiles = [
    './js/utils.js',
    './js/components.js',
    './js/campaigns.js',
    './js/state-manager.js',
    './js/api.js',
    './js/admin-auth.js'
];

console.log('🔍 檢查 JavaScript 文件語法...\n');

let allValid = true;
jsFiles.forEach(file => {
    if (fs.existsSync(file)) {
        const isValid = checkJSSyntax(file);
        if (!isValid) allValid = false;
    } else {
        console.log(`⚠️ ${file} - 文件不存在`);
        allValid = false;
    }
});

console.log('\n' + (allValid ? '✅ 所有文件語法正確' : '❌ 發現語法錯誤'));