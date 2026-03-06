const fs = require('fs');
const readline = require('readline');

async function analyze() {
    const fileStream = fs.createReadStream('C:\\WintonEDM\\sqlbak\\epaper_member.sql');
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    const f1_11 = new Set();
    const f1_12 = new Set();
    const f1_other = new Set();
    const all_emails = new Set();

    let inInsert = false;

    for await (const line of rl) {
        const trimmed = line.trim();
        if (trimmed.startsWith('INSERT INTO `epaper_member`')) {
            inInsert = true;
            if (trimmed.endsWith('VALUES')) continue;
        }

        if (inInsert) {
            if (trimmed.startsWith('(')) {
                let record = trimmed.replace(/[,;]$/, '');
                record = record.replace(/^\(/, '').replace(/\)$/, '');
                const parts = parseCSV(record);
                if (parts.length >= 11) {
                    const email = parts[3].replace(/'/g, '').trim().toLowerCase();
                    const f1 = parseInt(parts[5]);
                    
                    if (!email) continue;

                    all_emails.add(email);

                    if (f1 === 11) f1_11.add(email);
                    else if (f1 === 12) f1_12.add(email);
                    else f1_other.add(email);
                }
            }
            if (trimmed.endsWith(';')) inInsert = false;
        }
    }

    console.log(`Total unique emails: ${all_emails.size}`);
    console.log(`Emails with f1=11: ${f1_11.size}`);
    console.log(`Emails with f1=12: ${f1_12.size}`);
    
    // Intersections
    let intersect_11_12 = 0;
    f1_11.forEach(e => { if (f1_12.has(e)) intersect_11_12++; });
    console.log(`Intersection 11 & 12: ${intersect_11_12}`);

    let intersect_11_other = 0;
    f1_11.forEach(e => { if (f1_other.has(e)) intersect_11_other++; });
    console.log(`Intersection 11 & Other: ${intersect_11_other}`);

    let intersect_12_other = 0;
    f1_12.forEach(e => { if (f1_other.has(e)) intersect_12_other++; });
    console.log(`Intersection 12 & Other: ${intersect_12_other}`);
}

function parseCSV(text) {
    const result = [];
    let current = '';
    let inQuote = false;
    let escape = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (escape) { current += char; escape = false; }
        else if (char === '\\') { current += char; }
        else if (char === "'" && !inQuote) { inQuote = true; }
        else if (char === "'" && inQuote) {
            if (i + 1 < text.length && text[i+1] === "'") { current += "'"; i++; }
            else { inQuote = false; }
        } else if (char === ',' && !inQuote) { result.push(current.trim()); current = ''; }
        else { current += char; }
    }
    result.push(current.trim());
    return result;
}

analyze();
