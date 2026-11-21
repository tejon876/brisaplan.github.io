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

function encodeBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function extractBodyPreview(payload) {
  if (!payload) return '';
  if (payload.body?.data) {
    const txt = decodeBase64Url(payload.body.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (txt) return txt.slice(0, 200);
  }
  if (Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64Url(part.body.data).replace(/\s+/g, ' ').trim().slice(0, 200);
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

export function connectMailAccount(state, email, provider = 'Gmail', label = '') {
  const clean = (email || '').trim().toLowerCase();
  if (!clean) return false;
  const existing = state.mailAccounts.find((a) => a.email === clean);
  if (existing) {
    existing.provider = provider;
    if (label) existing.label = label;
    existing.connectedAt = new Date().toISOString();
    existing.verified = true;
    return true;
  }
  state.mailAccounts.push({
    id: `acc-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    email: clean,
    provider,
    label: label || clean.split('@')[0],
    verified: true,
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
      reject(new Error('El servicio de autorización de Google aún está cargando. Intenta de nuevo en 2 segundos.'));
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

async function sendConnectionVerificationEmail(accessToken, accountEmail) {
  const nowStr = new Date().toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
  const confirmUrl = 'https://tejon876.github.io/BrisaPlan/#correos';
  const subject = '=?UTF-8?B?' + btoa(unescape(encodeURIComponent('BrisaPlan · Confirmación de acceso y permiso de correo'))) + '?=';

  const htmlBody = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;border-radius:16px;border:1px solid #E2E8F0;background:#F8FAFC;color:#1E293B;">
      <h2 style="color:#4A93C6;margin-top:0;">BrisaPlan — Vinculación de Cuenta Confirmada</h2>
      <p>Hola <strong>${accountEmail}</strong>,</p>
      <p>Tu cuenta de correo se vinculó correctamente con <strong>BrisaPlan</strong> el <strong>${nowStr}</strong>.</p>
      <p style="font-size:14px;color:#475569;">Permisos autorizados: lectura organizada de bandeja de entrada, clasificación de importantes y limpieza de spam desde tu bóveda cifrada AES-256.</p>
      <div style="margin:24px 0;text-align:center;">
        <a href="${confirmUrl}" style="display:inline-block;background:#4A93C6;color:#FFFFFF;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:999px;">
          Confirmar y abrir mi bandeja en BrisaPlan
        </a>
      </div>
      <p style="font-size:12px;color:#64748B;">Si no reconoces esta vinculación, puedes revocar el acceso en cualquier momento desde tu cuenta de Google o dentro de BrisaPlan → Correos.</p>
    </div>
  `;

  const rawMime = [
    `To: ${accountEmail}`,
    `From: ${accountEmail}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    htmlBody
  ].join('\n');

  const res = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ raw: encodeBase64Url(rawMime) })
  });
  return res.ok;
}

export async function linkAndSyncGmailAccount(state, { hintEmail = '', label = '', months = 1, sendVerification = true } = {}) {
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
    throw new Error('No se detectó la dirección de correo.');
  }

  gmailTokenCache.set(accountEmail, accessToken);
  connectMailAccount(state, accountEmail, 'Gmail', label);

  let verificationSent = false;
  if (sendVerification) {
    try {
      verificationSent = await sendConnectionVerificationEmail(accessToken, accountEmail);
    } catch {
      verificationSent = false;
    }
  }

  const syncedCount = await syncGmailMessagesForAccount(state, accountEmail, accessToken, months);
  return { email: accountEmail, syncedCount, verificationSent };
}

export async function syncGmailMessagesForAccount(state, accountEmail, providedToken = null, months = 1) {
  const cleanAccount = accountEmail.trim().toLowerCase();
  let token = providedToken || gmailTokenCache.get(cleanAccount);
  if (!token) {
    token = await requestGmailAccessToken(cleanAccount);
    gmailTokenCache.set(cleanAccount, token);
  }

  const clampedMonths = Math.min(12, Math.max(1, Number(months) || 1));
  const days = clampedMonths * 30;
  const query = encodeURIComponent(`newer_than:${days}d`);
  const listUrl = `https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=45&includeSpamTrash=true&q=${query}`;

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

  for (const ref of messageRefs.slice(0, 35)) {
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
    const parsedDate = dateStr ? new Date(dateStr) : new Date();

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
      timestamp: isNaN(parsedDate.getTime()) ? Date.now() : parsedDate.getTime(),
      dateLabel: isNaN(parsedDate.getTime())
        ? ''
        : parsedDate.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' }),
      isSpam,
      important: isImportant,
      read: !isUnread
    });
  }

  state.messages = [...fetched, ...otherMessages].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  return fetched.length;
}

export async function syncAllConnectedGmailAccounts(state, months = 1) {
  let totalSynced = 0;
  for (const acc of state.mailAccounts) {
    if (acc.provider === 'Gmail') {
      totalSynced += await syncGmailMessagesForAccount(state, acc.email, null, months);
    }
  }
  return totalSynced;
}

export function addMessage(state, { account, sender, subject, isSpam = false, important = false }) {
  if (!(subject || '').trim()) return;
  const spamKeywords = ['premio', 'ganaste', 'oferta urgente', 'casino', 'lotería', 'haz clic aquí', 'préstamo rápido'];
  const autoSpam = isSpam || spamKeywords.some((kw) => subject.toLowerCase().includes(kw));

  state.messages.unshift({
    id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    source: 'local',
    account: account || (state.mailAccounts[0]?.email ?? 'principal'),
    sender: (sender || '').trim() || 'Nota personal',
    subject: subject.trim(),
    snippet: '',
    timestamp: Date.now(),
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
