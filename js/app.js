import { APP_CONFIG } from './config.js';
import {
  loadState,
  saveState,
  exportJSONBackup,
  encodeSyncCode,
  decodeSyncCode,
  needsWeeklyBackup
} from './storage.js';
import {
  isHabitDoneToday,
  toggleHabitToday,
  addHabit,
  deleteHabit,
  addTask,
  toggleTask,
  deleteTask
} from './tasks-habits.js';
import { addAgendaBlock, deleteAgendaBlock } from './agenda.js';
import { addAcademicNotice, deleteAcademicNotice } from './mail-classroom.js';
import { PRIVACY_NOTICE } from './legal.js';

let state = loadState();
let pomodoroSeconds = APP_CONFIG.defaultPomodoroMinutes * 60;
let pomodoroInterval = null;

const $ = (sel) => document.querySelector(sel);

function showToast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2600);
}

function escapeHTML(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function updateStats() {
  const totalHabits = state.habits.length;
  const doneHabits = state.habits.filter(isHabitDoneToday).length;
  const bestStreak = state.habits.reduce((max, h) => Math.max(max, h.streak || 0), 0);
  const pendingTasks = state.tasks.filter((t) => !t.done).length;

  $('#stat-habits').textContent = `${doneHabits} / ${totalHabits}`;
  $('#stat-streak').textContent = `${bestStreak} días`;
  $('#stat-tasks').textContent = `${pendingTasks}`;
  $('#stat-rate').textContent = totalHabits ? `${Math.round((doneHabits / totalHabits) * 100)}%` : '0%';
}

function renderHabits() {
  const list = $('#habit-list');
  if (!state.habits.length) {
    list.innerHTML = '<p class="habit-meta">Aún no tienes hábitos registrados. Agrega el primero arriba.</p>';
    return;
  }

  list.innerHTML = state.habits
    .map((h) => {
      const done = isHabitDoneToday(h);
      return `
        <div class="habit-item ${done ? 'completed' : ''}">
          <div class="habit-left">
            <button class="check-circle" data-action="toggle-habit" data-id="${h.id}" title="Marcar hoy">✓</button>
            <div>
              <div class="habit-name">${escapeHTML(h.name)}</div>
              <div class="habit-meta">${escapeHTML(h.category)}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="streak-badge">🔥 ${h.streak || 0}d</span>
            <button class="btn-danger-sm" data-action="delete-habit" data-id="${h.id}" title="Eliminar">✕</button>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderTasks() {
  const list = $('#task-list');
  if (!state.tasks.length) {
    list.innerHTML = '<p class="habit-meta">Sin tareas pendientes.</p>';
    return;
  }

  list.innerHTML = state.tasks
    .map(
      (t) => `
      <div class="task-item ${t.done ? 'done' : ''}">
        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
          <input type="checkbox" ${t.done ? 'checked' : ''} data-action="toggle-task" data-id="${t.id}" />
          <span class="task-text">${escapeHTML(t.title)}</span>
        </label>
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="priority-pill prio-${escapeHTML(t.priority)}">${escapeHTML(t.priority)}</span>
          <button class="btn-danger-sm" data-action="delete-task" data-id="${t.id}">✕</button>
        </div>
      </div>
    `
    )
    .join('');
}

function renderAgenda() {
  const list = $('#agenda-list');
  if (!state.agenda.length) {
    list.innerHTML = '<p class="habit-meta">No hay bloques programados hoy.</p>';
    return;
  }

  list.innerHTML = state.agenda
    .map(
      (a) => `
      <div class="timeline-item">
        <div style="display:flex;align-items:center;gap:12px;">
          <span class="timeline-hour">${escapeHTML(a.time)}</span>
          <span>${escapeHTML(a.title)}</span>
        </div>
        <button class="btn-danger-sm" data-action="delete-agenda" data-id="${a.id}">✕</button>
      </div>
    `
    )
    .join('');
}

function renderNotices() {
  const list = $('#notices-list');
  if (!state.notices.length) {
    list.innerHTML = '<p class="habit-meta">Sin avisos académicos registrados.</p>';
    return;
  }

  list.innerHTML = state.notices
    .map(
      (n) => `
      <div class="timeline-item">
        <div>
          <strong>[${escapeHTML(n.source)}]</strong> ${escapeHTML(n.subject)}
          <div class="habit-meta">${escapeHTML(n.date)}</div>
        </div>
        <button class="btn-danger-sm" data-action="delete-notice" data-id="${n.id}">✕</button>
      </div>
    `
    )
    .join('');
}

function renderAll() {
  saveState(state);
  updateStats();
  renderHabits();
  renderTasks();
  renderAgenda();
  renderNotices();
}

function updatePomodoroDisplay() {
  const mins = String(Math.floor(pomodoroSeconds / 60)).padStart(2, '0');
  const secs = String(pomodoroSeconds % 60).padStart(2, '0');
  $('#pomodoro-display').textContent = `${mins}:${secs}`;
}

function setupEvents() {
  // Navegación por pestañas
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.panel-section').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      $(`#panel-${btn.dataset.tab}`).classList.add('active');
    });
  });

  // Formulario hábitos
  $('#habit-form').addEventListener('submit', (e) => {
    e.preventDefault();
    addHabit(state, $('#habit-input').value, $('#habit-category').value);
    $('#habit-input').value = '';
    renderAll();
    showToast('Hábito agregado');
  });

  // Formulario tareas
  $('#task-form').addEventListener('submit', (e) => {
    e.preventDefault();
    addTask(state, $('#task-input').value, $('#task-priority').value);
    $('#task-input').value = '';
    renderAll();
    showToast('Tarea agregada');
  });

  // Formulario agenda
  $('#agenda-form').addEventListener('submit', (e) => {
    e.preventDefault();
    addAgendaBlock(state, $('#agenda-time').value, $('#agenda-title').value);
    $('#agenda-title').value = '';
    renderAll();
    showToast('Bloque agregado a la agenda');
  });

  // Formulario avisos
  $('#notice-form').addEventListener('submit', (e) => {
    e.preventDefault();
    addAcademicNotice(state, $('#notice-source').value, $('#notice-subject').value);
    $('#notice-subject').value = '';
    renderAll();
    showToast('Aviso guardado');
  });

  // Delegación global de acciones
  document.body.addEventListener('click', (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    const { action, id } = target.dataset;

    if (action === 'toggle-habit') {
      toggleHabitToday(state, id);
      renderAll();
    } else if (action === 'delete-habit') {
      deleteHabit(state, id);
      renderAll();
      showToast('Hábito eliminado');
    } else if (action === 'toggle-task') {
      toggleTask(state, id);
      renderAll();
    } else if (action === 'delete-task') {
      deleteTask(state, id);
      renderAll();
    } else if (action === 'delete-agenda') {
      deleteAgendaBlock(state, id);
      renderAll();
    } else if (action === 'delete-notice') {
      deleteAcademicNotice(state, id);
      renderAll();
    }
  });

  // Pomodoro
  $('#pomo-start').addEventListener('click', () => {
    if (pomodoroInterval) return;
    pomodoroInterval = setInterval(() => {
      if (pomodoroSeconds > 0) {
        pomodoroSeconds -= 1;
        updatePomodoroDisplay();
      } else {
        clearInterval(pomodoroInterval);
        pomodoroInterval = null;
        showToast('¡Sesión Pomodoro completada!');
      }
    }, 1000);
  });

  $('#pomo-pause').addEventListener('click', () => {
    clearInterval(pomodoroInterval);
    pomodoroInterval = null;
  });

  $('#pomo-reset').addEventListener('click', () => {
    clearInterval(pomodoroInterval);
    pomodoroInterval = null;
    pomodoroSeconds = APP_CONFIG.defaultPomodoroMinutes * 60;
    updatePomodoroDisplay();
  });

  // Respaldo JSON y sincronización
  $('#btn-export-json').addEventListener('click', () => {
    exportJSONBackup(state);
    showToast('Respaldo JSON descargado');
  });

  $('#btn-open-sync').addEventListener('click', () => {
    $('#sync-code-box').value = encodeSyncCode(state);
    $('#sync-modal').classList.add('open');
  });

  $('#btn-close-sync').addEventListener('click', () => {
    $('#sync-modal').classList.remove('open');
  });

  $('#btn-copy-sync').addEventListener('click', async () => {
    await navigator.clipboard.writeText($('#sync-code-box').value);
    showToast('Código copiado para sincronizar');
  });

  $('#btn-import-sync').addEventListener('click', () => {
    try {
      state = decodeSyncCode($('#sync-code-box').value);
      renderAll();
      $('#sync-modal').classList.remove('open');
      showToast('Datos sincronizados correctamente');
    } catch {
      showToast('Código de sincronización inválido');
    }
  });

  $('#privacy-text').textContent = PRIVACY_NOTICE.summary;
}

document.addEventListener('DOMContentLoaded', () => {
  renderAll();
  updatePomodoroDisplay();
  setupEvents();
  if (needsWeeklyBackup()) {
    showToast('Sugerencia: descarga tu respaldo semanal JSON');
  }
});
