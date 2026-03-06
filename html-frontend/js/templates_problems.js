async loadDefaultAssets() {
        // 使用與「文中標準EDM」完全一致的 HTML 結構與樣式
        // 修正重點：在 td 加入 font-size:0px，並確保 img 使用 display:block
        const standardBodyAttrs = 'bgcolor="#ffffff" background="https://www.winton.com.tw/winton/edm/model/sale/images/pattern.gif" style="margin:0; padding:0;"';
        
        // --- 修正後的 Header (解決上方被切) ---
        const headerHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
body { margin: 0; padding: 0; }
img { border: 0; display: block; }
</style>
</head>
<body ${standardBodyAttrs}>
<div class="header" style="margin:0; padding:0;">
    <center>
        <table border="0" width="900" id="table9" cellspacing="0" cellpadding="0" style="margin:0; padding:0; border-collapse:collapse;">
            <tr>
                <td style="padding:0; margin:0; line-height:0px; font-size:0px;">
                    <a href="https://www.winton.com.tw" target="_blank" style="text-decoration:none; display:block;">
                        <img border="0" src="https://www.winton.com.tw/winton/edm/model/sale/images/head_900px.jpg" 
                             width="900" 
                             style="display:block; border:0; vertical-align:top;" alt="文中資訊">
                    </a>
                </td>
            </tr>
        </table>
    </center>
</div>
</body>
</html>`;

        // --- 修正後的 Footer (解決下方被切) ---
        const footerHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
body { margin: 0; padding: 0; }
img { border: 0; display: block; }
td { font-family: Verdana, Arial, Helvetica, sans-serif; font-size: 8pt; color: #000000; }
a { text-decoration: none; color: #FFFFFF; }
</style>
</head>
<body ${standardBodyAttrs}>
<div class="footer" style="margin:0; padding:0;">
    <center>
        <table border="0" width="900" id="table13" cellspacing="0" cellpadding="0" style="margin:0; padding:0; border-collapse:collapse;">
            <tr>
                <td style="padding:0; margin:0; line-height:0px; font-size:0px;">
                <img border="0" src="https://www.winton.com.tw/winton/edm/model/sale/images/b.gif" width="900" height="18" style="display:block; border:0;"></td>
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
                <td bgcolor="#CCCCCC" style="padding:0; margin:0; line-height:0px; font-size:0px;">
                <img border="0" src="https://www.winton.com.tw/winton/edm/model/sale/images/foot_SE_900px.jpg" width="900" height="89" style="display:block; border:0;"></td>
            </tr>
        </table>
    </center>
</div>
</body>
</html>`;

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