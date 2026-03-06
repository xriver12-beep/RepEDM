const axios = require('axios');

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

        // Helper to create category
        const createCategory = async (name, parentId = null) => {
            const res = await axios.post(`${API_URL}/categories`, {
                name,
                hierarchyType: 'customer',
                categoryType: 'tag',
                parentId
            }, { headers });
            return res.data.data;
        };

        console.log('\n2. Creating test categories...');
        const parent = await createCategory('Test Parent ' + Date.now());
        console.log(`   Created Parent: ${parent.id} (${parent.name})`);
        
        const child = await createCategory('Test Child ' + Date.now(), parent.id);
        console.log(`   Created Child: ${child.id} (${child.name}), Parent: ${child.parentId}`);

        console.log('\n3. Testing Move: Move child to root (Level 1 -> Level 0)');
        await axios.put(`${API_URL}/categories/${child.id}/move`, {
            parentId: null,
            position: 'inside' // Logic handles null parent as root
        }, { headers });
        
        // Verify move
        const movedChildRes = await axios.get(`${API_URL}/categories/${child.id}`, { headers });
        const movedChild = movedChildRes.data.data;
        if (movedChild.parentId === null && movedChild.level === 0) {
            console.log('   SUCCESS: Child moved to root.');
        } else {
            console.error('   FAILURE: Child not moved to root properly.', movedChild);
        }

        console.log('\n4. Testing Move: Move child back inside parent (Level 0 -> Level 1)');
        await axios.put(`${API_URL}/categories/${child.id}/move`, {
            parentId: parent.id,
            position: 'inside'
        }, { headers });

        const movedBackChildRes = await axios.get(`${API_URL}/categories/${child.id}`, { headers });
        const movedBackChild = movedBackChildRes.data.data;
        if (movedBackChild.parentId === parent.id && movedBackChild.level === 1) {
            console.log('   SUCCESS: Child moved back to parent.');
        } else {
            console.error('   FAILURE: Child not moved back properly.', movedBackChild);
        }

        console.log('\n5. Testing Max Depth (5 Levels)');
        // Create a chain of 5 categories
        let currentParent = parent;
        const chain = [parent];
        
        // We already have parent (L1) -> child (L2).
        // Let's create L3, L4, L5.
        // Child is now L2.
        
        const l3 = await createCategory('L3 ' + Date.now(), child.id);
        const l4 = await createCategory('L4 ' + Date.now(), l3.id);
        const l5 = await createCategory('L5 ' + Date.now(), l4.id);
        
        console.log('   Created chain up to Level 5.');

        // Try to add L6
        try {
            await createCategory('L6 ' + Date.now(), l5.id);
            console.error('   FAILURE: API allowed creating Level 6 category.');
        } catch (e) {
            if (e.response && e.response.status === 400) {
                console.log('   SUCCESS: API rejected creating Level 6 category.');
            } else {
                console.error('   FAILURE: Unexpected error when creating Level 6:', e.message);
            }
        }

        console.log('\n6. Cleanup...');
        // Delete parent (should cascade or fail depending on logic, usually we delete leaf first or recursive)
        // Our delete logic checks for children. So we delete from bottom up.
        await axios.delete(`${API_URL}/categories/${l5.id}`, { headers });
        await axios.delete(`${API_URL}/categories/${l4.id}`, { headers });
        await axios.delete(`${API_URL}/categories/${l3.id}`, { headers });
        await axios.delete(`${API_URL}/categories/${child.id}`, { headers });
        await axios.delete(`${API_URL}/categories/${parent.id}`, { headers });
        console.log('   Cleanup done.');

    } catch (error) {
        console.error('TEST FAILED:', error.response ? error.response.data : error.message);
    }
}

runTest();
