import { GOOGLE_OAUTH_CONFIG } from './firebase-config.js';

const gmailTokenCache = new Map();

function decodeBase64Url(str) {
  if (!str) return '';
  try {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
    const bin = atob(b64 + pad);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}

function extractBodyPreview(payload) {
  if (!payload) return '';
  if (payload.body?.data) {
    const txt = decodeBase64Url(payload.body.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (txt) return txt.slice(0, 180);
  }
  if (Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64Url(part.body.data).replace(/\s+/g, ' ').trim().slice(0, 180);
      }
    }
    for (const part of payload.parts) {
      const nested = extractBodyPreview(part);
      if (nested) return nested;
    }
  }
  return '';
}

function getHeader(headers = [], name) {
  const found = headers.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return found ? found.value : '';
}

export function connectMailAccount(state, email, provider = 'Google') {
  const clean = (email || '').trim().toLowerCase();
  if (!clean) return false;
  const existing = state.mailAccounts.find((a) => a.email === clean);
  if (existing) {
    existing.provider = provider;
    existing.connectedAt = new Date().toISOString();
    return true;
  }
  state.mailAccounts.push({
    id: `acc-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    email: clean,
    provider,
    connectedAt: new Date().toISOString()
  });
  return true;
}

export function disconnectMailAccount(state, email) {
  const clean = (email || '').trim().toLowerCase();
  state.mailAccounts = state.mailAccounts.filter((a) => a.email !== clean);
  state.messages = state.messages.filter((m) => m.account !== clean);
  gmailTokenCache.delete(clean);
}

export function requestGmailAccessToken(hintEmail = '') {
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      reject(new Error('El servicio de Google OAuth aún no carga. Recarga e intenta de nuevo.'));
      return;
    }
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_OAUTH_CONFIG.clientId,
      scope: GOOGLE_OAUTH_CONFIG.gmailScope,
      prompt: hintEmail ? 'select_account' : 'consent',
      callback: (tokenResponse) => {
        if (tokenResponse?.error) {
          reject(new Error(tokenResponse.error_description || tokenResponse.error));
          return;
        }
        resolve(tokenResponse.access_token);
      }
    });
    tokenClient.requestAccessToken({ login_hint: hintEmail || undefined });
  });
}

export async function linkAndSyncGmailAccount(state, hintEmail = '') {
  const accessToken = await requestGmailAccessToken(hintEmail);

  const profileRes = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!profileRes.ok) {
    throw new Error('No se pudo obtener el perfil de Gmail. Verifica que la Gmail API esté habilitada.');
  }
  const profile = await profileRes.json();
  const accountEmail = (profile.emailAddress || hintEmail || '').trim().toLowerCase();
  if (!accountEmail) {
    throw new Error('No se detectó la dirección de correo de Google.');
  }

  gmailTokenCache.set(accountEmail, accessToken);
  connectMailAccount(state, accountEmail, 'Gmail');
  const syncedCount = await syncGmailMessagesForAccount(state, accountEmail, accessToken);
  return { email: accountEmail, syncedCount };
}

export async function syncGmailMessagesForAccount(state, accountEmail, providedToken = null) {
  const cleanAccount = accountEmail.trim().toLowerCase();
  let token = providedToken || gmailTokenCache.get(cleanAccount);
  if (!token) {
    token = await requestGmailAccessToken(cleanAccount);
    gmailTokenCache.set(cleanAccount, token);
  }

  const listUrl = 'https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=25&includeSpamTrash=true';
  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!listRes.ok) {
    throw new Error(`Error al leer correos de ${cleanAccount} (${listRes.status}).`);
  }
  const listData = await listRes.json();
  const messageRefs = Array.isArray(listData.messages) ? listData.messages : [];

  const otherMessages = state.messages.filter((m) => !(m.source === 'gmail' && m.account === cleanAccount));
  const fetched = [];

  for (const ref of messageRefs.slice(0, 20)) {
    const msgRes = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(ref.id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!msgRes.ok) continue;
    const msgData = await msgRes.json();
    const labels = Array.isArray(msgData.labelIds) ? msgData.labelIds : [];
    const headers = msgData.payload?.headers || [];
    const sender = getHeader(headers, 'From') || 'Remitente desconocido';
    const subject = getHeader(headers, 'Subject') || '(Sin asunto)';
    const dateStr = getHeader(headers, 'Date') || '';

    const isSpam = labels.includes('SPAM') || labels.includes('TRASH');
    const isImportant = !isSpam && (labels.includes('IMPORTANT') || labels.includes('STARRED'));
    const isUnread = labels.includes('UNREAD');

    fetched.push({
      id: `gm-${cleanAccount}-${msgData.id}`,
      gmailId: msgData.id,
      source: 'gmail',
      account: cleanAccount,
      sender,
      subject,
      snippet: msgData.snippet || extractBodyPreview(msgData.payload) || '',
      dateLabel: dateStr ? new Date(dateStr).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) : '',
      isSpam,
      important: isImportant,
      read: !isUnread
    });
  }

  state.messages = [...fetched, ...otherMessages];
  return fetched.length;
}

export async function syncAllConnectedGmailAccounts(state) {
  let totalSynced = 0;
  for (const acc of state.mailAccounts) {
    if (acc.provider === 'Gmail') {
      totalSynced += await syncGmailMessagesForAccount(state, acc.email);
    }
  }
  return totalSynced;
}

export function addMessage(state, { account, sender, subject, isSpam = false, important = false }) {
  if (!(subject || '').trim()) return;
  const spamKeywords = ['premio', 'ganaste', 'oferta urgente', 'casino', 'lotería', 'haz clic aquí', 'viagra', 'préstamo rápido'];
  const autoSpam = isSpam || spamKeywords.some((kw) => subject.toLowerCase().includes(kw));

  state.messages.unshift({
    id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    source: 'local',
    account: account || (state.mailAccounts[0]?.email ?? 'principal'),
    sender: (sender || '').trim() || 'Remitente',
    subject: subject.trim(),
    snippet: '',
    dateLabel: 'Hoy',
    isSpam: autoSpam,
    important: !autoSpam && important,
    read: false
  });
}

export function toggleMessageImportant(state, id) {
  const msg = state.messages.find((m) => m.id === id);
  if (msg) {
    msg.important = !msg.important;
    if (msg.important) msg.isSpam = false;
  }
}

export function cleanAllSpam(state) {
  const before = state.messages.length;
  state.messages = state.messages.filter((m) => !m.isSpam);
  return before - state.messages.length;
}

export function toggleMessageRead(state, id) {
  const msg = state.messages.find((m) => m.id === id);
  if (msg) msg.read = !msg.read;
}

export function removeMessage(state, id) {
  state.messages = state.messages.filter((m) => m.id !== id);
}