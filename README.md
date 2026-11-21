# BrisaPlan v6.2 — Bóveda Profesional con Firebase

## Correcciones Implementadas
1. **Acceso Exclusivo con Google + Contraseña Maestra:** Flujo en 2 pasos donde primero te autenticas con Google (`signInWithPopup` en PC / `signInWithRedirect` en móvil si hay bloqueo de popups) y después creas o ingresas tu **Contraseña Maestra** con confirmación y botón Mostrar/Ocultar.
2. **Base de Datos Cloud Firestore Conectada:** Tus tareas, hábitos y agenda se cifran con `AES-GCM` de 256 bits y se sincronizan en tiempo real en tu proyecto `brisaplan-e0466`.
3. **Diseño Móvil y PC Limpio:** Eliminación total del botón flotante `+` encimado, barra de navegación móvil con iconos claros y áreas táctiles grandes (`>= 44px`).
