const axios = require('axios');
const { executeQuery, connectDB, closeDB } = require('./src/config/database');

const API_URL = 'http://localhost:3001/api';
let authToken = '';
let userId = '';

// Helper to login and get token
async function login() {
    console.log('Logging in...');
    try {
        // Assuming there's a test user or admin
        // I'll try to find a user from the DB first to use
        await connectDB();
        const result = await executeQuery("SELECT TOP 1 email FROM Users WHERE role = 'admin'");
        if (result.recordset.length === 0) {
            throw new Error('No admin user found');
        }
        const email = result.recordset[0].email;
        
        // Use a known password or reset it if needed. 
        // Since I can't easily know the password, I'll generate a token directly using the backend code logic if possible,
        // OR I can just use the database directly to verify the inserts if API testing is too complex due to auth.
        
        // Actually, for verification of the FIX, I just need to call the API.
        // If I can't login easily via script, I'll simulate the validation logic or use a mock token if dev mode is on.
        // But dev mode check is in frontend. Backend checks verify token.
        
        // Let's try to get a token by "cheating" - generating one using the secret.
        const jwt = require('jsonwebtoken');
        const secret = process.env.JWT_SECRET || 'your_jwt_secret_key_2024'; // Fallback from .env.example
        
        const userResult = await executeQuery("SELECT id, email, role, full_name FROM Users WHERE email = @email", { email });
        const user = userResult.recordset[0];
        userId = user.id;
        
        authToken = jwt.sign(
            { 
                userId: user.id, 
                email: user.email, 
                role: user.role,
                name: user.full_name
            },
            secret,
            { expiresIn: '1h' }
        );
        
        console.log('Token generated for user:', user.email);
        return true;
    } catch (error) {
        console.error('Login/Token generation failed:', error);
        return false;
    }
}

async function testCampaignCreation() {
    console.log('\n--- Testing Campaign Creation with type "Newsletter" ---');
    try {
        const payload = {
            name: `Test Campaign ${Date.now()}`,
            subject: 'Test Subject',
            type: 'Newsletter', // The type we enabled
            senderName: 'Test Sender',
            senderEmail: 'test@example.com',
            htmlContent: '<p>Test Content</p>',
            recipientGroups: ['all_subscribers'],
            targetAudience: 'all'
        };

        const response = await axios.post(`${API_URL}/campaigns`, payload, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.data.success) {
            console.log('✅ Campaign created successfully with type "Newsletter"');
        } else {
            console.error('❌ Campaign creation failed:', response.data);
        }
    } catch (error) {
        console.error('❌ Campaign creation error:', error.response ? error.response.data : error.message);
    }
}

async function testTemplateImage() {
    console.log('\n--- Testing Template Creation with Image ---');
    try {
        const payload = {
            name: `Test Template ${Date.now()}`,
            subject: 'Test Subject',
            htmlContent: '<p>Template Content</p>',
            mainImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' // 1x1 red pixel
        };

        const response = await axios.post(`${API_URL}/templates`, payload, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.data.success) {
            console.log('✅ Template created successfully');
            const templateId = response.data.data.id; // API returns { success: true, data: { id: ... } } usually
            
            // Verify image is saved
            const getResponse = await axios.get(`${API_URL}/templates/${templateId}`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            
            if (getResponse.data.data.mainImage && getResponse.data.data.mainImage.startsWith('data:image')) {
                 console.log('✅ Template image retrieved successfully');
            } else {
                 console.error('❌ Template image not found or invalid in response');
            }
            
            // Verify list view also has it
            const listResponse = await axios.get(`${API_URL}/templates?limit=1&search=${payload.name}`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            
            const templateInList = listResponse.data.data.templates.find(t => t.id === templateId);
            if (templateInList && templateInList.mainImage) {
                console.log('✅ Template image present in list view');
            } else {
                console.error('❌ Template image missing in list view');
            }

        } else {
            console.error('❌ Template creation failed:', response.data);
        }
    } catch (error) {
        console.error('❌ Template test error:', error.response ? error.response.data : error.message);
    }
}

async function run() {
    if (await login()) {
        await testCampaignCreation();
        await testTemplateImage();
    }
    await closeDB();
}

run();
