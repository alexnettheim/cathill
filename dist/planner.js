const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = (value) => String(value ?? "").replace(/[<>&"']/g, (char) => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;", '"':"&quot;", "'":"&#39;" }[char]));
const escapeXml = (value) => String(value ?? "").replace(/[<>&"']/g, (char) => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;", '"':"&quot;", "'":"&apos;" }[char]));
const model = window.WorkoutCalendarModel;
const engine = window.WorkoutBlockEngine;
let library = window.WorkoutLibrary.create([]);
let sourceState = { builtinEnabled:true, customLibraries:[] };
const colors = { Endurance:"#53a7e8", Tempo:"#e7bd45", "Sweet Spot":"#ee9238", Threshold:"#ef5a4f", "VO2 Max":"#9b63d9", Anaerobic:"#d64eb7", Sprint:"#477de8", Unclassified:"#8393a0", "FTP Test":"#ee9238" };
const state = {
  calendar: null, month: model.monthStart(new Date()), focusDate: model.isoDate(new Date()), selectedDate: null,
  selectedEventId: null, planSelection: null, draggedEventId: null, justDragged: false, pickerMode: "add", draftPlan: null, activities: [], visibleResults: 72, libraryResultCount:0, loadingMore:false,
};

function workoutForEvent(event) { return library.resolve(event.workoutRef, event.workoutSnapshot); }
function minutes(seconds) { return Math.round((seconds || 0) / 60); }
function longDate(value) { return new Intl.DateTimeFormat(undefined, { weekday:"long", month:"long", day:"numeric", year:"numeric" }).format(model.parseDate(value)); }
function monthLabel(value) { return new Intl.DateTimeFormat(undefined, { month:"long", year:"numeric" }).format(model.parseDate(value)); }
function shortDay(value) { return new Intl.DateTimeFormat(undefined, { weekday:"short", month:"short", day:"numeric" }).format(model.parseDate(value)); }
function saveCalendar() { model.write(localStorage, state.calendar); }
function eventById(id) { return state.calendar.events.find((event) => event.id === id) || null; }
function eventsOn(date) { return state.calendar.events.filter((event) => event.date === date).sort((a,b) => (a.createdAt || "").localeCompare(b.createdAt || "")); }
function activityForEvent(event) { return state.activities.find((record) => record.summary?.plan?.sessionKey === event.id || (record.summary?.name === workoutForEvent(event)?.name && model.isoDate(new Date(record.summary?.timestamp || 0)) === event.date)) || null; }
function eventCompleted(event) { return event.status === "completed" || Boolean(activityForEvent(event)); }
function todayIso() { return model.isoDate(new Date()); }
function supplementalDescription(workout) {
  const paragraphs = String(workout.description || "").split(/\n\s*\n/).map((part) => part.replace(/\s+/g," ").trim()).filter(Boolean);
  return paragraphs.slice(1).join("\n\n");
}
function activeSourceCount() { return (sourceState.builtinEnabled ? 1 : 0) + sourceState.customLibraries.length; }
function sourceName(provider) {
  if (provider === window.WorkoutLibrary.BUILTIN_PROVIDER) return window.WORKOUT_DATA?.provider?.name || "CATHILL Workout Library";
  return sourceState.customLibraries.find((item)=>item.provider===provider)?.name || "Custom library";
}
function activeWorkouts() {
  const workouts=sourceState.builtinEnabled ? [...(window.WORKOUT_DATA?.workouts || [])] : [];
  sourceState.customLibraries.forEach((source)=>workouts.push(...(source.workouts || [])));
  return workouts;
}
function refreshLibraryTypes() {
  const select=$("#libraryType"),selected=select.value,types=[...new Set(library.workouts.map((workout)=>workout.type))].sort();
  select.innerHTML=`<option value="">All workout types</option>${types.map((type)=>`<option>${escapeHtml(type)}</option>`).join("")}`;
  if(types.includes(selected))select.value=selected;
}
function rebuildLibrary(shouldRender=true) {
  library=window.WorkoutLibrary.create(activeWorkouts());refreshLibraryTypes();
  if(shouldRender){renderCalendar();if($("#libraryDialog").open)renderLibrary();}
}

function loadActivities() {
  return new Promise((resolve) => {
    if (!window.indexedDB) return resolve([]);
    const request = indexedDB.open("store"); request.onerror = () => resolve([]);
    request.onsuccess = () => {
      const db = request.result; if (!db.objectStoreNames.contains("activity")) { db.close(); return resolve([]); }
      const all = db.transaction("activity", "readonly").objectStore("activity").getAll();
      all.onerror = () => { db.close(); resolve([]); }; all.onsuccess = () => { const result = all.result || []; db.close(); resolve(result); };
    };
  });
}

function renderCalendar() {
  $("#monthTitle").textContent = monthLabel(state.month);
  const currentMonth = model.parseDate(state.month).getMonth(),dates=model.gridDates(state.month);
  $("#monthGrid").innerHTML = Array.from({length:5},(_,weekIndex)=>{
    const weekDates=dates.slice(weekIndex*7,weekIndex*7+7);
    const days=weekDates.map((date) => {const dayEvents = eventsOn(date), outside = model.parseDate(date).getMonth() !== currentMonth;return `<article class="day-cell ${outside ? "outside" : ""} ${date === todayIso() ? "today" : ""}" data-day-cell="${date}">
      <button class="day-head" type="button" data-open-day="${date}" aria-label="Open ${escapeHtml(longDate(date))}"><strong>${model.parseDate(date).getDate()}</strong><span class="add-day">+ Add</span></button>
      ${dayEvents.slice(0,1).map((event) => eventChip(event)).join("")}${dayEvents.length > 1 ? `<button class="event-overflow" data-open-day="${date}">+${dayEvents.length - 1} more</button>` : ""}
    </article>`;}).join("");
    return days+weekSummaryCell(weekDates);
  }).join("");
  $$('[data-open-day]').forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); openDay(button.dataset.openDay); }));
  $$('[data-event]').forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); if(state.justDragged)return; openDetail(button.dataset.event); }));
  setupCalendarDrag();
}

function calendarProfileSvg(workout) {
  const rawPoints=Array.isArray(workout?.points)?workout.points.filter((point)=>Array.isArray(point)&&Number.isFinite(Number(point[0]))&&Number.isFinite(Number(point[1]))):[];
  if(rawPoints.length<2)return "";
  const fractional=Math.max(...rawPoints.map((point)=>Math.abs(Number(point[1]))))<=3;
  const points=rawPoints.map(([time,power])=>[Number(time),Number(power)*(fractional?100:1)]),maxTime=Math.max(1,Number(workout.duration)||0,points.at(-1)[0]),maxPower=Math.max(110,...points.map((point)=>point[1]));
  const line=points.map(([time,power],index)=>`${index?"L":"M"} ${(time/maxTime*100).toFixed(2)} ${(30-Math.max(0,power)/maxPower*27).toFixed(2)}`).join(" ");
  return `<svg class="calendar-workout-profile" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true"><path class="calendar-profile-fill" d="M 0 30 ${line} L 100 30 Z"></path><path class="calendar-profile-line" d="${line}"></path></svg>`;
}

function eventChip(event) {
  const workout = workoutForEvent(event); if (!workout) return "";
  const tiz = event.workoutSnapshot?.type !== "Endurance" ? Math.round(engine.workoutTiz(workout, workout.type)) : null;
  return `<button class="event-chip ${eventCompleted(event) ? "completed" : ""}" style="--event-color:${colors[workout.type] || colors.Unclassified}" data-event="${event.id}" draggable="true" type="button" aria-label="${escapeHtml(workout.name)}, ${escapeHtml(workout.type)}. Drag to move."><b>${escapeHtml(workout.name)}</b><small>${escapeHtml(workout.type)} · ${minutes(workout.duration)}m${tiz ? ` · ${tiz}m TiZ` : ""}</small><span class="calendar-profile-wrap">${calendarProfileSvg(workout)}</span></button>`;
}

function weekSummaryCell(weekDates) {
  const start=weekDates[0],end=weekDates[6];
  const events = state.calendar.events.filter((event) => event.date >= start && event.date <= end);
  const workouts = events.map(workoutForEvent).filter(Boolean);
  const totalMinutes = workouts.reduce((sum, workout) => sum + workout.duration / 60, 0);
  const tss = workouts.reduce((sum, workout) => sum + workout.tss, 0);
  const tiz = events.reduce((sum, event) => { const workout = workoutForEvent(event); return sum + (workout && workout.type !== "Endurance" ? engine.workoutTiz(workout, workout.type) : 0); }, 0);
  const complete = events.filter(eventCompleted).length;
  const startLabel=new Intl.DateTimeFormat(undefined,{month:"short",day:"numeric"}).format(model.parseDate(start)),endLabel=new Intl.DateTimeFormat(undefined,{month:"short",day:"numeric"}).format(model.parseDate(end));
  return `<aside class="week-summary-cell" aria-label="Summary for ${escapeHtml(startLabel)} through ${escapeHtml(endLabel)}"><strong>${escapeHtml(startLabel)}–${escapeHtml(endLabel)}</strong><div class="week-summary-stats"><span><b>${events.length}</b>Rides</span><span><b>${(totalMinutes/60).toFixed(1)}h</b>Hours</span><span><b>${Math.round(tss)}</b>TSS</span><span><b>${Math.round(tiz)}m</b>TiZ</span></div><small>${complete}/${events.length} complete</small></aside>`;
}

function setupCalendarDrag() {
  $$('[data-event]').forEach((button)=>{
    button.addEventListener("dragstart",(event)=>{state.draggedEventId=button.dataset.event;button.classList.add("dragging");event.dataTransfer.effectAllowed="move";event.dataTransfer.setData("text/plain",button.dataset.event);});
    button.addEventListener("dragend",()=>{button.classList.remove("dragging");state.draggedEventId=null;$$('.day-cell.drag-target').forEach((cell)=>cell.classList.remove("drag-target"));});
  });
  $$('[data-day-cell]').forEach((cell)=>{
    cell.addEventListener("dragover",(event)=>{if(!state.draggedEventId)return;event.preventDefault();event.dataTransfer.dropEffect="move";cell.classList.add("drag-target");});
    cell.addEventListener("dragleave",(event)=>{if(!cell.contains(event.relatedTarget))cell.classList.remove("drag-target");});
    cell.addEventListener("drop",(event)=>{event.preventDefault();const eventId=state.draggedEventId||event.dataTransfer.getData("text/plain"),date=cell.dataset.dayCell,moving=eventById(eventId);if(!moving||moving.date===date)return;state.calendar=model.moveEvent(state.calendar,eventId,date);state.selectedDate=date;state.focusDate=date;state.justDragged=true;saveCalendar();renderCalendar();setTimeout(()=>{state.justDragged=false;},0);});
  });
}

function openDay(date) {
  state.selectedDate = date; state.focusDate = date; $("#dayPanelTitle").textContent = longDate(date);
  const events = eventsOn(date);
  $("#dayEvents").innerHTML = events.length ? events.map((event) => {
    const workout = workoutForEvent(event); if (!workout) return "";
    return `<article class="day-event" style="--event-color:${colors[workout.type] || colors.Unclassified}"><h3>${escapeHtml(workout.name)}</h3><p>${escapeHtml(workout.type)} · ${minutes(workout.duration)} min · ${Math.round(workout.tss)} TSS${eventCompleted(event) ? " · Completed" : ""}</p><button class="quiet-button" data-day-event="${event.id}" type="button">Inspect</button></article>`;
  }).join("") : `<div class="empty-day">No workout planned yet.</div>`;
  $$('[data-day-event]').forEach((button) => button.addEventListener("click", () => openDetail(button.dataset.dayEvent)));
  $("#dayPanel").classList.add("open"); $("#dayPanel").setAttribute("aria-hidden","false"); $("#panelScrim").hidden = false;
}
function closeDay() { $("#dayPanel").classList.remove("open"); $("#dayPanel").setAttribute("aria-hidden","true"); $("#panelScrim").hidden = true; }

function openLibrary(mode = "add", eventId = null, planSelection = null) {
  state.pickerMode = mode; state.selectedEventId = eventId; state.planSelection = planSelection; state.visibleResults = 72;
  const event = eventId ? eventById(eventId) : null;
  const date = event?.date || state.selectedDate || todayIso();
  const planSession = planSelection ? state.draftPlan?.weeks[planSelection.weekIndex]?.sessions[planSelection.sessionIndex] : null;
  $("#libraryTitle").textContent = mode === "add" ? "Add workout" : "Replace workout";
  $("#libraryDate").textContent = planSession ? `Week ${planSelection.weekIndex + 1} · ${planSession.day} · ${planSession.role}` : longDate(date);
  $("#librarySearch").value = ""; $("#libraryType").value = planSession?.workout?.type || ""; $("#libraryDuration").value = "";
  renderLibrary(); $("#libraryDialog").showModal(); setTimeout(() => $("#librarySearch").focus(), 0);
}
function renderLibrary() {
  const query = $("#librarySearch").value.trim().toLowerCase(), type = $("#libraryType").value, maxDuration = Number($("#libraryDuration").value) || Infinity, sort = $("#librarySort").value;
  let results = library.workouts.filter((workout) => workout.duration > 0 && minutes(workout.duration) <= maxDuration);
  if (type) results = results.filter((workout) => workout.type === type);
  if (query) results = results.filter((workout) => `${workout.name} ${workout.type} ${workout.structure} ${workout.description} ${workout.goals}`.toLowerCase().includes(query));
  const sorters = {
    name:(a,b)=>a.name.localeCompare(b.name), "duration-asc":(a,b)=>a.duration-b.duration, "duration-desc":(a,b)=>b.duration-a.duration,
    "tss-asc":(a,b)=>a.tss-b.tss, "tss-desc":(a,b)=>b.tss-a.tss, "intensity-asc":(a,b)=>(a.intensity||0)-(b.intensity||0), "intensity-desc":(a,b)=>(b.intensity||0)-(a.intensity||0),
  };
  results.sort((a,b)=>(sorters[sort]||sorters.name)(a,b)||a.name.localeCompare(b.name));
  state.libraryResultCount=results.length;
  $("#libraryCount").textContent = `${results.length.toLocaleString()} matching workouts · ${activeSourceCount()} active ${activeSourceCount() === 1 ? "library" : "libraries"}`;
  $("#libraryResults").innerHTML = results.slice(0,state.visibleResults).map((workout) => `<article class="workout-result" style="--type-color:${colors[workout.type] || colors.Unclassified}"><div class="workout-result-head"><p class="eyebrow">${escapeHtml(workout.type)}</p><span class="card-actions"><button class="quiet-button card-inspect-button" type="button" data-inspect-workout="${escapeHtml(workout.uid)}">Inspect</button><button class="primary-button card-add-button" type="button" data-pick="${escapeHtml(workout.uid)}">${state.pickerMode === "add" ? "Add" : "Replace"}</button></span></div><h3 title="${escapeHtml(workout.name)}">${escapeHtml(workout.name)}</h3><small>${minutes(workout.duration)} min · ${Math.round(workout.tss)} TSS · ${escapeHtml(workout.structure)}</small><div class="workout-mini-wrap"><canvas class="workout-mini-profile" data-library-profile="${escapeHtml(workout.uid)}" aria-label="Power profile for ${escapeHtml(workout.name)}"></canvas><div class="workout-mini-tooltip" hidden></div></div><p>${escapeHtml(window.WorkoutSettings.practicalDescription(workout))}</p></article>`).join("");
  $$('[data-pick]').forEach((button) => button.addEventListener("click", () => chooseWorkout(button.dataset.pick)));
  $$('[data-inspect-workout]').forEach((button) => button.addEventListener("click", () => openLibraryWorkout(button.dataset.inspectWorkout)));
  const loadMore=$("#libraryLoadMore"),remaining=Math.max(0,results.length-state.visibleResults);loadMore.hidden=!remaining;loadMore.textContent=remaining?`Load more workouts (${remaining.toLocaleString()} remaining)`:"";
  requestAnimationFrame(() => $$('[data-library-profile]').forEach((canvas) => {
    const workout = library.resolve(canvas.dataset.libraryProfile); if (!workout) return;
    drawMiniProfile(canvas,workout); attachMiniScrubber(canvas,workout,$(".workout-mini-tooltip",canvas.parentElement));
  }));
}
function loadMoreLibraryResults() {
  if(state.loadingMore||state.visibleResults>=state.libraryResultCount)return;
  state.loadingMore=true;state.visibleResults+=72;renderLibrary();requestAnimationFrame(()=>{state.loadingMore=false;});
}
function openLibraryWorkout(uid) {
  const workout=library.resolve(uid);if(!workout)return;
  const description=supplementalDescription(workout),actionLabel=state.pickerMode === "add" ? "Add workout" : "Use replacement";
  $("#detailContent").innerHTML=`<div class="detail-inner" style="--type-color:${colors[workout.type]||colors.Unclassified}"><div class="detail-heading"><div><p class="eyebrow">${escapeHtml(workout.type)}</p><h2>${escapeHtml(workout.name)}</h2><p class="detail-subtitle">${escapeHtml(sourceName(workout.provider))} · ${escapeHtml(workout.structure)}</p></div><button id="selectInspectedWorkout" class="primary-button detail-ride-button" type="button">${actionLabel}</button></div><div class="profile-wrap"><canvas class="detail-profile"></canvas><div class="profile-tooltip" hidden></div></div><div class="detail-metrics"><div><b>${minutes(workout.duration)} min</b><small>Duration</small></div><div><b>${Math.round(workout.tss)}</b><small>TSS</small></div><div><b>${workout.intensity?workout.intensity.toFixed(2):"—"}</b><small>Intensity</small></div><div><b>${Math.round(window.WorkoutSettings.averageTargetPercent(workout))}%</b><small>Avg target</small></div><div><b>${Math.round(engine.workoutTiz(workout,workout.type))} min</b><small>Target TiZ</small></div></div><section class="detail-description"><h3>About this workout</h3><p class="practical-summary">${escapeHtml(window.WorkoutSettings.practicalDescription(workout))}</p>${description?`<p>${escapeHtml(description)}</p>`:""}</section></div>`;
  $("#selectInspectedWorkout").addEventListener("click",()=>{$("#detailDialog").close();chooseWorkout(uid);});
  $("#detailDialog").showModal();requestAnimationFrame(()=>{const canvas=$(".detail-profile");drawProfile(canvas,workout);attachHover(canvas,workout,$(".profile-tooltip"));});
}
function chooseWorkout(uid) {
  const workout = library.resolve(uid); if (!workout) return;
  if (state.pickerMode === "plan" && state.planSelection) {
    const session=state.draftPlan?.weeks[state.planSelection.weekIndex]?.sessions[state.planSelection.sessionIndex];
    if (!session) return;
    session.workout=workout; session.type=workout.type; $("#libraryDialog").close(); renderPlanPreview(); return;
  }
  if (state.pickerMode === "replace" && state.selectedEventId) state.calendar = model.replaceEvent(state.calendar, state.selectedEventId, workout);
  else state.calendar.events.push(model.createEvent(state.selectedDate || todayIso(), workout));
  saveCalendar(); $("#libraryDialog").close(); renderCalendar(); openDay(state.pickerMode === "replace" ? eventById(state.selectedEventId).date : state.selectedDate);
}

function openDetail(eventId) {
  const event = eventById(eventId), workout = workoutForEvent(event); if (!event || !workout) return;
  state.selectedEventId = eventId; const activity = activityForEvent(event), description = supplementalDescription(workout);
  $("#detailContent").innerHTML = `<div class="detail-inner" style="--type-color:${colors[workout.type] || colors.Unclassified}"><div class="detail-heading"><div><p class="eyebrow">${escapeHtml(workout.type)}</p><h2>${escapeHtml(workout.name)}</h2><p class="detail-subtitle">${escapeHtml(longDate(event.date))} · ${escapeHtml(sourceName(workout.provider))}</p></div><button id="rideWorkout" class="primary-button detail-ride-button" type="button">${eventCompleted(event) ? "Ride again" : "Ride now"}</button></div><div class="profile-wrap"><canvas class="detail-profile"></canvas><div class="profile-tooltip" hidden></div></div><div class="detail-metrics"><div><b>${minutes(workout.duration)} min</b><small>Duration</small></div><div><b>${Math.round(workout.tss)}</b><small>TSS</small></div><div><b>${workout.intensity ? workout.intensity.toFixed(2) : "—"}</b><small>Intensity</small></div><div><b>${Math.round(window.WorkoutSettings.averageTargetPercent(workout))}%</b><small>Avg target</small></div><div><b>${Math.round(engine.workoutTiz(workout,workout.type))} min</b><small>Target TiZ</small></div></div><div class="detail-controls"><label>Scheduled date<input id="detailDate" type="date" value="${event.date}"></label><button id="moveWorkout" class="quiet-button" type="button">Move</button><button id="replaceWorkout" class="quiet-button" type="button">Replace</button><button id="zwiftWorkout" class="quiet-button" type="button">Download ZWO</button><button id="intervalsWorkout" class="quiet-button" type="button">Intervals.icu</button><button id="deleteWorkout" class="quiet-button danger-button" type="button">Delete</button></div><section class="detail-description"><h3>About this workout</h3><p class="practical-summary">${escapeHtml(window.WorkoutSettings.practicalDescription(workout))}</p>${description ? `<p>${escapeHtml(description)}</p>` : ""}</section>${activity ? `<section class="completed-ride"><div><p class="eyebrow">Completed ride</p><h3>Recorded power, heart rate and cadence</h3></div>${activity.samples?.length ? `<div class="activity-chart-wrap"><canvas class="activity-profile" aria-label="Completed ride power, heart rate and cadence chart"></canvas><div class="activity-tooltip" hidden></div></div>` : `<p class="activity-empty">This ride predates detailed local traces. New completed rides will include scrobbable power, heart-rate and cadence data.</p>`}</section>` : ""}</div>`;
  $("#moveWorkout").addEventListener("click", () => { state.calendar = model.moveEvent(state.calendar,event.id,$("#detailDate").value); saveCalendar(); $("#detailDialog").close(); renderCalendar(); openDay($("#detailDate").value); });
  $("#rideWorkout").addEventListener("click", () => window.WorkoutRide.launch(workout,createZwo(workout),{ blockId:event.planId || "calendar", sessionKey:event.id, scheduledDate:event.date }));
  $("#replaceWorkout").addEventListener("click", () => { $("#detailDialog").close(); openLibrary("replace",event.id); });
  $("#zwiftWorkout").addEventListener("click", () => downloadFile(`${safeFilename(workout.type)} - ${minutes(workout.duration)} minutes - ${safeFilename(workout.name)}.zwo`,createZwo(workout),"application/xml"));
  $("#intervalsWorkout").addEventListener("click", () => window.IntervalsIcu.openWorkout(workout));
  $("#deleteWorkout").addEventListener("click", () => { if(!window.confirm(`Delete ${workout.name} from ${longDate(event.date)}?`))return; state.calendar = model.removeEvent(state.calendar,event.id); saveCalendar(); $("#detailDialog").close(); renderCalendar(); openDay(event.date); });
  $("#detailDialog").showModal(); requestAnimationFrame(() => { const canvas = $(".detail-profile"); drawProfile(canvas,workout); attachHover(canvas,workout,$(".profile-tooltip")); if(activity?.samples?.length){const activityCanvas=$(".activity-profile");drawActivityProfile(activityCanvas,activity.samples);attachActivityScrubber(activityCanvas,activity.samples,$(".activity-tooltip"));} });
}

function fitCanvas(canvas) { const rect=canvas.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,2); canvas.width=Math.max(1,Math.round(rect.width*ratio)); canvas.height=Math.max(1,Math.round(rect.height*ratio)); const context=canvas.getContext("2d"); context.setTransform(ratio,0,0,ratio,0,0); return {context,width:rect.width,height:rect.height}; }
function drawProfile(canvas,workout) {
  const {context:ctx,width,height}=fitCanvas(canvas),maxTime=Math.max(1,workout.duration),maxPower=Math.max(160,...workout.points.map((point)=>point[1]));
  const pad={left:50,right:58,top:22,bottom:28},plotW=width-pad.left-pad.right,plotH=height-pad.top-pad.bottom,ftp=window.WorkoutSettings.getFtp();
  ctx.clearRect(0,0,width,height); ctx.font="11px system-ui"; ctx.strokeStyle=getComputedStyle(document.documentElement).getPropertyValue("--line"); ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue("--muted");
  [50,100,150].forEach((percent)=>{ if(percent>maxPower)return; const y=pad.top+plotH-percent/maxPower*plotH; ctx.beginPath();ctx.moveTo(pad.left,y);ctx.lineTo(width-pad.right,y);ctx.stroke();ctx.textAlign="right";ctx.fillText(`${percent}%`,pad.left-7,y+4);if(ftp){ctx.textAlign="left";ctx.fillText(`${Math.round(ftp*percent/100)} W`,width-pad.right+7,y+4);}});
  ctx.beginPath();ctx.moveTo(pad.left,pad.top+plotH);workout.points.forEach(([time,power])=>ctx.lineTo(pad.left+time/maxTime*plotW,pad.top+plotH-power/maxPower*plotH));ctx.lineTo(pad.left+plotW,pad.top+plotH);ctx.closePath();ctx.fillStyle="rgba(39,135,255,.22)";ctx.fill();ctx.strokeStyle=colors[workout.type]||colors.Unclassified;ctx.lineWidth=2.5;ctx.stroke();canvas._geometry={pad,plotW,maxTime};
}
function attachHover(canvas,workout,tooltip){canvas.onpointermove=(event)=>{const g=canvas._geometry;if(!g)return;const rect=canvas.getBoundingClientRect(),x=Math.max(g.pad.left,Math.min(g.pad.left+g.plotW,event.clientX-rect.left)),seconds=(x-g.pad.left)/g.plotW*g.maxTime,portion=window.WorkoutSettings.profileAt(workout,seconds);if(!portion)return;const ftp=window.WorkoutSettings.getFtp(),watts=ftp?Math.round(ftp*portion.percent/100):null;tooltip.hidden=false;tooltip.innerHTML=`<strong>${window.WorkoutSettings.formatDuration(portion.endSeconds-portion.startSeconds)} segment</strong>${Math.round(portion.percent)}% FTP${watts?` · ${watts} W`:""}`;tooltip.style.left=`${Math.min(rect.width-190,Math.max(0,x))}px`;tooltip.style.top=`${Math.max(50,event.clientY-rect.top)}px`;};canvas.onpointerleave=()=>{tooltip.hidden=true;};}

function drawActivityProfile(canvas,samples,cursorTime=null){
  const {context:ctx,width,height}=fitCanvas(canvas),pad={left:50,right:18,top:17,bottom:22},plotW=Math.max(1,width-pad.left-pad.right),rowH=(height-pad.top-pad.bottom)/3,maxTime=Math.max(1,samples.at(-1)?.t||samples.length-1),series=[{key:"power",label:"Power",unit:"W",color:"#ff7252"},{key:"heartRate",label:"Heart rate",unit:"bpm",color:"#ef5a4f"},{key:"cadence",label:"Cadence",unit:"rpm",color:"#78c6a3"}];
  ctx.clearRect(0,0,width,height);ctx.font="10px system-ui";series.forEach((item,row)=>{const values=samples.map((sample)=>Number(sample[item.key])||0),max=Math.max(1,...values)*1.08,top=pad.top+row*rowH,bottom=top+rowH-8;ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue("--muted");ctx.textAlign="left";ctx.fillText(item.label,pad.left,top+9);ctx.textAlign="right";ctx.fillText(`${Math.round(max)} ${item.unit}`,width-pad.right,top+9);ctx.strokeStyle=getComputedStyle(document.documentElement).getPropertyValue("--line");ctx.beginPath();ctx.moveTo(pad.left,bottom);ctx.lineTo(width-pad.right,bottom);ctx.stroke();ctx.strokeStyle=item.color;ctx.lineWidth=2;ctx.beginPath();samples.forEach((sample,index)=>{const x=pad.left+(Number(sample.t)||index)/maxTime*plotW,y=bottom-(Number(sample[item.key])||0)/max*(rowH-23);index?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();});if(cursorTime!==null){const x=pad.left+cursorTime/maxTime*plotW;ctx.strokeStyle="rgba(255,255,255,.75)";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,pad.top);ctx.lineTo(x,height-pad.bottom);ctx.stroke();}canvas._activityGeometry={pad,plotW,maxTime};
}
function attachActivityScrubber(canvas,samples,tooltip){canvas.onpointermove=(event)=>{const g=canvas._activityGeometry;if(!g)return;const rect=canvas.getBoundingClientRect(),x=Math.max(g.pad.left,Math.min(g.pad.left+g.plotW,event.clientX-rect.left)),time=(x-g.pad.left)/g.plotW*g.maxTime,sample=samples.reduce((best,item)=>Math.abs((item.t||0)-time)<Math.abs((best.t||0)-time)?item:best,samples[0]);drawActivityProfile(canvas,samples,sample.t);tooltip.hidden=false;tooltip.innerHTML=`<strong>${window.WorkoutSettings.formatDuration(sample.t||0)}</strong>${Math.round(sample.power||0)} W · ${Math.round(sample.heartRate||0)} bpm · ${Math.round(sample.cadence||0)} rpm`;tooltip.style.left=`${Math.min(rect.width-230,Math.max(0,x))}px`;tooltip.style.top=`${Math.max(54,event.clientY-rect.top)}px`;};canvas.onpointerleave=()=>{tooltip.hidden=true;drawActivityProfile(canvas,samples);};}

function drawMiniProfile(canvas,workout,cursorSeconds=null) {
  const {context:ctx,width,height}=fitCanvas(canvas),maxTime=Math.max(1,workout.duration),maxPower=Math.max(160,...workout.points.map((point)=>point[1]));
  const pad={left:5,right:5,top:7,bottom:6},plotW=Math.max(1,width-pad.left-pad.right),plotH=Math.max(1,height-pad.top-pad.bottom);
  ctx.clearRect(0,0,width,height); ctx.beginPath(); ctx.moveTo(pad.left,pad.top+plotH);
  workout.points.forEach(([time,power])=>ctx.lineTo(pad.left+time/maxTime*plotW,pad.top+plotH-power/maxPower*plotH));
  ctx.lineTo(pad.left+plotW,pad.top+plotH); ctx.closePath(); ctx.fillStyle="rgba(39,135,255,.18)"; ctx.fill();
  ctx.strokeStyle=colors[workout.type]||colors.Unclassified;ctx.lineWidth=2;ctx.stroke();
  if(cursorSeconds!==null){const x=pad.left+cursorSeconds/maxTime*plotW;ctx.beginPath();ctx.moveTo(x,pad.top);ctx.lineTo(x,pad.top+plotH);ctx.strokeStyle="rgba(255,255,255,.72)";ctx.lineWidth=1;ctx.stroke();}
  canvas._geometry={pad,plotW,maxTime};
}
function attachMiniScrubber(canvas,workout,tooltip){
  canvas.onpointermove=(event)=>{const g=canvas._geometry;if(!g)return;const rect=canvas.getBoundingClientRect(),x=Math.max(g.pad.left,Math.min(g.pad.left+g.plotW,event.clientX-rect.left)),seconds=(x-g.pad.left)/g.plotW*g.maxTime,portion=window.WorkoutSettings.profileAt(workout,seconds);if(!portion)return;const ftp=window.WorkoutSettings.getFtp(),watts=ftp?Math.round(ftp*portion.percent/100):null;drawMiniProfile(canvas,workout,seconds);tooltip.hidden=false;tooltip.innerHTML=`<strong>${window.WorkoutSettings.formatDuration(portion.endSeconds-portion.startSeconds)} segment</strong>${Math.round(portion.percent)}% FTP${watts?` · ${watts} W`:" · set FTP for watts"}`;tooltip.style.left=`${Math.min(rect.width-145,Math.max(0,x))}px`;tooltip.style.top=`${Math.max(45,event.clientY-rect.top)}px`;};
  canvas.onpointerleave=()=>{tooltip.hidden=true;drawMiniProfile(canvas,workout);};
}

function selectedValues(name) { return $$(`input[name="${name}"]:checked`).map((input)=>Number(input.value)); }
const shortWeekdays = ["Mo","Tu","We","Th","Fr","Sa","Su"];
function setupBuilderDays() {
  $("#rideDayChoices").innerHTML = engine.WEEKDAYS.map((day,index)=>`<label class="day-choice" title="${day}"><input type="checkbox" name="rideDay" value="${index}" ${[1,3,5,6].includes(index)?"checked":""}><span>${shortWeekdays[index]}</span></label>`).join("");
  $$('input[name="rideDay"]').forEach((input)=>input.addEventListener("change",syncBuilderDays)); syncBuilderDays();
}
function syncBuilderDays() {
  const rideDays=selectedValues("rideDay"),existingQuality=selectedValues("qualityDay"),priorQuality=existingQuality.length?existingQuality:[1,3].filter((day)=>rideDays.includes(day)),currentLong=selectedValues("longDay")[0]??6;
  const schedule=engine.reconcileSchedule(rideDays,priorQuality,currentLong);
  $("#qualityDayChoices").innerHTML=engine.WEEKDAYS.map((day,index)=>`<label class="day-choice" title="${day}"><input type="checkbox" name="qualityDay" value="${index}" ${rideDays.includes(index)?"":"disabled"} ${schedule.qualityDays.includes(index)?"checked":""}><span>${shortWeekdays[index]}</span></label>`).join("");
  $("#longDayChoices").innerHTML=engine.WEEKDAYS.map((day,index)=>`<label class="day-choice" title="${day}"><input type="radio" name="longDay" value="${index}" ${schedule.eligibleLongDays.includes(index)?"":"disabled"} ${schedule.longRideDay===index?"checked":""}><span>${shortWeekdays[index]}</span></label>`).join("");
  $$('#qualityDayChoices input').forEach((input)=>input.addEventListener("change",syncBuilderDays));
  $$('#longDayChoices input').forEach((input)=>input.addEventListener("change",renderScheduleSummary));
  $("#qualityDayHelp").textContent=`Choose up to ${schedule.qualityLimit} of your riding days. Other selected days stay endurance.`;
  renderScheduleSummary(schedule);
}
function renderScheduleSummary(schedule=engine.reconcileSchedule(selectedValues("rideDay"),selectedValues("qualityDay"),selectedValues("longDay")[0])) {
  const roles=schedule.rideDays.map((day)=>`${shortWeekdays[day]} <b>${schedule.qualityDays.includes(day)?"Quality":day===schedule.longRideDay?"Long":"Endurance"}</b>`);
  $("#scheduleSummary").innerHTML=roles.length?roles.join(" · "):"Select at least three riding days.";
}
function builderSettings() { const schedule=engine.reconcileSchedule(selectedValues("rideDay"),selectedValues("qualityDay"),selectedValues("longDay")[0]); return { name:$("#planName").value.trim()||"Training block",purpose:$("#planPurpose").value,weeklyHours:Number($("#planHours").value),startingTiz:$("#planStartingTiz").value,rideDays:schedule.rideDays,qualityDays:schedule.qualityDays,longRideDay:schedule.longRideDay }; }
function previewPlan(event) {
  event?.preventDefault(); $("#builderError").textContent="";
  try { state.draftPlan=engine.generate(builderSettings(),library.workouts); renderPlanPreview(); } catch(error) { $("#builderError").textContent=error.message; }
}
function renderPlanPreview() {
  const plan=state.draftPlan; $("#previewEmpty").hidden=true; $("#previewContent").hidden=false;
  $("#previewSummary").innerHTML=`<div><h3>${escapeHtml(plan.settings.name)}</h3><p>${escapeHtml(plan.purposeLabel)} · ${plan.settings.qualityDays.length} quality day${plan.settings.qualityDays.length===1?"":"s"} each week</p></div><small>Draft only · adjust workouts before adding to calendar</small>`;
  $("#previewWeeks").innerHTML=plan.weeks.map((week)=>{const totals=engine.totals(week);return `<article class="preview-week ${week.weekIndex===3?"recovery":""}"><header><div><h4>Week ${week.weekIndex+1}</h4><small>${week.label}</small></div></header><div class="preview-week-metrics"><span><b>${(totals.minutes/60).toFixed(1)}h</b>Hours</span><span><b>${Math.round(totals.tss)}</b>TSS</span><span><b>${Math.round(totals.tiz)}m</b>Quality TiZ</span></div>${week.sessions.map((session,sessionIndex)=>`<div class="preview-session" style="--event-color:${colors[session.type]||colors.Unclassified}"><div class="preview-session-head"><small>${escapeHtml(session.day)} · ${escapeHtml(session.role)}</small><span class="preview-session-actions">${session.workout?`<button class="preview-inspect" type="button" data-plan-inspect="${week.weekIndex}:${sessionIndex}">Inspect</button>`:""}<button class="preview-replace" type="button" data-plan-replace="${week.weekIndex}:${sessionIndex}">Replace</button></span></div><b>${escapeHtml(session.workout?.name||"No match")}</b><small>${session.workout?`${escapeHtml(session.workout.type)} · ${minutes(session.workout.duration)} min · ${Math.round(session.workout.tss)} TSS${session.role==="Quality"?` · ${Math.round(engine.workoutTiz(session.workout,session.type))}m TiZ`:""}`:"No matching workout"}</small>${session.workout?`<div class="workout-mini-wrap plan-mini-wrap"><canvas class="workout-mini-profile plan-mini-profile" data-plan-profile="${week.weekIndex}:${sessionIndex}" aria-label="Power profile for ${escapeHtml(session.workout.name)}"></canvas><div class="workout-mini-tooltip" hidden></div></div>`:""}</div>`).join("")}</article>`;}).join("");
  $$('[data-plan-replace]').forEach((button)=>button.addEventListener("click",()=>{const [weekIndex,sessionIndex]=button.dataset.planReplace.split(":").map(Number);openLibrary("plan",null,{weekIndex,sessionIndex});}));
  $$('[data-plan-inspect]').forEach((button)=>button.addEventListener("click",()=>{const [weekIndex,sessionIndex]=button.dataset.planInspect.split(":").map(Number);openPlanWorkout(weekIndex,sessionIndex);}));
  requestAnimationFrame(()=>$$('[data-plan-profile]').forEach((canvas)=>{const [weekIndex,sessionIndex]=canvas.dataset.planProfile.split(":").map(Number),workout=state.draftPlan?.weeks[weekIndex]?.sessions[sessionIndex]?.workout;if(!workout)return;drawMiniProfile(canvas,workout);attachMiniScrubber(canvas,workout,$(".workout-mini-tooltip",canvas.parentElement));}));
}
function openPlanWorkout(weekIndex,sessionIndex) {
  const session=state.draftPlan?.weeks[weekIndex]?.sessions[sessionIndex],workout=session?.workout;if(!workout)return;
  const description=supplementalDescription(workout);
  $("#detailContent").innerHTML=`<div class="detail-inner" style="--type-color:${colors[workout.type]||colors.Unclassified}"><div class="detail-heading"><div><p class="eyebrow">${escapeHtml(workout.type)}</p><h2>${escapeHtml(workout.name)}</h2><p class="detail-subtitle">Week ${weekIndex+1} · ${escapeHtml(session.day)} · ${escapeHtml(session.role)}</p></div></div><div class="profile-wrap"><canvas class="detail-profile"></canvas><div class="profile-tooltip" hidden></div></div><div class="detail-metrics"><div><b>${minutes(workout.duration)} min</b><small>Duration</small></div><div><b>${Math.round(workout.tss)}</b><small>TSS</small></div><div><b>${workout.intensity?workout.intensity.toFixed(2):"—"}</b><small>Intensity</small></div><div><b>${Math.round(window.WorkoutSettings.averageTargetPercent(workout))}%</b><small>Avg target</small></div><div><b>${Math.round(engine.workoutTiz(workout,workout.type))} min</b><small>Target TiZ</small></div></div><section class="detail-description"><h3>About this workout</h3><p class="practical-summary">${escapeHtml(window.WorkoutSettings.practicalDescription(workout))}</p>${description?`<p>${escapeHtml(description)}</p>`:""}</section></div>`;
  $("#detailDialog").showModal();requestAnimationFrame(()=>{const canvas=$(".detail-profile");drawProfile(canvas,workout);attachHover(canvas,workout,$(".profile-tooltip"));});
}
function applyDraftPlan() {
  if(!state.draftPlan)return; state.calendar=model.applyPlan(state.calendar,state.draftPlan,$("#planStart").value); saveCalendar(); state.month=model.monthStart($("#planStart").value); state.focusDate=$("#planStart").value; $("#builderDialog").close(); renderCalendar();
}

function openPlans() { renderPlans(); $("#plansDialog").showModal(); }
function renderPlans() {
  const plans=state.calendar.plans||[];
  $("#plansList").innerHTML=plans.length?plans.map((plan)=>{const upcoming=state.calendar.events.filter((event)=>event.planId===plan.id&&event.date>=todayIso()&&!eventCompleted(event)).length;return `<article class="plan-row"><div><b>${escapeHtml(plan.name)}</b><small>${upcoming} upcoming workout${upcoming===1?"":"s"} · starts ${escapeHtml(shortDay(plan.startDate))}</small></div><button class="quiet-button danger-button" type="button" data-delete-plan="${escapeHtml(plan.id)}">Delete upcoming</button></article>`;}).join(""):`<p class="empty-plans">No generated plans are on the calendar.</p>`;
  $$('[data-delete-plan]').forEach((button)=>button.addEventListener("click",()=>{const completedIds=state.calendar.events.filter(eventCompleted).map((event)=>event.id);state.calendar=model.removePlan(state.calendar,button.dataset.deletePlan,todayIso(),completedIds);saveCalendar();renderCalendar();renderPlans();}));
}

function createZwo(workout){const blocks=[];for(let index=0;index<workout.points.length-1;index+=1){const [startTime,startPower]=workout.points[index],[endTime,endPower]=workout.points[index+1],duration=endTime-startTime;if(duration<=0)continue;const low=startPower/100,high=endPower/100;blocks.push(Math.abs(low-high)<.00001?`    <SteadyState Duration="${duration}" Power="${low.toFixed(4)}"/>`:`    <Ramp Duration="${duration}" PowerLow="${low.toFixed(4)}" PowerHigh="${high.toFixed(4)}"/>`);}return `<?xml version="1.0" encoding="UTF-8"?>\n<workout_file>\n  <author>CATHILL</author>\n  <name>${escapeXml(workout.name)}</name>\n  <description>${escapeXml(workout.description)}</description>\n  <sportType>bike</sportType>\n  <workout>\n${blocks.join("\n")}\n  </workout>\n</workout_file>\n`;}
function safeFilename(value){return String(value).replace(/[\\/:*?"<>|]/g,"-").replace(/\s+/g," ").trim().slice(0,140);}
function downloadFile(name,data,type){const blob=data instanceof Blob?data:new Blob([data],{type}),link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1200);}
const crcTable=(()=>{const table=new Uint32Array(256);for(let n=0;n<256;n+=1){let c=n;for(let k=0;k<8;k+=1)c=c&1?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0;}return table;})();
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&0xff]^(crc>>>8);return(crc^0xffffffff)>>>0;}
function concatBytes(parts){const out=new Uint8Array(parts.reduce((sum,part)=>sum+part.length,0));let offset=0;for(const part of parts){out.set(part,offset);offset+=part.length;}return out;}
function zipStore(files){const encoder=new TextEncoder(),locals=[],centrals=[];let offset=0;for(const file of files){const name=encoder.encode(file.name),data=typeof file.data==="string"?encoder.encode(file.data):file.data,crc=crc32(data),local=new Uint8Array(30),lv=new DataView(local.buffer);lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x0800,true);lv.setUint32(14,crc,true);lv.setUint32(18,data.length,true);lv.setUint32(22,data.length,true);lv.setUint16(26,name.length,true);const localPart=concatBytes([local,name,data]);locals.push(localPart);const central=new Uint8Array(46),cv=new DataView(central.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x0800,true);cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,name.length,true);cv.setUint32(42,offset,true);centrals.push(concatBytes([central,name]));offset+=localPart.length;}const centralSize=centrals.reduce((sum,part)=>sum+part.length,0),end=new Uint8Array(22),ev=new DataView(end.buffer);ev.setUint32(0,0x06054b50,true);ev.setUint16(8,files.length,true);ev.setUint16(10,files.length,true);ev.setUint32(12,centralSize,true);ev.setUint32(16,offset,true);return new Blob([...locals,...centrals,end],{type:"application/zip"});}
function exportPlanZip(){if(!state.draftPlan)return;const files=[];state.draftPlan.weeks.forEach((week)=>week.sessions.forEach((session)=>{if(session.workout)files.push({name:`Week ${week.weekIndex+1}/${session.day} - ${safeFilename(session.workout.name)}.zwo`,data:createZwo(session.workout)});}));files.push({name:"plan.json",data:JSON.stringify({version:2,settings:state.draftPlan.settings,weeks:state.draftPlan.weeks.map((week)=>({weekIndex:week.weekIndex,sessions:week.sessions.map((session)=>({dayIndex:session.dayIndex,role:session.role,type:session.type,workoutRef:window.WorkoutLibrary.reference(session.workout)}))}))},null,2)});downloadFile(`${safeFilename(state.draftPlan.settings.name)}.zip`,zipStore(files),"application/zip");}

function renderSourceManager() {
  $("#sourceCount").textContent=`${library.workouts.length.toLocaleString()} workouts across ${activeSourceCount()} active ${activeSourceCount()===1?"library":"libraries"}`;
  const builtinCount=(window.WORKOUT_DATA?.workouts||[]).length;
  $("#sourceList").innerHTML=`<article class="source-row"><div><b>${escapeHtml(window.WORKOUT_DATA?.provider?.name || "CATHILL Workout Library")}</b><small>${builtinCount.toLocaleString()} independently authored workouts · ${sourceState.builtinEnabled?"active":"removed"}</small></div><button class="quiet-button" type="button" data-toggle-builtin>${sourceState.builtinEnabled?"Remove":"Add back"}</button></article>${sourceState.customLibraries.map((source)=>`<article class="source-row"><div><b>${escapeHtml(source.name)}</b><small>${(source.workouts||[]).length.toLocaleString()} imported workouts</small></div><button class="quiet-button danger-button" type="button" data-remove-source="${escapeHtml(source.id)}">Remove</button></article>`).join("")}`;
  $('[data-toggle-builtin]').addEventListener("click",()=>{sourceState.builtinEnabled=!sourceState.builtinEnabled;window.WorkoutSources.setBuiltinEnabled(sourceState.builtinEnabled);rebuildLibrary();renderSourceManager();});
  $$('[data-remove-source]').forEach((button)=>button.addEventListener("click",async()=>{const source=sourceState.customLibraries.find((item)=>item.id===button.dataset.removeSource);if(!source||!window.confirm(`Remove ${source.name}? Workouts already on the calendar will stay available.`))return;await window.WorkoutSources.remove(source.id);sourceState=await window.WorkoutSources.load();rebuildLibrary();renderSourceManager();}));
}
async function importCustomLibrary() {
  const input=$("#customLibraryFiles"),files=[...input.files],status=$("#libraryStatus");
  if(!files.length){status.textContent="Choose a JSON library or one or more ZWO files first.";return;}
  try {
    const workouts=[];let inferredName="";
    for(const file of files){const text=await file.text();if(file.name.toLowerCase().endsWith(".zwo")){workouts.push(window.WorkoutSources.parseZwo(text,file.name.replace(/\.zwo$/i,"")));}else{const parsed=window.WorkoutSources.parseJson(text);workouts.push(...parsed.workouts);inferredName=inferredName||parsed.name;}}
    const name=$("#customLibraryName").value.trim()||inferredName||(files.length===1?files[0].name.replace(/\.[^.]+$/," ").trim():"Imported workouts"),source=window.WorkoutSources.createLibrary(name,workouts);
    await window.WorkoutSources.save(source);sourceState=await window.WorkoutSources.load();rebuildLibrary();renderSourceManager();input.value="";$("#customLibraryName").value="";status.textContent=`Imported ${source.workouts.length} workout${source.workouts.length===1?"":"s"} into ${source.name}.`;
  } catch(error){status.textContent=error.message;}
}

function exportBackup(){const payload={format:"workout-finder-backup",version:2,exportedAt:new Date().toISOString(),calendar:state.calendar,ftp:window.WorkoutSettings.getFtp(),theme:document.documentElement.dataset.theme,sources:{builtinEnabled:sourceState.builtinEnabled,customLibraries:sourceState.customLibraries}};downloadFile(`workout-finder-backup-${todayIso()}.json`,JSON.stringify(payload,null,2),"application/json");$("#backupStatus").textContent="Backup downloaded.";}
async function importBackup(file){try{const payload=JSON.parse(await file.text());if(payload.format!=="workout-finder-backup"||payload.version!==2||!Array.isArray(payload.calendar?.events))throw new Error("This is not a valid CATHILL backup.");if(payload.sources){window.WorkoutSources.setBuiltinEnabled(payload.sources.builtinEnabled!==false);await window.WorkoutSources.replaceAll(payload.sources.customLibraries||[]);sourceState=await window.WorkoutSources.load();rebuildLibrary(false);}state.calendar=payload.calendar;saveCalendar();if(payload.ftp)window.WorkoutSettings.setFtp(payload.ftp);if(["dark","light"].includes(payload.theme)){document.documentElement.dataset.theme=payload.theme;localStorage.setItem("workout-finder-theme-v1",payload.theme);}$("#backupStatus").textContent=`Restored ${state.calendar.events.length} calendar events.`;renderSourceManager();renderCalendar();window.WorkoutSettings.updateButton();}catch(error){$("#backupStatus").textContent=error.message;}}

function initControls(){
  refreshLibraryTypes();
  const savedTheme=localStorage.getItem("workout-finder-theme-v1")||"dark";document.documentElement.dataset.theme=savedTheme;$("#themeButton").textContent=savedTheme==="dark"?"☼":"☾";
  $("#themeButton").addEventListener("click",()=>{const theme=document.documentElement.dataset.theme==="dark"?"light":"dark";document.documentElement.dataset.theme=theme;localStorage.setItem("workout-finder-theme-v1",theme);$("#themeButton").textContent=theme==="dark"?"☼":"☾";renderCalendar();});
  $("#previousMonth").addEventListener("click",()=>{state.month=model.addMonths(state.month,-1);renderCalendar();});$("#nextMonth").addEventListener("click",()=>{state.month=model.addMonths(state.month,1);renderCalendar();});$("#todayButton").addEventListener("click",()=>{state.month=model.monthStart(new Date());state.focusDate=todayIso();renderCalendar();});
  $("#addWorkoutButton").addEventListener("click",()=>openLibrary());$("[data-close-panel]").addEventListener("click",closeDay);$("#panelScrim").addEventListener("click",closeDay);
  ["librarySearch","libraryType","libraryDuration","librarySort"].forEach((id)=>$("#"+id).addEventListener("input",()=>{state.visibleResults=72;renderLibrary();}));
  $("#libraryLoadMore").addEventListener("click",loadMoreLibraryResults);$("#libraryDialog").addEventListener("scroll",()=>{const dialog=$("#libraryDialog");if(dialog.scrollTop+dialog.clientHeight>=dialog.scrollHeight-320)loadMoreLibraryResults();});
  $("#managePlansButton").addEventListener("click",openPlans);$("#buildPlanButton").addEventListener("click",()=>{$("#planStart").value=state.focusDate>=todayIso()?state.focusDate:todayIso();$("#builderDialog").showModal();});$("#builderForm").addEventListener("submit",previewPlan);$("#applyPlanButton").addEventListener("click",applyDraftPlan);$("#previewZwift").addEventListener("click",exportPlanZip);$("#previewIntervals").addEventListener("click",()=>{if(state.draftPlan)window.IntervalsIcu.openBlock(state.draftPlan);});
  $("#settingsButton").addEventListener("click",()=>{renderSourceManager();$("#settingsDialog").showModal();});$("#importLibraryButton").addEventListener("click",importCustomLibrary);$("#exportBackupButton").addEventListener("click",exportBackup);$("#importBackupInput").addEventListener("change",(event)=>{if(event.target.files[0])importBackup(event.target.files[0]);});
  $$('[data-close]').forEach((button)=>button.addEventListener("click",()=>$("#"+button.dataset.close).close()));
  ["libraryDialog","detailDialog","builderDialog","settingsDialog","plansDialog"].forEach((id)=>$("#"+id).addEventListener("click",(event)=>{if(event.target.id===id)event.target.close();}));
  setupBuilderDays();window.WorkoutSettings.initFtpControls(()=>{const event=eventById(state.selectedEventId);if($("#detailDialog").open&&event)drawProfile($(".detail-profile"),workoutForEvent(event));});window.IntervalsIcu.init();
}

async function init(){try{sourceState=await window.WorkoutSources.load();}catch(error){sourceState={builtinEnabled:true,customLibraries:[]};console.warn(error);}rebuildLibrary(false);state.calendar=model.read(localStorage,library);initControls();renderCalendar();state.activities=await loadActivities();renderCalendar();}
init();
