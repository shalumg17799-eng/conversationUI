
  # BI Fabric Static Demo

  This is a code bundle for BI Fabric Static Demo. The original project is available at https://www.figma.com/design/wU1riaCz175xRMD1BmRosj/BI-Fabric-Static-Demo.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

  ## "What's new" release videos

  When features ship, the app generates short narrated explainer videos and surfaces
  them in the sidebar **Help** panel (with a notification dot for unseen releases). A
  release bundles **many features**, each independently scripted (Claude), narrated
  (ElevenLabs), and rendered (Remotion).

  ### Ship a feature → get a video automatically (no CLI)

  Add one line under **Unreleased** in [`CHANGELOG.md`](./CHANGELOG.md) as part of your PR:

  ```
  - feature: <title> | <one-line summary> [| <bullet> | <bullet> ...]
  ```

  Only `feature:` lines generate a video (`fix:`, `chore:`, … are ignored). On merge to
  `main`, the [`release-note` workflow](./.github/workflows/release-note.yml) parses the
  Unreleased section and, if there are `feature:` entries, batches them into one dated
  release (`YYYY.MM.DD`) and runs the render pipeline — one video per feature. No feature
  lines → the workflow no-ops. See `CHANGELOG.md` for the full format and examples.

  **CI requires two repo secrets** (rendering runs on the runner, so it uses the Claude
  **API** path, not the `claude` CLI): `ANTHROPIC_API_KEY` and `ELEVENLABS_API_KEY`
  (plus optional `ELEVENLABS_VOICE_ID`). After a successful render the workflow commits
  only the metadata back — the CHANGELOG move + `releases.json` — and uploads the MP4s as
  a **build artifact**. **A deploy step must place those MP4s at
  `backend/data/releases/<version>/` so the backend can serve them** (MP4s are
  `.gitignore`d and not committed).

  ### Manual trigger (fallback / local)

  The CLI still works unchanged — good for local runs or a manual override:

  ```bash
  # Single feature
  npm run release:note -- --title "PPT export" --summary "One-click export to PowerPoint." --bullet "Charts kept as slides"

  # Many features at once (the shape CI uses)
  npm run release:note -- --input release.json
  # release.json: { "version": "2026.07.14", "features": [ { "title": "...", "summary": "...", "bullets": ["..."] }, ... ] }

  # Preview what the CHANGELOG would produce, without rendering:
  npm run release:parse            # prints { version, features[] } from Unreleased
  ```

  Claude degrades gracefully — with no `ANTHROPIC_API_KEY` it uses the locally-authenticated
  `claude` CLI, and if Claude is unavailable it falls back to the raw input so a video still
  renders. Renders need enough free RAM; on tight hosts set `VIDEO_RENDER_CONCURRENCY=1`.

  ### Where things live

  - **Videos:** `backend/data/releases/<version>/<feature-id>.mp4`, served at
    `/media/releases/<version>/<feature-id>.mp4`.
  - **Registry:** `backend/data/releases/releases.json` (tracked; MP4s are not).
  - **Endpoints:** `GET /api/releases/latest` → newest release with its `features[]` (or
    `204` if none); `GET /api/releases` → all releases, title + bullets only.
  - **Client:** `HelpMenu` (sidebar, above Settings) polls the latest release; a dot shows
    when its `version` differs from the browser's `whatsNewLastSeenVersion`. Opening the
    panel lists each feature (title + bullets) and plays a feature's narrated video on click,
    and marks the release seen.
  