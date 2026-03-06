
const { executeQuery, connectDB, closeDB } = require('./src/config/database');
require('dotenv').config();

// Helper to build geo filter (copied from analytics.js for testing)
const buildGeoFilter = (country, city, alias = 's') => {
    let clauses = [];
    const params = {};
    
    // Parse comma-separated values
    const parse = (str) => str ? str.split(',').map(s => s.trim()).filter(s => s) : [];
    
    const countries = parse(country);
    if (countries.length > 0) {
        const pNames = countries.map((_, i) => `country_${i}`);
        clauses.push(`${alias}.country IN (${pNames.map(p => '@' + p).join(',')})`);
        countries.forEach((c, i) => params[`country_${i}`] = c);
    }
    
    const cities = parse(city);
    if (cities.length > 0) {
        const pNames = cities.map((_, i) => `city_${i}`);
        clauses.push(`${alias}.city IN (${pNames.map(p => '@' + p).join(',')})`);
        cities.forEach((c, i) => params[`city_${i}`] = c);
    }
    
    return { 
        where: (clauses.length > 0) ? ' AND ' + clauses.join(' AND ') : '', 
        params,
        hasFilter: clauses.length > 0
    };
};

async function testSubscriberStats(filterDescription, country, city) {
    console.log(`\n--- Testing ${filterDescription} ---`);
    const geoFilter = buildGeoFilter(country, city);
    console.log('Filter Params:', geoFilter.params);
    console.log('Filter Where:', geoFilter.where);

    let subStatsQuery = `
      SELECT 
        SUM(CASE WHEN s.status != 'deleted' THEN 1 ELSE 0 END) as totalSubscribers,
        SUM(CASE WHEN s.status = 'active' OR s.status = 'subscribed' THEN 1 ELSE 0 END) as activeSubscribers
      FROM Subscribers s
      WHERE 1=1
    `;
    
    if (geoFilter.hasFilter) {
        subStatsQuery += geoFilter.where;
    }

    try {
        const result = await executeQuery(subStatsQuery, geoFilter.params);
        console.log('Result:', result.recordset[0]);
        return result.recordset[0];
    } catch (err) {
        console.error('Error executing query:', err);
    }
}

async function runTests() {
    try {
        await connectDB();
        
        // Test 1: No Filter
        await testSubscriberStats('No Filter', null, null);

        // Test 2: Single Filter (總公司)
        await testSubscriberStats('Single Filter (總公司)', '總公司', null);

        // Test 3: Multi-Select Filter (總公司 + 中營處)
        await testSubscriberStats('Multi Filter (總公司, 中營處)', '總公司, 中營處', null);

        console.log('\nDone.');
        process.exit(0);
    } catch (error) {
        console.error('Test failed:', error);
        process.exit(1);
    }
}

runTests();
