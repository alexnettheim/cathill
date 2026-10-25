(function calendarModel(global) {
  "use strict";
  const STORAGE_KEY = "workout-calendar-v2", LEGACY_CALENDAR_KEY = "workout-calendar-v1", LEGACY_BLOCKS_KEY = "workout-blocks-v1";
  function parseDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || ""); if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12); return Number.isNaN(date.getTime()) ? null : date;
  }
  function isoDate(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
  function addDays(value, amount) { const date = typeof value === "string" ? parseDate(value) : new Date(value); if (!date) return null; date.setDate(date.getDate() + amount); return isoDate(date); }
  function mondayOf(value) { const date = typeof value === "string" ? parseDate(value) : new Date(value); if (!date) return null; date.setDate(date.getDate() - ((date.getDay() + 6) % 7)); return isoDate(date); }
  function monthStart(value) { const date = typeof value === "string" ? parseDate(value) : new Date(value); return isoDate(new Date(date.getFullYear(), date.getMonth(), 1, 12)); }
  function addMonths(value, amount) { const date = parseDate(value); date.setDate(1); date.setMonth(date.getMonth() + amount); return isoDate(date); }
  function gridDates(month) { const start = mondayOf(monthStart(month)); return Array.from({ length: 35 }, (_, index) => addDays(start, index)); }
  function newId(prefix = "event") { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
  function emptyState() { return { version: 2, events: [], plans: [], migratedLegacy: false, updatedAt: new Date().toISOString() }; }
  function createEvent(date, workout, options = {}) {
    if (!parseDate(date) || !workout) throw new Error("A valid date and workout are required.");
    return {
      id: options.id || newId("event"), date, workoutRef: global.WorkoutLibrary.reference(workout), workoutSnapshot: global.WorkoutLibrary.snapshot(workout),
      source: options.source || "manual", planId: options.planId || null, planWeek: Number.isInteger(options.planWeek) ? options.planWeek : null,
      planSession: Number.isInteger(options.planSession) ? options.planSession : null, status: options.status || "planned", userModified: Boolean(options.userModified),
      createdAt: options.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
  }
  function eventsFromPlan(plan, startDate) {
    if (!parseDate(startDate)) throw new Error("Choose a valid start date.");
    const monday = mondayOf(startDate);
    return plan.weeks.flatMap((week) => week.sessions.map((session, sessionIndex) => createEvent(addDays(monday, week.weekIndex * 7 + session.dayIndex), session.workout, { source: "plan", planId: plan.id, planWeek: week.weekIndex, planSession: sessionIndex })));
  }
  function applyPlan(state, plan, startDate, today = isoDate(new Date())) {
    const kept = (state.events || []).filter((event) => event.date < today || event.status === "completed" || event.userModified || event.source !== "plan");
    const planRecord = { id: plan.id, name: plan.settings.name, purpose: plan.settings.purpose, startDate: mondayOf(startDate), createdAt: plan.createdAt };
    return { ...state, version: 2, events: [...kept, ...eventsFromPlan(plan, startDate)].sort((a, b) => a.date.localeCompare(b.date)), plans: [...(state.plans || []).filter((item) => item.id !== plan.id), planRecord], updatedAt: new Date().toISOString() };
  }
  function updateEvent(state, eventId, changes) {
    let found = false;
    const events = state.events.map((event) => event.id === eventId ? (found = true, { ...event, ...changes, updatedAt: new Date().toISOString() }) : event);
    if (!found) throw new Error("Calendar event not found.");
    return { ...state, events, updatedAt: new Date().toISOString() };
  }
  function moveEvent(state, eventId, date) { if (!parseDate(date)) throw new Error("Choose a valid calendar date."); return updateEvent(state, eventId, { date, userModified: true }); }
  function replaceEvent(state, eventId, workout) { return updateEvent(state, eventId, { workoutRef: global.WorkoutLibrary.reference(workout), workoutSnapshot: global.WorkoutLibrary.snapshot(workout), userModified: true }); }
  function removeEvent(state, eventId) { return { ...state, events: state.events.filter((event) => event.id !== eventId), updatedAt: new Date().toISOString() }; }
  function removePlan(state, planId, today = isoDate(new Date()), completedEventIds = []) {
    const completed = new Set(completedEventIds);
    const events = state.events.filter((event) => event.planId !== planId || event.date < today || event.status === "completed" || completed.has(event.id));
    return { ...state, events, plans: (state.plans || []).filter((plan) => plan.id !== planId), updatedAt: new Date().toISOString() };
  }
  function migrateLegacy(storage, library) {
    const state = emptyState(); let active = null, blocks = [];
    try { active = JSON.parse(storage.getItem(LEGACY_CALENDAR_KEY) || "null"); } catch {}
    try { blocks = JSON.parse(storage.getItem(LEGACY_BLOCKS_KEY) || "[]"); } catch {}
    const block = blocks.find((item) => String(item.id) === String(active?.blockId));
    if (block && active?.startDate) {
      block.weeks.forEach((week, fallbackWeekIndex) => {
        const weekIndex = Number.isInteger(week.weekIndex) ? week.weekIndex : fallbackWeekIndex;
        week.sessions.forEach((session, sessionIndex) => {
          const key = `w${weekIndex}s${sessionIndex}`;
          const date = active.overrides?.[key] || addDays(active.startDate, weekIndex * 7 + Number(session.dayIndex || 0));
          const workout = library.resolve(session.workoutId, session.workout);
          if (workout) state.events.push(createEvent(date, workout, { source: "plan", planId: String(block.id), planWeek: weekIndex, planSession: sessionIndex }));
        });
      });
      state.plans.push({ id: String(block.id), name: block.settings?.name || "Migrated block", purpose: block.settings?.type || "legacy", startDate: active.startDate, createdAt: block.createdAt });
    }
    state.migratedLegacy = true; return state;
  }
  function read(storage, library) {
    try { const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || "null"); if (parsed?.version === 2 && Array.isArray(parsed.events)) return parsed; } catch {}
    const migrated = migrateLegacy(storage, library); storage.setItem(STORAGE_KEY, JSON.stringify(migrated)); return migrated;
  }
  function write(storage, state) { storage.setItem(STORAGE_KEY, JSON.stringify({ ...state, version: 2, updatedAt: new Date().toISOString() })); }
  global.WorkoutCalendarModel = { STORAGE_KEY, LEGACY_CALENDAR_KEY, LEGACY_BLOCKS_KEY, parseDate, isoDate, addDays, mondayOf, monthStart, addMonths, gridDates, emptyState, createEvent, eventsFromPlan, applyPlan, moveEvent, replaceEvent, updateEvent, removeEvent, removePlan, migrateLegacy, read, write };
}(window));
