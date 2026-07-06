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

if (missingInRegistry.length || missingInRenderer.length) {
  console.error('❌ Registry parity FAILED');
  if (missingInRegistry.length) console.error('   In renderer, missing from registry:', missingInRegistry);
  if (missingInRenderer.length) console.error('   In registry, missing from renderer:', missingInRenderer);
  process.exit(1);
}
console.log(`✅ Registry parity OK — ${registryTypes.size} components in sync.`);
