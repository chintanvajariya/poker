const SUITS = ['h', 'd', 'c', 's'];
const SUIT_SYMBOLS = { h: '\u2665', d: '\u2666', c: '\u2663', s: '\u2660' };
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

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

// Draw type definitions with scenario generators
const DRAW_TYPES = [
  {
    name: 'Flush draw',
    outs: 9,
    generate() {
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
      return { hole, board };
    },
  },
  {
    name: 'Open-ended straight draw',
    outs: 8,
    generate() {
      // Pick 4 connected ranks, put 2 in hole, 2 on board
      // Need room above and below for open-ended, so start 1..8 (3-J through J-A excluded)
      const startIdx = 1 + Math.floor(Math.random() * 8); // 1-8 avoids A-high (not open-ended)
      const connected = RANKS.slice(startIdx, startIdx + 4);
      const suits = connected.map(() => randomSuit());
      const usedRanks = [...connected];
      const pick = () => { const r = randomRank(usedRanks); usedRanks.push(r); return r; };
      // Shuffle which go to hole vs board
      const indices = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
      const hole = [
        { rank: connected[indices[0]], suit: suits[indices[0]] },
        { rank: connected[indices[1]], suit: suits[indices[1]] },
      ];
      const board = [
        { rank: connected[indices[2]], suit: suits[indices[2]] },
        { rank: connected[indices[3]], suit: suits[indices[3]] },
        { rank: pick(), suit: randomSuit() },
      ];
      return { hole, board };
    },
  },
  {
    name: 'Gutshot straight draw',
    outs: 4,
    generate() {
      // 5 connected ranks, remove the middle one
      const startIdx = Math.floor(Math.random() * 8);
      const five = RANKS.slice(startIdx, startIdx + 5);
      const gap = five.splice(2, 1); // remove middle
      const suits = five.map(() => randomSuit());
      const usedRanks = [...five, ...gap];
      const pick = () => { const r = randomRank(usedRanks); usedRanks.push(r); return r; };
      const indices = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
      const hole = [
        { rank: five[indices[0]], suit: suits[indices[0]] },
        { rank: five[indices[1]], suit: suits[indices[1]] },
      ];
      const board = [
        { rank: five[indices[2]], suit: suits[indices[2]] },
        { rank: five[indices[3]], suit: suits[indices[3]] },
        { rank: pick(), suit: randomSuit() },
      ];
      return { hole, board };
    },
  },
  {
    name: 'Pair to trips',
    outs: 2,
    generate() {
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
      return { hole, board };
    },
  },
  {
    name: 'Two pair to full house',
    outs: 4,
    generate() {
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
      return { hole, board };
    },
  },
  {
    name: 'Flush draw + open-ended straight draw',
    outs: 15,
    generate() {
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
      return { hole, board };
    },
  },
];

export function generateDrawScenario(isFlop) {
  const drawType = DRAW_TYPES[Math.floor(Math.random() * DRAW_TYPES.length)];
  const { hole, board } = drawType.generate();

  // For turn, add a 4th board card that doesn't complete the draw
  let finalBoard = [...board];
  if (!isFlop) {
    const usedRanks = [...hole, ...board].map((c) => c.rank);
    const extraRank = randomRank(usedRanks);
    // Use a suit that won't complete a flush
    const holeSuits = hole.map((c) => c.suit);
    const boardSuits = board.map((c) => c.suit);
    const allSuits = [...holeSuits, ...boardSuits];
    const suitCounts = {};
    allSuits.forEach((s) => { suitCounts[s] = (suitCounts[s] || 0) + 1; });
    // Avoid giving a 4th of the flush suit if flush draw
    let safeSuit = randomSuit();
    const flushSuit = Object.entries(suitCounts).find(([, c]) => c >= 4);
    if (flushSuit) {
      safeSuit = SUITS.filter((s) => s !== flushSuit[0])[Math.floor(Math.random() * 3)];
    }
    finalBoard.push({ rank: extraRank, suit: safeSuit });
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
