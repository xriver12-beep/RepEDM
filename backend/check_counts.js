const fs = require('fs');
const readline = require('readline');

async function checkCounts() {
    const fileStream = fs.createReadStream('C:\\WintonEDM\\sqlbak\\epaper_member.sql');
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    const counts = {
        f1: {},
        f2: {},
        f3: {},
        f4: {},
        f5: {},
        f6: {}
    };

    let lineCount = 0;
    
    let inInsert = false;
    
    for await (const line of rl) {
        const trimmed = line.trim();
        
        if (trimmed.startsWith('INSERT INTO `epaper_member`')) {
            inInsert = true;
            // The first line might contain values or just VALUES
            // In the file we saw, it ends with VALUES
            if (trimmed.endsWith('VALUES')) continue;
        }
        
        if (inInsert) {
            if (trimmed.startsWith('(')) {
                // Remove trailing comma or semicolon
                let record = trimmed.replace(/[,;]$/, '');
                record = record.replace(/^\(/, '').replace(/\)$/, '');
                
                const parts = parseCSV(record);
                
                if (parts.length >= 11) {
                    // f1 is index 5
                    const f1 = parts[5];
                    const f2 = parts[6];
                    const f3 = parts[7];
                    const f4 = parts[8];
                    const f5 = parts[9];
                    
                    countValue(counts.f1, f1);
                    countValue(counts.f2, f2);
                    countValue(counts.f3, f3);
                    countValue(counts.f4, f4);
                    countValue(counts.f5, f5);
                }
            }
            
            if (trimmed.endsWith(';')) {
                inInsert = false;
            }
        }
        
        lineCount++;
        if (lineCount % 1000 === 0) process.stdout.write('.');
    }
    
    console.log('\nDone reading.');
    
    console.log('Count for f1 = 11:', counts.f1['11'] || 0);
    console.log('Count for f1 = 12:', counts.f1['12'] || 0);
    console.log('Count for f1 = 94:', counts.f1['94'] || 0);
    console.log('Count for f1 = 95:', counts.f1['95'] || 0);
}

function countValue(obj, val) {
    // Clean value (remove quotes if any, though integers shouldn't have them)
    // val might be '13' or 13
    if (!val) return;
    const v = String(val).replace(/'/g, '').trim();
    obj[v] = (obj[v] || 0) + 1;
}

// Simple CSV parser that handles quoted strings containing commas
function parseCSV(text) {
    const result = [];
    let current = '';
    let inQuote = false;
    let escape = false;
    
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        
        if (escape) {
            current += char;
            escape = false;
        } else if (char === '\\') {
            escape = true; // In SQL dumps, backslash escapes
             // But actually in VALUES (..., 'str', ...), standard SQL uses '' for escaping '
             // MySQL dump might use \. Let's assume \ for now as it's common in MySQL.
             current += char; 
        } else if (char === "'" && !inQuote) {
            inQuote = true;
            // Don't add quote to current
        } else if (char === "'" && inQuote) {
            // Check next char
            if (i + 1 < text.length && text[i+1] === "'") {
                current += "'";
                i++; // Skip next quote
            } else {
                inQuote = false;
            }
        } else if (char === ',' && !inQuote) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

checkCounts().catch(console.error);
