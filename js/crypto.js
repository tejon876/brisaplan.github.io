// Utilidades criptográficas nativas Web Crypto API (PBKDF2 + AES-GCM + SHA-256)
const enc = new TextEncoder();
const dec = new TextDecoder();

function bufToB64(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

function b64ToBuf(base64) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes.buffer;
}

export function generateSaltB64() {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return bufToB64(salt.buffer);
}

export async function hashPasswordPBKDF2(password, saltB64) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: b64ToBuf(saltB64),
      iterations: 120000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );
  return bufToB64(bits);
}

async function deriveAesKey(secret, saltB64) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: b64ToBuf(saltB64),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptVaultData(plainObj, secret, saltB64) {
  const key = await deriveAesKey(secret, saltB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(JSON.stringify(plainObj))
  );
  return {
    iv: bufToB64(iv.buffer),
    cipher: bufToB64(cipher)
  };
}

export async function decryptVaultData(encryptedObj, secret, saltB64) {
  const key = await deriveAesKey(secret, saltB64);
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(b64ToBuf(encryptedObj.iv)) },
    key,
    b64ToBuf(encryptedObj.cipher)
  );
  return JSON.parse(dec.decode(plainBuf));
}
