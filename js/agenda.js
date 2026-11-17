export function addAgendaBlock(state, time, title) {
  const cleanTitle = title.trim();
  if (!time || !cleanTitle) return;
  state.agenda.push({
    id: `a-${Date.now()}`,
    time,
    title: cleanTitle
  });
  state.agenda.sort((a, b) => a.time.localeCompare(b.time));
}

export function deleteAgendaBlock(state, id) {
  state.agenda = state.agenda.filter((item) => item.id !== id);
}
