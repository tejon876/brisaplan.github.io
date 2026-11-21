import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { todayISO, createCleanState } from "./storage.js";
import { generateSaltB64, hashPasswordPBKDF2, encryptVaultData, decryptVaultData } from "./crypto.js";
import { ARCO_INFO, TUTORIAL_STEPS } from "./legal.js";
import {
  isHabitDoneToday,
  addHabit,
  toggleHabit,
  removeHabit,
  addTask,
  updateTaskColor,
  toggleTask,
  removeTask
} from "./tasks-habits.js";
import {
  addAgendaItem,
  shiftAgendaTime,
  moveAgendaTomorrow,
  removeAgendaItem
} from "./agenda.js";
import {
  connectMailAccount,
  addMessage,
  cleanAllSpam,
  toggleMessageRead,
  removeMessage
} from "./mail-classroom.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let vaultSecret = null;
let vaultSalt = null;
let state = createCleanState();
let selectedTaskColor = '#4A93C6';
let activePomoTaskId = null;
let pomoSeconds = 25 * 60;
let pomoTimer = null;
let tutorialIndex = 0;

const $ = (s) => document.querySelector(s);

function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3800);
}

function esc(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

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
  } catch {}
}

function applyTheme(dark) {
  document.body.classList.toggle('dark-mode', dark);
  localStorage.setItem('brisaplan_theme_v6', dark ? 'dark' : 'light');
  document.querySelectorAll('[data-toggle-theme]').forEach((btn) => {
    btn.textContent = dark ? 'Modo claro' : 'Modo oscuro';
  });
}

function showLoginStep(step) {
  $('#login-step-google').style.display = step === 'google' ? 'block' : 'none';
  $('#login-step-vault').style.display = step === 'vault' ? 'block' : 'none';
}

async function checkUserVaultMeta(uid) {
  const metaRef = doc(db, 'users', uid, 'meta', 'vault');
  const snap = await getDoc(metaRef);
  return snap.exists() ? snap.data() : null;
}

async function saveUserVaultMeta(uid, salt) {
  const metaRef = doc(db, 'users', uid, 'meta', 'vault');
  await setDoc(metaRef, { salt, hasMaster: true, updatedAt: new Date().toISOString() });
}

async function loadCloudVault(uid, secret, salt) {
  const vaultRef = doc(db, 'users', uid, 'vault', 'data');
  const snap = await getDoc(vaultRef);
  if (!snap.exists()) return createCleanState();
  try {
    const encrypted = snap.data();
    const decrypted = await decryptVaultData(encrypted, secret, salt);
    return { ...createCleanState(), ...decrypted };
  } catch {
    throw new Error('Contraseña maestra incorrecta.');
  }
}

async function saveCloudVault() {
  if (!currentUser || !vaultSecret || !vaultSalt) return;
  const vaultRef = doc(db, 'users', currentUser.uid, 'vault', 'data');
  const encrypted = await encryptVaultData(state, vaultSecret, vaultSalt);
  await setDoc(vaultRef, encrypted);
}

async function handleGoogleUserAuthenticated(user) {
  currentUser = user;
  try {
    const meta = await checkUserVaultMeta(currentUser.uid);
    if (!meta) {
      $('#vault-title-text').textContent = 'Crea tu Contraseña Maestra';
      $('#vault-subtitle-text').textContent = `Cuenta vinculada: ${currentUser.email}. Crea una contraseña personal (mín. 8 caracteres) para cifrar tus tareas y agenda.`;
      $('#vault-confirm-wrap').style.display = 'flex';
      $('#vault-confirm-input').required = true;
      $('#btn-vault-action').textContent = 'Crear contraseña y entrar';
      $('#vault-mode').value = 'create';
    } else {
      $('#vault-title-text').textContent = 'Desbloquea tu Bóveda';
      $('#vault-subtitle-text').textContent = `Hola ${currentUser.displayName || currentUser.email}, escribe tu contraseña maestra para abrir tus datos.`;
      $('#vault-confirm-wrap').style.display = 'none';
      $('#vault-confirm-input').required = false;
      $('#btn-vault-action').textContent = 'Entrar a BrisaPlan';
      $('#vault-mode').value = 'unlock';
    }
    showLoginStep('vault');
  } catch (err) {
    console.error(err);
    toast('Error de conexión con Cloud Firestore. Verifica que Firestore esté habilitado.');
  }
}

$('#btn-google-login').addEventListener('click', async () => {
  const btn = $('#btn-google-login');
  btn.disabled = true;
  btn.textContent = 'Conectando con Google...';
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  try {
    const result = await signInWithPopup(auth, provider);
    await handleGoogleUserAuthenticated(result.user);
  } catch (err) {
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/cancelled-popup-request') {
      await signInWithRedirect(auth, provider);
    } else {
      toast(`No se pudo iniciar con Google (${err.code || 'revisa dominios autorizados'})`);
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M21.35 11.1h-9.17v2.73h5.51c-.24 1.38-1.04 2.55-2.22 3.33v2.77h3.59c2.1-1.93 3.31-4.78 3.31-8.17 0-.74-.07-1.45-.22-2.13z"/><path fill="currentColor" d="M12.18 21.35c3.01 0 5.54-.99 7.38-2.69l-3.59-2.77c-.99.66-2.25 1.05-3.79 1.05-2.91 0-5.38-1.97-6.26-4.63H2.17v2.85c1.83 3.63 5.55 6.19 10.01 6.19z"/><path fill="currentColor" d="M5.92 12.31c-.22-.66-.35-1.36-.35-2.31s.13-1.65.35-2.31V4.84H2.17C1.43 6.32 1 8 1 9.8s.43 3.48 1.17 4.96l3.75-2.45z"/><path fill="currentColor" d="M12.18 5.75c1.64 0 3.11.56 4.27 1.66l3.2-3.2C17.72 2.45 15.19 1.5 12.18 1.5 7.72 1.5 4 4.06 2.17 7.69l3.75 2.85c.88-2.66 3.35-4.79 6.26-4.79z"/></svg> Continuar con Google`;
  }
});

$('#btn-switch-google').addEventListener('click', async () => {
  await signOut(auth);
  currentUser = null;
  showLoginStep('google');
});

$('#vault-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = $('#vault-password-input').value;
  const confirmPw = $('#vault-confirm-input').value;
  const mode = $('#vault-mode').value;
  const btn = $('#btn-vault-action');

  if (password.length < 8) {
    toast('La contraseña maestra debe tener al menos 8 caracteres.');
    return;
  }

  if (mode === 'create' && password !== confirmPw) {
    toast('Las contraseñas no coinciden. Escríbelas igual.');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Abriendo bóveda...';

  try {
    if (mode === 'create') {
      vaultSalt = generateSaltB64();
      vaultSecret = await hashPasswordPBKDF2(password, vaultSalt);
      await saveUserVaultMeta(currentUser.uid, vaultSalt);
      state = createCleanState();
      connectMailAccount(state, currentUser.email, 'Google');
      await saveCloudVault();
    } else {
      const meta = await checkUserVaultMeta(currentUser.uid);
      vaultSalt = meta.salt;
      vaultSecret = await hashPasswordPBKDF2(password, vaultSalt);
      state = await loadCloudVault(currentUser.uid, vaultSecret, vaultSalt);
    }

    $('#vault-password-input').value = '';
    $('#vault-confirm-input').value = '';
    document.body.classList.remove('auth-locked');
    $('#login-gate').style.display = 'none';
    $('#app-shell').style.display = 'block';

    const avatar = $('#header-avatar');
    if (avatar) {
      avatar.innerHTML = currentUser.photoURL
        ? `<img src="${esc(currentUser.photoURL)}" alt="${esc(currentUser.displayName || 'Usuario')}" />`
        : esc((currentUser.displayName?.[0] || currentUser.email[0]).toUpperCase());
    }
    $('#header-user-email').textContent = currentUser.email;
    await renderAll();
    if (!state.tutorialSeen) openTutorial();
    toast('Bienvenido a BrisaPlan');
  } catch (err) {
    toast(err.message || 'Contraseña maestra incorrecta.');
  } finally {
    btn.disabled = false;
    btn.textContent = mode === 'create' ? 'Crear contraseña y entrar' : 'Entrar a BrisaPlan';
  }
});

$('#toggle-vault-pw').addEventListener('click', () => {
  const inp = $('#vault-password-input');
  const inp2 = $('#vault-confirm-input');
  const isHidden = inp.type === 'password';
  inp.type = isHidden ? 'text' : 'password';
  inp2.type = isHidden ? 'text' : 'password';
  $('#toggle-vault-pw').textContent = isHidden ? 'Ocultar' : 'Mostrar';
});

async function renderAll() {
  await saveCloudVault();
  renderColorSwatches();
  renderStats();
  renderHoy();
  renderAgenda();
  renderTasksAndHabits();
  renderMail();
  renderMiEspacio();
}

function renderColorSwatches() {
  const container = $('#task-color-swatches');
  if (!container) return;
  const palette = ['#4A93C6', '#52B788', '#F4A261', '#E76F51', '#9B5DE5', '#3A86FF'];
  container.innerHTML =
    palette
      .map(
        (hex) =>
          `<button type="button" class="swatch-btn ${selectedTaskColor === hex ? 'selected' : ''}" style="background:${hex}" data-pick-color="${hex}" aria-label="Color ${hex}"></button>`
      )
      .join('') +
    `<input type="color" id="custom-task-color" class="custom-color-input" value="${selectedTaskColor}" title="Color personalizado" />`;
}

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
              <div style="display:flex;align-items:center;gap:12px;">
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
    : '<div class="empty-state">Aún no tienes hábitos. Agrega el primero en la pestaña Tareas.</div>';

  const pending = state.tasks.filter((t) => !t.done);
  $('#hoy-tasks-list').innerHTML = pending.length
    ? pending
        .slice(0, 5)
        .map(
          (t) => `
          <div class="item-row task-color-bar" style="border-left-color:${esc(t.color || '#4A93C6')}">
            <label style="display:flex;align-items:center;gap:12px;cursor:pointer;">
              <input type="checkbox" style="width:20px;height:20px;" data-act="toggle-task" data-id="${t.id}" />
              <span class="item-title">${esc(t.title)}</span>
            </label>
            <span class="item-sub">${esc(t.priority)}</span>
          </div>`
        )
        .join('')
    : '<div class="empty-state">Sin pendientes activos. Usa "+ Tarea" arriba para añadir uno.</div>';

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
                <button class="btn btn-soft btn-sm" data-act="toggle-adjust" data-id="${a.id}">Ajustar</button>
                <button class="btn-icon-del" data-act="del-agenda" data-id="${a.id}">✕</button>
              </div>
            </div>
            <div id="adj-${a.id}" class="adjust-drawer">
              <button class="btn btn-outline btn-sm" data-act="shift-agenda" data-id="${a.id}" data-min="-30">-30m</button>
              <button class="btn btn-outline btn-sm" data-act="shift-agenda" data-id="${a.id}" data-min="30">+30m</button>
              <button class="btn btn-outline btn-sm" data-act="shift-agenda" data-id="${a.id}" data-min="60">+1h</button>
              <button class="btn btn-peach btn-sm" data-act="tomorrow-agenda" data-id="${a.id}">Pasar a mañana</button>
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
          <div class="item-row task-color-bar ${t.done ? 'item-done' : ''}" style="border-left-color:${esc(t.color || '#4A93C6')};flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:12px;">
              <input type="checkbox" style="width:20px;height:20px;" ${t.done ? 'checked' : ''} data-act="toggle-task" data-id="${t.id}" />
              <div>
                <div class="item-title">${esc(t.title)}</div>
                <div class="item-sub">Prioridad ${esc(t.priority)}</div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <input type="color" value="${esc(t.color || '#4A93C6')}" data-recolor-task="${t.id}" title="Cambiar color" style="width:32px;height:32px;border:none;background:none;cursor:pointer;" />
              <button class="btn btn-soft btn-sm" data-act="focus-task" data-id="${t.id}">Enfocar</button>
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
              <div style="display:flex;align-items:center;gap:12px;">
                <button class="check-circle ${done ? 'checked' : ''}" data-act="toggle-habit" data-id="${h.id}">✓</button>
                <div>
                  <div class="item-title">${esc(h.name)}</div>
                  <div class="item-sub">${esc(h.category)} · ${h.history?.length || 0} días completados</div>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:6px;">
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
        .map((a) => `<span class="btn btn-soft btn-sm">${esc(a.provider)}: ${esc(a.email)}</span>`)
        .join(' ')
    : '<span class="item-sub">Sin cuentas vinculadas aún.</span>';

  const filtered = state.messages.filter((m) => (filter === 'all' ? true : m.account === filter));
  const list = $('#mail-messages-list');
  list.innerHTML = filtered.length
    ? filtered
        .map(
          (m) => `
          <div class="item-row" style="${m.isSpam ? 'border-color:#F43F5E;' : ''};flex-wrap:wrap;">
            <div>
              <div class="item-title">${m.isSpam ? '[Spam] ' : ''}${esc(m.subject)}</div>
              <div class="item-sub">${esc(m.sender)} · ${esc(m.account)}</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
              <button class="btn btn-outline btn-sm" data-act="read-mail" data-id="${m.id}">${m.read ? 'Leído' : 'Marcar leído'}</button>
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
  $('#paypal-donate-btn').href = 'https://paypal.me/jmatat8';
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
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setupEvents() {
  document.querySelectorAll('[data-toggle-theme]').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyTheme(!document.body.classList.contains('dark-mode'));
    });
  });

  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

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
    toast('Tarea agregada y guardada en la nube');
  });

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
    toast('Bloque agendado');
  });

  $('#task-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    addTask(state, $('#task-title-input').value, $('#task-prio-input').value, selectedTaskColor);
    $('#task-title-input').value = '';
    await renderAll();
    toast('Tarea guardada');
  });

  $('#habit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    addHabit(state, $('#habit-title-input').value, $('#habit-cat-input').value);
    $('#habit-title-input').value = '';
    await renderAll();
    toast('Hábito creado');
  });

  $('#btn-connect-google-mail').addEventListener('click', async () => {
    const email = prompt('Escribe el correo que deseas vincular a esta bóveda:');
    if (!email || !email.includes('@')) return;
    connectMailAccount(state, email, 'Correo');
    await renderAll();
    toast('Cuenta de correo vinculada');
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
    toast('Mensaje registrado');
  });

  $('#mail-filter-account').addEventListener('change', renderMail);

  $('#btn-clean-spam').addEventListener('click', async () => {
    const removed = cleanAllSpam(state);
    await renderAll();
    toast(removed ? `Se eliminaron ${removed} correos spam` : 'No hay spam');
  });

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
      toast('Tarea enlazada al Pomodoro');
    } else if (act === 'toggle-adjust') {
      document.getElementById(`adj-${id}`)?.classList.toggle('open');
    } else if (act === 'shift-agenda') {
      shiftAgendaTime(state, id, Number(btn.dataset.min));
      await renderAll();
    } else if (act === 'tomorrow-agenda') {
      moveAgendaTomorrow(state, id);
      await renderAll();
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

  $('#pomo-start').addEventListener('click', () => {
    if (pomoTimer) return;
    pomoTimer = setInterval(async () => {
      if (pomoSeconds > 0) {
        pomoSeconds -= 1;
        updatePomodoroText();
      } else {
        clearInterval(pomoTimer);
        pomoTimer = null;
        toast('¡Pomodoro completado!');
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
    pomoSeconds = 25 * 60;
    updatePomodoroText();
  });

  $('#backup-days-input').addEventListener('change', async (e) => {
    state.backupIntervalDays = Math.max(7, Number(e.target.value) || 7);
    await saveCloudVault();
    toast('Frecuencia actualizada');
  });

  $('#btn-enable-notifs').addEventListener('click', async () => {
    if (!('Notification' in window)) return toast('No soportado');
    const perm = await Notification.requestPermission();
    state.notificationsEnabled = perm === 'granted';
    await saveCloudVault();
    renderMiEspacio();
    if (state.notificationsEnabled) {
      await showSafeNotification('BrisaPlan', 'Notificaciones activadas.');
      toast('Notificaciones listas');
    }
  });

  ['w-chk-tasks', 'w-chk-mail', 'w-chk-habits'].forEach((id) => {
    document.getElementById(id).addEventListener('change', async () => {
      state.selectedWidgets = {
        tasksAgenda: $('#w-chk-tasks').checked,
        mail: $('#w-chk-mail').checked,
        habits: $('#w-chk-habits').checked
      };
      await saveCloudVault();
      toast('Widgets actualizados');
    });
  });

  $('#btn-open-tutorial').addEventListener('click', openTutorial);

  $('#tut-next').addEventListener('click', async () => {
    if (tutorialIndex < TUTORIAL_STEPS.length - 1) {
      tutorialIndex += 1;
      renderTutorialStep();
    } else {
      state.tutorialSeen = true;
      await saveCloudVault();
      $('#tutorial-modal').classList.remove('open');
    }
  });

  $('#btn-logout-only').addEventListener('click', async () => {
    await signOut(auth);
    currentUser = null;
    vaultSecret = null;
    vaultSalt = null;
    state = createCleanState();
    document.body.classList.add('auth-locked');
    $('#login-gate').style.display = 'flex';
    $('#app-shell').style.display = 'none';
    showLoginStep('google');
    toast('Sesión bloqueada');
  });

  $('#btn-delete-arco').addEventListener('click', async () => {
    if (!confirm('¿Cerrar sesión y bloquear tu bóveda?')) return;
    await signOut(auth);
    currentUser = null;
    vaultSecret = null;
    vaultSalt = null;
    state = createCleanState();
    document.body.classList.add('auth-locked');
    $('#login-gate').style.display = 'flex';
    $('#app-shell').style.display = 'none';
    showLoginStep('google');
    toast('Sesión cerrada');
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  await initServiceWorker();
  applyTheme(localStorage.getItem('brisaplan_theme_v6') === 'dark');
  const agendaDate = $('#agenda-date');
  if (agendaDate) agendaDate.value = todayISO();
  updatePomodoroText();
  setupEvents();

  try {
    const redirectRes = await getRedirectResult(auth);
    if (redirectRes && redirectRes.user) {
      await handleGoogleUserAuthenticated(redirectRes.user);
      return;
    }
  } catch (err) {
    console.error(err);
  }

  onAuthStateChanged(auth, async (user) => {
    if (user && !vaultSecret) {
      await handleGoogleUserAuthenticated(user);
    } else if (!user) {
      currentUser = null;
      document.body.classList.add('auth-locked');
      $('#login-gate').style.display = 'flex';
      $('#app-shell').style.display = 'none';
      showLoginStep('google');
    }
  });
});
