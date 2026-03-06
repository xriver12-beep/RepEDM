require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { connectDB, executeQuery, closeDB } = require('./src/config/database');
const sql = require('mssql');

async function main() {
    try {
        console.log('Connecting to database...');
        await connectDB();

        // 1. Get Admin User ID
        const userResult = await executeQuery("SELECT TOP 1 id FROM Users WHERE role = 'Admin' OR role = 'admin'");
        let adminUserId = null;
        if (userResult.recordset.length > 0) {
            adminUserId = userResult.recordset[0].id;
            console.log('Found Admin User ID:', adminUserId);
        } else {
            console.log('Admin user not found. Trying to find ANY user.');
             const anyUser = await executeQuery("SELECT TOP 1 id FROM Users");
             if (anyUser.recordset.length > 0) {
                 adminUserId = anyUser.recordset[0].id;
                 console.log('Using fallback user ID:', adminUserId);
             } else {
                 console.log('No users found. CreatedBy will be NULL.');
             }
        }

        // 2. Read HTML content
        const htmlPath = path.join('c:', 'WintonEDM', 'Template', 'winton_banner.html');
        console.log('Reading HTML from:', htmlPath);
        let htmlContent = fs.readFileSync(htmlPath, 'utf8');

        // 3. Insert Template
        const name = '文中標準EDM (Banner)';
        const subject = '文中標準EDM (Banner)';
        const text_content = '文中標準EDM (Banner)';
        const template_type = 'email';
        const is_public = 1;
        const is_active = 1;

        console.log('Inserting template...');
        const insertQuery = `
            INSERT INTO Templates (
                name, subject, html_content, text_content, template_type,
                is_active, is_public, created_by, updated_at, category_id
            ) VALUES (
                @name, @subject, @htmlContent, @textContent, @templateType,
                @isActive, @isPublic, @createdBy, GETDATE(), @categoryId
            )
        `;

        await executeQuery(insertQuery, {
            name,
            subject,
            htmlContent: htmlContent,
            textContent: text_content,
            templateType: template_type,
            isActive: is_active,
            isPublic: is_public,
            createdBy: adminUserId,
            categoryId: null
        });

        console.log('Template "文中標準EDM (Banner)" added successfully!');

    } catch (err) {
        console.error('Error adding template:', err);
    } finally {
        await closeDB();
    }
}

main();
