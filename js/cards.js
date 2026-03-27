const SUITS = ['h', 'd', 'c', 's'];
const SUIT_SYMBOLS = { h: '\u2665', d: '\u2666', c: '\u2663', s: '\u2660' };
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const RANK_IDX = {};
RANKS.forEach((r, i) => { RANK_IDX[r] = i; });

function randomSuit() {
  return SUITS[Math.floor(Math.random() * 4)];
}

function randomRank(exclude) {
  const pool = RANKS.filter((r) => !exclude.includes(r));
  return pool[Math.floor(Math.random() * pool.length)];
}

function suitColor(suit) {
  return suit === 'h' || suit === 'd' ? 'red' : 'black';
}

function displayRank(r) {
  return r === 'T' ? '10' : r;
}

export function renderCard(rank, suit) {
  return `<div class="playing-card ${suitColor(suit)}"><span class="card-rank">${displayRank(rank)}</span><span class="card-suit">${SUIT_SYMBOLS[suit]}</span></div>`;
}

export function renderCards(cards) {
  return cards.map((c) => renderCard(c.rank, c.suit)).join('');
}

// ── Robust outs counting via brute-force deck enumeration ──

function hasMadeHand(hole, board) {
  const all = [...hole, ...board];
  const ranks = all.map((c) => RANK_IDX[c.rank]).sort((a, b) => a - b);

  // Flush (5+ of same suit)
  const suitCounts = {};
  all.forEach((c) => { suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1; });
  if (Object.values(suitCounts).some((n) => n >= 5)) return true;

  // Straight (5 consecutive)
  const uniqueRanks = [...new Set(ranks)];
  if (uniqueRanks.includes(12)) uniqueRanks.unshift(-1);
  for (let i = 0; i <= uniqueRanks.length - 5; i++) {
    if (uniqueRanks[i + 4] - uniqueRanks[i] === 4) return true;
  }

  // Trips/two pair/better
  const rankCounts = {};
  ranks.forEach((r) => { rankCounts[r] = (rankCounts[r] || 0) + 1; });
  const freqs = Object.values(rankCounts).sort((a, b) => b - a);
  if (freqs[0] >= 3) return true;
  if (freqs[0] === 2 && freqs[1] === 2) return true;

  return false;
}

// Count every card in the remaining deck that improves the hand.
// "Improves" means: completes a flush, completes a straight,
// pairs an overcard, or makes trips from a pocket pair.
export function countTotalOuts(hole, board) {
  const all = [...hole, ...board];
  const usedKeys = new Set(all.map((c) => c.rank + c.suit));

  // Pre-compute current hand properties
  const suitCounts = {};
  all.forEach((c) => { suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1; });
  const flushSuit = Object.entries(suitCounts).find(([s, n]) => n === 4 && hole.some((c) => c.suit === s));

  const rankIdxs = all.map((c) => RANK_IDX[c.rank]);
  const uniqueRankSet = new Set(rankIdxs);
  if (uniqueRankSet.has(12)) uniqueRankSet.add(-1);

  const isPocketPair = hole[0].rank === hole[1].rank;
  const boardMaxIdx = Math.max(...board.map((c) => RANK_IDX[c.rank]));
  const overcardRanks = hole
    .filter((c) => RANK_IDX[c.rank] > boardMaxIdx && !board.some((b) => b.rank === c.rank))
    .map((c) => c.rank);
  const hasOvercards = !isPocketPair && overcardRanks.length === 2;

  let outs = 0;

  for (const r of RANKS) {
    for (const s of SUITS) {
      if (usedKeys.has(r + s)) continue;

      let isOut = false;

      // Would this card complete a flush?
      if (flushSuit && s === flushSuit[0]) {
        isOut = true;
      }

      // Would this card complete a straight?
      if (!isOut) {
        const ri = RANK_IDX[r];
        const testSet = new Set(uniqueRankSet);
        testSet.add(ri);
        if (ri === 12) testSet.add(-1);
        const sorted = [...testSet].sort((a, b) => a - b);
        for (let i = 0; i <= sorted.length - 5; i++) {
          if (sorted[i + 4] - sorted[i] === 4) { isOut = true; break; }
        }
      }

      // Would this card make trips from a pocket pair?
      if (!isOut && isPocketPair && r === hole[0].rank) {
        isOut = true;
      }

      // Would this card pair an overcard?
      if (!isOut && hasOvercards && overcardRanks.includes(r)) {
        isOut = true;
      }

      if (isOut) outs++;
    }
  }

  return outs;
}

// Draw type definitions with scenario generators
const DRAW_TYPES = [
  {
    name: 'Flush draw',
    outs: 9,
    generate() {
      for (let attempt = 0; attempt < 80; attempt++) {
        const flushSuit = randomSuit();
        const otherSuit = SUITS.filter((s) => s !== flushSuit)[Math.floor(Math.random() * 3)];
        const usedRanks = [];
        const pick = () => { const r = randomRank(usedRanks); usedRanks.push(r); return r; };
        const hole = [
          { rank: pick(), suit: flushSuit },
          { rank: pick(), suit: flushSuit },
        ];
        const board = [
          { rank: pick(), suit: flushSuit },
          { rank: pick(), suit: flushSuit },
          { rank: pick(), suit: otherSuit },
        ];
        if (!hasMadeHand(hole, board) && countTotalOuts(hole, board) === 9) {
          return { hole, board };
        }
      }
      return null;
    },
  },
  {
    name: 'Open-ended straight draw',
    outs: 8,
    generate() {
      for (let attempt = 0; attempt < 80; attempt++) {
        const startIdx = 1 + Math.floor(Math.random() * 8);
        const connected = RANKS.slice(startIdx, startIdx + 4);
        // Use all different suits to avoid flush draws
        const suits = [...SUITS].sort(() => Math.random() - 0.5);
        const usedRanks = [...connected];
        const pick = () => { const r = randomRank(usedRanks); usedRanks.push(r); return r; };
        const indices = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
        const hole = [
          { rank: connected[indices[0]], suit: suits[0] },
          { rank: connected[indices[1]], suit: suits[1] },
        ];
        const board = [
          { rank: connected[indices[2]], suit: suits[2] },
          { rank: connected[indices[3]], suit: suits[3] },
          { rank: pick(), suit: suits[Math.floor(Math.random() * 4)] },
        ];
        if (!hasMadeHand(hole, board) && countTotalOuts(hole, board) === 8) {
          return { hole, board };
        }
      }
      return null;
    },
  },
  {
    name: 'Gutshot straight draw',
    outs: 4,
    generate() {
      for (let attempt = 0; attempt < 80; attempt++) {
        const startIdx = Math.floor(Math.random() * 9);
        const five = RANKS.slice(startIdx, startIdx + 5);
        const gapIdx = 1 + Math.floor(Math.random() * 3);
        const kept = five.filter((_, i) => i !== gapIdx);
        const suits = [...SUITS].sort(() => Math.random() - 0.5);
        const usedRanks = [...five];
        const pick = () => { const r = randomRank(usedRanks); usedRanks.push(r); return r; };
        const indices = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
        const hole = [
          { rank: kept[indices[0]], suit: suits[0] },
          { rank: kept[indices[1]], suit: suits[1] },
        ];
        const board = [
          { rank: kept[indices[2]], suit: suits[2] },
          { rank: kept[indices[3]], suit: suits[3] },
          { rank: pick(), suit: suits[Math.floor(Math.random() * 4)] },
        ];
        if (!hasMadeHand(hole, board) && countTotalOuts(hole, board) === 4) {
          return { hole, board };
        }
      }
      return null;
    },
  },
  {
    name: 'Pair to trips',
    outs: 2,
    generate() {
      for (let attempt = 0; attempt < 80; attempt++) {
        const pairRank = randomRank([]);
        const usedRanks = [pairRank];
        const pick = () => { const r = randomRank(usedRanks); usedRanks.push(r); return r; };
        const pairSuits = [...SUITS].sort(() => Math.random() - 0.5).slice(0, 2);
        const hole = [
          { rank: pairRank, suit: pairSuits[0] },
          { rank: pairRank, suit: pairSuits[1] },
        ];
        const board = [
          { rank: pick(), suit: randomSuit() },
          { rank: pick(), suit: randomSuit() },
          { rank: pick(), suit: randomSuit() },
        ];
        if (!hasMadeHand(hole, board) && countTotalOuts(hole, board) === 2) {
          return { hole, board };
        }
      }
      return null;
    },
  },
  {
    name: 'Two pair to full house',
    outs: 4,
    generate() {
      for (let attempt = 0; attempt < 80; attempt++) {
        const usedRanks = [];
        const pick = () => { const r = randomRank(usedRanks); usedRanks.push(r); return r; };
        const r1 = pick(), r2 = pick();
        const hole = [
          { rank: r1, suit: randomSuit() },
          { rank: r2, suit: randomSuit() },
        ];
        const board = [
          { rank: r1, suit: randomSuit() },
          { rank: r2, suit: randomSuit() },
          { rank: pick(), suit: randomSuit() },
        ];
        if (!hasMadeHand(hole, board) && countTotalOuts(hole, board) === 4) {
          return { hole, board };
        }
      }
      return null;
    },
  },
  {
    name: 'Flush draw + open-ended straight draw',
    outs: 15,
    generate() {
      for (let attempt = 0; attempt < 80; attempt++) {
        const flushSuit = randomSuit();
        const startIdx = 1 + Math.floor(Math.random() * 7);
        const connected = RANKS.slice(startIdx, startIdx + 4);
        const usedRanks = [...connected];
        const pick = () => { const r = randomRank(usedRanks); usedRanks.push(r); return r; };
        const otherSuit = SUITS.filter((s) => s !== flushSuit)[0];
        const hole = [
          { rank: connected[0], suit: flushSuit },
          { rank: connected[1], suit: flushSuit },
        ];
        const board = [
          { rank: connected[2], suit: flushSuit },
          { rank: connected[3], suit: flushSuit },
          { rank: pick(), suit: otherSuit },
        ];
        if (!hasMadeHand(hole, board) && countTotalOuts(hole, board) === 15) {
          return { hole, board };
        }
      }
      return null;
    },
  },
];

export function generateDrawScenario(isFlop) {
  // Retry the entire process if needed
  for (let outerAttempt = 0; outerAttempt < 20; outerAttempt++) {
    const drawType = DRAW_TYPES[Math.floor(Math.random() * DRAW_TYPES.length)];
    const result = drawType.generate();
    if (!result) continue;

    const { hole, board } = result;

    // For turn, add a 4th board card that doesn't change the outs count
    let finalBoard = [...board];
    if (!isFlop) {
      const usedRanks = [...hole, ...board].map((c) => c.rank);
      // Try several turn cards until we find one that preserves the outs count
      let found = false;
      for (let turnAttempt = 0; turnAttempt < 30; turnAttempt++) {
        const extraRank = randomRank(usedRanks);
        // Avoid completing a flush
        const allCards = [...hole, ...board];
        const suitCounts = {};
        allCards.forEach((c) => { suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1; });
        const flushSuitEntry = Object.entries(suitCounts).find(([, c]) => c >= 4);
        let safeSuit = randomSuit();
        if (flushSuitEntry) {
          const nonFlush = SUITS.filter((s) => s !== flushSuitEntry[0]);
          safeSuit = nonFlush[Math.floor(Math.random() * nonFlush.length)];
        }

        const testBoard = [...board, { rank: extraRank, suit: safeSuit }];
        if (hasMadeHand(hole, testBoard)) continue;

        const turnOuts = countTotalOuts(hole, testBoard);
        if (turnOuts === drawType.outs) {
          finalBoard = testBoard;
          found = true;
          break;
        }
      }
      if (!found) continue;
    }

    const outs = drawType.outs;
    const multiplier = isFlop ? 4 : 2;
    const equity = outs * multiplier;
    const street = isFlop ? 'flop' : 'turn';

    return {
      hole,
      board: finalBoard,
      outs,
      equity,
      multiplier,
      street,
      drawName: drawType.name,
    };
  }

  // Absolute fallback — should never reach here
  return generateDrawScenario(isFlop);
}
