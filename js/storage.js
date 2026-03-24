const STORAGE_KEY = 'poker-trainer';

export function loadData() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

export function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getModuleStats(moduleId) {
  const data = loadData();
  return data[moduleId] || { totalAnswered: 0, totalCorrect: 0, totalTimeMs: 0, bestStreak: 0 };
}

export function saveModuleStats(moduleId, stats) {
  const data = loadData();
  data[moduleId] = stats;
  saveData(data);
}