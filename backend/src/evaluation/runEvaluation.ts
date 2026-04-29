import { runPipeline } from '../pipeline/runPipeline';
import testCases from './testCases.json';
import dotenv from 'dotenv';

dotenv.config();

async function runEvaluation() {
  console.log('Starting Generative UI Evaluation...');
  console.log(`Total Test Cases: ${testCases.length}\n`);

  let correctCount = 0;
  const mismatches: any[] = [];

  for (const testCase of testCases) {
    process.stdout.write(`Evaluating: "${testCase.query}" ... `);
    
    try {
      const result = await runPipeline(testCase.query);
      const actual = result.uiTree.renderType;
      
      if (actual === testCase.expected) {
        correctCount++;
        console.log('✅ PASS');
      } else {
        console.log('❌ FAIL');
        mismatches.push({
          query: testCase.query,
          expected: testCase.expected,
          actual: actual,
          shortCircuited: result.wasShortCircuited
        });
      }
    } catch (error: any) {
      console.log('💥 ERROR');
      mismatches.push({
        query: testCase.query,
        expected: testCase.expected,
        actual: 'ERROR',
        error: error.message
      });
    }
  }

  const accuracy = (correctCount / testCases.length) * 100;

  console.log('\n--- EVALUATION RESULTS ---');
  console.log(`Accuracy: ${accuracy.toFixed(1)}% (${correctCount}/${testCases.length})`);
  console.log('---------------------------\n');

  if (mismatches.length > 0) {
    console.log('MISMATCH DETAILS:');
    mismatches.forEach(m => {
      console.log(`\nQuery: "${m.query}"`);
      console.log(`Expected: ${m.expected}`);
      console.log(`Actual:   ${m.actual}`);
      if (m.shortCircuited !== undefined) {
        console.log(`Was Short-circuited: ${m.shortCircuited}`);
      }
      if (m.error) {
        console.log(`Error:    ${m.error}`);
      }
    });
  }
}

runEvaluation().catch(console.error);
