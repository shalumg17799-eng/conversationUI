
  # BI Fabric Static Demo

  This is a code bundle for BI Fabric Static Demo. The original project is available at https://www.figma.com/design/wU1riaCz175xRMD1BmRosj/BI-Fabric-Static-Demo.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

  ## "What's new" release videos

  When a feature ships, the app can auto-generate a short (15–30s) explainer video and
  surface it to users at login. It reuses the existing Claude integration and the
  Remotion renderer — it's a new trigger + composition, not a new system.

  ### Trigger a release note

  Run from the repo root (executes with `cwd=backend`, so it reuses `backend/.env`,
  the same `SONNET_MODEL`/`ANTHROPIC_API_KEY` config, and the `backend/data` storage):

  ```bash
  # From flags
  npm run release:note -- \
    --title "PPT export" \
    --summary "Reports can now be exported to PowerPoint with one click." \
    --area "Reports" \
    --bullet "One-click .pptx export" \
    --bullet "Charts kept as native slides" \
    --version 2026.07.13            # optional; defaults to today's date (YYYY.MM.DD)

  # Or from a JSON file / inline JSON (e.g. built from a PR body or CHANGELOG entry)
  npm run release:note -- --input change.json      # { title, summary, bullets, affectedArea, version }
  npm run release:note -- --json '{"title":"...","summary":"..."}'
  ```

  This (1) asks Claude to write a short title + narration script + bullets, (2) renders
  the `ReleaseNoteVideo` Remotion composition to MP4, and (3) records it in the registry.
  Claude generation degrades gracefully — with no API key it uses the locally-authenticated
  `claude` CLI, and if Claude is unavailable it falls back to the raw input so a video still
  renders.

  ### Where things live

  - **Videos:** `backend/data/releases/{version}.mp4`, served at `/media/releases/{version}.mp4`.
  - **Registry:** `backend/data/releases/releases.json`.
  - **Endpoint:** `GET /api/releases/latest` → the most recent release, or `204` if none.
  - **Client:** on any authenticated page, `WhatsNewBadge` fetches the latest release and,
    if its `version` differs from the browser's `lastSeenReleaseVersion` (localStorage),
    shows a dismissible bottom-right pill. Clicking it plays the video; watching or dismissing
    marks the version seen.

  ### CI / on-merge (optional)

  The script is a plain offline job, so wire it wherever suits — e.g. a `post-merge` git hook
  or a CI step on merge to `main` that reads the PR title/body into `--json`/`--input` and runs
  `npm run release:note`. No CI config ships in this repo; add one that calls the same command.

  > Note: rendering needs a `claude` CLI login (or `ANTHROPIC_API_KEY`) and enough free RAM;
  > on tight hosts set `VIDEO_RENDER_CONCURRENCY=1`. The release video is on-screen text only
  > (no voiceover) — adding TTS would reuse `ttsService`, mirroring the report pipeline.
  