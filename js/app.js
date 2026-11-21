import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig, GOOGLE_OAUTH_CONFIG } from "./firebase-config.js";
import { todayISO, todayWeekday, createCleanState } from "./storage.js";
import { generateSaltB64, hashPasswordPBKDF2, encryptVaultData, decryptVaultData } from "./crypto.js";
import { ARCO_INFO, TUTORIAL_STEPS } from "./legal.js";
import {
  isHabitDoneToday,
  addHabit,
  toggleHabit,
  removeHabit,
  addTask,
  getTaskDeadlineStatus,
  updateTaskColor,
  toggleTask,
  removeTask
} from "./tasks-habits.js";
import {
  BLOCK_COLOR_PRESETS,
  getWeekDatesMonSun,
  isAgendaItemActiveOnDate,
  addAgendaItem,
  updateAgendaItem,
  removeAgendaItem
} from "./agenda.js";
import {
  connectMailAccount,
  disconnectMailAccount,
  linkAndSyncGmailAccount,
  syncAllConnectedGmailAccounts,
  toggleMessageImportant,
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
let selectedQuickTaskColor = '#4A93C6';
let selectedBlockColor = '#4A93C6';

let weekOffset = 0;
let mobileActiveWeekday = todayWeekday();

let activePomoTaskId = null;
let pomoSeconds = 25 * 60;
let pomoTimer = null;

let tutorialIndex = 0;
let mailTabFilter = 'all';
let activeMailSession = 'all';
let mailSearchQuery = '';

let deferredInstallPrompt = null;
let isUnlocking = false;

const $ = (s) => document.querySelector(s);

function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(window.__brisaToastTimer);
  window.__brisaToastTimer = setTimeout(() => el.classList.remove('show'), 3800);
}

function esc(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function saveLocalVaultSession(uid, secret, salt) {
  try {
    localStorage.setItem(`brisaplan_vault_key_${uid}`, JSON.stringify({ secret, salt, savedAt: Date.now() }));
  } catch {}
}

function getLocalVaultSession(uid) {
  try {
    const raw = localStorage.getItem(`brisaplan_vault_key_${uid}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearLocalVaultSession(uid) {
  try {
    if (uid) localStorage.removeItem(`brisaplan_vault_key_${uid}`);
  } catch {}
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
  localStorage.setItem('brisaplan_theme_v7', dark ? 'dark' : 'light');
  document.querySelectorAll('[data-toggle-theme]').forEach((btn) => {
    btn.textContent = dark ? 'Modo claro' : 'Modo oscuro';
  });
}

function showLoginStep(step) {
  $('#login-step-auth').style.display = step === 'auth' ? 'block' : 'none';
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
  const encrypted = snap.data();
  const decrypted = await decryptVaultData(encrypted, secret, salt);
  return { ...createCleanState(), ...decrypted };
}

async function saveCloudVault() {
  if (!currentUser || !vaultSecret || !vaultSalt) return;
  const vaultRef = doc(db, 'users', currentUser.uid, 'vault', 'data');
  const encrypted = await encryptVaultData(state, vaultSecret, vaultSalt);
  await setDoc(vaultRef, encrypted);
}

async function enterMainApp({ showWelcome = false } = {}) {
  document.body.classList.remove('auth-locked');
  $('#login-gate').style.display = 'none';
  $('#app-shell').style.display = 'block';

  const avatar = $('#header-avatar');
  if (avatar) {
    avatar.innerHTML = currentUser.photoURL
      ? `<img src="${esc(currentUser.photoURL)}" alt="${esc(currentUser.displayName || 'Usuario')}" />`
      : esc((currentUser.displayName?.[0] || currentUser.email?.[0] || 'B').toUpperCase());
  }
  $('#header-user-email').textContent = currentUser.email || '';

  const monthsSelect = $('#mail-months-range');
  if (monthsSelect) monthsSelect.value = String(state.mailMonthsRange || 1);

  await renderAll(false);
  if (!state.tutorialSeen) {
    setTimeout(() => openTutorial(), 450);
  }
  if (showWelcome) toast('Sesión iniciada y guardada en este dispositivo');
}

async function deriveAndEnterWithPassword(user, rawPassword, isNewAccount = false) {
  const meta = await checkUserVaultMeta(user.uid);
  if (!meta || isNewAccount) {
    vaultSalt = generateSaltB64();
    vaultSecret = await hashPasswordPBKDF2(rawPassword, vaultSalt);
    await saveUserVaultMeta(user.uid, vaultSalt);
    state = createCleanState();
    if (user.email) connectMailAccount(state, user.email, 'Principal', 'Principal');
    await saveCloudVault();
  } else {
    vaultSalt = meta.salt;
    vaultSecret = await hashPasswordPBKDF2(rawPassword, vaultSalt);
    state = await loadCloudVault(user.uid, vaultSecret, vaultSalt);
  }
  saveLocalVaultSession(user.uid, vaultSecret, vaultSalt);
  await enterMainApp({ showWelcome: true });
}

async function handleUserAuthenticated(user) {
  if (!user || isUnlocking) return;
  isUnlocking = true;
  currentUser = user;

  try {
    // 1. Verificar sesión persistente en este dispositivo (no vuelve a pedir contraseña al recargar)
    const saved = getLocalVaultSession(currentUser.uid);
    if (saved && saved.secret && saved.salt) {
      vaultSecret = saved.secret;
      vaultSalt = saved.salt;
      try {
        state = await loadCloudVault(currentUser.uid, vaultSecret, vaultSalt);
        await enterMainApp({ showWelcome: false });
        return;
      } catch {
        clearLocalVaultSession(currentUser.uid);
        vaultSecret = null;
        vaultSalt = null;
      }
    }

    // 2. Si inició sesión con Google y aún no tiene llave guardada localmente
    const meta = await checkUserVaultMeta(currentUser.uid);
    if (!meta) {
      $('#vault-title-text').textContent = 'Protege tu Bóveda Cifrada';
      $('#vault-subtitle-text').textContent = `Cuenta conectada: ${currentUser.email}. Crea una contraseña de seguridad (se recordará en este dispositivo).`;
      $('#vault-confirm-wrap').style.display = 'flex';
      $('#vault-confirm-input').required = true;
      $('#btn-vault-action').textContent = 'Guardar y entrar';
      $('#vault-mode').value = 'create';
    } else {
      $('#vault-title-text').textContent = 'Desbloquear Bóveda';
      $('#vault-subtitle-text').textContent = `Hola ${currentUser.displayName || currentUser.email}, confirma tu contraseña de bóveda una sola vez en este equipo.`;
      $('#vault-confirm-wrap').style.display = 'none';
      $('#vault-confirm-input').required = false;
      $('#btn-vault-action').textContent = 'Entrar a BrisaPlan';
      $('#vault-mode').value = 'unlock';
    }
    showLoginStep('vault');
  } catch (err) {
    console.error(err);
    toast('Error al conectar con la nube. Revisa tu conexión.');
  } finally {
    isUnlocking = false;
  }
}

/* ==================== RENDERIZADO DE PALETAS (CUADRITOS + RULETA) ==================== */
function buildSwatchRowHTML(selectedHex, groupName) {
  const squares = BLOCK_COLOR_PRESETS.map(
    (c) =>
      `<button type="button" class="color-square ${selectedHex.toLowerCase() === c.hex.toLowerCase() ? 'selected' : ''}" style="background:${c.hex}" data-color-group="${groupName}" data-pick-hex="${c.hex}" title="${c.name}" aria-label="${c.name}"></button>`
  ).join('');

  return `${squares}
    <label class="color-wheel-trigger" title="Ruleta de color personalizado">
      <input type="color" value="${esc(selectedHex)}" data-wheel-group="${groupName}" aria-label="Ruleta de colores" />
    </label>`;
}

function renderAllColorPickers() {
  const taskSw = $('#task-color-swatches');
  if (taskSw) taskSw.innerHTML = buildSwatchRowHTML(selectedTaskColor, 'task');

  const quickSw = $('#quick-task-swatches');
  if (quickSw) quickSw.innerHTML = buildSwatchRowHTML(selectedQuickTaskColor, 'quick');

  const blockSw = $('#block-color-swatches');
  if (blockSw) blockSw.innerHTML = buildSwatchRowHTML(selectedBlockColor, 'block');
}

/* ==================== RENDERIZADO GENERAL ==================== */
async function renderAll(persistToCloud = true) {
  if (persistToCloud) {
    await saveCloudVault();
  }
  renderAllColorPickers();
  renderStats();
  renderHoy();
  renderWeeklyAgenda();
  renderTasksAndHabits();
  renderMail();
  renderMiEspacio();
}

function renderStats() {
  const today = todayISO();
  const todayBlocksCount = state.agenda.filter((a) => isAgendaItemActiveOnDate(a, today)).length;
  const totalHabits = state.habits.length;
  const doneHabits = state.habits.filter(isHabitDoneToday).length;
  const bestStreak = state.habits.reduce((m, h) => Math.max(m, h.streak || 0), 0);
  const pendingTasks = state.tasks.filter((t) => !t.done).length;
  const importantMailsCount = state.messages.filter((m) => !m.isSpam && m.important).length;

  $('#stat-today-blocks').textContent = `${todayBlocksCount}`;
  $('#stat-pending').textContent = `${pendingTasks}`;
  $('#stat-habits').textContent = `${doneHabits} / ${totalHabits}`;
  $('#stat-streak').textContent = `🔥 ${bestStreak}d`;
  $('#stat-important-mails').textContent = `${importantMailsCount}`;
}

function renderHoy() {
  const today = todayISO();

  // 1. Bloques de hoy
  const todayBlocks = state.agenda.filter((a) => isAgendaItemActiveOnDate(a, today));
  $('#hoy-agenda-list').innerHTML = todayBlocks.length
    ? todayBlocks
        .map(
          (a) => `
          <div class="item-row task-color-bar" style="border-left-color:${esc(a.color || '#4A93C6')};cursor:pointer;" data-act="open-edit-block" data-id="${a.id}">
            <div>
              <div class="item-title">${esc(a.time)}${a.endTime ? ` – ${esc(a.endTime)}` : ''} · ${esc(a.title)}</div>
              <div class="item-sub">${a.recurrence === 'permanent' ? 'Bloque semanal fijo' : 'Bloque de hoy'}</div>
            </div>
            <span class="btn btn-soft btn-sm">Editar</span>
          </div>`
        )
        .join('')
    : '<div class="empty-state">No tienes bloques programados para hoy.</div>';

  // 2. Entregas y pendientes clave (prioriza vencidas o de hoy)
  const pending = state.tasks.filter((t) => !t.done);
  $('#hoy-tasks-list').innerHTML = pending.length
    ? pending
        .slice(0, 6)
        .map((t) => {
          const st = getTaskDeadlineStatus(t);
          return `
            <div class="item-row task-color-bar" style="border-left-color:${esc(t.color || '#4A93C6')}">
              <label style="display:flex;align-items:center;gap:12px;cursor:pointer;min-width:0;flex:1;">
                <input type="checkbox" style="width:20px;height:20px;flex-shrink:0;" data-act="toggle-task" data-id="${t.id}" />
                <div style="min-width:0;">
                  <div class="item-title">${esc(t.title)}</div>
                  <span class="deadline-pill ${st.badge}" style="margin-top:4px;">${esc(st.label)}</span>
                </div>
              </label>
            </div>`;
        })
        .join('')
    : '<div class="empty-state">Sin entregas pendientes. Pulsa "+ Entrega" arriba para agregar una.</div>';

  // 3. Hábitos del día
  $('#hoy-habits-list').innerHTML = state.habits.length
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
    : '<div class="empty-state">Aún no has creado hábitos diarios.</div>';

  // 4. Correos importantes
  const impMails = state.messages.filter((m) => !m.isSpam && m.important).slice(0, 4);
  $('#hoy-important-mails-list').innerHTML = impMails.length
    ? impMails
        .map(
          (m) => `
          <div class="item-row">
            <div style="min-width:0;flex:1;">
              <div class="item-title">★ ${esc(m.subject)}</div>
              <div class="item-sub">${esc(m.sender)} · ${esc(m.account)}</div>
            </div>
            <button type="button" class="btn btn-soft btn-sm" data-act="jump-mail-account" data-email="${esc(m.account)}">Ver</button>
          </div>`
        )
        .join('')
    : '<div class="empty-state">No hay correos marcados como importantes.</div>';
}

/* ==================== AGENDA SEMANAL (LUNES A DOMINGO POR BLOQUES) ==================== */
function getShiftedBaseDateISO() {
  const base = new Date();
  base.setDate(base.getDate() + weekOffset * 7);
  const off = base.getTimezoneOffset() * 60000;
  return new Date(base - off).toISOString().split('T')[0];
}

function renderWeeklyAgenda() {
  const today = todayISO();
  const weekDays = getWeekDatesMonSun(getShiftedBaseDateISO());

  const first = weekDays[0];
  const last = weekDays[6];
  const subEl = $('#week-range-subtitle');
  if (subEl) {
    subEl.textContent = `Semana del ${first.dayNum} ${first.monthShort} al ${last.dayNum} ${last.monthShort}`;
  }

  // Selector táctil para móvil
  const pillsEl = $('#mobile-week-pills');
  if (pillsEl) {
    pillsEl.innerHTML = weekDays
      .map(
        (d) =>
          `<button type="button" class="day-pill-btn ${mobileActiveWeekday === d.day ? 'active' : ''}" data-select-mobile-day="${d.day}">
            ${d.short} ${d.dayNum}
          </button>`
      )
      .join('');
  }

  // Tablero de 7 columnas Lunes a Domingo
  const boardEl = $('#week-grid-board');
  if (!boardEl) return;

  boardEl.innerHTML = weekDays
    .map((d) => {
      const blocks = state.agenda.filter((a) => isAgendaItemActiveOnDate(a, d.iso));
      const isToday = d.iso === today;
      const isMobileActive = mobileActiveWeekday === d.day;

      const blocksHtml = blocks.length
        ? blocks
            .map(
              (b) => `
              <div class="agenda-block-card" style="background:${esc(b.color || '#4A93C6')}" data-act="open-edit-block" data-id="${b.id}">
                <div class="agenda-block-time">
                  <span>${esc(b.time)}${b.endTime ? ` - ${esc(b.endTime)}` : ''}</span>
                </div>
                <div class="agenda-block-title">${esc(b.title)}</div>
                <span class="agenda-block-tag">${b.recurrence === 'permanent' ? '↻ Semanal' : '• Único'}</span>
              </div>`
            )
            .join('')
        : `<div class="empty-state" style="padding:16px 8px;font-size:0.78rem;">Libre</div>`;

      return `
        <div class="day-column ${isToday ? 'is-today' : ''} ${isMobileActive ? 'mobile-active' : ''}">
          <div class="day-col-header">
            <div>
              <div class="day-col-title">${d.full}</div>
              <div class="day-col-date">${d.dayNum} ${d.monthShort}${isToday ? ' · Hoy' : ''}</div>
            </div>
            <button type="button" class="day-add-mini" data-act="quick-add-day-block" data-day="${d.day}" data-iso="${d.iso}" title="Agregar bloque el ${d.full}">+</button>
          </div>
          <div class="list-stack" style="gap:8px;">
            ${blocksHtml}
          </div>
        </div>`;
    })
    .join('');
}

function openBlockModal({ id = '', presetDay = todayWeekday(), presetDate = todayISO() } = {}) {
  const existing = id ? state.agenda.find((a) => a.id === id) : null;
  $('#block-id').value = existing ? existing.id : '';
  $('#block-modal-title').textContent = existing ? 'Editar bloque de agenda' : 'Nuevo bloque semanal';
  $('#block-title').value = existing ? existing.title : '';
  $('#block-start').value = existing ? existing.time : '08:00';
  $('#block-end').value = existing ? (existing.endTime || '') : '09:00';

  const isPerm = existing ? existing.recurrence === 'permanent' : true;
  $('#block-permanent-toggle').checked = isPerm;
  $('#block-single-date-wrap').style.display = isPerm ? 'none' : 'block';
  $('#block-date').value = existing?.date || presetDate || todayISO();

  const activeDays = existing?.days || [presetDay];
  document.querySelectorAll('[data-block-day]').forEach((chk) => {
    chk.checked = activeDays.includes(Number(chk.dataset.blockDay));
  });

  selectedBlockColor = existing?.color || '#4A93C6';
  renderAllColorPickers();

  $('#btn-delete-block').style.display = existing ? 'inline-flex' : 'none';
  $('#block-modal').classList.add('open');
  $('#block-title').focus();
}

/* ==================== TAREAS EN BLOQUES + HÁBITOS ==================== */
function renderTasksAndHabits() {
  const tList = $('#tasks-full-list');
  tList.innerHTML = state.tasks.length
    ? state.tasks
        .map((t) => {
          const st = getTaskDeadlineStatus(t);
          return `
            <div class="task-block-card ${t.done ? 'is-done' : ''}" style="border-top-color:${esc(t.color || '#4A93C6')}">
              <div>
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:8px;">
                  <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;">
                    <input type="checkbox" style="width:19px;height:19px;margin-top:2px;" ${t.done ? 'checked' : ''} data-act="toggle-task" data-id="${t.id}" />
                    <span class="task-block-title">${esc(t.title)}</span>
                  </label>
                  <button class="btn-icon-del" style="min-width:30px;min-height:30px;" data-act="del-task" data-id="${t.id}" title="Eliminar">✕</button>
                </div>
                <span class="deadline-pill ${st.badge}">${esc(st.label)}</span>
              </div>

              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding-top:8px;border-top:1px dashed var(--border-subtle);">
                <span class="item-sub" style="text-transform:capitalize;">Prioridad ${esc(t.priority)}</span>
                <div style="display:flex;align-items:center;gap:6px;">
                  <label class="color-wheel-trigger" style="width:24px;height:24px;" title="Cambiar color">
                    <input type="color" value="${esc(t.color || '#4A93C6')}" data-recolor-task="${t.id}" />
                  </label>
                  <button type="button" class="btn btn-soft btn-sm" style="min-height:32px;padding:4px 10px;font-size:0.78rem;" data-act="focus-task" data-id="${t.id}">Enfocar</button>
                </div>
              </div>
            </div>`;
        })
        .join('')
    : '<div class="empty-state" style="grid-column:1/-1;">No tienes tareas registradas. Crea un bloque arriba con su día y hora de entrega.</div>';

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
                  <div class="item-sub">${esc(h.category)} · ${h.history?.length || 0} días</div>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:6px;">
                <span class="streak-pill">🔥 ${h.streak || 0}d</span>
                <button class="btn-icon-del" data-act="del-habit" data-id="${h.id}">✕</button>
              </div>
            </div>`;
        })
        .join('')
    : '<div class="empty-state">Crea tu primer hábito diario arriba.</div>';

  const focusedTask = state.tasks.find((t) => t.id === activePomoTaskId);
  $('#pomo-task-label').textContent = focusedTask ? `Enfocando: ${focusedTask.title}` : 'Sesión libre de enfoque';
}

/* ==================== CORREOS POR SESIONES DE CUENTA ==================== */
function renderMail() {
  const sessionsBar = $('#mail-sessions-bar');
  if (sessionsBar) {
    const allChip = `
      <button type="button" class="mail-session-chip ${activeMailSession === 'all' ? 'active' : ''}" data-select-mail-session="all">
        <span class="session-avatar">★</span>
        <span>Todas las cuentas (${state.mailAccounts.length})</span>
      </button>`;

    const accountChips = state.mailAccounts
      .map((acc) => {
        const initial = (acc.label || acc.email || 'C')[0].toUpperCase();
        const isActive = activeMailSession === acc.email;
        return `
          <div class="mail-session-chip ${isActive ? 'active' : ''}" data-select-mail-session="${esc(acc.email)}">
            <span class="session-avatar">${esc(initial)}</span>
            <div>
              <div>${esc(acc.label || acc.email.split('@')[0])}</div>
              <div style="font-size:0.7rem;opacity:0.82;">${esc(acc.email)}</div>
            </div>
            <button type="button" class="btn-icon-del" style="min-width:24px;min-height:24px;padding:0;color:inherit;" data-act="unlink-mail-acc" data-email="${esc(acc.email)}" title="Desvincular cuenta">✕</button>
          </div>`;
      })
      .join('');

    sessionsBar.innerHTML = allChip + accountChips;
  }

  // Filtrado por sesión de cuenta + carpeta (Bandeja / Importantes / Spam) + búsqueda rápida
  const scopedByAccount = state.messages.filter((m) =>
    activeMailSession === 'all' ? true : m.account === activeMailSession
  );

  const inboxCount = scopedByAccount.filter((m) => !m.isSpam).length;
  const importantCount = scopedByAccount.filter((m) => !m.isSpam && m.important).length;
  const spamCount = scopedByAccount.filter((m) => m.isSpam).length;

  $('#mail-count-all').textContent = `${inboxCount}`;
  $('#mail-count-important').textContent = `${importantCount}`;
  $('#mail-count-spam').textContent = `${spamCount}`;

  document.querySelectorAll('[data-mail-view]').forEach((b) => {
    b.classList.toggle('active', b.dataset.mailView === mailTabFilter);
  });

  const q = mailSearchQuery.trim().toLowerCase();
  const filtered = scopedByAccount.filter((m) => {
    if (mailTabFilter === 'important' && (m.isSpam || !m.important)) return false;
    if (mailTabFilter === 'spam' && !m.isSpam) return false;
    if (mailTabFilter === 'all' && m.isSpam) return false;
    if (!q) return true;
    return (
      (m.subject || '').toLowerCase().includes(q) ||
      (m.sender || '').toLowerCase().includes(q) ||
      (m.snippet || '').toLowerCase().includes(q) ||
      (m.account || '').toLowerCase().includes(q)
    );
  });

  const list = $('#mail-messages-list');
  list.innerHTML = filtered.length
    ? filtered
        .map(
          (m) => `
          <div class="item-row" style="${m.isSpam ? 'border-color:#F43F5E;' : m.important ? 'border-color:var(--sky-primary);' : ''};flex-wrap:wrap;">
            <div style="min-width:0;flex:1;">
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:2px;">
                <span class="streak-pill" style="font-size:0.72rem;padding:2px 8px;">${esc(m.account)}</span>
                <span class="item-sub">${esc(m.dateLabel || '')}</span>
              </div>
              <div class="item-title">${m.important && !m.isSpam ? '★ ' : ''}${m.isSpam ? '[Spam] ' : ''}${esc(m.subject)}</div>
              <div class="item-sub">${esc(m.sender)}</div>
              ${m.snippet ? `<div class="item-sub" style="margin-top:4px;opacity:0.88;">${esc(m.snippet)}</div>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <button class="btn btn-soft btn-sm" data-act="star-mail" data-id="${m.id}">${m.important ? '★ Importante' : '☆ Importante'}</button>
              <button class="btn btn-outline btn-sm" data-act="read-mail" data-id="${m.id}">${m.read ? 'Leído' : 'No leído'}</button>
              <button class="btn-icon-del" data-act="del-mail" data-id="${m.id}" title="Eliminar">✕</button>
            </div>
          </div>`
        )
        .join('')
    : '<div class="empty-state">No se encontraron correos en esta sesión o filtro. Agrega una cuenta o ajusta el rango de meses.</div>';
}

function renderMiEspacio() {
  $('#notif-status-text').textContent = state.notificationsEnabled ? 'Activadas en este dispositivo' : 'Desactivadas';
  $('#arco-legal-text').textContent = ARCO_INFO.description;
  const apkLink = $('#btn-download-apk');
  if (apkLink && GOOGLE_OAUTH_CONFIG.apkDownloadUrl) {
    apkLink.href = GOOGLE_OAUTH_CONFIG.apkDownloadUrl;
  }
}

function updatePomodoroText() {
  const m = String(Math.floor(pomoSeconds / 60)).padStart(2, '0');
  const s = String(pomoSeconds % 60).padStart(2, '0');
  $('#pomo-clock').textContent = `${m}:${s}`;
}

/* ==================== SPOTLIGHT TOUR INTERACTIVO ==================== */
function openTutorial() {
  tutorialIndex = 0;
  $('#tour-backdrop').classList.add('open');
  $('#tour-ring').style.display = 'block';
  $('#tour-popover').style.display = 'block';
  renderTutorialStep();
}

function closeTutorial() {
  $('#tour-backdrop').classList.remove('open');
  $('#tour-ring').style.display = 'none';
  $('#tour-popover').style.display = 'none';
}

function renderTutorialStep() {
  const step = TUTORIAL_STEPS[tutorialIndex];
  if (step.tab) switchTab(step.tab);

  $('#tut-title').textContent = step.title;
  $('#tut-body').textContent = step.text;
  $('#tut-counter').textContent = `${tutorialIndex + 1} / ${TUTORIAL_STEPS.length}`;
  $('#tut-next').textContent = tutorialIndex === TUTORIAL_STEPS.length - 1 ? '¡Entendido!' : 'Siguiente →';

  requestAnimationFrame(() => {
    const target = document.querySelector(step.selector);
    const ring = $('#tour-ring');
    const pop = $('#tour-popover');

    if (target && target.offsetParent !== null) {
      const rect = target.getBoundingClientRect();
      ring.style.top = `${Math.max(6, rect.top - 6)}px`;
      ring.style.left = `${Math.max(6, rect.left - 6)}px`;
      ring.style.width = `${Math.min(window.innerWidth - 12, rect.width + 12)}px`;
      ring.style.height = `${Math.min(window.innerHeight - 12, rect.height + 12)}px`;

      const popTop = rect.bottom + 16 + 190 < window.innerHeight ? rect.bottom + 16 : Math.max(16, rect.top - 205);
      const popLeft = Math.min(window.innerWidth - 376, Math.max(16, rect.left));
      pop.style.top = `${popTop}px`;
      pop.style.left = `${popLeft}px`;
    } else {
      ring.style.top = '18px';
      ring.style.left = '18px';
      ring.style.width = 'calc(100vw - 36px)';
      ring.style.height = '64px';
      pop.style.top = '105px';
      pop.style.left = '16px';
    }
  });
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn, .mobile-nav-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tabName);
  });
  document.querySelectorAll('.view-panel').forEach((p) => {
    p.classList.toggle('active', p.id === `panel-${tabName}`);
  });
}

async function triggerSmartInstall() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    toast(choice.outcome === 'accepted' ? '¡BrisaPlan instalada correctamente!' : 'Instalación cancelada');
    return;
  }
  $('#install-guide-modal').classList.add('open');
}

/* ==================== EVENTOS ==================== */
function setupEvents() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
  });

  document.querySelectorAll('[data-toggle-theme]').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyTheme(!document.body.classList.contains('dark-mode'));
    });
  });

  // Tabs de Login / Registro
  document.querySelectorAll('[data-auth-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.authMode;
      $('#email-auth-mode').value = mode;
      $('#tab-auth-login').classList.toggle('active', mode === 'login');
      $('#tab-auth-register').classList.toggle('active', mode === 'register');
      $('#auth-name-wrap').style.display = mode === 'register' ? 'block' : 'none';
      $('#btn-email-auth-submit').textContent = mode === 'register' ? 'Crear cuenta y entrar' : 'Entrar a mi cuenta';
    });
  });

  $('#toggle-auth-pw').addEventListener('click', () => {
    const inp = $('#auth-password-input');
    const hidden = inp.type === 'password';
    inp.type = hidden ? 'text' : 'password';
    $('#toggle-auth-pw').textContent = hidden ? 'Ocultar' : 'Mostrar';
  });

  $('#btn-forgot-password').addEventListener('click', async () => {
    const email = $('#auth-email-input').value.trim();
    if (!email) {
      toast('Escribe primero tu correo electrónico arriba para enviarte el enlace.');
      $('#auth-email-input').focus();
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      toast(`Correo de recuperación enviado a ${email}`);
    } catch (err) {
      toast('No se pudo enviar el correo. Verifica que la dirección esté registrada.');
    }
  });

  $('#email-auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const mode = $('#email-auth-mode').value;
    const email = $('#auth-email-input').value.trim();
    const password = $('#auth-password-input').value;
    const name = $('#auth-name-input').value.trim();
    const btn = $('#btn-email-auth-submit');

    btn.disabled = true;
    btn.textContent = mode === 'register' ? 'Creando cuenta...' : 'Iniciando sesión...';

    try {
      await setPersistence(auth, browserLocalPersistence);
      if (mode === 'register') {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        if (name) await updateProfile(cred.user, { displayName: name });
        currentUser = cred.user;
        await deriveAndEnterWithPassword(cred.user, password, true);
      } else {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        currentUser = cred.user;
        await deriveAndEnterWithPassword(cred.user, password, false);
      }
      $('#auth-password-input').value = '';
    } catch (err) {
      const code = err.code || '';
      if (code === 'auth/email-already-in-use') toast('Ese correo ya tiene cuenta. Usa "Iniciar sesión".');
      else if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') toast('Correo o contraseña incorrectos.');
      else toast(`Error de acceso (${code || 'verifica tus datos'})`);
    } finally {
      btn.disabled = false;
      btn.textContent = mode === 'register' ? 'Crear cuenta y entrar' : 'Entrar a mi cuenta';
    }
  });

  $('#btn-google-login').addEventListener('click', async () => {
    const btn = $('#btn-google-login');
    btn.disabled = true;
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await setPersistence(auth, browserLocalPersistence);
      const result = await signInWithPopup(auth, provider);
      await handleUserAuthenticated(result.user);
    } catch (err) {
      if (err.code === 'auth/popup-blocked' || err.code === 'auth/cancelled-popup-request') {
        await signInWithRedirect(auth, provider);
      } else {
        toast('No se pudo conectar con Google.');
      }
    } finally {
      btn.disabled = false;
    }
  });

  $('#btn-switch-google').addEventListener('click', async () => {
    clearLocalVaultSession(currentUser?.uid);
    await signOut(auth);
    currentUser = null;
    vaultSecret = null;
    vaultSalt = null;
    showLoginStep('auth');
  });

  $('#vault-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = $('#vault-password-input').value;
    const confirmPw = $('#vault-confirm-input').value;
    const mode = $('#vault-mode').value;
    if (mode === 'create' && password !== confirmPw) {
      toast('Las contraseñas no coinciden.');
      return;
    }
    try {
      await deriveAndEnterWithPassword(currentUser, password, mode === 'create');
      $('#vault-password-input').value = '';
      $('#vault-confirm-input').value = '';
    } catch {
      toast('Contraseña de bóveda incorrecta.');
    }
  });

  $('#toggle-vault-pw').addEventListener('click', () => {
    const inp = $('#vault-password-input');
    const inp2 = $('#vault-confirm-input');
    const hidden = inp.type === 'password';
    inp.type = hidden ? 'text' : 'password';
    inp2.type = hidden ? 'text' : 'password';
    $('#toggle-vault-pw').textContent = hidden ? 'Ocultar' : 'Mostrar';
  });

  // Navegación
  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  // Agenda semanal controles
  $('#btn-prev-week').addEventListener('click', () => { weekOffset -= 1; renderWeeklyAgenda(); });
  $('#btn-this-week').addEventListener('click', () => { weekOffset = 0; mobileActiveWeekday = todayWeekday(); renderWeeklyAgenda(); });
  $('#btn-next-week').addEventListener('click', () => { weekOffset += 1; renderWeeklyAgenda(); });
  $('#btn-open-new-block').addEventListener('click', () => openBlockModal());
  $('#close-block-modal').addEventListener('click', () => $('#block-modal').classList.remove('open'));

  $('#block-permanent-toggle').addEventListener('change', (e) => {
    $('#block-single-date-wrap').style.display = e.target.checked ? 'none' : 'block';
  });

  $('#block-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('#block-id').value;
    const isPerm = $('#block-permanent-toggle').checked;
    const days = Array.from(document.querySelectorAll('[data-block-day]:checked')).map((el) => Number(el.dataset.blockDay));
    const payload = {
      title: $('#block-title').value,
      startTime: $('#block-start').value,
      endTime: $('#block-end').value,
      color: selectedBlockColor,
      recurrence: isPerm ? 'permanent' : 'temporary',
      date: $('#block-date').value || todayISO(),
      days: days.length ? days : [todayWeekday()]
    };

    if (id) {
      updateAgendaItem(state, id, {
        title: payload.title,
        time: payload.startTime,
        endTime: payload.endTime,
        color: payload.color,
        recurrence: payload.recurrence,
        date: payload.date,
        days: payload.days
      });
      toast('Bloque actualizado');
    } else {
      addAgendaItem(state, payload);
      toast('Bloque agregado a tu agenda');
    }
    $('#block-modal').classList.remove('open');
    await renderAll();
  });

  $('#btn-delete-block').addEventListener('click', async () => {
    const id = $('#block-id').value;
    if (!id) return;
    removeAgendaItem(state, id);
    $('#block-modal').classList.remove('open');
    await renderAll();
    toast('Bloque eliminado');
  });

  // Tareas y entregas
  document.querySelectorAll('[data-open-quick-task]').forEach((btn) => {
    btn.addEventListener('click', () => {
      $('#quick-task-date').value = todayISO();
      $('#quick-task-modal').classList.add('open');
      $('#quick-task-title').focus();
    });
  });

  $('#close-quick-task').addEventListener('click', () => $('#quick-task-modal').classList.remove('open'));

  $('#quick-task-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    addTask(state, {
      title: $('#quick-task-title').value,
      dueDate: $('#quick-task-date').value,
      dueTime: $('#quick-task-time').value,
      priority: $('#quick-task-prio').value,
      color: selectedQuickTaskColor
    });
    $('#quick-task-title').value = '';
    $('#quick-task-modal').classList.remove('open');
    await renderAll();
    toast('Entrega guardada');
  });

  $('#task-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    addTask(state, {
      title: $('#task-title-input').value,
      dueDate: $('#task-due-date').value,
      dueTime: $('#task-due-time').value,
      priority: $('#task-prio-input').value,
      color: selectedTaskColor
    });
    $('#task-title-input').value = '';
    await renderAll();
    toast('Bloque de tarea creado');
  });

  $('#habit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    addHabit(state, $('#habit-title-input').value, $('#habit-cat-input').value);
    $('#habit-title-input').value = '';
    await renderAll();
    toast('Hábito creado');
  });

  // Correos: Modal profesional + Verificación + Rango 1-12 meses + Búsqueda rápida
  $('#btn-open-connect-mail').addEventListener('click', () => {
    $('#connect-mail-label').value = '';
    $('#connect-mail-hint').value = '';
    $('#connect-mail-modal').classList.add('open');
  });

  $('#close-connect-mail').addEventListener('click', () => $('#connect-mail-modal').classList.remove('open'));

  $('#btn-confirm-connect-gmail').addEventListener('click', async () => {
    const btn = $('#btn-confirm-connect-gmail');
    const label = $('#connect-mail-label').value.trim();
    const hintEmail = $('#connect-mail-hint').value.trim();
    const sendVerification = $('#connect-mail-verify-check').checked;
    const months = Number($('#mail-months-range')?.value || state.mailMonthsRange || 1);

    btn.disabled = true;
    btn.textContent = 'Autorizando con Google...';
    try {
      const { email, syncedCount, verificationSent } = await linkAndSyncGmailAccount(state, {
        hintEmail,
        label,
        months,
        sendVerification
      });
      activeMailSession = email;
      $('#connect-mail-modal').classList.remove('open');
      await renderAll();
      toast(
        verificationSent
          ? `¡${email} vinculada! Se envió correo de verificación y se cargaron ${syncedCount} mensajes.`
          : `¡${email} vinculada! Se cargaron ${syncedCount} mensajes.`
      );
    } catch (err) {
      toast(err.message || 'No se pudo completar la autorización de correo.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Continuar y autorizar acceso';
    }
  });

  $('#btn-sync-gmail').addEventListener('click', async () => {
    const btn = $('#btn-sync-gmail');
    const months = Number($('#mail-months-range')?.value || state.mailMonthsRange || 1);
    btn.disabled = true;
    btn.textContent = 'Actualizando...';
    try {
      const total = await syncAllConnectedGmailAccounts(state, months);
      await renderAll();
      toast(`Bandeja actualizada (${total} correos de los últimos ${months} mes(es))`);
    } catch (err) {
      toast(err.message || 'Error al sincronizar.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Actualizar';
    }
  });

  $('#mail-months-range').addEventListener('change', async (e) => {
    const months = Number(e.target.value) || 1;
    state.mailMonthsRange = months;
    await saveCloudVault();
    toast(`Rango ajustado a ${months} mes(es). Pulsa Actualizar para recargar.`);
  });

  $('#mail-quick-search').addEventListener('input', (e) => {
    mailSearchQuery = e.target.value;
    renderMail();
  });

  document.querySelectorAll('[data-mail-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      mailTabFilter = btn.dataset.mailView;
      renderMail();
    });
  });

  $('#btn-clean-spam').addEventListener('click', async () => {
    const removed = cleanAllSpam(state);
    await renderAll();
    toast(removed ? `Se limpiaron ${removed} correos spam` : 'No hay spam en esta vista');
  });

  // Instalación y Mi Espacio
  $('#btn-install-mobile-app').addEventListener('click', triggerSmartInstall);
  $('#btn-install-space').addEventListener('click', triggerSmartInstall);
  $('#close-install-modal').addEventListener('click', () => $('#install-guide-modal').classList.remove('open'));

  $('#btn-enable-notifs').addEventListener('click', async () => {
    if (!('Notification' in window)) return toast('Tu navegador no soporta notificaciones.');
    const perm = await Notification.requestPermission();
    state.notificationsEnabled = perm === 'granted';
    await saveCloudVault();
    renderMiEspacio();
    if (state.notificationsEnabled) {
      await showSafeNotification('BrisaPlan', 'Notificaciones activadas correctamente.');
      toast('Notificaciones activadas');
    }
  });

  // Tour Interactivo
  $('#btn-open-tutorial').addEventListener('click', openTutorial);
  $('#tut-skip').addEventListener('click', async () => {
    state.tutorialSeen = true;
    await saveCloudVault();
    closeTutorial();
  });
  $('#tut-next').addEventListener('click', async () => {
    if (tutorialIndex < TUTORIAL_STEPS.length - 1) {
      tutorialIndex += 1;
      renderTutorialStep();
    } else {
      state.tutorialSeen = true;
      await saveCloudVault();
      closeTutorial();
      toast('¡Listo! Ya conoces todo BrisaPlan.');
    }
  });

  // Delegación global de clics
  document.body.addEventListener('click', async (e) => {
    // Cuadritos de color
    const swatch = e.target.closest('[data-pick-hex]');
    if (swatch) {
      const hex = swatch.dataset.pickHex;
      const grp = swatch.dataset.colorGroup;
      if (grp === 'task') selectedTaskColor = hex;
      else if (grp === 'quick') selectedQuickTaskColor = hex;
      else if (grp === 'block') selectedBlockColor = hex;
      renderAllColorPickers();
      return;
    }

    // Selector de día móvil en agenda
    const mobDayBtn = e.target.closest('[data-select-mobile-day]');
    if (mobDayBtn) {
      mobileActiveWeekday = Number(mobDayBtn.dataset.selectMobileDay);
      renderWeeklyAgenda();
      return;
    }

    // Desvincular cuenta correo
    const unlinkBtn = e.target.closest('[data-act="unlink-mail-acc"]');
    if (unlinkBtn) {
      e.stopPropagation();
      const email = unlinkBtn.dataset.email;
      disconnectMailAccount(state, email);
      if (activeMailSession === email) activeMailSession = 'all';
      await renderAll();
      toast(`Sesión ${email} cerrada`);
      return;
    }

    // Cambiar sesión de cuenta correo
    const sessionChip = e.target.closest('[data-select-mail-session]');
    if (sessionChip) {
      activeMailSession = sessionChip.dataset.selectMailSession;
      renderMail();
      return;
    }

    const actEl = e.target.closest('[data-act]');
    if (!actEl) return;
    const { act, id } = actEl.dataset;

    if (act === 'open-edit-block') {
      openBlockModal({ id });
    } else if (act === 'quick-add-day-block') {
      openBlockModal({ presetDay: Number(actEl.dataset.day), presetDate: actEl.dataset.iso });
    } else if (act === 'toggle-habit') {
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
      toast('Tarea vinculada al temporizador Pomodoro');
    } else if (act === 'star-mail') {
      toggleMessageImportant(state, id);
      await renderAll();
    } else if (act === 'read-mail') {
      toggleMessageRead(state, id);
      await renderAll();
    } else if (act === 'del-mail') {
      removeMessage(state, id);
      await renderAll();
    } else if (act === 'jump-mail-account') {
      activeMailSession = actEl.dataset.email || 'all';
      mailTabFilter = 'important';
      switchTab('correos');
      renderMail();
    }
  });

  // Delegación global de inputs (ruleta de colores)
  document.body.addEventListener('input', async (e) => {
    const wheelGrp = e.target.dataset.wheelGroup;
    if (wheelGrp) {
      const hex = e.target.value;
      if (wheelGrp === 'task') selectedTaskColor = hex;
      else if (wheelGrp === 'quick') selectedQuickTaskColor = hex;
      else if (wheelGrp === 'block') selectedBlockColor = hex;
      renderAllColorPickers();
      return;
    }

    const recolorTaskId = e.target.dataset.recolorTask;
    if (recolorTaskId) {
      updateTaskColor(state, recolorTaskId, e.target.value);
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
        toast('¡Sesión de enfoque terminada!');
        await showSafeNotification('BrisaPlan — Pomodoro', 'Completaste tu bloque de concentración.');
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

  // Cerrar sesión explícito
  $('#btn-logout-only').addEventListener('click', async () => {
    if (!confirm('¿Cerrar sesión en este dispositivo?')) return;
    clearLocalVaultSession(currentUser?.uid);
    await signOut(auth);
    currentUser = null;
    vaultSecret = null;
    vaultSalt = null;
    state = createCleanState();
    document.body.classList.add('auth-locked');
    $('#login-gate').style.display = 'flex';
    $('#app-shell').style.display = 'none';
    showLoginStep('auth');
    toast('Sesión cerrada');
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  await initServiceWorker();
  applyTheme(localStorage.getItem('brisaplan_theme_v7') === 'dark');
  const dueDateInput = $('#task-due-date');
  if (dueDateInput) dueDateInput.value = todayISO();
  updatePomodoroText();
  setupEvents();

  try {
    await setPersistence(auth, browserLocalPersistence);
    const redirectRes = await getRedirectResult(auth);
    if (redirectRes && redirectRes.user) {
      await handleUserAuthenticated(redirectRes.user);
      return;
    }
  } catch (err) {
    console.error(err);
  }

  onAuthStateChanged(auth, async (user) => {
    if (user && !vaultSecret) {
      await handleUserAuthenticated(user);
    } else if (!user && !isUnlocking) {
      currentUser = null;
      document.body.classList.add('auth-locked');
      $('#login-gate').style.display = 'flex';
      $('#app-shell').style.display = 'none';
      showLoginStep('auth');
    }
  });
});
