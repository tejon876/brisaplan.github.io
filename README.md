# BrisaPlan

Organizador personal y gestor de hábitos diarios minimalista, 100% local (sin servidores externos).

## Estructura del proyecto
- `index.html` — Vista principal de hábitos, rachas, Pomodoro, tareas y agenda.
- `manifest.json` — Configuración PWA instalable.
- `css/variables.css`, `css/layout.css`, `css/components.css` — Estilos modulares con diseño redondeado y paleta fría.
- `js/config.js` — Configuración global.
- `js/storage.js` — Persistencia en `localStorage`, respaldo semanal JSON y código de sincronización entre dispositivos.
- `js/tasks-habits.js` — Lógica de hábitos diarios, rachas y tareas prioritarias.
- `js/agenda.js` y `js/mail-classroom.js` — Bloques horarios y avisos rápidos.
- `js/legal.js` y `js/app.js` — Controlador principal y aviso de privacidad local.
- `widgets/desktop-wallpaper.html` — Widget de cristal transparente para escritorio.

## Cómo subir a GitHub Pages
1. Sube todos los archivos de esta carpeta a la raíz de un repositorio público en GitHub.
2. Ve a **Settings → Pages**, selecciona la rama `main` y carpeta `/ (root)`, y guarda.
