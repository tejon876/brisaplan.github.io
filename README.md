# BrisaPlan v6.3 — Bóveda Profesional con Firebase y Gmail API

## Correcciones Implementadas
1. **Acceso Exclusivo con Google + Contraseña Maestra:** Flujo en 2 pasos donde primero te autenticas con Google (`signInWithPopup` en PC / `signInWithRedirect` en móvil si hay bloqueo de popups) y después creas o ingresas tu **Contraseña Maestra** con confirmación y botón Mostrar/Ocultar. La sesión queda persistente en tu navegador hasta que la bloquees o cierres.
2. **Base de Datos Cloud Firestore Conectada:** Tus tareas, hábitos y agenda se cifran con `AES-GCM` de 256 bits y se sincronizan en tiempo real en tu proyecto `brisaplan-e0466`.
3. **Agenda Temporal y Permanente:** Bloques por fecha específica o recurrentes por días de la semana, con edición, ajuste rápido de horario y borrado.
4. **Gmail API Integrada:** Vinculación de cuentas Gmail con lectura de correos, filtro automático de Importantes y Spam, y limpieza de spam en un clic.
