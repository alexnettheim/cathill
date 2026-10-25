const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

let stored;
let destination;
const context = {
  window: {
    location: { assign(value) { destination = value; } },
    WorkoutSettings: { getFtp() { return 267; } },
    localStorage: { setItem(key, value) { stored = { key, value }; } },
  },
  localStorage: { setItem(key, value) { stored = { key, value }; } },
  Date,
  encodeURIComponent,
};
context.window.localStorage = context.localStorage;
vm.runInNewContext(fs.readFileSync("dist/ride-handoff.js", "utf8"), context);

const workout = { id: 317960, name: "Starlight -1" };
const zwo = "<?xml version=\"1.0\"?><workout_file><name>Starlight -1</name></workout_file>";
context.window.WorkoutRide.launch(workout, zwo);

const payload = JSON.parse(stored.value);
assert.equal(stored.key, "workout-finder:ride-now:v1");
assert.equal(payload.workoutId, "317960");
assert.equal(payload.workoutName, "Starlight -1");
assert.equal(payload.zwo, zwo);
assert.equal(payload.ftp, 267);
assert.equal(destination, "ride/index.html?source=workout-finder&workout=317960");
context.window.WorkoutRide.launch(workout, zwo, { blockId: "block-1", sessionKey: "w0s0", scheduledDate: "2026-10-23" });
const plannedPayload = JSON.parse(stored.value);
assert.deepEqual(plannedPayload.plan, { blockId: "block-1", sessionKey: "w0s0", scheduledDate: "2026-10-23" });
assert.equal(plannedPayload.returnUrl, "../index.html");
assert.throws(() => context.window.WorkoutRide.createPayload({}, "bad"), /could not be prepared/);
assert(fs.readFileSync("vendor/auuki/src/index.html", "utf8").includes('css/workout-finder.css'));
assert(fs.readFileSync("vendor/auuki/src/index.html", "utf8").includes("CATHILL Ride"));
assert.equal(JSON.parse(fs.readFileSync("vendor/auuki/src/manifest.webmanifest", "utf8")).short_name, "CATHILL");
assert(fs.existsSync("vendor/auuki/src/css/workout-finder.css"));
console.log("Ride handoff regression passed.");
