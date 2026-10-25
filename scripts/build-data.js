#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const outputPath = path.resolve(__dirname, "../dist/workouts.json");
const scriptOutputPath = path.resolve(__dirname, "../dist/workouts-data.js");
const inputPath = path.resolve(process.argv[2] || outputPath);
const parsed = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const workouts = Array.isArray(parsed) ? parsed : parsed.workouts;

if (!Array.isArray(workouts) || !workouts.length) {
  throw new Error("Workout data must contain a non-empty workouts array.");
}

const ids = new Set();
for (const workout of workouts) {
  if (!workout?.id || !workout.name || !workout.provider || !Array.isArray(workout.points) || workout.points.length < 2) {
    throw new Error("Every workout needs an id, name, provider, and at least two power points.");
  }
  const identity = `${workout.provider}:${workout.providerId || workout.id}`;
  if (ids.has(identity)) throw new Error(`Duplicate workout identity: ${identity}`);
  ids.add(identity);
  if (/trainerroad/i.test(JSON.stringify(workout))) throw new Error(`Private provider data found in ${identity}.`);
}

const payload = {
  schemaVersion: Number(parsed.schemaVersion) || 1,
  provider: parsed.provider || { id:"open-workouts", name:"Open Workouts", origin:"independently authored" },
  generatedAt: new Date().toISOString(),
  count: workouts.length,
  workouts,
};

fs.writeFileSync(outputPath, JSON.stringify(payload));
fs.writeFileSync(scriptOutputPath, `window.WORKOUT_DATA=${JSON.stringify(payload)};\n`);
console.log(JSON.stringify({ outputPath, scriptOutputPath, count:workouts.length, provider:payload.provider.id }));
