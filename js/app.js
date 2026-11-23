window.addEventListener('unhandledrejection', (ev) => {
  console.error('BrisaPlan async error:', ev.reason);
});
import {
  getStoredRestSession,
  clearRestSession,
  refreshRestIdToken,
  restSignInWithPassword,
  restSignUpWithPassword,
  restSignInWithGoogleIdToken,
  restSendPasswordReset,
  restFirestoreGetDoc,
  restFirestoreSetDoc
} from "./firebase-bridge.js";
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

let app = null;
let auth = null;
let db = null;
let sdkModules = null;

async function ensureWebFirebaseSDK() {
  if (sdkModules) return sdkModules;
  const [appMod, authMod, fsMod] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js"),
    import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js")
  ]);
  app = appMod.initializeApp(firebaseConfig);
  auth = authMod.getAuth(app);
  db = fsMod.getFirestore(app);
  sdkModules = { ...appMod, ...authMod, ...fsMod };
  return sdkModules;
}

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
const expandedMailIds = new Set();

let deferredInstallPrompt = null;
let isUnlocking = false;

const $ = (s) => document.querySelector(s);

function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(window.__brisaToastTimer);
  window.__brisaToastTimer = setTimeout(() => el.classList.remove('show'), 4000);
}

function esc(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function isCapacitorNativeApp() {
  return Boolean(
    window.Capacitor &&
      typeof window.Capacitor.isNativePlatform === 'function' &&
      window.Capacitor.isNativePlatform()
  );
}

function isAndroidDevice() {
  return /Android/i.test(navigator.userAgent || '');
}

async function ensureAuthPersistenceSafe() {
  if (isCapacitorNativeApp()) return;
  try {
    const sdk = await ensureWebFirebaseSDK();
    await sdk.setPersistence(auth, sdk.browserLocalPersistence);
  } catch (e) {
    console.warn('Persistence fallback:', e?.code || e?.message);
  }
}

const NATIVE_GOOGLE_CLIENT_ID = "1015496019382-aneel8ga9orksq1uvv1ot1d1fmg61c67.apps.googleusercontent.com";

function initNativeGoogleAuth() {
  try {
    const gAuth = window.Capacitor?.Plugins?.GoogleAuth;
    if (isCapacitorNativeApp() && gAuth && typeof gAuth.initialize === 'function') {
      gAuth.initialize({
        clientId: NATIVE_GOOGLE_CLIENT_ID,
        scopes: ['profile', 'email'],
        grantOfflineAccess: true
      }).catch(() => {});
    }
  } catch (e) {
    console.warn('GoogleAuth init:', e);
  }
}

function clearAuthErrorFromUrl() {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has('apiKey') || url.hash.includes('error') || url.search.includes('error')) {
      window.history.replaceState({}, document.title, url.pathname);
    }
  } catch {}
}

function getOAuthRedirectUri() {
  if (isCapacitorNativeApp()) {
    return "https://tejon876.github.io/oauth-bridge.html";
  }
  try {
    const origin = window.location.origin || '';
    const path = window.location.pathname || '/';
    if (origin.startsWith('http')) {
      const cleanPath = path.endsWith('index.html') ? path.slice(0, -'index.html'.length) : path;
      return `${origin}${cleanPath.endsWith('/') ? cleanPath : cleanPath + '/'}`;
    }
  } catch {}
  return "https://tejon876.github.io/";
}

function openExternalAuthFlow(url) {
  try {
    const capBrowser = window.Capacitor?.Plugins?.Browser;
    if (capBrowser && typeof capBrowser.open === "function") {
      return capBrowser.open({ url, presentationStyle: 'popover' });
    }
  } catch {}
  window.open(url, "_blank", "noopener,noreferrer");
  return Promise.resolve();
}

async function closeExternalAuthBrowser() {
  try {
    const capBrowser = window.Capacitor?.Plugins?.Browser;
    if (capBrowser && typeof capBrowser.close === "function") {
      await capBrowser.close();
    }
  } catch {}
}

async function processOAuthReturnUrl(rawUrl) {
  if (!rawUrl || !rawUrl.startsWith("brisaplan://")) return false;
  clearAuthErrorFromUrl();
  await closeExternalAuthBrowser();
  try {
    const normalized = rawUrl.replace("brisaplan://auth", "https://auth.local/").replace("brisaplan://", "https://auth.local/");
    const parsed = new URL(normalized);
    const hashParams = new URLSearchParams((parsed.hash || '').replace(/^#/, ''));
    const idToken = parsed.searchParams.get("id_token") || hashParams.get("id_token");
    const accessToken = parsed.searchParams.get("access_token") || hashParams.get("access_token");
    const errParam = parsed.searchParams.get("error") || hashParams.get("error");

    if (errParam) {
      toast(`Google canceló o bloqueó el acceso (${errParam}).`);
      return true;
    }

    if (idToken || accessToken) {
      toast("Conectando tu cuenta de Google...");
      await ensureAuthPersistenceSafe();
      const credential = GoogleAuthProvider.credential(idToken || null, accessToken || null);
      const res = await signInWithCredential(auth, credential);
      if (res?.user) {
        await handleUserAuthenticated(res.user);
      }
      return true;
    }
  } catch (e) {
    console.error(e);
    toast("No se pudo completar el retorno desde Google. Entra con correo y contraseña.");
  }
  return false;
}

function setupCapacitorAppUrlListener() {
  try {
    const capApp = window.Capacitor?.Plugins?.App;
    if (capApp && typeof capApp.addListener === "function") {
      capApp.addListener("appUrlOpen", async ({ url }) => {
        await processOAuthReturnUrl(url);
      });
      if (typeof capApp.getLaunchUrl === "function") {
        capApp.getLaunchUrl().then(async (launch) => {
          if (launch?.url) await processOAuthReturnUrl(launch.url);
        }).catch(() => {});
      }
    }
  } catch {}
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
  if ('serviceWorker' in navigator && !isCapacitorNativeApp()) {
    try {
      swReg = await navigator.serviceWorker.register('./sw.js');
    } catch {}
  }
}

async function requestNativeNotificationPermission() {
  if (isCapacitorNativeApp()) {
    try {
      const localNotifs = window.Capacitor?.Plugins?.LocalNotifications;
      if (localNotifs && typeof localNotifs.requestPermissions === 'function') {
        const res = await localNotifs.requestPermissions();
        return res?.display === 'granted';
      }
    } catch {}
  }
  if (!('Notification' in window)) return false;
  const perm = await Notification.requestPermission();
  return perm === 'granted';
}

async function showSafeNotification(title, body) {
  if (isCapacitorNativeApp()) {
    try {
      const localNotifs = window.Capacitor?.Plugins?.LocalNotifications;
      if (localNotifs && typeof localNotifs.schedule === 'function') {
        await localNotifs.schedule({
          notifications: [
            {
              id: Math.floor(Date.now() % 2147483000),
              title,
              body,
              schedule: { at: new Date(Date.now() + 800) }
            }
          ]
        });
        return;
      }
    } catch {}
  }

  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    if (swReg && swReg.showNotification) {
      await swReg.showNotification(title, { body });
    } else {
      new Notification(title, { body });
    }
  } catch {}
}

async function scheduleAndroidNativeReminders() {
  if (!isCapacitorNativeApp() || !state?.notificationsEnabled) return;
  try {
    const localNotifs = window.Capacitor?.Plugins?.LocalNotifications;
    if (!localNotifs || typeof localNotifs.schedule !== 'function') return;

    const pending = await localNotifs.getPending().catch(() => ({ notifications: [] }));
    if (pending?.notifications?.length) {
      await localNotifs.cancel({ notifications: pending.notifications }).catch(() => {});
    }

    const now = new Date();
    const today = todayISO();
    const notifications = [];
    let nextId = 1001;

    const todayBlocks = (state.agenda || []).filter((a) => isAgendaItemActiveOnDate(a, today));
    for (const b of todayBlocks) {
      if (!b.time || !b.time.includes(':')) continue;
      const [hh, mm] = b.time.split(':').map(Number);
      const startAt = new Date();
      startAt.setHours(hh, mm, 0, 0);

      const preAt = new Date(startAt.getTime() - 10 * 60000);
      if (preAt > now) {
        notifications.push({
          id: nextId++,
          title: 'Próximo bloque en 10 min',
          body: `${b.title} comienza a las ${b.time}`,
          schedule: { at: preAt, allowWhileIdle: true }
        });
      }
      if (startAt > now) {
        notifications.push({
          id: nextId++,
          title: '¡Es hora de tu bloque!',
          body: `${b.title} (${b.time}${b.endTime ? ' - ' + b.endTime : ''})`,
          schedule: { at: startAt, allowWhileIdle: true }
        });
      }
    }

    const pendingTasks = (state.tasks || []).filter((t) => !t.done && t.dueDate === today && t.dueTime);
    for (const t of pendingTasks) {
      if (!t.dueTime.includes(':')) continue;
      const [hh, mm] = t.dueTime.split(':').map(Number);
      const dueAt = new Date();
      dueAt.setHours(hh, mm, 0, 0);

      const preAt = new Date(dueAt.getTime() - 30 * 60000);
      if (preAt > now) {
        notifications.push({
          id: nextId++,
          title: 'Entrega en 30 minutos',
          body: `${t.title} vence a las ${t.dueTime}`,
          schedule: { at: preAt, allowWhileIdle: true }
        });
      }
      if (dueAt > now) {
        notifications.push({
          id: nextId++,
          title: '¡Hora límite de entrega!',
          body: `${t.title} (${t.dueTime})`,
          schedule: { at: dueAt, allowWhileIdle: true }
        });
      }
    }

    if (notifications.length) {
      await localNotifs.schedule({ notifications });
    }
  } catch (e) {
    console.error('Error programando notificaciones nativas:', e);
  }
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
  if (isCapacitorNativeApp() || getStoredRestSession()) {
    return await restFirestoreGetDoc(`users/${uid}/meta/vault`);
  }
  const sdk = await ensureWebFirebaseSDK();
  const metaRef = sdk.doc(db, 'users', uid, 'meta', 'vault');
  const snap = await sdk.getDoc(metaRef);
  return snap.exists() ? snap.data() : null;
}

async function saveUserVaultMeta(uid, salt) {
  const payload = { salt, hasMaster: true, updatedAt: new Date().toISOString() };
  if (isCapacitorNativeApp() || getStoredRestSession()) {
    await restFirestoreSetDoc(`users/${uid}/meta/vault`, payload);
    return;
  }
  const sdk = await ensureWebFirebaseSDK();
  const metaRef = sdk.doc(db, 'users', uid, 'meta', 'vault');
  await sdk.setDoc(metaRef, payload);
}

/* ==================== MODO OFFLINE LOCAL-FIRST Y SINCRONIZACIÓN ==================== */
const OFFLINE_USER_KEY = 'brisaplan_offline_user_v74';
const NOTIFIED_LOG_KEY = 'brisaplan_notified_events_v74';

function saveOfflineUserProfile(user) {
  if (!user) return;
  try {
    localStorage.setItem(OFFLINE_USER_KEY, JSON.stringify({
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || '',
      photoURL: user.photoURL || ''
    }));
  } catch {}
}

function getOfflineUserProfile() {
  try {
    const raw = localStorage.getItem(OFFLINE_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearOfflineUserProfile() {
  try { localStorage.removeItem(OFFLINE_USER_KEY); } catch {}
}

function saveLocalEncryptedVault(uid, encryptedPayload, pendingSync = false) {
  try {
    localStorage.setItem(`brisaplan_offline_vault_${uid}`, JSON.stringify({
      payload: encryptedPayload,
      pendingSync,
      updatedAt: Date.now()
    }));
  } catch {}
}

function getLocalEncryptedVault(uid) {
  try {
    const raw = localStorage.getItem(`brisaplan_offline_vault_${uid}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function updateSyncBadgeUI(status = 'synced') {
  const badge = $('#sync-status-badge');
  if (!badge) return;
  if (!navigator.onLine || status === 'offline-pending') {
    badge.className = 'sync-status-pill offline';
    badge.textContent = navigator.onLine ? '↻ Sincronizando...' : '⚡ Sin internet (guardado local)';
  } else {
    badge.className = 'sync-status-pill';
    badge.textContent = '● En línea · Sincronizado';
  }
}

async function flushPendingOfflineSync() {
  if (!navigator.onLine || !currentUser) return;
  const cached = getLocalEncryptedVault(currentUser.uid);
  if (!cached || !cached.pendingSync || !cached.payload) {
    updateSyncBadgeUI('synced');
    return;
  }
  try {
    if (isCapacitorNativeApp() || getStoredRestSession()) {
      await restFirestoreSetDoc(`users/${currentUser.uid}/vault/data`, cached.payload);
    } else {
      const sdk = await ensureWebFirebaseSDK();
      const vaultRef = sdk.doc(db, 'users', currentUser.uid, 'vault', 'data');
      await sdk.setDoc(vaultRef, cached.payload);
    }
    saveLocalEncryptedVault(currentUser.uid, cached.payload, false);
    updateSyncBadgeUI('synced');
    toast('Conexión recuperada: cambios sincronizados con la nube.');
  } catch {
    updateSyncBadgeUI('offline-pending');
  }
}

/* ==================== NOTIFICACIONES DE AGENDA Y ENTREGAS ==================== */
function getNotifiedMap() {
  try {
    const raw = localStorage.getItem(NOTIFIED_LOG_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function markEventNotified(key) {
  try {
    const map = getNotifiedMap();
    map[key] = Date.now();
    const cutoff = Date.now() - 3 * 86400000;
    for (const k of Object.keys(map)) {
      if (map[k] < cutoff) delete map[k];
    }
    localStorage.setItem(NOTIFIED_LOG_KEY, JSON.stringify(map));
  } catch {}
}

function timeToMinutes(hhmm) {
  if (!hhmm || !hhmm.includes(':')) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

async function checkScheduledNotifications() {
  if (!state || !state.notificationsEnabled) return;
  if (!isCapacitorNativeApp() && (!('Notification' in window) || Notification.permission !== 'granted')) return;

  const now = new Date();
  const today = todayISO();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const notified = getNotifiedMap();

  const todayBlocks = (state.agenda || []).filter((a) => isAgendaItemActiveOnDate(a, today));
  for (const b of todayBlocks) {
    const startMins = timeToMinutes(b.time);
    if (startMins === null) continue;
    const diff = startMins - nowMins;

    if (diff === 10) {
      const key = `agenda_pre_${b.id}_${today}`;
      if (!notified[key]) {
        markEventNotified(key);
        await showSafeNotification('Próximo bloque en 10 min', `${b.title} comienza a las ${b.time}`);
      }
    } else if (diff === 0) {
      const key = `agenda_now_${b.id}_${today}`;
      if (!notified[key]) {
        markEventNotified(key);
        await showSafeNotification('¡Es hora de tu bloque!', `${b.title} (${b.time}${b.endTime ? ' - ' + b.endTime : ''})`);
      }
    }
  }

  const pendingTasks = (state.tasks || []).filter((t) => !t.done && t.dueDate === today && t.dueTime);
  for (const t of pendingTasks) {
    const dueMins = timeToMinutes(t.dueTime);
    if (dueMins === null) continue;
    const diff = dueMins - nowMins;

    if (diff === 30) {
      const key = `task_pre_${t.id}_${today}`;
      if (!notified[key]) {
        markEventNotified(key);
        await showSafeNotification('Entrega en 30 minutos', `${t.title} vence a las ${t.dueTime}`);
      }
    } else if (diff === 0) {
      const key = `task_now_${t.id}_${today}`;
      if (!notified[key]) {
        markEventNotified(key);
        await showSafeNotification('¡Hora límite de entrega!', `${t.title} (${t.dueTime})`);
      }
    }
  }
}

async function loadCloudVault(uid, secret, salt) {
  const localCache = getLocalEncryptedVault(uid);

  if ((!navigator.onLine || (localCache && localCache.pendingSync)) && localCache && localCache.payload) {
    const decryptedLocal = await decryptVaultData(localCache.payload, secret, salt);
    if (navigator.onLine && localCache.pendingSync) {
      flushPendingOfflineSync().catch(() => {});
    }
    return { ...createCleanState(), ...decryptedLocal };
  }

  try {
    let encrypted = null;
    if (isCapacitorNativeApp() || getStoredRestSession()) {
      encrypted = await restFirestoreGetDoc(`users/${uid}/vault/data`);
    } else {
      const sdk = await ensureWebFirebaseSDK();
      const vaultRef = sdk.doc(db, 'users', uid, 'vault', 'data');
      const snap = await sdk.getDoc(vaultRef);
      encrypted = snap.exists() ? snap.data() : null;
    }
    if (!encrypted) {
      if (localCache && localCache.payload) {
        const decryptedLocal = await decryptVaultData(localCache.payload, secret, salt);
        return { ...createCleanState(), ...decryptedLocal };
      }
      return createCleanState();
    }
    saveLocalEncryptedVault(uid, encrypted, false);
    const decrypted = await decryptVaultData(encrypted, secret, salt);
    return { ...createCleanState(), ...decrypted };
  } catch (err) {
    if (localCache && localCache.payload) {
      const decryptedLocal = await decryptVaultData(localCache.payload, secret, salt);
      return { ...createCleanState(), ...decryptedLocal };
    }
    throw err;
  }
}

async function saveCloudVault() {
  if (!currentUser || !vaultSecret || !vaultSalt) return;
  const encrypted = await encryptVaultData(state, vaultSecret, vaultSalt);

  saveLocalEncryptedVault(currentUser.uid, encrypted, true);
  scheduleAndroidNativeReminders();

  if (!navigator.onLine) {
    updateSyncBadgeUI('offline-pending');
    return;
  }

  try {
    if (isCapacitorNativeApp() || getStoredRestSession()) {
      await restFirestoreSetDoc(`users/${currentUser.uid}/vault/data`, encrypted);
    } else {
      const sdk = await ensureWebFirebaseSDK();
      const vaultRef = sdk.doc(db, 'users', currentUser.uid, 'vault', 'data');
      await sdk.setDoc(vaultRef, encrypted);
    }
    saveLocalEncryptedVault(currentUser.uid, encrypted, false);
    updateSyncBadgeUI('synced');
  } catch {
    updateSyncBadgeUI('offline-pending');
  }
}

async function tryLinkEmailPasswordToCurrentUser(rawPassword) {
  if (isCapacitorNativeApp()) return;
  try {
    const sdk = await ensureWebFirebaseSDK();
    const user = auth?.currentUser;
    if (!user || !user.email || !rawPassword || rawPassword.length < 6) return;
    const hasPasswordProvider = (user.providerData || []).some((p) => p.providerId === 'password');
    if (hasPasswordProvider) return;
    const cred = sdk.EmailAuthProvider.credential(user.email, rawPassword);
    await sdk.linkWithCredential(user, cred);
    toast('Tu contraseña también quedó vinculada para iniciar sesión directa con correo.');
  } catch (err) {
    console.warn('Vinculación correo/contraseña omitida:', err?.code || err);
  }
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

  saveOfflineUserProfile(currentUser);
  updateSyncBadgeUI(navigator.onLine ? 'synced' : 'offline-pending');
  configureTopInstallButton();
  await renderAll(false);
  checkScheduledNotifications();
  scheduleAndroidNativeReminders();

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
  await tryLinkEmailPasswordToCurrentUser(rawPassword);
  saveLocalVaultSession(user.uid, vaultSecret, vaultSalt);
  await enterMainApp({ showWelcome: true });
}

async function handleUserAuthenticated(user) {
  if (!user || isUnlocking) return;
  isUnlocking = true;
  currentUser = user;

  try {
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

    const meta = await checkUserVaultMeta(currentUser.uid);
    if (!meta) {
      $('#vault-title-text').textContent = 'Protege tu Bóveda Cifrada';
      $('#vault-subtitle-text').textContent = `Cuenta conectada: ${currentUser.email}. Crea una contraseña (también te servirá para entrar con correo y contraseña).`;
      $('#vault-confirm-wrap').style.display = 'flex';
      $('#vault-confirm-input').required = true;
      $('#btn-vault-action').textContent = 'Guardar y entrar';
      $('#vault-mode').value = 'create';
    } else {
      $('#vault-title-text').textContent = 'Desbloquear Bóveda';
      $('#vault-subtitle-text').textContent = `Hola ${currentUser.displayName || currentUser.email}, confirma tu contraseña una sola vez en este dispositivo.`;
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
  syncNativeWidgetSummary();
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

  const todayBlocks = state.agenda.filter((a) => isAgendaItemActiveOnDate(a, today));
  $('#hoy-agenda-list').innerHTML = todayBlocks.length
    ? todayBlocks
        .map(
          (a) => `
          <div class="item-row task-color-bar" style="border-left-color:${esc(a.color || '#4A93C6')};cursor:pointer;" data-act="open-edit-block" data-id="${a.id}">
            <div style="min-width:0;flex:1;">
              <div class="item-title">${esc(a.time)}${a.endTime ? ` – ${esc(a.endTime)}` : ''} · ${esc(a.title)}</div>
              <div class="item-sub">${a.recurrence === 'permanent' ? 'Bloque semanal fijo' : 'Bloque de hoy'}</div>
            </div>
            <span class="btn btn-soft btn-sm">Editar</span>
          </div>`
        )
        .join('')
    : '<div class="empty-state">No tienes bloques programados para hoy.</div>';

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

  $('#hoy-habits-list').innerHTML = state.habits.length
    ? state.habits
        .map((h) => {
          const done = isHabitDoneToday(h);
          return `
            <div class="item-row ${done ? 'item-done' : ''}">
              <div style="display:flex;align-items:center;gap:12px;min-width:0;">
                <button class="check-circle ${done ? 'checked' : ''}" data-act="toggle-habit" data-id="${h.id}">✓</button>
                <div style="min-width:0;">
                  <div class="item-title">${esc(h.name)}</div>
                  <div class="item-sub">${esc(h.category)}</div>
                </div>
              </div>
              <span class="streak-pill">🔥 ${h.streak || 0}d</span>
            </div>`;
        })
        .join('')
    : '<div class="empty-state">Aún no has creado hábitos diarios.</div>';

  const impMails = state.messages.filter((m) => !m.isSpam && m.important).slice(0, 4);
  $('#hoy-important-mails-list').innerHTML = impMails.length
    ? impMails
        .map(
          (m) => `
          <div class="item-row">
            <div style="min-width:0;flex:1;overflow:hidden;">
              <div class="item-title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">★ ${esc(m.subject)}</div>
              <div class="item-sub" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(m.sender)} · ${esc(m.account)}</div>
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
              <div style="display:flex;align-items:center;gap:12px;min-width:0;">
                <button class="check-circle ${done ? 'checked' : ''}" data-act="toggle-habit" data-id="${h.id}">✓</button>
                <div style="min-width:0;">
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
        <span>Todas (${state.mailAccounts.length})</span>
      </button>`;

    const accountChips = state.mailAccounts
      .map((acc) => {
        const initial = (acc.label || acc.email || 'C')[0].toUpperCase();
        const isActive = activeMailSession === acc.email;
        return `
          <div class="mail-session-chip ${isActive ? 'active' : ''}" data-select-mail-session="${esc(acc.email)}">
            <span class="session-avatar">${esc(initial)}</span>
            <div style="min-width:0;max-width:165px;overflow:hidden;text-overflow:ellipsis;">
              <div style="overflow:hidden;text-overflow:ellipsis;">${esc(acc.label || acc.email.split('@')[0])}</div>
              <div style="font-size:0.68rem;opacity:0.82;overflow:hidden;text-overflow:ellipsis;">${esc(acc.email)}</div>
            </div>
            <button type="button" class="btn-icon-del" style="min-width:22px;min-height:22px;padding:0;color:inherit;" data-act="unlink-mail-acc" data-email="${esc(acc.email)}" title="Desvincular cuenta">✕</button>
          </div>`;
      })
      .join('');

    sessionsBar.innerHTML = allChip + accountChips;
  }

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
        .map((m) => {
          const isExpanded = expandedMailIds.has(m.id);
          const snippetText = (m.snippet || '').trim();
          const canExpand = snippetText.length > 90 || (m.subject || '').length > 65;
          return `
          <article class="mail-card ${isExpanded ? 'expanded' : ''} ${m.isSpam ? 'is-spam' : m.important ? 'is-important' : ''} ${m.read ? 'is-read' : ''}">
            <div class="mail-card-header">
              <span class="mail-account-badge" title="${esc(m.account)}">${esc(m.account)}</span>
              <span class="mail-date">${esc(m.dateLabel || '')}</span>
            </div>
            <div class="mail-subject">${m.important && !m.isSpam ? '★ ' : ''}${m.isSpam ? '<span class="mail-spam-tag">Spam</span>' : ''}${esc(m.subject)}</div>
            <div class="mail-sender" title="${esc(m.sender)}">${esc(m.sender)}</div>
            ${snippetText ? `<p class="mail-snippet">${esc(snippetText)}</p>` : ''}
            ${canExpand ? `<button type="button" class="mail-expand-btn" data-act="toggle-expand-mail" data-id="${m.id}">${isExpanded ? 'Ver menos ▲' : 'Ver resumen completo ▼'}</button>` : ''}
            <div class="mail-actions">
              <button type="button" class="btn btn-soft btn-sm" data-act="star-mail" data-id="${m.id}">${m.important ? '★ Importante' : '☆ Importante'}</button>
              <button type="button" class="btn btn-outline btn-sm" data-act="read-mail" data-id="${m.id}">${m.read ? 'Leído' : 'No leído'}</button>
              <button type="button" class="btn-icon-del" data-act="del-mail" data-id="${m.id}" title="Eliminar">✕</button>
            </div>
          </article>`;
        })
        .join('')
    : '<div class="empty-state">No se encontraron correos en esta sesión o filtro. Agrega una cuenta o ajusta el rango de meses.</div>';
}

function renderMiEspacio() {
  $('#notif-status-text').textContent = state.notificationsEnabled ? 'Activadas en este dispositivo' : 'Desactivadas';
  $('#arco-legal-text').textContent = ARCO_INFO.description;
  const apkLink = $('#btn-download-apk');
  if (apkLink) {
    apkLink.href = BRISAPLAN_APK_RELEASE.downloadUrl;
  }
}

function syncNativeWidgetSummary() {
  try {
    const today = todayISO();
    const blocks = (state.agenda || []).filter((a) => isAgendaItemActiveOnDate(a, today));
    const pending = (state.tasks || []).filter((t) => !t.done);
    const lines = [];
    if (blocks.length) {
      lines.push(`Bloques hoy (${blocks.length}): ` + blocks.slice(0, 2).map((b) => `${b.time} ${b.title}`).join(', '));
    }
    if (pending.length) {
      lines.push(`Pendientes (${pending.length}): ` + pending.slice(0, 2).map((t) => t.title).join(', '));
    }
    const summaryText = lines.length ? lines.join(' · ') : 'Todo al día por hoy en BrisaPlan.';
    localStorage.setItem('brisaplan_widget_summary', summaryText);

    const capPrefs = window.Capacitor?.Plugins?.Preferences;
    if (capPrefs && typeof capPrefs.set === 'function') {
      capPrefs.set({ key: 'brisaplan_widget_summary', value: summaryText }).catch(() => {});
    }
  } catch {}
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

function configureTopInstallButton() {
  const topBtn = $('#btn-install-mobile-app');
  if (!topBtn) return;
  if (isCapacitorNativeApp()) {
    topBtn.style.display = 'none';
    return;
  }
  if (isAndroidDevice()) {
    topBtn.textContent = 'Descargar APK';
  } else {
    topBtn.textContent = 'Descargar App';
  }
}

async function triggerSmartInstall() {
  if (isCapacitorNativeApp()) {
    toast('Ya estás usando la app nativa de BrisaPlan en Android.');
    return;
  }

  // En Android web: descarga directa del APK nativo (con widgets y notificaciones reales)
  if (isAndroidDevice()) {
    toast('Descargando BrisaPlan.apk (con widgets y notificaciones)...');
    const a = document.createElement('a');
    a.href = BRISAPLAN_APK_RELEASE.downloadUrl;
    a.setAttribute('download', BRISAPLAN_APK_RELEASE.fileName);
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }

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
      if (isCapacitorNativeApp()) {
        await restSendPasswordReset(email);
      } else {
        const sdk = await ensureWebFirebaseSDK();
        await sdk.sendPasswordResetEmail(auth, email);
      }
      toast(`Correo de recuperación enviado a ${email}. Revisa tu bandeja o spam.`);
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

    if (!email || !password) {
      toast('Escribe tu correo y contraseña.');
      btn.disabled = false;
      btn.textContent = mode === 'register' ? 'Crear cuenta y entrar' : 'Entrar a mi cuenta';
      return;
    }

    try {
      if (isCapacitorNativeApp()) {
        const session = mode === 'register'
          ? await restSignUpWithPassword(email, password, name)
          : await restSignInWithPassword(email, password);
        const userObj = {
          uid: session.uid,
          email: session.email,
          displayName: session.displayName || name || '',
          photoURL: session.photoURL || ''
        };
        currentUser = userObj;
        await deriveAndEnterWithPassword(userObj, password, mode === 'register');
      } else {
        await ensureAuthPersistenceSafe();
        const sdk = await ensureWebFirebaseSDK();
        if (mode === 'register') {
          const cred = await sdk.createUserWithEmailAndPassword(auth, email, password);
          if (name) await sdk.updateProfile(cred.user, { displayName: name }).catch(() => {});
          currentUser = cred.user;
          await deriveAndEnterWithPassword(cred.user, password, true);
        } else {
          const cred = await sdk.signInWithEmailAndPassword(auth, email, password);
          currentUser = cred.user;
          await deriveAndEnterWithPassword(cred.user, password, false);
        }
      }
      $('#auth-password-input').value = '';
    } catch (err) {
      console.error('Email auth error:', err);
      const code = err?.code || '';
      if (code === 'auth/email-already-in-use') {
        toast('Ese correo ya tiene cuenta. Usa "Iniciar sesión" o "Continuar con Google".');
      } else if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        toast('Correo o contraseña incorrectos (si entraste antes con Google, usa Google o "¿Olvidaste tu contraseña?").');
      } else if (code === 'auth/network-request-failed') {
        toast('Sin conexión a internet para verificar la cuenta. Conéctate a Wi-Fi o datos.');
      } else if (code === 'auth/too-many-requests') {
        toast('Demasiados intentos seguidos. Espera un minuto e intenta de nuevo.');
      } else {
        toast(`Error de acceso: ${code || err?.message || 'verifica tu conexión'}`);
      }
    } finally {
      btn.disabled = false;
      btn.textContent = mode === 'register' ? 'Crear cuenta y entrar' : 'Entrar a mi cuenta';
    }
  });

  $('#btn-google-login').addEventListener('click', async () => {
    const btn = $('#btn-google-login');
    btn.disabled = true;

    try {
      if (isCapacitorNativeApp()) {
        const gAuth = window.Capacitor?.Plugins?.GoogleAuth;
        if (!gAuth || typeof gAuth.signIn !== 'function') {
          toast('El selector nativo de Google no está disponible en esta compilación.');
          return;
        }
        toast('Abriendo selector de cuentas de Google...');
        initNativeGoogleAuth();
        const googleUser = await gAuth.signIn();
        const idToken = googleUser?.authentication?.idToken || googleUser?.idToken;
        if (!idToken) {
          throw new Error('No se recibió el token de Google.');
        }
        const session = await restSignInWithGoogleIdToken(idToken);
        const userObj = {
          uid: session.uid,
          email: session.email || googleUser?.email || '',
          displayName: session.displayName || googleUser?.name || '',
          photoURL: session.photoURL || googleUser?.imageUrl || ''
        };
        await handleUserAuthenticated(userObj);
        return;
      }

      await ensureAuthPersistenceSafe();
      const sdk = await ensureWebFirebaseSDK();
      const provider = new sdk.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await sdk.signInWithPopup(auth, provider);
      await handleUserAuthenticated(result.user);
    } catch (err) {
      console.error('Google login error:', err);
      const code = String(err?.code || '');
      const msg = String(err?.message || err || '');
      if (code === 'auth/popup-blocked') {
        toast('Permite las ventanas emergentes (popups) en tu navegador o entra con correo y contraseña.');
      } else if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request' || msg.includes('12501') || msg.toLowerCase().includes('cancel')) {
        toast('Selector de Google cerrado antes de iniciar sesión.');
      } else if (msg.includes('10:') || msg.toLowerCase().includes('developer_error')) {
        toast('Verifica la huella SHA-1 del paquete com.brisaplan.app en Firebase Console.');
      } else {
        toast(`No se pudo iniciar con Google: ${code || msg || 'revisa tu conexión'}`);
      }
    } finally {
      btn.disabled = false;
    }
  });

  $('#btn-switch-google').addEventListener('click', async () => {
    clearLocalVaultSession(currentUser?.uid);
    if (isCapacitorNativeApp() && window.Capacitor?.Plugins?.GoogleAuth?.signOut) { await window.Capacitor.Plugins.GoogleAuth.signOut().catch(() => {}); }
    clearRestSession();
    if (!isCapacitorNativeApp() && auth && sdkModules?.signOut) { await sdkModules.signOut(auth).catch(() => {}); }
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

  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

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
      const msg = String(err?.message || '');
      if (msg.includes('access_denied') || msg.includes('verification')) {
        toast('Google bloqueó el correo porque no está agregado en "Usuarios de prueba" en Google Cloud Console.');
      } else {
        toast(msg || 'No se pudo completar la autorización de correo.');
      }
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

  $('#btn-install-mobile-app').addEventListener('click', triggerSmartInstall);
  $('#btn-install-space').addEventListener('click', triggerSmartInstall);
  $('#close-install-modal').addEventListener('click', () => $('#install-guide-modal').classList.remove('open'));

  $('#btn-enable-notifs').addEventListener('click', async () => {
    const granted = await requestNativeNotificationPermission();
    state.notificationsEnabled = granted;
    await saveCloudVault();
    renderMiEspacio();
    if (granted) {
      await showSafeNotification('BrisaPlan', 'Notificaciones y recordatorios activados correctamente.');
      await scheduleAndroidNativeReminders();
      toast('Notificaciones activadas en este dispositivo');
    } else {
      toast('Permiso de notificaciones denegado por el sistema.');
    }
  });

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

  document.body.addEventListener('click', async (e) => {
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

    const mobDayBtn = e.target.closest('[data-select-mobile-day]');
    if (mobDayBtn) {
      mobileActiveWeekday = Number(mobDayBtn.dataset.selectMobileDay);
      renderWeeklyAgenda();
      return;
    }

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
    } else if (act === 'toggle-expand-mail') {
      if (expandedMailIds.has(id)) expandedMailIds.delete(id);
      else expandedMailIds.add(id);
      renderMail();
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

  $('#btn-logout-only').addEventListener('click', async () => {
    if (!confirm('¿Cerrar sesión en este dispositivo?')) return;
    clearLocalVaultSession(currentUser?.uid);
    clearOfflineUserProfile();
    if (isCapacitorNativeApp() && window.Capacitor?.Plugins?.GoogleAuth?.signOut) { await window.Capacitor.Plugins.GoogleAuth.signOut().catch(() => {}); }
    clearRestSession();
    if (!isCapacitorNativeApp() && auth && sdkModules?.signOut) { await sdkModules.signOut(auth).catch(() => {}); }
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
  setupCapacitorAppUrlListener();
  initNativeGoogleAuth();
  configureTopInstallButton();
  applyTheme(localStorage.getItem('brisaplan_theme_v7') === 'dark');
  const dueDateInput = $('#task-due-date');
  if (dueDateInput) dueDateInput.value = todayISO();
  updatePomodoroText();
  setupEvents();
  window.__brisaModuleReady = true;

  window.addEventListener('online', async () => {
    updateSyncBadgeUI('offline-pending');
    await flushPendingOfflineSync();
  });

  window.addEventListener('offline', () => {
    updateSyncBadgeUI('offline-pending');
    toast('Modo sin internet activo: tus cambios se guardarán localmente.');
  });

  setInterval(() => {
    checkScheduledNotifications();
  }, 20000);

  if (isCapacitorNativeApp()) {
    const restSession = getStoredRestSession();
    const offlineUser = getOfflineUserProfile();
    const candidate = restSession?.uid
      ? {
          uid: restSession.uid,
          email: restSession.email || offlineUser?.email || '',
          displayName: restSession.displayName || offlineUser?.displayName || '',
          photoURL: restSession.photoURL || offlineUser?.photoURL || ''
        }
      : offlineUser;

    if (candidate && candidate.uid && getLocalVaultSession(candidate.uid)) {
      if (navigator.onLine && restSession) {
        refreshRestIdToken(restSession).catch(() => {});
      }
      await handleUserAuthenticated(candidate);
    } else {
      currentUser = null;
      document.body.classList.add('auth-locked');
      $('#login-gate').style.display = 'flex';
      $('#app-shell').style.display = 'none';
      showLoginStep('auth');
    }
    return;
  }

  if (!navigator.onLine) {
    const offlineUser = getOfflineUserProfile();
    if (offlineUser && offlineUser.uid && getLocalVaultSession(offlineUser.uid)) {
      await handleUserAuthenticated(offlineUser);
    }
  }

  try {
    const sdk = await ensureWebFirebaseSDK();
    await ensureAuthPersistenceSafe();
    sdk.onAuthStateChanged(auth, async (user) => {
      if (user && !vaultSecret) {
        await handleUserAuthenticated(user);
      } else if (!user && !isUnlocking) {
        if (!navigator.onLine) {
          const offlineUser = getOfflineUserProfile();
          if (offlineUser && offlineUser.uid && getLocalVaultSession(offlineUser.uid)) {
            if (!vaultSecret) await handleUserAuthenticated(offlineUser);
            return;
          }
        }
        currentUser = null;
        document.body.classList.add('auth-locked');
        $('#login-gate').style.display = 'flex';
        $('#app-shell').style.display = 'none';
        showLoginStep('auth');
      }
    });
  } catch (err) {
    console.error('Error iniciando Firebase Web SDK:', err);
  }
});

/* ==========================================================================
   BrisaPlan - Configuración de descarga directa del APK Android
   ========================================================================== */
const BRISAPLAN_APK_RELEASE = Object.freeze({
  repository: "tejon876/brisaplan.github.io",
  releaseTag: "latest",
  fileName: "BrisaPlan.apk",
  downloadUrl:
    "https://github.com/tejon876/brisaplan.github.io/releases/latest/download/BrisaPlan.apk"
});

const BRISAPLAN_LEGACY_APK_REGEX =
  /https?:\/\/github\.com\/tejon876\/BrisaPlan\/releases\/(?:latest|download)\/[^\s"'<>]*BrisaPlan\.apk/gi;

function configureBrisaPlanApkLink(element) {
  if (!element) return;

  if (element.tagName === "A") {
    element.setAttribute("href", BRISAPLAN_APK_RELEASE.downloadUrl);
    element.setAttribute("download", BRISAPLAN_APK_RELEASE.fileName);
    element.setAttribute("rel", "noopener noreferrer");
    return;
  }

  if (!element.dataset.brisaplanApkBound) {
    element.dataset.brisaplanApkBound = "true";
    element.addEventListener("click", (event) => {
      event.preventDefault();
      window.open(
        BRISAPLAN_APK_RELEASE.downloadUrl,
        "_blank",
        "noopener,noreferrer"
      );
    });
  }
}

function updateAllBrisaPlanApkDownloads() {
  const links = document.querySelectorAll("a[href]");
  links.forEach((link) => {
    const href = link.getAttribute("href") || "";
    if (BRISAPLAN_LEGACY_APK_REGEX.test(href)) {
      configureBrisaPlanApkLink(link);
    }
  });

  const candidateSelectors = [
    "#download-apk-btn",
    "#btn-download-apk",
    "[data-download-apk]",
    ".download-apk-btn"
  ];

  candidateSelectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((el) => {
      configureBrisaPlanApkLink(el);
    });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", updateAllBrisaPlanApkDownloads);
} else {
  updateAllBrisaPlanApkDownloads();
}

window.BRISAPLAN_APK_RELEASE = BRISAPLAN_APK_RELEASE;
window.BRISAPLAN_APK_URL = BRISAPLAN_APK_RELEASE.downloadUrl;
