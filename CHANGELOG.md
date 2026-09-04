# Changelog

Add a line under **Unreleased** in your PR to auto-generate a "what's new" release
video when it merges to `main` — no manual CLI run needed.

## Entry format

```
- feature: <title> | <one-line summary> [| scene:<id>] [| <bullet> | <bullet> ...]
```

- Only `feature:` entries generate a video. `fix:`, `chore:`, `docs:`, etc. are
  ignored by the release-note pipeline (they never produce a video).
- `<title>` — short and benefit-framed (Claude may tighten it).
- `<summary>` — one line describing what the user can now do; Claude turns it into
  the narration script.
- `scene:<id>` (optional, anywhere in the line) picks the recreated-UI scene shown
  for that feature. Omit it and the scene is inferred from the title/summary.
  Scenes: `chat-kpi` (a report generating with KPI cards + chart · default),
  `export-docs` (the Export menu with PDF/Word/PPT highlighted),
  `export-video` (the Export menu with Video (MP4) highlighted). Add new scenes in
  `src/remotion/mock/AppMock.tsx`.
- Extra `|`-separated segments become **explicit bullets**. Omit them and Claude
  infers the bullets from the summary.

Each release renders as ONE combined "tour" video — a cover, one scene per feature
(a native recreation of the real Report Hub UI, not a slide), then an outro — with
the narration word-timed into on-screen captions.

Example:

```
- feature: Export reports to PDF, Word, or PowerPoint | One-click export from the report toolbar | scene:export-docs
- feature: Saved views | Pin a filtered dashboard and return to it later | Pin from the toolbar | Shareable links
```

On merge to `main`, all `feature:` entries in **Unreleased** are batched into one
release, rendered, and surfaced in the sidebar **Help** panel. Cut a version
manually with a friendly name via:

```
npm run release:note -- --input release.json --version v1.2.0 --name "Report Hub 1.2"
```

The single-feature flag form (`--title "..." --summary "..." --area "..."`) still
works as a fallback/override.

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
