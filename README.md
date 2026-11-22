# BrisaPlan v9 (Nativo Android + PWA Offline-First)

## Huella Digital SHA-1 Fija (Registrar en Firebase)
Si regeneras el paquete, verifica que esta huella coincida en Firebase Console > Configuración del proyecto > Tus apps > `com.brisaplan.app`:

`SHA1: F4:DD:E2:45:96:7C:7B:E4:53:D1:42:90:58:65:23:EC:CA:8D:07:54`

## Contenido del ZIP
1. `www/`: Aplicación web y PWA offline-first (`index.html`, `styles.css`, `app.js`, `manifest.json`, `sw.js`).
2. `native-android/`: Proveedor nativo en Kotlin (`BrisaPlanWidgetProvider.kt`), layouts XML para el widget de pantalla de inicio (`BrisaPlan Hoy`), script de inyección de permisos (`inject_native.py`) y `brisaplan-debug.keystore`.
3. `.github/workflows/build-apk.yml`: Flujo automático para compilar `BrisaPlan.apk` y publicarlo en Releases.
