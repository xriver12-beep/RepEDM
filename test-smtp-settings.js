const fetch = require('node-fetch');

async function testSmtpSettings() {
    const testData = {
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        username: 'test@gmail.com',
        password: 'testpassword'
    };

    console.log('測試 SMTP 設定 API...');
    console.log('發送資料:', testData);

    try {
        const response = await fetch('http://localhost:3001/api/settings/smtp', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer test-token' // 這裡需要實際的認證 token
            },
            body: JSON.stringify(testData)
        });

        const result = await response.json();
        console.log('回應狀態:', response.status);
        console.log('回應資料:', result);

        if (!response.ok) {
            console.error('API 錯誤:', result);
        } else {
            console.log('✅ SMTP 設定保存成功');
        }
    } catch (error) {
        console.error('請求失敗:', error);
    }
}

testSmtpSettings();