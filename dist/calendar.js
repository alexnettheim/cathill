const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = (value) => String(value ?? "").replace(/[<>&"']/g, (char) => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;", '"':"&quot;", "'":"&#39;" }[char]));
const escapeXml = (value) => String(value ?? "").replace(/[<>&"']/g, (char) => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;", '"':"&quot;", "'":"&apos;" }[char]));
const minutes = (seconds) => Math.round(seconds / 60);
const model = window.WorkoutCalendarModel;
const colors = {
  Endurance: "#2c7a68", Tempo: "#8e9d3f", "Sweet Spot": "#d28b24",
  Threshold: "#e15d3f", "VO2 Max": "#b74367", Anaerobic: "#754d9e",
  Sprint: "#315f9a", Unclassified: "#97978f",
};
const state = {
  workouts: window.WORKOUT_DATA?.workouts || [], blocks: [], active: null, block: null,
  events: [], displayedWeek: null, activities: [], detailKey: null, replacementKey: null,
};
state.byId = new Map(state.workouts.map((workout) => [String(workout.id), workout]));

function todayIso() { return model.isoDate(new Date()); }
function dateObject(value) { return model.parseDate(value); }
function shortWeekday(value) { return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(dateObject(value)); }
function monthName(value) { return new Intl.DateTimeFormat(undefined, { month: "short" }).format(dateObject(value)); }
function longDate(value) { return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(dateObject(value)); }
function formatRange(start) {
  const end = model.addDays(start, 6), a = dateObject(start), b = dateObject(end);
  const left = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(a);
  const right = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(b);
  return `${left} – ${right}`;
}
function nextMonday() {
  const date = new Date();
  const days = (8 - date.getDay()) % 7;
  date.setDate(date.getDate() + days);
  return model.isoDate(date);
}

function readState() {
  try { state.blocks = JSON.parse(localStorage.getItem(model.BLOCKS_KEY) || "[]"); } catch { state.blocks = []; }
  try { state.active = JSON.parse(localStorage.getItem(model.STORAGE_KEY) || "null"); } catch { state.active = null; }
  state.block = state.blocks.find((block) => block.id === state.active?.blockId) || null;
  if (!state.block) state.active = null;
}

function writeBlocks() { localStorage.setItem(model.BLOCKS_KEY, JSON.stringify(state.blocks)); }
function writeActive() { localStorage.setItem(model.STORAGE_KEY, JSON.stringify(state.active)); }

function loadActivities() {
  return new Promise((resolve) => {
    if (!window.indexedDB) return resolve([]);
    const request = indexedDB.open("store");
    request.onerror = () => resolve([]);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("activity")) { db.close(); resolve([]); return; }
      const transaction = db.transaction("activity", "readonly");
      const all = transaction.objectStore("activity").getAll();
      all.onerror = () => { db.close(); resolve([]); };
      all.onsuccess = () => { const records = all.result || []; db.close(); resolve(records); };
    };
  });
}

function activityDate(record) { return model.isoDate(new Date(record.summary?.timestamp || 0)); }
function isCompleted(event) {
  return state.activities.some((record) => {
    const plan = record.summary?.plan;
    if (plan?.blockId === state.active.blockId && plan?.sessionKey === event.key) return true;
    return record.summary?.name === event.workout?.name && activityDate(record) === event.date;
  });
}

function rebuildEvents() {
  state.block = state.blocks.find((block) => block.id === state.active?.blockId) || null;
  state.events = model.scheduleEvents(state.block, state.active, state.byId);
}

function planContext(event) {
  return { blockId: state.active.blockId, sessionKey: event.key, scheduledDate: event.date };
}

function createZwo(workout) {
  const blocks = [];
  for (let index = 0; index < workout.points.length - 1; index += 1) {
    const [startTime, startPower] = workout.points[index], [endTime, endPower] = workout.points[index + 1];
    const duration = endTime - startTime; if (duration <= 0) continue;
    const low = startPower / 100, high = endPower / 100;
    blocks.push(Math.abs(low - high) < .00001
      ? `    <SteadyState Duration="${duration}" Power="${low.toFixed(4)}"/>`
      : `    <Ramp Duration="${duration}" PowerLow="${low.toFixed(4)}" PowerHigh="${high.toFixed(4)}"/>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<workout_file>\n  <author>CATHILL</author>\n  <name>${escapeXml(workout.name)}</name>\n  <description>${escapeXml(workout.description)}</description>\n  <sportType>bike</sportType>\n  <workout>\n${blocks.join("\n")}\n  </workout>\n</workout_file>\n`;
}

function rideEvent(event) {
  if (!event?.workout) return;
  window.WorkoutRide.launch(event.workout, createZwo(event.workout), planContext(event));
}

function eventForKey(key) { return state.events.find((event) => event.key === key) || null; }

function renderNextWorkout() {
  const event = state.events.find((item) => item.date >= todayIso() && item.workout && !isCompleted(item));
  const root = $("#nextWorkout");
  if (!event) {
    root.innerHTML = `<p class="next-empty">No remaining scheduled workouts in this block.</p>`;
    return;
  }
  const relative = event.date === todayIso() ? "Today" : longDate(event.date);
  root.innerHTML = `<div class="next-copy">
    <div class="next-date"><span>${escapeHtml(shortWeekday(event.date))}</span><strong>${dateObject(event.date).getDate()}</strong><span>${escapeHtml(monthName(event.date))}</span></div>
    <div><p>${relative === "Today" ? "Today’s planned workout" : `Next workout · ${escapeHtml(relative)}`}</p><h2>${escapeHtml(event.workout.name)}</h2><p>${escapeHtml(event.type)} · ${minutes(event.workout.duration)} min · ${Math.round(event.workout.tss)} TSS</p></div>
  </div><div class="next-actions"><button class="button" data-next-ride="${event.key}">Ride now</button><button class="button ghost" data-next-inspect="${event.key}">Inspect</button></div>`;
  $("[data-next-ride]", root).addEventListener("click", () => rideEvent(event));
  $("[data-next-inspect]", root).addEventListener("click", () => inspectEvent(event.key));
}

function renderWeekStrip() {
  const dates = Array.from({ length: 7 }, (_, index) => model.addDays(state.displayedWeek, index));
  $("#weekStrip").innerHTML = dates.map((date) => {
    const count = state.events.filter((event) => event.date === date).length;
    return `<button class="day-cell ${date === todayIso() ? "today" : ""} ${count ? "has-workout" : ""}" type="button" data-date="${date}">
      <span>${escapeHtml(shortWeekday(date))}</span><strong>${dateObject(date).getDate()}</strong><span>${escapeHtml(monthName(date))}</span>${count ? `<small>${count} ride${count > 1 ? "s" : ""}</small>` : ""}
    </button>`;
  }).join("");
}

function renderAgenda() {
  const weekEnd = model.addDays(state.displayedWeek, 6);
  const events = state.events.filter((event) => event.date >= state.displayedWeek && event.date <= weekEnd);
  const root = $("#agenda");
  if (!events.length) { root.innerHTML = `<div class="agenda-empty">No rides scheduled this week.</div>`; return; }
  root.innerHTML = events.map((event) => {
    if (!event.workout) return `<article class="agenda-row"><div class="agenda-date"><span>${shortWeekday(event.date)}</span><strong>${dateObject(event.date).getDate()}</strong></div><div class="agenda-accent"></div><div class="agenda-title"><h3>Workout unavailable</h3><p>Return to Block Builder to replace it.</p></div></article>`;
    const completed = isCompleted(event);
    return `<article class="agenda-row ${completed ? "completed" : ""}" style="--session-color:${colors[event.type] || colors.Unclassified}">
      <div class="agenda-date"><span>${escapeHtml(shortWeekday(event.date))}</span><strong>${dateObject(event.date).getDate()}</strong><span>${escapeHtml(monthName(event.date))}</span></div>
      <div class="agenda-accent"></div>
      <div class="agenda-title"><h3>${escapeHtml(event.workout.name)}</h3><p>${escapeHtml(event.role)} · ${escapeHtml(event.type)} · ${minutes(event.workout.duration)} min · ${Math.round(event.workout.tss)} TSS ${completed ? `· <span class="status-pill">Completed</span>` : ""}</p></div>
      <p class="agenda-description">${escapeHtml(window.WorkoutSettings.practicalDescription(event.workout, event.type))}</p>
      <div class="agenda-actions"><button class="button ghost" type="button" data-inspect="${event.key}">Inspect</button><button class="button ride-button" type="button" data-ride="${event.key}">${completed ? "Ride again" : "Ride now"}</button></div>
    </article>`;
  }).join("");
  $$('[data-inspect]', root).forEach((button) => button.addEventListener("click", () => inspectEvent(button.dataset.inspect)));
  $$('[data-ride]', root).forEach((button) => button.addEventListener("click", () => rideEvent(eventForKey(button.dataset.ride))));
}

function renderWeekSummary() {
  const end = model.addDays(state.displayedWeek, 6);
  const events = state.events.filter((event) => event.date >= state.displayedWeek && event.date <= end && event.workout);
  const totalMinutes = events.reduce((sum, event) => sum + event.workout.duration / 60, 0);
  const totalTss = events.reduce((sum, event) => sum + event.workout.tss, 0);
  const complete = events.filter(isCompleted).length;
  $("#weekSummary").innerHTML = `<span><strong>${events.length}</strong> rides</span><span><strong>${(totalMinutes / 60).toFixed(1)}</strong> hours</span><span><strong>${Math.round(totalTss)}</strong> TSS</span><span><strong>${complete}/${events.length}</strong> completed</span>`;
}

function renderCalendar() {
  readState();
  $("#calendarEmpty").hidden = Boolean(state.active);
  $("#calendarContent").hidden = !state.active;
  if (!state.active) return;
  rebuildEvents();
  if (!state.displayedWeek) state.displayedWeek = model.initialWeek(state.active, todayIso(), state.events);
  $("#activeBlockName").textContent = state.block.settings.name;
  $("#activeStartDate").value = state.active.startDate;
  const endDate = state.events.length ? state.events[state.events.length - 1].date : model.addDays(state.active.startDate, 27);
  $("#activeBlockMeta").textContent = `${state.block.settings.cyclingDays} cycling days/week · ${state.block.settings.hardDays} hard days · ${longDate(state.active.startDate)} through ${longDate(endDate)}`;
  $("#weekRange").textContent = formatRange(state.displayedWeek);
  renderNextWorkout(); renderWeekStrip(); renderWeekSummary(); renderAgenda();
}

function fitCanvas(canvas) {
  const ratio = window.devicePixelRatio || 1, rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(rect.width * ratio)); canvas.height = Math.max(1, Math.round(rect.height * ratio));
  const context = canvas.getContext("2d"); context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { context, width: rect.width, height: rect.height };
}

function drawProfile(canvas, workout) {
  const { context: ctx, width, height } = fitCanvas(canvas);
  const maxTime = Math.max(1, workout.duration), maxPower = Math.max(160, ...workout.points.map((point) => point[1]));
  const pad = { left: 52, right: 58, top: 22, bottom: 30 }, plotW = width - pad.left - pad.right, plotH = height - pad.top - pad.bottom;
  ctx.clearRect(0, 0, width, height); ctx.font = "11px system-ui"; ctx.strokeStyle = "rgba(24,35,29,.13)"; ctx.fillStyle = "#667068";
  const ftp = window.WorkoutSettings.getFtp();
  [50, 100, 150].forEach((percent) => {
    if (percent > maxPower) return; const y = pad.top + plotH - percent / maxPower * plotH;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(width - pad.right, y); ctx.stroke();
    ctx.textAlign = "right"; ctx.fillText(`${percent}%`, pad.left - 7, y + 4);
    if (ftp) { ctx.textAlign = "left"; ctx.fillText(`${Math.round(ftp * percent / 100)} W`, width - pad.right + 7, y + 4); }
  });
  ctx.beginPath(); ctx.moveTo(pad.left, pad.top + plotH);
  workout.points.forEach(([time, power]) => ctx.lineTo(pad.left + time / maxTime * plotW, pad.top + plotH - power / maxPower * plotH));
  ctx.lineTo(pad.left + plotW, pad.top + plotH); ctx.closePath();
  const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH); gradient.addColorStop(0, "rgba(240,128,78,.7)"); gradient.addColorStop(1, "rgba(240,128,78,.18)");
  ctx.fillStyle = gradient; ctx.fill(); ctx.strokeStyle = colors[workout.type] || colors.Unclassified; ctx.lineWidth = 2.5; ctx.stroke();
  canvas._geometry = { pad, plotW, maxTime };
}

function attachProfileHover(canvas, workout, tooltip) {
  canvas.addEventListener("pointermove", (event) => {
    const geometry = canvas._geometry; if (!geometry) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(geometry.pad.left, Math.min(geometry.pad.left + geometry.plotW, event.clientX - rect.left));
    const seconds = (x - geometry.pad.left) / geometry.plotW * geometry.maxTime;
    const portion = window.WorkoutSettings.profileAt(workout, seconds); if (!portion) return;
    const ftp = window.WorkoutSettings.getFtp(), watts = ftp ? Math.round(ftp * portion.percent / 100) : null;
    tooltip.hidden = false;
    tooltip.innerHTML = `<strong>${window.WorkoutSettings.formatDuration(portion.endSeconds - portion.startSeconds)} segment</strong>${Math.round(portion.percent)}% FTP${watts ? ` · ${watts} W` : " · set FTP for watts"}`;
    tooltip.style.left = `${Math.min(rect.width - 175, Math.max(0, x))}px`; tooltip.style.top = `${Math.max(54, event.clientY - rect.top)}px`;
  });
  canvas.addEventListener("pointerleave", () => { tooltip.hidden = true; });
}

function inspectEvent(key) {
  const event = eventForKey(key); if (!event?.workout) return;
  state.detailKey = key; const workout = event.workout, completed = isCompleted(event); const root = $("#workoutDetail");
  root.innerHTML = `<div class="detail-inner" style="--type-color:${colors[workout.type] || colors.Unclassified}">
    <span class="type-pill">${escapeHtml(workout.type)}</span><h2>${escapeHtml(workout.name)}</h2>
    <p class="detail-subtitle">${escapeHtml(longDate(event.date))} · ${escapeHtml(event.role)} · Workout ID ${workout.id}</p>
    <p class="practical-summary">${escapeHtml(window.WorkoutSettings.practicalDescription(workout, event.type))}</p>
    <div class="profile-detail-wrap"><canvas class="detail-profile"></canvas><div class="profile-tooltip" hidden></div></div>
    <div class="detail-metrics"><div class="metric"><strong>${minutes(workout.duration)} min</strong><small>Duration</small></div><div class="metric"><strong>${Math.round(workout.tss)}</strong><small>TSS</small></div><div class="metric"><strong>${workout.intensity.toFixed(2)}</strong><small>Intensity</small></div><div class="metric"><strong>${Math.round(workout.average)}%</strong><small>Avg FTP</small></div><div class="metric"><strong>${workout.level ? workout.level.toFixed(1) : "—"}</strong><small>Level</small></div></div>
    ${completed ? `<p class="completion-note">Completed locally</p>` : ""}
    <div class="move-row"><label class="calendar-field">Scheduled date<input class="move-date" type="date" value="${event.date}"></label><button class="button ghost move-button" type="button">Move</button></div>
    <div class="detail-actions"><button class="button ride-now-button" type="button">${completed ? "Ride again" : "Ride now"}</button><button class="button change-workout" type="button">Change workout</button></div>
  </div>`;
  $(".ride-now-button", root).addEventListener("click", () => rideEvent(event));
  $(".change-workout", root).addEventListener("click", () => { $("#workoutDialog").close(); openReplacement(key); });
  $(".move-button", root).addEventListener("click", () => moveEvent(key, $(".move-date", root).value));
  $("#workoutDialog").showModal();
  requestAnimationFrame(() => { const canvas = $(".detail-profile", root); drawProfile(canvas, workout); attachProfileHover(canvas, workout, $(".profile-tooltip", root)); });
}

function moveEvent(key, date) {
  state.active = model.moveSession(state.active, key, date); writeActive(); state.displayedWeek = model.mondayOf(date); $("#workoutDialog").close(); renderCalendar();
}

function openReplacement(key) {
  state.replacementKey = key; const event = eventForKey(key); if (!event) return;
  $("#replacementSearch").value = ""; $("#replacementScope").value = "similar";
  $("#replacementContext").textContent = `Replacing ${event.workout.name} on ${longDate(event.date)}.`;
  renderReplacement(); $("#replacementDialog").showModal();
}

function renderReplacement() {
  const event = eventForKey(state.replacementKey); if (!event) return;
  const query = $("#replacementSearch").value.trim().toLowerCase(), similar = $("#replacementScope").value === "similar";
  let workouts = state.workouts.filter((workout) => workout.id !== event.workout?.id && workout.duration > 0);
  if (similar) workouts = workouts.filter((workout) => workout.type === event.type && Math.abs(minutes(workout.duration) - minutes(event.workout.duration)) <= 45);
  if (query) workouts = workouts.filter((workout) => `${workout.name} ${workout.type} ${workout.structure} ${workout.description}`.toLowerCase().includes(query));
  workouts.sort((a, b) => Math.abs(minutes(a.duration) - minutes(event.workout.duration)) - Math.abs(minutes(b.duration) - minutes(event.workout.duration)) || a.name.localeCompare(b.name));
  $("#replacementResults").innerHTML = workouts.slice(0, 40).map((workout) => `<article class="replacement-option"><div class="replacement-copy"><div><span>${escapeHtml(workout.type)}</span><h3>${escapeHtml(workout.name)}</h3></div><p>${escapeHtml(window.WorkoutSettings.practicalDescription(workout))}</p><div class="option-meta"><span>${minutes(workout.duration)} min</span><span>${Math.round(workout.tss)} TSS</span><span>Level ${workout.level ? workout.level.toFixed(1) : "—"}</span></div></div><button type="button" data-replacement="${workout.id}">Choose</button></article>`).join("") || `<div class="replacement-empty">No workouts match.</div>`;
  $$('[data-replacement]', $("#replacementResults")).forEach((button) => button.addEventListener("click", () => chooseReplacement(button.dataset.replacement)));
}

function chooseReplacement(workoutId) {
  const workout = state.byId.get(String(workoutId)); if (!workout) return;
  if (!model.replaceWorkout(state.block, state.replacementKey, workout)) return;
  const index = state.blocks.findIndex((block) => block.id === state.block.id); state.blocks[index] = state.block; writeBlocks();
  $("#replacementDialog").close(); rebuildEvents(); renderCalendar(); inspectEvent(state.replacementKey);
}

function populatePlanDialog(preselected = null) {
  const select = $("#planBlockSelect");
  select.innerHTML = state.blocks.map((block) => `<option value="${escapeHtml(block.id)}">${escapeHtml(block.settings.name)}</option>`).join("");
  select.disabled = !state.blocks.length; $("#activatePlanButton").disabled = !state.blocks.length;
  if (preselected && state.blocks.some((block) => block.id === preselected)) select.value = preselected;
  else if (state.active) select.value = state.active.blockId;
  $("#planStartDate").value = state.active?.startDate || nextMonday();
  $("#planHelp").textContent = state.blocks.length ? "The selected date is normalized to Monday so weekday spacing remains intact." : "No saved blocks yet. Build and save one first.";
}

function openPlanDialog(preselected = null) { readState(); populatePlanDialog(preselected); $("#planDialog").showModal(); }
function activatePlan() {
  const blockId = $("#planBlockSelect").value, start = $("#planStartDate").value;
  if (!blockId || !model.parseDate(start)) { $("#planHelp").textContent = "Choose a saved block and valid start date."; return; }
  state.active = model.createActivePlan(blockId, start); writeActive(); state.displayedWeek = null; $("#planDialog").close(); renderCalendar();
}

$("#changePlanButton").addEventListener("click", () => openPlanDialog());
$("#emptyChooseButton").addEventListener("click", () => openPlanDialog());
$("#activatePlanButton").addEventListener("click", activatePlan);
$("#activeStartDate").addEventListener("change", (event) => {
  const normalized = model.mondayOf(event.target.value); if (!normalized) return;
  state.active.startDate = normalized; state.active.overrides = {}; writeActive(); state.displayedWeek = normalized; renderCalendar();
});
$("#previousWeek").addEventListener("click", () => { state.displayedWeek = model.addDays(state.displayedWeek, -7); renderCalendar(); });
$("#nextWeek").addEventListener("click", () => { state.displayedWeek = model.addDays(state.displayedWeek, 7); renderCalendar(); });
$("#todayButton").addEventListener("click", () => { state.displayedWeek = model.mondayOf(todayIso()); renderCalendar(); });
$("#replacementSearch").addEventListener("input", renderReplacement);
$("#replacementScope").addEventListener("change", renderReplacement);
$$('[data-close]').forEach((button) => button.addEventListener("click", () => $(`#${button.dataset.close}`).close()));
[$("#planDialog"), $("#workoutDialog"), $("#replacementDialog")].forEach((dialog) => dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); }));
window.addEventListener("resize", () => { const event = eventForKey(state.detailKey); if ($("#workoutDialog").open && event) drawProfile($(".detail-profile", $("#workoutDetail")), event.workout); });
window.WorkoutSettings.initFtpControls(() => { const event = eventForKey(state.detailKey); if ($("#workoutDialog").open && event) drawProfile($(".detail-profile", $("#workoutDetail")), event.workout); });

async function init() {
  readState(); renderCalendar();
  state.activities = await loadActivities(); renderCalendar();
  const requested = new URLSearchParams(location.search).get("block");
  if (requested && state.blocks.some((block) => block.id === requested)) openPlanDialog(requested);
}
init();
