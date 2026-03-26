import { getModuleStats, saveModuleStats } from '../storage.js';
import { renderCards } from '../cards.js';

const MODULE_ID = 'ev-decision';
const QUESTIONS_PER_SESSION = 10;
const HARD_TIME_LIMIT_MS = 15000;

// ── Narrative templates ──

const NARRATIVES = [
  "You're drawing on the $STREET with a $DRAW. Villain bets $BET into a $POT pot. Call or fold?",
  "Tournament spot. You picked up a $DRAW on the $STREET. Pot is $POT, facing a $BET bet. What's the play?",
  "Heads up, you have a $DRAW on the $STREET. Villain leads $BET into $POT. Do the numbers say call?",
  "Cash game, you floated with a draw. $STREET now, $DRAW. Pot is $POT, bet is $BET. Decision time.",
  "Big blind special — you have a $DRAW on the $STREET. Pot $POT, villain bets $BET. Call or fold?",
  "Multiway pot thinned to heads up. Your $DRAW on the $STREET. Pot is $POT, facing $BET. What's correct?",
  "Late position, you called a raise with a speculative hand. $STREET brings a $DRAW. Pot $POT, bet $BET.",
  "Aggressive opponent fires again. You have a $DRAW on the $STREET. Pot is $POT, bet is $BET.",
  "You check-called the flop, now on the $STREET with a $DRAW. Pot $POT, villain bets $BET. Continue?",
  "Villain overbets. You're sitting on a $DRAW on the $STREET. Pot is $POT, bet is $BET. Is it profitable?",
  "Short stack tournament. You have a $DRAW on the $STREET. Pot $POT, it costs $BET to call.",
  "Deep stacked cash game. $DRAW on the $STREET. Pot is $POT, villain bets $BET. Worth peeling?",
  "Button vs blind battle. You have a $DRAW on the $STREET. Pot $POT, facing a $BET bet.",
  "Final table pressure. Your $DRAW on the $STREET. Pot is $POT, opponent shoves $BET.",
  "Three-bet pot, you have position and a $DRAW. $STREET, pot is $POT, villain continues for $BET.",
  "Loose player donk-bets. You hold a $DRAW on the $STREET. Pot $POT, bet $BET. How do you proceed?",
  "Reg fires a c-bet. You have a $DRAW on the $STREET. Pot is $POT, bet is $BET. Math it out.",
  "You're getting a small price with a $DRAW on the $STREET. Pot $POT, only $BET to call. Easy or not?",
  "Villain pots it on the $STREET. You have a $DRAW. Pot was $POT, bet is $BET. Profitable call?",
  "Blind vs blind, $STREET. You have a $DRAW. Pot is $POT, villain bets $BET. What does the math say?",
];

// ── Decision logic ──

const DECISIONS = ['clear-call', 'marginal-call', 'marginal-fold', 'clear-fold'];
const DECISION_LABELS = {
  'clear-call': 'Clear Call',
  'marginal-call': 'Marginal Call',
  'marginal-fold': 'Marginal Fold',
  'clear-fold': 'Clear Fold',
};

function calcPotOdds(pot, bet) {
  return (bet / (pot + bet)) * 100;
}

function getDecision(equity, requiredEquity) {
  const diff = equity - requiredEquity;
  if (diff > 8) return 'clear-call';
  if (diff >= 1) return 'marginal-call';
  if (diff >= -8) return 'marginal-fold';
  return 'clear-fold';
}

// ── Card utilities ──

const SUITS = ['h', 'd', 'c', 's'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const RANK_IDX = {};
RANKS.forEach((r, i) => { RANK_IDX[r] = i; });

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function cardKey(c) { return c.rank + c.suit; }

function allCards() {
  const deck = [];
  for (const r of RANKS) for (const s of SUITS) deck.push({ rank: r, suit: s });
  return deck;
}

// ── Hand validation ──

function hasMadeHand(hole, board) {
  const all = [...hole, ...board];
  const ranks = all.map((c) => RANK_IDX[c.rank]).sort((a, b) => a - b);

  // Check flush (5+ of same suit)
  const suitCounts = {};
  all.forEach((c) => { suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1; });
  if (Object.values(suitCounts).some((n) => n >= 5)) return true;

  // Check straight (5 consecutive among all cards)
  const uniqueRanks = [...new Set(ranks)];
  // Add low ace for wheel
  if (uniqueRanks.includes(12)) uniqueRanks.unshift(-1);
  for (let i = 0; i <= uniqueRanks.length - 5; i++) {
    if (uniqueRanks[i + 4] - uniqueRanks[i] === 4) return true;
  }

  // Check trips/two pair/better using rank frequencies
  const rankCounts = {};
  ranks.forEach((r) => { rankCounts[r] = (rankCounts[r] || 0) + 1; });
  const freqs = Object.values(rankCounts).sort((a, b) => b - a);
  if (freqs[0] >= 3) return true; // trips or better
  if (freqs[0] === 2 && freqs[1] === 2) return true; // two pair

  return false;
}

// ── Outs verification ──

function countFlushOuts(hole, board) {
  const all = [...hole, ...board];
  const suitCounts = {};
  all.forEach((c) => { suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1; });
  const flushSuit = Object.entries(suitCounts).find(([, n]) => n === 4);
  if (!flushSuit) return 0;
  const used = new Set(all.filter((c) => c.suit === flushSuit[0]).map((c) => c.rank));
  return 13 - used.size;
}

function countStraightOuts(hole, board, type) {
  const all = [...hole, ...board];
  const rankSet = new Set(all.map((c) => RANK_IDX[c.rank]));
  // Add ace as low
  if (rankSet.has(12)) rankSet.add(-1);
  let outs = 0;
  // Check each possible rank if adding it would complete a 5-card straight
  for (let r = 0; r < 13; r++) {
    if (rankSet.has(r)) continue;
    const test = new Set(rankSet);
    test.add(r);
    if (r === 12) test.add(-1); // ace also low
    const sorted = [...test].sort((a, b) => a - b);
    for (let i = 0; i <= sorted.length - 5; i++) {
      if (sorted[i + 4] - sorted[i] === 4) {
        outs++;
        break;
      }
    }
  }
  return outs;
}

// ── Draw type definitions ──

const DRAW_TYPES = [
  { id: 'flush', name: 'Flush draw', outs: 9, weight: 25 },
  { id: 'oesd', name: 'Open-ended straight draw', outs: 8, weight: 25 },
  { id: 'combo-oesd', name: 'Flush + straight draw', outs: 15, weight: 10 },
  { id: 'combo-gutshot', name: 'Flush + gutshot', outs: 12, weight: 10 },
  { id: 'gutshot', name: 'Gutshot straight draw', outs: 4, weight: 8 },
  { id: 'overcards', name: 'Overcards', outs: 6, weight: 12 },
  { id: 'pair-to-trips', name: 'Pocket pair (set draw)', outs: 2, weight: 10 },
];

// ── Board/hand generators per draw type ──

function generateFlushDraw(isFlop) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const flushSuit = pickRandom(SUITS);
    const otherSuits = SUITS.filter((s) => s !== flushSuit);
    const ranks = shuffle(RANKS);
    const hole = [
      { rank: ranks[0], suit: flushSuit },
      { rank: ranks[1], suit: flushSuit },
    ];
    const board = [
      { rank: ranks[2], suit: flushSuit },
      { rank: ranks[3], suit: flushSuit },
      { rank: ranks[4], suit: pickRandom(otherSuits) },
    ];
    if (!isFlop) {
      board.push({ rank: ranks[5], suit: pickRandom(otherSuits) });
    }
    if (!hasMadeHand(hole, board)) return { hole, board };
  }
  return null;
}

function generateOESD(isFlop) {
  for (let attempt = 0; attempt < 50; attempt++) {
    // 4 connected cards, need room on both ends
    const startIdx = 1 + Math.floor(Math.random() * 8); // indices 1-8
    const connected = RANKS.slice(startIdx, startIdx + 4);
    const shuffled = shuffle([0, 1, 2, 3]);
    // Use varied suits to avoid flush draws
    const suits = shuffle(SUITS);
    const hole = [
      { rank: connected[shuffled[0]], suit: suits[0] },
      { rank: connected[shuffled[1]], suit: suits[1] },
    ];
    const usedRanks = new Set(connected);
    const fillerRanks = shuffle(RANKS.filter((r) => !usedRanks.has(r)));
    const board = [
      { rank: connected[shuffled[2]], suit: suits[2] },
      { rank: connected[shuffled[3]], suit: suits[3] },
      { rank: fillerRanks[0], suit: pickRandom(SUITS) },
    ];
    if (!isFlop) {
      board.push({ rank: fillerRanks[1], suit: pickRandom(SUITS) });
    }
    if (!hasMadeHand(hole, board)) return { hole, board };
  }
  return null;
}

function generateGutshot(isFlop) {
  for (let attempt = 0; attempt < 50; attempt++) {
    // 5 connected ranks, remove one interior card to create the gap
    const startIdx = Math.floor(Math.random() * 9);
    const five = RANKS.slice(startIdx, startIdx + 5);
    // Remove index 1, 2, or 3 (interior)
    const gapIdx = 1 + Math.floor(Math.random() * 3);
    const kept = five.filter((_, i) => i !== gapIdx);
    const shuffled = shuffle([0, 1, 2, 3]);
    const suits = shuffle(SUITS);
    const hole = [
      { rank: kept[shuffled[0]], suit: suits[0] },
      { rank: kept[shuffled[1]], suit: suits[1] },
    ];
    const usedRanks = new Set(five);
    const fillerRanks = shuffle(RANKS.filter((r) => !usedRanks.has(r)));
    const board = [
      { rank: kept[shuffled[2]], suit: suits[2] },
      { rank: kept[shuffled[3]], suit: suits[3] },
      { rank: fillerRanks[0], suit: pickRandom(SUITS) },
    ];
    if (!isFlop) {
      board.push({ rank: fillerRanks[1], suit: pickRandom(SUITS) });
    }
    if (!hasMadeHand(hole, board)) return { hole, board };
  }
  return null;
}

function generateOvercards(isFlop) {
  for (let attempt = 0; attempt < 50; attempt++) {
    // Two hole cards higher than all board cards = 6 outs (3 per overcard)
    // Pick two high ranks for hole
    const highRanks = shuffle(['T', 'J', 'Q', 'K', 'A']).slice(0, 2);
    const minHole = Math.min(RANK_IDX[highRanks[0]], RANK_IDX[highRanks[1]]);
    // Board must be all below the lowest hole card
    const lowPool = RANKS.filter((r) => RANK_IDX[r] < minHole);
    if (lowPool.length < (isFlop ? 3 : 4)) continue;
    const boardRanks = shuffle(lowPool).slice(0, isFlop ? 3 : 4);
    const suits = shuffle(SUITS);
    const hole = [
      { rank: highRanks[0], suit: suits[0] },
      { rank: highRanks[1], suit: suits[1] },
    ];
    const board = boardRanks.map((r, i) => ({ rank: r, suit: pickRandom(SUITS) }));
    if (!hasMadeHand(hole, board)) return { hole, board };
  }
  return null;
}

function generatePairToTrips(isFlop) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const pairRank = pickRandom(RANKS);
    const pairSuits = shuffle(SUITS).slice(0, 2);
    const hole = [
      { rank: pairRank, suit: pairSuits[0] },
      { rank: pairRank, suit: pairSuits[1] },
    ];
    const boardPool = shuffle(RANKS.filter((r) => r !== pairRank));
    const boardCount = isFlop ? 3 : 4;
    const board = boardPool.slice(0, boardCount).map((r) => ({ rank: r, suit: pickRandom(SUITS) }));
    if (!hasMadeHand(hole, board)) return { hole, board };
  }
  return null;
}

function generateComboFlushOESD(isFlop) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const flushSuit = pickRandom(SUITS);
    const otherSuits = SUITS.filter((s) => s !== flushSuit);
    // Need 4 connected in flush suit + one off-suit on board
    const startIdx = 1 + Math.floor(Math.random() * 8);
    const connected = RANKS.slice(startIdx, startIdx + 4);
    const shuffled = shuffle([0, 1, 2, 3]);
    const hole = [
      { rank: connected[shuffled[0]], suit: flushSuit },
      { rank: connected[shuffled[1]], suit: flushSuit },
    ];
    const usedRanks = new Set(connected);
    const fillerRanks = shuffle(RANKS.filter((r) => !usedRanks.has(r)));
    const board = [
      { rank: connected[shuffled[2]], suit: flushSuit },
      { rank: connected[shuffled[3]], suit: flushSuit },
      { rank: fillerRanks[0], suit: pickRandom(otherSuits) },
    ];
    if (!isFlop) {
      board.push({ rank: fillerRanks[1], suit: pickRandom(otherSuits) });
    }
    if (!hasMadeHand(hole, board)) return { hole, board };
  }
  return null;
}

function generateComboFlushGutshot(isFlop) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const flushSuit = pickRandom(SUITS);
    const otherSuits = SUITS.filter((s) => s !== flushSuit);
    // 5 connected, remove interior for gutshot, all in flush suit
    const startIdx = Math.floor(Math.random() * 9);
    const five = RANKS.slice(startIdx, startIdx + 5);
    const gapIdx = 1 + Math.floor(Math.random() * 3);
    const kept = five.filter((_, i) => i !== gapIdx);
    const shuffled = shuffle([0, 1, 2, 3]);
    const hole = [
      { rank: kept[shuffled[0]], suit: flushSuit },
      { rank: kept[shuffled[1]], suit: flushSuit },
    ];
    const usedRanks = new Set(five);
    const fillerRanks = shuffle(RANKS.filter((r) => !usedRanks.has(r)));
    const board = [
      { rank: kept[shuffled[2]], suit: flushSuit },
      { rank: kept[shuffled[3]], suit: flushSuit },
      { rank: fillerRanks[0], suit: pickRandom(otherSuits) },
    ];
    if (!isFlop) {
      board.push({ rank: fillerRanks[1], suit: pickRandom(otherSuits) });
    }
    if (!hasMadeHand(hole, board)) return { hole, board };
  }
  return null;
}

const GENERATORS = {
  'flush': generateFlushDraw,
  'oesd': generateOESD,
  'combo-oesd': generateComboFlushOESD,
  'combo-gutshot': generateComboFlushGutshot,
  'gutshot': generateGutshot,
  'overcards': generateOvercards,
  'pair-to-trips': generatePairToTrips,
};

// ── Bet sizing and scenario assembly ──

const BET_SIZINGS = [0.25, 0.33, 0.50, 0.67, 0.75, 1.00, 1.33, 1.50];

function generatePot(difficulty) {
  if (difficulty === 'easy') {
    const vals = [60, 80, 100, 120, 140, 150, 160, 180, 200, 240, 250, 300];
    return pickRandom(vals);
  }
  return Math.floor(Math.random() * 260 + 40);
}

// ── Derive draw name from actual cards ──

function identifyDraw(hole, board) {
  const all = [...hole, ...board];

  // Check flush draw (4 of a suit across hole+board, at least 1 hole card in suit)
  const suitCounts = {};
  all.forEach((c) => { suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1; });
  const flushSuitEntry = Object.entries(suitCounts).find(([, n]) => n === 4);
  const hasFlushDraw = !!flushSuitEntry && hole.some((c) => c.suit === flushSuitEntry[0]);
  let flushOuts = 0;
  if (hasFlushDraw) {
    flushOuts = countFlushOuts(hole, board);
  }

  // Check straight draws
  const rankIdxSet = new Set(all.map((c) => RANK_IDX[c.rank]));
  if (rankIdxSet.has(12)) rankIdxSet.add(-1); // ace low

  let straightType = null; // 'oesd' or 'gutshot'
  let straightOuts = 0;

  // Count how many unique ranks complete a straight
  const straightOutRanks = [];
  for (let r = 0; r < 13; r++) {
    if (rankIdxSet.has(r)) continue;
    const test = new Set(rankIdxSet);
    test.add(r);
    if (r === 12) test.add(-1);
    const sorted = [...test].sort((a, b) => a - b);
    for (let i = 0; i <= sorted.length - 5; i++) {
      if (sorted[i + 4] - sorted[i] === 4) {
        straightOutRanks.push(r);
        break;
      }
    }
  }
  straightOuts = straightOutRanks.length;
  if (straightOuts >= 8) straightType = 'oesd';
  else if (straightOuts >= 3) straightType = 'gutshot';

  // Check overcards (both hole cards above all board cards)
  const boardMaxIdx = Math.max(...board.map((c) => RANK_IDX[c.rank]));
  const hasOvercards = hole.every((c) => RANK_IDX[c.rank] > boardMaxIdx) && hole[0].rank !== hole[1].rank;

  // Check pocket pair
  const hasPocketPair = hole[0].rank === hole[1].rank && !board.some((c) => c.rank === hole[0].rank);

  // Determine combo vs single draw
  if (hasFlushDraw && straightType === 'oesd') {
    // Combo: flush outs minus overlap (straight-completing cards in flush suit)
    const overlapOuts = straightOutRanks.filter((r) => {
      // Check if rank r in flushSuit is already accounted for
      return !all.some((c) => RANK_IDX[c.rank] === r && c.suit === flushSuitEntry[0]);
    }).length;
    const totalOuts = flushOuts + straightOuts - overlapOuts;
    return { name: 'Flush + straight draw', outs: Math.min(totalOuts, 15) };
  }
  if (hasFlushDraw && straightType === 'gutshot') {
    const overlapOuts = straightOutRanks.filter((r) => {
      return !all.some((c) => RANK_IDX[c.rank] === r && c.suit === flushSuitEntry[0]);
    }).length;
    const totalOuts = flushOuts + straightOuts - overlapOuts;
    return { name: 'Flush + gutshot', outs: Math.min(totalOuts, 12) };
  }
  if (hasFlushDraw) {
    return { name: 'Flush draw', outs: flushOuts };
  }
  if (straightType === 'oesd') {
    return { name: 'Open-ended straight draw', outs: straightOuts };
  }
  if (straightType === 'gutshot') {
    return { name: 'Gutshot straight draw', outs: straightOuts };
  }
  if (hasOvercards) {
    return { name: 'Overcards', outs: 6 };
  }
  if (hasPocketPair) {
    return { name: 'Pocket pair (set draw)', outs: 2 };
  }

  // Fallback
  return { name: 'Drawing hand', outs: 0 };
}

// ── Precompute valid combos per decision ──
// Each combo is { drawType, isFlop, sizingPct, equity, required, decision }

const VALID_COMBOS = {};
for (const dec of DECISIONS) VALID_COMBOS[dec] = [];

for (const dt of DRAW_TYPES) {
  for (const isFlop of [true, false]) {
    const equity = dt.outs * (isFlop ? 4 : 2);
    for (const pct of BET_SIZINGS) {
      const required = (pct / (1 + pct)) * 100;
      const decision = getDecision(equity, required);
      VALID_COMBOS[decision].push({
        drawType: dt,
        isFlop,
        sizingPct: pct,
        equity,
        required,
        weight: dt.weight,
      });
    }
  }
}

function pickWeightedCombo(combos) {
  const totalWeight = combos.reduce((s, c) => s + c.weight, 0);
  let r = Math.random() * totalWeight;
  for (const c of combos) {
    r -= c.weight;
    if (r <= 0) return c;
  }
  return combos[0];
}

// ── Main scenario generation ──

function generateScenario(difficulty, recentDecisions) {
  // Step 1: pick target decision (balanced, anti-streak)
  let targetDecision;
  const lastThree = recentDecisions.slice(-3);
  const allSame = lastThree.length === 3 && lastThree.every((d) => d === lastThree[0]);

  if (allSame) {
    const others = DECISIONS.filter((d) => d !== lastThree[0]);
    targetDecision = pickRandom(others);
  } else {
    targetDecision = pickRandom(DECISIONS);
  }

  // Step 2: pick a valid combo for the target decision
  let combos = VALID_COMBOS[targetDecision];
  if (combos.length === 0) {
    // Fallback: pick any decision that has combos
    const fallbacks = DECISIONS.filter((d) => VALID_COMBOS[d].length > 0);
    targetDecision = pickRandom(fallbacks);
    combos = VALID_COMBOS[targetDecision];
  }
  const combo = pickWeightedCombo(combos);

  // Step 3: generate pot and derive bet
  const pot = generatePot(difficulty);
  const bet = Math.max(1, Math.round(pot * combo.sizingPct));
  const requiredEquity = calcPotOdds(pot, bet);
  // Rounding may shift the decision slightly — recompute
  const correctDecision = getDecision(combo.equity, requiredEquity);

  // Step 4: generate cards
  const generator = GENERATORS[combo.drawType.id];
  let cards = generator(combo.isFlop);
  if (!cards) {
    for (const dt of shuffle(DRAW_TYPES)) {
      cards = GENERATORS[dt.id](combo.isFlop);
      if (cards) break;
    }
  }

  // Step 5: identify draw from actual cards and recompute
  const identified = identifyDraw(cards.hole, cards.board);
  const multiplier = combo.isFlop ? 4 : 2;
  const actualOuts = identified.outs;
  const actualEquity = actualOuts * multiplier;
  const finalDecision = getDecision(actualEquity, requiredEquity);

  // Step 6: narrative
  const street = combo.isFlop ? 'flop' : 'turn';
  const narrative = pickRandom(NARRATIVES)
    .replace('$STREET', street)
    .replace('$DRAW', identified.name.toLowerCase())
    .replace('$POT', '$' + pot)
    .replace('$BET', '$' + bet);

  return {
    hole: cards.hole,
    board: cards.board,
    outs: actualOuts,
    equity: actualEquity,
    multiplier,
    street,
    drawName: identified.name,
    pot,
    bet,
    requiredEquity,
    correctDecision: finalDecision,
    narrative,
  };
}

// ── Module mount ──

export function mount(app, navigateHome) {
  let difficulty = 'medium';
  let questionNum = 0;
  let sessionCorrect = 0;
  let sessionTotalTimeMs = 0;
  let streak = 0;
  let bestStreakThisSession = 0;
  let currentScenario = null;
  let questionStartTime = null;
  let timerInterval = null;
  let submitted = false;
  let referenceOpen = false;
  let awaitingNext = false;
  let recentDecisions = [];
  let lifetimeStats = getModuleStats(MODULE_ID);

  function nextQuestion() {
    currentScenario = generateScenario(difficulty, recentDecisions);
    recentDecisions.push(currentScenario.correctDecision);
    if (recentDecisions.length > 10) recentDecisions.shift();
    questionStartTime = Date.now();
    submitted = false;
  }

  function render() {
    if (awaitingNext) return;
    app.innerHTML = '';

    if (questionNum >= QUESTIONS_PER_SESSION) {
      renderSummary();
      return;
    }

    if (!currentScenario) nextQuestion();

    const s = currentScenario;

    const html = `
      <div class="header">
        <button class="back-btn" id="back">Back</button>
        <div class="header-stats">
          <span>${questionNum}/${QUESTIONS_PER_SESSION}</span>
          <span class="streak">${streak > 1 ? streak + ' streak' : ''}</span>
        </div>
      </div>

      <div class="difficulty-selector">
        <button class="diff-btn ${difficulty === 'easy' ? 'active' : ''}" data-diff="easy">Easy</button>
        <button class="diff-btn ${difficulty === 'medium' ? 'active' : ''}" data-diff="medium">Medium</button>
        <button class="diff-btn ${difficulty === 'hard' ? 'active' : ''}" data-diff="hard">Hard</button>
      </div>

      ${difficulty === 'hard' ? '<div class="timer-bar-container"><div class="timer-bar" id="timer-bar" style="width:100%"></div></div>' : ''}

      <div class="stats-row">
        <div class="stat-box">
          <div class="stat-value">${questionNum}</div>
          <div class="stat-label">Answered</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${questionNum > 0 ? Math.round((sessionCorrect / questionNum) * 100) : 0}%</div>
          <div class="stat-label">Accuracy</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${questionNum > 0 ? (sessionTotalTimeMs / questionNum / 1000).toFixed(1) + 's' : '-'}</div>
          <div class="stat-label">Avg Time</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${bestStreakThisSession}</div>
          <div class="stat-label">Best Run</div>
        </div>
      </div>

      <div class="card scenario" id="scenario-card">
        <div class="scenario-narrative">${s.narrative}</div>
        <span class="street-badge">${s.street}</span>

        <div class="hand-and-board">
          <div class="cards-section-label">Your Hand</div>
          <div class="cards-display">${renderCards(s.hole)}</div>
          <div class="cards-section-label">Board</div>
          <div class="cards-display">${renderCards(s.board)}</div>
        </div>

        <div class="scenario-row">
          <div>
            <div class="scenario-label">Pot</div>
            <div class="scenario-value pot">$${s.pot}</div>
          </div>
          <div>
            <div class="scenario-label">Bet to Call</div>
            <div class="scenario-value bet">$${s.bet}</div>
          </div>
        </div>

        <div id="input-zone">
          <div class="decision-stack">
            <button class="decision-btn call" data-choice="clear-call">Clear Call</button>
            <button class="decision-btn call" data-choice="marginal-call">Marginal Call</button>
            <button class="decision-btn fold" data-choice="marginal-fold">Marginal Fold</button>
            <button class="decision-btn fold" data-choice="clear-fold">Clear Fold</button>
          </div>
        </div>

        <div id="feedback-zone"></div>
      </div>

      <button class="reference-toggle" id="ref-toggle">${referenceOpen ? 'Hide' : 'Show'} reference</button>
      <div class="card reference-card ${referenceOpen ? 'open' : ''}" id="ref-card">
        <h3>How to Decide</h3>
        <ol>
          <li>Count your <strong>outs</strong></li>
          <li>Estimate equity (outs &times; 4 on flop, &times; 2 on turn)</li>
          <li>Calculate pot odds: call &divide; (pot + call)</li>
          <li>Compare: equity vs required equity</li>
        </ol>
        <div class="formula-highlight" style="margin-top:10px">
          Equity &gt; Required &rarr; Call<br>
          Equity &lt; Required &rarr; Fold
        </div>
        <p style="margin-top:10px"><strong>Thresholds:</strong></p>
        <table class="ref-table">
          <tr><td>Clear Call</td><td>Equity exceeds required by &gt;8%</td></tr>
          <tr><td>Marginal Call</td><td>Equity exceeds required by 1-8%</td></tr>
          <tr><td>Marginal Fold</td><td>Equity below required by 1-8%</td></tr>
          <tr><td>Clear Fold</td><td>Equity below required by &gt;8%</td></tr>
        </table>
      </div>
    `;

    app.innerHTML = html;
    bindEvents();

    if (!submitted && difficulty === 'hard') startTimer();
  }

  function bindEvents() {
    document.getElementById('back').addEventListener('click', () => {
      clearInterval(timerInterval);
      navigateHome();
    });

    document.querySelectorAll('.diff-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const newDiff = btn.dataset.diff;
        if (newDiff !== difficulty) {
          difficulty = newDiff;
          clearInterval(timerInterval);
          currentScenario = null;
          render();
        }
      });
    });

    document.getElementById('ref-toggle').addEventListener('click', () => {
      referenceOpen = !referenceOpen;
      render();
    });

    if (!submitted) {
      document.querySelectorAll('.decision-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          handleAnswer(btn.dataset.choice);
        });
      });
    }
  }

  function startTimer() {
    const bar = document.getElementById('timer-bar');
    const start = Date.now();
    timerInterval = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.max(0, 1 - elapsed / HARD_TIME_LIMIT_MS);
      if (bar) bar.style.width = (pct * 100) + '%';
      if (pct <= 0) {
        clearInterval(timerInterval);
        handleAnswer(null);
      }
    }, 50);
  }

  function handleAnswer(userChoice) {
    if (submitted) return;
    submitted = true;
    clearInterval(timerInterval);

    const elapsed = Date.now() - questionStartTime;
    const s = currentScenario;
    const timedOut = userChoice === null;
    const isCorrect = !timedOut && userChoice === s.correctDecision;

    questionNum++;
    sessionTotalTimeMs += elapsed;

    if (isCorrect) {
      sessionCorrect++;
      streak++;
      if (streak > bestStreakThisSession) bestStreakThisSession = streak;
    } else {
      streak = 0;
    }

    lifetimeStats.totalAnswered++;
    if (isCorrect) lifetimeStats.totalCorrect++;
    lifetimeStats.totalTimeMs += elapsed;
    if (bestStreakThisSession > lifetimeStats.bestStreak) lifetimeStats.bestStreak = bestStreakThisSession;
    saveModuleStats(MODULE_ID, lifetimeStats);

    const feedbackZone = document.getElementById('feedback-zone');
    const inputZone = document.getElementById('input-zone');
    if (inputZone) inputZone.style.display = 'none';

    let resultText, resultClass;
    if (timedOut) {
      resultText = "Time's up!";
      resultClass = 'incorrect';
    } else if (isCorrect) {
      resultText = 'Correct!';
      resultClass = 'correct';
    } else {
      resultText = 'Not quite';
      resultClass = 'incorrect';
    }

    const diff = s.equity - s.requiredEquity;
    const totalPot = s.pot + s.bet;

    feedbackZone.innerHTML = `
      <div class="feedback">
        <div class="feedback-result ${resultClass}">${resultText}</div>
        <div class="feedback-detail">
          <div class="fd-row"><span class="fd-label">Draw</span><span class="fd-value">${s.drawName} (${s.outs} outs)</span></div>
          <div class="fd-row"><span class="fd-label">Your equity</span><span class="fd-value">${s.outs} &times; ${s.multiplier} = ${s.equity}%</span></div>
          <div class="fd-row"><span class="fd-label">Pot odds</span><span class="fd-value">$${s.bet} / $${totalPot} = ${s.requiredEquity.toFixed(1)}%</span></div>
          <div class="fd-row"><span class="fd-label">Difference</span><span class="fd-value">${diff > 0 ? '+' : ''}${diff.toFixed(1)}%</span></div>
          <div class="fd-row"><span class="fd-label">Correct</span><span class="fd-value">${DECISION_LABELS[s.correctDecision]}</span></div>
          ${!timedOut ? `<div class="fd-row"><span class="fd-label">You chose</span><span class="fd-value">${DECISION_LABELS[userChoice]}</span></div>` : ''}
        </div>
      </div>
    `;

    awaitingNext = true;
    setTimeout(() => {
      submitted = false;
      awaitingNext = false;
      currentScenario = null;
      render();
    }, 2500);
  }

  function renderSummary() {
    const avgTime = sessionTotalTimeMs / QUESTIONS_PER_SESSION / 1000;
    const accuracy = Math.round((sessionCorrect / QUESTIONS_PER_SESSION) * 100);

    app.innerHTML = `
      <div class="header">
        <button class="back-btn" id="back">Back</button>
        <div></div>
      </div>
      <div class="card summary">
        <h2>Session Complete</h2>
        <div class="summary-grid">
          <div class="summary-stat">
            <div class="stat-value">${sessionCorrect}/${QUESTIONS_PER_SESSION}</div>
            <div class="stat-label">Correct</div>
          </div>
          <div class="summary-stat">
            <div class="stat-value">${accuracy}%</div>
            <div class="stat-label">Accuracy</div>
          </div>
          <div class="summary-stat">
            <div class="stat-value">${avgTime.toFixed(1)}s</div>
            <div class="stat-label">Avg Time</div>
          </div>
          <div class="summary-stat">
            <div class="stat-value">${bestStreakThisSession}</div>
            <div class="stat-label">Best Streak</div>
          </div>
        </div>
        <div class="summary-grid" style="margin-bottom:20px">
          <div class="summary-stat">
            <div class="stat-value">${lifetimeStats.totalAnswered}</div>
            <div class="stat-label">Lifetime Q's</div>
          </div>
          <div class="summary-stat">
            <div class="stat-value">${lifetimeStats.totalAnswered > 0 ? Math.round((lifetimeStats.totalCorrect / lifetimeStats.totalAnswered) * 100) : 0}%</div>
            <div class="stat-label">Lifetime Acc</div>
          </div>
        </div>
        <button class="continue-btn" id="continue">Keep Drilling</button>
      </div>
    `;

    document.getElementById('back').addEventListener('click', navigateHome);
    document.getElementById('continue').addEventListener('click', () => {
      questionNum = 0;
      sessionCorrect = 0;
      sessionTotalTimeMs = 0;
      streak = 0;
      bestStreakThisSession = 0;
      currentScenario = null;
      recentDecisions = [];
      render();
    });
  }

  render();
}
