const { executeQuery, connectDB, closeDB } = require('../src/config/database');

async function addStandardTemplate() {
    try {
        await connectDB();
        console.log('Starting to add standard template...');

        // 1. Ensure Category Exists
        const categoryName = '文中標準EDM';
        let categoryId;
        
        const catQuery = `SELECT id FROM TemplateCategories WHERE name = @name`;
        const catResult = await executeQuery(catQuery, { name: categoryName });
        
        if (catResult.recordset.length > 0) {
            categoryId = catResult.recordset[0].id;
            console.log(`Category '${categoryName}' found with ID: ${categoryId}`);
        } else {
            const createCatQuery = `
                INSERT INTO TemplateCategories (name, description, is_system, created_by)
                OUTPUT INSERTED.id
                VALUES (@name, '文中資訊標準 EDM', 1, 1)
            `;
            // Assuming user ID 1 exists (usually admin)
            const createCatResult = await executeQuery(createCatQuery, { name: categoryName });
            categoryId = createCatResult.recordset[0].id;
            console.log(`Created category '${categoryName}' with ID: ${categoryId}`);
        }

        // 2. Prepare HTML Content
        const headerHtml = `
<div class="header" style="margin:0; padding:0;">
    <center>
        <table border="0" width="900" id="table9" cellspacing="0" cellpadding="0" style="margin:0; padding:0; border-collapse:collapse;">
            <tr>
                <td style="padding:0; margin:0; line-height:0; font-size:0;"><map name="FPMap0">
                <area target="_blank" coords="18, 16, 276, 60" shape="rect" href="https://www.winton.com.tw">
                </map>
                <img border="0" src="https://www.winton.com.tw/winton/edm/model/sale/images/head_900px.jpg" width="900" height="82" usemap="#FPMap0" style="display:block; border:0; vertical-align:bottom;"></td>
            </tr>
        </table>
    </center>
</div>`;

        const mainHtml = `
<div class="main" style="margin:0; padding:0;">
    <center>
        <table border="0" width="900" cellspacing="0" cellpadding="0" bgcolor="#ffffff" style="margin:0; padding:0; border-collapse:collapse;">
            <tr>
                <td style="padding: 20px; font-family: Verdana, Arial, Helvetica, sans-serif; font-size: 10pt; line-height: 1.5;">
                    <p style="text-align: center; color: #666; margin: 0;">請在此輸入內容...</p>
                </td>
            </tr>
        </table>
    </center>
</div>`;

        const footerHtml = `
<div class="footer" style="margin:0; padding:0;">
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
                如您點選【我不要再收到商品訊息郵件】</font>，我們將會把您的資料由電子郵件名單中刪除！文中資訊版權所有，未經確認授權，嚴禁轉貼節錄。</font></span></font></td>
            </tr>
            <tr>
                <td bgcolor="#3474E9" style="padding:0; margin:0;">
                <p align="center" style="margin:0; padding: 5px 0; line-height: 1.5;"><font size="2"><strong style="font-weight: 400">
                <font color="#FFFFFF">
                <a href="{{unsubscribe_url}}" target="_blank" style="text-decoration:none;">
                <font color="#FF0000" face="新細明體">【一鍵取消訂閱】</font></a>
                <font color="#FFFFFF">&nbsp;&nbsp;</font>
                <a href="mailto:hrsales@winton.com.tw;noedm@winton.com.tw?subject=我不要再收到商品訊息郵件" style="text-decoration:none;">
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

        const fullHtml = `<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<title>文中電子報</title>
<style type="text/css">
body {	font-family: Verdana, Arial, Helvetica, sans-serif;
		scrollbar-3dlight-color: #CCCCCC;
		scrollbar-arrow-color: #ECEDEE;
		scrollbar-base-color: Silver;
		scrollbar-darkshadow-color: white;
		scrollbar-face-color: #DCDDDE;
		scrollbar-highlight-color: white;
		scrollbar-shadow-color: #999999; 
        margin: 0; padding: 0;
}
td {font-size:8pt;color:#000000;font-family:verdana}
a {text-decoration: none;font-weight: none;color:#2200AA}
a:hover {text-decoration: underline;color:#C71585}

.name {font-size:13pt; font-family:verdana; font-weight:bold; color: #000000;}
.title {font-size:11pt; font-family:verdana; font-weight:bold; color: #003377;}
.text {font-size:8pt; font-family:verdana; color: #000000;}
.copyright {font-size:7pt; font-family:verdana; color: #edf7fa;}
 .font3 {font-size: 9pt;line-height: 14pt;font-family:verdana;}
div.Section1
	{page:Section1;}
img {
border:0px;
vertical-align:0;
display:block;
}	
</style>
<style fprolloverstyle>A:hover {font-weight: bold}
</style>
</head>
<body bgcolor="#ffffff" background="https://www.winton.com.tw/winton/edm/model/sale/images/pattern.gif" topmargin="0" leftMargin="0" marginwidth="0" marginheight="0" style="margin:0; padding:0;">
${headerHtml}
${mainHtml}
${footerHtml}
</body>
</html>`;

        // 3. Upsert Template
        const templateName = '文中標準EDM';
        const templateQuery = `SELECT id FROM Templates WHERE name = @name`;
        const templateResult = await executeQuery(templateQuery, { name: templateName });

        if (templateResult.recordset.length > 0) {
            // Update
            const updateQuery = `
                UPDATE Templates 
                SET html_content = @htmlContent,
                    category_id = @categoryId,
                    updated_at = GETDATE(),
                    subject = '文中電子報'
                WHERE name = @name
            `;
            await executeQuery(updateQuery, { 
                htmlContent: fullHtml,
                categoryId,
                name: templateName
            });
            console.log(`Updated template '${templateName}'`);
        } else {
            // Insert
            const insertQuery = `
                INSERT INTO Templates (name, subject, html_content, text_content, template_type, created_by, category_id, is_public, is_active)
                VALUES (@name, '文中電子報', @htmlContent, '文中電子報標準EDM', 'email', 1, @categoryId, 1, 1)
            `;
            await executeQuery(insertQuery, {
                name: templateName,
                htmlContent: fullHtml,
                categoryId
            });
            console.log(`Created template '${templateName}'`);
        }

        console.log('Done.');
        await closeDB();
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        await closeDB();
        process.exit(1);
    }
}

addStandardTemplate();
