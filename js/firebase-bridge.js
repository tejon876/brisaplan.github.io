// Puente híbrido Firebase Auth & Firestore (SDK Web + REST API directo para máxima compatibilidad en Android WebView y PWA)
import { firebaseConfig } from "./firebase-config.js";

const API_KEY = firebaseConfig.apiKey;
const PROJECT_ID = firebaseConfig.projectId;
const AUTH_BASE = "https://identitytoolkit.googleapis.com/v1";
const TOKEN_BASE = "https://securetoken.googleapis.com/v1";
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const REST_SESSION_KEY = "brisaplan_rest_auth_session_v1";

function saveRestSession(session) {
  try {
    if (!session) {
      localStorage.removeItem(REST_SESSION_KEY);
      return;
    }
    localStorage.setItem(REST_SESSION_KEY, JSON.stringify({
      ...session,
      savedAt: Date.now()
    }));
  } catch {}
}

export function getStoredRestSession() {
  try {
    const raw = localStorage.getItem(REST_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearRestSession() {
  saveRestSession(null);
}

function mapRestError(errData) {
  const rawMsg = errData?.error?.message || "";
  if (rawMsg.includes("EMAIL_EXISTS")) return { code: "auth/email-already-in-use", message: rawMsg };
  if (rawMsg.includes("INVALID_LOGIN_CREDENTIALS") || rawMsg.includes("INVALID_PASSWORD") || rawMsg.includes("EMAIL_NOT_FOUND")) {
    return { code: "auth/invalid-credential", message: rawMsg };
  }
  if (rawMsg.includes("TOO_MANY_ATTEMPTS_TRY_LATER")) return { code: "auth/too-many-requests", message: rawMsg };
  if (rawMsg.includes("WEAK_PASSWORD")) return { code: "auth/weak-password", message: rawMsg };
  if (rawMsg.includes("INVALID_EMAIL")) return { code: "auth/invalid-email", message: rawMsg };
  return { code: rawMsg || "auth/rest-error", message: rawMsg || "Error de autenticación" };
}

export async function refreshRestIdToken(session) {
  if (!session?.refreshToken) return session;
  const ageMs = Date.now() - (session.savedAt || 0);
  if (session.idToken && ageMs < 45 * 60 * 1000) {
    return session;
  }
  const res = await fetch(`${TOKEN_BASE}/token?key=${encodeURIComponent(API_KEY)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(session.refreshToken)}`
  });
  const data = await res.json();
  if (!res.ok || !data.id_token) {
    throw new Error("No se pudo renovar el token de sesión");
  }
  const updated = {
    ...session,
    idToken: data.id_token,
    refreshToken: data.refresh_token || session.refreshToken,
    uid: data.user_id || session.uid
  };
  saveRestSession(updated);
  return updated;
}

export async function restSignInWithPassword(email, password) {
  const res = await fetch(`${AUTH_BASE}/accounts:signInWithPassword?key=${encodeURIComponent(API_KEY)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const data = await res.json();
  if (!res.ok) throw mapRestError(data);

  const session = {
    uid: data.localId,
    email: data.email || email,
    displayName: data.displayName || "",
    photoURL: data.profilePicture || "",
    idToken: data.idToken,
    refreshToken: data.refreshToken
  };
  saveRestSession(session);
  return session;
}

export async function restSignUpWithPassword(email, password, displayName = "") {
  const res = await fetch(`${AUTH_BASE}/accounts:signUp?key=${encodeURIComponent(API_KEY)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const data = await res.json();
  if (!res.ok) throw mapRestError(data);

  if (displayName && data.idToken) {
    await fetch(`${AUTH_BASE}/accounts:update?key=${encodeURIComponent(API_KEY)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: data.idToken, displayName, returnSecureToken: false })
    }).catch(() => {});
  }

  const session = {
    uid: data.localId,
    email: data.email || email,
    displayName: displayName || data.displayName || "",
    photoURL: "",
    idToken: data.idToken,
    refreshToken: data.refreshToken
  };
  saveRestSession(session);
  return session;
}

export async function restSignInWithGoogleIdToken(googleIdToken) {
  const res = await fetch(`${AUTH_BASE}/accounts:signInWithIdp?key=${encodeURIComponent(API_KEY)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      postBody: `id_token=${encodeURIComponent(googleIdToken)}&providerId=google.com`,
      requestUri: "https://brisaplan-e0466.firebaseapp.com/__/auth/handler",
      returnIdpCredential: true,
      returnSecureToken: true
    })
  });
  const data = await res.json();
  if (!res.ok) throw mapRestError(data);

  const session = {
    uid: data.localId,
    email: data.email || "",
    displayName: data.displayName || data.fullName || "",
    photoURL: data.photoUrl || "",
    idToken: data.idToken,
    refreshToken: data.refreshToken
  };
  saveRestSession(session);
  return session;
}

export async function restSendPasswordReset(email) {
  const res = await fetch(`${AUTH_BASE}/accounts:sendOobCode?key=${encodeURIComponent(API_KEY)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestType: "PASSWORD_RESET", email })
  });
  const data = await res.json();
  if (!res.ok) throw mapRestError(data);
  return true;
}

function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === null || v === undefined) {
      fields[k] = { nullValue: null };
    } else if (typeof v === "boolean") {
      fields[k] = { booleanValue: v };
    } else if (typeof v === "number") {
      if (Number.isInteger(v)) fields[k] = { integerValue: String(v) };
      else fields[k] = { doubleValue: v };
    } else if (typeof v === "string") {
      fields[k] = { stringValue: v };
    } else if (Array.isArray(v)) {
      fields[k] = { arrayValue: { values: v.map((item) => toFirestoreFields({ x: item }).x) } };
    } else if (typeof v === "object") {
      fields[k] = { mapValue: { fields: toFirestoreFields(v) } };
    }
  }
  return fields;
}

function fromFirestoreFields(fields) {
  const out = {};
  for (const [k, valObj] of Object.entries(fields || {})) {
    if ("stringValue" in valObj) out[k] = valObj.stringValue;
    else if ("booleanValue" in valObj) out[k] = valObj.booleanValue;
    else if ("integerValue" in valObj) out[k] = Number(valObj.integerValue);
    else if ("doubleValue" in valObj) out[k] = Number(valObj.doubleValue);
    else if ("nullValue" in valObj) out[k] = null;
    else if ("arrayValue" in valObj) {
      out[k] = (valObj.arrayValue?.values || []).map((item) => fromFirestoreFields({ x: item }).x);
    } else if ("mapValue" in valObj) {
      out[k] = fromFirestoreFields(valObj.mapValue?.fields || {});
    }
  }
  return out;
}

export async function restFirestoreGetDoc(docPath) {
  const session = getStoredRestSession();
  const valid = session ? await refreshRestIdToken(session).catch(() => session) : null;
  const headers = valid?.idToken ? { Authorization: `Bearer ${valid.idToken}` } : {};
  const res = await fetch(`${FIRESTORE_BASE}/${docPath}`, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore GET ${res.status}`);
  const data = await res.json();
  return fromFirestoreFields(data.fields || {});
}

export async function restFirestoreSetDoc(docPath, plainObj) {
  const session = getStoredRestSession();
  const valid = session ? await refreshRestIdToken(session).catch(() => session) : null;
  const headers = {
    "Content-Type": "application/json",
    ...(valid?.idToken ? { Authorization: `Bearer ${valid.idToken}` } : {})
  };
  const res = await fetch(`${FIRESTORE_BASE}/${docPath}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ fields: toFirestoreFields(plainObj) })
  });
  if (!res.ok) throw new Error(`Firestore PATCH ${res.status}`);
  return true;
}
