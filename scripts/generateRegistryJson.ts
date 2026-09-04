// Generates backend/src/registry/componentRegistry.json from componentRegistry.ts.
//
// componentRegistry.ts is the single source of truth (it is what uiValidator,
// componentSelector and governor import at runtime). This script emits the JSON
// projection of it so there is a language-neutral, build-time registry documenting
// every type the renderer maps — and so the two can be checked for parity in CI
// rather than drifting the way componentRegistry.legacy.json did (12 documented
// types vs 33 rendered).
//
// Run: npm run registry:generate     (checked by npm run check:registry)

import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { COMPONENT_REGISTRY } from '../backend/src/registry/componentRegistry';

const ROOT = join(__dirname, '..');

// IMPORTANT: this must NOT be written as a sibling of componentRegistry.ts.
// `require('../registry/componentRegistry')` resolves `.json` BEFORE ts-node
// registers `.ts`, so a sibling componentRegistry.json silently shadows the real
// registry — COMPONENT_REGISTRY comes back undefined and every consumer
// (uiValidator, componentSelector, governor) breaks at runtime. That is exactly
// why the old file was renamed componentRegistry.legacy.json. Writing into a
// subdirectory keeps the required filename without re-creating the collision.
const OUT = join(ROOT, 'backend/src/registry/generated/componentRegistry.json');

// renderTypes.ts is frontend ESM and this script runs in the backend's CJS ts-node
// context, so it cannot be imported (same boundary documented in test_timing.ts).
// Read it as text and extract the list, exactly as checkRegistryParity.js does.
const rendererSrc = readFileSync(join(ROOT, 'src/app/components/renderTypes.ts'), 'utf8');
const arr = rendererSrc.match(/RENDER_TYPES\s*=\s*\[([\s\S]*?)\]/);
if (!arr) throw new Error('Could not locate RENDER_TYPES array in renderTypes.ts');
const rendered = new Set<string>([...arr[1].matchAll(/'([^']+)'/g)].map(m => m[1]));

const payload = {
  $comment:
    'GENERATED FILE — do not edit by hand. Source of truth: backend/src/registry/componentRegistry.ts. ' +
    'Regenerate with `npm run registry:generate`; parity is enforced by `npm run check:registry`.',
  generatedFrom: 'backend/src/registry/componentRegistry.ts',
  componentCount: COMPONENT_REGISTRY.length,
  components: COMPONENT_REGISTRY.map(spec => ({
    type: spec.type,
    tier: spec.tier,
    family: spec.family,
    requiredProps: spec.requiredProps,
    optionalProps: spec.optionalProps,
    dataNeeds: spec.dataNeeds,
    ...(spec.shapeConstraints ? { shapeConstraints: spec.shapeConstraints } : {}),
    outputModes: spec.outputModes,
    whenToUse: spec.whenToUse,
    ...(spec.isLayoutWrapper ? { isLayoutWrapper: true } : {}),
    // Documents that the renderer actually maps this type — the property the
    // legacy JSON registry silently failed to keep true for 21 components.
    renderedByUITreeRenderer: rendered.has(spec.type),
  })),
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');

const unrendered = payload.components.filter(c => !c.renderedByUITreeRenderer);
console.log(`Wrote ${OUT}`);
console.log(`  ${payload.componentCount} components documented`);
console.log(`  ${payload.componentCount - unrendered.length} mapped by the renderer`);
if (unrendered.length) {
  console.error(`  ⚠ ${unrendered.length} documented but NOT rendered: ${unrendered.map(c => c.type).join(', ')}`);
  process.exitCode = 1;
}
