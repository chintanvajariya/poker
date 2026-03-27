import { mount as mountPotOdds } from './modules/pot-odds.js';
import { mount as mountHandEquity } from './modules/hand-equity.js';
import { mount as mountEvDecision } from './modules/ev-decision.js';

// Module registry — add new modules here
const modules = [
  {
    id: 'pot-odds',
    name: 'Pot Odds Drills',
    description: 'Calculate the equity you need to call profitably',
    mount: mountPotOdds,
  },
  {
    id: 'hand-equity',
    name: 'Hand Equity Drills',
    description: 'Count outs and estimate equity using the rule of 2 and 4',
    mount: mountHandEquity,
  },
  {
    id: 'ev-decision',
    name: 'EV Decision',
    description: 'Combine equity and pot odds to make the right call or fold',
    mount: mountEvDecision,
  },
];

const app = document.getElementById('app');

function renderHome() {
  const moduleButtons = modules
    .map(
      (m) => `
      <button class="module-btn" data-module="${m.id}">
        ${m.name}
        <div class="module-desc">${m.description}</div>
      </button>`
    )
    .join('');

  app.innerHTML = `
    <div class="home">
      <h1>Poker Trainer</h1>
      <p>Sharpen your poker math</p>
      <div class="module-list">
        ${moduleButtons}
      </div>
      <div class="version">v0.2.2</div>
    </div>
  `;

  document.querySelectorAll('.module-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mod = modules.find((m) => m.id === btn.dataset.module);
      if (mod) mod.mount(app, renderHome);
    });
  });
}

// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

renderHome();
