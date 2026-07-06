// regression_test.ts
// Sends a set of representative queries to both Gemma and Sonnet providers via the backend /api/chat endpoint
// and logs the responses for manual regression verification.

const queries = [
  "Generate the Sales Revenue Trend Report for Q1 2024",
  "Which territories have the highest run rate?",
  "What metrics explain T-008's leading run rate?",
  "Show the take rate trend over time across all territories",
  "Which territories have the lowest run rate?"
];

async function callProvider(provider: string, query: string) {
  try {
    const res = await fetch("http://localhost:3001/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, query })
    });
    const data = await res.json();
    console.log(`\n--- Provider: ${provider} | Query: ${query} ---`);
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`Error calling ${provider} for query "${query}":`, err);
  }
}

async function runRegression() {
  for (const q of queries) {
    await callProvider("gemma", q);
    await callProvider("sonnet", q);
  }
}

runRegression().catch(e => console.error("Fatal error", e));
