import { APP_CONFIG } from './config.js';

export function getTodayISO() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now - offset).toISOString().split('T')[0];
}

const DEFAULT_STATE = {
  habits: [
    {
      id: 'h-1',
      name: 'Tomar 2L de agua',
      category: 'Salud',
      streak: 3,
      lastCompletedDate: null,
      history: []
    },
    {
      id: 'h-2',
      name: 'Repasar programación / redes 30 min',
      category: 'Estudio',
      streak: 5,
      lastCompletedDate: null,
      history: []
    },
    {
      id: 'h-3',
      name: 'Dormir antes de las 11:30 PM',
      category: 'Descanso',
      streak: 2,
      lastCompletedDate: null,
      history: []
    }
  ],
  tasks: [
    { id: 't-1', title: 'Subir proyecto BrisaPlan a repositorio', priority: 'alta', done: false },
    { id: 't-2', title: 'Revisar apuntes de clase', priority: 'media', done: false }
  ],
  agenda: [
    { id: 'a-1', time: '08:00', title: 'Bloque de enfoque / clases' },
    { id: 'a-2', time: '16:00', title: 'Práctica de desarrollo y hábitos' }
  ],
  notices: [
    { id: 'n-1', source: 'Classroom', subject: 'Entrega de proyecto web modular', date: getTodayISO() }
  ]
};

export function loadState() {
  try {
    const raw = localStorage.getItem(APP_CONFIG.storageKey);
    if (!raw) {
      saveState(DEFAULT_STATE);
      return structuredClone(DEFAULT_STATE);
    }
    const parsed = JSON.parse(raw);
    return {
      habits: Array.isArray(parsed.habits) ? parsed.habits : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      agenda: Array.isArray(parsed.agenda) ? parsed.agenda : [],
      notices: Array.isArray(parsed.notices) ? parsed.notices : []
    };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

export function saveState(state) {
  localStorage.setItem(APP_CONFIG.storageKey, JSON.stringify(state));
}

export function exportJSONBackup(state) {
  const payload = {
    app: APP_CONFIG.appName,
    version: APP_CONFIG.version,
    exportedAt: new Date().toISOString(),
    data: state
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `BrisaPlan_Respaldo_${getTodayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  localStorage.setItem(APP_CONFIG.weeklyBackupKey, String(Date.now()));
}

export function encodeSyncCode(state) {
  const json = JSON.stringify(state);
  return btoa(unescape(encodeURIComponent(json)));
}

export function decodeSyncCode(code) {
  const json = decodeURIComponent(escape(atob(code.trim())));
  const parsed = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.habits)) {
    throw new Error('Código inválido');
  }
  return parsed;
}

export function needsWeeklyBackup() {
  const last = Number(localStorage.getItem(APP_CONFIG.weeklyBackupKey) || 0);
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  return Date.now() - last > sevenDaysMs;
}
