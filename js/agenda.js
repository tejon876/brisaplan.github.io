import { todayISO, todayWeekday } from './storage.js';

export const WEEKDAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export function isAgendaItemActiveOnDate(item, isoDate = todayISO()) {
  if (item.recurrence === 'permanent') {
    const days = Array.isArray(item.days) && item.days.length ? item.days : [1, 2, 3, 4, 5];
    const [y, m, d] = isoDate.split('-').map(Number);
    const wd = new Date(y, (m || 1) - 1, d || 1).getDay();
    return days.includes(wd);
  }
  return item.date === isoDate;
}

export function addAgendaItem(
  state,
  {
    startTime,
    endTime = '',
    title,
    color = '#4A93C6',
    date = todayISO(),
    recurrence = 'temporary',
    days = [1, 2, 3, 4, 5]
  }
) {
  const clean = (title || '').trim();
  if (!startTime || !clean) return;
  const normalizedDays =
    Array.isArray(days) && days.length
      ? [...new Set(days.map(Number))].sort((a, b) => a - b)
      : [todayWeekday()];

  state.agenda.push({
    id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    date: recurrence === 'temporary' ? (date || todayISO()) : todayISO(),
    time: startTime,
    endTime: endTime || '',
    title: clean,
    color,
    recurrence: recurrence === 'permanent' ? 'permanent' : 'temporary',
    days: normalizedDays
  });
  sortAgenda(state);
}

export function updateAgendaItem(state, id, patch = {}) {
  const item = state.agenda.find((a) => a.id === id);
  if (!item) return;
  if (typeof patch.title === 'string' && patch.title.trim()) item.title = patch.title.trim();
  if (typeof patch.time === 'string' && patch.time) item.time = patch.time;
  if (typeof patch.endTime === 'string') item.endTime = patch.endTime;
  if (typeof patch.color === 'string' && patch.color) item.color = patch.color;
  if (patch.recurrence === 'permanent' || patch.recurrence === 'temporary') {
    item.recurrence = patch.recurrence;
  }
  if (typeof patch.date === 'string' && patch.date) {
    item.date = patch.date;
  }
  if (Array.isArray(patch.days) && patch.days.length) {
    item.days = [...new Set(patch.days.map(Number))].sort((a, b) => a - b);
  }
  sortAgenda(state);
}

export function shiftAgendaTime(state, id, deltaMinutes) {
  const item = state.agenda.find((a) => a.id === id);
  if (!item) return;
  const [hh, mm] = item.time.split(':').map(Number);
  let total = hh * 60 + mm + deltaMinutes;
  if (total < 0) total += 1440;
  total = total % 1440;
  const newH = String(Math.floor(total / 60)).padStart(2, '0');
  const newM = String(total % 60).padStart(2, '0');
  item.time = `${newH}:${newM}`;

  if (item.endTime) {
    const [eh, em] = item.endTime.split(':').map(Number);
    let endTotal = eh * 60 + em + deltaMinutes;
    if (endTotal < 0) endTotal += 1440;
    endTotal = endTotal % 1440;
    item.endTime = `${String(Math.floor(endTotal / 60)).padStart(2, '0')}:${String(endTotal % 60).padStart(2, '0')}`;
  }
  sortAgenda(state);
}

export function moveAgendaTomorrow(state, id) {
  const item = state.agenda.find((a) => a.id === id);
  if (!item) return;
  item.recurrence = 'temporary';
  const base = new Date((item.date || todayISO()) + 'T12:00:00');
  base.setDate(base.getDate() + 1);
  item.date = base.toISOString().split('T')[0];
  sortAgenda(state);
}

export function removeAgendaItem(state, id) {
  state.agenda = state.agenda.filter((a) => a.id !== id);
}

function sortAgenda(state) {
  state.agenda.sort((a, b) => {
    const keyA = a.recurrence === 'permanent' ? `0000-00-00 ${a.time}` : `${a.date} ${a.time}`;
    const keyB = b.recurrence === 'permanent' ? `0000-00-00 ${b.time}` : `${b.date} ${b.time}`;
    return keyA.localeCompare(keyB);
  });
}