const axios = require('axios');
const { sql, executeQuery } = require('./src/config/database');

const API_URL = 'http://localhost:3001/api';
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin123';

// Configuration
const BATCH_SIZE = 50;
const TOTAL_CATEGORIES = 500; // Adjust for higher load
const MAX_LEVEL = 4; // 0-4 (5 levels)

let authToken = '';

async function login() {
  try {
    const res = await axios.post(`${API_URL}/admin-auth/login`, {
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD
    });
    authToken = res.data.token;
    console.log('✅ Login successful');
  } catch (error) {
    console.error('❌ Login failed:', error.message);
    process.exit(1);
  }
}

async function createCategory(name, parentId, level, type = 'customer') {
  try {
    const res = await axios.post(
      `${API_URL}/categories`,
      {
        name,
        categoryType: type === 'customer' ? 't1' : 't2',
        hierarchyType: type,
        parentId,
        sortOrder: 0,
        description: `Stress test category ${name}`
      },
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );
    return res.data.data;
  } catch (error) {
    console.error(`❌ Failed to create category ${name}:`, error.response?.data?.message || error.message);
    return null;
  }
}

async function runStressTest() {
  console.log('🚀 Starting Category Stress Test...');
  await login();

  // 1. Cleanup old test data
  console.log('\n🧹 Cleaning up old test data...');
  try {
    await executeQuery("DELETE FROM Categories WHERE description LIKE 'Stress test category%'");
    console.log('✅ Cleanup complete');
  } catch (err) {
    console.error('⚠️ Cleanup warning:', err.message);
  }

  // 2. Bulk Creation
  console.log(`\n📦 Creating ${TOTAL_CATEGORIES} categories...`);
  const startTime = Date.now();
  
  let createdCount = 0;
  let roots = [];
  let parentQueue = []; // { id, level }

  // Create roots
  const rootCount = Math.max(10, Math.floor(TOTAL_CATEGORIES / 10)); // 10% roots
  console.log(`   Creating ${rootCount} root categories...`);
  
  for (let i = 0; i < rootCount; i++) {
    const cat = await createCategory(`Stress_Root_${i}_${Date.now()}`, null, 0);
    if (cat) {
      roots.push(cat);
      parentQueue.push({ id: cat.id, level: 0 });
      createdCount++;
    }
  }

  // Create children
  let currentParentIndex = 0;
  while (createdCount < TOTAL_CATEGORIES && parentQueue.length > 0) {
    // Pick a parent
    const parent = parentQueue[currentParentIndex % parentQueue.length];
    
    // If parent level is max, skip adding children to it (pick another or stop if all max)
    if (parent.level >= MAX_LEVEL) {
        // Remove from queue if we don't want to use it anymore, or just skip
        // For simplicity, let's just skip and move to next
        currentParentIndex++;
        if (currentParentIndex >= parentQueue.length) break; // Should not happen easily if distribution is good
        continue; 
    }

    const cat = await createCategory(
        `Stress_Child_${createdCount}_L${parent.level + 1}_${Date.now()}`, 
        parent.id, 
        parent.level + 1
    );

    if (cat) {
      parentQueue.push({ id: cat.id, level: parent.level + 1 });
      createdCount++;
    }
    
    currentParentIndex++;
    
    if (createdCount % 50 === 0) {
        process.stdout.write(`.`);
    }
  }
  
  const duration = (Date.now() - startTime) / 1000;
  console.log(`\n✅ Created ${createdCount} categories in ${duration.toFixed(2)}s (${(createdCount/duration).toFixed(2)} req/s)`);

  // 3. Performance Test: Fetch Roots (Lazy Load Initial)
  console.log('\n⏱️ Testing Fetch Performance (Roots Only)...');
  const t1 = Date.now();
  const resRoots = await axios.get(`${API_URL}/categories?hierarchyType=customer&includeChildren=false`, {
    headers: { Authorization: `Bearer ${authToken}` }
  });
  const t1End = Date.now();
  console.log(`   Fetch Roots: ${t1End - t1}ms (Count: ${resRoots.data.data.categories.length})`);

  // 4. Performance Test: Fetch Full Tree (Old method comparison)
  console.log('\n⏱️ Testing Fetch Performance (Full Tree)...');
  const t2 = Date.now();
  const resTree = await axios.get(`${API_URL}/categories/tree?hierarchyType=customer`, {
    headers: { Authorization: `Bearer ${authToken}` }
  });
  const t2End = Date.now();
  console.log(`   Fetch Tree API: ${t2End - t2}ms (Count: ${resTree.data.data.categories.length})`);

  // 5. Concurrent Move Test
  console.log('\n🔄 Testing Concurrent Moves...');
  if (roots.length >= 2) {
      const nodeToMove = roots[0]; // Move root 0
      const targetParent = roots[1]; // To under root 1
      
      console.log(`   Moving ${nodeToMove.name} to under ${targetParent.name}...`);
      
      try {
        const moveStart = Date.now();
        await axios.put(`${API_URL}/categories/${nodeToMove.id}/move`, {
            parentId: targetParent.id,
            targetId: targetParent.id,
            position: 'inside'
        }, {
            headers: { Authorization: `Bearer ${authToken}` }
        });
        console.log(`   Move completed in ${Date.now() - moveStart}ms`);
      } catch (err) {
          console.error('   Move failed:', err.response?.data?.message || err.message);
      }
  }

  console.log('\n🎉 Stress Test Complete');
  process.exit(0);
}

runStressTest();
