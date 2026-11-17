import { getTodayISO } from './storage.js';

export function isHabitDoneToday(habit) {
  return habit.lastCompletedDate === getTodayISO();
}

export function toggleHabitToday(state, habitId) {
  const today = getTodayISO();
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const offset = yesterdayDate.getTimezoneOffset() * 60000;
  const yesterday = new Date(yesterdayDate - offset).toISOString().split('T')[0];

  const habit = state.habits.find((h) => h.id === habitId);
  if (!habit) return;

  if (habit.lastCompletedDate === today) {
    habit.lastCompletedDate = habit.history.filter((d) => d !== today).slice(-1)[0] || null;
    habit.history = habit.history.filter((d) => d !== today);
    habit.streak = Math.max(0, (habit.streak || 1) - 1);
  } else {
    const continuesStreak = habit.lastCompletedDate === yesterday;
    habit.streak = continuesStreak ? (habit.streak || 0) + 1 : 1;
    habit.lastCompletedDate = today;
    if (!habit.history.includes(today)) {
      habit.history.push(today);
    }
  }
}

export function addHabit(state, name, category = 'General') {
  const clean = name.trim();
  if (!clean) return;
  state.habits.unshift({
    id: `h-${Date.now()}`,
    name: clean,
    category: category.trim() || 'General',
    streak: 0,
    lastCompletedDate: null,
    history: []
  });
}

export function deleteHabit(state, habitId) {
  state.habits = state.habits.filter((h) => h.id !== habitId);
}

export function addTask(state, title, priority = 'media') {
  const clean = title.trim();
  if (!clean) return;
  state.tasks.unshift({
    id: `t-${Date.now()}`,
    title: clean,
    priority,
    done: false
  });
}

export function toggleTask(state, taskId) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (task) task.done = !task.done;
}

export function deleteTask(state, taskId) {
  state.tasks = state.tasks.filter((t) => t.id !== taskId);
}
