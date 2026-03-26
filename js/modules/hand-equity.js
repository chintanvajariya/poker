import { getModuleStats, saveModuleStats } from '../storage.js';
import { renderCards, generateDrawScenario } from '../cards.js';

const MODULE_ID = 'hand-equity';
const QUESTIONS_PER_SESSION = 10;
const HARD_TIME_LIMIT_MS = 12000;
const EQUITY_TOLERANCE = 4;

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
    const isFlop = Math.random() < 0.5;
    currentScenario = generateDrawScenario(isFlop);
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
        <span class="street-badge">${s.street}</span>

        <div class="hand-and-board">
          <div class="cards-section-label">Your Hand</div>
          <div class="cards-display">${renderCards(s.hole)}</div>
          <div class="cards-section-label">Board</div>
          <div class="cards-display">${renderCards(s.board)}</div>
        </div>

        <div id="input-zone">
          <div class="input-area">
            <div class="input-row">
              <input type="number" inputmode="decimal" class="answer-input" id="answer" placeholder="Your equity %" autocomplete="off">
              <span class="percent-sign">%</span>
            </div>
            <button class="submit-btn" id="submit">Go</button>
          </div>
        </div>

        <div id="feedback-zone"></div>
      </div>

      <button class="reference-toggle" id="ref-toggle">${referenceOpen ? 'Hide' : 'Show'} outs reference</button>
      <div class="card reference-card ${referenceOpen ? 'open' : ''}" id="ref-card">
        <h3>Common Draw Types</h3>
        <table class="ref-table">
          <tr><th>Draw</th><th>Outs</th><th>Flop Eq.</th><th>Turn Eq.</th></tr>
          <tr><td>Flush draw</td><td><strong>9</strong></td><td>36%</td><td>18%</td></tr>
          <tr><td>Open-ended straight</td><td><strong>8</strong></td><td>32%</td><td>16%</td></tr>
          <tr><td>Flush + OESD</td><td><strong>15</strong></td><td>60%</td><td>30%</td></tr>
          <tr><td>Gutshot straight</td><td><strong>4</strong></td><td>16%</td><td>8%</td></tr>
          <tr><td>Two pair to full house</td><td><strong>4</strong></td><td>16%</td><td>8%</td></tr>
          <tr><td>Pair to trips</td><td><strong>2</strong></td><td>8%</td><td>4%</td></tr>
        </table>
        <div class="formula-highlight" style="margin-top:14px">
          Flop: outs &times; 4 &nbsp;&bull;&nbsp; Turn: outs &times; 2
        </div>
      </div>
    `;

    app.innerHTML = html;
    bindEvents();

    if (!submitted) {
      document.getElementById('answer').focus();
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

  function handleAnswer(equityAnswer) {
    if (submitted) return;
    submitted = true;
    clearInterval(timerInterval);

    const elapsed = Date.now() - questionStartTime;
    const s = currentScenario;
    const timedOut = equityAnswer === null;
    const isCorrect = !timedOut && Math.abs(equityAnswer - s.equity) <= EQUITY_TOLERANCE;

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

    feedbackZone.innerHTML = `
      <div class="feedback">
        <div class="feedback-result ${resultClass}">${resultText}</div>
        <div class="feedback-formula">
          <strong>${s.drawName}</strong> &mdash; <strong>${s.outs} outs</strong><br>
          ${s.outs} &times; ${s.multiplier} = <strong>${s.equity}%</strong>
          ${!timedOut ? `<br>Your answer: <strong>${equityAnswer.toFixed(0)}%</strong>` : ''}
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
