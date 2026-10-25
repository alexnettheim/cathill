const state = {
  workouts: [], filtered: [], visible: 48, view: "list", favoritesOnly: false,
  favorites: new Set(JSON.parse(localStorage.getItem("workout-favorites") || "[]")),
};

const colors = {
  Endurance: "#2c7a68", Tempo: "#8e9d3f", "Sweet Spot": "#d28b24",
  Threshold: "#e15d3f", "VO2 Max": "#b74367", Anaerobic: "#754d9e",
  Sprint: "#315f9a", "FTP Test": "#253d35", "Free Ride": "#7c837d", Unclassified: "#97978f",
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const minutes = (seconds) => Math.round(seconds / 60);
const formatNumber = (number, digits = 0) => Number(number || 0).toFixed(digits);
const clamp = (min, value, max) => Math.max(min, Math.min(max, value));
const escapeXml = (value) => String(value || "").replace(/[<>&"']/g, (char) => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;", '"':"&quot;", "'":"&apos;" }[char]));
const escapeHtml = (value) => String(value || "").replace(/[<>&"']/g, (char) => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;", '"':"&quot;", "'":"&#39;" }[char]));

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function selectedTypes() {
  return new Set($$("#typeFilters input:checked").map((input) => input.value));
}

function searchMatch(workout, rawQuery) {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;
  const durationMatch = query.match(/(\d+)\s*(?:min|minute|m)\b/);
  const targetMinutes = durationMatch ? Number(durationMatch[1]) : null;
  const textQuery = query.replace(/\d+\s*(?:min|minute|m)\b/g, "").trim();
  const haystack = [workout.name, workout.type, workout.structure, workout.description, workout.goals, ...workout.flags].join(" ").toLowerCase();
  return (targetMinutes === null || Math.abs(minutes(workout.duration) - targetMinutes) <= 2) && (!textQuery || haystack.includes(textQuery));
}

function applyFilters() {
  if (!state.workouts.length) return;
  const query = $("#searchInput").value;
  const types = selectedTypes();
  const durationMin = Number($("#durationMin").value);
  const durationMax = Number($("#durationMax").value);
  const tssMin = Number($("#tssMin").value);
  const tssMax = Number($("#tssMax").value);
  const minLevel = Number($("#levelSelect").value);
  const structure = $("#structureSelect").value;
  const instructions = $("#hasInstructions").checked;

  state.filtered = state.workouts.filter((workout) => {
    const duration = minutes(workout.duration);
    return searchMatch(workout, query)
      && (!types.size || types.has(workout.type))
      && duration >= durationMin && duration <= durationMax
      && workout.tss >= tssMin && workout.tss <= tssMax
      && workout.level >= minLevel
      && (!structure || workout.structure === structure)
      && (!instructions || workout.description.length > 40 || workout.goals.length > 40)
      && (!state.favoritesOnly || state.favorites.has(workout.id));
  });

  const sort = $("#sortSelect").value;
  state.filtered.sort((a, b) => {
    if (sort === "duration-asc") return a.duration - b.duration || a.name.localeCompare(b.name);
    if (sort === "duration-desc") return b.duration - a.duration || a.name.localeCompare(b.name);
    if (sort === "tss-desc") return b.tss - a.tss || b.level - a.level;
    if (sort === "level-desc") return b.level - a.level || b.tss - a.tss;
    if (sort === "name") return a.name.localeCompare(b.name);
    return b.level - a.level || Math.abs(60 - minutes(a.duration)) - Math.abs(60 - minutes(b.duration)) || a.name.localeCompare(b.name);
  });

  state.visible = 48;
  updateSummary();
  renderActiveFilters();
  render();
}

function updateSummary() {
  $("#resultCount").textContent = state.filtered.length.toLocaleString();
  $("#medianDuration").textContent = `${Math.round(median(state.filtered.map((w) => minutes(w.duration))))} min`;
  $("#medianTss").textContent = Math.round(median(state.filtered.map((w) => w.tss)));
  $("#typeCount").textContent = new Set(state.filtered.map((w) => w.type)).size;
  $("#durationMinOutput").textContent = `${$("#durationMin").value} min`;
  $("#durationMaxOutput").textContent = `${$("#durationMax").value} min`;
  $("#tssMinOutput").textContent = `${$("#tssMin").value} TSS`;
  $("#tssMaxOutput").textContent = `${$("#tssMax").value} TSS`;
}

function renderActiveFilters() {
  const values = [];
  const query = $("#searchInput").value.trim();
  if (query) values.push(`Search: ${query}`);
  const types = [...selectedTypes()];
  if (types.length) values.push(...types);
  if ($("#durationMin").value !== "0" || $("#durationMax").value !== "360") values.push(`${$("#durationMin").value}–${$("#durationMax").value} min`);
  if ($("#tssMin").value !== "0" || $("#tssMax").value !== "400") values.push(`${$("#tssMin").value}–${$("#tssMax").value} TSS`);
  if ($("#levelSelect").value !== "0") values.push(`Level ${$("#levelSelect").value}+`);
  if ($("#structureSelect").value) values.push($("#structureSelect").value);
  if (state.favoritesOnly) values.push("Favorites only");
  $("#activeFilters").innerHTML = values.length
    ? values.map((value) => `<span class="filter-chip">${escapeHtml(value)}</span>`).join("")
    : `<span class="filter-chip">Showing the full library</span>`;
}

function metric(label, value) {
  return `<div class="metric"><strong>${value}</strong><small>${label}</small></div>`;
}

function renderCards() {
  const root = $("#results");
  root.replaceChildren();
  if (!state.filtered.length) {
    root.innerHTML = `<div class="empty-state"><h2>No workouts found</h2><p>Try widening the duration or stress range, or clear a filter.</p></div>`;
    $("#loadMoreButton").hidden = true;
    return;
  }
  const fragment = document.createDocumentFragment();
  state.filtered.slice(0, state.visible).forEach((workout) => {
    const card = $("#cardTemplate").content.firstElementChild.cloneNode(true);
    card.style.setProperty("--type-color", colors[workout.type] || colors.Unclassified);
    $(".type-pill", card).textContent = workout.type;
    $(".duration", card).textContent = `${minutes(workout.duration)} min`;
    $("h3", card).textContent = workout.name;
    $(".card-metrics", card).innerHTML = metric("TSS", Math.round(workout.tss)) + metric("IF", formatNumber(workout.intensity, 2)) + metric("Level", workout.level ? formatNumber(workout.level, 1) : "—");
    $(".structure", card).textContent = workout.structure;
    const favorite = $(".favorite-button", card);
    favorite.classList.toggle("active", state.favorites.has(workout.id));
    favorite.textContent = state.favorites.has(workout.id) ? "★" : "☆";
    favorite.addEventListener("click", () => toggleFavorite(workout.id));
    $(".inspect-button", card).addEventListener("click", () => openDetail(workout));
    card.addEventListener("dblclick", () => openDetail(workout));
    fragment.append(card);
    requestAnimationFrame(() => drawProfile($(".profile-canvas", card), workout, false));
  });
  root.append(fragment);
  $("#loadMoreButton").hidden = state.visible >= state.filtered.length;
}

function toggleFavorite(id) {
  if (state.favorites.has(id)) state.favorites.delete(id); else state.favorites.add(id);
  localStorage.setItem("workout-favorites", JSON.stringify([...state.favorites]));
  if (state.favoritesOnly) applyFilters(); else renderCards();
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

function drawProfile(canvas, workout, detailed) {
  if (!canvas?.isConnected) return;
  const { context: ctx, width, height } = fitCanvas(canvas);
  const ftp = window.WorkoutSettings?.getFtp();
  const padding = detailed ? { top: 24, right: 54, bottom: 28, left: 46 } : { top: 10, right: 0, bottom: 0, left: 0 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const maxTime = workout.points.at(-1)[0] || 1;
  const maxPower = Math.max(130, ...workout.points.map((point) => point[1])) * 1.05;
  ctx.clearRect(0, 0, width, height);
  if (detailed) {
    ctx.strokeStyle = "rgba(24,35,29,.12)"; ctx.lineWidth = 1; ctx.fillStyle = "#6d756f"; ctx.font = "11px system-ui";
    [50, 100, 150].forEach((power) => {
      if (power > maxPower) return;
      const y = padding.top + plotH - (power / maxPower) * plotH;
      ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(width - padding.right, y); ctx.stroke();
      ctx.textAlign = "left"; ctx.fillText(`${power}%`, 4, y + 4);
      ctx.textAlign = "right"; ctx.fillText(ftp ? `${Math.round(ftp * power / 100)} W` : "— W", width - 4, y + 4);
    });
    ctx.textAlign = "left"; ctx.font = "10px system-ui"; ctx.fillText("% FTP", 4, 11);
    ctx.textAlign = "right"; ctx.fillText(ftp ? `FTP ${ftp} W` : "Set FTP", width - 4, 11);
  }
  ctx.beginPath();
  workout.points.forEach(([time, power], index) => {
    const x = padding.left + (time / maxTime) * plotW;
    const y = padding.top + plotH - (power / maxPower) * plotH;
    if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.lineTo(width - padding.right, padding.top + plotH);
  ctx.lineTo(padding.left, padding.top + plotH);
  ctx.closePath();
  const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + plotH);
  const color = colors[workout.type] || colors.Unclassified;
  gradient.addColorStop(0, color + "cc"); gradient.addColorStop(1, color + "24");
  ctx.fillStyle = gradient; ctx.fill();
  ctx.beginPath();
  workout.points.forEach(([time, power], index) => {
    const x = padding.left + (time / maxTime) * plotW;
    const y = padding.top + plotH - (power / maxPower) * plotH;
    if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color; ctx.lineWidth = detailed ? 2.5 : 1.7; ctx.stroke();
  if (detailed) {
    ctx.fillStyle = "#6d756f"; ctx.textAlign = "center";
    [0, .25, .5, .75, 1].forEach((ratio) => ctx.fillText(`${Math.round(minutes(maxTime) * ratio)}m`, padding.left + plotW * ratio, height - 7));
    canvas._profileGeometry = { padding, plotW, maxTime };
  }
}

function attachProfileHover(canvas, workout, tooltip) {
  const update = (event) => {
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
  };
  canvas.addEventListener("pointermove", update);
  canvas.addEventListener("pointerleave", () => { tooltip.hidden = true; });
}

function createZwo(workout) {
  const blocks = [];
  for (let index = 0; index < workout.points.length - 1; index += 1) {
    const [startTime, startPower] = workout.points[index];
    const [endTime, endPower] = workout.points[index + 1];
    const duration = endTime - startTime;
    if (duration <= 0) continue;
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

function openDetail(workout) {
  state.detailWorkout = workout;
  const color = colors[workout.type] || colors.Unclassified;
  const root = $("#detailContent");
  root.innerHTML = `<div class="detail-inner" style="--type-color:${color}">
    <span class="type-pill">${escapeHtml(workout.type)}</span>
    <h2>${escapeHtml(workout.name)}</h2>
    <p class="detail-subtitle">${escapeHtml(workout.structure)} · Workout ID ${workout.id}</p>
    <p class="practical-summary">${escapeHtml(window.WorkoutSettings.practicalDescription(workout))}</p>
    <div class="profile-detail-wrap"><canvas class="detail-profile"></canvas><div class="profile-tooltip" hidden></div></div>
    <div class="detail-metrics">
      ${metric("Duration", `${minutes(workout.duration)} min`)}
      ${metric("TSS", Math.round(workout.tss))}
      ${metric("Intensity", formatNumber(workout.intensity, 2))}
      ${metric("Avg FTP", `${Math.round(workout.average)}%`)}
      ${metric("Level", workout.level ? formatNumber(workout.level, 1) : "—")}
    </div>
    ${workout.flags.length ? `<div class="flag-list">${workout.flags.map((flag) => `<span>${escapeHtml(flag)}</span>`).join("")}</div>` : ""}
    ${workout.goals ? `<p class="eyebrow">Workout goals</p><p class="detail-copy">${escapeHtml(workout.goals)}</p>` : ""}
    ${workout.description ? `<p class="eyebrow">Description</p><p class="detail-copy">${escapeHtml(workout.description)}</p>` : ""}
    <div class="detail-actions">
      <button class="button ride-now-button" type="button">Ride now</button>
      <button class="button download-button" type="button">Download for Zwift</button>
      <button class="button secondary intervals-upload-button" type="button">Send to Intervals.icu</button>
      <button class="button secondary copy-button" type="button">Copy filename</button>
      <button class="button secondary favorite-detail" type="button">${state.favorites.has(workout.id) ? "★ Favorited" : "☆ Add favorite"}</button>
    </div>
    <p class="zwift-help">Move the downloaded .zwo file to <code>Documents › Zwift › Workouts › your Zwift ID</code>, then restart Zwift.</p>
  </div>`;
  $(".ride-now-button", root).addEventListener("click", () => window.WorkoutRide.launch(workout, createZwo(workout)));
  $(".download-button", root).addEventListener("click", () => downloadZwo(workout));
  $(".intervals-upload-button", root).addEventListener("click", () => window.IntervalsIcu.openWorkout(workout));
  $(".copy-button", root).addEventListener("click", async (event) => {
    const name = `${workout.type} - ${minutes(workout.duration)} minutes - ${workout.id} - ${workout.name}.zwo`;
    await navigator.clipboard.writeText(name);
    event.currentTarget.textContent = "Copied";
  });
  $(".favorite-detail", root).addEventListener("click", (event) => {
    toggleFavorite(workout.id);
    event.currentTarget.textContent = state.favorites.has(workout.id) ? "★ Favorited" : "☆ Add favorite";
  });
  $("#detailDialog").showModal();
  requestAnimationFrame(() => {
    const canvas = $(".detail-profile", root);
    drawProfile(canvas, workout, true);
    attachProfileHover(canvas, workout, $(".profile-tooltip", root));
  });
}

function renderScatter() {
  const canvas = $("#scatterCanvas");
  const { context: ctx, width, height } = fitCanvas(canvas);
  const pad = { left: 52, right: 20, top: 20, bottom: 42 };
  const data = state.filtered;
  const maxDuration = Math.max(60, ...data.map((w) => minutes(w.duration)));
  const maxTss = Math.max(100, ...data.map((w) => w.tss));
  const plotW = width - pad.left - pad.right, plotH = height - pad.top - pad.bottom;
  ctx.clearRect(0, 0, width, height);
  ctx.font = "11px system-ui"; ctx.fillStyle = "#6d756f"; ctx.strokeStyle = "rgba(24,35,29,.12)"; ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i += 1) {
    const x = pad.left + plotW * i / 5, y = pad.top + plotH * i / 5;
    ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top + plotH); ctx.stroke();
    ctx.textAlign = "center"; ctx.fillText(`${Math.round(maxDuration * i / 5)}m`, x, height - 15);
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(width - pad.right, y); ctx.stroke();
    ctx.textAlign = "right"; ctx.fillText(Math.round(maxTss * (1 - i / 5)), pad.left - 8, y + 4);
  }
  state.scatterPoints = data.map((workout) => {
    const x = pad.left + (minutes(workout.duration) / maxDuration) * plotW;
    const y = pad.top + plotH - (workout.tss / maxTss) * plotH;
    return { x, y, workout };
  });
  state.scatterPoints.forEach(({ x, y, workout }) => {
    ctx.beginPath(); ctx.arc(x, y, 3.1, 0, Math.PI * 2);
    ctx.fillStyle = (colors[workout.type] || colors.Unclassified) + "a8"; ctx.fill();
  });
  canvas.onmousemove = (event) => scatterHover(event, canvas);
  canvas.onclick = (event) => {
    const point = nearestScatterPoint(event, canvas, 10);
    if (point) openDetail(point.workout);
  };
  $("#chartLegend").innerHTML = [...new Set(data.map((w) => w.type))].sort().map((type) => `<span class="legend-item" style="--legend:${colors[type] || colors.Unclassified}"><i></i>${escapeHtml(type)}</span>`).join("");
}

function nearestScatterPoint(event, canvas, radius) {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left, y = event.clientY - rect.top;
  let closest = null, distance = radius;
  for (const point of state.scatterPoints || []) {
    const current = Math.hypot(point.x - x, point.y - y);
    if (current < distance) { closest = point; distance = current; }
  }
  return closest;
}

function scatterHover(event, canvas) {
  const point = nearestScatterPoint(event, canvas, 9);
  const tooltip = $("#chartTooltip");
  if (!point) { tooltip.hidden = true; canvas.style.cursor = "default"; return; }
  canvas.style.cursor = "pointer"; tooltip.hidden = false;
  tooltip.innerHTML = `<strong>${escapeHtml(point.workout.name)}</strong><br>${minutes(point.workout.duration)} min · ${Math.round(point.workout.tss)} TSS · ${escapeHtml(point.workout.type)}`;
  const rect = canvas.getBoundingClientRect();
  tooltip.style.left = `${Math.min(rect.width - 225, point.x + 12)}px`;
  tooltip.style.top = `${Math.max(0, point.y - 48)}px`;
}

function render() {
  if (state.view === "list") renderCards(); else requestAnimationFrame(renderScatter);
}

function resetFilters() {
  $("#searchInput").value = "";
  $$("#typeFilters input").forEach((input) => { input.checked = false; });
  $("#durationMin").value = 0; $("#durationMax").value = 360;
  $("#tssMin").value = 0; $("#tssMax").value = 400;
  $("#levelSelect").value = 0; $("#structureSelect").value = ""; $("#hasInstructions").checked = false;
  state.favoritesOnly = false; $("#favoritesButton").setAttribute("aria-pressed", "false");
  applyFilters();
}

function setupFilters() {
  const typeCounts = new Map();
  state.workouts.forEach((w) => typeCounts.set(w.type, (typeCounts.get(w.type) || 0) + 1));
  $("#typeFilters").innerHTML = [...typeCounts.entries()].sort((a, b) => b[1] - a[1]).map(([type, count]) => `<label class="check-row"><input type="checkbox" value="${escapeHtml(type)}"><span>${escapeHtml(type)}</span><small>${count.toLocaleString()}</small></label>`).join("");
  const structures = [...new Set(state.workouts.map((w) => w.structure))].sort();
  $("#structureSelect").insertAdjacentHTML("beforeend", structures.map((value) => `<option>${escapeHtml(value)}</option>`).join(""));
  $$("input, select", $(".filters")).forEach((input) => input.addEventListener("input", applyFilters));
}

async function init() {
  let payload = window.WORKOUT_DATA;
  if (!payload) {
    const response = await fetch("workouts.json");
    if (!response.ok) throw new Error(`Could not load workouts (${response.status})`);
    payload = await response.json();
  }
  state.workouts = payload.workouts;
  setupFilters();
  $("#loading").hidden = true;
  applyFilters();
}

$("#searchInput").addEventListener("input", applyFilters);
$("#sortSelect").addEventListener("change", applyFilters);
$("#resetButton").addEventListener("click", resetFilters);
$("#loadMoreButton").addEventListener("click", () => { state.visible += 48; renderCards(); });
$("#closeDialog").addEventListener("click", () => $("#detailDialog").close());
$("#detailDialog").addEventListener("click", (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
$("#favoritesButton").addEventListener("click", (event) => {
  state.favoritesOnly = !state.favoritesOnly;
  event.currentTarget.setAttribute("aria-pressed", String(state.favoritesOnly));
  applyFilters();
});
$("#randomButton").addEventListener("click", () => {
  const pool = state.filtered.length ? state.filtered : state.workouts;
  if (pool.length) openDetail(pool[Math.floor(Math.random() * pool.length)]);
});
$$('.tab').forEach((tab) => tab.addEventListener("click", () => {
  state.view = tab.dataset.view;
  $$(".tab").forEach((item) => { item.classList.toggle("active", item === tab); item.setAttribute("aria-selected", String(item === tab)); });
  $("#listView").hidden = state.view !== "list";
  $("#mapView").hidden = state.view !== "map";
  render();
}));
document.addEventListener("keydown", (event) => {
  if (event.key === "/" && document.activeElement.tagName !== "INPUT") { event.preventDefault(); $("#searchInput").focus(); }
  if (event.key === "Escape" && $("#detailDialog").open) $("#detailDialog").close();
});
window.addEventListener("resize", () => {
  if (state.view === "map") renderScatter();
  if ($("#detailDialog").open && state.detailWorkout) drawProfile($(".detail-profile", $("#detailContent")), state.detailWorkout, true);
});
window.WorkoutSettings.initFtpControls(() => {
  if ($("#detailDialog").open && state.detailWorkout) drawProfile($(".detail-profile", $("#detailContent")), state.detailWorkout, true);
});
window.IntervalsIcu.init();

init().catch((error) => {
  $("#loading").innerHTML = `<strong>Could not load the workout index.</strong><br>${error.message}`;
});
