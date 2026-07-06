// run_test_queries.ts
// Minimal script to invoke sonnetRespond for two sample queries and log results.

import { sonnetRespond } from '../backend/src/services/llmHandler.ts';

async function runTests() {
  const queries = [
    'Generate the Sales Revenue Trend Report for Q1 2024',
    'Which territories have the highest run rate?'
  ];

  for (const q of queries) {
    console.log(`\n=== Query: ${q} ===`);
    try {
      const result = await sonnetRespond(q, []);
      console.log('Result:', result);
      if (result.action !== 'generate') {
        console.warn('⚠️ Expected a generate action but got', result.action);
      } else {
        console.log('✅ Generate action with table:', result.table);
      }
    } catch (err) {
      console.error('❌ Error while processing query:', err);
    }
  }
}

runTests().catch(e => console.error('Fatal error', e));
