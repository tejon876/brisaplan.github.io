import { todayISO, todayWeekday } from './storage.js';

export const WEEK_DAYS_MON_SUN = [
  { day: 1, short: 'Lun', full: 'Lunes' },
  { day: 2, short: 'Mar', full: 'Martes' },
  { day: 3, short: 'Mié', full: 'Miércoles' },
  { day: 4, short: 'Jue', full: 'Jueves' },
  { day: 5, short: 'Vie', full: 'Viernes' },
  { day: 6, short: 'Sáb', full: 'Sábado' },
  { day: 0, short: 'Dom', full: 'Domingo' }
];

export const BLOCK_COLOR_PRESETS = [
  { hex: '#4A93C6', name: 'Cielo' },
  { hex: '#38B2AC', name: 'Menta' },
  { hex: '#52B788', name: 'Bosque' },
  { hex: '#6366F1', name: 'Índigo' },
  { hex: '#8B5CF6', name: 'Lavanda' },
  { hex: '#EC4899', name: 'Rosa' },
  { hex: '#F59E0B', name: 'Ámbar' },
  { hex: '#EF4444', name: 'Coral' }
];

export function getWeekDatesMonSun(baseIso = todayISO()) {
  const [y, m, d] = baseIso.split('-').map(Number);
  const base = new Date(y, (m || 1) - 1, d || 1);
  const jsDay = base.getDay(); // 0=Dom..6=Sab
  const diffToMonday = jsDay === 0 ? -6 : 1 - jsDay;
  const monday = new Date(base);
  monday.setDate(base.getDate() + diffToMonday);

  return WEEK_DAYS_MON_SUN.map((info, idx) => {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + idx);
    const off = dt.getTimezoneOffset() * 60000;
    const iso = new Date(dt - off).toISOString().split('T')[0];
    return {
      ...info,
      iso,
      dayNum: dt.getDate(),
      monthShort: dt.toLocaleDateString('es-MX', { month: 'short' })
    };
  });
}

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
    recurrence = 'permanent',
    days = [1]
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
    color: color || '#4A93C6',
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
  item.time = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;

  if (item.endTime) {
    const [eh, em] = item.endTime.split(':').map(Number);
    let endTotal = eh * 60 + em + deltaMinutes;
    if (endTotal < 0) endTotal += 1440;
    endTotal = endTotal % 1440;
    item.endTime = `${String(Math.floor(endTotal / 60)).padStart(2, '0')}:${String(endTotal % 60).padStart(2, '0')}`;
  }
  sortAgenda(state);
}

export function removeAgendaItem(state, id) {
  state.agenda = state.agenda.filter((a) => a.id !== id);
}

function sortAgenda(state) {
  state.agenda.sort((a, b) => a.time.localeCompare(b.time));
}
