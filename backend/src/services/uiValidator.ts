import Ajv, { ValidateFunction } from 'ajv';
import { COMPONENT_REGISTRY, REGISTRY_BY_TYPE, ComponentSpec } from '../registry/componentRegistry';

// Phase 3: registry-driven structural validation, SHADOW MODE ONLY.
// Rewired from the legacy JSON registry to componentRegistry.ts (single source of truth).
// This module is PASSIVE — it reports violations; it never rejects, trims, or alters output.

export type ViolationCategory =
  | 'unknown_render_type'
  | 'missing_prop'
  | 'invalid_prop_type'
  | 'invalid_structure';

export interface ValidationViolation {
  component: string;
  category: ViolationCategory;
  detail: string;
  path: string;
}

// Loose node shape — accepts ReportCard and UITypeTree alike (we only read these keys).
interface ValidatableNode {
  renderType?: unknown;
  props?: unknown;
  children?: unknown;
  sections?: unknown;
}

// ── Prop type dictionary ──────────────────────────────────────────────────────
// Prop names are globally consistent across components in this codebase (xKey is
// always a string, data always an array, etc.), so types are keyed by prop name.
// The set of props to check per component still derives from ComponentSpec
// (requiredProps ∪ optionalProps) — this dictionary only supplies their types.
type PropSchema = { type: string | string[] };
const PROP_TYPES: Record<string, PropSchema> = {
  // string keys / labels
  xKey: { type: 'string' }, yKey: { type: 'string' }, nameKey: { type: 'string' },
  valueKey: { type: 'string' }, labelKey: { type: 'string' }, rowKey: { type: 'string' },
  colKey: { type: 'string' }, barKey: { type: 'string' }, lineKey: { type: 'string' },
  zKey: { type: 'string' }, timeColumn: { type: 'string' }, highlightKey: { type: 'string' },
  title: { type: 'string' }, message: { type: 'string' }, text: { type: 'string' },
  body: { type: 'string' }, description: { type: 'string' }, label: { type: 'string' },
  unit: { type: 'string' }, trend: { type: 'string' }, delta: { type: 'string' },
  deltaLabel: { type: 'string' }, sort: { type: 'string' }, type: { type: 'string' },
  barLabel: { type: 'string' }, lineLabel: { type: 'string' }, highlight: { type: 'string' },
  metric: { type: 'string' }, currentLabel: { type: 'string' }, previousLabel: { type: 'string' },
  color: { type: 'string' }, explanation: { type: 'string' }, datasetId: { type: 'string' },
  tableId: { type: 'string' },
  // numbers
  limit: { type: 'number' }, max: { type: 'number' }, target: { type: 'number' },
  pageSize: { type: 'number' },
  // number | string (formatted values)
  value: { type: ['number', 'string'] }, current: { type: ['number', 'string'] },
  previous: { type: ['number', 'string'] },
  // arrays
  columns: { type: 'array' }, data: { type: 'array' }, rows: { type: 'array' },
  items: { type: 'array' }, metrics: { type: 'array' }, entities: { type: 'array' },
  events: { type: 'array' }, steps: { type: 'array' }, filterValues: { type: 'array' },
  children: { type: 'array' }, warnings: { type: 'array' }, sections: { type: 'array' },
  // booleans
  smooth: { type: 'boolean' }, showChart: { type: 'boolean' }, editable: { type: 'boolean' },
};

// ── Ajv schema generation (from ComponentSpec) ────────────────────────────────
const ajv = new Ajv({ allErrors: true, strict: false });

function buildSchema(spec: ComponentSpec): object {
  const properties: Record<string, PropSchema> = {};
  for (const p of [...spec.requiredProps, ...spec.optionalProps]) {
    if (PROP_TYPES[p]) properties[p] = PROP_TYPES[p];
  }
  return {
    type: 'object',
    properties,
    required: spec.requiredProps,
    additionalProperties: true, // shadow: never fail on extra/unknown props
  };
}

const validators = new Map<string, ValidateFunction>();
for (const spec of COMPONENT_REGISTRY) {
  validators.set(spec.type, ajv.compile(buildSchema(spec)));
}

// ── Tree walk ─────────────────────────────────────────────────────────────────
function validateNode(node: ValidatableNode, path: string, out: ValidationViolation[]): void {
  if (!node || typeof node !== 'object' || typeof node.renderType !== 'string') {
    out.push({ component: '(none)', category: 'invalid_structure', detail: 'node missing renderType', path });
    return;
  }
  const renderType = node.renderType;
  const spec = REGISTRY_BY_TYPE[renderType];

  if (!spec) {
    out.push({ component: renderType, category: 'unknown_render_type', detail: renderType, path });
  } else {
    const props = node.props;
    if (props === null || typeof props !== 'object' || Array.isArray(props)) {
      out.push({ component: renderType, category: 'invalid_structure', detail: 'props is not an object', path });
    } else {
      const validate = validators.get(renderType)!;
      if (!validate(props)) {
        for (const err of validate.errors ?? []) {
          if (err.keyword === 'required') {
            out.push({ component: renderType, category: 'missing_prop', detail: err.params.missingProperty, path });
          } else if (err.keyword === 'type') {
            const prop = err.instancePath.replace(/^\//, '') || '(root)';
            out.push({ component: renderType, category: 'invalid_prop_type', detail: `${prop}:${err.message}`, path });
          } else {
            out.push({ component: renderType, category: 'invalid_structure', detail: err.message ?? 'schema error', path });
          }
        }
      }
    }
  }

  // Structural: children must be an array if present.
  if (node.children !== undefined && !Array.isArray(node.children)) {
    out.push({ component: renderType, category: 'invalid_structure', detail: 'children is not an array', path });
  }
  if (Array.isArray(node.children)) {
    node.children.forEach((c: ValidatableNode, i: number) => validateNode(c, `${path}/${renderType}[${i}]`, out));
  }
  if (Array.isArray(node.sections)) {
    node.sections.forEach((s: any, si: number) =>
      (Array.isArray(s?.components) ? s.components : []).forEach((c: ValidatableNode, ci: number) =>
        validateNode(c, `${path}/${renderType}.sec${si}[${ci}]`, out)));
  }
}

// Validate a list of cards. Returns violations + how many nodes were checked.
// Never throws for malformed input — always returns a result.
export function validateTree(cards: ValidatableNode[]): { violations: ValidationViolation[]; nodeCount: number } {
  const violations: ValidationViolation[] = [];
  let nodeCount = 0;
  const count = (node: ValidatableNode): void => {
    nodeCount++;
    if (Array.isArray(node?.children)) node.children.forEach(count);
    if (Array.isArray(node?.sections)) node.sections.forEach((s: any) =>
      (Array.isArray(s?.components) ? s.components : []).forEach(count));
  };
  (Array.isArray(cards) ? cards : []).forEach((c, i) => { count(c); validateNode(c, `[${i}]`, violations); });
  return { violations, nodeCount };
}
