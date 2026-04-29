# MASTER.md — ReportHub Design System

---

## 1. Style Pattern

- **Primary style:** Warm Minimalism — neutral, earthy base palette with purposeful use of a single warm accent color. Every surface feels tactile and inviting without sacrificing information density.
- **Secondary influence:** Editorial SaaS — generous whitespace, typographic hierarchy borrowed from editorial design (Perplexity's clarity + Linear's restraint + Notion's warmth). Data is presented like well-typeset content, not dashboard widgets.
- **Avoid:** Cold corporate blue palettes, heavy drop shadows, dark-mode-first design, gratuitous glassmorphism, neon gradients, overly rounded "toy" UI, dense enterprise grid layouts with no breathing room.

---

## 2. Color Palette

| Token                          | Hex         | Usage                                      |
|-------------------------------|-------------|---------------------------------------------|
| Page background               | `#F7F6F3`   | Main canvas — warm off-white                |
| Surface (cards)               | `#FFFFFF`   | Cards, modals, popovers                     |
| Surface secondary             | `#F4F2EF`   | Inputs, tags, code blocks, inset areas      |
| Border default                | `#E5E3DF`   | Card borders, dividers, input borders       |
| Border hover                  | `#C8C5BF`   | Hovered card/input borders                  |
| Text primary                  | `#1C1917`   | Headings, primary body text                 |
| Text secondary                | `#6B6965`   | Descriptions, secondary labels              |
| Text muted/meta               | `#8A8785`   | Timestamps, placeholders, disabled text     |
| Brand accent (primary CTA)    | `#D4572A`   | Primary buttons, active nav, focus rings    |
| Brand accent hover            | `#BF4D25`   | Hovered primary buttons                     |
| Success                       | `#1D9E75`   | Positive trends, success badges             |
| Warning                       | `#D97706`   | Caution badges, warning states              |
| Danger                        | `#D4183D`   | Error states, destructive actions            |

---

## 3. Category Colors (for card accents, dots, stripes)

| Category        | Hex         | Usage                                     |
|----------------|-------------|-------------------------------------------|
| Blue category   | `#2563EB`   | Revenue, performance, primary metrics     |
| Purple category | `#7C3AED`   | AI/ML features, insights, predictions     |
| Teal category   | `#0D9488`   | Growth, engagement, health metrics        |
| Amber category  | `#D97706`   | Alerts, trends, time-sensitive data       |

---

## 4. Typography

### Font Stack
- **Display font** (headings, hero, large numbers): `Bricolage Grotesque` — variable, weights 400–700
- **Body font** (labels, nav, body text): `Inter` — variable, weights 400–600
- **Mono font** (stat numbers, data values): `JetBrains Mono` — weight 500

### Scale

| Token                    | Size    | Weight | Tracking     | Line-height | Font              |
|-------------------------|---------|--------|-------------|-------------|-------------------|
| Hero heading             | 30px    | 700    | -0.02em     | 1.2         | Bricolage Grotesque |
| Section heading          | 15px    | 600    | -0.01em     | 1.4         | Bricolage Grotesque |
| Card title               | 14px    | 600    | —           | 1.4         | Inter              |
| Body                     | 14px    | 400    | —           | 1.6         | Inter              |
| Label/Meta               | 12px    | 500    | 0.01em      | 1.4         | Inter              |
| Section label (eyebrow)  | 11px    | 600    | 0.06em      | 1.0         | Inter, uppercase, `#8A8785` |

---

## 5. Spacing & Shape

| Token                    | Value   |
|-------------------------|---------|
| Border radius (cards)    | 12px    |
| Border radius (inputs)   | 20px    |
| Border radius (buttons)  | 8px     |
| Border radius (pills/tags) | 9999px |
| Card padding             | 24px    |
| Section gap              | 32px    |
| Card gap                 | 12px    |

---

## 6. Effects & Depth

| Token                        | Value                                                                 |
|-----------------------------|-----------------------------------------------------------------------|
| Card box-shadow (default)    | `0 1px 2px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.03)`     |
| Card box-shadow (hover)      | `0 4px 12px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04)`    |
| Card hover transform         | `translateY(-1px)`                                                   |
| Card hover transition        | `all 200ms cubic-bezier(0.4, 0, 0.2, 1)`                            |
| Topbar effect                | `background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(12px)` |
| Focus ring                   | `0 0 0 3px rgba(212, 87, 42, 0.08)` + `border-color: #D4572A`      |
| Page background decoration   | Two subtle radial gradients — `radial-gradient(circle at 20% 30%, rgba(212, 87, 42, 0.06) 0%, transparent 70%)` top-left warm blob, `radial-gradient(circle at 80% 60%, rgba(83, 74, 183, 0.05) 0%, transparent 70%)` bottom-right cool blob |

---

## 7. Component Rules

### Ask Input Zone

- **Container:** Full-width section at top of Talk page. `max-width: 720px`, centered, `padding: 0 24px`.
- **Input field:** Height `38px`, `background: #F4F2EF`, `border: 1px solid #E5E3DF`, `border-radius: 20px`, `padding-left: 40px` (for icon), `font-size: 14px`, `color: #1C1917`, placeholder `color: #8A8785`.
- **Input focus:** `border-color: #D4572A`, `box-shadow: 0 0 0 3px rgba(212, 87, 42, 0.08)`, `outline: none`.
- **Ask button default:** `background: #1C1917`, `color: #FFFFFF`, `border-radius: 8px`, `padding: 8px 16px`, `font-size: 13px`, `font-weight: 500`.
- **Ask button hover:** `background: #111110`, `box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12)`.
- **Suggestion chips default:** `background: #FFFFFF`, `border: 1px solid #E5E3DF`, `border-radius: 9999px`, `padding: 6px 12px`, `font-size: 11px`, `color: #6B6965`, `box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04)`.
- **Suggestion chips hover:** `background: #F7F6F3`, `border-color: #C8C5BF`, `box-shadow: 0 2px 4px rgba(0, 0, 0, 0.06)`.

### Quick Summary Cards

- **Background:** Rich gradient fills per category — Blue: `linear-gradient(135deg, #1E40AF 0%, #1D4ED8 50%, #2563EB 100%)`, Purple: `linear-gradient(135deg, #5B21B6 0%, #6D28D9 50%, #7C3AED 100%)`, Teal: `linear-gradient(135deg, #115E59 0%, #0F766E 50%, #0D9488 100%)`, Amber: `linear-gradient(135deg, #92400E 0%, #B45309 50%, #D97706 100%)`.
- **Title:** `#FFFFFF`, `14px`, `font-weight: 600`, Inter.
- **Description:** `rgba(255, 255, 255, 0.72)`, `12.5px`, `line-height: 1.5`.
- **Chevron/arrow:** `rgba(255, 255, 255, 0.5)` default, `rgba(255, 255, 255, 0.9)` on hover, `16px`, right-aligned.
- **Hover state:** `translateY(-1px)`, shadow `0 8px 24px rgba(0, 0, 0, 0.15)`, `transition: all 200ms ease`.
- **Inner highlight:** `inset 0 1px 0 rgba(255, 255, 255, 0.12)` — subtle top-edge light catch.

### Stat Cards

- **Background:** `#FFFFFF`, `border: 1px solid #E5E3DF`, `border-radius: 12px`, `padding: 20px`.
- **Icon tile:** `40px × 40px`, `border-radius: 10px`, tinted background per category — Blue: `#EFF6FF`, Purple: `#F5F3FF`, Teal: `#F0FDFA`, Amber: `#FFFBEB`. Icon color matches category hex.
- **Number:** `JetBrains Mono`, `24px`, `font-weight: 600`, `color: #1C1917`.
- **Label:** `12px`, `font-weight: 500`, uppercase, `letter-spacing: 0.04em`, `color: #8A8785`.
- **Trend indicator:** Success `#1D9E75` with `▲`, danger `#D4183D` with `▼`, `font-size: 12px`, `font-weight: 500`.
- **Hover:** `border-color: #C8C5BF`, `box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06)`, `translateY(-1px)`.

### Report Cards

- **Background + border:** `background: #FFFFFF`, `border: 1px solid #E5E3DF`, `border-radius: 12px`, `overflow: hidden`.
- **Category tag:** `font-size: 10px`, `font-weight: 600`, `letter-spacing: 0.05em`, uppercase, `border-radius: 9999px`, `padding: 3px 8px`. Background is category color at 10% opacity, text is category color.
- **Bottom stripe:** `height: 3px`, full-width gradient matching category — e.g., Blue: `linear-gradient(90deg, #2563EB, #60A5FA)`, Purple: `linear-gradient(90deg, #7C3AED, #A78BFA)`.
- **Hover arrow:** Default `opacity: 0`, `transform: translateX(-4px)`. On hover: `opacity: 1`, `transform: translateX(0)`, `transition: all 200ms ease`.
- **Hover state:** `border-color: #C8C5BF`, `box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06)`.
- **Restricted card:** `opacity: 0.55`, title `color: #8A8785`, no hover lift, cursor `not-allowed`.

### Sidebar

- **Background:** `#FFFFFF`, `border-right: 1px solid #E5E3DF`, `width: 64px`.
- **Active nav item:** `background: #FEF0EC`, `border-left: 2px solid #D4572A`, icon `color: #D4572A`.
- **Hover nav item:** `background: #F5F2EE`.
- **Inactive icon color:** `#B0ADA7`, hover `#6B6965`.
- **Conversation items:** Separated by `border-bottom: 1px solid #F4F2EF`, `padding: 10px 12px`.
- **New button:** `background: #1C1917`, `color: #FFFFFF`, `border-radius: 8px`, `width: 100%`, `padding: 8px`, `font-size: 12px`, `font-weight: 500`.

### Section Labels

- **Style:** `font-size: 11px`, `font-weight: 600`, uppercase, `letter-spacing: 0.06em`, `color: #8A8785`, Inter.
- **See all link:** `color: #D4572A`, `font-size: 12px`, `font-weight: 500`, normal case. Hover: `color: #BF4D25`, `text-decoration: underline`.

---

## 8. Anti-patterns to Avoid

1. **No cold corporate blue as primary.** Blue is a category color only — never the brand or background tint. The product identity is warm, not clinical.
2. **No heavy card shadows.** Shadows must be barely perceptible. Depth comes from border + subtle lift, not drop-shadow drama.
3. **No all-caps headings larger than 11px.** Uppercase is reserved for tiny eyebrow labels. Using it on section titles or card headings feels like shouting.
4. **No colored backgrounds on full sections.** The page background is always `#F7F6F3`. Colored fills belong inside cards or badges — never as section-level bands.
5. **No icon-only buttons without tooltips.** Every icon button must have an `aria-label` and a tooltip on hover. Enterprise users cannot guess icon meanings.
6. **No animated page transitions or skeleton screen overuse.** Shimmer loaders are acceptable for initial data fetch. Do not animate route changes or add skeleton screens to components that load in under 200ms.
7. **No gradient text.** Gradients belong on card backgrounds and bottom stripes. Text must always be a solid color for legibility.
8. **No mixing rounded and sharp corners on the same page.** All interactive elements use the radius scale defined above. Never mix `border-radius: 0` with rounded cards.

---

## 9. Accessibility Rules

| Rule                          | Requirement                                                    |
|------------------------------|----------------------------------------------------------------|
| Minimum contrast ratio        | 4.5:1 for body text, 3:1 for large text (WCAG AA)             |
| Minimum touch target          | 44 × 44px for all interactive elements                         |
| Focus ring                    | Always visible — `0 0 0 3px rgba(212, 87, 42, 0.08)` + `border-color: #D4572A`. Never remove `outline` without replacing it. |
| Disabled states               | `opacity: 0.5`, `pointer-events: none`, `cursor: not-allowed` |
| Color independence            | Never use color alone to convey meaning — pair with icon, text, or pattern |
| Keyboard navigation           | All interactive elements reachable via Tab. Active states must match hover states. |
| Reduced motion                | Respect `prefers-reduced-motion: reduce` — disable `translateY` lifts and shimmer animations. |
| Screen reader labels          | All icon buttons require `aria-label`. Chart data must have text alternatives. |

---

## 10. CSS Variable Map

```css
:root {
  /* Background & Surface */
  --color-bg:              #F7F6F3;
  --color-surface:         #FFFFFF;
  --color-surface-secondary: #F4F2EF;

  /* Borders */
  --color-border:          #E5E3DF;
  --color-border-hover:    #C8C5BF;

  /* Text */
  --color-text-primary:    #1C1917;
  --color-text-secondary:  #6B6965;
  --color-text-muted:      #8A8785;

  /* Brand */
  --color-accent:          #D4572A;
  --color-accent-hover:    #BF4D25;
  --color-accent-bg:       #FEF0EC;

  /* Semantic */
  --color-success:         #1D9E75;
  --color-warning:         #D97706;
  --color-danger:          #D4183D;

  /* Category */
  --color-cat-blue:        #2563EB;
  --color-cat-purple:      #7C3AED;
  --color-cat-teal:        #0D9488;
  --color-cat-amber:       #D97706;

  /* Typography */
  --font-display:          'Bricolage Grotesque', system-ui, sans-serif;
  --font-body:             'Inter', system-ui, sans-serif;
  --font-mono:             'JetBrains Mono', monospace;

  /* Radii */
  --radius-card:           12px;
  --radius-input:          20px;
  --radius-button:         8px;
  --radius-pill:           9999px;

  /* Spacing */
  --space-card-padding:    24px;
  --space-section-gap:     32px;
  --space-card-gap:        12px;

  /* Shadows */
  --shadow-card:           0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.03);
  --shadow-card-hover:     0 4px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04);
  --shadow-focus:          0 0 0 3px rgba(212,87,42,0.08);
}
```

---

*Last updated: 2026-03-24*
*Design system version: 1.0*
