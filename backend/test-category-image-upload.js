const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const API_URL = 'http://localhost:3001/api';
const USERNAME = 'admin';
const PASSWORD = 'admin123';

async function runTest() {
    try {
        console.log('1. Logging in (Admin)...');
        const loginRes = await axios.post(`${API_URL}/admin-auth/login`, {
            username: USERNAME,
            password: PASSWORD
        });
        const token = loginRes.data.token;
        console.log('   Logged in successfully.');

        const headers = {
            'Authorization': `Bearer ${token}`
        };

        // Create a dummy image file
        const imagePath = path.join(__dirname, 'test-image.png');
        fs.writeFileSync(imagePath, 'fake image content');

        console.log('\n2. Creating test category...');
        const createRes = await axios.post(`${API_URL}/categories`, {
            name: 'Image Test ' + Date.now(),
            hierarchyType: 'customer',
            categoryType: 'tag'
        }, { headers });
        const category = createRes.data.data;
        console.log(`   Created Category: ${category.id}`);

        console.log('\n3. Uploading Image...');
        const form = new FormData();
        form.append('image', fs.createReadStream(imagePath), {
            filename: 'test-image.png',
            contentType: 'image/png'
        });

        const uploadRes = await axios.post(`${API_URL}/categories/${category.id}/image`, form, {
            headers: {
                ...headers,
                ...form.getHeaders()
            }
        });

        console.log('   Upload Response:', uploadRes.data);

        if (uploadRes.data.success && uploadRes.data.data.imageUrl) {
            console.log('   SUCCESS: Image uploaded.');
        } else {
            console.error('   FAILURE: Image upload failed.');
        }

        console.log('\n4. Verifying Image URL...');
        const getRes = await axios.get(`${API_URL}/categories/${category.id}`, { headers });
        if (getRes.data.data.imageUrl) {
            console.log(`   SUCCESS: Category has image URL: ${getRes.data.data.imageUrl}`);
        } else {
            console.error('   FAILURE: Category image URL missing.');
        }

        console.log('\n5. Cleanup...');
        await axios.delete(`${API_URL}/categories/${category.id}`, { headers });
        
        // Remove dummy image
        fs.unlinkSync(imagePath);
        console.log('   Cleanup done.');

    } catch (error) {
        console.error('TEST FAILED:', error.response ? error.response.data : error.message);
    }
}

runTest();
