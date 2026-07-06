// test_reports.ts
// This script iterates over all available reports and invokes the Claude (Sonnet) model API
// to generate a report, then verifies that the response contains expected fields.

import { getAvailableDataSources, sonnetRespond } from '../backend/src/services/llmHandler';

async function testAllReports() {
  const reports = getAvailableDataSources();
  console.log(`Testing ${reports.length} reports...`);
  for (const r of reports) {
    const query = `Generate the report ${r.reportName}`;
    try {
      const result = await sonnetRespond(query, []);
      if (result.action !== 'generate' || !result.table) {
        console.error(`❌ Report ${r.reportName} failed: unexpected result`, result);
      } else {
        console.log(`✅ Report ${r.reportName} generated using table ${result.table}`);
      }
    } catch (e) {
      console.error(`❌ Report ${r.reportName} threw error`, e);
    }
  }
}

testAllReports().catch(err => console.error('Fatal error', err));
