// Regenerate the golden Mermaid SVG fixtures in scripts/fixtures/mermaid/.
//
// Run manually after a Mermaid version bump, NOT in CI:
//   node scripts/gen_mermaid_fixtures.mjs
//
// Why fixtures at all: scripts/test_mermaid.ts asserts that real Mermaid output
// survives strip-<style> -> sanitizeArtifact('mermaid') with enough retention to
// stay above MIN_RETENTION_RATIO. That property depends on Mermaid's exact emitted
// markup, so the test needs genuine output — but it must also run in plain Node
// with no browser. Committing pre-rendered SVG satisfies both.
//
// Mermaid ships ESM with bare specifiers (d3, dompurify, stylis...), so it cannot
// be loaded straight into a page from node_modules. This script bundles it with
// Vite (already a devDependency) into a single IIFE, then renders each sample in
// headless Chromium via the backend's playwright.
//
// The render configuration below MUST stay in step with getMermaid() in
// src/app/components/MermaidArtifact.tsx — fixtures generated under a different
// config would not be testing what actually ships.

import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'scripts', 'fixtures', 'mermaid');
const TMP = join(ROOT, 'node_modules', '.mermaid-fixture-build');

// One sample per allowlisted diagram type in mermaidGuard.ts. Content is
// deliberately domain-flavoured — labels with spaces, punctuation and digits are
// what actually stress the sanitizer's text handling.
const SAMPLES = {
  flowchart: `flowchart TD
  A["Territory T-007"] --> B{"Take rate < 56%?"}
  B -->|Yes| C["Escalate to Region Lead"]
  B -->|No| D["Monitor weekly"]
  C --> E["Ops review"]
  D --> E`,

  graph: `graph LR
  Ingest["BigQuery ingest"] --> Shape["Shape analyzer"]
  Shape --> Select["Component selector"]
  Select --> Render["UI tree renderer"]`,

  sequenceDiagram: `sequenceDiagram
  participant U as User
  participant S as Sonnet
  participant P as Pipeline
  U->>S: Ask a question
  S->>P: design_report
  P-->>U: Streamed cards`,

  classDiagram: `classDiagram
  class ComponentSpec {
    +string type
    +string tier
    +requiredProps()
  }
  class Registry {
    +getSpec()
  }
  Registry --> ComponentSpec`,

  stateDiagram: `stateDiagram
  [*] --> Off
  Off --> Shadow
  Shadow --> Enforce
  Enforce --> [*]`,

  'stateDiagram-v2': `stateDiagram-v2
  [*] --> Off
  Off --> Shadow : enable
  Shadow --> Enforce : promote
  Enforce --> Off : rollback`,

  erDiagram: `erDiagram
  TERRITORY ||--o{ ORDER : places
  ORDER ||--|{ LINE_ITEM : contains
  TERRITORY {
    string id
    float takeRate
  }`,

  mindmap: `mindmap
  root((Artifacts))
    HTML
      Documents
    SVG
      Bespoke drawings
    Mermaid
      Flowcharts
      Sequences`,

  timeline: `timeline
  title Phase 2 delivery
  2026-01 : Guard module
  2026-02 : Sanitizer + registry
  2026-03 : Renderer + prompt`,
};

async function bundleMermaid() {
  const { build } = await import('vite');
  mkdirSync(TMP, { recursive: true });
  const entry = join(TMP, 'entry.js');
  writeFileSync(entry, "import mermaid from 'mermaid';\nwindow.__mermaid = mermaid;\n");

  await build({
    root: ROOT,
    logLevel: 'error',
    configFile: false,
    build: {
      outDir: TMP,
      emptyOutDir: false,
      lib: { entry, formats: ['iife'], name: 'MermaidFixtureBundle', fileName: () => 'bundle.js' },
      minify: false,
    },
  });
  return join(TMP, 'bundle.js');
}

async function main() {
  const require = createRequire(join(ROOT, 'backend', 'package.json'));
  const { chromium } = require('playwright');

  console.log('bundling mermaid...');
  const bundlePath = await bundleMermaid();

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('about:blank');
  await page.addScriptTag({ path: bundlePath });

  mkdirSync(OUT, { recursive: true });
  const version = require('mermaid/package.json').version;

  for (const [name, code] of Object.entries(SAMPLES)) {
    const svg = await page.evaluate(async ({ code, id }) => {
      const m = window.__mermaid;
      m.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'base',
        themeVariables: {
          primaryColor: '#EFF6FF',
          primaryBorderColor: '#2563EB',
          primaryTextColor: '#1C1917',
          secondaryColor: '#F0FDF4',
          secondaryBorderColor: '#1D9E75',
          tertiaryColor: '#FEF3C7',
          tertiaryBorderColor: '#D97706',
          mainBkg: '#EFF6FF',
          nodeBorder: '#2563EB',
          lineColor: '#8A8785',
          textColor: '#1C1917',
          clusterBkg: '#F4F2EF',
          clusterBorder: '#E5E3DF',
          edgeLabelBackground: '#FFFFFF',
          fontSize: '16px',
        },
        htmlLabels: false,
        flowchart: { htmlLabels: false, useMaxWidth: false },
        class: { htmlLabels: false, useMaxWidth: false },
        sequence: { useMaxWidth: false },
        state: { useMaxWidth: false },
        er: { useMaxWidth: false },
        mindmap: { useMaxWidth: false },
        timeline: { useMaxWidth: false },
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      });
      const { svg } = await m.render(id, code);
      return svg;
    }, { code, id: `fx-${name}` });

    const file = join(OUT, `${name}.svg`);
    writeFileSync(file, svg);
    console.log(`  ${name}.svg  ${svg.length} bytes`);
  }

  writeFileSync(join(OUT, 'VERSION'), `mermaid@${version}\n`);
  console.log(`\nwrote ${Object.keys(SAMPLES).length} fixtures for mermaid@${version}`);

  await browser.close();
  rmSync(TMP, { recursive: true, force: true });
}

main().catch((e) => { console.error(e); process.exit(1); });
