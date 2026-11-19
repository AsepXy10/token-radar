# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/AsepXy10/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/AsepXy10/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: ranks 200 pre-token protocols by a calibrated implied value, with a concrete farm plan for each and a sortable, filterable dashboard — built for [make.fun's "Build the best token launch radar" bounty](https://make.fun/bounty/token-radar-01).

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input path/to/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

## What it does

`main.ts` (Node 22, standard library only) reads the sealed DefiLlama snapshot (`/input/snapshot.json` in the grader), scores every pre-token protocol, and writes:

- `board.json` — 200 ranked rows: all 40 watchlist protocols plus 160 early pre-token protocols below the $50M floor, picked by model score.
- `data.js` + `dashboard/` — the dashboard's data and page (sortable board, text/category/chain/token-status filters, detail view per protocol with model breakdown and farm plan).
- `screenshots/` — three renders: the board, a protocol detail view, and a filtered view.
- `dossier.json` — built with the vendored `buildDossier`, byte-identical to what the gate rebuilds.

The run is deterministic: the same snapshot bytes always produce the same output bytes.

## The model (`lib/model.ts`, radar-2)

`implied = TVL × multiple(category) × growthMult × maturityMult`

- **multiple(category)** — calibrated at run time from the live cohort: for every protocol whose token already trades and has `mcap_usd` + `tvl_usd`, the median `mcap/TVL` ratio per category (global median 0.2138), winsorized at the 90th percentile and shrunk to the global median. No hardcoded protocol names.
- **growthMult** — `1 + clamp(change_7d, -50, +100)/100 × 0.6`.
- **maturityMult** — `0.70 + 0.30 × min(1, ln(1+age)/ln(1+1460))`, a log scale over a 4-year horizon; protocols with no `listed_at` take the pre-token cohort's median age.
- **Farm plans** — 7 steps per row, varied by category, chains, and TVL tier, each with capital, gas cost, and time.

Top of the board: Steakhouse Financial $557.4M, Gauntlet $334.6M, Veda $306.7M, USDD $198.9M, Upshift $108.7M. Implied values are the model's estimate, never a promise that a token will launch.

## Verification (2026-11-19)

All seven gate checks pass against a local run: dashboard files, board file (200 rows), sorted by value, watchlist coverage 40/40, farm steps, screenshots (3 × 1440×900 PNG), dossier matches. Two runs to different directories produce byte-identical output. Dashboard source is 37,009 bytes (dossier text cap 65,536).

## Layout

- `main.ts` — the entrypoint: read snapshot, score, write board, data, dashboard, screenshots, dossier.
- `lib/model.ts` — the calibrated value model, board builder, and farm-plan generator.
- `vendor/makefun-board.ts` — the make.fun dossier library.
- `dashboard/` — `index.html`, `app.css`, `app.js` (dark radar theme, no network).
- `screenshots/` — `1-board.png`, `2-detail.png`, `3-filtered.png`.
- `LICENSE` (MIT).
