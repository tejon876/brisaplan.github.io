# BrisaPlan v5 — Bóveda Personal Cifrada

## Seguridad implementada
1. **Aislamiento total (`body.auth-locked`):** Mientras no exista una sesión desbloqueada en `sessionStorage`, la barra de navegación, los paneles y el botón flotante `+` permanecen ocultos y los datos no se cargan en memoria.
2. **Autenticación doble:**
   - **Continuar con Google:** SDK oficial de Google Identity Services (`45181844063-v8cs61mc291da1vmumc8sq3pjaboc00i.apps.googleusercontent.com`).
   - **Correo y contraseña cifrada:** Derivación de clave con **PBKDF2-SHA256** (120,000 iteraciones + salt aleatorio) y cifrado de bóveda con **AES-GCM 256 bits**.
3. **Notificaciones compatibles con Android Chrome:** Uso de `ServiceWorkerRegistration.showNotification()` mediante `sw.js`.
