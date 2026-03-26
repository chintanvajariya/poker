import { getModuleStats, saveModuleStats } from '../storage.js';

const MODULE_ID = 'pot-odds';
const QUESTIONS_PER_SESSION = 10;
const HARD_TIME_LIMIT_MS = 10000;
const TOLERANCE = 2;

const SCENARIOS = [
  "You're on the river with a busted flush draw. Villain leads out. Pot is $POT, bet is $BET. Do you have the odds to call?",
  "Final table of a tournament. Short stack shoves all-in. Pot is $POT, you need to call $BET more. Are you getting the right price?",
  "Heads up, your opponent bets into you on a paired board. Pot is $POT, bet is $BET. Do you have the equity needed to continue?",
  "You're in the big blind defending against a river bet. Pot is $POT, villain fires $BET. Are you getting the odds?",
  "Three-way pot, everyone checks to the river. Button bets out. Pot is $POT, bet is $BET. Are you priced in?",
  "You've been calling down with second pair. Villain jams the river. Pot is $POT, call is $BET. Do the odds justify it?",
  "Opponent fires a third barrel on a scary board. Pot is $POT, bet is $BET. What equity do you need to call?",
  "You flopped a straight draw and missed. Villain bets the river. Pot is $POT, bet is $BET. Are you getting the right price to call?",
  "Loose player bets into a multiway pot on the river. Pot is $POT, bet is $BET. Do you have the odds?",
  "You're getting a great price or are you? Pot is $POT, villain bets $BET. Calculate before you act.",
  "Cutoff opens, you defend your big blind. River comes, villain bets $BET into a $POT pot. What's your minimum equity?",
  "You check-raised the flop with a draw and bricked. Villain leads $BET into $POT. Can you find a profitable call?",
  "Bubble of a sit-and-go. Chip leader shoves. Pot is $POT, it costs you $BET to call. Do the numbers work?",
  "You 3-bet preflop and got flatted. River goes check-check... just kidding, villain fires $BET into $POT. Odds?",
  "Cash game, deep stacked. Villain overbets the river. Pot is $POT, bet is $BET. How much equity do you need?",
  "You're in position with a marginal hand. Villain donk-bets $BET into a pot of $POT. Is the price right?",
  "Early in a tournament, you call a flop and turn bet. River pairs the board. Villain bets $BET, pot is $POT.",
  "Heads-up for the title. Your opponent min-bets the river. Pot is $POT, bet is $BET. Easy call or not?",
  "You flopped top pair but the board got scary by the river. Villain bets $BET into $POT. What equity justifies a call?",
  "Four to a flush on board. Villain bets $BET into a $POT pot. Do you need to have it to call?",
  "Small blind vs big blind battle. River checks through to a bet of $BET. Pot is $POT. What's the breakeven equity?",
  "Multiway pot, two players check to you on the river. Someone wakes up with a bet of $BET into $POT.",
  "You've been check-calling all streets. River brings the worst card. Villain bets $BET into $POT. Still profitable?",
  "Opponent makes a suspicious small bet on the river. Pot is $POT, bet is just $BET. What equity do you need?",
  "You're the short stack at a final table. Big blind shoves into your raise. Pot is $POT, call is $BET.",
  "Villain slow-played and now pots it on the river. Pot is $POT, bet is $BET. Are you getting a price to call?",
  "You rivered a weak pair. Tight player bets $BET into $POT. What's the minimum equity to continue?",
  "Aggressive reg fires every street. River bet is $BET into a pot of $POT. Do the pot odds justify calling?",
  "You called two streets with a gutshot and missed. Villain bets $BET, pot is $POT. Is a hero call mathematically sound?",
  "Tournament hand, middle stage. Hijack jams over your bet. Pot is $POT, call is $BET. What equity do you need?",
  "Blind vs blind, villain leads $BET into $POT on a dry river. Worth a call?",
  "You have a bluff-catcher on a four-straight board. Villain bets $BET into $POT. How often must they be bluffing?",
  "Late position battle. Villain check-raises the river to $BET. Pot was $POT before the raise. What's the math?",
  "Loose table, pot bloated preflop. River bet is $BET into $POT. Do the odds favor a call?",
  "You're out of position with middle pair. Villain bets $BET on the river. Pot is $POT. What equity do you need?",
  "Deep in a multi-table tournament. Big stack pressures with a $BET bet into $POT. What's the breakeven?",
  "Villain tanks and then fires $BET into $POT on the river. Do the pot odds say call?",
  "You turned two pair but the river completes a flush. Villain bets $BET into $POT. How strong must your hand be?",
  "Six-handed cash game. Button bets $BET into a $POT pot on the river. You're in the big blind with a marginal hand.",
  "First hand at a new table. Villain leads $BET into a pot of $POT on the river. What's the right price to call?",
];

function pickScenarioText() {
  return SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)];
}

// Scenario generators by difficulty
function easyScenario() {
  const potMin = 50, potMax = 300, potStep = 10;
  const betMin = 25, betMax = 150, betStep = 5;
  const pot = potMin + Math.floor(Math.random() * ((potMax - potMin) / potStep + 1)) * potStep;
  const maxBet = Math.min(betMax, pot);
  const bet = betMin + Math.floor(Math.random() * ((maxBet - betMin) / betStep + 1)) * betStep;
  return { pot, bet, narrative: pickScenarioText() };
}

function mediumScenario() {
  const pot = Math.floor(Math.random() * 280 + 20);
  const minBet = Math.max(8, Math.floor(pot * 0.2));
  const maxBet = Math.floor(pot * 1.5);
  const bet = Math.floor(Math.random() * (maxBet - minBet) + minBet);
  return { pot, bet, narrative: pickScenarioText() };
}

function hardScenario() {
  return mediumScenario();
}

function generateScenario(difficulty) {
  if (difficulty === 'easy') return easyScenario();
  if (difficulty === 'hard') return hardScenario();
  return mediumScenario();
}

function formatNarrative(narrative, pot, bet) {
  return narrative.replace('$POT', '$' + pot).replace('$BET', '$' + bet);
}

function calcPotOdds(pot, bet) {
  return (bet / (pot + bet)) * 100;
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

  function render() {
    if (awaitingNext) return;
    app.innerHTML = '';

    if (questionNum >= QUESTIONS_PER_SESSION) {
      renderSummary();
      return;
    }

    if (!currentScenario) nextQuestion();

    const narrativeHtml = formatNarrative(currentScenario.narrative, currentScenario.pot, currentScenario.bet);

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
        <div class="scenario-narrative">${narrativeHtml}</div>
        <div class="scenario-row">
          <div>
            <div class="scenario-label">Pot</div>
            <div class="scenario-value pot">$${currentScenario.pot}</div>
          </div>
          <div>
            <div class="scenario-label">Bet to Call</div>
            <div class="scenario-value bet">$${currentScenario.bet}</div>
          </div>
        </div>

        <div id="input-zone">
          <div class="input-area">
            <div class="input-row">
              <input type="number" inputmode="decimal" class="answer-input" id="answer" placeholder="Equity %" autocomplete="off">
              <span class="percent-sign">%</span>
            </div>
            <button class="submit-btn" id="submit">Go</button>
          </div>
        </div>

        <div id="feedback-zone"></div>
      </div>

      <button class="reference-toggle" id="ref-toggle">${referenceOpen ? 'Hide' : 'Show'} formula reference</button>
      <div class="card reference-card ${referenceOpen ? 'open' : ''}" id="ref-card">
        <h3>Pot Odds Formula</h3>
        <p>To find the <strong>minimum equity</strong> you need to call profitably:</p>
        <div class="formula-highlight">
          Required Equity = Call &divide; (Pot + Call)
        </div>
        <p><strong>Example:</strong></p>
        <ol>
          <li>Pot is <strong>$100</strong>, opponent bets <strong>$50</strong></li>
          <li>You must call <strong>$50</strong> into a total pot of <strong>$150</strong></li>
          <li>$50 &divide; ($100 + $50) = $50 &divide; $150 = <strong>33.3%</strong></li>
          <li>You need at least <strong>33.3% equity</strong> to call profitably</li>
        </ol>
      </div>
    `;

    app.innerHTML = html;
    bindEvents();

    if (!submitted) {
      const input = document.getElementById('answer');
      input.focus();
      if (difficulty === 'hard') startTimer();
    }
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
          nextQuestion();
          render();
        }
      });
    });

    document.getElementById('ref-toggle').addEventListener('click', () => {
      referenceOpen = !referenceOpen;
      render();
    });

    if (!submitted) {
      const input = document.getElementById('answer');
      const submitBtn = document.getElementById('submit');

      const doSubmit = () => {
        const val = parseFloat(input.value);
        if (isNaN(val)) return;
        handleAnswer(val);
      };

      submitBtn.addEventListener('click', doSubmit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doSubmit();
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

  function handleAnswer(userAnswer) {
    if (submitted) return;
    submitted = true;
    clearInterval(timerInterval);

    const elapsed = Date.now() - questionStartTime;
    const exact = calcPotOdds(currentScenario.pot, currentScenario.bet);
    const timedOut = userAnswer === null;
    const isCorrect = !timedOut && Math.abs(userAnswer - exact) <= TOLERANCE;

    questionNum++;
    sessionTotalTimeMs += elapsed;

    if (isCorrect) {
      sessionCorrect++;
      streak++;
      if (streak > bestStreakThisSession) bestStreakThisSession = streak;
    } else {
      streak = 0;
    }

    // Update lifetime stats
    lifetimeStats.totalAnswered++;
    if (isCorrect) lifetimeStats.totalCorrect++;
    lifetimeStats.totalTimeMs += elapsed;
    if (bestStreakThisSession > lifetimeStats.bestStreak) lifetimeStats.bestStreak = bestStreakThisSession;
    saveModuleStats(MODULE_ID, lifetimeStats);

    // Show feedback
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

    feedbackZone.innerHTML = `
      <div class="feedback">
        <div class="feedback-result ${resultClass}">${resultText}</div>
        <div class="feedback-formula">
          <strong>$${currentScenario.bet}</strong> &divide; ($${currentScenario.pot} + $${currentScenario.bet}) = <strong>${exact.toFixed(1)}%</strong>
          ${!timedOut ? `<br>Your answer: <strong>${userAnswer.toFixed(1)}%</strong>` : ''}
        </div>
      </div>
    `;

    awaitingNext = true;
    setTimeout(() => {
      submitted = false;
      awaitingNext = false;
      currentScenario = null;
      render();
    }, 1500);
  }

  function nextQuestion() {
    currentScenario = generateScenario(difficulty);
    questionStartTime = Date.now();
    submitted = false;
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
