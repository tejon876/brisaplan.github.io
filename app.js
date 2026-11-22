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

const STORAGE_KEY = 'brisaplan_v10_state';
const ONBOARDING_KEY = 'brisaplan_v10_onboarded';

const defaultState = {
  updatedAt: Date.now(),
  darkMode: true,
  selectedWidgetType: 'hoy',
  enabledWidgets: { hoy: true, agenda: true, habits: true },
  agenda: [
    { id: 1, title: 'Bloque de estudio o trabajo', day: 'Lunes', time: '09:00', type: 'permanent', expiresAt: null, color: '#93c5fd' }
  ],
  tasks: [
    { id: 101, title: 'Revisar pendientes principales de la semana', due: '', priority: 'Alta', color: '#fed7aa', done: false }
  ],
  habits: [
    { id: 201, name: 'Lectura o práctica diaria', streak: 3, lastDone: null }
  ],
  mails: [
    { id: 301, account: 'usuario@ejemplo.com', subject: 'Bienvenido a tu organizador de correos', category: 'Importante' }
  ]
};

let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultState;
if (!state.enabledWidgets) state.enabledWidgets = { hoy: true, agenda: true, habits: true };
let currentUser = null;
let unsubscribeSnapshot = null;
let isApplyingRemote = false;

const Cap = window.Capacitor;
const isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
const LocalNotifications = Cap?.Plugins?.LocalNotifications;
const Preferences = Cap?.Plugins?.Preferences;
const GoogleAuth = Cap?.Plugins?.GoogleAuth;
const BrisaWidgetBridge = Cap?.Plugins?.BrisaWidgetBridge;

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
  window.__toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

function getWidgetStrings() {
  const pending = state.tasks.filter((t) => !t.done);
  const hoyTitle = pending.length === 0
    ? 'Todo al día • 0 pendientes'
    : `${pending.length} pendiente${pending.length > 1 ? 's' : ''} • ${state.habits.length} hábitos`;
  const hoySub = pending.length > 0
    ? `Siguiente: ${pending[0].title} (${pending[0].priority})`
    : 'Toca para abrir BrisaPlan';

  const ag1 = state.agenda.length > 0
    ? `${state.agenda[0].day} ${state.agenda[0].time} • ${state.agenda[0].title}`
    : 'Sin bloques programados';
  const ag2 = state.agenda.length > 1
    ? `Luego: ${state.agenda[1].day} ${state.agenda[1].time} • ${state.agenda[1].title}`
    : `${state.agenda.length} bloque(s) en tu agenda`;

  const topHabit = state.habits[0];
  const habTitle = topHabit ? `${topHabit.name}: ${topHabit.streak} días` : 'Sin hábitos activos';
  const habSub = `${state.habits.length} hábito(s) en seguimiento diario`;

  return { hoyTitle, hoySub, ag1, ag2, habTitle, habSub };
}

async function syncNativeWidgets() {
  const w = getWidgetStrings();
  if (Preferences) {
    await Preferences.set({ key: 'bp_w_hoy_title', value: state.enabledWidgets.hoy ? w.hoyTitle : 'Widget pausado' }).catch(() => {});
    await Preferences.set({ key: 'bp_w_hoy_sub', value: w.hoySub }).catch(() => {});
    await Preferences.set({ key: 'bp_w_agenda_1', value: state.enabledWidgets.agenda ? w.ag1 : 'Widget pausado' }).catch(() => {});
    await Preferences.set({ key: 'bp_w_agenda_2', value: w.ag2 }).catch(() => {});
    await Preferences.set({ key: 'bp_w_habit_title', value: state.enabledWidgets.habits ? w.habTitle : 'Widget pausado' }).catch(() => {});
    await Preferences.set({ key: 'bp_w_habit_sub', value: w.habSub }).catch(() => {});
  }
  if (BrisaWidgetBridge && BrisaWidgetBridge.refreshAll) {
    await BrisaWidgetBridge.refreshAll().catch(() => {});
  }
}

let cloudSyncTimeout = null;
function saveState(silent = false) {
  state.updatedAt = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  syncNativeWidgets();
  if (!silent) showToast('Guardado');

  if (currentUser && !isApplyingRemote) {
    setSyncChip('Sincronizando...');
    clearTimeout(cloudSyncTimeout);
    cloudSyncTimeout = setTimeout(async () => {
      try {
        await setDoc(doc(db, 'users', currentUser.uid), state, { merge: true });
        setSyncChip(navigator.onLine ? 'Sincronizado' : 'Offline (En cola)');
      } catch (_) {
        setSyncChip('Offline (Guardado)');
      }
    }, 450);
  }
}

function setSyncChip(text) {
  const chip = document.getElementById('syncChip');
  const label = document.getElementById('syncText');
  label.textContent = text;
  chip.classList.toggle('offline', !navigator.onLine);
}

function updateNetworkUI() {
  const online = navigator.onLine;
  setSyncChip(online ? (currentUser ? 'Sincronizado' : 'Local') : 'Offline');
  const alert = document.getElementById('mailOfflineAlert');
  const tag = document.getElementById('mailNetTag');
  if (online) {
    alert.classList.remove('show');
    tag.textContent = 'En línea';
  } else {
    alert.classList.add('show');
    tag.textContent = 'Sin red (Caché)';
  }
}
window.addEventListener('online', updateNetworkUI);
window.addEventListener('offline', updateNetworkUI);
updateNetworkUI();

const widgetStudioModal = document.getElementById('widgetStudioModal');
function updateWidgetPreviewUI() {
  const type = state.selectedWidgetType || 'hoy';
  const w = getWidgetStrings();
  const mockTag = document.getElementById('mockTag');
  const mockTitle = document.getElementById('mockTitle');
  const mockSub = document.getElementById('mockSub');
  const enabledCheck = document.getElementById('widgetEnabledCheck');

  document.querySelectorAll('.widget-opt').forEach((el) => {
    el.classList.toggle('selected', el.dataset.wtype === type);
  });

  enabledCheck.checked = !!state.enabledWidgets[type];

  if (type === 'agenda') {
    mockTag.textContent = 'BRISAPLAN • AGENDA';
    mockTag.style.color = '#fed7aa';
    mockTitle.textContent = w.ag1;
    mockSub.textContent = w.ag2;
  } else if (type === 'habits') {
    mockTag.textContent = 'BRISAPLAN • RACHAS';
    mockTag.style.color = '#6ee7b7';
    mockTitle.textContent = w.habTitle;
    mockSub.textContent = w.habSub;
  } else {
    mockTag.textContent = 'BRISAPLAN • HOY';
    mockTag.style.color = '#93c5fd';
    mockTitle.textContent = w.hoyTitle;
    mockSub.textContent = w.hoySub;
  }
}

document.getElementById('openWidgetStudioBtn').addEventListener('click', () => {
  updateWidgetPreviewUI();
  widgetStudioModal.classList.add('open');
});
document.getElementById('openWidgetStudioBtn2').addEventListener('click', () => {
  updateWidgetPreviewUI();
  widgetStudioModal.classList.add('open');
});
document.getElementById('closeWidgetStudioBtn').addEventListener('click', () => widgetStudioModal.classList.remove('open'));

document.querySelectorAll('.widget-opt').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.selectedWidgetType = btn.dataset.wtype;
    saveState(true);
    updateWidgetPreviewUI();
  });
});

document.getElementById('widgetEnabledCheck').addEventListener('change', (e) => {
  const type = state.selectedWidgetType || 'hoy';
  state.enabledWidgets[type] = e.target.checked;
  saveState(true);
  showToast(e.target.checked ? 'Widget activado' : 'Widget pausado');
});

document.getElementById('pinWidgetOneClickBtn').addEventListener('click', async () => {
  const type = state.selectedWidgetType || 'hoy';
  state.enabledWidgets[type] = true;
  await syncNativeWidgets();

  if (isNative && BrisaWidgetBridge && BrisaWidgetBridge.pinWidget) {
    try {
      const res = await BrisaWidgetBridge.pinWidget({ type });
      if (res && res.pinned) {
        showToast('Confirma en la ventana de Android para fijarlo');
      } else {
        showToast('Mantén presionado tu fondo de pantalla > Widgets > BrisaPlan');
      }
    } catch (_) {
      showToast('Abre Widgets en tu pantalla de inicio y busca BrisaPlan');
    }
  } else {
    showToast('Función de fijado directo disponible en la App Android');
  }
});

const TUTORIAL_STEPS = [
  {
    title: '1. Agenda Base y Ajustes Temporales',
    body: 'Define tu horario fijo semanal y agrega cambios temporales por un número específico de días. Cuando expiran, tu rutina normal regresa sola.'
  },
  {
    title: '2. Entregas con Alertas Inteligentes',
    body: 'Asigna prioridad Alta, Media o Baja a tus tareas. BrisaPlan te enviará notificaciones nativas escalonadas antes de la hora límite.'
  },
  {
    title: '3. Widgets Flotantes y Modo Offline',
    body: 'Todo funciona sin internet. Desde "Widgets de inicio" puedes previsualizar qué tarjeta te gusta más y fijarla en tu teléfono con un clic.'
  },
  {
    title: '4. Respaldo Opcional en la Nube',
    body: 'Toca "Acceder" arriba a la derecha si deseas conectar tu cuenta de Google y sincronizar tus datos entre celular y computadora.'
  }
];
let tutIndex = 0;
const tutorialModal = document.getElementById('tutorialModal');

function renderTutorialStep() {
  const step = TUTORIAL_STEPS[tutIndex];
  document.getElementById('tutStepTitle').textContent = step.title;
  document.getElementById('tutStepBody').textContent = step.body;
  document.getElementById('tutCounter').textContent = `Paso ${tutIndex + 1} de ${TUTORIAL_STEPS.length}`;
  document.getElementById('tutPrevBtn').style.visibility = tutIndex === 0 ? 'hidden' : 'visible';
  document.getElementById('tutNextBtn').textContent = tutIndex === TUTORIAL_STEPS.length - 1 ? 'Finalizar' : 'Siguiente';
}

document.getElementById('openTutorialBtn').addEventListener('click', () => {
  tutIndex = 0;
  renderTutorialStep();
  tutorialModal.classList.add('open');
});
document.getElementById('closeTutBtn').addEventListener('click', () => tutorialModal.classList.remove('open'));
document.getElementById('tutPrevBtn').addEventListener('click', () => {
  if (tutIndex > 0) { tutIndex--; renderTutorialStep(); }
});
document.getElementById('tutNextBtn').addEventListener('click', () => {
  if (tutIndex < TUTORIAL_STEPS.length - 1) {
    tutIndex++;
    renderTutorialStep();
  } else {
    tutorialModal.classList.remove('open');
  }
});

const permsModal = document.getElementById('permsModal');
document.getElementById('quickPermsBtn').addEventListener('click', () => permsModal.classList.add('open'));
document.getElementById('openPermsBtn2').addEventListener('click', () => permsModal.classList.add('open'));
document.getElementById('closePermsBtn').addEventListener('click', () => {
  localStorage.setItem(ONBOARDING_KEY, '1');
  permsModal.classList.remove('open');
});
document.getElementById('openWidgetFromPermBtn').addEventListener('click', () => {
  permsModal.classList.remove('open');
  updateWidgetPreviewUI();
  widgetStudioModal.classList.add('open');
});

document.getElementById('reqNotifPermBtn').addEventListener('click', async () => {
  if (LocalNotifications) {
    const res = await LocalNotifications.requestPermissions();
    const granted = res.display === 'granted';
    document.getElementById('notifPermStatus').textContent = granted ? 'Permiso activo correctamente.' : 'Actívalo en Ajustes > Aplicaciones > BrisaPlan.';
    showToast(granted ? 'Notificaciones activadas' : 'Permiso pendiente en ajustes');
  } else if ('Notification' in window) {
    const p = await Notification.requestPermission();
    showToast(p === 'granted' ? 'Notificaciones web activadas' : 'Permiso no concedido');
  }
});

if (!localStorage.getItem(ONBOARDING_KEY)) {
  setTimeout(() => permsModal.classList.add('open'), 600);
}

const accountModal = document.getElementById('accountModal');
document.getElementById('accountBtn').addEventListener('click', () => accountModal.classList.add('open'));
document.getElementById('closeAccountBtn').addEventListener('click', () => accountModal.classList.remove('open'));

document.getElementById('googleSignInBtn').addEventListener('click', async () => {
  try {
    showToast('Conectando con Google...');
    if (isNative && GoogleAuth) {
      const googleUser = await GoogleAuth.signIn();
      const idToken = googleUser?.authentication?.idToken;
      if (!idToken) throw new Error('Token no recibido');
      const credential = GoogleAuthProvider.credential(idToken);
      await signInWithCredential(auth, credential);
    } else {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    }
    accountModal.classList.remove('open');
    showToast('Sesión iniciada');
  } catch (err) {
    showToast('Error al iniciar sesión: ' + (err?.message || 'revisa tu conexión'));
  }
});

document.getElementById('googleSignOutBtn').addEventListener('click', async () => {
  try {
    if (isNative && GoogleAuth) await GoogleAuth.signOut().catch(() => {});
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
  const accountBtn = document.getElementById('accountBtn');

  if (unsubscribeSnapshot) {
    unsubscribeSnapshot();
    unsubscribeSnapshot = null;
  }

  if (user) {
    accountBtn.classList.add('signed-in');
    loggedOutView.style.display = 'none';
    loggedInView.style.display = 'block';
    const displayName = user.displayName || user.email.split('@')[0];
    const firstName = displayName.split(' ')[0];
    userLabel.textContent = `${firstName} ✓`;
    document.getElementById('heroGreeting').textContent = `Hola, ${firstName}`;
    document.getElementById('heroSub').textContent = `Sesión activa (${user.email}) • Sincronización en la nube lista.`;
    document.getElementById('sheetUserName').textContent = displayName;
    document.getElementById('sheetUserEmail').textContent = user.email;

    if (user.photoURL) {
      userAvatar.innerHTML = `<img src="${user.photoURL}" alt="Perfil" />`;
      document.getElementById('sheetAvatar').innerHTML = `<img src="${user.photoURL}" alt="Perfil" />`;
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
      setSyncChip(navigator.onLine ? 'Sincronizado' : 'Offline');
    });
  } else {
    accountBtn.classList.remove('signed-in');
    loggedOutView.style.display = 'block';
    loggedInView.style.display = 'none';
    userLabel.textContent = 'Acceder';
    userAvatar.textContent = 'G';
    document.getElementById('heroGreeting').textContent = 'Organiza tu día con calma';
    document.getElementById('heroSub').textContent = 'Todo funciona sin internet y se respalda en tu cuenta cuando te conectas.';
    setSyncChip('Local');
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
          body: 'Las notificaciones nativas están activas.',
          schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true }
        }]
      });
      showToast('Notificación llegará en 5 segundos');
    } else {
      showToast('Activa el permiso de notificaciones');
    }
  } else {
    showToast('Prueba disponible en la app Android');
  }
});

const themeBtn = document.getElementById('themeBtn');
function applyTheme() {
  document.body.classList.toggle('dark-mode', state.darkMode);
  themeBtn.textContent = state.darkMode ? 'Claro' : 'Oscuro';
}
themeBtn.addEventListener('click', () => {
  state.darkMode = !state.darkMode;
  applyTheme();
  saveState(true);
});
applyTheme();

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.view-panel').forEach((s) => s.classList.remove('active'));
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
    div.className = 'row-item';
    div.style.borderLeftColor = item.color || '#93c5fd';
    const tag = item.type === 'override'
      ? `Temporal (expira ${new Date(item.expiresAt).toLocaleDateString()})`
      : 'Base semanal';
    div.innerHTML = `
      <div>
        <strong>${item.day} • ${item.time}</strong> — ${item.title}
        <div class="row-sub">${tag}</div>
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
  document.getElementById('pomoClock').textContent = `${m}:${s}`;
}
document.getElementById('pomoStart').addEventListener('click', () => {
  if (pomoTimer) return;
  document.getElementById('pomoTag').textContent = 'En curso';
  pomoTimer = setInterval(() => {
    if (pomoSeconds > 0) {
      pomoSeconds--;
      updatePomoUI();
    } else {
      clearInterval(pomoTimer);
      pomoTimer = null;
      document.getElementById('pomoTag').textContent = 'Completado';
    }
  }, 1000);
});
document.getElementById('pomoPause').addEventListener('click', () => {
  clearInterval(pomoTimer);
  pomoTimer = null;
  document.getElementById('pomoTag').textContent = 'Pausado';
});
document.getElementById('pomoReset').addEventListener('click', () => {
  clearInterval(pomoTimer);
  pomoTimer = null;
  pomoSeconds = 25 * 60;
  updatePomoUI();
  document.getElementById('pomoTag').textContent = 'Pomodoro';
});

function renderTasks() {
  const list = document.getElementById('taskList');
  list.innerHTML = '';
  state.tasks.forEach((t) => {
    const div = document.createElement('div');
    div.className = `row-item ${t.done ? 'done' : ''}`;
    div.style.borderLeftColor = t.color || '#fed7aa';
    const dueLabel = t.due ? `Límite: ${new Date(t.due).toLocaleString()}` : 'Sin hora límite';
    div.innerHTML = `
      <div style="cursor:pointer; flex:1;" data-toggle-task="${t.id}">
        <div class="row-title"><strong>[${t.priority}]</strong> ${t.title}</div>
        <div class="row-sub">${dueLabel}</div>
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
    card.className = 'habit-box';
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <strong>${h.name}</strong>
        <span class="tag">${h.streak} días</span>
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
      div.className = 'row-item';
      div.innerHTML = `
        <div>
          <strong>${m.subject}</strong>
          <div class="row-sub">${m.account} • ${m.category}</div>
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
  const account = document.getElementById('mailAccount').value.trim() || 'usuario@ejemplo.com';
  const subject = document.getElementById('mailSubject').value.trim();
  if (!subject) return;
  const category = document.getElementById('mailCategory').value;
  state.mails.unshift({ id: Date.now(), account, subject, category });
  document.getElementById('mailSubject').value = '';
  saveState();
  renderMails();
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
  showToast('Datos eliminados');
});

function renderAll() {
  renderAgenda();
  renderTasks();
  renderHabits();
  renderMails();
  syncNativeWidgets();
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

renderAll();
