// Regression tests for drawing-intent classification and routing.
//
// WHAT BROKE, AND WHY THIS FILE EXISTS.
//
// "draw a sequence diagram of how a contact center call gets escalated" came back as a
// narrative paragraph with ZERO component cards. Two independent causes, both confirmed
// against a live backend before either was touched:
//
//   1. DRAW_INTENT_RE listed "escalation PATH" but not "escalation FLOW", so the very
//      phrasing users type — "contact center call escalation flow", with no draw verb
//      at all — did not register as a drawing request.
//   2. The fast-path was wired into sonnetRespond() only. `internal` logins resolve to
//      Gemma (getAuthUsers in index.ts), so the provider most sessions actually used had
//      no net: analyzeQuery() sent the request to the ordinary "Which report would you
//      like to see?" menu and streamed no components.
//
// Both paths return BEFORE any model call when drawing intent is detected, so these are
// real end-to-end routing assertions for both providers — no LLM, no BigQuery, no
// network. getAvailableDataSources() falls back to the full catalog before the
// availability probe completes, which is what keeps this offline.
//
// Run: npm run test:drawintent   (from repo root)

import assert from 'node:assert/strict';
import {
  detectDrawingIntent, resolveDrawingRoute, analyzeQuery, sonnetRespond,
  resolveIntent, recoverDrawRequest,
} from '../backend/src/services/llmHandler';
import { classifyIntent, resetClassifierStats, getClassifierStats } from '../backend/src/services/drawIntentClassifier';
import { DATA_SOURCES } from '../backend/src/services/dataSourceMap';

let passed = 0;
function t(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`  ok  ${name}`); })
    .catch((e: any) => { console.error(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; });
}

const DOMAINS = [...new Set(DATA_SOURCES.map((s) => s.domain))];
const tableToDomain = new Map(DATA_SOURCES.map((s) => [s.table, s.domain]));

async function main() {
  console.log('regex — phrasings that MUST be recognised as drawing requests');

  // The exact failing request, and the phrasing that made it fail: no verb, just the
  // name of the structure. This is the case the whole fix exists for.
  await t('"escalation flow" is a drawing request even with no draw verb', () => {
    assert.equal(detectDrawingIntent(['contact center call escalation flow']), 'svg');
    assert.equal(detectDrawingIntent(['Contact Center Call Escalation Flow']), 'svg', 'must be case-insensitive');
    assert.equal(detectDrawingIntent(['sales escalation flow']), 'svg');
  });

  await t('"escalation path" still works — the phrasing that already did', () => {
    assert.equal(detectDrawingIntent(['escalation path for T-007']), 'svg');
  });

  // SECOND REAL MISS, same failure shape as the one this file was created for.
  // "show me the sequence when a report is generated" returned a wall of prose: the user
  // named the structure they wanted ("the sequence when X happens") without a draw verb,
  // and only "sequence DIAGRAM" was covered — via the generic `diagram` alternative, not
  // by anything that understood "sequence".
  await t('"sequence of/when" is a drawing request without a draw verb', () => {
    for (const q of [
      'show me the sequence when a report is generated',
      'the sequence of steps to escalate a call',
      'what is the sequence when an order is returned',
    ]) {
      assert.equal(detectDrawingIntent([q]), 'svg', `not recognised: "${q}"`);
    }
  });

  await t('a bare "sequence" noun is NOT a drawing request', () => {
    // The qualifier carries the intent, never the noun alone — same rule as `flow`.
    // "sequence number" is a column; matching it would force narrative mode and drop
    // the chart families the question actually wanted.
    for (const q of [
      'sequence number by outlet',
      'show me the sequence numbers for last month',
    ]) {
      assert.equal(detectDrawingIntent([q]), null, `false positive: "${q}"`);
    }
  });

  // Each new qualifier is asserted individually rather than via one broad pattern, so a
  // future widening of the regex cannot quietly drop one of them.
  await t('named "<noun> flow" phrasings are recognised', () => {
    for (const q of [
      'call flow',
      'call routing flow',
      'routing flow',
      'process flow',
      'approval flow',
      'onboarding flow',
      'show me the process flow for returns',
    ]) {
      assert.equal(detectDrawingIntent([q]), 'svg', `not recognised: "${q}"`);
    }
  });

  await t('"customer journey" is recognised', () => {
    assert.equal(detectDrawingIntent(['show me the customer journey']), 'svg');
    assert.equal(detectDrawingIntent(['customer journey from signup to churn']), 'svg');
  });

  await t('the pre-existing vocabulary is untouched', () => {
    for (const q of [
      'draw the escalation flow for territory T-007',
      'sketch the network topology',
      'diagram the state machine',
      'flow chart of the return process',
      'flowchart of the return process',
      'architecture diagram',
      'org chart for the sales team',
      'data lineage for take rate',
      'dependency graph',
      'how does the outlet connect to the territory',
      'draw a sequence diagram of how a contact center call gets escalated',
    ]) {
      assert.equal(detectDrawingIntent([q]), 'svg', `regressed: "${q}"`);
    }
  });

  console.log('\nregex — plain data questions that MUST NOT match');
  await t('measures containing the word "flow" are not drawing requests', () => {
    // THE REASON THE QUALIFIERS ARE ENUMERATED. A bare /\bflow\b/ would fix
    // "escalation flow" and break both of these, turning a KPI question into a diagram.
    for (const q of ['cash flow by month', 'flow rate by device group', 'cash flow trend']) {
      assert.equal(detectDrawingIntent([q]), null, `false positive: "${q}"`);
    }
  });

  await t('near-misses of the repro string stay negative', () => {
    // PROOF THE TIGHTENING DID NOT OVERREACH. Each of these shares most of its words
    // with "contact center call escalation flow" — the same domain, the same "call",
    // even the word "escalation" — and differs only in naming a MEASURE rather than a
    // STRUCTURE. If any of these starts matching, the regex has stopped discriminating
    // and ordinary KPI questions will render as diagrams.
    for (const q of [
      'contact center call performance',
      'contact center call volume by agent',
      'escalation rate by team',          // "escalation" without path/flow
      'call handling time by agent',      // "call" without flow
      'customer retention by month',      // near-miss for "customer journey"
    ]) {
      assert.equal(detectDrawingIntent([q]), null, `false positive: "${q}"`);
    }
  });

  await t('ordinary data questions stay negative', () => {
    for (const q of [
      'network latency by region',
      'revenue by territory',
      'take rate trend over time',
      'show me agent handle time',
      'what drives churn',
      'top 5 territories by revenue',
      'compare Q3 and Q4 sales',
    ]) {
      assert.equal(detectDrawingIntent([q]), null, `false positive: "${q}"`);
    }
  });

  console.log('\nresolveDrawingRoute — the shared decision');
  await t('a drawing request with a known domain routes straight to generate', () => {
    const r = resolveDrawingRoute(['contact center call escalation flow']);
    assert.ok(r, 'expected a drawing route');
    assert.equal(r!.action, 'generate');
    assert.equal(r!.drawKind, 'svg');
    const table = (r as any).table;
    assert.ok(tableToDomain.has(table), `unknown table ${table}`);
    assert.equal(tableToDomain.get(table), 'Contact Center');
  });

  await t('a non-drawing request returns null (normal routing continues)', () => {
    assert.equal(resolveDrawingRoute(['revenue by territory']), null);
    assert.equal(resolveDrawingRoute(['cash flow by month']), null);
  });

  await t('a document request is carried through as html, not svg', () => {
    const r = resolveDrawingRoute(['write me a memo about contact center performance']);
    assert.ok(r);
    assert.equal(r!.drawKind, 'html');
  });

  console.log('\nprovider parity — the actual bug: this must not be Sonnet-only');

  // THE EXACT CONFIRMED REPRO, asserted first and on both providers, because every
  // other case here is a generalisation of it. Typed verbatim: no draw/sketch/diagram
  // verb anywhere in the string.
  const REPRO = 'contact center call escalation flow';

  await t(`gemma  → generate: "${REPRO}"  (exact repro)`, async () => {
    const r = await analyzeQuery(REPRO, [], 'gemma');
    assert.equal(r.action, 'route', `fell through to ${r.action} — this is the reported bug`);
    assert.equal(tableToDomain.get((r as any).table), 'Contact Center');
  });

  await t(`sonnet → generate: "${REPRO}"  (exact repro)`, async () => {
    const r = await sonnetRespond(REPRO, []);
    assert.equal(r.action, 'generate', `fell through to ${r.action} — this is the reported bug`);
    assert.equal(tableToDomain.get((r as any).table), 'Contact Center');
  });

  // Requirement C: for BOTH providers, with and without a draw verb.
  const PHRASINGS = (domain: string) => [
    `draw the escalation flow for ${domain}`,
    `${domain} escalation flow`,
  ];

  for (const domain of DOMAINS) {
    for (const query of PHRASINGS(domain)) {
      await t(`gemma  → generate: "${query}"`, async () => {
        const r = await analyzeQuery(query, [], 'gemma');
        assert.equal(r.action, 'route',
          `fell through to ${r.action} — a drawing request must never become a text-only reply`);
        assert.ok((r as any).table, 'no table chosen');
      });

      await t(`sonnet → generate: "${query}"`, async () => {
        const r = await sonnetRespond(query, []);
        assert.equal(r.action, 'generate',
          `fell through to ${r.action} — a drawing request must never become a text-only reply`);
        assert.ok((r as any).table, 'no table chosen');
      });
    }
  }

  await t('both providers pick the SAME table for the same drawing request', async () => {
    // They share resolveDrawingRoute, so divergence means one of them grew its own copy.
    for (const q of ['contact center call escalation flow', 'draw the customer journey for Sales']) {
      const g = await analyzeQuery(q, [], 'gemma');
      const s = await sonnetRespond(q, []);
      assert.equal((g as any).table, (s as any).table, `providers diverged on "${q}"`);
    }
  });

  await t('neither provider reaches a qa_answer/chat reply for a drawing request', async () => {
    const s = await sonnetRespond('contact center call escalation flow', []);
    assert.ok(s.action !== 'answer' && s.action !== 'chat',
      `sonnet declined with action="${s.action}" — this is the regression the fast-path prevents`);
  });

  // ── The semantic net under the regex ────────────────────────────────────────
  //
  // THE BUG THIS SECTION EXISTS FOR. "the lifecycle of a support ticket" is not in
  // DRAW_INTENT_RE and never will be exhaustively — no enumeration of English survives
  // contact with users. Before the fallback, that miss did not error: it fell through to
  // the front-door model, where a diagram was one possible answer among several. Observed
  // live, same query, same server, two browser sessions: one rendered a flowchart, the
  // other returned prose whose narration still said "the flow below".
  //
  // Every test here injects `ask`, so nothing below touches a network or an API key. The
  // stub also COUNTS its calls, which is how the cost claims are asserted rather than
  // assumed.
  console.log('semantic fallback — the classifier behind the regex');

  const stub = (kind: string, why = 'test') => {
    const s = { calls: 0, ask: async (_sys: string, _user: string) => { s.calls++; return JSON.stringify({ kind, why }); } };
    return s;
  };

  await t('an enumerated phrasing never reaches the classifier', async () => {
    // The whole point of regex-first: the requests that already worked pay nothing.
    resetClassifierStats();
    const s = stub('none');
    const r = await resolveIntent(['draw the contact center call escalation flow'], 'gemma', s.ask);
    assert.equal(r.draw, 'svg');
    assert.equal(r.source, 'regex');
    assert.equal(s.calls, 0, 'the classifier was consulted for a phrasing the regex already handles');
  });

  await t('a phrasing the regex misses is recovered by the classifier', async () => {
    resetClassifierStats();
    const s = stub('diagram', 'asks for a process picture');
    assert.equal(detectDrawingIntent(['the lifecycle of a support ticket']), null, 'precondition: regex must miss');
    const r = await resolveIntent(['the lifecycle of a support ticket'], 'gemma', s.ask);
    assert.equal(r.draw, 'svg', 'the exact query from the bug report must now route to a drawing');
    assert.equal(r.source, 'model');
    assert.equal(s.calls, 1);
  });

  await t('the classifier can route a document and a structure question too', async () => {
    resetClassifierStats();
    const doc = await resolveIntent(['put together something I can hand to my director'], 'gemma', stub('document').ask);
    assert.equal(doc.draw, 'html');
    resetClassifierStats();
    const str = await resolveIntent(['which warehouse objects sit under this number'], 'gemma', stub('structure').ask);
    assert.equal(str.structure, true, 'a structure verdict must reach the KAG path');
    assert.equal(str.draw, null, 'structure is not a drawing — it must not take the LLM diagram path');
  });

  await t('an ordinary data question stays an ordinary data question', async () => {
    resetClassifierStats();
    const r = await resolveIntent(['revenue by region last quarter'], 'gemma', stub('none').ask);
    assert.equal(r.draw, null);
    assert.equal(r.structure, false);
  });

  await t('a repeated question is classified once and then cached', async () => {
    resetClassifierStats();
    const s = stub('diagram');
    await resolveIntent(['how a refund makes its way through the business'], 'gemma', s.ask);
    const again = await resolveIntent(['how a refund makes its way through the business'], 'gemma', s.ask);
    assert.equal(s.calls, 1, 'the same sentence was sent to the model twice');
    assert.equal(again.draw, 'svg', 'the cached verdict must route identically to the fresh one');
    assert.equal(again.source, 'cache');
  });

  await t('a classifier outage degrades to today behaviour, never to an error', async () => {
    // Fail-closed is the load-bearing property: this call sits in the query hot path, so
    // a model outage must cost a diagram, not the whole report.
    for (const broken of [
      async () => { throw new Error('transport exploded'); },
      async () => 'I think this is probably a flowchart, actually',   // no JSON at all
      async () => JSON.stringify({ kind: 'flowchart' }),              // label outside the allowlist
      async () => '',
    ]) {
      resetClassifierStats();
      const r = await resolveIntent(['the lifecycle of a support ticket'], 'gemma', broken as any);
      assert.equal(r.draw, null, 'a broken classifier must not invent a route');
      assert.equal(r.structure, false);
    }
  });

  await t('the classifier cannot hang the request', async () => {
    resetClassifierStats();
    const started = Date.now();
    const verdict = await classifyIntent(
      ['the lifecycle of a support ticket'],
      () => new Promise<string>(() => { /* never resolves */ }),
      120,
    );
    assert.equal(verdict.kind, 'none');
    assert.equal(verdict.source, 'unavailable');
    assert.ok(Date.now() - started < 3000, 'the timeout did not fire');
  });

  console.log('clarification recovery — the second half of the same bug');

  // Reproduces the real UI payload: on a clarification answer the frontend sends the
  // ANSWER as `query`, so the request survives only in conversationHistory. The
  // regex-only recovery could see only phrasings the regex already knew, which meant an
  // unenumerated request was dropped a SECOND time and generation received a bare report
  // name — the "narration mentions a flow, no flow is drawn" report.
  await t('an unenumerated request is recovered from conversation history', async () => {
    resetClassifierStats();
    const s = stub('diagram');
    const r = await recoverDrawRequest(['the lifecycle of a support ticket'], 'gemma', s.ask);
    assert.equal(r.request, 'the lifecycle of a support ticket');
    assert.equal(r.draw, 'svg', 'the recovered KIND must come back too — re-deriving it would need a second call');
  });

  // The real UI payload. The user's ANSWER is itself a prior turn by now, so the most
  // recent turn is "Contact Center" and the request is the one before it. Recovering the
  // newest turn blindly would fold a report name into the query and change nothing.
  await t('recovery skips the clarification answer and finds the actual request', async () => {
    resetClassifierStats();
    const ask = async (_s: string, user: string) =>
      JSON.stringify({ kind: /lifecycle/i.test(user) ? 'diagram' : 'none' });
    const r = await recoverDrawRequest(
      ['the lifecycle of a support ticket', 'Contact Center'], 'gemma', ask,
    );
    assert.equal(r.request, 'the lifecycle of a support ticket');
  });

  await t('recovery prefers the most recent of two drawing turns', async () => {
    resetClassifierStats();
    const r = await recoverDrawRequest(
      ['how a refund moves through the business', 'the lifecycle of a support ticket'],
      'gemma', stub('diagram').ask,
    );
    assert.equal(r.request, 'the lifecycle of a support ticket', 'an older request the user has talked past must not win');
  });

  await t('recovery stays silent on an ordinary conversation', async () => {
    resetClassifierStats();
    const s = stub('none');
    const r = await recoverDrawRequest(
      ['revenue by region', 'top 10 outlets by margin'], 'gemma', s.ask,
    );
    assert.equal(r.request, undefined, 'an ordinary conversation must not grow a diagram');
    assert.equal(r.draw, null);
  });

  await t('recovery makes no model call at all when the regex can see the request', async () => {
    resetClassifierStats();
    const s = stub('none');
    const r = await recoverDrawRequest(
      ['draw the escalation flow for territory T-007', 'Contact Center'], 'gemma', s.ask,
    );
    assert.equal(r.request, 'draw the escalation flow for territory T-007');
    assert.equal(r.draw, 'svg');
    assert.equal(s.calls, 0, 'the enumerated path must stay free');
  });

  await t('the candidate scan is bounded and runs concurrently', async () => {
    // Sequential classification would be ~8s per turn against the real provider, so a
    // long conversation would stall the request it is trying to help.
    resetClassifierStats();
    let inFlight = 0, peak = 0;
    const ask = async () => {
      inFlight++; peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 30));
      inFlight--;
      return JSON.stringify({ kind: 'none' });
    };
    const turns = ['a', 'b', 'c', 'd', 'e', 'f'].map((x) => `ordinary question ${x}`);
    await recoverDrawRequest(turns, 'gemma', ask);
    assert.ok(peak > 1, 'candidates were classified one after another, not together');
    assert.equal(getClassifierStats().asked, 3, 'the scan must stay capped at RECOVERY_SCAN_LIMIT');
  });

  await t('an empty history is not a classification request', async () => {
    resetClassifierStats();
    const s = stub('diagram');
    const r = await recoverDrawRequest([], 'gemma', s.ask);
    assert.equal(r.request, undefined);
    assert.equal(s.calls, 0, 'a first-turn query must not pay for a recovery classification');
  });

  console.log(`\n${passed} passed.`);
}

main();
