#!/usr/bin/env node
/**
 * Simple test for opencontext-node native bindings
 */

const native = require('./index.js');

async function test() {
  console.log('=== OpenContext Native Bindings Test ===\n');

  // Test 1: Environment initialization
  console.log('1. Testing initEnvironment...');
  try {
    const env = native.initEnvironment();
    console.log('   ✅ Environment:', JSON.stringify(env, null, 2).slice(0, 200) + '...');
  } catch (e) {
    console.log('   ❌ Error:', e.message);
  }

  // Test 2: Load search config
  console.log('\n2. Testing loadSearchConfig...');
  try {
    const config = native.loadSearchConfig();
    console.log('   ✅ Config loaded:', JSON.stringify(config, null, 2).slice(0, 300) + '...');
  } catch (e) {
    console.log('   ❌ Error:', e.message);
  }

  // Test 3: Create Searcher
  console.log('\n3. Testing Searcher.create...');
  try {
    const searcher = await native.Searcher.create();
    console.log('   ✅ Searcher created successfully!');

    // Test search
    console.log('\n4. Testing searcher.search...');
    const results = await searcher.search({
      query: 'context',
      limit: 3,
      mode: 'hybrid',
      aggregateBy: 'doc'
    });
    console.log('   ✅ Search results:', JSON.stringify(results, null, 2).slice(0, 500) + '...');
  } catch (e) {
    console.log('   ❌ Error:', e.message);
    if (e.message.includes('not found') || e.message.includes('not built')) {
      console.log('   ℹ️  (Index may not be built yet - this is expected)');
    }
  }

  // Test 4: Create Indexer
  console.log('\n5. Testing Indexer.create...');
  try {
    const indexer = await native.Indexer.create();
    console.log('   ✅ Indexer created successfully!');

    // Check if index exists
    const exists = await indexer.indexExists();
    console.log('   ℹ️  Index exists:', exists);

    if (exists) {
      const stats = await indexer.getStats();
      console.log('   ℹ️  Index stats:', JSON.stringify(stats));
    }
  } catch (e) {
    console.log('   ❌ Error:', e.message);
  }

  console.log('\n=== Test Complete ===');
}

test().catch(console.error);

