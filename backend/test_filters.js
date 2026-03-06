const axios = require('axios');

// Configure base URL
const BASE_URL = 'http://localhost:3001/api'; 
const LOGIN_URL = 'http://localhost:3001/api/auth/login';

async function testFilters() {
    console.log('Starting Filter Tests...');

    try {
        // 0. Login
        console.log('\n0. Logging in...');
        const loginResponse = await axios.post(LOGIN_URL, {
            email: 'admin@winton.com',
            password: 'admin123'
        });
        const token = loginResponse.data.data.token;
        console.log('Login successful.');

        const config = {
            headers: { 'Authorization': `Bearer ${token}` }
        };

        // 0.5 List all subscribers to find valid data
        console.log('\n0.5 Listing all subscribers to find test data...');
        const allResponse = await axios.get(`${BASE_URL}/subscribers`, config);
        const allSubscribers = allResponse.data.data.subscribers || [];
        console.log(`Total subscribers: ${allResponse.data.data.pagination.total}`);
        
        let subWithTags = null;
        for (const sub of allSubscribers) {
            if (sub.tags && sub.tags !== '[]' && sub.tags !== '') {
                subWithTags = sub;
                break;
            }
        }

        if (subWithTags) {
            console.log('Found subscriber with tags:', subWithTags.email, subWithTags.tags);
            // Test Tag Filter
             let tagToTest = '';
             try {
                 const tagsArray = JSON.parse(subWithTags.tags);
                 if (Array.isArray(tagsArray) && tagsArray.length > 0) tagToTest = tagsArray[0];
             } catch (e) {
                 tagToTest = subWithTags.tags.split(',')[0].trim();
             }

             if (tagToTest) {
                 console.log(`\n1. Testing Tag Filter (tags="${tagToTest}")...`);
                 const tagResponse = await axios.get(`${BASE_URL}/subscribers`, {
                     params: { tags: tagToTest },
                     ...config
                 });
                 console.log(`Count: ${tagResponse.data.data.pagination.total}`);
             }
        } else {
            console.log('No subscriber with tags found in the first batch (limit 10).');
            // Try searching for *any* subscriber with tags via SQL? 
            // Or just try to filter by a common tag like "VIP" or "New"
            console.log('Trying generic tag "VIP"...');
             const tagResponse = await axios.get(`${BASE_URL}/subscribers`, {
                 params: { tags: 'VIP' },
                 ...config
             });
             console.log(`Count for "VIP": ${tagResponse.data.data.pagination.total}`);
        }

        if (allSubscribers.length > 0) {
            const firstSub = allSubscribers[0];
            // console.log('First subscriber sample:', JSON.stringify(firstSub, null, 2));
            
            // Test Category Filter if categories exist
            // Based on earlier code, categories might be a separate relation not directly in subscriber object unless joined
            // But let's check firstSub.categories if it exists
             if (firstSub.categories && firstSub.categories.length > 0) {
                const catId = firstSub.categories[0].id;
                console.log(`\n2. Testing Category Filter (category_ids=${catId})...`);
                const catResponse = await axios.get(`${BASE_URL}/subscribers`, {
                    params: { category_ids: catId },
                    ...config
                });
                console.log(`Count: ${catResponse.data.data.pagination.total}`);
            } else {
                 console.log('\n2. No categories found on first subscriber to test.');
            }
            
        } else {
            console.log('No subscribers found.');
        }

    } catch (error) {
        console.error('Test Failed:', error.message);
        if (error.response) {
            console.error('Response Data:', error.response.data);
        }
    }
}

testFilters();
