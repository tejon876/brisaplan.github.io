import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  initializeFirestore,
  persistentLocalCache,
  doc,
  setDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCw1fvDYs329McPQS2mvewDQbCjTumX8z8",
  authDomain: "brisaplan-e0466.firebaseapp.com",
  projectId: "brisaplan-e0466",
  storageBucket: "brisaplan-e0466.firebasestorage.app",
  messagingSenderId: "1015496019382",
  appId: "1:1015496019382:web:9b6ede5a09a72ebc090517",
  measurementId: "G-NZY6ZH6TY6"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, {
  localCache: persistentLocalCache()
});

const STORAGE_KEY = 'brisaplan_v9_state';
const ONBOARDING_KEY = 'brisaplan_v9_onboarded';

const defaultState = {
  updatedAt: Date.now(),
  darkMode: true,
  agenda: [
    { id: 1, title: 'Redes y Telecomunicaciones', day: 'Lunes', time: '07:00', type: 'permanent', expiresAt: null, color: '#93c5fd' }
  ],
  tasks: [
    { id: 101, title: 'Entregar práctica de subredes VLSM', due: '', priority: 'Alta', color: '#fed7aa', done: false }
  ],
  habits: [
    { id: 201, name: 'Estudio de idiomas', streak: 4, lastDone: null }
  ],
  mails: [
    { id: 301, account: 'alumno@uteq.edu.mx', subject: 'Aviso de coordinación académica', category: 'Universidad' }
  ]
};

let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultState;
let currentUser = null;
let unsubscribeSnapshot = null;
let isApplyingRemote = false;

const Cap = window.Capacitor;
const isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
const LocalNotifications = Cap?.Plugins?.LocalNotifications;
const Preferences = Cap?.Plugins?.Preferences;
const GoogleAuth = Cap?.Plugins?.GoogleAuth;

if (isNative && GoogleAuth) {
  GoogleAuth.initialize({
    clientId: '1015496019382-aneel8ga9orksq1uvv1ot1d1fmg61c67.apps.googleusercontent.com',
    scopes: ['profile', 'email'],
    grantOfflineAccess: true
  }).catch(() => {});
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

async function syncNativeWidget() {
  const pending = state.tasks.filter((t) => !t.done);
  const summary = pending.length === 0
    ? 'Todo al día • 0 entregas pendientes'
    : `${pending.length} pendiente${pending.length > 1 ? 's' : ''} • ${state.habits.length} hábitos`;
  const nextTask = pending.length > 0
    ? `Siguiente: ${pending[0].title} (${pending[0].priority})`
    : 'Toca para revisar tu agenda';

  if (Preferences) {
    await Preferences.set({ key: 'brisaplan_widget_summary', value: summary }).catch(() => {});
    await Preferences.set({ key: 'brisaplan_widget_next', value: nextTask }).catch(() => {});
  }
}

let cloudSyncTimeout = null;
function saveState(silent = false) {
  state.updatedAt = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  syncNativeWidget();
  if (!silent) showToast('Guardado localmente');

  if (currentUser && !isApplyingRemote) {
    setSyncBadge('Sincronizando...');
    clearTimeout(cloudSyncTimeout);
    cloudSyncTimeout = setTimeout(async () => {
      try {
        await setDoc(doc(db, 'users', currentUser.uid), state, { merge: true });
        setSyncBadge(navigator.onLine ? 'Sincronizado' : 'Offline (En cola)');
      } catch (_) {
        setSyncBadge('Offline (Guardado)');
      }
    }, 450);
  }
}

function setSyncBadge(text) {
  const pill = document.getElementById('syncPill');
  const label = document.getElementById('syncText');
  label.textContent = text;
  if (!navigator.onLine) {
    pill.classList.add('offline');
  } else {
    pill.classList.remove('offline');
  }
}

function updateNetworkUI() {
  const online = navigator.onLine;
  setSyncBadge(online ? (currentUser ? 'En línea' : 'Local listo') : 'Modo Offline');
  const mailBanner = document.getElementById('mailOfflineBanner');
  const mailBadge = document.getElementById('mailNetBadge');
  if (online) {
    mailBanner.classList.remove('visible');
    mailBadge.textContent = 'En línea';
  } else {
    mailBanner.classList.add('visible');
    mailBadge.textContent = 'Sin red (Caché)';
  }
}
window.addEventListener('online', updateNetworkUI);
window.addEventListener('offline', updateNetworkUI);
updateNetworkUI();

const accountModal = document.getElementById('accountModal');
document.getElementById('accountTrigger').addEventListener('click', () => accountModal.classList.add('open'));
document.getElementById('closeAccountBtn').addEventListener('click', () => accountModal.classList.remove('open'));

document.getElementById('googleSignInBtn').addEventListener('click', async () => {
  try {
    showToast('Abriendo selector de cuentas...');
    if (isNative && GoogleAuth) {
      const googleUser = await GoogleAuth.signIn();
      const idToken = googleUser?.authentication?.idToken;
      if (!idToken) throw new Error('No se recibió token de Google');
      const credential = GoogleAuthProvider.credential(idToken);
      await signInWithCredential(auth, credential);
    } else {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    }
    accountModal.classList.remove('open');
    showToast('Sesión iniciada correctamente');
  } catch (err) {
    showToast('No se pudo completar el acceso: ' + (err?.message || 'intenta de nuevo'));
  }
});

document.getElementById('googleSignOutBtn').addEventListener('click', async () => {
  try {
    if (isNative && GoogleAuth) {
      await GoogleAuth.signOut().catch(() => {});
    }
    await signOut(auth);
    accountModal.classList.remove('open');
    showToast('Sesión cerrada');
  } catch (_) {
    showToast('Error al cerrar sesión');
  }
});

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  const loggedOutView = document.getElementById('loggedOutView');
  const loggedInView = document.getElementById('loggedInView');
  const userLabel = document.getElementById('userLabel');
  const userAvatar = document.getElementById('userAvatar');

  if (unsubscribeSnapshot) {
    unsubscribeSnapshot();
    unsubscribeSnapshot = null;
  }

  if (user) {
    loggedOutView.style.display = 'none';
    loggedInView.style.display = 'block';
    const displayName = user.displayName || user.email.split('@')[0];
    userLabel.textContent = displayName.split(' ')[0];
    document.getElementById('sheetUserName').textContent = displayName;
    document.getElementById('sheetUserEmail').textContent = user.email;

    if (user.photoURL) {
      userAvatar.innerHTML = `<img src="${user.photoURL}" alt="Avatar" />`;
      document.getElementById('sheetAvatar').innerHTML = `<img src="${user.photoURL}" alt="Avatar" />`;
    } else {
      const initial = displayName.charAt(0).toUpperCase();
      userAvatar.textContent = initial;
      document.getElementById('sheetAvatar').textContent = initial;
    }

    unsubscribeSnapshot = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      if (!snap.exists()) {
        saveState(true);
        return;
      }
      const remote = snap.data();
      if (remote && remote.updatedAt && remote.updatedAt > state.updatedAt) {
        isApplyingRemote = true;
        state = { ...state, ...remote };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        renderAll();
        isApplyingRemote = false;
      }
      setSyncBadge(navigator.onLine ? 'Sincronizado' : 'Offline');
    });
  } else {
    loggedOutView.style.display = 'block';
    loggedInView.style.display = 'none';
    userLabel.textContent = 'Acceder';
    userAvatar.textContent = 'G';
    setSyncBadge('Local listo');
  }
});

const PRIORITY_OFFSETS_MINUTES = {
  Alta: [1440, 120, 30],
  Media: [360, 60],
  Baja: [120]
};

async function schedulePriorityNotifications(task) {
  if (!task.due || !LocalNotifications) return;
  const dueMs = new Date(task.due).getTime();
  if (isNaN(dueMs) || dueMs <= Date.now()) return;

  const offsets = PRIORITY_OFFSETS_MINUTES[task.priority] || [60];
  const notifications = [];

  offsets.forEach((mins, idx) => {
    const triggerMs = dueMs - mins * 60000;
    if (triggerMs > Date.now()) {
      const timeText = mins >= 60 ? `${mins / 60} h` : `${mins} min`;
      notifications.push({
        id: Math.floor((task.id % 100000) * 10 + idx),
        title: `BrisaPlan • Prioridad ${task.priority}`,
        body: `"${task.title}" vence en ${timeText}.`,
        schedule: { at: new Date(triggerMs), allowWhileIdle: true },
        smallIcon: 'ic_stat_icon_config_sample'
      });
    }
  });

  if (notifications.length > 0) {
    try {
      await LocalNotifications.schedule({ notifications });
      showToast(`${notifications.length} alerta(s) programadas`);
    } catch (_) {}
  }
}

document.getElementById('testNotifBtn').addEventListener('click', async () => {
  if (LocalNotifications) {
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display === 'granted') {
      await LocalNotifications.schedule({
        notifications: [{
          id: 99999,
          title: 'BrisaPlan • Alerta de Prueba',
          body: 'Las notificaciones nativas están funcionando correctamente.',
          schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true }
        }]
      });
      showToast('Notificación llegará en 5 segundos');
    } else {
      showToast('Activa el permiso de notificaciones');
    }
  } else {
    showToast('Prueba disponible al instalar el APK en Android');
  }
});

const permsModal = document.getElementById('permsModal');
document.getElementById('openPermsBtn').addEventListener('click', () => permsModal.classList.add('open'));
document.getElementById('closePermsBtn').addEventListener('click', () => {
  localStorage.setItem(ONBOARDING_KEY, '1');
  permsModal.classList.remove('open');
});

document.getElementById('reqNotifPermBtn').addEventListener('click', async () => {
  if (LocalNotifications) {
    const res = await LocalNotifications.requestPermissions();
    showToast(res.display === 'granted' ? 'Permiso concedido' : 'Permiso denegado en ajustes');
  } else {
    showToast('Permisos gestionados por Android al abrir el APK');
  }
});

if (!localStorage.getItem(ONBOARDING_KEY)) {
  setTimeout(() => permsModal.classList.add('open'), 600);
}

const themeToggle = document.getElementById('themeToggle');
function applyTheme() {
  document.body.classList.toggle('dark-mode', state.darkMode);
  themeToggle.textContent = state.darkMode ? 'Claro' : 'Oscuro';
}
themeToggle.addEventListener('click', () => {
  state.darkMode = !state.darkMode;
  applyTheme();
  saveState(true);
});
applyTheme();

document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.view-section').forEach((s) => s.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.target).classList.add('active');
  });
});

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
      state.agenda = state.agenda.filter((a) => a.id !== Number(b.dataset.delAgenda));
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

let pomoSeconds = 25 * 60;
let pomoTimer = null;
function updatePomoUI() {
  const m = String(Math.floor(pomoSeconds / 60)).padStart(2, '0');
  const s = String(pomoSeconds % 60).padStart(2, '0');
  document.getElementById('pomoDisplay').textContent = `${m}:${s}`;
}
document.getElementById('pomoStart').addEventListener('click', () => {
  if (pomoTimer) return;
  document.getElementById('pomoStatus').textContent = 'Activo';
  pomoTimer = setInterval(() => {
    if (pomoSeconds > 0) {
      pomoSeconds--;
      updatePomoUI();
    } else {
      clearInterval(pomoTimer);
      pomoTimer = null;
      document.getElementById('pomoStatus').textContent = 'Listo';
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
  document.getElementById('pomoStatus').textContent = 'Pomodoro';
});

function renderTasks() {
  const list = document.getElementById('taskList');
  list.innerHTML = '';
  state.tasks.forEach((t) => {
    const div = document.createElement('div');
    div.className = `list-item ${t.done ? 'completed' : ''}`;
    div.style.borderLeftColor = t.color || '#fed7aa';
    const dueLabel = t.due ? `Vence: ${new Date(t.due).toLocaleString()}` : 'Sin hora límite';
    div.innerHTML = `
      <div style="cursor:pointer; flex:1;" data-toggle-task="${t.id}">
        <div class="item-title"><strong>[${t.priority}]</strong> ${t.title}</div>
        <div class="item-meta">${dueLabel}</div>
      </div>
      <button class="btn" data-del-task="${t.id}">Borrar</button>
    `;
    list.appendChild(div);
  });

  list.querySelectorAll('[data-toggle-task]').forEach((el) => {
    el.addEventListener('click', () => {
      const task = state.tasks.find((x) => x.id === Number(el.dataset.toggleTask));
      if (task) task.done = !task.done;
      saveState();
      renderTasks();
    });
  });

  list.querySelectorAll('[data-del-task]').forEach((b) => {
    b.addEventListener('click', () => {
      state.tasks = state.tasks.filter((x) => x.id !== Number(b.dataset.delTask));
      saveState();
      renderTasks();
    });
  });
}

document.getElementById('addTaskBtn').addEventListener('click', async () => {
  const title = document.getElementById('taskInput').value.trim();
  if (!title) return;
  const due = document.getElementById('taskDue').value;
  const priority = document.getElementById('taskPriority').value;
  const color = document.getElementById('taskColor').value;
  const task = { id: Date.now(), title, due, priority, color, done: false };

  state.tasks.unshift(task);
  document.getElementById('taskInput').value = '';
  saveState();
  renderTasks();
  await schedulePriorityNotifications(task);
});

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
          ${doneToday ? 'Cumplido hoy' : 'Completar hoy'}
        </button>
        <button class="btn" data-del-habit="${h.id}">Quitar</button>
      </div>
    `;
    grid.appendChild(card);
  });

  grid.querySelectorAll('[data-check-habit]').forEach((b) => {
    b.addEventListener('click', () => {
      const habit = state.habits.find((x) => x.id === Number(b.dataset.checkHabit));
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
      state.habits = state.habits.filter((x) => x.id !== Number(b.dataset.delHabit));
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
          <div class="item-meta">${m.account} • ${m.category}</div>
        </div>
        <button class="btn" data-del-mail="${m.id}">Archivar</button>
      `;
      list.appendChild(div);
    });

  list.querySelectorAll('[data-del-mail]').forEach((b) => {
    b.addEventListener('click', () => {
      state.mails = state.mails.filter((x) => x.id !== Number(b.dataset.delMail));
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
  state.mails.unshift({ id: Date.now(), account, subject, category });
  document.getElementById('mailSubject').value = '';
  saveState();
  renderMails();
});

document.getElementById('forceWidgetSyncBtn').addEventListener('click', async () => {
  await syncNativeWidget();
  showToast('Datos enviados al Widget de Android');
});

const arcoModal = document.getElementById('arcoModal');
document.getElementById('openArcoBtn').addEventListener('click', () => arcoModal.classList.add('open'));
document.getElementById('closeArcoBtn').addEventListener('click', () => arcoModal.classList.remove('open'));

document.getElementById('exportDataBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'brisaplan-respaldo-arco.json';
  a.click();
});

document.getElementById('wipeDataBtn').addEventListener('click', () => {
  localStorage.removeItem(STORAGE_KEY);
  state = JSON.parse(JSON.stringify(defaultState));
  saveState();
  renderAll();
  arcoModal.classList.remove('open');
  showToast('Datos locales eliminados');
});

function renderAll() {
  renderAgenda();
  renderTasks();
  renderHabits();
  renderMails();
  syncNativeWidget();
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

renderAll();
