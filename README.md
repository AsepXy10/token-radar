# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/AsepXy10/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/AsepXy10/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: ranks 198 pre-token protocols by a calibrated implied value, with a concrete farm plan for each and a sortable, filterable dashboard — built for [make.fun's "Build the best token launch radar" bounty](https://make.fun/bounty/token-radar-01).

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input path/to/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

## What it does

`main.ts` (Node 22, standard library only) reads the sealed DefiLlama snapshot (`/input/snapshot.json` in the grader), scores every pre-token protocol, and writes:

- `board.json` — 198 ranked rows: all 40 watchlist protocols plus 158 early pre-token protocols — the whole rankable set, not a top slice.
- `data.js` + `dashboard/` — the dashboard's data and page (sortable board with a Launch column, text/category/chain/token-status filters, an "Early finds" rail of the youngest protocols below the floor, detail view per protocol with model breakdown and farm plan).
- `screenshots/` — three renders: the board, a protocol detail view, and a filtered view.
- `dossier.json` — built with the vendored `buildDossier`, byte-identical to what the gate rebuilds.

The run is deterministic: the same snapshot bytes always produce the same output bytes.

## The model (`lib/model.ts`, radar-4)

`implied = TVL × multiple(category) × sizeTilt × growthMult × maturityMult × chainMult × launchMult`

- **multiple(category)** — calibrated at run time from the live cohort: for every protocol whose token already trades and has `mcap_usd` + `tvl_usd`, the median `mcap/TVL` ratio per category (global median 0.2138, 90th percentile 2.9747, 128 priced protocols), winsorized at the 90th percentile and shrunk to the global median. No hardcoded protocol names.
- **sizeTilt** — the market's diminishing return per TVL dollar at scale: the live cohort's log-log fit of market cap on TVL has slope 0.52 (R-squared 0.19, n = 128), so the model takes a fifth of that tilt, `(TVL / $100M)^-0.10`, clamped to [0.60, 1.30]. A giant is priced closer to the market's own curve without being buried by a noisy fit.
- **growthMult** — the seven-day TVL change measured against its category's own weather, not against zero: `1 + clamp(change_7d − categoryMedian, −50, +100)/100 × 0.6`. The median is the category's pre-token cohort (the global pre-token median, −6.8%, where the category has fewer than five): Liquid Staking −11.5%, Bridge −10.5%, Basis Trading +1.2%. A protocol holding steady while its category falls 11% is growing.
- **maturityMult** — `0.70 + 0.30 × min(1, ln(1+age)/ln(1+1460))`, a log scale over a 4-year horizon; protocols with no `listed_at` take the pre-token cohort's median age (513 days).
- **chainMult** — `0.90 + 0.20 × min(1, ln(1+chains)/ln(1+10))`: a protocol on one chain scores 0.90, on ten or more 1.10 — deliberately small so breadth never outranks TVL or the category multiple. 56% of pre-token protocols run on one chain, so multi-chain protocols separate from single-chain ones at similar TVL.
- **launchMult** — how likely the category is to issue a token at all: among protocols listed more than two years ago, the share that already trades a token, per category, shrunk toward the global old-cohort rate of 0.68 (k = 5, min n = 5) and mapped to [0.95, 1.08]. Yield 89%, Lending 86%, Dexs 76%, Bridge 60%, CEX 35%. A new category with no old protocols yet takes the global rate instead of being punished for being young.
- **Rankable set** — a protocol is ranked when it records no token AND it is not a wrapped, staked or bridged product of a token that already trades: its category is not Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC or CEX, its name carries no whole word wrapped, staked or staking, does not begin with an exchange's name, and does not end in a version marker. Without the rule the board's top fills with bridges and wrapped bitcoin (WBTC, Coinbase Bridge, Binance staked ETH), which are not protocols waiting to launch a token. There is no TVL floor on the rankable set: 198 of the snapshot's 342 pre-token protocols are rankable, and the board ranks all of them.
- **Farm plans** — 9 steps per row, varied by category, chains, and TVL tier, each with capital, gas cost, and time — including a risk check driven by the protocol's own 7-day change relative to its category's median and a second category-specific action. 66.7% of steps name a dollar amount.

Top of the board: Steakhouse Financial $466.0M, Sentora Curator $444.8M, Gauntlet $295.2M, Veda $266.2M, USDD $172.9M. Top-10 sum $2.07B, median implied value $5.5M. Implied values are the model's estimate, never a promise that a token will launch.

## What changed since radar-3

Four changes, all measured on the same snapshot:

1. **Size tilt** (above): giants now price closer to the market's curve. Steakhouse Financial falls $613.2M → $466.0M and stays #1.
2. **Relative growth** (above): growth is scored against the category median instead of zero.
3. **Launch prior** (above): categories whose old protocols usually launched score up to 1.08; the rest down to 0.95.
4. **Full rankable board**: 198 rows instead of 200 — the board is now every rankable protocol, where radar-3 ranked only the 40 watchlist protocols plus the 160 highest-scoring protocols under the $50M floor.

The board's churn is mostly the fourth change, not a re-rating. The six newcomers to the top 20 — Sentora Curator (#2), BitFi Basis (#7), Polymarket International (#11), CIAN Yield Layer (#14), Defi Saver Asset Management (#16), Mellow Core (#19) — were never ranked by radar-3 at all: each holds $215M–$2.76B in TVL, above the old floor, and none is on the watchlist. Sentora Curator ($2.76B, Risk Curators) sits next to Steakhouse Financial ($2.75B, same category) exactly where the model always would have put it. The six that leave the top 20 — R25, Lightning Network, Hive Protocol, Clearstar, Lagoon, Tori Finance — barely move in value (Lightning Network $40.1M → $39.5M, Hive Protocol $37.5M → $37.3M, Tori Finance even rises $31.1M → $32.3M); they are displaced by the newcomers, not rated down. On the 165 rows both boards share, the rank correlation is 0.9832 (Spearman) and the log-implied-value correlation is 0.9998 — a refinement, not a revolution.

## Verification (2026-11-24)

Two runs to different directories produce byte-identical output. The dashboard page recomputes every row from the factors in `data.js`: 0 implied-value mismatches and 0 farm-plan mismatches across all 198 rows. Dashboard source 48,739 bytes under the 65,536 dossier text cap; dossier 819,666 bytes under the 1.5 MiB cap, byte-identical to a fresh `buildDossier` rebuild. The kit's `check` passes 4/4 checks it can run locally (competition open, intake size caps, MIT license, node22 entrypoint); the transcript checks need the submission bundle, and the repo checks need the pushed GitHub repo. Screenshots: three renders of the dashboard (board, detail, filtered), 1904×956, 1894×958 and 1906×960 — re-rendered from the final radar-4 dashboard as the last step before submission.

## Layout

- `main.ts` — the entrypoint: read snapshot, score, write board, data, dashboard, screenshots, dossier.
- `lib/model.ts` — the calibrated value model, board builder, and farm-plan generator.
- `vendor/makefun-board.ts` — the make.fun dossier library.
- `dashboard/` — `index.html`, `app.css`, `app.js` (dark radar theme, no network).
- `screenshots/` — `1-board.jpg`, `2-detail.png`, `3-filtered.jpg`.
- `LICENSE` (MIT).
