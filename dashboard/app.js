// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and renders
// the ranked board, the filters, and a per-protocol sheet with the model's own inputs and the farm
// plan. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('app');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null, watchlist: false };
  var WATCHLIST = {};
  (DATA.watchlist || []).forEach(function (s) { WATCHLIST[s] = true; });

  var money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return money.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // The model, recomputed in the page from the snapshot figures, so the sheet can show the same
  // arithmetic board.json carries: TVL times the category multiple, times the size tilt, the
  // relative-growth, maturity, chain and launch multipliers. The multiple, the category growth
  // medians and the launch priors are calibrated in main.ts from the snapshot's own cohorts.
  function growthMedianOf(row) {
    var medians = DATA.calibration.growth_medians || {};
    var m = medians[row.category || 'Other'];
    return (m === null || m === undefined) ? DATA.calibration.global_growth_median : m;
  }
  function launchPriorOf(row) {
    var priors = DATA.calibration.launch_priors || {};
    var entry = priors[row.category || 'Other'];
    return entry ? entry.prior : DATA.calibration.global_launch_prior;
  }
  function launchMultOf(row, model) {
    var t = Math.min(1, Math.max(0, (launchPriorOf(row) - 0.3) / 0.7));
    return model.launch_min + (model.launch_max - model.launch_min) * t;
  }
  function sizeTiltOf(row, model) {
    var tilt = Math.pow(Math.max(row.tvl_usd, 1) / model.size_tilt_ref, -model.size_tilt_exp);
    return Math.min(model.size_tilt_max, Math.max(model.size_tilt_min, tilt));
  }
  function impliedOf(row, model) {
    var g = row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d;
    var rel = g - growthMedianOf(row);
    rel = Math.min(model.growth_cap, Math.max(model.growth_floor, rel));
    var growthMult = 1 + (rel / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? DATA.calibration.median_pre_age : row.age_days;
    var maturity = model.maturity_floor + model.maturity_range * Math.min(1, Math.log(1 + Math.max(age, 0)) / Math.log(1 + model.maturity_days));
    var chains = row.chains ? row.chains.length : 0;
    var chainMult = model.chain_floor + model.chain_range * Math.min(1, Math.log(1 + Math.max(chains, 0)) / Math.log(1 + model.chain_scale));
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * sizeTiltOf(row, model) * growthMult * maturity * chainMult * launchMultOf(row, model)));
  }
  function chainMultOf(row, model) {
    var chains = row.chains ? row.chains.length : 0;
    return model.chain_floor + model.chain_range * Math.min(1, Math.log(1 + Math.max(chains, 0)) / Math.log(1 + model.chain_scale));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chain, TVL and age
  // decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function firstChain(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function cheapChain(chain) {
    return ['Solana', 'Base', 'Arbitrum', 'Optimism', 'Polygon', 'BSC', 'BNB Chain', 'Avalanche', 'Gnosis', 'Scroll', 'Linea', 'zkSync Era', 'Mode', 'Blast', 'Berachain'].indexOf(chain) >= 0;
  }
  function gasFor(chain) {
    if (chain === 'Solana') return 'about $0.01 of fees per transaction';
    if (chain === 'Ethereum') return 'about $3 to $8 of gas per transaction';
    if (cheapChain(chain)) return 'about $0.10 to $0.50 of gas per transaction';
    return 'about $1 of gas per transaction';
  }
  function capitalFor(p) {
    if (p.tvl_usd >= 1e9) return 500;
    if (p.tvl_usd >= 1e8) return 250;
    if (p.tvl_usd >= 2.5e7) return 150;
    return 100;
  }
  function holdFor(age) {
    if (age === null || age === undefined) return 60;
    if (age < 180) return 90;
    if (age < 365) return 60;
    return 45;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0 || c.indexOf('uncollateralized') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and leave the deposit earning for the whole hold.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s deepest pool on " + chain + ' and keep the position in range.';
    if (c.indexOf('yield aggregator') >= 0 || c.indexOf('yield') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s highest-TVL vault on " + chain + ' and keep the vault shares.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged trade, then close it the same week.';
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'Bridge $' + capital + ' of USDC into ' + chain + ' through ' + name + ', then use the bridged funds inside its app once.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt token in the same wallet.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + " of the protocol's yield-bearing asset on " + chain + ' and hold it for the whole hold.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold the receipt.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' on ' + name + ' and take one small position in a market that settles within the month.';
    if (c.indexOf('risk curator') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('capital allocator') >= 0) return 'Deposit $' + capital + ' of USDC into a ' + name + ' curated vault on ' + chain + ' and keep the vault shares.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active for the whole hold.';
    if (c.indexOf('basis trading') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s basis vault on " + chain + ' and keep the position open.';
    if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0) return 'Move $' + capital + ' through ' + name + ' on ' + chain + ' for one real payment, then keep the balance parked there.';
    if (c.indexOf('chain') >= 0) return 'Bridge $' + capital + ' of USDC to the ' + name + ' network and use one of its own apps with the funds.';
    if (c.indexOf('governance') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and vote once in its next governance round.';
    if (c.indexOf('index') >= 0) return 'Buy $' + capital + ' of the ' + name + ' index token on ' + chain + ' and hold it for the whole hold.';
    if (c.indexOf('farm') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s main farm on " + chain + ' and keep the position staked.';
    if (c.indexOf('btc') >= 0 || c.indexOf('anchor') >= 0) return 'Deposit $' + capital + ' of BTC-backed assets through ' + name + ' on ' + chain + ' and hold the receipt.';
    if (c.indexOf('privacy') >= 0) return 'Deposit $' + capital + ' through ' + name + ' on ' + chain + ' once, then withdraw it to a fresh address.';
    if (c.indexOf('cedefi') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the balance in its custodial vault.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function weeklyFor(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'a small deposit or a borrow-and-repay cycle';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'a small swap in the main pool';
    if (c.indexOf('yield') >= 0) return 'a small top-up of the vault';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'one small hedged trade';
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'one small bridge in either direction';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'a small top-up of the stake';
    if (c.indexOf('prediction') >= 0) return 'one small position in a new market';
    if (c.indexOf('governance') >= 0) return 'a vote or a forum comment';
    if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0) return 'one small payment through the app';
    return 'a deposit, a swap, a vote or a claim';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function riskStepFor(p, capital) {
    var g = p.change_7d;
    var med = growthMedianOf(p);
    var rel = (g === null || g === undefined ? 0 : g) - med;
    if (g !== null && g !== undefined && rel <= -10) {
      return 'Before depositing, check why ' + p.name + "'s TVL fell " + Math.abs(g).toFixed(1) + '% in seven days, ' + Math.abs(rel).toFixed(1) + ' points worse than its category’s median of ' + med.toFixed(1) + '% — read the protocol’s own announcements and its audit record; if the fall is unexplained, halve the position to $' + Math.round(capital / 2) + ' and wait a week.';
    }
    if (g !== null && g !== undefined && rel >= 20) {
      return p.name + "'s TVL rose " + g.toFixed(1) + '% in seven days, ' + rel.toFixed(1) + ' points ahead of its category’s median of ' + med.toFixed(1) + '%, so the pool is crowded and the yield will compress; deposit the planned $' + capital + ' but re-check the rate after a week before adding more.';
    }
    return 'Before depositing, read ' + p.name + "'s audit record and its last two announcements on its own site; a protocol with no audit or no announcement in months gets half the planned $" + capital + '.';
  }
  function secondActionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow $25 of USDC against the deposit and repay it the same week, so the wallet shows both sides of the market.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('liquidity manager') >= 0) return "Stake the LP receipt in " + name + "'s gauge or rewards contract if it has one, and vote once in the next gauge round.";
    if (c.indexOf('yield') >= 0) return "Stake the vault shares in " + name + "'s rewards contract if it offers one, and claim the rewards weekly instead of letting them sit.";
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Keep the trade small and hedged, close it before the funding window resets, and log the funding paid.';
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'Bridge a second, smaller amount back the other way, so the wallet shows round-trip use of ' + name + '.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Delegate a second small stake to a different validator or operator through ' + name + '.';
    if (c.indexOf('governance') >= 0) return 'Vote a second time in the next round and leave a short forum comment on the proposal.';
    if (c.indexOf('prediction') >= 0) return 'Take a second small position in a different market that settles within the month.';
    return 'Use one more of ' + name + "'s own features once — a swap, a vote or a claim — so the wallet's history is not a single deposit.";
  }
  function farmSteps(p) {
    var chain = firstChain(p);
    var capital = capitalFor(p);
    var hold = holdFor(p.age_days);
    var gas = gasFor(chain);
    var gasToken = chain === 'Ethereum' ? 'ETH' : 'gas token';
    return [
      { text: chain === 'Solana' ? 'Open a fresh Solana wallet for this farm only, fund it with exactly $' + capital + ' plus a little SOL for fees, and keep its seed phrase offline.' : 'Open a fresh EVM wallet for this farm only, fund it with exactly $' + capital + ' plus a little ' + gasToken + ' for fees, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '10 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and ' + gas, time: '15 minutes to set up' },
      { text: riskStepFor(p, capital), cost: 'no capital moves until the check passes', time: '15 minutes' },
      { text: secondActionFor(p, capital, chain), cost: gas, time: '10 minutes' },
      { text: 'Do one qualifying action every week, such as ' + weeklyFor(p) + ', so the wallet shows steady use rather than a single deposit.', cost: gas.replace('per transaction', 'a week'), time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot window.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Once a week, open the protocol's own points or rewards page and check what it counts; claim only from a link that page itself publishes.", cost: 'free to check, and never pay to claim', time: '10 minutes a week' },
      { text: "Once a week, check the protocol's TVL and any token announcement on its own site, and write the numbers into the farm log.", cost: 'free', time: '10 minutes a week' },
      { text: 'Keep a farm log with the wallet, the dates, the amounts and every transaction hash; when a token is announced, unwind in tranches over a week instead of all at once.', cost: 'nothing but the log', time: '5 minutes a week' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('w') === '1') state.watchlist = true;
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.watchlist) params.set('w', '1');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function visibleRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watchlist && !WATCHLIST[r.slug]) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'launch') { av = a.launch_prior === null || a.launch_prior === undefined ? 0 : a.launch_prior; bv = b.launch_prior === null || b.launch_prior === undefined ? 0 : b.launch_prior; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function masthead() {
    return el('header', { class: 'masthead' },
      el('div', { class: 'brand' }, el('span', { class: 'ring', 'aria-hidden': 'true' }), el('b', { text: 'Token Radar' })),
      el('div', { class: 'meta' },
        el('span', null, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('span', null, 'DefiLlama protocol index'),
        el('span', null, 'Model ', el('b', { text: DATA.model_version }))
      )
    );
  }

  function intro() {
    var counts = {};
    DATA.rows.forEach(function (r) { var c = r.category || 'Other'; counts[c] = (counts[c] || 0) + 1; });
    var topCats = Object.keys(counts).map(function (c) { return [c, counts[c]]; })
      .sort(function (a, b) { return b[1] - a[1]; }).slice(0, 5);
    var topMax = topCats.length ? topCats[0][1] : 1;
    return el('section', { class: 'intro' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', null,
          'The watchlist is the floor: every protocol with at least ',
          el('b', { text: '$' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL' }),
          ' and no token on record. The early radar adds ',
          el('b', { text: DATA.early_size + ' pre-token protocols' }),
          ' the watchlist leaves out — every rankable pre-token protocol, ' + DATA.board_size + ' rows in all. Implied value is a model, not a promise — and never a prediction that a token will launch.'
        )
      ),
      el('div', { class: 'stats' },
        el('div', { class: 'stat' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'stat' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'stat' }, el('span', { text: 'Early rows beyond the watchlist' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'stat' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) })),
        el('div', { class: 'cats' },
          el('div', { class: 'stat' }, el('span', { text: 'Top categories on the board' }), el('b', { text: '' })),
          topCats.map(function (entry) {
            return el('div', { class: 'cat' },
              el('span', { text: entry[0] }),
              el('b', { text: String(entry[1]) }),
              el('i', { style: '--w:' + Math.round((entry[1] / topMax) * 100) + '%', 'aria-hidden': 'true' })
            );
          })
        )
      )
    );
  }

  function selectBox(id, label, options, current, onChange) {
    var select = el('select', { id: id, 'aria-label': label },
      options.map(function (o) { return el('option', { value: o[0], text: o[1], selected: o[0] === current ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { onChange(select.value); writeHash(); render(); });
    return el('div', { class: 'field' }, el('label', { for: id, text: label }), select);
  }

  function toolbar() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    var watchOnly = el('button', { type: 'button', 'aria-pressed': state.watchlist ? 'true' : 'false', text: 'Watchlist only', onclick: function () { state.watchlist = !state.watchlist; writeHash(); render(); } });
    return el('div', { class: 'toolbar' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      selectBox('category', 'Category', [['all', 'All categories']].concat(categories.map(function (c) { return [c, c]; })), state.category, function (v) { state.category = v; }),
      selectBox('chain', 'Chain', [['all', 'All chains']].concat(chains.map(function (c) { return [c, c]; })), state.chain, function (v) { state.chain = v; }),
      el('div', { class: 'field' }, el('span', { class: 'label', text: 'Token status' }), el('div', { class: 'seg' }, pre, live)),
      el('div', { class: 'field' }, el('span', { class: 'label', text: 'Coverage' }), el('div', { class: 'seg' }, watchOnly)),
      el('span', { class: 'shown', text: state.tab === 'pre-token' ? visibleRows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHead(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortRows(visibleRows());
    if (list.length === 0) {
      return el('div', { class: 'card' }, el('div', { class: 'blank' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category or chain to see the board again.' }),
        el('button', { class: 'btn solid', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); } })
      ));
    }
    var max = 1;
    list.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down';
      var tr = el('tr', {
        'aria-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openSheet(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSheet(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'who' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'value' },
          el('div', { class: 'meter', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', { class: 'num', text: r.launch_prior === null || r.launch_prior === undefined ? 'n/a' : Math.round(r.launch_prior * 100) + '%' }),
        el('td', null, el('span', { class: 'pill' + (WATCHLIST[r.slug] ? ' watch' : ''), text: WATCHLIST[r.slug] ? 'no token · watchlist' : 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'card' },
      el('div', { class: 'scroll' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHead('implied', 'Rank'),
            sortHead('name', 'Protocol'),
            sortHead('tvl', 'TVL'),
            sortHead('growth', '7d'),
            sortHead('age', 'Age'),
            sortHead('implied', 'Implied value'),
            sortHead('launch', 'Launch'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      var ratio = r.mcap_usd !== null && r.tvl_usd > 0 ? (r.mcap_usd / r.tvl_usd).toFixed(2) + 'x' : 'n/a';
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'who' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'up' : 'down'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: ratio }),
        el('td', null, el('span', { class: 'pill live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'card' },
      el('div', { class: 'scroll' },
        el('table', null,
          el('caption', { text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking — and their market caps are what calibrates it.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Mcap / TVL' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelNote() {
    var m = DATA.model;
    var cal = DATA.calibration;
    return el('section', { class: 'card note' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'One function scores every row, from the snapshot figures alone. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        el('b', { text: 'implied = TVL x category multiple x size tilt x growth multiplier x maturity multiplier x chain multiplier x launch multiplier' }),
        el('br'),
        'category multiple: the median market-cap-per-TVL of live protocols in the category, winsorized at the 90th percentile (' + cal.p90_ratio + ') and shrunk toward the global median (' + cal.global_median + ') with ' + m.shrinkage_k + ' pseudo-observations; categories with fewer than ' + m.min_live_n + ' live protocols take the global median. ' + cal.live_priced + ' live protocols carried both figures.',
        el('br'),
        'size tilt: (TVL / $' + Math.round(m.size_tilt_ref / 1e6) + 'M)^-' + m.size_tilt_exp + ', clamped to [' + m.size_tilt_min + ', ' + m.size_tilt_max + ']: the live cohort pays less per TVL dollar at scale (its log-log slope is 0.52), so a giant is priced closer to the market’s own curve.',
        el('br'),
        'growth multiplier: 1 + clamp(7d change minus its category’s median 7d change, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + '. The category medians come from the pre-token cohort; the global median is ' + cal.global_growth_median.toFixed(2) + '%.',
        el('br'),
        'maturity multiplier: ' + m.maturity_floor + ' + ' + m.maturity_range + ' x min(1, ln(1 + age) / ln(1 + ' + m.maturity_days + ')); an unlisted age uses the pre-token cohort median, ' + cal.median_pre_age + ' days.',
        el('br'),
        'chain multiplier: ' + m.chain_floor + ' + ' + m.chain_range + ' x min(1, ln(1 + chains) / ln(1 + ' + m.chain_scale + ')); one chain scores ' + m.chain_floor + ' and ten or more score ' + (m.chain_floor + m.chain_range).toFixed(2) + '.',
        el('br'),
        'launch multiplier: ' + m.launch_min + ' to ' + m.launch_max + ' from the category’s launch prior — the share of its protocols listed over two years ago that already trade a token (' + Math.round(cal.global_launch_prior * 100) + '% across the old cohort). A new category takes the global rate, so youth is never punished for being young.'
      ),
      el('p', { class: 'sub', text: 'The early radar is every rankable pre-token protocol the watchlist leaves out — ' + DATA.board_size + ' rows in all. A protocol that records no token may still have one its DefiLlama record does not carry: this board says a protocol records no token, never that it has none.' })
    );
  }

  function foot() {
    return el('footer', { class: 'foot' },
      el('p', { text: 'Snapshot: DefiLlama protocol index, ' + DATA.as_of + '. Implied values are this radar\u2019s model, not a price and not a prediction of issuance or timing.' }),
      el('p', { text: 'Model ' + DATA.model_version + ': calibrated on the snapshot\u2019s live cohort at run time; nothing in it names a protocol.' })
    );
  }

  var sheet = el('dialog', { class: 'sheet', id: 'detail', 'aria-labelledby': 'detail-title' });
  sheet.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openSheet(slug) {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row) return;
    state.selected = slug;
    writeHash();
    sheet.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, DATA.model);
    sheet.appendChild(el('div', { class: 'sheet-top' },
      el('div', null,
        el('span', { class: 'eyebrow', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + ' — pre-token' }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'x', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { sheet.close(); } })
    ));
    sheet.appendChild(el('section', { class: 'block' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'math' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple' }), el('b', { class: 'num', text: row.category_multiple.toFixed(4) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Chains deployed' }), el('b', { class: 'num', text: String(row.chains ? row.chains.length : 0) })),
        el('div', null, el('span', { text: 'Chain multiplier' }), el('b', { class: 'num', text: chainMultOf(row, DATA.model).toFixed(4) })),
        el('div', null, el('span', { text: 'Size tilt' }), el('b', { class: 'num', text: String(row.size_multiplier) })),
        el('div', null, el('span', { text: 'Growth vs its category' }), el('b', { class: 'num', text: fmtPct(row.relative_growth_pct) })),
        el('div', null, el('span', { text: 'Launch likelihood' }), el('b', { class: 'num', text: Math.round(row.launch_prior * 100) + '%' })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' Launch likelihood is the share of this category’s protocols listed over two years ago that already trade a token. This is an estimate, not a price.' })
    ));
    var comps = (DATA.comparables || {})[row.category || 'Other'] || [];
    if (comps.length > 0) {
      sheet.appendChild(el('section', { class: 'block' },
        el('h3', { text: 'Live comparables — same category, token already trades' }),
        el('p', { class: 'sub', text: 'The category multiple above is calibrated on these protocols: the market-cap-per-TVL they already trade at.' }),
        el('div', { class: 'math' }, comps.map(function (c) {
          var ratio = c.mcap_usd !== null && c.tvl_usd > 0 ? (c.mcap_usd / c.tvl_usd).toFixed(2) + 'x' : 'n/a';
          return el('div', null, el('span', { text: c.name }), el('b', { class: 'num', text: fmtUsd(c.mcap_usd) + ' · ' + ratio }));
        }))
      ));
    }
    sheet.appendChild(el('section', { class: 'block' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'plan' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof sheet.showModal === 'function') {
      if (!sheet.open) sheet.showModal();
    } else {
      sheet.setAttribute('open', '');
    }
  }

  function earlyFinds() {
    var finds = DATA.early_finds || [];
    if (finds.length === 0) return null;
    return el('section', { class: 'card finds' },
      el('h2', { text: 'Early finds — listed under a year, below the floor' }),
      el('p', { class: 'sub', text: 'The future airdrops, found early: the youngest pre-token protocols with the strongest implied value. Select one for its model and farm plan.' }),
      el('div', { class: 'find-list' }, finds.map(function (f) {
        return el('button', { type: 'button', class: 'find', onclick: function () { openSheet(f.slug); } },
          el('b', { text: f.name }),
          el('span', { class: 'sub', text: (f.category || 'Other') + ' · ' + fmtAge(f.age_days) + ' · ' + fmtUsd(f.tvl_usd) }),
          el('span', { class: 'num', text: fmtUsd(f.implied_value_usd) })
        );
      }))
    );
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'wrap' });
    shell.appendChild(masthead());
    shell.appendChild(intro());
    var finds = earlyFinds();
    if (finds) shell.appendChild(finds);
    shell.appendChild(toolbar());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelNote());
    shell.appendChild(foot());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!sheet.isConnected) app.appendChild(sheet);
    if (state.selected) openSheet(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && sheet.open) sheet.close();
  });
})();
