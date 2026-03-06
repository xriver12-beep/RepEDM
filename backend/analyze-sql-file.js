const fs = require('fs');
const readline = require('readline');

async function analyzeFile(filePath) {
    console.log(`\nAnalyzing ${filePath}...`);
    
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let totalRecords = 0;
    let validEmails = 0;
    let uniqueEmails = new Set();
    let f1Counts = {};
    let parseErrors = 0;

    for await (const line of rl) {
        const trimmed = line.trim();
        // Look for lines starting with ( and containing values
        if (!trimmed.startsWith('(') || (!trimmed.endsWith('),') && !trimmed.endsWith(');'))) {
            continue;
        }

        // Simple parsing logic (same as force-import-f1.js but simplified for analysis)
        // We assume the structure: (id, company, name, email, birthday, f1, ...)
        // Email is the 4th field (index 3)
        // f1 is the 6th field (index 5)

        try {
            // Remove outer parens
            let content = trimmed;
            if (content.startsWith('(')) content = content.substring(1);
            if (content.endsWith('),')) content = content.substring(0, content.length - 2);
            else if (content.endsWith(');')) content = content.substring(0, content.length - 2);
            
            // Split by comma, respecting quotes is hard with simple split. 
            // We'll use the same parseValuesLine logic to be consistent.
            const values = parseValuesLine(content);
            
            if (values.length < 6) {
                // console.log('Line with few values:', line.substring(0, 50));
                continue; 
            }

            totalRecords++;

            const email = values[3] ? values[3].toLowerCase().trim() : null;
            const f1 = values[5];

            if (f1Counts[f1]) f1Counts[f1]++;
            else f1Counts[f1] = 1;

            if (email && email.includes('@')) {
                validEmails++;
                uniqueEmails.add(email);
            }

        } catch (e) {
            parseErrors++;
        }
    }

    console.log(`Total Records (lines): ${totalRecords}`);
    console.log(`Valid Emails Found: ${validEmails}`);
    console.log(`Unique Emails: ${uniqueEmails.size}`);
    console.log(`Duplicate Emails in file: ${validEmails - uniqueEmails.size}`);
    console.log(`F1 Counts:`, f1Counts);
    if (parseErrors > 0) console.log(`Parse Errors: ${parseErrors}`);
    
    return uniqueEmails.size;
}

function parseValuesLine(content) {
    const values = [];
    let currentVal = '';
    let inQuote = false;
    let escape = false;
    
    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        
        if (escape) {
            currentVal += char;
            escape = false;
            continue;
        }
        
        if (char === '\\') {
            escape = true;
            continue;
        }
        
        if (char === "'") {
            inQuote = !inQuote;
            continue;
        }
        
        if (char === ',' && !inQuote) {
            values.push(currentVal.trim());
            currentVal = '';
            continue;
        }
        
        currentVal += char;
    }
    values.push(currentVal.trim());
    
    return values.map(v => {
        if (v === 'NULL') return null;
        return v.replace(/^'|'$/g, '');
    });
}

(async () => {
    await analyzeFile('C:\\WintonEDM\\sqlbak\\epaper_member (5).sql');
    await analyzeFile('C:\\WintonEDM\\sqlbak\\epaper_member (2).sql');
})();
