// CI gate: fails (exit 1) if the component registry and the frontend renderer drift.
// Run: npm run check:registry
//
// Pure Node CommonJS — reads both source files as text and compares their type sets.
// No ts-node / tsconfig / ESM-CJS boundary, so it runs identically on Windows cmd and
// Linux CI. Both files use a controlled, flat format, so extraction is exact:
//   - renderTypes.ts:        RENDER_TYPES = [ 'X', 'Y', ... ]
//   - componentRegistry.ts:  { type: 'X', ... }
const fs = require('fs');
const path = require('path');

const registrySrc = fs.readFileSync(path.join(__dirname, '../backend/src/registry/componentRegistry.ts'), 'utf8');
const rendererSrc = fs.readFileSync(path.join(__dirname, '../src/app/components/renderTypes.ts'), 'utf8');

const registryTypes = new Set([...registrySrc.matchAll(/\btype:\s*'([^']+)'/g)].map(m => m[1]));

const arr = rendererSrc.match(/RENDER_TYPES\s*=\s*\[([\s\S]*?)\]/);
if (!arr) {
  console.error('❌ Could not locate RENDER_TYPES array in renderTypes.ts');
  process.exit(1);
}
const rendererTypes = new Set([...arr[1].matchAll(/'([^']+)'/g)].map(m => m[1]));

const missingInRegistry = [...rendererTypes].filter(t => !registryTypes.has(t));
const missingInRenderer = [...registryTypes].filter(t => !rendererTypes.has(t));

// Third registry: the generated JSON projection (build-time / language-neutral).
// componentRegistry.legacy.json documented only 12 of 33 rendered types before this
// check existed; enforcing the JSON here is what keeps that gap from reopening.
// Lives in generated/ deliberately: a sibling componentRegistry.json would shadow
// componentRegistry.ts in ts-node's module resolution and break every consumer.
const jsonPath = path.join(__dirname, '../backend/src/registry/generated/componentRegistry.json');
let jsonTypes = null;
if (fs.existsSync(jsonPath)) {
  const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  jsonTypes = new Set((parsed.components || []).map(c => c.type));
}

const missingInJson = jsonTypes ? [...registryTypes].filter(t => !jsonTypes.has(t)) : [];
const extraInJson = jsonTypes ? [...jsonTypes].filter(t => !registryTypes.has(t)) : [];

if (missingInRegistry.length || missingInRenderer.length || missingInJson.length || extraInJson.length || !jsonTypes) {
  console.error('❌ Registry parity FAILED');
  if (missingInRegistry.length) console.error('   In renderer, missing from registry:', missingInRegistry);
  if (missingInRenderer.length) console.error('   In registry, missing from renderer:', missingInRenderer);
  if (!jsonTypes) console.error('   componentRegistry.json missing — run: npm run registry:generate');
  if (missingInJson.length) console.error('   In registry, missing from JSON (run npm run registry:generate):', missingInJson);
  if (extraInJson.length) console.error('   In JSON, missing from registry (stale — regenerate):', extraInJson);
  process.exit(1);
}
console.log(`✅ Registry parity OK — ${registryTypes.size} components in sync (registry ↔ renderer ↔ JSON).`);
