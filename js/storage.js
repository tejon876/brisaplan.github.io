export function todayISO() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now - offset).toISOString().split('T')[0];
}

export function createCleanState() {
  return {
    habits: [],
    tasks: [],
    agenda: [],
    mailAccounts: [],
    messages: [],
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
