# The data, in plain English

What is actually in `data-practice-472314.report_hub_demo`, what the business terms mean,
and which parts the app can and cannot answer questions about.

Every number, value list and date range below was read from the live dataset, not
recalled. Where a definition comes from the dataset's own metadata I say so; where I am
inferring, I say that too.

---

## 1. What business is this?

**A mobile phone retailer.** They sell phones, tablets and wearables through physical
stores, across the United States.

Four things are being measured, which map neatly onto the four domains:

1. **Sales** — how much they sold, where, and how well
2. **Network** — the quality of the mobile network at physical sites
3. **Contact Center** — how well the phone-support agents perform
4. **Customer Experience** — whether customers stay or leave

The organisation is arranged geographically:

```
Market (5)          →  Territory (20)        →  Outlet (50)
"Texas", "West"        "Dallas-Fort Worth"      an actual store
```

So "revenue by territory" means revenue grouped by one of those 20 regions, and each
territory contains a handful of the 50 physical stores.

---

## 2. The vocabulary

The dataset uses several abbreviations. These come from the dataset's **own** metadata
table (`catalog_reports`), so they are authoritative rather than my interpretation:

| Term | What it means | Source |
|---|---|---|
| **SU&G** (written `sug` in columns) | The core product programme these sales belong to — "SU&G Performance Dashboard" is the flagship Sales report | dataset metadata |
| **AARD** | "all-accessory return-and-damage rate" — the rate at which accessories come back returned or broken | dataset metadata |
| **Take Rate** | What share of eligible customers actually bought. High = good | standard retail usage |
| **Run Rate** | Revenue annualised — "at this pace, we'd make X per year" | standard usage |
| **AHT** | Average Handle Time — how many seconds an agent spends on a call. Low = efficient | dataset metadata |
| **Box Close** | The share of calls that ended in a sale. High = good | dataset metadata |
| **CQI / RSRP / SINR** | Mobile network quality measurements (see §4.2) | dataset metadata |
| **CSAT / NPS** | Standard customer satisfaction and recommendation scores | standard usage |

**One I am not certain about: `RIS`.** The dataset lists it under "Customer Experience
Metrics… including RIS, NPS, and satisfaction scores", so it is clearly a
customer-experience index — but the dataset never expands the acronym. The KAG glossary
currently guesses at "retention index score" / "revenue impact score". **Those guesses
are mine and should be confirmed by whoever owns the data.** The alias still works for
routing (queries about retention find it), but the expansion is unverified.

---

## 3. Reading a number: is high good or bad?

Easy to get backwards, so worth stating plainly. Real ranges from the data:

| Metric | Range in the data | Direction |
|---|---|---|
| Take Rate % | 49.8 – 79.4 | **Higher is better** — more customers bought |
| SUG Revenue | $681k – $1.05m per territory-month | **Higher is better** |
| Run Rate | $8.6m – $12.9m | **Higher is better** |
| Return Rate % | 2.5 – 5.7 | **Lower is better** — fewer goods came back |
| AARD % | 19.0 – 34.2 | **Lower is better** — fewer accessory returns/damage |
| RIS % | 81.3 – 94.5 | **Higher is better** |
| Box Close % | 75.2 – 100 | **Higher is better** — more calls became sales |
| AHT (sec) | 215 – 369 | **Lower is usually better** — faster calls |
| Transfer % | 2.2 – 16.6 | **Lower is better** — fewer handoffs |
| CSAT score | 7.1 – 9.6 | **Higher is better** |
| Churn Rate | 3.9 – 6.3 | **Lower is better** — fewer customers left |

---

## 4. The domains, one at a time

### 4.1 Sales — "how much did we sell?"

The busiest domain. Four tables, all about revenue and units.

**`fact_sug_monthly_rollup`** — 120 rows, the workhorse.
One row per **territory per month**: 20 territories × 6 months (Nov 2024 – Apr 2025).
Holds revenue, run rate, take rate, and the three quality rates (return, AARD, RIS).

This is the table most questions land on, because it carries the widest spread of
headline metrics — which is also why it needed special handling in scoring (it kept
winning questions that belonged elsewhere, purely by having more metrics attached).

**`v_daily_sales_detail`** — 450 rows, a view.
One row per **outlet per day** (30 Jan – 29 Apr 2025). Units sold, revenue, returns,
plus store attributes: city, state, outlet type. This is where a question like
*"how did Dallas do"* lands, because `city` lives here.

**`v_monthly_territory_performance`** — 120 rows, a view.
Territory league table by month: a composite `performance_score` and a `territory_rank`.

> ⚠️ **`performance_score` is not an official company metric.** It did not exist; the
> view computes it as take rate 35% ↑, RIS 25% ↑, return rate 25% ↓, AARD 15% ↓,
> min-max normalised across the table. The formula is written out in full in the view's
> SQL so it can be reviewed and changed. Treat it as demo-grade until someone who owns
> the metric signs it off.

**`fact_intraday_sales`** — 360 rows.
Hourly sales by outlet **and device group** (Phone / Tablet / Wearable). This is the only
routable table that can answer *"break down by platform"*.

### 4.2 Network — "is the mobile network healthy?"

**`fact_network_kpi_points`** — 75 rows, one per cell site, with lat/long.

Three engineering measurements, which is where the jargon lives:

- **RSRP** (−119 to −80): raw signal strength in dBm. **Closer to zero is stronger**, so
  −80 is good and −119 is poor. Note this is a negative scale — "higher" means less
  negative.
- **SINR** (−3.9 to 18.7): signal clarity versus noise. Higher is better; negative means
  the noise is louder than the signal.
- **CQI** (3 to 15): the network's own 1–15 quality grade. Higher is better.

Each site also has a rolled-up `score` (21.5 – 88) and a traffic light: `good`,
`warning`, `critical`. Sites are grouped into the same 5 regions as markets: Atlantic,
Central, Florida, Texas, West.

**`fact_dynamic_scores`** — 30 rows. A ranked leaderboard (1–30) with an
`overall_score` (56.5 – 70.7) and five unlabelled component metrics (`metric_1` …
`metric_5`). It is keyed by `employee_id`, so despite sitting in the Network domain it is
really about people.

### 4.3 Contact Center — "how are the phone agents doing?"

**`fact_contact_center_metrics`** — 30 rows, one per agent.

Four teams: **Inbound Sales**, **New Accounts**, **Retention**, **Tech Support**.
Each agent has Box Close %, AHT, Transfer %, Sales Time %, calls handled, CSAT, and a
`good` / `warning` / `critical` status.

Small but the most self-explanatory table in the dataset — one row per person, all
columns plainly named.

### 4.4 Customer Experience — "are customers leaving?"

This domain has the dataset's most awkward truth.

The routable reports (*Customer Retention Analysis*, *Churn & Retention Metrics*) point
at `fact_sug_monthly_rollup` and use **`return_rate_pct` as a stand-in for churn**.

But **a real churn table exists** — `churn_monthly`, 24 rows covering Apr 2024 – Sep
2025, with genuine `churn_rate`, `voluntary_churn_pct`, `involuntary_churn_pct`,
`subscribers_lost` (7,658 – 13,578) and `total_base` (~1.85m – 2.1m subscribers).

**It is not exposed to the app.** So when you ask "churn by territory" you get the
return-rate proxy, not real churn.

The reason it has not simply been swapped in: `churn_monthly` has **no territory
column**. It is company-wide by month. So:

- *"churn by territory"* → genuinely needs the proxy on `fact_sug_monthly_rollup`
- *"churn rate trend"* or *"voluntary vs involuntary churn"* → would be far better
  served by `churn_monthly`

Exposing it means two churn sources at different grains, and a glossary that
disambiguates rather than blanket-aliasing "churn" to Return Rate %. That is an open
decision, not an oversight.

---

## 5. Things you can filter by

Real values, straight from the data. These are the words that will actually match if you
name them in a question.

**20 territories:** Austin · Dallas-Fort Worth · Great Lakes · Great Plains · Houston
Metro · Jacksonville · Mid-Atlantic · Midwest Central · Mountain West · New England ·
Northeast Metro · Ohio Valley · Orlando Metro · Pacific Northwest · San Antonio · South
Florida · Southeast Urban · Southwest Regional · Tampa Bay · West Coast Premium

**5 markets:** Atlantic · Central · Florida · Texas · West

**25 cities:** Atlanta · Austin · Baltimore · Boston · Brooklyn · Charlotte · Chicago ·
Cincinnati · Clearwater · Cleveland · Columbus · Dallas · Denver · Detroit · Fort
Lauderdale · Fort Worth · Houston · Jacksonville · Kansas City · Kissimmee · Las Vegas ·
Los Angeles · Miami · Minneapolis · Naperville  *(22 states)*

**3 store types:** Corporate Store · Express Kiosk · Flagship Store

**3 device groups:** Phone · Tablet · Wearable
**5 manufacturers:** Apple · Google · Motorola · OnePlus · Samsung
*(manufacturer lives in `dim_devices`, which is **not** exposed — so you cannot currently
ask "revenue by Apple")*

**4 agent teams:** Inbound Sales · New Accounts · Retention · Tech Support

**3 statuses**, used by both network sites and agents: good · warning · critical

---

## 6. Time coverage — mind the gaps

Different tables cover different periods. This trips people up.

| Table | Grain | Covers |
|---|---|---|
| `fact_sug_monthly_rollup` | month × territory | **Nov 2024 – Apr 2025** (6 months) |
| `v_monthly_territory_performance` | month × territory | same 6 months |
| `fact_sug_sales_daily` | day × outlet × device | **30 Jan – 29 Apr 2025** (3 months) |
| `v_daily_sales_detail` | day × outlet | same 3 months |
| `fact_intraday_sales` | hour × outlet × device group | same window |
| `churn_monthly` | month, company-wide | **Apr 2024 – Sep 2025** (24 months) |
| Contact centre / network / scores | **no time column at all** | a single snapshot |

Two consequences worth knowing:

- **"Compare this year to last year" cannot be answered** from the sales tables — there
  is only one 6-month window.
- **Contact centre and network data are point-in-time.** Asking for a trend on AHT or
  signal strength will not work; there is no history to trend.

---

## 7. The two catalogs — an important gotcha

The dataset contains a table called `catalog_reports` describing **15 reports across 7
domains** — Sales, Network, Operations, Finance, Strategy, People & Culture, Customer
Experience. It reads like a full enterprise BI portfolio: *Financial P&L Summary*,
*Employee Engagement Index*, *Revenue Forecasting Model*, *Device Inventory & Aging*.

**Almost none of those are backed by queryable data.** There is no finance table, no HR
table, no inventory table. `catalog_reports` is *metadata describing an aspirational
report set* — useful for demonstrating a data-catalog UI, but it is not what the
conversational app can answer.

What the app can actually serve is `backend/src/services/dataSourceMap.ts` — **8 report
entries across 4 domains**, backed by 7 real tables.

So there are two different meanings of "report" in this project:

| | `catalog_reports` (in BigQuery) | `DATA_SOURCES` (in code) |
|---|---|---|
| Count | 15 reports, 7 domains | 8 entries, 4 domains |
| Backed by data? | mostly **no** | yes, always verified |
| Used for | catalog/governance screens | actually answering questions |

If someone asks the chat "show me the P&L", the honest answer is that no such data
exists — even though the catalog screen lists it.

---

## 8. Known holes

Found while building the knowledge graph. All verified, none guessed.

**Two KPIs with no data.** `Outage Count` and `Latency` were listed as Network KPIs, but
`fact_network_kpi_points` has only cqi / rsrp / sinr / score / status / region. Neither
is latency. They have been removed from the catalog rather than left advertised, because
a KPI the model is told it can use, with no column behind it, invites it to invent one.

**Two tables were declared but did not exist.** `v_monthly_territory_performance` and
`v_daily_sales_detail` were listed as routable but had never been created in BigQuery.
They now exist, built by `npm run bq:views`.

**13 tables exist but cannot be queried by the app.** They are indexed in the graph, so
the system knows they exist, but no report exposes them:

| Table | What it would unlock |
|---|---|
| `dim_outlets` | breakdowns by city, state, store type |
| `dim_devices` | breakdowns by manufacturer (Apple, Samsung…) |
| `churn_monthly` | real churn instead of the return-rate proxy |
| `fact_sug_sales_daily` | device-level daily detail |
| `dim_territories`, `dim_markets` | the geography hierarchy |
| `market_segment_distribution`, `performance_by_region`, `revenue_by_device_group`, `segment_performance_trend`, `take_rate_monthly_trend` | small pre-aggregated summaries (3–6 rows each) |
| `catalog_reports`, `catalog_datasets` | the catalog metadata itself |

Each build prints this list with the breakdowns each table would add.

**`_temp` duplicates.** Six tables have `_temp` twins holding the same or duplicated
rows (`catalog_reports_temp` has 30 rows vs 15). They look like staging leftovers and are
excluded from the graph.

**Small volumes.** This is demo data: 30 agents, 75 network sites, 120 territory-months.
Fine for demonstrating behaviour, not for judging query performance at scale.

---

## 9. Quick reference

| Table | Rows | Grain | Domain |
|---|---|---|---|
| `fact_sug_monthly_rollup` | 120 | month × territory | Sales / Network / CX |
| `v_daily_sales_detail` | 450 | day × outlet | Sales |
| `v_monthly_territory_performance` | 120 | month × territory | Sales |
| `fact_intraday_sales` | 360 | hour × outlet × device group | Sales |
| `fact_contact_center_metrics` | 30 | agent | Contact Center |
| `fact_network_kpi_points` | 75 | cell site | Network |
| `fact_dynamic_scores` | 30 | employee | Network |
| *not exposed* | | | |
| `fact_sug_sales_daily` | 450 | day × outlet × device | — |
| `churn_monthly` | 24 | month (company-wide) | — |
| `dim_outlets` | 50 | outlet | — |
| `dim_territories` | 20 | territory | — |
| `dim_devices` | 20 | device | — |
| `dim_markets` | 5 | market | — |
| `catalog_reports` | 15 | report metadata | — |
| `catalog_datasets` | 10 | dataset metadata | — |
| 5 small summaries | 3–6 each | pre-aggregated | — |

**Questions that work well today:** take rate or revenue by territory · churn or return
rate by territory · agent handle time / box close rate · signal strength by site · daily
sales by outlet · breakdowns by device group · anything filtered to a named city,
territory, agent or store.

**Questions that will not work:** year-on-year comparisons (no history) · trends in
contact-centre or network metrics (no time column) · anything by manufacturer, or
finance, HR or inventory (data not exposed, or absent entirely).

---

*Related: [KAG_EXPLAINED.md](KAG_EXPLAINED.md) for how the system turns a question into
one of these tables.*
