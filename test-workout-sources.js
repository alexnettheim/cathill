const fs = require("fs");
const assert = require("assert");
const { JSDOM } = require("./vendor/auuki/node_modules/jsdom");
const indexedDB = require("./vendor/auuki/node_modules/fake-indexeddb");

(async () => {
  const dom = new JSDOM("<!doctype html>", { url:"http://localhost", runScripts:"dangerously" });
  Object.defineProperty(dom.window, "indexedDB", { value:indexedDB });
  dom.window.eval(fs.readFileSync("dist/workout-sources.js", "utf8"));
  const sources = dom.window.WorkoutSources;

  const json = sources.parseJson(JSON.stringify({ name:"Club workouts", workouts:[{ id:"tempo-1", name:"Tempo one", type:"Tempo", points:[[0,.5],[300,.8],[600,.8]] }] }));
  assert.equal(json.name, "Club workouts");
  assert.equal(json.workouts[0].duration, 600);
  assert.deepEqual([...json.workouts[0].points[1]], [300,80]);

  const zwo = sources.parseZwo(`<?xml version="1.0"?><workout_file><name>Two by five</name><description>Threshold repeats</description><workout><Warmup Duration="300" PowerLow="0.5" PowerHigh="0.75"/><IntervalsT Repeat="2" OnDuration="300" OffDuration="120" OnPower="1.0" OffPower="0.5"/><Cooldown Duration="180" PowerLow="0.5" PowerHigh="0.3"/></workout></workout_file>`, "fixture");
  assert.equal(zwo.name, "Two by five");
  assert.equal(zwo.duration, 1320);
  assert.equal(zwo.type, "Threshold");

  const library = sources.createLibrary("Test library", [zwo]);
  await sources.save(library);
  let stored = await sources.list();
  assert.equal(stored.length, 1);
  assert.equal(stored[0].workouts[0].provider, library.provider);
  await sources.remove(library.id);
  stored = await sources.list();
  assert.equal(stored.length, 0);

  console.log("Custom workout source import and persistence regression passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
