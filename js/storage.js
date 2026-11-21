export function todayISO() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now - offset).toISOString().split('T')[0];
}

export function todayWeekday() {
  return new Date().getDay();
}

export function formatShortDateES(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function createCleanState() {
  return {
    habits: [],
    tasks: [],
    agenda: [],
    mailAccounts: [],
    messages: [],
    mailMonthsRange: 1,
    backupIntervalDays: 7,
    lastBackupAt: null,
    selectedWidgets: {
      tasksAgenda: true,
      mail: true,
      habits: true
    },
    notificationsEnabled: false,
    tutorialSeen: false
  };
}
