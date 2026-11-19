// Token Radar's value model: one sealed snapshot of the protocol universe in, one ranked board out.
//
// The board ranks pre-token protocols — protocols whose DefiLlama record carries no token (no market
// cap, no CoinGecko id, no symbol) — by the implied value of the token they might one day issue. The
// live-token protocols are kept apart and shown with the market's own values, never mixed into the
// ranking. No protocol name is ever special-cased: one function scores every row, and every number in
// it is either read from the snapshot or computed from the snapshot at run time.
//
// The implied value is the product of three factors, each from the snapshot's own figures:
//
//   implied = tvl_usd x multiple(category) x growthMult x maturityMult
//
//   multiple(category) — calibrated on the live cohort. For every protocol whose token already trades
//     and whose record carries both a market cap and a TVL, take mcap_usd / tvl_usd: what the market
//     already pays per dollar of TVL. The global median of those ratios is the base multiple. A
//     category's multiple is the median of its own live ratios, winsorized at the 90th percentile of
//     all ratios (one token with a tiny TVL and a huge market cap must not set a category's price),
//     shrunk toward the global median with six pseudo-observations, and only used when at least three
//     live protocols of that category report both figures; otherwise the category takes the global
//     median. On this snapshot the global median is about 0.20 and the category multiples land
//     between about 0.08 and 0.61.
//
//   growthMult — the seven-day TVL change, clamped to [-50, +100] per cent so one viral week cannot
//     set a protocol's price, weighted 0.6:
//       growthMult = 1 + clamp(change_7d, -50, 100) / 100 x 0.6
//     A protocol with no reported change is scored at zero growth.
//
//   maturityMult — how long the protocol has run with no token, on a log scale over a four-year
//     horizon, from 0.70 for a brand-new listing to 1.00 for a four-year record:
//       maturityMult = 0.70 + 0.30 x min(1, ln(1 + age_days) / ln(1 + 1460))
//     Age is the days from listed_at to the snapshot's as_of date. A protocol with no listed_at is
//     scored at the median age of the pre-token cohort, computed from the snapshot at run time
//     (513 days on this snapshot), never at a hardcoded guess.
//
// The early radar — the pre-token protocols below the watchlist floor — is chosen by this same score,
// not by raw TVL: the 160 highest-scoring rankable protocols under the floor. A protocol is rankable
// when it records no token, is not a CEX, and its name does not end in a version marker.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants: the shape of the formula, fixed; the calibration is computed per snapshot. */
export interface ModelConstants {
  /** Pseudo-observations of the global median mixed into a category's multiple. */
  shrinkage_k: number;
  /** Live protocols of a category needed before its own median is used. */
  min_live_n: number;
  /** A live ratio above this percentile is winsorized to it before any median is taken. */
  winsorize_pct: number;
  /** Weight of the seven-day growth in the growth multiplier. */
  growth_weight: number;
  /** Lower clamp of the seven-day change, in per cent. */
  growth_floor: number;
  /** Upper clamp of the seven-day change, in per cent. */
  growth_cap: number;
  /** Maturity multiplier of a protocol listed yesterday. */
  maturity_floor: number;
  /** Maturity multiplier's range up to a full four-year record. */
  maturity_range: number;
  /** The four-year horizon, in days, that maturity is measured against. */
  maturity_days: number;
}

export const MODEL: ModelConstants = {
  shrinkage_k: 6,
  min_live_n: 3,
  winsorize_pct: 90,
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.7,
  maturity_range: 0.3,
  maturity_days: 1460,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols below the watchlist floor the early radar carries, by model score. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** The calibration the snapshot's live cohort yields at run time. */
export interface Calibration {
  /** Median mcap/TVL over every live protocol reporting both figures. */
  global_median: number;
  /** The percentile every live ratio is winsorized to. */
  p90_ratio: number;
  /** The multiple each category is scored with, global median where the category has too few live rows. */
  multiples: Map<string, number>;
  /** Median age, in days, of the pre-token cohort; the fallback for a protocol with no listed_at. */
  median_pre_age: number;
  /** How many live protocols carried both a market cap and a TVL. */
  live_priced: number;
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  category_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  calibration: {
    global_median: number;
    p90_ratio: number;
    median_pre_age: number;
    live_priced: number;
    multiples: Record<string, number>;
  };
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a sorted array of numbers; the array must not be empty. */
function medianSorted(sorted: number[]): number {
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Calibrate the multiples from the snapshot's live cohort: the global median mcap/TVL, the 90th
 * percentile every ratio is winsorized to, and each category's shrunk median where at least
 * min_live_n live protocols of that category report both figures.
 */
export function calibrate(snapshot: Snapshot, model: ModelConstants = MODEL): Calibration {
  // A zero market cap is a missing record, not a price: only a positive market cap prices a ratio.
  const live = snapshot.protocols.filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const ratios = live.map((p) => p.mcap_usd! / p.tvl_usd).sort((a, b) => a - b);
  const globalMedian = ratios.length > 0 ? medianSorted(ratios) : 0.2;
  const p90 = ratios.length > 0 ? ratios[Math.min(ratios.length - 1, Math.floor((model.winsorize_pct / 100) * ratios.length))]! : globalMedian;
  const byCategory = new Map<string, number[]>();
  for (const p of live) {
    const r = Math.min(p.mcap_usd! / p.tvl_usd, p90);
    const key = p.category ?? 'Other';
    const list = byCategory.get(key);
    if (list) list.push(r);
    else byCategory.set(key, [r]);
  }
  const multiples = new Map<string, number>();
  for (const [cat, list] of byCategory) {
    list.sort((a, b) => a - b);
    if (list.length < model.min_live_n) continue;
    const catMedian = medianSorted(list);
    multiples.set(cat, (list.length * catMedian + model.shrinkage_k * globalMedian) / (list.length + model.shrinkage_k));
  }
  const preAges = snapshot.protocols
    .filter(isPreToken)
    .map((p) => ageDays(snapshot.as_of, p.listed_at))
    .filter((a): a is number => a !== null)
    .sort((a, b) => a - b);
  return {
    global_median: globalMedian,
    p90_ratio: p90,
    multiples,
    median_pre_age: preAges.length > 0 ? medianSorted(preAges) : 365,
    live_priced: live.length,
  };
}

/** The multiple one protocol is scored with: its category's calibrated multiple, else the global median. */
export function multipleFor(p: SnapshotProtocol, calibration: Calibration): number {
  return calibration.multiples.get(p.category ?? 'Other') ?? calibration.global_median;
}

/** The three multipliers and the implied value one protocol gets under the calibration. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  calibration: Calibration,
  model: ModelConstants,
): { implied: number; multiple: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? calibration.median_pre_age;
  const maturityMult =
    model.maturity_floor +
    model.maturity_range * Math.min(1, Math.log1p(Math.max(ageForModel, 0)) / Math.log1p(model.maturity_days));
  const multiple = multipleFor(protocol, calibration);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * multiple * growthMult * maturityMult));
  return { implied, multiple, growthPct, growthMult, maturityMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const calibration = calibrate(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but
  // the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by model score, capped. Never a
  // replacement for a watchlist row: a chosen protocol stays chosen. Ties break on slug, so the choice
  // is the same on every run.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .map((p) => ({ p, score: impliedValue(p, snapshot.as_of, calibration, model).implied }))
    .sort((a, b) => b.score - a.score || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const e of early) chosen.set(e.p.slug, e.p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, calibration, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      // Full precision, not rounded: the dashboard recomputes the row from this multiple and must
      // land on exactly the implied value board.json carries.
      category_multiple: s.multiple,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** Whether the protocol's first chain is a low-fee chain rather than Ethereum mainnet. */
function cheapChain(chain: string): boolean {
  return ['Solana', 'Base', 'Arbitrum', 'Optimism', 'Polygon', 'BSC', 'BNB Chain', 'Avalanche', 'Gnosis', 'Scroll', 'Linea', 'zkSync Era', 'Mode', 'Blast', 'Berachain'].includes(chain);
}

/** What one transaction costs on the protocol's chain, in the words a farmer budgets with. */
function gasFor(chain: string): string {
  if (chain === 'Solana') return 'about $0.01 of fees per transaction';
  if (chain === 'Ethereum') return 'about $3 to $8 of gas per transaction';
  if (cheapChain(chain)) return 'about $0.10 to $0.50 of gas per transaction';
  return 'about $1 of gas per transaction';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 500;
  if (p.tvl_usd >= 100_000_000) return 250;
  if (p.tvl_usd >= 25_000_000) return 150;
  return 100;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 60;
  if (age < 180) return 90;
  if (age < 365) return 60;
  return 45;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('uncollateralized')) {
    return `Supply $${capital} of USDC to ${name} on ${chain} and leave the deposit earning for the whole hold.`;
  }
  if (c.includes('dex') || c.includes('leveraged farm') || c.includes('liquidity manager')) {
    return `Provide $${capital} of liquidity to ${name}'s deepest pool on ${chain} and keep the position in range.`;
  }
  if (c.includes('yield aggregator') || c.includes('yield')) {
    return `Deposit $${capital} of USDC into ${name}'s highest-TVL vault on ${chain} and keep the vault shares.`;
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) {
    return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged trade, then close it the same week.`;
  }
  if (c.includes('bridge') || c.includes('cross chain')) {
    return `Bridge $${capital} of USDC into ${chain} through ${name}, then use the bridged funds inside its app once.`;
  }
  if (c.includes('staking') || c.includes('restak')) {
    return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token in the same wallet.`;
  }
  if (c.includes('rwa')) {
    return `Mint $${capital} of the protocol's yield-bearing asset on ${chain} and hold it for the whole hold.`;
  }
  if (c.includes('stable')) {
    return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold the receipt.`;
  }
  if (c.includes('prediction')) {
    return `Fund $${capital} on ${name} and take one small position in a market that settles within the month.`;
  }
  if (c.includes('risk curator') || c.includes('curator') || c.includes('allocator') || c.includes('capital allocator')) {
    return `Deposit $${capital} of USDC into a ${name} curated vault on ${chain} and keep the vault shares.`;
  }
  if (c.includes('insurance')) {
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active for the whole hold.`;
  }
  if (c.includes('basis trading')) {
    return `Deposit $${capital} of USDC into ${name}'s basis vault on ${chain} and keep the position open.`;
  }
  if (c.includes('payment') || c.includes('card')) {
    return `Move $${capital} through ${name} on ${chain} for one real payment, then keep the balance parked there.`;
  }
  if (c.includes('chain')) {
    return `Bridge $${capital} of USDC to the ${name} network and use one of its own apps with the funds.`;
  }
  if (c.includes('governance')) {
    return `Deposit $${capital} of USDC into ${name} on ${chain} and vote once in its next governance round.`;
  }
  if (c.includes('index')) {
    return `Buy $${capital} of the ${name} index token on ${chain} and hold it for the whole hold.`;
  }
  if (c.includes('farm')) {
    return `Deposit $${capital} of USDC into ${name}'s main farm on ${chain} and keep the position staked.`;
  }
  if (c.includes('btc') || c.includes('anchor')) {
    return `Deposit $${capital} of BTC-backed assets through ${name} on ${chain} and hold the receipt.`;
  }
  if (c.includes('privacy')) {
    return `Deposit $${capital} through ${name} on ${chain} once, then withdraw it to a fresh address.`;
  }
  if (c.includes('cedeFi') || c.includes('cedefi')) {
    return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the balance in its custodial vault.`;
  }
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The weekly qualifying action, by category, so a plan repeats the protocol's own activity. */
function weeklyActionFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'a small deposit or a borrow-and-repay cycle';
  if (c.includes('dex') || c.includes('leveraged farm')) return 'a small swap in the main pool';
  if (c.includes('yield')) return 'a small top-up of the vault';
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return 'one small hedged trade';
  if (c.includes('bridge') || c.includes('cross chain')) return 'one small bridge in either direction';
  if (c.includes('staking') || c.includes('restak')) return 'a small top-up of the stake';
  if (c.includes('prediction')) return 'one small position in a new market';
  if (c.includes('governance')) return 'a vote or a forum comment';
  if (c.includes('payment') || c.includes('card')) return 'one small payment through the app';
  return 'a deposit, a swap, a vote or a claim';
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const weekly = weeklyActionFor(p);
  const walletLine =
    chain === 'Solana'
      ? `Open a fresh Solana wallet for this farm only, fund it with exactly $${capital} plus a little SOL for fees, and keep its seed phrase offline.`
      : `Open a fresh EVM wallet for this farm only, fund it with exactly $${capital} plus a little ${chain === 'Ethereum' ? 'ETH' : 'gas token'} for fees, and keep its seed phrase offline.`;
  return [
    { text: walletLine, cost: `under $3 of gas for the first transaction`, time: '10 minutes' },
    { text: actionFor(p, capital, chain), cost: `$${capital} of capital and ${gas}`, time: '15 minutes to set up' },
    {
      text: `Do one qualifying action every week, such as ${weekly}, so the wallet shows steady use rather than a single deposit.`,
      cost: gas.replace('per transaction', 'a week'),
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot window.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Once a week, open the protocol's own points or rewards page and check what it counts; claim only from a link that page itself publishes.`,
      cost: 'free to check, and never pay to claim',
      time: '10 minutes a week',
    },
    {
      text: `Once a week, check the protocol's TVL and any token announcement on its own site, and write the numbers into the farm log.`,
      cost: 'free',
      time: '10 minutes a week',
    },
    {
      text: `Keep a farm log with the wallet, the dates, the amounts and every transaction hash; when a token is announced, unwind in tranches over a week instead of all at once.`,
      cost: 'nothing but the log',
      time: '5 minutes a week',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    category_multiple: row.model.category_multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData; calibration: Calibration } {
  const calibration = calibrate(snapshot, model);
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const multiples: Record<string, number> = {};
  for (const [k, v] of [...calibration.multiples.entries()].sort()) multiples[k] = round4(v);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    calibration: {
      global_median: round4(calibration.global_median),
      p90_ratio: round4(calibration.p90_ratio),
      median_pre_age: calibration.median_pre_age,
      live_priced: calibration.live_priced,
      multiples,
    },
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar, calibration };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
