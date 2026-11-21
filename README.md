# BrisaPlan v7.0 — Plataforma Multi-Dispositivo

## Novedades Principales en v7.0
1. **Portal de Acceso Profesional y Sesión Persistente:** Inicio de sesión con Correo/Contraseña o Google (`browserLocalPersistence` + llave local de bóveda AES-256). No vuelve a pedir contraseña al recargar o reiniciar la aplicación hasta que cierres sesión manualmente.
2. **Vista Hoy Enfocada:** Muestra únicamente los bloques activos del día, entregas urgentes, hábitos diarios y correos marcados como importantes.
3. **Agenda Semanal Visual (Lunes a Domingo):** Tablero de 7 columnas en PC y selector táctil por día en celular. Agrega bloques con hora inicio/fin, interruptor de repetición semanal (permanente) o fecha única, 8 cuadritos de colores listos y ruleta cromática personalizada.
4. **Tareas y Entregas en Bloques:** Tarjetas visuales con día y hora límite de entrega, estado automático (Hoy, Próxima, Vencida) y temporizador Pomodoro.
5. **Bandeja de Correos Multi-Cuenta:** Barra superior para alternar sesiones entre todas tus cuentas vinculadas, selector de rango de 1 a 12 meses, buscador rápido en tiempo real y envío automático de correo oficial de confirmación al vincular una cuenta.
6. **Tour Interactivo Spotlight:** Guía visual paso a paso que ilumina cada sección real de la interfaz.

## Configuración en Google Cloud / Firebase
1. En **Firebase Console → Authentication → Sign-in method**, asegúrate de tener habilitados **Correo electrónico/contraseña** y **Google**.
2. En **Google Cloud Console → Google Auth Platform → Público / Acceso a datos**, incluye los scopes `gmail.modify` y `gmail.send` para habilitar la lectura por rango de meses y el envío del correo de verificación al conectar cuentas.

## Cómo generar el archivo `BrisaPlan.apk` con Widgets Nativos Android
El proyecto ya incluye `capacitor.config.json` listo para empaquetar en Android Studio:
```bash
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap add android
npx cap sync android
npx cap open android
```
Desde Android Studio, selecciona **Build → Build Bundle(s) / APK(s) → Build APK(s)** y sube el `.apk` resultante a tu GitHub Release (`https://github.com/tejon876/BrisaPlan/releases/latest/download/BrisaPlan.apk`).
