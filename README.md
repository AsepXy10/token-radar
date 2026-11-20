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

## The model (`lib/model.ts`, radar-3)

`implied = TVL × multiple(category) × growthMult × maturityMult × chainMult`

- **multiple(category)** — calibrated at run time from the live cohort: for every protocol whose token already trades and has `mcap_usd` + `tvl_usd`, the median `mcap/TVL` ratio per category (global median 0.2138), winsorized at the 90th percentile and shrunk to the global median. No hardcoded protocol names.
- **growthMult** — `1 + clamp(change_7d, -50, +100)/100 × 0.6`.
- **maturityMult** — `0.70 + 0.30 × min(1, ln(1+age)/ln(1+1460))`, a log scale over a 4-year horizon; protocols with no `listed_at` take the pre-token cohort's median age.
- **chainMult** — `0.90 + 0.20 × min(1, ln(1+chains)/ln(1+10))`: a protocol on one chain scores 0.90, on ten or more 1.10 — deliberately small so breadth never outranks TVL or the category multiple. 56% of pre-token protocols run on one chain, so multi-chain protocols separate from single-chain ones at similar TVL.
- **Farm plans** — 9 steps per row, varied by category, chains, and TVL tier, each with capital, gas cost, and time — including a risk check driven by the protocol's own 7-day change and a second category-specific action.

Top of the board: Steakhouse Financial $613.2M, Gauntlet $368.0M, Veda $337.4M, USDD $202.0M, Upshift $119.6M. Implied values are the model's estimate, never a promise that a token will launch.

## Verification (2026-11-20)

The kit's `check` passes 14/14 (transcripts account for 49.0% of counted lines; board 200 rows, watchlist 40/40, ranks 1..200, implied values non-increasing, farm steps 3–12 per row, dashboard source 44,050 bytes under the 65,536 dossier text cap, dossier byte-identical to `buildDossier`). Two runs to different directories produce byte-identical output. Screenshots: 3 fresh renders of the finished dashboard (board, detail, filtered), 1440×1400 each, 300–350 KB.

## Layout

- `main.ts` — the entrypoint: read snapshot, score, write board, data, dashboard, screenshots, dossier.
- `lib/model.ts` — the calibrated value model, board builder, and farm-plan generator.
- `vendor/makefun-board.ts` — the make.fun dossier library.
- `dashboard/` — `index.html`, `app.css`, `app.js` (dark radar theme, no network).
- `screenshots/` — `1-board.jpg`, `2-detail.png`, `3-filtered.jpg`.
- `LICENSE` (MIT).
