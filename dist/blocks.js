const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const minutes = (seconds) => Math.round(seconds / 60);
const clamp = (min, value, max) => Math.max(min, Math.min(max, value));
const escapeHtml = (value) => String(value ?? "").replace(/[<>&"']/g, (char) => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;", '"':"&quot;", "'":"&#39;" }[char]));
const escapeXml = (value) => String(value ?? "").replace(/[<>&"']/g, (char) => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;", '"':"&quot;", "'":"&apos;" }[char]));

const colors = {
  Endurance: "#2c7a68", Tempo: "#8e9d3f", "Sweet Spot": "#d28b24",
  Threshold: "#e15d3f", "VO2 Max": "#b74367", Anaerobic: "#754d9e",
  Sprint: "#315f9a", Unclassified: "#97978f",
};
const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const templates = {
  base1: {
    label: "Base 1", subtitle: "Aerobic durability",
    description: "Endurance frequency and long-ride durability, with controlled Tempo or Sweet Spot work.",
    hardTypes: ["Tempo", "Sweet Spot", "Tempo"], levelOffset: -0.5,
    reasons: [
      ["Mostly aerobic", "Endurance sessions carry the block while intensity remains deliberately controlled."],
      ["Durability first", "The long ride grows modestly through week three before the recovery week."],
      ["Measured quality", "Tempo and Sweet Spot add sustained work without turning every ride into a test."],
    ],
  },
  base2: {
    label: "Base 2", subtitle: "Tempo & Sweet Spot",
    description: "Aerobic volume remains central while sustained Tempo and Sweet Spot time in zone progresses.",
    hardTypes: ["Sweet Spot", "Tempo", "Threshold"], levelOffset: 0,
    reasons: [
      ["Sustained work", "Quality days emphasize longer sub-threshold intervals and accumulated time in zone."],
      ["Easy volume stays easy", "Endurance rides protect the distinction between stimulus and recovery."],
      ["Progress, then absorb", "Weeks two and three build workload; week four cuts both volume and quality."],
    ],
  },
  build1: {
    label: "Build 1", subtitle: "Threshold & VO₂",
    description: "Two complementary quality stimuli develop sustained power and aerobic capacity.",
    hardTypes: ["Threshold", "VO2 Max", "Threshold"], levelOffset: 0.25,
    reasons: [
      ["Complementary stress", "Threshold develops sustained power while VO₂ work targets aerobic capacity."],
      ["Recovery spacing", "Quality sessions are separated whenever the selected riding schedule allows."],
      ["TIZ progression", "Workout matching favors a measured increase in work duration before raw intensity."],
    ],
  },
  build2: {
    label: "Build 2", subtitle: "Specific intensity",
    description: "Higher-specificity VO₂, Anaerobic, and Threshold work layered onto enough endurance riding.",
    hardTypes: ["VO2 Max", "Threshold", "Anaerobic"], levelOffset: 0.5,
    reasons: [
      ["Specific intensity", "VO₂, Threshold, and Anaerobic sessions prepare repeatable high-output efforts."],
      ["Intensity is capped", "The builder preserves easy days and flags three-hard-day selections."],
      ["Freshness matters", "The final week removes most hard-work exposure rather than chasing one more peak load."],
    ],
  },
};
const zoneBounds = {
  Tempo: [76, 87.99], "Sweet Spot": [88, 94.99], Threshold: [95, 105.99],
  "VO2 Max": [106, 120.99], Anaerobic: [121, 150], Endurance: [55, 75.99],
};
const baseTiz = { Tempo: 38, "Sweet Spot": 34, Threshold: 28, "VO2 Max": 18, Anaerobic: 12, Endurance: 45 };
const difficultyLevels = { conservative: 2.5, normal: 4.5, aggressive: 6.5 };

const state = {
  workouts: window.WORKOUT_DATA?.workouts || [],
  byId: new Map(), current: null, saved: [], replacementTarget: null, detailSession: null,
};
state.workouts.forEach((workout) => {
  workout.tiz = workout.tiz || {};
  state.byId.set(workout.id, workout);
});

function workoutTiz(workout, type) {
  if (workout.tiz[type] != null) return workout.tiz[type];
  const bounds = zoneBounds[type];
  if (!bounds) return 0;
  let seconds = 0;
  for (let index = 0; index < workout.points.length - 1; index += 1) {
    const [startTime, startPower] = workout.points[index];
    const [endTime, endPower] = workout.points[index + 1];
    const midpoint = (startPower + endPower) / 2;
    if (midpoint >= bounds[0] && midpoint <= bounds[1]) seconds += Math.max(0, endTime - startTime);
  }
  workout.tiz[type] = seconds / 60;
  return workout.tiz[type];
}

function currentSettings() {
  return {
    name: $("#blockName").value.trim() || "Untitled Block",
    type: $("#blockType").value,
    cyclingDays: Number($("#cyclingDays").value),
    hardDays: Number($("#hardDays").value),
    weeklyHours: clamp(3, Number($("#weeklyHours").value) || 7, 24),
    longRideDay: $("#longRideDay").value,
    difficulty: $("#difficulty").value,
  };
}

function rideDaysFor(count, longRideDay) {
  const sunday = {
    3: [1, 3, 6], 4: [1, 3, 5, 6], 5: [1, 2, 3, 5, 6],
    6: [0, 1, 2, 3, 5, 6], 7: [0, 1, 2, 3, 4, 5, 6],
  };
  const saturday = {
    3: [1, 3, 5], 4: [1, 3, 5, 6], 5: [1, 2, 3, 5, 6],
    6: [0, 1, 2, 3, 5, 6], 7: [0, 1, 2, 3, 4, 5, 6],
  };
  return (longRideDay === "Saturday" ? saturday : sunday)[count];
}

function hardDayIndices(rideDays, hardCount, longIndex) {
  const preferred = [1, 3].filter((day) => rideDays.includes(day));
  const candidates = [...preferred];
  if (hardCount > candidates.length && rideDays.includes(longIndex)) candidates.push(longIndex);
  for (const day of rideDays) {
    if (candidates.length >= hardCount) break;
    if (!candidates.includes(day) && day !== longIndex) candidates.push(day);
  }
  return candidates.slice(0, hardCount);
}

function targetLevel(settings, weekIndex) {
  const template = templates[settings.type];
  const weekChange = [0, 0.45, 0.85, -0.65][weekIndex];
  return clamp(1, difficultyLevels[settings.difficulty] + template.levelOffset + weekChange, 10);
}

function scoreWorkout(workout, request, usedIds) {
  const durationDifference = Math.abs(minutes(workout.duration) - request.durationMinutes);
  const level = workout.level || 0;
  const levelDifference = level ? Math.abs(level - request.level) : 2.5;
  const tizDifference = request.tizMinutes == null ? 0 : Math.abs(workoutTiz(workout, request.type) - request.tizMinutes);
  const progressionPenalty = request.minTiz && workoutTiz(workout, request.type) < request.minTiz
    ? (request.minTiz - workoutTiz(workout, request.type)) * 35
    : 0;
  const repeatPenalty = usedIds.has(workout.id) ? 500 : 0;
  const instructionBonus = workout.description?.length > 80 ? -1.5 : 0;
  return durationDifference * 1.25 + levelDifference * 8 + tizDifference * 1.8 + progressionPenalty + repeatPenalty + instructionBonus;
}

function candidatesFor(request, usedIds) {
  let candidates = state.workouts.filter((workout) => workout.type === request.type && workout.duration > 0);
  if (!candidates.length && request.type === "Tempo") candidates = state.workouts.filter((workout) => workout.type === "Sweet Spot");
  return candidates
    .map((workout) => ({ workout, score: scoreWorkout(workout, request, usedIds) }))
    .sort((a, b) => a.score - b.score || a.workout.name.localeCompare(b.workout.name));
}

function pickWorkout(request, usedIds) {
  return candidatesFor(request, usedIds)[0]?.workout || null;
}

function generateWeek(settings, weekIndex, usedIds, previousWeek = null) {
  const template = templates[settings.type];
  const volumeFactors = [1, 1.05, 1.1, 0.65];
  const targetMinutes = settings.weeklyHours * 60 * volumeFactors[weekIndex];
  const rideDays = rideDaysFor(settings.cyclingDays, settings.longRideDay);
  const longIndex = settings.longRideDay === "Saturday" ? 5 : 6;
  const hardCount = weekIndex === 3 ? Math.min(1, settings.hardDays) : settings.hardDays;
  const hardDays = hardDayIndices(rideDays, hardCount, longIndex);
  const loadingFactor = [1, 1.15, 1.3, 0.58][weekIndex];
  const desiredLevel = targetLevel(settings, weekIndex);
  const averageRide = targetMinutes / settings.cyclingDays;
  const longDuration = clamp(75, targetMinutes * (settings.cyclingDays <= 3 ? 0.42 : 0.34), 240);
  const hardDuration = clamp(45, averageRide * 0.95, 105);
  const allocatedHard = hardDays.reduce((total, day) => total + (day === longIndex ? longDuration : hardDuration), 0);
  const longRideIsHard = hardDays.includes(longIndex);
  const allocatedFixed = allocatedHard + (longRideIsHard ? 0 : longDuration);
  const ordinaryEasyCount = settings.cyclingDays - hardDays.length - (longRideIsHard ? 0 : 1);
  const easyDuration = ordinaryEasyCount ? clamp(30, (targetMinutes - allocatedFixed) / ordinaryEasyCount, 150) : 0;
  let hardSlot = 0;

  const sessions = rideDays.map((dayIndex) => {
    const isHard = hardDays.includes(dayIndex);
    const isLong = dayIndex === longIndex;
    const currentHardSlot = hardSlot;
    const type = isHard ? template.hardTypes[hardSlot % template.hardTypes.length] : "Endurance";
    if (isHard) hardSlot += 1;
    const durationMinutes = isLong ? longDuration : isHard ? hardDuration : easyDuration;
    const tizMinutes = isHard
      ? baseTiz[type] * loadingFactor * (settings.difficulty === "conservative" ? 0.88 : settings.difficulty === "aggressive" ? 1.12 : 1)
      : null;
    const previousQuality = isHard && previousWeek
      ? previousWeek.sessions.filter((session) => session.role === "Quality")[currentHardSlot]
      : null;
    const minTiz = weekIndex < 3 && previousQuality?.workout
      ? workoutTiz(previousQuality.workout, type) * 1.02
      : null;
    const request = { type, durationMinutes, level: isHard ? desiredLevel : Math.max(1, desiredLevel - 2), tizMinutes, minTiz };
    const workout = pickWorkout(request, usedIds);
    if (workout) usedIds.add(workout.id);
    return {
      dayIndex, day: weekdays[dayIndex], role: isHard ? "Quality" : isLong ? "Long endurance" : "Endurance",
      type, request, workout,
    };
  });
  return { weekIndex, label: weekIndex === 3 ? "Recovery" : `Load ${weekIndex + 1}`, sessions };
}

function generateBlock() {
  const settings = currentSettings();
  const usedIds = new Set();
  const weeks = [];
  for (let weekIndex = 0; weekIndex < 4; weekIndex += 1) {
    weeks.push(generateWeek(settings, weekIndex, usedIds, weeks[weekIndex - 1] || null));
  }
  state.current = { id: null, createdAt: new Date().toISOString(), settings, weeks };
  renderBlock();
}

function weekTotals(week) {
  const workouts = week.sessions.map((session) => session.workout).filter(Boolean);
  return {
    minutes: workouts.reduce((sum, workout) => sum + workout.duration / 60, 0),
    tss: workouts.reduce((sum, workout) => sum + workout.tss, 0),
    hardTiz: week.sessions.reduce((sum, session) => sum + (session.role === "Quality" && session.workout ? workoutTiz(session.workout, session.type) : 0), 0),
    hardDays: week.sessions.filter((session) => session.role === "Quality").length,
  };
}

function blockTotals(block) {
  const totals = block.weeks.map(weekTotals);
  return {
    hours: totals.reduce((sum, week) => sum + week.minutes, 0) / 60,
    tss: totals.reduce((sum, week) => sum + week.tss, 0),
    quality: totals.reduce((sum, week) => sum + week.hardDays, 0),
    tiz: totals.reduce((sum, week) => sum + week.hardTiz, 0),
  };
}

function renderBlock() {
  const block = state.current;
  if (!block) return;
  $("#emptyBlock").hidden = true;
  $("#blockResult").hidden = false;
  $("#exportButton").disabled = false;
  $("#intervalsBlockButton").disabled = false;
  $("#scheduleButton").disabled = false;
  $("#resultName").textContent = block.settings.name;
  const template = templates[block.settings.type];
  $("#resultSummary").textContent = `${template.label} · ${block.settings.cyclingDays} cycling days · ${block.settings.hardDays} planned hard days in loading weeks`;
  const totals = blockTotals(block);
  $("#blockKpis").innerHTML = [
    [totals.hours.toFixed(1), "total hours"], [Math.round(totals.tss), "estimated TSS"],
    [totals.quality, "quality sessions"], [Math.round(totals.tiz), "hard-work TIZ min"],
  ].map(([value, label]) => `<div class="block-kpi"><strong>${value}</strong><small>${label}</small></div>`).join("");
  $("#weekGrid").innerHTML = block.weeks.map(renderWeek).join("");
  $("#rationale").innerHTML = template.reasons.map(([title, copy]) => `<div class="reason"><h4>${escapeHtml(title)}</h4><p>${escapeHtml(copy)}</p></div>`).join("");
  bindWeekActions();
  requestAnimationFrame(drawProgress);
}

function renderWeek(week) {
  const totals = weekTotals(week);
  return `<article class="week-column ${week.weekIndex === 3 ? "recovery" : ""}">
    <header class="week-header">
      <div class="week-label"><h3>Week ${week.weekIndex + 1}</h3><span>${week.label}</span></div>
      <div class="week-total"><span>${(totals.minutes / 60).toFixed(1)} h</span><span>${Math.round(totals.tss)} TSS</span><span>${Math.round(totals.hardTiz)} min TIZ</span></div>
    </header>
    <div class="session-list">${week.sessions.map((session, sessionIndex) => renderSession(week.weekIndex, sessionIndex, session)).join("")}</div>
  </article>`;
}

function renderSession(weekIndex, sessionIndex, session) {
  const workout = session.workout;
  if (!workout) return `<div class="session-card rest"><strong>${session.day}</strong><p>No matching workout found</p></div>`;
  const tiz = session.role === "Quality" ? `${Math.round(workoutTiz(workout, session.type))}m TIZ` : "Aerobic";
  return `<div class="session-card" style="--session-color:${colors[session.type] || colors.Unclassified}">
    <div class="session-heading"><small>${session.day}</small><small class="session-role">${session.role}</small></div>
    <h4 title="${escapeHtml(workout.name)}">${escapeHtml(workout.name)}</h4>
    <canvas class="session-profile" data-session-profile="${weekIndex}:${sessionIndex}" aria-label="${escapeHtml(workout.name)} profile"></canvas>
    <p class="session-description">${escapeHtml(window.WorkoutSettings.practicalDescription(workout, session.type))}</p>
    <div class="session-meta"><span>${minutes(workout.duration)} min</span><span>${Math.round(workout.tss)} TSS</span><span>Level ${workout.level ? workout.level.toFixed(1) : "—"}</span><span>${tiz}</span></div>
    <div class="session-actions">
      <button type="button" data-inspect="${weekIndex}:${sessionIndex}">Inspect</button>
      <button type="button" data-change="${weekIndex}:${sessionIndex}">Change workout</button>
    </div>
  </div>`;
}

function bindWeekActions() {
  $$('[data-change]').forEach((button) => button.addEventListener("click", () => {
    const [weekIndex, sessionIndex] = button.dataset.change.split(":").map(Number);
    openReplacementPicker(weekIndex, sessionIndex);
  }));
  $$('[data-inspect]').forEach((button) => button.addEventListener("click", () => {
    const [weekIndex, sessionIndex] = button.dataset.inspect.split(":").map(Number);
    inspectWorkout(state.current.weeks[weekIndex].sessions[sessionIndex]);
  }));
  $$('[data-session-profile]').forEach((canvas) => {
    const [weekIndex, sessionIndex] = canvas.dataset.sessionProfile.split(":").map(Number);
    const session = state.current.weeks[weekIndex].sessions[sessionIndex];
    requestAnimationFrame(() => drawMiniProfile(canvas, session.workout));
  });
}

function redrawPlannerProfiles() {
  if (!state.current) return;
  $$('[data-session-profile]').forEach((canvas) => {
    const [weekIndex, sessionIndex] = canvas.dataset.sessionProfile.split(":").map(Number);
    drawMiniProfile(canvas, state.current.weeks[weekIndex].sessions[sessionIndex].workout);
  });
}

function replacementTarget() {
  if (!state.replacementTarget || !state.current) return null;
  const { weekIndex, sessionIndex } = state.replacementTarget;
  return state.current.weeks[weekIndex]?.sessions[sessionIndex] || null;
}

function openReplacementPicker(weekIndex, sessionIndex) {
  state.replacementTarget = { weekIndex, sessionIndex };
  const session = replacementTarget();
  $("#replacementSearch").value = "";
  $("#replacementScope").value = "similar";
  $("#replacementContext").textContent = `Replacing ${session.workout.name} on ${session.day}. Choose any workout below.`;
  renderReplacementOptions();
  $("#replacementDialog").showModal();
}

function replacementMatches(workout, query) {
  if (!query) return true;
  return [workout.name, workout.type, workout.structure, workout.description, workout.goals].join(" ").toLowerCase().includes(query);
}

function renderReplacementOptions() {
  const session = replacementTarget();
  if (!session) return;
  const query = $("#replacementSearch").value.trim().toLowerCase();
  const used = new Set(state.current.weeks.flatMap((week) => week.sessions.map((item) => item.workout?.id)).filter(Boolean));
  used.delete(session.workout?.id);
  const similar = $("#replacementScope").value === "similar";
  let choices = state.workouts.filter((workout) => workout.duration > 0 && workout.id !== session.workout?.id && replacementMatches(workout, query));
  if (similar) choices = choices.filter((workout) => workout.type === session.type && Math.abs(minutes(workout.duration) - minutes(session.workout.duration)) <= 45);
  choices = choices.map((workout) => ({ workout, score: scoreWorkout(workout, session.request, used) }))
    .sort((a, b) => a.score - b.score || a.workout.name.localeCompare(b.workout.name)).slice(0, 48);
  const root = $("#replacementResults");
  root.innerHTML = choices.length ? choices.map(({ workout }) => `<article class="replacement-option">
    <canvas class="replacement-profile" data-replacement-profile="${workout.id}" aria-label="${escapeHtml(workout.name)} profile"></canvas>
    <div class="replacement-copy"><div><span>${escapeHtml(workout.type)}</span><h3>${escapeHtml(workout.name)}</h3></div>
    <p>${escapeHtml(window.WorkoutSettings.practicalDescription(workout))}</p>
    <small>${minutes(workout.duration)} min · ${Math.round(workout.tss)} TSS · Level ${workout.level ? workout.level.toFixed(1) : "—"} · ${escapeHtml(workout.structure)}</small></div>
    <button class="button secondary" type="button" data-choose-workout="${workout.id}">Choose</button>
  </article>`).join("") : `<div class="replacement-empty"><h3>No matches</h3><p>Try a broader search or switch to the entire library.</p></div>`;
  $$('[data-choose-workout]', root).forEach((button) => button.addEventListener("click", () => chooseReplacement(Number(button.dataset.chooseWorkout))));
  $$('[data-replacement-profile]', root).forEach((canvas) => requestAnimationFrame(() => drawMiniProfile(canvas, state.byId.get(Number(canvas.dataset.replacementProfile)))));
}

function chooseReplacement(workoutId) {
  const session = replacementTarget();
  const workout = state.byId.get(workoutId);
  if (!session || !workout) return;
  session.workout = workout;
  session.type = workout.type;
  session.role = workout.type === "Endurance" ? (session.day === state.current.settings.longRideDay ? "Long endurance" : "Endurance") : "Quality";
  session.request = { type: workout.type, durationMinutes: minutes(workout.duration), level: workout.level || 1, tizMinutes: workout.type === "Endurance" ? null : workoutTiz(workout, workout.type), minTiz: null };
  $("#replacementDialog").close();
  state.replacementTarget = null;
  renderBlock();
}

function fitCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.max(1, Math.round(rect.height * ratio));
  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { context, width: rect.width, height: rect.height };
}

function drawProgress() {
  if (!state.current || $("#blockResult").hidden) return;
  const canvas = $("#progressCanvas");
  const { context: ctx, width, height } = fitCanvas(canvas);
  const totals = state.current.weeks.map(weekTotals);
  const maxHours = Math.max(...totals.map((week) => week.minutes / 60), 1) * 1.2;
  const maxTiz = Math.max(...totals.map((week) => week.hardTiz), 1) * 1.2;
  const pad = { left: 35, right: 28, top: 18, bottom: 28 };
  const plotW = width - pad.left - pad.right, plotH = height - pad.top - pad.bottom;
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(24,35,29,.12)"; ctx.fillStyle = "#6d756f"; ctx.font = "10px system-ui"; ctx.textAlign = "center";
  for (let index = 0; index < 4; index += 1) {
    const center = pad.left + plotW * (index + .5) / 4;
    const barW = Math.min(48, plotW / 7);
    const barH = (totals[index].minutes / 60 / maxHours) * plotH;
    ctx.fillStyle = index === 3 ? "#a9bda8" : "#c8f169";
    ctx.fillRect(center - barW / 2, pad.top + plotH - barH, barW, barH);
    ctx.fillStyle = "#6d756f"; ctx.fillText(`W${index + 1}`, center, height - 7);
    ctx.fillText(`${(totals[index].minutes / 60).toFixed(1)}h`, center, pad.top + plotH - barH - 6);
  }
  ctx.beginPath();
  totals.forEach((week, index) => {
    const x = pad.left + plotW * (index + .5) / 4;
    const y = pad.top + plotH - (week.hardTiz / maxTiz) * plotH;
    if (!index) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#f0804e"; ctx.lineWidth = 2.5; ctx.stroke();
  totals.forEach((week, index) => {
    const x = pad.left + plotW * (index + .5) / 4;
    const y = pad.top + plotH - (week.hardTiz / maxTiz) * plotH;
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fillStyle = "#f0804e"; ctx.fill();
    ctx.fillStyle = "#91482e"; ctx.fillText(`${Math.round(week.hardTiz)}m`, x, Math.max(10, y - 8));
  });
}

function drawMiniProfile(canvas, workout) {
  if (!canvas?.isConnected || !workout) return;
  const { context: ctx, width, height } = fitCanvas(canvas);
  const maxTime = workout.points.at(-1)[0] || 1;
  const maxPower = Math.max(130, ...workout.points.map((point) => point[1])) * 1.05;
  const color = colors[workout.type] || colors.Unclassified;
  ctx.clearRect(0, 0, width, height); ctx.beginPath();
  workout.points.forEach(([time, power], index) => {
    const x = time / maxTime * width, y = height - power / maxPower * height;
    if (!index) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.lineTo(width, height); ctx.lineTo(0, height); ctx.closePath();
  const gradient = ctx.createLinearGradient(0, 0, 0, height); gradient.addColorStop(0, color + "b8"); gradient.addColorStop(1, color + "18");
  ctx.fillStyle = gradient; ctx.fill(); ctx.beginPath();
  workout.points.forEach(([time, power], index) => {
    const x = time / maxTime * width, y = height - power / maxPower * height;
    if (!index) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.stroke();
}

function drawProfile(canvas, workout) {
  if (!canvas?.isConnected) return;
  const { context: ctx, width, height } = fitCanvas(canvas);
  const ftp = window.WorkoutSettings.getFtp();
  const pad = { left: 46, right: 54, top: 24, bottom: 28 };
  const plotW = width - pad.left - pad.right, plotH = height - pad.top - pad.bottom;
  const maxTime = workout.points.at(-1)[0] || 1;
  const maxPower = Math.max(130, ...workout.points.map((point) => point[1])) * 1.05;
  ctx.clearRect(0, 0, width, height);
  [50, 100, 150].forEach((power) => {
    if (power > maxPower) return;
    const y = pad.top + plotH - power / maxPower * plotH;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(width - pad.right, y); ctx.strokeStyle = "rgba(24,35,29,.12)"; ctx.stroke();
    ctx.fillStyle = "#6d756f"; ctx.font = "11px system-ui"; ctx.textAlign = "left"; ctx.fillText(`${power}%`, 4, y + 4);
    ctx.textAlign = "right"; ctx.fillText(ftp ? `${Math.round(ftp * power / 100)} W` : "— W", width - 4, y + 4);
  });
  ctx.beginPath();
  workout.points.forEach(([time, power], index) => {
    const x = pad.left + time / maxTime * plotW, y = pad.top + plotH - power / maxPower * plotH;
    if (!index) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.lineTo(width - pad.right, pad.top + plotH); ctx.lineTo(pad.left, pad.top + plotH); ctx.closePath();
  const color = colors[workout.type] || colors.Unclassified;
  const gradient = ctx.createLinearGradient(0, pad.top, 0, height); gradient.addColorStop(0, color + "cc"); gradient.addColorStop(1, color + "20");
  ctx.fillStyle = gradient; ctx.fill();
  ctx.beginPath();
  workout.points.forEach(([time, power], index) => {
    const x = pad.left + time / maxTime * plotW, y = pad.top + plotH - power / maxPower * plotH;
    if (!index) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.fillStyle = "#6d756f"; ctx.font = "10px system-ui"; ctx.textAlign = "left"; ctx.fillText("% FTP", 4, 11);
  ctx.textAlign = "right"; ctx.fillText(ftp ? `FTP ${ftp} W` : "Set FTP", width - 4, 11);
  ctx.textAlign = "center";
  [0, .25, .5, .75, 1].forEach((ratio) => ctx.fillText(`${Math.round(minutes(maxTime) * ratio)}m`, pad.left + plotW * ratio, height - 7));
  canvas._profileGeometry = { padding: pad, plotW, maxTime };
}

function attachProfileHover(canvas, workout, tooltip) {
  canvas.addEventListener("pointermove", (event) => {
    const geometry = canvas._profileGeometry;
    if (!geometry) return;
    const rect = canvas.getBoundingClientRect();
    const x = clamp(geometry.padding.left, event.clientX - rect.left, geometry.padding.left + geometry.plotW);
    const seconds = (x - geometry.padding.left) / geometry.plotW * geometry.maxTime;
    const portion = window.WorkoutSettings.profileAt(workout, seconds);
    if (!portion) return;
    const ftp = window.WorkoutSettings.getFtp();
    const watts = ftp ? Math.round(ftp * portion.percent / 100) : null;
    const duration = Math.max(0, portion.endSeconds - portion.startSeconds);
    tooltip.hidden = false;
    tooltip.innerHTML = `<strong>${window.WorkoutSettings.formatDuration(duration)} segment</strong>${Math.round(portion.percent)}% FTP${watts ? ` · ${watts} W` : " · set FTP for watts"}`;
    tooltip.style.left = `${Math.min(rect.width - 175, Math.max(0, x))}px`;
    tooltip.style.top = `${Math.max(54, event.clientY - rect.top)}px`;
  });
  canvas.addEventListener("pointerleave", () => { tooltip.hidden = true; });
}

function inspectWorkout(session) {
  state.detailSession = session;
  const workout = session.workout;
  const root = $("#workoutDetail");
  root.innerHTML = `<div class="detail-inner" style="--type-color:${colors[workout.type] || colors.Unclassified}">
    <span class="type-pill">${escapeHtml(workout.type)}</span><h2>${escapeHtml(workout.name)}</h2>
    <p class="detail-subtitle">${escapeHtml(session.role)} · ${escapeHtml(workout.structure)} · Workout ID ${workout.id}</p>
    <p class="practical-summary">${escapeHtml(window.WorkoutSettings.practicalDescription(workout, session.type))}</p>
    <div class="profile-detail-wrap"><canvas class="detail-profile"></canvas><div class="profile-tooltip" hidden></div></div>
    <div class="detail-metrics">
      <div class="metric"><strong>${minutes(workout.duration)} min</strong><small>Duration</small></div>
      <div class="metric"><strong>${Math.round(workout.tss)}</strong><small>TSS</small></div>
      <div class="metric"><strong>${workout.intensity.toFixed(2)}</strong><small>Intensity</small></div>
      <div class="metric"><strong>${Math.round(workoutTiz(workout, session.type))} min</strong><small>${escapeHtml(session.type)} TIZ</small></div>
      <div class="metric"><strong>${workout.level ? workout.level.toFixed(1) : "—"}</strong><small>Level</small></div>
    </div>
    ${workout.description ? `<p class="eyebrow">Description</p><p class="detail-copy">${escapeHtml(workout.description)}</p>` : ""}
    <div class="detail-actions">
      <button class="button ride-now-button" type="button">Ride now</button>
      <button class="button zwift-download-button" type="button">Download for Zwift</button>
      <button class="button secondary intervals-upload-button" type="button">Send to Intervals.icu</button>
    </div>
    <p class="zwift-help">Move the downloaded .zwo file to <code>Documents › Zwift › Workouts › your Zwift ID</code>, then restart Zwift.</p>
  </div>`;
  $(".ride-now-button", root).addEventListener("click", () => window.WorkoutRide.launch(workout, createZwo(workout)));
  $(".zwift-download-button", root).addEventListener("click", () => downloadZwo(workout));
  $(".intervals-upload-button", root).addEventListener("click", () => window.IntervalsIcu.openWorkout(workout));
  $("#workoutDialog").showModal();
  requestAnimationFrame(() => {
    const canvas = $(".detail-profile", root);
    drawProfile(canvas, workout);
    attachProfileHover(canvas, workout, $(".profile-tooltip", root));
  });
}

function updateGuardrails() {
  const settings = currentSettings();
  const notices = [];
  if (settings.hardDays === 3) notices.push("Three hard days is an advanced choice. The builder will preserve recovery spacing where possible, but one quality day may share the long ride.");
  if (settings.hardDays >= settings.cyclingDays - 1) notices.push("Most of the selected riding days would carry intensity. Consider another cycling day or one fewer hard day.");
  if (settings.weeklyHours / settings.cyclingDays > 3) notices.push("Average ride length exceeds three hours. Check that this reflects your actual availability.");
  if (settings.difficulty === "aggressive") notices.push("Aggressive starts near higher progression levels. Use it only when current interval tolerance supports that workload.");
  if (!notices.length) notices.push("Loading and recovery constraints look workable. Hard days will be separated where the schedule allows.");
  $("#guardrails").innerHTML = notices.map((text) => `<div class="guardrail ${notices.length === 1 && text.startsWith("Loading") ? "ok" : ""}">${escapeHtml(text)}</div>`).join("");
  const template = templates[settings.type];
  $("#blockDescription").textContent = template.description;
}

function serializeBlock(block) {
  return {
    id: block.id, createdAt: block.createdAt, updatedAt: new Date().toISOString(), settings: block.settings,
    weeks: block.weeks.map((week) => ({ weekIndex: week.weekIndex, label: week.label, sessions: week.sessions.map((session) => ({
      dayIndex: session.dayIndex, day: session.day, role: session.role, type: session.type, request: session.request, workoutId: session.workout?.id || null,
    })) })),
  };
}

function hydrateBlock(saved) {
  return {
    ...saved,
    weeks: saved.weeks.map((week) => ({ ...week, sessions: week.sessions.map((session) => ({ ...session, workout: state.byId.get(session.workoutId) || null })) })),
  };
}

function readSaved() {
  try { state.saved = JSON.parse(localStorage.getItem("workout-blocks-v1") || "[]"); } catch { state.saved = []; }
  updateSavedCount();
}

function writeSaved() {
  localStorage.setItem("workout-blocks-v1", JSON.stringify(state.saved));
  updateSavedCount();
}

function saveCurrent() {
  if (!state.current) return null;
  state.current.settings.name = $("#blockName").value.trim() || state.current.settings.name;
  if (!state.current.id) state.current.id = `block-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const saved = serializeBlock(state.current);
  const index = state.saved.findIndex((block) => block.id === saved.id);
  if (index >= 0) state.saved[index] = saved; else state.saved.unshift(saved);
  writeSaved();
  $("#saveButton").textContent = "Saved";
  setTimeout(() => { $("#saveButton").textContent = "Save block"; }, 1200);
  return state.current.id;
}

function duplicateCurrent() {
  if (!state.current) return;
  const copy = hydrateBlock(serializeBlock(state.current));
  copy.id = null; copy.settings.name = `${copy.settings.name} Copy`; copy.createdAt = new Date().toISOString();
  state.current = copy;
  $("#blockName").value = copy.settings.name;
  renderBlock();
}

function updateSavedCount() { $("#savedCount").textContent = state.saved.length; }

function renderSaved() {
  const root = $("#savedList");
  if (!state.saved.length) { root.innerHTML = `<div class="saved-empty">No saved blocks yet.</div>`; return; }
  root.innerHTML = state.saved.map((block) => `<div class="saved-row">
    <div><h3>${escapeHtml(block.settings.name)}</h3><p>${escapeHtml(templates[block.settings.type]?.label || block.settings.type)} · ${block.settings.cyclingDays} days · ${block.settings.weeklyHours} h starting week</p></div>
    <div class="saved-row-actions"><button data-load-block="${block.id}">Open</button><button data-schedule-block="${block.id}">Schedule</button><button data-delete-block="${block.id}">Delete</button></div>
  </div>`).join("");
  $$('[data-load-block]', root).forEach((button) => button.addEventListener("click", () => loadSaved(button.dataset.loadBlock)));
  $$('[data-schedule-block]', root).forEach((button) => button.addEventListener("click", () => { window.location.href = `calendar.html?block=${encodeURIComponent(button.dataset.scheduleBlock)}`; }));
  $$('[data-delete-block]', root).forEach((button) => button.addEventListener("click", () => deleteSaved(button.dataset.deleteBlock)));
}

function loadSaved(id) {
  const saved = state.saved.find((block) => block.id === id);
  if (!saved) return;
  state.current = hydrateBlock(saved);
  applySettingsToForm(state.current.settings);
  $("#savedDialog").close();
  renderBlock();
}

function deleteSaved(id) {
  state.saved = state.saved.filter((block) => block.id !== id);
  writeSaved(); renderSaved();
}

function applySettingsToForm(settings) {
  $("#blockName").value = settings.name; $("#blockType").value = settings.type;
  $("#cyclingDays").value = settings.cyclingDays; $("#hardDays").value = settings.hardDays;
  $("#weeklyHours").value = settings.weeklyHours; $("#longRideDay").value = settings.longRideDay;
  $("#difficulty").value = settings.difficulty; updateGuardrails();
}

function resetForm() {
  applySettingsToForm({ name: "My Base 1 Block", type: "base1", cyclingDays: 4, hardDays: 2, weeklyHours: 7, longRideDay: "Sunday", difficulty: "normal" });
  state.current = null; $("#emptyBlock").hidden = false; $("#blockResult").hidden = true; $("#exportButton").disabled = true; $("#intervalsBlockButton").disabled = true; $("#scheduleButton").disabled = true;
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
  return `<?xml version="1.0" encoding="UTF-8"?>\n<workout_file>\n  <author>CATHILL</author>\n  <name>${escapeXml(workout.name)}</name>\n  <description>${escapeXml(workout.description)}</description>\n  <sportType>bike</sportType>\n  <tags><tag name="CATHILL"/><tag name="${escapeXml(workout.type)}"/></tags>\n  <workout>\n${blocks.join("\n")}\n  </workout>\n</workout_file>\n`;
}

function downloadZwo(workout) {
  const blob = new Blob([createZwo(workout)], { type: "application/xml" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${workout.type} - ${minutes(workout.duration)} minutes - ${workout.id} - ${workout.name}`.replace(/[\\/:*?"<>|]/g, "-") + ".zwo";
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
function concatBytes(parts) { const size = parts.reduce((sum, part) => sum + part.length, 0); const out = new Uint8Array(size); let offset = 0; for (const part of parts) { out.set(part, offset); offset += part.length; } return out; }
function zipStore(files) {
  const encoder = new TextEncoder(), locals = [], centrals = []; let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name), data = typeof file.data === "string" ? encoder.encode(file.data) : file.data, crc = crc32(data);
    const local = new Uint8Array(30); const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint32(14, crc, true); lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true); lv.setUint16(26, name.length, true);
    const localPart = concatBytes([local, name, data]); locals.push(localPart);
    const central = new Uint8Array(46); const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true);
    centrals.push(concatBytes([central, name])); offset += localPart.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22); const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
  return new Blob([...locals, ...centrals, end], { type: "application/zip" });
}

function safeFilename(value) { return String(value).replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 150); }
function csvCell(value) { const text = String(value ?? ""); return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }

function exportBlock() {
  if (!state.current) return;
  const files = [], manifest = [["week", "day", "role", "type", "workout_id", "workout", "duration_minutes", "tss", "level", "tiz_minutes", "file"]];
  state.current.weeks.forEach((week) => week.sessions.forEach((session) => {
    if (!session.workout) return;
    const workout = session.workout;
    const file = `Week ${week.weekIndex + 1}/${String(session.dayIndex + 1).padStart(2, "0")} ${session.day} - ${safeFilename(workout.name)}.zwo`;
    files.push({ name: file, data: createZwo(workout) });
    manifest.push([week.weekIndex + 1, session.day, session.role, session.type, workout.id, workout.name, minutes(workout.duration), Math.round(workout.tss), workout.level || "", Math.round(workoutTiz(workout, session.type)), file]);
  }));
  const saved = serializeBlock(state.current);
  files.push({ name: "manifest.csv", data: manifest.map((row) => row.map(csvCell).join(",")).join("\n") + "\n" });
  files.push({ name: "block.json", data: JSON.stringify(saved, null, 2) + "\n" });
  files.push({ name: "README.txt", data: `${state.current.settings.name}\n\nFour-week cycling block exported from CATHILL.\nEach week folder contains ZWO workouts in calendar order.\nWeek 4 is the recovery week.\n` });
  const blob = zipStore(files); const link = document.createElement("a");
  link.href = URL.createObjectURL(blob); link.download = `${safeFilename(state.current.settings.name)}.zip`; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1500);
}

$$('.builder-controls input, .builder-controls select').forEach((input) => input.addEventListener("input", updateGuardrails));
$("#blockType").addEventListener("change", () => {
  const template = templates[$("#blockType").value];
  if (/^My (Base|Build) [12] Block$/.test($("#blockName").value)) $("#blockName").value = `My ${template.label} Block`;
  updateGuardrails();
});
$("#generateButton").addEventListener("click", generateBlock);
$("#resetBlockButton").addEventListener("click", resetForm);
$("#saveButton").addEventListener("click", saveCurrent);
$("#duplicateButton").addEventListener("click", duplicateCurrent);
$("#exportButton").addEventListener("click", exportBlock);
$("#intervalsBlockButton").addEventListener("click", () => { if (state.current) window.IntervalsIcu.openBlock(state.current); });
$("#scheduleButton").addEventListener("click", () => {
  const id = saveCurrent();
  if (id) window.location.href = `calendar.html?block=${encodeURIComponent(id)}`;
});
$("#savedButton").addEventListener("click", () => { renderSaved(); $("#savedDialog").showModal(); });
$("#replacementSearch").addEventListener("input", renderReplacementOptions);
$("#replacementScope").addEventListener("change", renderReplacementOptions);
$$('[data-close]').forEach((button) => button.addEventListener("click", () => $(`#${button.dataset.close}`).close()));
[$("#savedDialog"), $("#workoutDialog"), $("#replacementDialog")].forEach((dialog) => dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); }));
window.addEventListener("resize", () => {
  if (state.current) { drawProgress(); redrawPlannerProfiles(); }
  if ($("#workoutDialog").open && state.detailSession) drawProfile($(".detail-profile", $("#workoutDetail")), state.detailSession.workout);
});
window.WorkoutSettings.initFtpControls(() => {
  if ($("#workoutDialog").open && state.detailSession) drawProfile($(".detail-profile", $("#workoutDetail")), state.detailSession.workout);
});
window.IntervalsIcu.init();

readSaved();
updateGuardrails();
