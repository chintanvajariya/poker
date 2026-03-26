import { getModuleStats, saveModuleStats } from '../storage.js';
import { renderCards, generateDrawScenario } from '../cards.js';

const MODULE_ID = 'ev-decision';
const QUESTIONS_PER_SESSION = 10;
const HARD_TIME_LIMIT_MS = 15000;

const SCENARIOS = [
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

const DECISIONS = ['clear-call', 'marginal-call', 'marginal-fold', 'clear-fold'];
const DECISION_LABELS = {
  'clear-call': 'Clear Call',
  'marginal-call': 'Marginal Call',
  'marginal-fold': 'Marginal Fold',
  'clear-fold': 'Clear Fold',
};

function pickNarrative() {
  return SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)];
}

function formatNarrative(template, scenario) {
  return template
    .replace('$STREET', scenario.street)
    .replace('$DRAW', scenario.drawName.toLowerCase())
    .replace('$POT', '$' + scenario.pot)
    .replace('$BET', '$' + scenario.bet);
}

function calcPotOdds(pot, bet) {
  return (bet / (pot + bet)) * 100;
}

function getCorrectDecision(equity, requiredEquity) {
  const diff = equity - requiredEquity;
  if (diff > 8) return 'clear-call';
  if (diff >= 1) return 'marginal-call';
  if (diff >= -8) return 'marginal-fold';
  return 'clear-fold';
}

function easyPotBet() {
  const pots = [60, 80, 100, 120, 150, 200];
  const pot = pots[Math.floor(Math.random() * pots.length)];
  const bets = [25, 30, 40, 50, 60, 75, 100].filter((b) => b <= pot);
  const bet = bets[Math.floor(Math.random() * bets.length)];
  return { pot, bet };
}

function mediumPotBet() {
  const pot = Math.floor(Math.random() * 250 + 40);
  const minBet = Math.max(10, Math.floor(pot * 0.25));
  const maxBet = Math.floor(pot * 1.2);
  const bet = Math.floor(Math.random() * (maxBet - minBet) + minBet);
  return { pot, bet };
}

function generateScenario(difficulty) {
  const isFlop = Math.random() < 0.5;
  const draw = generateDrawScenario(isFlop);
  const { pot, bet } = difficulty === 'easy' ? easyPotBet() : mediumPotBet();
  const requiredEquity = calcPotOdds(pot, bet);
  const correctDecision = getCorrectDecision(draw.equity, requiredEquity);
  const narrative = formatNarrative(pickNarrative(), { ...draw, pot, bet });

  return {
    ...draw,
    pot,
    bet,
    requiredEquity,
    correctDecision,
    narrative,
  };
}

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
  let lifetimeStats = getModuleStats(MODULE_ID);

  function nextQuestion() {
    currentScenario = generateScenario(difficulty);
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

    feedbackZone.innerHTML = `
      <div class="feedback">
        <div class="feedback-result ${resultClass}">${resultText}</div>
        <div class="feedback-detail">
          <div class="fd-row"><span class="fd-label">Draw</span><span class="fd-value">${s.drawName} (${s.outs} outs)</span></div>
          <div class="fd-row"><span class="fd-label">Your equity</span><span class="fd-value">${s.outs} &times; ${s.multiplier} = ${s.equity}%</span></div>
          <div class="fd-row"><span class="fd-label">Pot odds</span><span class="fd-value">$${s.bet} / $${s.pot + s.bet} = ${s.requiredEquity.toFixed(1)}%</span></div>
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
      render();
    });
  }

  render();
}
