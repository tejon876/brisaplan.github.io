// BrisaPlan v8 - Lógica principal modular
// Configuración Firebase (reemplaza apiKey con la de tu proyecto brisaplan-e0466 si deseas sincronización cloud)
const firebaseConfig = {
  apiKey: "",
  authDomain: "brisaplan-e0466.firebaseapp.com",
  projectId: "brisaplan-e0466",
  storageBucket: "brisaplan-e0466.appspot.com"
};

const STORAGE_KEY = 'brisaplan_v8_state';

const defaultState = {
  darkMode: true,
  agenda: [
    { id: 1, title: 'Clases Ingeniería TI', day: 'Lunes', time: '07:00', type: 'permanent', expiresAt: null, color: '#93c5fd' }
  ],
  tasks: [
    { id: 1, title: 'Revisar configuración de red', priority: 'Alta', color: '#fed7aa', done: false }
  ],
  habits: [
    { id: 1, name: 'Práctica de idiomas', streak: 3, lastDone: null }
  ],
  mails: [
    { id: 1, account: 'personal@gmail.com', subject: 'Confirmación de repositorio GitHub', category: 'Importante' }
  ]
};

let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultState;

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  updateWidget();
}

// --- Tema Oscuro (#000000) / Claro ---
const themeToggle = document.getElementById('themeToggle');
function applyTheme() {
  if (state.darkMode) {
    document.body.classList.add('dark-mode');
    themeToggle.textContent = 'Modo Claro';
  } else {
    document.body.classList.remove('dark-mode');
    themeToggle.textContent = 'Modo Oscuro';
  }
}
themeToggle.addEventListener('click', () => {
  state.darkMode = !state.darkMode;
  applyTheme();
  saveState();
});
applyTheme();

// --- Navegación inferior ---
document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.view-section').forEach((s) => s.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.target).classList.add('active');
  });
});

// --- Agenda Base y Ajustes Temporales ---
function renderAgenda() {
  const list = document.getElementById('agendaList');
  const now = Date.now();
  state.agenda = state.agenda.filter((item) => !item.expiresAt || item.expiresAt > now);
  list.innerHTML = '';

  state.agenda.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'list-item';
    div.style.borderLeftColor = item.color || '#93c5fd';
    const tag = item.type === 'override'
      ? `Temporal (expira ${new Date(item.expiresAt).toLocaleDateString()})`
      : 'Base semanal';

    div.innerHTML = `
      <div>
        <strong>${item.day} • ${item.time}</strong> — ${item.title}
        <div class="item-meta">${tag}</div>
      </div>
      <button class="btn" data-del-agenda="${item.id}">Quitar</button>
    `;
    list.appendChild(div);
  });

  list.querySelectorAll('[data-del-agenda]').forEach((b) => {
    b.addEventListener('click', () => {
      const id = Number(b.dataset.delAgenda);
      state.agenda = state.agenda.filter((a) => a.id !== id);
      saveState();
      renderAgenda();
    });
  });
}

document.getElementById('addAgendaBtn').addEventListener('click', () => {
  const title = document.getElementById('agendaTitle').value.trim();
  if (!title) return;
  const day = document.getElementById('agendaDay').value;
  const time = document.getElementById('agendaTime').value;
  const type = document.getElementById('agendaType').value;
  const days = Number(document.getElementById('overrideDays').value) || 3;
  const color = document.getElementById('agendaColor').value;

  const expiresAt = type === 'override' ? Date.now() + days * 86400000 : null;
  state.agenda.push({ id: Date.now(), title, day, time, type, expiresAt, color });
  document.getElementById('agendaTitle').value = '';
  saveState();
  renderAgenda();
});

// --- Tareas Prioritarias + Pomodoro ---
let pomoSeconds = 25 * 60;
let pomoTimer = null;

function updatePomoUI() {
  const m = String(Math.floor(pomoSeconds / 60)).padStart(2, '0');
  const s = String(pomoSeconds % 60).padStart(2, '0');
  document.getElementById('pomoDisplay').textContent = `${m}:${s}`;
}

document.getElementById('pomoStart').addEventListener('click', () => {
  if (pomoTimer) return;
  document.getElementById('pomoStatus').textContent = 'En curso';
  pomoTimer = setInterval(() => {
    if (pomoSeconds > 0) {
      pomoSeconds--;
      updatePomoUI();
    } else {
      clearInterval(pomoTimer);
      pomoTimer = null;
      document.getElementById('pomoStatus').textContent = 'Completado';
    }
  }, 1000);
});

document.getElementById('pomoPause').addEventListener('click', () => {
  clearInterval(pomoTimer);
  pomoTimer = null;
  document.getElementById('pomoStatus').textContent = 'Pausado';
});

document.getElementById('pomoReset').addEventListener('click', () => {
  clearInterval(pomoTimer);
  pomoTimer = null;
  pomoSeconds = 25 * 60;
  updatePomoUI();
  document.getElementById('pomoStatus').textContent = 'Listo';
});

function renderTasks() {
  const list = document.getElementById('taskList');
  list.innerHTML = '';
  state.tasks.forEach((t) => {
    const div = document.createElement('div');
    div.className = `list-item ${t.done ? 'completed' : ''}`;
    div.style.borderLeftColor = t.color || '#fed7aa';
    div.innerHTML = `
      <div style="cursor:pointer;" data-toggle-task="${t.id}">
        <span><strong>[${t.priority}]</strong> ${t.title}</span>
      </div>
      <button class="btn" data-del-task="${t.id}">Borrar</button>
    `;
    list.appendChild(div);
  });

  list.querySelectorAll('[data-toggle-task]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = Number(el.dataset.toggleTask);
      const task = state.tasks.find((x) => x.id === id);
      if (task) task.done = !task.done;
      saveState();
      renderTasks();
    });
  });

  list.querySelectorAll('[data-del-task]').forEach((b) => {
    b.addEventListener('click', () => {
      const id = Number(b.dataset.delTask);
      state.tasks = state.tasks.filter((x) => x.id !== id);
      saveState();
      renderTasks();
    });
  });
}

document.getElementById('addTaskBtn').addEventListener('click', () => {
  const title = document.getElementById('taskInput').value.trim();
  if (!title) return;
  const priority = document.getElementById('taskPriority').value;
  const color = document.getElementById('taskColor').value;
  state.tasks.push({ id: Date.now(), title, priority, color, done: false });
  document.getElementById('taskInput').value = '';
  saveState();
  renderTasks();
});

// --- Hábitos y Rachas ---
function renderHabits() {
  const grid = document.getElementById('habitGrid');
  grid.innerHTML = '';
  const todayStr = new Date().toISOString().slice(0, 10);

  state.habits.forEach((h) => {
    const doneToday = h.lastDone === todayStr;
    const card = document.createElement('div');
    card.className = 'habit-card';
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <strong>${h.name}</strong>
        <span class="badge">${h.streak} días</span>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn ${doneToday ? '' : 'btn-primary'}" data-check-habit="${h.id}">
          ${doneToday ? 'Cumplido hoy' : 'Marcar hoy'}
        </button>
        <button class="btn" data-del-habit="${h.id}">Quitar</button>
      </div>
    `;
    grid.appendChild(card);
  });

  grid.querySelectorAll('[data-check-habit]').forEach((b) => {
    b.addEventListener('click', () => {
      const id = Number(b.dataset.checkHabit);
      const habit = state.habits.find((x) => x.id === id);
      if (habit && habit.lastDone !== todayStr) {
        habit.streak += 1;
        habit.lastDone = todayStr;
        saveState();
        renderHabits();
      }
    });
  });

  grid.querySelectorAll('[data-del-habit]').forEach((b) => {
    b.addEventListener('click', () => {
      const id = Number(b.dataset.delHabit);
      state.habits = state.habits.filter((x) => x.id !== id);
      saveState();
      renderHabits();
    });
  });
}

document.getElementById('addHabitBtn').addEventListener('click', () => {
  const name = document.getElementById('habitInput').value.trim();
  if (!name) return;
  state.habits.push({ id: Date.now(), name, streak: 0, lastDone: null });
  document.getElementById('habitInput').value = '';
  saveState();
  renderHabits();
});

// --- Organizador Multi-Cuenta de Correo ---
function renderMails() {
  const list = document.getElementById('mailList');
  const hideSpam = document.getElementById('hideSpamCheck').checked;
  list.innerHTML = '';

  state.mails
    .filter((m) => !(hideSpam && m.category === 'Spam'))
    .forEach((m) => {
      const div = document.createElement('div');
      div.className = 'list-item';
      div.innerHTML = `
        <div>
          <strong>${m.subject}</strong>
          <div class="item-meta">${m.account} • Categoría: ${m.category}</div>
        </div>
        <button class="btn" data-del-mail="${m.id}">Archivar</button>
      `;
      list.appendChild(div);
    });

  list.querySelectorAll('[data-del-mail]').forEach((b) => {
    b.addEventListener('click', () => {
      const id = Number(b.dataset.delMail);
      state.mails = state.mails.filter((x) => x.id !== id);
      saveState();
      renderMails();
    });
  });
}

document.getElementById('hideSpamCheck').addEventListener('change', renderMails);
document.getElementById('addMailBtn').addEventListener('click', () => {
  const account = document.getElementById('mailAccount').value.trim() || 'principal@gmail.com';
  const subject = document.getElementById('mailSubject').value.trim();
  if (!subject) return;
  const category = document.getElementById('mailCategory').value;
  state.mails.push({ id: Date.now(), account, subject, category });
  document.getElementById('mailSubject').value = '';
  saveState();
  renderMails();
});

// --- Widget y Derechos ARCO ---
function updateWidget() {
  const pending = state.tasks.filter((t) => !t.done).length;
  const activeHabits = state.habits.length;
  document.getElementById('widgetSummary').textContent =
    `Tareas pendientes: ${pending} • Hábitos activos: ${activeHabits} • Bloques en agenda: ${state.agenda.length}`;
}

const arcoModal = document.getElementById('arcoModal');
document.getElementById('openArcoBtn').addEventListener('click', () => arcoModal.classList.add('open'));
document.getElementById('closeArcoBtn').addEventListener('click', () => arcoModal.classList.remove('open'));

document.getElementById('exportDataBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'brisaplan-datos-arco.json';
  a.click();
});

document.getElementById('wipeDataBtn').addEventListener('click', () => {
  localStorage.removeItem(STORAGE_KEY);
  state = JSON.parse(JSON.stringify(defaultState));
  saveState();
  renderAgenda();
  renderTasks();
  renderHabits();
  renderMails();
  arcoModal.classList.remove('open');
});

document.getElementById('authBtn').addEventListener('click', () => {
  alert('Sincronización configurada para el dominio brisaplan-e0466.firebaseapp.com. Añade tu apiKey en app.js para activar Google Sign-In en producción.');
});

// Inicializar Service Worker PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

renderAgenda();
renderTasks();
renderHabits();
renderMails();
updateWidget();
