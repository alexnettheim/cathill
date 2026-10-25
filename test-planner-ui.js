const fs = require("fs");
const assert = require("assert");
const vm = require("vm");

const html = fs.readFileSync("dist/index.html", "utf8");
const css = fs.readFileSync("dist/planner.css", "utf8");
const js = fs.readFileSync("dist/planner.js", "utf8");
const manifest = JSON.parse(fs.readFileSync("dist/manifest.webmanifest", "utf8"));

assert(css.includes("[hidden] { display:none!important }"), "hidden preview states must not be overridden by component display rules");
assert(html.includes("<title>Calendar · CATHILL</title>") && html.includes('alt="CATHILL"'), "Calendar should use the CATHILL product brand");
assert(html.includes('rel="manifest"') && manifest.name === "CATHILL", "Calendar should expose CATHILL install metadata");
assert(html.includes('id="librarySort"'), "the workout library should expose sorting");
assert(html.includes('src="workout-sources.js"') && html.includes('id="customLibraryFiles"'), "settings should load and expose custom workout libraries");
assert(js.includes("data-inspect-workout"), "workout library cards should offer an inspection view");
assert(html.includes('id="libraryLoadMore"') && js.includes('$("#libraryDialog").addEventListener("scroll"'), "workout results should continue loading at the bottom of the library");
assert(js.includes("data-toggle-builtin") && js.includes("data-remove-source"), "workout sources should be independently removable");
assert(js.includes('state.pickerMode === "plan"'), "draft-plan workout replacement should remain separate from calendar replacement");
assert(js.includes("data-plan-profile"), "draft workouts should render interactive profiles");
assert(js.includes("week-summary-cell"), "each calendar row should include its own week summary");
assert(js.includes('draggable="true"'), "calendar workout cards should be draggable");
assert(js.includes("function calendarProfileSvg") && js.includes('class="calendar-profile-line"') && css.includes(".calendar-workout-profile"), "calendar workout cards should render a layout-independent power profile");
const profileFunction = js.match(/function calendarProfileSvg\(workout\) \{[\s\S]*?\n\}/)?.[0];
assert(profileFunction, "calendar profile renderer should be available");
const renderedProfile = vm.runInNewContext(`${profileFunction}; calendarProfileSvg({duration:600,points:[[0,50],[300,90],[600,50]]})`);
assert(renderedProfile.includes("calendar-profile-line") && /L 50\.00 [0-9.]+/.test(renderedProfile), "calendar profile renderer should emit visible interval geometry");
assert(js.includes("averageTargetPercent(workout)"), "workout details should use the time-weighted target instead of the raw source field");
const calendarDetail = js.slice(js.indexOf("function openDetail"), js.indexOf("function fitCanvas"));
assert(calendarDetail.indexOf('id="rideWorkout"') < calendarDetail.indexOf('class="practical-summary"'), "Ride now should appear above the workout preview content");
assert(calendarDetail.indexOf('class="detail-controls"') < calendarDetail.indexOf('class="detail-description"'), "the workout description should follow the action controls");
assert(html.includes('id="managePlansButton"') && js.includes("model.removePlan"), "plans should support one-step workout removal");
assert(js.includes("window.confirm(`Delete ${workout.name}"), "manual workout deletion should require confirmation");
assert(js.includes("data-plan-inspect"), "draft plan workouts should open an inspection view");
assert(css.includes("height:calc(100dvh - 24px)"), "the block builder should stay within the viewport");
assert(js.includes("drawActivityProfile") && js.includes("attachActivityScrubber"), "completed rides should render scrobbable sensor traces");

console.log("Planner preview and library UI regression passed.");
