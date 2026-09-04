# KAG explained from scratch

For someone who has never heard of KAG, knowledge graphs, or Neo4j.

No prior knowledge assumed. Every term is explained the first time it appears.

---

## 1. What this app does

Someone types a question in plain English:

> *"churn by territory"*

The app has to turn that into charts. To do that it must:

1. Work out **which table** in the database holds the answer
2. Fetch the rows
3. Ask an AI to turn those rows into charts and a written insight

Step 1 is the hard one, and KAG is entirely about step 1.

---

## 2. Why step 1 is hard

The company's data lives in **20 tables** — spreadsheets, essentially. Names like
`fact_sug_monthly_rollup` and `v_daily_sales_detail`. Each has columns like
`take_rate_pct` and `return_rate_pct`.

A person asking a question does not know or care about any of that. They say "churn",
"how are we doing in Dallas", "average call time".

So something has to translate. **That translator used to be the AI, and it was
guessing.**

### How it used to work

Before KAG, the app pasted a **big text file describing every table and column** into
the AI's prompt, then asked "which one should I use?"

Three things went wrong, and all three were happening for real:

**Problem 1 — the AI can't know your vocabulary.**
There is no column called `churn` anywhere. The nearest thing is `return_rate_pct`. A
human analyst knows those are related. An AI reading a list of column names has no
reliable way to make that leap. So "churn by territory" matched nothing and the app fell
back to whichever table happened to be first in the list — the wrong one.

**Problem 2 — the description keeps growing.**
That text file is about **1,300 words of prompt** today, sent with *every single
question*, most of it about tables irrelevant to what was asked. With 20 tables it's
manageable. With 200 it becomes enormous — and you pay for it on every question.

**Problem 3 — nobody checked the AI's answer.**
The AI would write "make a chart of **Take Rate %**" — using the human-friendly name.
The actual column is `take_rate_pct`. The chart came out **empty**, and nothing noticed.

---

## 3. So what is a "knowledge graph"?

Forget the term for a second. Think of an **underground map**.

A list of stations tells you the stations exist. A *map* tells you how they **connect** —
which ones you can reach from where, and in how many stops.

A knowledge graph is the same idea applied to data. Instead of a flat list of tables and
columns, you store the **connections between them**:

```
"churn"  ──is another word for──▶  "Return Rate %"
                                         │
                                   is shown in
                                         ▼
                        "Churn & Retention Metrics" (a report)
                                         │
                                   which reads
                                         ▼
                            fact_sug_monthly_rollup (a table)
```

Now "churn" has a **path** to a real table. Nobody had to write a rule saying
"churn means use this table" — the connections do the work.

Two pieces of vocabulary, and that's all you need:

- **Node** — a thing. A table, a column, a business term, a city name.
- **Edge** — a labelled connection between two things.

That's it. A knowledge graph is nodes and edges.

**Neo4j** is just the database we store them in — the same way you'd store spreadsheets
in BigQuery. Nothing more mysterious than that.

---

## 4. What we actually built

### The map itself

The graph currently holds **579 nodes and 1,040 connections**. Nine kinds of node:

| Node | In plain English | Example |
|---|---|---|
| **Domain** | A business area | Sales |
| **Report** | Something a person can ask for | "Take Rate by Territory" |
| **Table** | A real table in the database | `fact_sug_monthly_rollup` |
| **Column** | A real column in that table | `take_rate_pct` |
| **Metric** | What a *person* calls a number | "Take Rate %" |
| **Dimension** | A way to slice a number | by territory, by city |
| **Entity** | An actual value in the data | "Dallas", "EMP-007" |
| **Term** | A fuzzy word covering several metrics | "churn" |
| **Component** | A chart type the app can draw | Bar chart |

**The single most important idea in the whole system** is that *Metric* and *Column* are
**separate things with a connection between them**.

- `Take Rate %` is what people say
- `take_rate_pct` is what the database has
- An edge called `MEASURED_BY` joins them

That one connection is what lets the system translate in both directions — and it's why
Problem 3 above stops happening.

### Where the map comes from

Three sources, and the difference between them matters:

1. **The database itself.** We ask BigQuery "what tables and columns do you actually
   have?" This is **fact**. We never guess it.

2. **A hand-written dictionary** (`glossary.data.json`). A human wrote that "churn",
   "attrition" and "drop-off" all mean Return Rate %. **28 metrics, 120 synonyms.**
   This is the one part a person maintains, and its quality sets the ceiling on
   everything else.

3. **The existing app config** — which reports exist and what they're called.

Then a program stitches them into the map. Takes about a minute. Runs automatically at
startup and once a day.

**One rule that matters more than it looks:** if the human dictionary doesn't confirm
that a metric maps to a specific column, the system **refuses to invent one**. It writes
the guess into a review file for a person to check instead.

Why so strict? A *wrong* mapping is worse than a *missing* one, because a wrong one
looks confident. A missing one just doesn't answer.

---

## 5. One question, start to finish

Take **"how did Dallas do on units sold"**.

### Step 1 — Find the starting points (~30ms)

Search the map for anything matching the words. Two hits:

```
"units sold"  →  Metric: Units Sold
"Dallas"      →  Entity: Dallas   ← an actual value in the data
```

That second one is the interesting bit. The system knows "Dallas" is a real city sitting
in a column called `city`, because when it built the map it read the actual values out of
the database.

### Step 2 — Walk outwards (~100ms)

From those two starting points, follow connections up to **two steps** out. Collects
about 105 related nodes: the columns involved, the tables holding them, the reports that
use them.

Why only two steps? Because everything relevant is within two, and going further starts
dragging in unrelated things. It's a deliberate limit.

### Step 3 — Decide which table wins (~5ms)

Several tables got touched. Each gets a score based on how strongly it connects back to
the starting points.

```
v_daily_sales_detail   0.29   ← winner
fact_intraday_sales    0.25
```

There's one subtlety worth knowing, because getting it wrong caused a real bug. The
first version simply **added up** every connection. That quietly favoured *big* tables —
a table with six metrics attached would beat the correct answer just by having more
things pointing at it. The fix was to count the strongest connection fully and each
extra one for less. Accuracy went from 91% to 100%.

### Step 4 — Write a short briefing (~1ms)

Turn the winning tables into a small note for the AI:

```
RELEVANT DATA:
[Sales] "Daily Sales Detail" → table: v_daily_sales_detail
  metrics: Units Sold → units_sold, Revenue → revenue
  dimensions: city, outlet_name, territory_name
RULES: use ONLY the table and column names above, exactly as written.
```

**About 250 words instead of 1,300** — and every column name in it is real, so there's
nothing for the AI to invent.

### Step 5 — Overrule the AI if it's wrong (~0ms)

The AI reads the briefing and picks a table. Sometimes it still picks wrong — we watched
it happen.

If the map is confident enough, **it overrides the AI's choice.** Without this, the
briefing would describe one table while the query hit a different one — the worst of both
worlds, since now the instructions and the data disagree.

### Step 6 — Filter to Dallas (~50ms)

The map knows "Dallas" lives in the `city` column, so the database query becomes:

```sql
... WHERE city = @f0        (with "Dallas" supplied safely and separately)
```

Before KAG, this question returned **every row** and hoped the AI would notice the Dallas
part. Now the database does the filtering.

The value is passed **separately** from the query text, never glued into it. That's a
standard safety practice — it makes it impossible for a value to be mistaken for a
command.

### Step 7 — Check the AI's homework (~10ms)

The AI writes the chart definitions. Before rendering, every column name it used is
checked against the map:

- Right → leave it
- Recognisably wrong → **fix it** (`"Take Rate %"` → `take_rate_pct`)
- Unrecognisable → flag it

That middle case is Problem 3 from the top of this document, now solved.

**Total added time: about 200 milliseconds.** The AI call that follows takes several
seconds, so it's a rounding error.

---

## 6. What measurably changed

| | Before | After |
|---|---|---|
| Prompt description | ~1,300 words, every question | ~250 words |
| "churn by territory" | wrong table | correct table |
| "average handle time by agent" | wrong table | correct table |
| "how did Dallas do" | all rows, unfiltered | Dallas rows only |
| "break down by platform" | "no such column" | correct table |
| `"Take Rate %"` as a column | empty chart | auto-corrected |
| Routing test suite | — | **25 out of 25** |

---

## 7. What it deliberately does NOT do

Worth knowing, because these look like bugs and aren't.

**It refuses to answer vague questions.** Ask "hello there" and it routes nowhere on
purpose — so the app asks a clarifying question instead of guessing. *Declining to
answer is a feature here.*

**It never invents a data mapping.** If nobody has confirmed that a metric matches a
column, it stays unmapped rather than being pointed at something that looks close.

**It's currently switched off.** `KAG_ENABLED=false`. Right now it watches every
question and records what it *would* have done, without changing anything. That's a
deliberate safety stage — you build confidence from real traffic before letting it act.

**If the graph database goes down, nothing breaks.** The app falls back to the old
behaviour. This isn't theoretical — the database genuinely crashed mid-testing and the
app carried on answering.

---

## 8. Things it found that nobody knew

An unplanned benefit. Building a map of the data forces you to check the data actually
exists — and several things didn't:

- **Two tables the app thought it had didn't exist.** Two of eight advertised reports
  pointed at nothing. Both now created.
- **Two metrics had no data behind them.** "Outage Count" and "Latency" were offered to
  users; no such column exists anywhere. Removed rather than left advertised.
- **A real churn table exists and nobody exposed it.** All this time "churn" has used
  return rate as a stand-in, while a proper churn table with 24 months of data sat
  unused. (Still unresolved — it lacks a territory breakdown, so it isn't a simple swap.)
- **13 more tables exist that the app can't reach**, including one that would allow
  "revenue by Apple vs Samsung".

---

## 9. The honest limits

**It's small-scale so far.** 7 usable tables, 25 test questions. Not a month of real
traffic. The numbers above are real but they're early.

**One metric is made up.** A "performance score" used in one report didn't exist in the
source data, so it was invented for the demo. It needs a business owner to approve or
replace it.

**One abbreviation is a guess.** "RIS" appears throughout the data and is never defined
anywhere. The dictionary guesses "retention index score". Routing works either way, but
the expansion is unverified.

**The dictionary is hand-written.** 28 metrics, 120 synonyms, all typed by a person. It
needs an owner. If it goes stale, so does everything built on it.

---

## 10. If you remember five things

1. **KAG picks which table answers a question.** That's its whole job.
2. **It works by storing how things connect**, not just what exists — so "churn" can find
   its way to a table nobody named "churn".
3. **The key idea is separating what people say from what the database has**, with a
   confirmed link between them.
4. **It shrank the AI's reading material by about 80%** and fixed several questions that
   used to route to the wrong data.
5. **It never invents.** No confirmed mapping means no mapping — and if it breaks, the
   app falls back to how it worked before.

---

*Next, in increasing depth:*
*[KAG_EXPLAINED.md](KAG_EXPLAINED.md) — the full walkthrough with the algorithms ·*
*[KAG_ARCHITECTURE.md](KAG_ARCHITECTURE.md) — module structure, for changing the code ·*
*[DATA_AND_DOMAINS.md](DATA_AND_DOMAINS.md) — what's in the dataset*
