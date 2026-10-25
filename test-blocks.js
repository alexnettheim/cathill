const fs = require("fs");
const vm = require("vm");

const dataSource = fs.readFileSync("dist/workouts-data.js", "utf8");
const settingsSource = fs.readFileSync("dist/settings.js", "utf8");
const intervalsSource = fs.readFileSync("dist/intervals.js", "utf8");
const appSource = fs.readFileSync("dist/blocks.js", "utf8");
const elements = new Map();
const storage = new Map();
const defaults = {
  blockName: "Test Base Block", blockType: "base1", cyclingDays: "4", hardDays: "2",
  weeklyHours: "7", longRideDay: "Sunday", difficulty: "normal",
};
function element(id = "") {
  if (!elements.has(id)) elements.set(id, {
    value: defaults[id] || "", textContent: "", innerHTML: "", hidden: false, disabled: false,
    addEventListener() {}, setAttribute() {}, showModal() {}, close() {},
  });
  return elements.get(id);
}
const context = {
  console, TextEncoder, Uint8Array, Uint32Array, DataView, Blob, Date, Math, Map, Set,
  setTimeout() {}, requestAnimationFrame() {}, window: { addEventListener() {}, devicePixelRatio: 1 },
  document: {
    querySelector(selector) { return element(selector.startsWith("#") ? selector.slice(1) : selector); },
    querySelectorAll() { return []; }, createElement() { return element("created"); },
  },
  localStorage: { getItem(key) { return storage.get(key) ?? null; }, setItem(key, value) { storage.set(key, String(value)); }, removeItem(key) { storage.delete(key); } },
};
context.window.window = context.window;
vm.createContext(context);
vm.runInContext(dataSource, context);
vm.runInContext(settingsSource, context);
vm.runInContext(intervalsSource, context);
vm.runInContext(appSource, context);
if (!vm.runInContext("window.WorkoutSettings.setFtp(285) && window.WorkoutSettings.getFtp() === 285", context)) throw new Error("FTP persistence helper failed");
if (vm.runInContext("window.WorkoutSettings.formatDuration(600)", context) !== "10 min") throw new Error("Segment duration formatting failed");

const settings = { name: "Test", type: "base1", cyclingDays: 4, hardDays: 2, weeklyHours: 7, longRideDay: "Sunday", difficulty: "normal" };
const results = [];
const used = new Set();
let previousWeek = null;
for (let weekIndex = 0; weekIndex < 4; weekIndex += 1) {
  context.testSettings = settings; context.testWeek = weekIndex; context.testUsed = used; context.testPrevious = previousWeek;
  const week = vm.runInContext("generateWeek(testSettings, testWeek, testUsed, testPrevious)", context);
  context.testGeneratedWeek = week;
  const totals = vm.runInContext("weekTotals(testGeneratedWeek)", context);
  results.push({
    week: weekIndex + 1, rides: week.sessions.length, hard: totals.hardDays,
    hours: Number((totals.minutes / 60).toFixed(2)), tss: Math.round(totals.tss), tiz: Math.round(totals.hardTiz),
    missing: week.sessions.filter((session) => !session.workout).length,
  });
  previousWeek = week;
}

if (results.some((week) => week.rides !== 4 || week.missing)) throw new Error(`Invalid generated block: ${JSON.stringify(results)}`);
if (results[3].hard !== 1 || results[3].hours >= results[2].hours) throw new Error(`Recovery week guardrail failed: ${JSON.stringify(results)}`);

context.testBlock = { id: null, createdAt: new Date().toISOString(), settings, weeks: [] };
context.testUsed = new Set();
for (let weekIndex = 0; weekIndex < 4; weekIndex += 1) {
  context.testSettings = settings; context.testWeek = weekIndex; context.testPrevious = context.testBlock.weeks[weekIndex - 1] || null;
  context.testBlock.weeks.push(vm.runInContext("generateWeek(testSettings, testWeek, testUsed, testPrevious)", context));
}
vm.runInContext("state.current = testBlock; state.replacementTarget = {weekIndex: 0, sessionIndex: 0}", context);
const originalId = vm.runInContext("state.current.weeks[0].sessions[0].workout.id", context);
context.testReplacementId = vm.runInContext(`state.workouts.find(workout => workout.id !== ${originalId}).id`, context);
vm.runInContext("chooseReplacement(testReplacementId)", context);
if (vm.runInContext("state.current.weeks[0].sessions[0].workout.id", context) !== context.testReplacementId) throw new Error("Planner replacement did not persist");
context.testUploadBlock = context.testBlock;
const uploadEvents = vm.runInContext("window.IntervalsIcu.blockEvents(testUploadBlock, '2026-10-19')", context);
if (uploadEvents.length !== 16 || uploadEvents[0].category !== "WORKOUT" || uploadEvents[0].start_date_local !== "2026-10-20T00:00:00" || !uploadEvents[0].description.includes("%")) throw new Error("Intervals.icu block conversion failed");

const scenarios = [
  { type: "base1", cyclingDays: 3, hardDays: 1, weeklyHours: 4, longRideDay: "Sunday", difficulty: "conservative" },
  { type: "base2", cyclingDays: 5, hardDays: 2, weeklyHours: 8, longRideDay: "Saturday", difficulty: "normal" },
  { type: "build1", cyclingDays: 6, hardDays: 2, weeklyHours: 12, longRideDay: "Sunday", difficulty: "normal" },
  { type: "build2", cyclingDays: 5, hardDays: 3, weeklyHours: 10, longRideDay: "Saturday", difficulty: "aggressive" },
];
for (const scenario of scenarios) {
  const ids = new Set(); const summaries = []; let prior = null;
  for (let weekIndex = 0; weekIndex < 4; weekIndex += 1) {
    context.testSettings = { name: "Scenario", ...scenario }; context.testWeek = weekIndex; context.testUsed = ids; context.testPrevious = prior;
    const week = vm.runInContext("generateWeek(testSettings, testWeek, testUsed, testPrevious)", context);
    context.testGeneratedWeek = week; const totals = vm.runInContext("weekTotals(testGeneratedWeek)", context);
    summaries.push({ missing: week.sessions.filter((session) => !session.workout).length, hours: totals.minutes / 60, hard: totals.hardDays, tiz: totals.hardTiz });
    prior = week;
  }
  if (summaries.some((week) => week.missing)) throw new Error(`Missing workouts: ${JSON.stringify({ scenario, summaries })}`);
  if (summaries[3].hours >= summaries[2].hours || summaries[3].hard > 1) throw new Error(`Bad recovery week: ${JSON.stringify({ scenario, summaries })}`);
  if (summaries[1].tiz + 2 < summaries[0].tiz || summaries[2].tiz + 2 < summaries[1].tiz) throw new Error(`Loading-week TIZ did not progress: ${JSON.stringify({ scenario, summaries })}`);
}
const testZip = vm.runInContext('zipStore([{name:"test.txt",data:"zip ok"},{name:"nested/data.json",data:"{\\"ok\\":true}"}])', context);
const testZwo = vm.runInContext("createZwo(state.workouts[0])", context);
fs.writeFileSync("test-workout.zwo", testZwo);
testZip.arrayBuffer().then((buffer) => {
  fs.writeFileSync("test-block.zip", Buffer.from(buffer));
  console.log(JSON.stringify({ baseScenario: results, scenariosChecked: scenarios.length, zipBytes: buffer.byteLength }));
}).catch((error) => { console.error(error); process.exitCode = 1; });
