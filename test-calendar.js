const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const context = { window: {}, Date, console, Map, Math };
context.window.window = context.window;
vm.createContext(context);
for (const file of ["dist/workout-library.js", "dist/calendar-model.js"]) vm.runInContext(fs.readFileSync(file, "utf8"), context);
const library = context.window.WorkoutLibrary.create([
  { id: 11, name: "Aerobic", type: "Endurance", duration: 3600, tss: 40, points: [[0, 55], [3600, 70]] },
  { id: 22, name: "Threshold", type: "Threshold", duration: 5400, tss: 90, points: [[0, 50], [600, 100], [4200, 100], [5400, 40]] },
]);
const calendar = context.window.WorkoutCalendarModel;
assert.equal(library.workouts[0].uid, "open-workouts:11");
assert.equal(library.resolve(11).name, "Aerobic");
assert.equal(library.resolve({ provider: "open-workouts", id: "22" }).name, "Threshold");
const collidingProviders = context.window.WorkoutLibrary.create([
  { id:"same", provider:"one", name:"One", duration:60, points:[[0,50],[60,50]] },
  { id:"same", provider:"two", name:"Two", duration:60, points:[[0,60],[60,60]] },
]);
assert.equal(collidingProviders.resolve({ provider:"two", id:"same" }).name, "Two");
assert.equal(collidingProviders.resolve({ provider:"missing", id:"same" }, { id:"snapshot", provider:"missing", name:"Snapshot", duration:60, points:[[0,70],[60,70]] }).name, "Snapshot");
assert.equal(calendar.gridDates("2026-10-01").length, 35);
assert.equal(calendar.gridDates("2026-10-01")[0], "2026-09-28");

const plan = {
  id: "plan-a", createdAt: new Date().toISOString(), settings: { name: "Threshold block", purpose: "threshold" },
  weeks: [
    { weekIndex: 0, sessions: [{ dayIndex: 1, workout: library.resolve(22) }] },
    { weekIndex: 1, sessions: [{ dayIndex: 6, workout: library.resolve(11) }] },
  ],
};
let state = calendar.applyPlan(calendar.emptyState(), plan, "2026-10-21", "2026-10-01");
assert.deepEqual(state.events.map((event) => event.date), ["2026-10-20", "2026-11-01"]);
assert.equal(state.events[0].workoutRef.provider, "open-workouts");
assert.equal(state.events[0].workoutSnapshot.name, "Threshold");

const firstId = state.events[0].id;
state = calendar.moveEvent(state, firstId, "2026-10-23");
assert.equal(state.events.find((event) => event.id === firstId).date, "2026-10-23");
assert.equal(state.events.find((event) => event.id === firstId).userModified, true);
state = calendar.replaceEvent(state, firstId, library.resolve(11));
assert.equal(state.events.find((event) => event.id === firstId).workoutSnapshot.name, "Aerobic");
state.events[0].status = "completed";
state.events.push(calendar.createEvent("2026-10-18", library.resolve(11), { id:"past-planned", source:"plan", planId:"plan-a" }));
state.events.push(calendar.createEvent("2026-11-02", library.resolve(11), { id:"activity-complete", source:"plan", planId:"plan-a" }));
state = calendar.removePlan(state, "plan-a", "2026-10-24", ["activity-complete"]);
assert.deepEqual(state.events.map((event) => event.id).sort(), [firstId, "activity-complete", "past-planned"].sort());
assert.equal(state.plans.length, 0);

const storageValues = new Map();
const storage = { getItem: (key) => storageValues.get(key) || null, setItem: (key, value) => storageValues.set(key, String(value)) };
storage.setItem(calendar.LEGACY_BLOCKS_KEY, JSON.stringify([{ id: "old", settings: { name: "Old plan" }, weeks: [{ weekIndex: 0, sessions: [{ dayIndex: 1, workoutId: 22 }] }] }]));
storage.setItem(calendar.LEGACY_CALENDAR_KEY, JSON.stringify({ blockId: "old", startDate: "2026-10-19", overrides: {} }));
const migrated = calendar.read(storage, library);
assert.equal(migrated.version, 2);
assert.equal(migrated.events.length, 1);
assert.equal(migrated.events[0].workoutSnapshot.name, "Threshold");
assert(storage.getItem(calendar.STORAGE_KEY), "migration should persist v2 state");

console.log("Provider-neutral calendar and migration regression passed.");
