import { CONFIG } from './config.js';
import {
  todayISO,
  createCleanState,
  registerPasswordAccount,
  authenticatePasswordAccount,
  authenticateGoogleAccount,
  loadEncryptedVault,
  saveEncryptedVault,
  loadActiveSession,
  saveActiveSession,
  clearSessionOnly,
  deleteUserAccountAndVault,
  exportUserJSON
} from './storage.js';
import {
  isHabitDoneToday,
  addHabit,
  toggleHabit,
  removeHabit,
  addTask,
  updateTaskColor,
  toggleTask,
  removeTask
} from './tasks-habits.js';
import {
  addAgendaItem,
  shiftAgendaTime,
  moveAgendaTomorrow,
  removeAgendaItem
} from './agenda.js';
import {
  connectMailAccount,
  addMessage,
  cleanAllSpam,
  toggleMessageRead,
  removeMessage
} from './mail-classroom.js';
import { ARCO_INFO, TUTORIAL_STEPS } from './legal.js';

let state = createCleanState();
let session = loadActiveSession();
let selectedTaskColor = CONFIG.taskPalette[0];
let activePomoTaskId = null;
let pomoSeconds = CONFIG.defaultPomodoroSec;
let pomoTimer = null;
let tutorialIndex = 0;
let authFormMode = 'login'; // 'login' | 'register'

const $ = (s) => document.querySelector(s);

function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3400);
}

function esc(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/* Service Worker & Notificaciones seguras (compatible Android Chrome + Desktop) */
let swReg = null;
async function initServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      swReg = await navigator.serviceWorker.register('./sw.js');
    } catch {}
  }
}

async function showSafeNotification(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    if (swReg && swReg.showNotification) {
      await swReg.showNotification(title, { body });
    } else {
      new Notification(title, { body });
    }
  } catch {
    // Fallback silencioso en navegadores móviles sin SW activo
  }
}

/* Tema Oscuro */
function applyTheme(dark) {
  document.body.classList.toggle('dark-mode', dark);
  localStorage.setItem(CONFIG.themeKey, dark ? 'dark' : 'light');
  document.querySelectorAll('[data-toggle-theme]').forEach((btn) => {
    btn.textContent = dark ? 'Modo claro' : 'Modo oscuro';
  });
}

/* Decodificar JWT oficial de Google Identity Services */
function parseJwtPayload(token) {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = decodeURIComponent(
    atob(base64)
      .split('')
      .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join('')
  );
  return JSON.parse(jsonPayload);
}

async function openUnlockedSession(newSession) {
  session = newSession;
  saveActiveSession(session);
  state = await loadEncryptedVault(session);
  connectMailAccount(state, session.email, session.provider);
  await updateAuthView();
  toast(`Bóveda desbloqueada para ${session.name}`);
}

/* Inicializar botón oficial de Google Identity Services */
function initGoogleIdentityServices() {
  const target = $('#google-signin-button');
  if (!target) return;

  const tryRender = () => {
    if (window.google?.accounts?.id) {
      window.google.accounts.id.initialize({
        client_id: CONFIG.googleClientId,
        callback: async (response) => {
          try {
            const payload = parseJwtPayload(response.credential);
            const googleSess = await authenticateGoogleAccount({
              email: payload.email,
              name: payload.name || payload.given_name,
              picture: payload.picture,
              sub: payload.sub
            });
            await openUnlockedSession(googleSess);
          } catch {
            toast('No se pudo validar la credencial de Google.');
          }
        },
        auto_select: false
      });

      target.innerHTML = '';
      window.google.accounts.id.renderButton(target, {
        theme: document.body.classList.contains('dark-mode') ? 'filled_black' : 'outline',
        size: 'large',
        type: 'standard',
        shape: 'pill',
        text: 'continue_with',
        logo_alignment: 'left',
        width: 340
      });
      return true;
    }
    return false;
  };

  if (!tryRender()) {
    let attempts = 0;
    const poll = setInterval(() => {
      attempts += 1;
      if (tryRender() || attempts > 25) {
        clearInterval(poll);
      }
    }, 200);
  }
}

/* Control estricto de bloqueo/desbloqueo */
async function updateAuthView() {
  if (session && session.email && session.secret) {
    document.body.classList.remove('auth-locked');
    $('#login-gate').style.display = 'none';
    $('#app-shell').style.display = 'block';

    const badge = $('#header-avatar');
    if (badge) {
      badge.innerHTML = session.picture
        ? `<img src="${esc(session.picture)}" alt="${esc(session.name)}" />`
        : esc((session.name?.[0] || 'B').toUpperCase());
    }
    const userLabel = $('#header-user-email');
    if (userLabel) userLabel.textContent = `${session.email} · Cifrado`;
    await renderAll();
    if (!state.tutorialSeen) {
      openTutorial();
    }
  } else {
    document.body.classList.add('auth-locked');
    $('#login-gate').style.display = 'flex';
    $('#app-shell').style.display = 'none';
    initGoogleIdentityServices();
  }
}

/* Color Swatches */
function renderColorSwatches() {
  const container = $('#task-color-swatches');
  if (!container) return;
  container.innerHTML =
    CONFIG.taskPalette
      .map(
        (hex) =>
          `<button type="button" class="swatch-btn ${selectedTaskColor === hex ? 'selected' : ''}" style="background:${hex}" data-pick-color="${hex}" aria-label="Color ${hex}"></button>`
      )
      .join('') +
    `<input type="color" id="custom-task-color" class="custom-color-input" value="${selectedTaskColor}" title="Elegir color personalizado" />`;
}

/* Renders */
function renderStats() {
  const totalHabits = state.habits.length;
  const doneHabits = state.habits.filter(isHabitDoneToday).length;
  const bestStreak = state.habits.reduce((m, h) => Math.max(m, h.streak || 0), 0);
  const pendingTasks = state.tasks.filter((t) => !t.done).length;

  $('#stat-habits').textContent = `${doneHabits} / ${totalHabits}`;
  $('#stat-streak').textContent = `${bestStreak} días`;
  $('#stat-rate').textContent = totalHabits ? `${Math.round((doneHabits / totalHabits) * 100)}%` : '0%';
  $('#stat-pending').textContent = `${pendingTasks}`;
}

function renderHoy() {
  const hoyHabits = $('#hoy-habits-list');
  hoyHabits.innerHTML = state.habits.length
    ? state.habits
        .map((h) => {
          const done = isHabitDoneToday(h);
          return `
            <div class="item-row ${done ? 'item-done' : ''}">
              <div style="display:flex;align-items:center;gap:10px;">
                <button class="check-circle ${done ? 'checked' : ''}" data-act="toggle-habit" data-id="${h.id}">✓</button>
                <div>
                  <div class="item-title">${esc(h.name)}</div>
                  <div class="item-sub">${esc(h.category)}</div>
                </div>
              </div>
              <span class="streak-pill">🔥 ${h.streak || 0}d</span>
            </div>`;
        })
        .join('')
    : '<div class="empty-state">Aún no tienes hábitos. Agrega el primero en Tareas y Hábitos.</div>';

  const pending = state.tasks.filter((t) => !t.done);
  $('#hoy-tasks-list').innerHTML = pending.length
    ? pending
        .slice(0, 5)
        .map(
          (t) => `
          <div class="item-row task-color-bar" style="border-left-color:${esc(t.color || '#4A93C6')}">
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="checkbox" data-act="toggle-task" data-id="${t.id}" />
              <span class="item-title">${esc(t.title)}</span>
            </label>
            <span class="item-sub">${esc(t.priority)}</span>
          </div>`
        )
        .join('')
    : '<div class="empty-state">Sin pendientes activos. Usa "+ Tarea rápida" para añadir uno.</div>';

  const todayBlocks = state.agenda.filter((a) => a.date === todayISO());
  $('#hoy-agenda-list').innerHTML = todayBlocks.length
    ? todayBlocks
        .slice(0, 4)
        .map(
          (a) => `
          <div class="item-row task-color-bar" style="border-left-color:${esc(a.color || '#4A93C6')}">
            <div>
              <div class="item-title">${esc(a.title)}</div>
              <div class="item-sub">${esc(a.time)}</div>
            </div>
          </div>`
        )
        .join('')
    : '<div class="empty-state">No hay bloques programados para hoy.</div>';
}

function renderAgenda() {
  const list = $('#agenda-full-list');
  list.innerHTML = state.agenda.length
    ? state.agenda
        .map(
          (a) => `
          <div class="item-row task-color-bar" style="border-left-color:${esc(a.color || '#4A93C6')};flex-direction:column;align-items:stretch;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
              <div>
                <div class="item-title">${esc(a.time)} · ${esc(a.title)}</div>
                <div class="item-sub">${esc(a.date)}</div>
              </div>
              <div style="display:flex;align-items:center;gap:6px;">
                <button class="btn btn-soft btn-xs" data-act="toggle-adjust" data-id="${a.id}">Ajustar</button>
                <button class="btn-icon-del" data-act="del-agenda" data-id="${a.id}">✕</button>
              </div>
            </div>
            <div id="adj-${a.id}" class="adjust-drawer">
              <button class="btn btn-outline btn-xs" data-act="shift-agenda" data-id="${a.id}" data-min="-30">-30m</button>
              <button class="btn btn-outline btn-xs" data-act="shift-agenda" data-id="${a.id}" data-min="30">+30m</button>
              <button class="btn btn-outline btn-xs" data-act="shift-agenda" data-id="${a.id}" data-min="60">+1h</button>
              <button class="btn btn-peach btn-xs" data-act="tomorrow-agenda" data-id="${a.id}">Pasar a mañana</button>
            </div>
          </div>`
        )
        .join('')
    : '<div class="empty-state">Tu agenda está vacía. Programa tu primer bloque arriba.</div>';
}

function renderTasksAndHabits() {
  const tList = $('#tasks-full-list');
  tList.innerHTML = state.tasks.length
    ? state.tasks
        .map(
          (t) => `
          <div class="item-row task-color-bar ${t.done ? 'item-done' : ''}" style="border-left-color:${esc(t.color || '#4A93C6')}">
            <div style="display:flex;align-items:center;gap:10px;">
              <input type="checkbox" ${t.done ? 'checked' : ''} data-act="toggle-task" data-id="${t.id}" />
              <div>
                <div class="item-title">${esc(t.title)}</div>
                <div class="item-sub">Prioridad ${esc(t.priority)}</div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
              <input type="color" value="${esc(t.color || '#4A93C6')}" data-recolor-task="${t.id}" title="Cambiar color" style="width:22px;height:22px;border:none;background:none;cursor:pointer;" />
              <button class="btn btn-soft btn-xs" data-act="focus-task" data-id="${t.id}">Enfocar</button>
              <button class="btn-icon-del" data-act="del-task" data-id="${t.id}">✕</button>
            </div>
          </div>`
        )
        .join('')
    : '<div class="empty-state">Sin tareas registradas. Crea una arriba y asígnale un color.</div>';

  const hList = $('#habits-full-list');
  hList.innerHTML = state.habits.length
    ? state.habits
        .map((h) => {
          const done = isHabitDoneToday(h);
          return `
            <div class="item-row ${done ? 'item-done' : ''}">
              <div style="display:flex;align-items:center;gap:10px;">
                <button class="check-circle ${done ? 'checked' : ''}" data-act="toggle-habit" data-id="${h.id}">✓</button>
                <div>
                  <div class="item-title">${esc(h.name)}</div>
                  <div class="item-sub">${esc(h.category)} · ${h.history?.length || 0} días completados</div>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                <span class="streak-pill">🔥 ${h.streak || 0}d</span>
                <button class="btn-icon-del" data-act="del-habit" data-id="${h.id}">✕</button>
              </div>
            </div>`;
        })
        .join('')
    : '<div class="empty-state">No hay hábitos creados todavía.</div>';

  const focusedTask = state.tasks.find((t) => t.id === activePomoTaskId);
  $('#pomo-task-label').textContent = focusedTask ? `Enfocando: ${focusedTask.title}` : 'Sesión libre de enfoque';
}

function renderMail() {
  const filter = $('#mail-filter-account')?.value || 'all';
  const select = $('#mail-filter-account');
  if (select) {
    const current = select.value;
    select.innerHTML =
      '<option value="all">Todas las cuentas</option>' +
      state.mailAccounts.map((a) => `<option value="${esc(a.email)}">${esc(a.email)} (${esc(a.provider)})</option>`).join('');
    select.value = state.mailAccounts.some((a) => a.email === current) ? current : 'all';
  }

  const accContainer = $('#connected-accounts-list');
  accContainer.innerHTML = state.mailAccounts.length
    ? state.mailAccounts
        .map((a) => `<span class="btn btn-soft btn-xs">${esc(a.provider)}: ${esc(a.email)}</span>`)
        .join(' ')
    : '<span class="item-sub">Sin cuentas vinculadas aún.</span>';

  const filtered = state.messages.filter((m) => (filter === 'all' ? true : m.account === filter));
  const list = $('#mail-messages-list');
  list.innerHTML = filtered.length
    ? filtered
        .map(
          (m) => `
          <div class="item-row" style="${m.isSpam ? 'border-color:#F43F5E;' : ''}">
            <div>
              <div class="item-title">${m.isSpam ? '[Spam] ' : ''}${esc(m.subject)}</div>
              <div class="item-sub">${esc(m.sender)} · ${esc(m.account)}</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
              <button class="btn btn-outline btn-xs" data-act="read-mail" data-id="${m.id}">${m.read ? 'Leído' : 'Marcar leído'}</button>
              <button class="btn-icon-del" data-act="del-mail" data-id="${m.id}">✕</button>
            </div>
          </div>`
        )
        .join('')
    : '<div class="empty-state">Bandeja vacía. Vincula un correo o registra un mensaje importante.</div>';
}

function renderMiEspacio() {
  $('#backup-days-input').value = state.backupIntervalDays || 7;
  $('#notif-status-text').textContent = state.notificationsEnabled ? 'Activadas en este dispositivo' : 'Desactivadas';
  $('#w-chk-tasks').checked = !!state.selectedWidgets.tasksAgenda;
  $('#w-chk-mail').checked = !!state.selectedWidgets.mail;
  $('#w-chk-habits').checked = !!state.selectedWidgets.habits;
  $('#arco-legal-text').textContent = ARCO_INFO.description;
  $('#paypal-donate-btn').href = CONFIG.paypalUrl;
}

async function renderAll() {
  await saveEncryptedVault(state, session);
  renderColorSwatches();
  renderStats();
  renderHoy();
  renderAgenda();
  renderTasksAndHabits();
  renderMail();
  renderMiEspacio();
}

function updatePomodoroText() {
  const m = String(Math.floor(pomoSeconds / 60)).padStart(2, '0');
  const s = String(pomoSeconds % 60).padStart(2, '0');
  $('#pomo-clock').textContent = `${m}:${s}`;
}

function openTutorial() {
  tutorialIndex = 0;
  renderTutorialStep();
  $('#tutorial-modal').classList.add('open');
}

function renderTutorialStep() {
  const step = TUTORIAL_STEPS[tutorialIndex];
  $('#tut-title').textContent = step.title;
  $('#tut-body').textContent = step.text;
  $('#tut-counter').textContent = `${tutorialIndex + 1} / ${TUTORIAL_STEPS.length}`;
  $('#tut-next').textContent = tutorialIndex === TUTORIAL_STEPS.length - 1 ? 'Finalizar' : 'Siguiente';
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn, .mobile-nav-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tabName);
  });
  document.querySelectorAll('.view-panel').forEach((p) => {
    p.classList.toggle('active', p.id === `panel-${tabName}`);
  });
}

function setAuthFormMode(mode) {
  authFormMode = mode;
  $('#tab-mode-login').classList.toggle('active', mode === 'login');
  $('#tab-mode-register').classList.toggle('active', mode === 'register');
  $('#confirm-pw-wrap').style.display = mode === 'register' ? 'flex' : 'none';
  $('#login-password-confirm').required = mode === 'register';
  $('#btn-auth-submit').textContent = mode === 'register' ? 'Crear cuenta cifrada y entrar' : 'Desbloquear y entrar';
}

function setupEvents() {
  document.querySelectorAll('[data-toggle-theme]').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyTheme(!document.body.classList.contains('dark-mode'));
      if (!session) initGoogleIdentityServices();
    });
  });

  // Cambio entre Iniciar sesión y Crear cuenta con contraseña cifrada
  $('#tab-mode-login').addEventListener('click', () => setAuthFormMode('login'));
  $('#tab-mode-register').addEventListener('click', () => setAuthFormMode('register'));

  // Mostrar / ocultar contraseña
  $('#toggle-pw-vis').addEventListener('click', () => {
    const inp = $('#login-password-input');
    const isHidden = inp.type === 'password';
    inp.type = isHidden ? 'text' : 'password';
    $('#toggle-pw-vis').textContent = isHidden ? 'Ocultar' : 'Mostrar';
  });

  // Envío de formulario Correo + Contraseña cifrada (PBKDF2 + AES-GCM)
  $('#login-email-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#login-email-input').value.trim().toLowerCase();
    const password = $('#login-password-input').value;
    const confirmPw = $('#login-password-confirm').value;
    const btn = $('#btn-auth-submit');

    if (password.length < 8) {
      toast('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (authFormMode === 'register' && password !== confirmPw) {
      toast('Las contraseñas no coinciden.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Cifrando credencial...';

    try {
      const unlockedSession =
        authFormMode === 'register'
          ? await registerPasswordAccount(email, password)
          : await authenticatePasswordAccount(email, password);

      $('#login-password-input').value = '';
      $('#login-password-confirm').value = '';
      await openUnlockedSession(unlockedSession);
    } catch (err) {
      toast(err.message || 'No se pudo autenticar.');
    } finally {
      btn.disabled = false;
      setAuthFormMode(authFormMode);
    }
  });

  // Navegación
  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Modal Tarea Rápida
  document.querySelectorAll('[data-open-quick-task]').forEach((btn) => {
    btn.addEventListener('click', () => {
      $('#quick-task-modal').classList.add('open');
      $('#quick-task-title').focus();
    });
  });

  $('#close-quick-task').addEventListener('click', () => {
    $('#quick-task-modal').classList.remove('open');
  });

  $('#quick-task-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = $('#quick-task-title').value;
    const priority = $('#quick-task-prio').value;
    const color = $('#quick-task-color').value;
    const alsoAgenda = $('#quick-task-agenda-check').checked;
    const time = $('#quick-task-time').value || '09:00';

    addTask(state, title, priority, color);
    if (alsoAgenda) {
      addAgendaItem(state, time, title, color, todayISO());
    }
    $('#quick-task-title').value = '';
    $('#quick-task-modal').classList.remove('open');
    await renderAll();
    toast('Tarea agregada');
  });

  // Formulario Agenda
  $('#agenda-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    addAgendaItem(
      state,
      $('#agenda-time').value,
      $('#agenda-title').value,
      $('#agenda-color').value,
      $('#agenda-date').value || todayISO()
    );
    $('#agenda-title').value = '';
    await renderAll();
    toast('Bloque agregado a la agenda');
  });

  // Formulario Tareas
  $('#task-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    addTask(state, $('#task-title-input').value, $('#task-prio-input').value, selectedTaskColor);
    $('#task-title-input').value = '';
    await renderAll();
    toast('Tarea guardada');
  });

  // Formulario Hábitos
  $('#habit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    addHabit(state, $('#habit-title-input').value, $('#habit-cat-input').value);
    $('#habit-title-input').value = '';
    await renderAll();
    toast('Hábito creado');
  });

  // Vincular correo con permiso en Correos
  $('#btn-connect-google-mail').addEventListener('click', async () => {
    const email = prompt('Escribe el correo que deseas vincular a esta bóveda:');
    if (!email || !email.includes('@')) return;
    const approved = confirm(`¿Aprobar permiso de lectura y organización de bandeja para ${email.trim()}?`);
    if (!approved) return;
    connectMailAccount(state, email, 'Correo');
    await renderAll();
    toast('Cuenta vinculada con permiso aprobado');
  });

  $('#mail-add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    addMessage(state, {
      account: $('#mail-filter-account').value === 'all' ? state.mailAccounts[0]?.email : $('#mail-filter-account').value,
      sender: $('#mail-sender').value,
      subject: $('#mail-subject').value
    });
    $('#mail-sender').value = '';
    $('#mail-subject').value = '';
    await renderAll();
    toast('Mensaje registrado en bandeja');
  });

  $('#mail-filter-account').addEventListener('change', renderMail);

  $('#btn-clean-spam').addEventListener('click', async () => {
    const removed = cleanAllSpam(state);
    await renderAll();
    toast(removed ? `Se eliminaron ${removed} correos spam` : 'No hay spam por limpiar');
  });

  // Delegación global
  document.body.addEventListener('click', async (e) => {
    const swatch = e.target.closest('[data-pick-color]');
    if (swatch) {
      selectedTaskColor = swatch.dataset.pickColor;
      renderColorSwatches();
      return;
    }

    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const { act, id } = btn.dataset;

    if (act === 'toggle-habit') {
      toggleHabit(state, id);
      await renderAll();
    } else if (act === 'del-habit') {
      removeHabit(state, id);
      await renderAll();
    } else if (act === 'toggle-task') {
      toggleTask(state, id);
      await renderAll();
    } else if (act === 'del-task') {
      removeTask(state, id);
      await renderAll();
    } else if (act === 'focus-task') {
      activePomoTaskId = id;
      renderTasksAndHabits();
      toast('Tarea vinculada al Pomodoro');
    } else if (act === 'toggle-adjust') {
      document.getElementById(`adj-${id}`)?.classList.toggle('open');
    } else if (act === 'shift-agenda') {
      shiftAgendaTime(state, id, Number(btn.dataset.min));
      await renderAll();
      toast('Horario ajustado');
    } else if (act === 'tomorrow-agenda') {
      moveAgendaTomorrow(state, id);
      await renderAll();
      toast('Bloque movido a mañana');
    } else if (act === 'del-agenda') {
      removeAgendaItem(state, id);
      await renderAll();
    } else if (act === 'read-mail') {
      toggleMessageRead(state, id);
      await renderAll();
    } else if (act === 'del-mail') {
      removeMessage(state, id);
      await renderAll();
    }
  });

  document.body.addEventListener('input', async (e) => {
    if (e.target.id === 'custom-task-color') {
      selectedTaskColor = e.target.value;
      renderColorSwatches();
    }
    const recolorId = e.target.dataset.recolorTask;
    if (recolorId) {
      updateTaskColor(state, recolorId, e.target.value);
      await renderAll();
    }
  });

  // Pomodoro
  $('#pomo-start').addEventListener('click', () => {
    if (pomoTimer) return;
    pomoTimer = setInterval(async () => {
      if (pomoSeconds > 0) {
        pomoSeconds -= 1;
        updatePomodoroText();
      } else {
        clearInterval(pomoTimer);
        pomoTimer = null;
        toast('Sesión Pomodoro completada');
        await showSafeNotification('BrisaPlan — Pomodoro', 'Tu sesión de enfoque ha finalizado.');
      }
    }, 1000);
  });

  $('#pomo-pause').addEventListener('click', () => {
    clearInterval(pomoTimer);
    pomoTimer = null;
  });

  $('#pomo-reset').addEventListener('click', () => {
    clearInterval(pomoTimer);
    pomoTimer = null;
    pomoSeconds = CONFIG.defaultPomodoroSec;
    updatePomodoroText();
  });

  // Mi Espacio
  $('#backup-days-input').addEventListener('change', async (e) => {
    const val = Math.max(7, Number(e.target.value) || 7);
    e.target.value = val;
    state.backupIntervalDays = val;
    await saveEncryptedVault(state, session);
    toast(`Respaldo programado cada ${val} días`);
  });

  $('#btn-export-arco').addEventListener('click', async () => {
    await exportUserJSON(state, session);
    toast('Respaldo JSON descifrado descargado');
  });

  $('#btn-enable-notifs').addEventListener('click', async () => {
    if (!('Notification' in window)) {
      toast('Este navegador no soporta notificaciones.');
      return;
    }
    const perm = await Notification.requestPermission();
    state.notificationsEnabled = perm === 'granted';
    await saveEncryptedVault(state, session);
    renderMiEspacio();
    if (state.notificationsEnabled) {
      await showSafeNotification('BrisaPlan', 'Notificaciones activadas correctamente en tu dispositivo.');
      toast('Notificaciones activadas');
    }
  });

  ['w-chk-tasks', 'w-chk-mail', 'w-chk-habits'].forEach((id) => {
    document.getElementById(id).addEventListener('change', async () => {
      state.selectedWidgets = {
        tasksAgenda: $('#w-chk-tasks').checked,
        mail: $('#w-chk-mail').checked,
        habits: $('#w-chk-habits').checked
      };
      await saveEncryptedVault(state, session);
      toast('Preferencia de widgets actualizada');
    });
  });

  $('#btn-open-tutorial').addEventListener('click', openTutorial);

  $('#tut-next').addEventListener('click', async () => {
    if (tutorialIndex < TUTORIAL_STEPS.length - 1) {
      tutorialIndex += 1;
      renderTutorialStep();
    } else {
      state.tutorialSeen = true;
      await saveEncryptedVault(state, session);
      $('#tutorial-modal').classList.remove('open');
    }
  });

  $('#btn-logout-only').addEventListener('click', async () => {
    window.google?.accounts?.id?.disableAutoSelect();
    clearSessionOnly();
    session = null;
    state = createCleanState();
    await updateAuthView();
    toast('Bóveda bloqueada y sesión cerrada');
  });

  $('#btn-delete-arco').addEventListener('click', async () => {
    if (!confirm('¿Eliminar permanentemente tu bóveda cifrada y cerrar sesión?')) return;
    window.google?.accounts?.id?.disableAutoSelect();
    if (session?.email) deleteUserAccountAndVault(session.email);
    session = null;
    state = createCleanState();
    await updateAuthView();
    toast('Bóveda y cuenta eliminadas por completo');
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  await initServiceWorker();
  applyTheme(localStorage.getItem(CONFIG.themeKey) === 'dark');
  const agendaDate = $('#agenda-date');
  if (agendaDate) agendaDate.value = todayISO();
  updatePomodoroText();
  setupEvents();
  if (session && session.email && session.secret) {
    state = await loadEncryptedVault(session);
  }
  await updateAuthView();
});
