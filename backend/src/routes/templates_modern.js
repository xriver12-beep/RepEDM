const express = require('express');
const router = express.Router();
const { executeQuery } = require('../config/database');
const sql = require('mssql');
const cheerio = require('cheerio');
const handlebars = require('handlebars');
const juice = require('juice');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');
const moment = require('moment');

// Configure Multer for temp upload
const upload = multer({ dest: 'uploads/temp/' });

// Handlebars Helper: limit
handlebars.registerHelper('limit', function(arr, limit) {
  if (!Array.isArray(arr)) { return []; }
  return arr.slice(0, limit);
});

// Helper: Parse Zones from HTML
function parseZones(html_content) {
    const zones = [];
    const $ = cheerio.load(html_content);

    // Strategy 1: Look for data-zone attributes
    $('[data-zone]').each((i, el) => {
      const zoneKey = $(el).attr('data-zone');
      const defaultCount = parseInt($(el).attr('data-limit')) || 1;
      const label = $(el).attr('data-label') || zoneKey;
      
      // Avoid duplicates
      if (!zones.find(z => z.zone_key === zoneKey)) {
        zones.push({
            zone_key: zoneKey,
            label: label,
            default_count: defaultCount,
            max_count: 10 // Default max
        });
      }
    });

    // Strategy 2: Regex for Handlebars {{#each (limit articles_zone_1 ...)}}
    const regex = /{{#each\s+\(limit\s+([a-zA-Z0-9_]+)\s+config\.([a-zA-Z0-9_]+)_count\)/g;
    let match;
    while ((match = regex.exec(html_content)) !== null) {
      const zoneKey = match[2]; 
      if (!zones.find(z => z.zone_key === zoneKey)) {
        zones.push({
            zone_key: zoneKey,
            label: `Zone: ${zoneKey}`,
            default_count: 1,
            max_count: 10
        });
      }
    }
    return zones;
}

// 1. Upload & Parse (Supports .html or .zip)
router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const filePath = req.file.path;
        const mimeType = req.file.mimetype;
        const originalName = req.file.originalname.toLowerCase();
        
        let htmlContent = '';

        if (originalName.endsWith('.zip') || mimeType.includes('zip')) {
            // Handle ZIP
            const zip = new AdmZip(filePath);
            const zipEntries = zip.getEntries();
            
            // Find first .html file
            const htmlEntry = zipEntries.find(entry => entry.entryName.match(/\.html?$/i) && !entry.entryName.startsWith('__MACOSX'));
            
            if (htmlEntry) {
                htmlContent = zip.readAsText(htmlEntry, 'utf8'); // Use utf8 by default
            } else {
                 // Clean up
                 fs.unlinkSync(filePath);
                 return res.status(400).json({ success: false, message: 'No HTML file found in ZIP' });
            }
        } else {
            // Handle HTML file
            htmlContent = fs.readFileSync(filePath, 'utf8');
        }

        // Clean up temp file
        fs.unlinkSync(filePath);

        // Parse Zones
        const zones = parseZones(htmlContent);

        res.json({ success: true, html_content: htmlContent, zones });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Legacy Parse Route (for text-based)
router.post('/parse', async (req, res) => {
  try {
    const { html_content } = req.body;
    if (!html_content) {
      return res.status(400).json({ success: false, message: 'Missing html_content' });
    }

    const zones = parseZones(html_content);
    res.json({ success: true, zones });
  } catch (error) {
    console.error('Parse error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2. Render Template (Preview)
router.post('/render', async (req, res) => {
  try {
    const { html_content, config, articles, date, subject } = req.body;
    
    // Compile with Handlebars
    const template = handlebars.compile(html_content);
    
    // Prepare data context
    // config: { zone_1_count: 3, zone_2_count: 1 }
    // articles: { articles_zone_1: [...], articles_zone_2: [...] }
    
    // Add Global Variables
    const globalVars = {
        date: date || moment().format('YYYY-MM-DD'), // Use provided date or Today
        subject: subject || '測試主旨 (Test Subject)'   // Use provided subject or Default
    };

    const context = {
        config: config || {},
        ...globalVars,
        ...articles // Spread articles into root context
    };

    let html = template(context);

    // Inline CSS (Juice)
    const finalHtml = juice(html);

    res.json({ success: true, html: finalHtml });
  } catch (error) {
    console.error('Render error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 3. Create Template (Save)
router.post('/', async (req, res) => {
  try {
    const { name, html_content, zones, preview_image } = req.body;
    const userId = req.user ? req.user.id : 1; // Default to admin if no auth

    const insertTemplate = `
      INSERT INTO Templates (name, subject, html_content, created_by, preview_image, template_type)
      VALUES (@name, 'Template Subject', @html_content, @userId, @preview_image, 'modern');
      SELECT SCOPE_IDENTITY() as id;
    `;
    
    const result = await executeQuery(insertTemplate, {
        name,
        html_content,
        userId,
        preview_image: preview_image || ''
    });
    
    // Check if result has recordset (mssql)
    const templateId = (result.recordset && result.recordset.length > 0) ? result.recordset[0].id : null;
    
    if (!templateId) {
        throw new Error('Failed to retrieve template ID after insertion');
    }

    // Insert Zones
    if (zones && zones.length > 0) {
        for (const zone of zones) {
            const insertZone = `
              INSERT INTO TemplateZones (template_id, zone_key, label, default_count, max_count)
              VALUES (@templateId, @zone_key, @label, @default_count, @max_count)
            `;
            await executeQuery(insertZone, {
                templateId,
                zone_key: zone.zone_key,
                label: zone.label,
                default_count: zone.default_count,
                max_count: zone.max_count
            });
        }
    }

    res.json({ success: true, id: templateId, message: 'Template created successfully' });
  } catch (error) {
    console.error('Create error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 4. Get Template Details
router.get('/:id(\\d+)', async (req, res) => {
  try {
    const { id } = req.params;
    
    const templateQuery = `SELECT * FROM Templates WHERE id = @id`;
    const zonesQuery = `SELECT * FROM TemplateZones WHERE template_id = @id`;
    
    const [templates] = await Promise.all([
        executeQuery(templateQuery, { id })
    ]);
    
    if (templates.length === 0) {
        return res.status(404).json({ success: false, message: 'Template not found' });
    }

    const zones = await executeQuery(zonesQuery, { id });

    res.json({
        success: true,
        template: templates[0],
        zones: zones
    });

  } catch (error) {
    console.error('Get error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
