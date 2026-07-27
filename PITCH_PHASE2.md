# Report Hub — Phase 2 Pitch Script
**AI Weekly Forum · 14 slides · target 18–20 min + demo**

Presenters: Vinod · Shobhit · Shalini · Ankit

---

## Before you start: the framing problem

This room has seen Report Hub before. That changes the job. A returning audience does not
need "here is what generative UI is" — they need **"here is what moved."**

So the arc is:

> **Phase 1 proved the contract. Phase 2 fanned it out.**
> One validated UI Type Tree. Now: many models, many renderers, and a release channel
> that narrates itself.

Say that sentence in the first 45 seconds. Everything after it is evidence.

**The one line to protect:** *We did not build four features. We built one contract and
four adapters onto it.* That is the engineering claim that makes this look like
architecture instead of a feature list.

---

## SLIDE 1 — Cover: "Report Hub · Generative UI for Enterprise BI"
**Time: 45 sec. Speaker: Vinod.**

Do not read the slide. Set the floor.

> "Most of you saw Report Hub in Phase 1. Quick reset so we're all on the same page:
> a business user asks a question in plain English, and instead of getting a chat
> answer *about* their data, they get a **real dashboard** — KPIs, charts, tables —
> composed by an AI model from live BigQuery rows and streamed into the browser as it
> hydrates.
>
> Phase 1 answered: *can a model reliably compose a typed UI?* Yes. That's shipped.
>
> Phase 2 is a different question: **now that the contract holds — what else can we
> hang off it?** Three things, and one we didn't plan."

Point at the WHAT'S NEW block. Name them fast, do not explain yet:
Claude Sonnet alongside Gemma · export to PDF/Excel/PowerPoint · a narrated video of the
report. Then: *"and a fourth that fell out of the architecture — I'll come back to it."*

That tease is deliberate. The release-video feature is your best moment; don't spend it here.

---

## SLIDE 2 — "From ticket queue to a typed UI tree"
**Time: 2 min. Speaker: Vinod.**

This is the Phase 1 recap. **Move fast — they've seen it.** Your only goal is to
re-establish the pipeline so slides 4–6 land.

The problem, in one breath:

> "Every new question is a ticket. SQL, dashboard build, review — days to weeks. And the
> dashboard is stale the moment the question shifts. The backlog never clears because the
> questions never stop."

The solution, in one breath:

> "Natural-language analytics. The model composes a **typed UI tree** — and every node is
> streamed to the browser over SSE as it hydrates with real rows. No spinner. The report
> assembles in front of you."

Then walk the eight stages on the right — **as a list, ~10 seconds total**, not stage by
stage. Slide 5 is where you earn the detail:

> "Cache, classify, clarify if ambiguous, BigQuery, analyse the shape, generate the tree,
> hydrate with real rows, stream. Eight stages. Slide 5 opens it up."

### ⚠️ Fix before you present
The slide says **"8 BigQuery domains live."** The code has **8 configured data sources
across 6 distinct tables and 4 domains** (Sales, Network, Customer Experience, Contact
Center). If someone counts, you're caught on a trivial thing.

**Change to: "8 report sources · 4 domains live."** Same impressiveness, actually true.

---

## SLIDE 3 — "What shipped, and what Phase 2 adds"
**Time: 2 min. Speaker: Vinod → hand to Shobhit.**

This is the spine of the whole pitch. Three rows, one sentence each, then the punchline.

> "**Model.** Phase 1 was Gemma-only — one model, hardcoded. Phase 2 has a provider
> adapter: Gemma or Claude Sonnet, selected per user role at login. Not a config flag —
> the two providers have separate credential paths.
>
> "**Output.** Phase 1 rendered to chat DOM and nowhere else. If you wanted that report
> in a deck, you screenshotted it. Phase 2: PDF, Excel, PowerPoint — and a narrated
> video.
>
> "**Registry.** This one's a confession. Phase 1 had a silent drift — the documented
> component registry and what the renderer actually rendered had come apart. Phase 2
> reconciled it to a single registry, and the renderer can't compile if they drift again."

Then land the bar at the bottom — **slow down, this is the thesis:**

> "**One contract, many renderers.** The UI Type Tree from Phase 1 is *unchanged*. We
> didn't rewrite the generator to make PowerPoint work. PowerPoint is a walk over the
> same tree. So is the video. That's why three features cost what one usually does."

### ⚠️ Fix before you present
The slide says **"12-vs-33 component drift."** Verifiable in the repo: the legacy
registry file has **exactly 12** types; the current registry has **exactly 31**. There is
no artifact anywhere for 33.

**Change to "12 → 31."** It matches the "31-component registry" you already claim in the
next box — right now those two numbers on the *same slide* don't reconcile, and that's
exactly the kind of thing this audience notices.

---

## SLIDE 4 — "Subsystems · trust boundary · flow summary"
**Time: 90 sec. Speaker: Shobhit.**

Dense architecture slide. **Do not read the boxes.** Nobody reads a nine-box diagram while
someone talks over it. Give them the shape and move.

> "One screen so you know where everything lives. Three things worth your attention:
>
> "**The orchestrator** — `runStreamingPipeline` — is the only thing that talks to
> BigQuery and the only thing that talks to the model. Every request funnels through one
> function. That's why adding a second model was days, not weeks.
>
> "**The trust boundary**: the model never sees a credential and never touches BigQuery.
> It receives a data *shape* and twenty sample rows, and it returns a tree. That's it.
>
> "**Hydration is deterministic.** The model proposes structure. Real rows get bound to it
> in our code, not the model's. So the model can be wrong about *layout* — it cannot be
> wrong about *numbers*."

That last line is your strongest trust argument in the whole deck. Let it sit for a beat.

### ⚠️ Fix before you present — this one is real
The DATA ROUTER box lists **`v_monthly_territory_perf`** and **`v_churn / v_product`**.

- `v_monthly_territory_perf` — real name is **`v_monthly_territory_performance`**
- **`v_churn` does not exist.** Churn is a *report angle* over `fact_sug_monthly_rollup`,
  not a table.
- **`v_product` does not exist.** There's no product fact table — only a `dim_devices`
  dimension.

Real tables: `fact_sug_monthly_rollup` (the workhorse — 11 of 15 report angles),
`v_monthly_territory_performance`, `v_daily_sales_detail`, `fact_network_kpi_points`,
`fact_dynamic_scores`, `fact_contact_center_metrics`.

If a data person in that room screenshots this slide and greps for `v_churn`, the whole
deck's credibility takes the hit — not just this box.

**Also:** the box lists `intentClassifier`, but the streaming pipeline doesn't call it —
routing is done by the LLM. Harmless on the slide; just **don't claim a keyword classifier
is doing the routing** if asked.

---

## SLIDE 5 — "How Report Hub composes a UI"
**Time: 3 min — your longest technical slide. Speaker: Shobhit.**

This is where the audience decides if it's real engineering or a demo trick. Six steps,
~25 seconds each. Use the SSE panel on the right as your visual anchor.

**1 · Cache + clarify gate.**
> "Stable hash of query plus persona plus conversation. Five-minute TTL. Miss goes to
> classification. If the question's ambiguous we *ask* — up to three follow-ups, then we
> stop asking and generate. A system that clarifies forever is a system nobody uses."

**2 · Classify intent.**
> "Metric, dimension, time range, intent type — trend, comparison, distribution — plus a
> needs-clarification flag."

**3 · Build and run BigQuery.**
> "Intent maps to a table, we build SQL with filters and grouping, run it, get rows back.
> Real rows. Nothing synthetic anywhere in this pipeline."

**4 · Analyse data shape.** *(Sell this one — it's the non-obvious idea.)*
> "Before the model sees anything, we profile the columns ourselves: types, cardinality,
> is there a time series. That produces a shape signature.
>
> "This is the trick. **The model never has to guess what the data looks like.** It's
> told. So it's not asking 'is this a time series?' — it's answering 'given that this
> *is* a time series with 12 points and 4 territories, what's the right component?'
> Narrower question, far more reliable answer."

**5 · Generate the UI tree.**
> "Shape plus twenty sample rows go to the model. Back comes a title, a description, and
> a set of cards. Retries on rate limits and server errors."

**6 · Fix, hydrate, stream.**
> "Three things. We realign column casing — models lowercase everything, BigQuery doesn't.
> We hydrate: bind full result rows to the tree, dedupe time-series axes. Then we emit —
> meta, then each component, then follow-up prompts.
>
> "Each component **hydrates and drops into the message bubble live.** No spinner. That's
> the SSE stream on the right, and that's what you'll see in the demo."

---

## SLIDE 6 — "The same five layers, now governed and fanned out"
**Time: 2 min. Speaker: Shobhit or Shalini.**

*(Working from the deck's five-layer governance narrative — adjust if the slide differs.)*

The honest version of this slide is more persuasive than the triumphant one:

> "Five layers, each independently gated: the registry constrains what can be built.
> Output mode constrains the family. Constraints derive from the shape. The validator
> checks the tree. And a governor can regenerate or fall back if something's off.
>
> "Here's the part I'd want to know if I were sitting where you are: **most of these run
> in telemetry-first mode right now.** They observe and record; they don't block. That's
> deliberate. We wanted to know the *real* violation rate before we started rejecting
> model output in front of users. You can't tune a gate you've never measured.
>
> "The stack is built. Turning each one from observe to enforce is a flag, and it's
> evidence-driven."

Saying this out loud does two things: it inoculates you against "is it actually enforcing?"
and it makes the *rest* of your claims more believable, because you clearly flagged the
soft one.

---

## SLIDE 7 — "Report Hub in action" (DEMO)
**Time: 5–6 min. Driver: Shalini. Narrator: Vinod or Ankit.**

Two people. One drives, one talks. A silent demo dies.

### Demo order — this sequence is doing rhetorical work

**1 · Ask a fresh question. Let it stream.** *(~60s)*
Do not talk over the stream. Let them watch components land one by one.
Then: *"Nothing there was pre-built. That layout didn't exist ten seconds ago."*

**2 · Ask a follow-up on the same report.** *(~45s)* ← **do not skip this**
> "Watch the latency."

The follow-up path skips BigQuery entirely — it edits the existing tree from cached
context. It's dramatically faster than the first question, and it's the thing that makes
this feel like a *conversation* instead of a query box. It's currently your most
under-sold feature and it is free to demo.

**3 · Export the same report to PowerPoint. Open it.** *(~90s)*
Then the line that matters — **click into a chart in PowerPoint:**
> "Look — that's a **native, editable PowerPoint chart**. Not a screenshot of our UI.
> Your CFO can restyle it, change the colours, put it in their board deck. Same tree that
> rendered the browser view, walked into the Office XML format.
>
> "And the talking points on the slide — peak, low, trend — those were derived from the
> actual data, not written by hand."

**4 · Play the narrated video.** *(~90s)*
> "Same tree again. Third renderer. Scenes derived from the components, narration derived
> from the *data* — it's reading the actual numbers — and word-timed captions from the
> voice synthesis."

### Close the demo with the architecture point, not with "cool huh"
> "One question. One tree. Four renderers — browser, PowerPoint, PDF, video. **Generated
> once.** That's the whole Phase 2 thesis in ninety seconds."

### Demo safety
- **Have a recorded fallback ready.** This is a live BigQuery + live model demo in front of
  a forum. Assume the network betrays you.
- Pre-warm the cache with your demo query, then decide: cached is fast but you can't claim
  live. Recommend **running one cold** (the drama is worth the 6 seconds) and having the
  rest warm.
- Have the exported PPTX **already open in another window** as a backup — export is
  client-side and fast, but don't gamble the best moment of the deck on it.
- Know which provider you're logged in as. Internal role → Gemma. Client role → Sonnet.

---

## SLIDE 8 — "Progress against the Phase 2 PRD"
**Time: 2 min. Speaker: Vinod.**

Five requirements: three done, one partial, one not started. **The partial and the
not-started are the credible part of this slide.** Do not rush them.

**1 · Model upgrade — DONE.**
> "Provider adapter. Gemma or Claude Sonnet, bound to user role at login. Worth one detail:
> the two providers use genuinely different credential paths — and Sonnet has two transports
> depending on how it's authenticated. Credentials never reach the browser; role-to-provider
> resolves server-side on every request."

*(This is the "different credentials" point from your brief — it's real and it's more
interesting than "we added a second model.")*

**2 · Document export — DONE.**
> "PDF, Excel, PowerPoint. All three walk the UI Type Tree. All client-side."

**3 · Registry reconciliation — PARTIAL.**
> "Registry's done: 12 components documented before, 31 now, single source of truth. The
> renderer is type-bound to that list — **it will not compile if they drift.** What's not
> done is HTML/SVG artifact output. Hence partial. That's an honest partial."

**4 · Generative video — DONE.**
> "Narrated video compiled from the same node tree."

**5 · Adaptive UI — DONE.**
> "Conversational personalisation. You type 'move the report panel to the bottom', 'hide the
> sidebar', or 'use a compact layout' in chat — and the UI re-arranges itself and remembers
> it across sessions. A typed contract underneath: four surfaces, four operations, backend
> intent-detection, schema validation, telemetry, a persisted preference store. All four
> surfaces render — report panel moves/resizes/hides, the history panel and nav rail hide
> and the layout reflows around them, density switches globally. Repositioning is scoped to
> the report panel by design; the secondary surfaces toggle and resize, they don't float."

Then — **this is where you cash the slide-1 tease:**

> "Now — the thing that wasn't in the PRD.
>
> "Once the video renderer existed, we noticed it didn't actually care that it was being
> fed a *report* tree. So we pointed it at our **CHANGELOG**.
>
> "Now when a release lands on main, CI parses the changelog, and any entry tagged as a
> feature gets rendered into a **narrated release tour video** — one video per release,
> one scene per feature, word-timed captions, voiced. It shows up in the app's Help menu
> with a notification dot, and it opens itself once for anyone who hasn't seen that
> version yet.
>
> "**Nobody wrote a release note. Nobody recorded a screencast.** The feature announces
> itself because the video pipeline was already general.
>
> "That's what I mean by *one contract, many renderers*. We built it for reports. It
> turned out not to be about reports at all."

That's your closer. It's the strongest thing in the deck because it's the only feature you
didn't plan — which is the best possible evidence that the architecture is right.

### ⚠️ Fix before you present
The slide says the registry is **"CI-enforced."** The parity script exists
(`npm run check:registry`) and works — but **it is not wired into any GitHub workflow.**
The only workflow in the repo is the release-note one. So today it's a script someone runs,
not a gate.

Two options:
- **Wire it up before the forum** — it's genuinely a few lines in a workflow file, and then
  the claim is just true. **Recommended.**
- **Or reword to "compile-enforced"** — which *is* true today and is arguably a stronger
  claim anyway, since a type error can't be merged past. The renderer maps every render
  type in a typed record; drift breaks the build.

Right now "CI-enforced ✓ 31 in sync" is the single most falsifiable sentence in the deck,
and it's on the status slide — the one people screenshot.

---

## Slides 9–14 — need your input

You gave me slides 1–8. The deck has 14. Based on the codebase, slides 9–14 should be
carrying:

- **the release-video / CHANGELOG feature** — where does it live? If it doesn't have a
  slide, it needs one. Right now it's your best material and it's homeless.
- the governance / telemetry detail
- Adaptive UI (R5) — delivered (all four surfaces render); free repositioning beyond the report panel is the Phase 3 ask
- next steps / close

Send those and I'll sync them the same way.

---

## Summary of the four factual corrections

| Slide | Says | Reality | Do |
|---|---|---|---|
| 2 | "8 BigQuery domains live" | 8 sources, 6 tables, 4 domains | → "8 report sources · 4 domains" |
| 3 | "12-vs-33 drift" | 12 legacy, 31 current; no 33 anywhere | → "12 → 31" (also fixes the self-contradiction with the 31 box) |
| 4 | `v_churn`, `v_product`, `v_monthly_territory_perf` | first two don't exist; third is misspelled | → real table names |
| 8 | Registry "CI-enforced" | script exists, not wired to any workflow | → wire it up, or say "compile-enforced" |

The `v_churn` / `v_product` one is the one I'd fix tonight regardless of anything else.

---

## Q&A — the four questions you will actually get

**"Does the model touch our data?"**
> "It sees a column profile and twenty sample rows. It never gets a credential and never
> issues a query. And it never supplies a number — hydration binds real rows to the tree
> in our code. The model's blast radius is layout."

**"What if it generates something wrong?"**
> "Five gates. Registry, output mode, shape constraints, validator, governor. Most are in
> observe-mode today by design — we're measuring the real violation rate before we start
> rejecting output live. And there's a deterministic fallback if generation returns nothing
> usable."

**"Why two models?"**
> "Different constraints for different users. Role decides at login. The point is it's an
> adapter — one function is the choke point for every model call — so a third model is a
> day, not a quarter."

**"Isn't this just a chart library with an LLM on top?"**
> "A chart library needs someone to have decided the chart. Here, nobody did. The
> composition step — which components, how many, in what arrangement — is the product. The
> proof is the export: we point the same tree at PowerPoint and get native editable charts
> out. There's no chart library involved in that path at all."
