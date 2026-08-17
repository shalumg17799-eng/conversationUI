import React from 'react';
import { createRoot } from 'react-dom/client';
import '../src/styles/index.css';
import { UITreeRenderer } from '../src/app/components/UITreeRenderer';

// Everything below goes through the REAL pipeline:
//   COMPONENT_MAP -> Suspense -> lazy chunk -> guardMermaid -> escapeLabelAngles
//   -> mermaid.render -> strip <style> -> sanitizeArtifact -> buildArtifactSrcDoc
//   -> <iframe sandbox="">
// Nothing here stubs any part of it.

// Verbatim output from a live backend answering
// "draw the escalation flow for territory T-007" against real BigQuery.
// Note the `>` in the Return Rate node — Mermaid drops a raw '>' in a label, so
// this doubles as the regression case for escapeLabelAngles.
const LIVE = `flowchart TD
  Start["Territory T-007 Performance Review"] --> CheckTakeRate{"Take Rate < 60%? (Current: 55.7%)"}
  CheckTakeRate -- Yes --> EscalateTM["Escalate to Territory Manager"]
  CheckTakeRate -- No --> CheckReturnRate{"Return Rate > 4%? (Current: 4.66%)"}
  CheckReturnRate -- Yes --> EscalateTM
  CheckReturnRate -- No --> CheckRIS{"RIS % < 85%? (Current: 82.6%)"}
  CheckRIS -- Yes --> EscalateTM
  CheckRIS -- No --> Stable["Maintain Current Strategy"]
  EscalateTM --> ReviewRD{"Review by Regional Director"}
  ReviewRD --> ActionPlan["Implement Corrective Action Plan"]
  ActionPlan --> Monitor["Monitor Monthly Performance"]`;

type Case = { id: string; label: string; expect: string; content: string; title: string };

const CASES: Case[] = [
  {
    id: 'live', title: 'T-007 Escalation Path',
    label: 'Live backend output — "draw the escalation flow for territory T-007"',
    expect: 'renders; "Return Rate > 4%?" keeps its > sign',
    content: LIVE,
  },
  {
    id: 'dense', title: 'T-007 Escalation Flow — April Performance',
    label: 'REGRESSION — the 18-node diagram that came back as "too much content was removed"',
    expect: 'renders; retention must not gate machine-generated SVG',
    content: `flowchart TD
  A["Territory T-007 — Apr Metrics"] --> B{"Take Rate below 60%?"}
  B -->|"Yes — 55.7%"| C["FLAG: Low Take Rate"]
  B -->|"No"| D["Take Rate OK"]
  C --> E{"AARD above 28%?"}
  E -->|"Yes — 29.45%"| F["FLAG: High AARD"]
  E -->|"No"| G["AARD OK"]
  F --> H{"Return Rate above 4%?"}
  H -->|"Yes — 4.66%"| I["FLAG: Elevated Return Rate"]
  H -->|"No"| J["Return Rate OK"]
  I --> K{"RIS below 85%?"}
  K -->|"Yes — 82.6%"| L["MULTI-FLAG: Critical Threshold"]
  K -->|"No"| M["RIS Acceptable"]
  L --> N["Notify Territory Manager"]
  N --> O{"Resolved within 48h?"}
  O -->|"No"| P["Escalate to Region Lead"]
  O -->|"Yes"| Q["Close Incident"]`,
  },
  {
    id: 'sequence', title: 'Report generation sequence',
    label: 'sequenceDiagram',
    expect: 'renders; frame height matches the diagram exactly',
    content: 'sequenceDiagram\n  participant U as User\n  participant S as Sonnet\n  participant P as Pipeline\n  U->>S: Ask a question\n  S->>P: design_report\n  P-->>U: Streamed cards',
  },
  {
    id: 'er', title: 'Territory model',
    label: 'erDiagram',
    expect: 'renders',
    content: 'erDiagram\n  TERRITORY ||--o{ ORDER : places\n  ORDER ||--|{ LINE_ITEM : contains\n  TERRITORY {\n    string id\n    float takeRate\n  }',
  },
  {
    id: 'refused-click', title: 'Escalation path',
    label: 'SECURITY — click statement',
    expect: 'REFUSED — fallback card, never an iframe',
    content: 'flowchart TD\n  A["Territory T-007"] --> B["Escalate"]\n  click A "https://evil.test"',
  },
  {
    id: 'refused-markup', title: 'Injected label',
    label: 'SECURITY — embedded markup in a label',
    expect: 'REFUSED — fallback card',
    content: 'flowchart TD\n  A["<img src=x onerror=alert(1)>"] --> B["Escalate"]',
  },
  {
    id: 'refused-init', title: 'Config override',
    label: 'SECURITY — %%{init}%% directive tries to relax securityLevel',
    expect: 'REFUSED — fallback card',
    content: `%%{init: {'securityLevel':'loose'}}%%\nflowchart TD\n  A["x"] --> B["y"]`,
  },
  {
    id: 'refused-pie', title: 'Revenue by region',
    label: 'SCOPE — pie is a chart, not a structural diagram',
    expect: 'REFUSED — use PieChart instead',
    content: 'pie title Revenue\n  "EMEA" : 42\n  "AMER" : 35',
  },
  {
    id: 'syntax-error', title: 'Broken diagram',
    label: 'ROBUSTNESS — passes the guard, fails to parse',
    expect: 'REFUSED — "diagram syntax error", must not crash the page',
    content: 'flowchart TD\n  A[[[[ --> ]]]]] B\n  --> --> -->',
  },
];

const MONO = { fontFamily: '"JetBrains Mono", ui-monospace, monospace' };

function Playground() {
  const [text, setText] = React.useState(
    'flowchart LR\n  A["Paste any Mermaid source here"] --> B["It renders live"]',
  );
  const [applied, setApplied] = React.useState(text);
  return (
    <div style={{ marginBottom: 40, padding: 16, border: '1px solid #E5E3DF', borderRadius: 12, background: '#fff' }}>
      <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Playground — type your own source</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        style={{ ...MONO, width: '100%', height: 150, fontSize: 12, padding: 10,
                 border: '1px solid #E5E3DF', borderRadius: 8, resize: 'vertical' }}
      />
      <button
        onClick={() => setApplied(text)}
        style={{ marginTop: 8, marginBottom: 16, padding: '6px 14px', fontSize: 12, fontWeight: 600,
                 background: '#2563EB', color: '#fff', border: 0, borderRadius: 8, cursor: 'pointer' }}
      >
        Render
      </button>
      {/* key= forces a remount so each Render is a clean run of the whole path */}
      <UITreeRenderer
        key={applied}
        node={{ renderType: 'mermaid-artifact', props: { title: 'Playground', content: applied } }}
      />
    </div>
  );
}

function App() {
  return (
    <div style={{ padding: 24, background: '#FAF9F7', fontFamily: 'Inter, sans-serif', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>mermaid-artifact — UI harness</h1>
      <p style={{ fontSize: 12, color: '#6B6965', marginBottom: 8 }}>
        Real UITreeRenderer, real lazy chunk, real sandboxed iframe. Open DevTools:
        the Network tab should show <code style={MONO}>mermaid</code> loading only after this page renders,
        and every diagram below should sit inside an <code style={MONO}>&lt;iframe sandbox=""&gt;</code>.
      </p>
      <p style={{ fontSize: 12, color: '#6B6965', marginBottom: 24 }}>
        A "REFUSED" case must show the grey fallback card with the source as plain text — if any of
        them renders a diagram instead, that is a bug.
      </p>

      <Playground />

      {CASES.map((c) => (
        <div key={c.id} id={c.id} style={{ marginBottom: 32 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#1C1917' }}>{c.label}</p>
          <p style={{ fontSize: 11, color: '#8A8785', marginBottom: 8 }}>expected: {c.expect}</p>
          <UITreeRenderer
            node={{ renderType: 'mermaid-artifact', props: { title: c.title, content: c.content } }}
          />
        </div>
      ))}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
