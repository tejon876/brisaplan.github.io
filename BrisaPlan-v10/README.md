# BrisaPlan v10 (Estética Original + Widgets Flotantes con 1 Clic + Firma Fija)

## Huella SHA-1 Fija (Registrar en Firebase Console > `com.brisaplan.app`)
`SHA1: 66:59:03:B8:0F:FD:6E:8F:03:F5:29:74:14:F5:5F:1B:AF:48:55:E2`

## Mejoras de la v10
1. **Estética unificada Web y Android:** Paleta durazno-marfil y azul pastel con modo oscuro puro (`#000000`), tutorial interactivo paso a paso y textos 100% neutros para cualquier usuario.
2. **Estudio flotante de Widgets con 1 clic:** Permite previsualizar en vivo 3 estilos (**Resumen Hoy**, **Agenda del Día** y **Rachas Activas**), activarlos/desactivarlos y fijarlos directamente en la pantalla de inicio con `AppWidgetManager.requestPinAppWidget()`.
3. **Firma SHA-1 y Manifest garantizados:** `inject_native.py` se ejecuta después de `npx cap sync android` y configura `signingConfigs.debug` en `build.gradle` para eliminar el error `Something went wrong` en Google Sign-In.
