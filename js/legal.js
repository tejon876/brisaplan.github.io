export const ARCO_INFO = {
  title: 'Bóveda Cifrada AES-256 y Sesión Persistente',
  description:
    'Toda tu agenda, tareas y sesiones de correo se cifran localmente con AES-GCM de 256 bits antes de sincronizarse en Cloud Firestore. Tu sesión permanece iniciada en este dispositivo hasta que pulses Cerrar sesión.'
};

export const TUTORIAL_STEPS = [
  {
    selector: '#panel-hoy',
    tab: 'hoy',
    title: '1. Tu panel principal: Hoy',
    text: 'Aquí ves únicamente lo urgente del día: tus bloques activos de hoy, tareas próximas a vencer, hábitos pendientes y correos marcados como importantes.'
  },
  {
    selector: '#nav-agenda-trigger',
    tab: 'agenda',
    title: '2. Agenda Semanal por Bloques (Lun a Dom)',
    text: 'Visualiza toda tu semana de Lunes a Domingo. Toca cualquier día o el botón + Bloque, elige horario, color pastel o ruleta y activa si se repite cada semana.'
  },
  {
    selector: '#nav-tareas-trigger',
    tab: 'tareas',
    title: '3. Tareas con Día y Hora de Entrega',
    text: 'Organiza tus entregas en bloques visuales con fecha, hora límite, indicador de urgencia y temporizador Pomodoro integrado.'
  },
  {
    selector: '#nav-correos-trigger',
    tab: 'correos',
    title: '4. Correos por Cuenta y Rango (1 a 12 meses)',
    text: 'Conecta múltiples cuentas de correo con verificación de seguridad, cambia entre sesiones de cada cuenta, busca rápido y revisa tus importantes.'
  },
  {
    selector: '#btn-install-mobile-app',
    tab: 'hoy',
    title: '5. Instala BrisaPlan en Celular o PC',
    text: 'Descarga o instala la app directamente en tu dispositivo con un clic para abrirla como aplicación nativa.'
  }
];
