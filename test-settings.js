const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const context = { window: {}, Math, Number };
vm.createContext(context);
vm.runInContext(fs.readFileSync("dist/settings.js", "utf8"), context);

const settings = context.window.WorkoutSettings;
assert.equal(Math.round(settings.averageTargetPercent({ points:[[0,50],[600,100]] })), 75, "ramps should use a time-weighted target");
assert.equal(Math.round(settings.averageTargetPercent({ points:[[0,50],[300,50],[300,100],[600,100]] })), 75, "step transitions should not inflate the average");
assert.equal(Math.round(settings.averageTargetPercent({ points:[], intensity:0.85 })), 85, "intensity should be the fallback when a profile is missing");

const workouts = require("./dist/workouts.json").workouts;
const tempo = workouts.find((workout) => workout.name === "Tempo · 3×8 · Foundation 1");
assert.equal(
  settings.practicalDescription(tempo),
  "Intervals format. 3 × 8 min, 3 min easy.",
  "library descriptions should summarize the actual work and recovery prescription",
);
assert.equal(
  settings.practicalDescription({ type:"Tempo", structure:"Unclassified", duration:3600, intensity:0.8, points:[] }),
  "Tempo work. 60 min with an average target of 80% FTP.",
  "workouts without source descriptions should still get a target-based summary",
);

console.log("Workout target metric and prescription regressions passed.");
