const http = require('http');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

async function runTest() {
    // 1. Create a test HTML file with CSS and Variables
    const htmlContent = `
    <html>
    <head>
        <style>
            .title { color: red; font-size: 20px; }
            .content { background: #eee; }
        </style>
    </head>
    <body>
        <div class="title">{{subject}}</div>
        <div class="content">Date: {{date}}</div>
        <div data-zone="z1"></div>
    </body>
    </html>
    `;
    
    fs.writeFileSync('test_modern.html', htmlContent);
    console.log('1. Created test_modern.html');

    // 2. Create a ZIP file containing this HTML
    const zip = new AdmZip();
    zip.addLocalFile('test_modern.html');
    zip.writeZip('test_modern.zip');
    console.log('2. Created test_modern.zip');

    // 3. Upload ZIP
    console.log('3. Uploading ZIP...');
    const boundary = '--------------------------' + Date.now().toString(16);
    
    const header = `--${boundary}\r\n` +
                   `Content-Disposition: form-data; name="file"; filename="test_modern.zip"\r\n` +
                   `Content-Type: application/zip\r\n` +
                   `\r\n`;
    const footer = `\r\n--${boundary}--`;
    
    const fileContent = fs.readFileSync('test_modern.zip');
    const postDataUpload = Buffer.concat([
        Buffer.from(header),
        fileContent,
        Buffer.from(footer)
    ]);

    const uploadResult = await makeRequest('/api/templates-modern/upload', 'POST', postDataUpload, {
        'Content-Type': 'multipart/form-data; boundary=' + boundary
    });

    console.log('Upload Result:', uploadResult);
    const resultObj = JSON.parse(uploadResult);
    
    if (!resultObj.success) {
        throw new Error(resultObj.message);
    }

    const parsedHtml = resultObj.html_content;

    // 4. Render with Custom Variables
    console.log('4. Rendering with Custom Variables...');
    const renderPayload = JSON.stringify({
        html_content: parsedHtml,
        config: { z1_count: 1 },
        articles: { articles_z1: [] },
        date: '2099-12-31',
        subject: 'Future Subject'
    });

    const renderResult = await makeRequest('/api/templates-modern/render', 'POST', Buffer.from(renderPayload), {
        'Content-Type': 'application/json'
    });

    const renderedHtml = JSON.parse(renderResult).html;
    console.log('Rendered HTML Snippet:', renderedHtml.substring(0, 300)); // Show beginning

    // Verification
    if (renderedHtml.includes('style="color: red; font-size: 20px;"')) {
        console.log('✅ CSS Inlined');
    } else {
        console.error('❌ CSS Not Inlined');
    }

    if (renderedHtml.includes('2099-12-31')) {
        console.log('✅ Date Replaced');
    } else {
        console.error('❌ Date Not Replaced');
    }

    if (renderedHtml.includes('Future Subject')) {
        console.log('✅ Subject Replaced');
    } else {
        console.error('❌ Subject Not Replaced');
    }
}

function makeRequest(path, method, data, headers) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3001,
            path: path,
            method: method,
            headers: {
                ...headers,
                'Content-Length': data.length
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => resolve(body));
        });

        req.on('error', (e) => reject(e));
        req.write(data);
        req.end();
    });
}

runTest().catch(console.error);
