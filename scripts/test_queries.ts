// test_queries.ts
// Sends a spread of realistic user messages through sonnetRespond to see how
// Claude (Sonnet) classifies each one: chat / answer / clarify / generate.

import { sonnetRespond, SonnetIntent } from '../backend/src/services/llmHandler';

const QUERIES: string[] = [
  'hi there!',                                  // greeting        → expect chat
  'what can you help me with?',                 // capability ask  → expect chat/answer
  'I want a sales report',                      // bare domain     → expect clarify
  'create a network report',                    // bare domain     → expect clarify
  'show me the sales revenue trend over time',  // specific        → expect generate
  'compare territories by take rate',           // specific        → expect generate
  'show me churn over time',                    // specific        → expect generate
  'agent performance overview',                 // specific        → expect generate
  'top and bottom territories by revenue',      // specific        → expect generate
  'what is the capital of France?',             // off-topic       → expect chat/answer
];

function summarize(r: SonnetIntent): string {
  switch (r.action) {
    case 'generate': return `generate -> table=${r.table}, intent=${r.intent}`;
    case 'clarify':  return `clarify  -> "${r.question}" options=[${r.options.join(', ')}]`;
    case 'answer':   return `answer   -> "${r.message.slice(0, 90)}"`;
    case 'chat':     return `chat     -> "${r.message.slice(0, 90)}"`;
  }
}

async function run() {
  console.log(`Running ${QUERIES.length} query scenarios through Sonnet...\n`);
  for (const q of QUERIES) {
    try {
      const res = await sonnetRespond(q, []);
      console.log(`[OK]  "${q}"`);
      console.log(`       ${summarize(res)}\n`);
    } catch (e: any) {
      console.log(`[ERR] "${q}" -> ${e?.message ?? e}\n`);
    }
  }
}

run().catch(err => console.error('Fatal error', err));
