import { getTodayISO } from './storage.js';

export function addAcademicNotice(state, source, subject) {
  const clean = subject.trim();
  if (!clean) return;
  state.notices.unshift({
    id: `n-${Date.now()}`,
    source: source || 'Classroom',
    subject: clean,
    date: getTodayISO()
  });
}

export function deleteAcademicNotice(state, id) {
  state.notices = state.notices.filter((n) => n.id !== id);
}
