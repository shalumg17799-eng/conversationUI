# Shared Component Library

A reusable, token-driven UI kit built on **shadcn/ui** + **Tailwind v4**. Designed to be
lifted into other projects: copy `src/app/components/ui` (primitives),
`src/app/components/shared` (app components), `src/lib/utils.ts` (the `cn` helper),
and the token block in `src/styles/theme.css`.

Everything is driven by **CSS design tokens** — change a value in `theme.css` and the
whole app restyles. No hardcoded hex in components.

---

## Design tokens (`src/styles/theme.css`)

| Token | Tailwind class | Meaning |
|-------|----------------|---------|
| `--primary` `#1A1917` | `bg-primary` `text-primary` | Near-black — primary buttons, key text |
| `--brand` `#D4572A` | `bg-brand` `text-brand` `border-brand` | Terracotta — brand accent, CTAs, active nav |
| `--brand-subtle` `#FEF0EC` | `bg-brand-subtle` | Light terracotta tint — active/selected backgrounds |
| `--background` `#F7F6F3` | `bg-background` | Warm off-white app surface |
| `--card` `#FFFFFF` | `bg-card` | Panels, cards |
| `--muted` / `--accent` | `bg-muted` `bg-accent` | Warm neutral steps — chips, hovers |
| `--muted-foreground` | `text-muted-foreground` | Secondary text |
| `--border` `#ECEAE6` | `border-border` | Hairlines |
| `--ring` `#D4572A` | `ring-ring` | Terracotta focus ring |
| `--success` / `--warning` / `--destructive` | `text-success` … | Semantic states |

Primary scheme: **near-black primary on warm neutrals, terracotta as the brand accent.**

---

## Primitives — `src/app/components/ui` (shadcn/ui)

47 token-based primitives: `accordion, alert, alert-dialog, avatar, badge, button,
breadcrumb, calendar, card, carousel, chart, checkbox, collapsible, command,
context-menu, dialog, drawer, dropdown-menu, form, hover-card, input, label,
menubar, navigation-menu, pagination, popover, progress, radio-group, resizable,
scroll-area, select, separator, sheet, sidebar, skeleton, slider, switch, table,
tabs, textarea, toggle, tooltip, sonner` …

Plus three brand-tuned wrappers with a simple variant API:

### `Button` — `ui/Button.tsx`
```tsx
<Button variant="brand">New report</Button>
// variant: primary | brand | secondary | outline | ghost | destructive
// size:    sm | md | lg | icon
```

### `Badge` — `ui/Badge.tsx`
```tsx
<Badge variant="success">Active</Badge>
// variant: default | outline | secondary | accent | brand | success | warning | destructive
```

### `Card` — `ui/Card.tsx`
```tsx
<Card>{children}</Card>            // padded panel
<Card noPadding>{table}</Card>     // flush
```

---

## Shared app components — `src/app/components/shared`

Import everything from the barrel:
```tsx
import { PageHeader, MetricGrid, StatCard, SectionCard, DataTable } from '@/app/components/shared';
```

| Component | Purpose | Key props |
|-----------|---------|-----------|
| **`PageHeader`** | Page title block | `title, eyebrow?, description?, actions?, icon?` |
| **`StatCard`** | Single KPI tile | `label, value, delta?, trend?, invertTrendColor?, icon?, hint?` |
| **`MetricGrid`** | Responsive grid of StatCards | `columns?: 2\|3\|4` |
| **`SectionCard`** | Titled content panel | `title?, description?, actions?, flush?` |
| **`SearchInput`** | Pill search field | standard input props |
| **`Toolbar`** | Action bar above lists | `left?, right?` |
| **`FilterBar`** | Segmented pill filter | `tabs, value, onChange` |
| **`StatusBadge`** | Semantic status pill + dot | `tone, dot?` |
| **`EmptyState`** | Zero-data placeholder | `icon?, title, description?, action?` |
| **`DataTable<T>`** | Generic typed table | `columns, rows, rowKey, onRowClick?, empty?` |

### Patterns

**Page scaffold**
```tsx
<Layout>
  <PageHeader
    title="Reports"
    description="Browse and manage saved reports."
    actions={<Button variant="brand">New report</Button>}
  />
  <MetricGrid columns={4}>
    <StatCard label="Total reports" value="128" delta="+12" trend="up" />
    {/* … */}
  </MetricGrid>
  <SectionCard title="All reports" flush>
    <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} />
  </SectionCard>
</Layout>
```

**List header**
```tsx
<Toolbar
  left={<><SearchInput placeholder="Search…" /><FilterBar tabs={tabs} value={f} onChange={setF} /></>}
  right={<Button variant="brand">New</Button>}
/>
```

---

## Conventions

1. **No hardcoded colors in components.** Always use token classes (`bg-card`, `text-brand`, …).
2. **Spacing scale:** page sections `space-y-6/8`; card padding `p-5`; grid gaps `gap-4`.
3. **Radii:** cards `rounded-[12px]`, controls `rounded-[8px]`, pills `rounded-full`.
4. **Icons:** `lucide-react`, sized `size-4`/`size-5` via the `[&_svg]` utilities.
5. **The chat UI** (`Conversational_new`, `TalkMigration`) is converted separately; everything else composes from this kit.

> Scope note: the chat interface is being migrated to shadcn in its own phase. All other
> pages are built from the primitives + shared components above.
