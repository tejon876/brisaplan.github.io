import { CONFIG } from './config.js';
import {
  generateSaltB64,
  hashPasswordPBKDF2,
  encryptVaultData,
  decryptVaultData
} from './crypto.js';

export function todayISO() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now - offset).toISOString().split('T')[0];
}

export function createCleanState() {
  return {
    habits: [],
    tasks: [],
    agenda: [],
    mailAccounts: [],
    messages: [],
    backupIntervalDays: 7,
    lastBackupAt: null,
    selectedWidgets: {
      tasksAgenda: true,
      mail: true,
      habits: true
    },
    notificationsEnabled: false,
    tutorialSeen: false
  };
}

function getAccountsRegistry() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG.accountsKey) || '{}');
  } catch {
    return {};
  }
}

function saveAccountsRegistry(reg) {
  localStorage.setItem(CONFIG.accountsKey, JSON.stringify(reg));
}

export async function registerPasswordAccount(email, password) {
  const clean = email.trim().toLowerCase();
  const reg = getAccountsRegistry();
  if (reg[clean]) {
    throw new Error('Ese correo ya está registrado. Cambia a "Iniciar sesión".');
  }
  const salt = generateSaltB64();
  const hash = await hashPasswordPBKDF2(password, salt);
  reg[clean] = {
    email: clean,
    provider: 'Contraseña',
    salt,
    hash,
    createdAt: new Date().toISOString()
  };
  saveAccountsRegistry(reg);
  return { email: clean, name: clean.split('@')[0], provider: 'Contraseña', secret: hash, salt };
}

export async function authenticatePasswordAccount(email, password) {
  const clean = email.trim().toLowerCase();
  const reg = getAccountsRegistry();
  const record = reg[clean];
  if (!record) {
    throw new Error('Correo no encontrado. Regístrate primero en "Crear cuenta".');
  }
  const candidateHash = await hashPasswordPBKDF2(password, record.salt);
  if (candidateHash !== record.hash) {
    throw new Error('Contraseña incorrecta. Verifica tus datos.');
  }
  return { email: clean, name: clean.split('@')[0], provider: 'Contraseña', secret: candidateHash, salt: record.salt };
}

export async function authenticateGoogleAccount(profile) {
  const clean = profile.email.trim().toLowerCase();
  const reg = getAccountsRegistry();
  if (!reg[clean]) {
    reg[clean] = {
      email: clean,
      provider: 'Google',
      salt: generateSaltB64(),
      googleSub: profile.sub,
      createdAt: new Date().toISOString()
    };
    saveAccountsRegistry(reg);
  }
  const secret = `${profile.sub}:${clean}:brisaplan_google_vault`;
  return {
    email: clean,
    name: profile.name || clean.split('@')[0],
    picture: profile.picture || '',
    provider: 'Google',
    secret,
    salt: reg[clean].salt
  };
}

export async function loadEncryptedVault(session) {
  const key = `${CONFIG.vaultPrefix}${session.email}`;
  const raw = localStorage.getItem(key);
  if (!raw) return createCleanState();
  try {
    const parsed = JSON.parse(raw);
    const decrypted = await decryptVaultData(parsed, session.secret, session.salt);
    return { ...createCleanState(), ...decrypted };
  } catch {
    return createCleanState();
  }
}

export async function saveEncryptedVault(state, session) {
  if (!session?.email || !session?.secret) return;
  const key = `${CONFIG.vaultPrefix}${session.email}`;
  const encrypted = await encryptVaultData(state, session.secret, session.salt);
  localStorage.setItem(key, JSON.stringify(encrypted));
}

export function loadActiveSession() {
  try {
    const raw = sessionStorage.getItem(CONFIG.sessionKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveActiveSession(session) {
  sessionStorage.setItem(CONFIG.sessionKey, JSON.stringify(session));
}

export function clearSessionOnly() {
  sessionStorage.removeItem(CONFIG.sessionKey);
}

export function deleteUserAccountAndVault(email) {
  const clean = email.trim().toLowerCase();
  localStorage.removeItem(`${CONFIG.vaultPrefix}${clean}`);
  const reg = getAccountsRegistry();
  delete reg[clean];
  saveAccountsRegistry(reg);
  sessionStorage.removeItem(CONFIG.sessionKey);
}

export async function exportUserJSON(state, session) {
  const payload = {
    app: CONFIG.appName,
    exportedAt: new Date().toISOString(),
    user: session?.email || 'local',
    data: state
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `BrisaPlan_Respaldo_${todayISO()}.json`;
  link.click();
  URL.revokeObjectURL(url);
  state.lastBackupAt = new Date().toISOString();
  await saveEncryptedVault(state, session);
}
