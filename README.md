# BrisaPlan v8

Organizador personal minimalista (PWA + Android APK vía GitHub Actions y Capacitor).

## Estructura del Proyecto
- `www/`: Código fuente web (HTML5, CSS3, JS modular, Service Worker y Manifest).
- `.github/workflows/build-apk.yml`: Flujo automático de GitHub Actions que compila el APK con Capacitor y Gradle y lo publica en GitHub Releases (`v8.0.x`).
- `capacitor.config.json` & `package.json`: Configuración nativa para Android (`io.github.tejon876.brisaplan`).

## Despliegue rápido en GitHub
1. Sube el contenido de esta carpeta a tu repositorio `tejon876/brisaplan.github.io`.
2. Ve a la pestaña **Actions** en GitHub y verifica que **Build BrisaPlan Android APK** se ejecute correctamente.
3. Descarga el archivo `BrisaPlan.apk` desde la sección **Releases** o directamente desde el botón integrado en la aplicación.
