const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const context = { window: {}, Date, console, Map, Set, Math };
context.window.window = context.window;
vm.createContext(context);
for (const file of ["dist/workouts-data.js", "dist/workout-library.js", "dist/block-engine.js"]) vm.runInContext(fs.readFileSync(file, "utf8"), context);
const library = context.window.WorkoutLibrary.create(context.window.WORKOUT_DATA.workouts);
const engine = context.window.WorkoutBlockEngine;

const settings = { name: "Threshold block", purpose: "threshold", weeklyHours: 7, startingTiz: "standard", rideDays: [1, 3, 5, 6], qualityDays: [1, 3], longRideDay: 6 };
const block = engine.generate(settings, library.workouts);
assert.equal(block.weeks.length, 4);
assert(block.weeks.every((week) => week.sessions.length === 4));
assert(block.weeks.every((week) => week.sessions.every((session) => session.workout)), "every slot should resolve a workout");
const totals = block.weeks.map(engine.totals);
assert(totals[1].tiz + 1 >= totals[0].tiz, "week two TiZ should not regress");
assert(totals[2].tiz + 1 >= totals[1].tiz, "week three TiZ should not regress");
assert(totals[3].tiz < totals[2].tiz, "recovery TiZ should fall");
assert(Math.abs(totals[1].minutes - totals[0].minutes) <= 45, "loading-week volume should remain approximately stable");
const weekendFallback = engine.reconcileSchedule([1, 3, 5], [1, 3], 6);
assert.equal(JSON.stringify(weekendFallback.qualityDays), JSON.stringify([1, 3]));
assert.equal(weekendFallback.longRideDay, 5, "removing Sunday should move the long ride to Saturday, not a quality day");
assert(!weekendFallback.qualityDays.includes(weekendFallback.longRideDay));
const cappedQuality = engine.reconcileSchedule([0, 1, 3, 6], [0, 1, 3], 6);
assert.equal(cappedQuality.qualityDays.length, 2, "fewer than five riding days should cap quality at two");
assert(cappedQuality.eligibleLongDays.includes(cappedQuality.longRideDay));

const ramp = { points: [[0, 50], [600, 100]] };
assert(Math.abs(engine.workoutTiz(ramp, "Endurance") - 4.2) < 0.15, "ramp TiZ should be split at zone boundaries");
console.log(JSON.stringify({ weeks: totals.map((item) => ({ hours: Number((item.minutes / 60).toFixed(2)), tss: Math.round(item.tss), tiz: Math.round(item.tiz) })) }));
