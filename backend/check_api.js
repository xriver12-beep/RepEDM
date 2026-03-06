
const axios = require('axios');

async function checkApi() {
    try {
        const response = await axios.get('http://localhost:3001/api/subscribers', {
            params: {
                limit: 1,
                status: 'unsubscribed'
            }
        });
        console.log('Status:', response.status);
        console.log('Data:', JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
    }
}

checkApi();
