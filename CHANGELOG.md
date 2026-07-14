# Changelog

Add a line under **Unreleased** in your PR to auto-generate a "what's new" release
video when it merges to `main` — no manual CLI run needed.

## Entry format

```
- feature: <title> | <one-line summary> [| <bullet> | <bullet> ...]
```

- Only `feature:` entries generate a video. `fix:`, `chore:`, `docs:`, etc. are
  ignored by the release-note pipeline (they never produce a video).
- `<title>` — short and benefit-framed (Claude may tighten it).
- `<summary>` — one line describing what the user can now do; Claude turns it into
  the narration script.
- Extra `|`-separated segments become **explicit bullets**. Omit them and Claude
  infers the bullets from the summary.

Example:

```
- feature: Export reports to PDF, Word, or PowerPoint | One-click export from the report toolbar, keeps charts and tables intact
- feature: Saved views | Pin a filtered dashboard and return to it later | Pin from the toolbar | Access under Saved views | Shareable links
```

On merge to `main`, all `feature:` entries in **Unreleased** are batched into one
dated release (`YYYY.MM.DD`), rendered, and surfaced in the sidebar **Help** panel.
The manual path — `npm run release:note -- --title "..." --summary "..."` — still
works unchanged as a fallback/override.

---

## Unreleased

<!--
Add your feature: line(s) here as part of your PR. Example (uncomment & edit):
- feature: Export reports to PDF, Word, or PowerPoint | One-click export from the report toolbar, keeps charts and tables intact
-->

## 2026.07.14

- feature: Model upgrade and tool-use adapter | Now on Claude Sonnet with a tool-use adapter that picks the right chart, KPI, or table for your question
- feature: Document and deck export | Export any report to PDF, Word, or PowerPoint in one click from the report toolbar
- feature: Generative narrated video | Turn any report into a short narrated explainer video from the video reports tray
