(function () {
  const storageKey = "workout-finder-intervals-api-key-v1";
  const autoUploadStorageKey = "workout-finder:intervals-auto-upload:v1";
  let pending = null;

  const $ = (selector, root = document) => root.querySelector(selector);

  function getApiKey() {
    try { return localStorage.getItem(storageKey) || ""; } catch { return ""; }
  }

  function setApiKey(value, remember) {
    try {
      if (remember) localStorage.setItem(storageKey, value);
      else localStorage.removeItem(storageKey);
    } catch {}
  }

  function getAutoUploadEnabled() {
    try { return localStorage.getItem(autoUploadStorageKey) === "true"; } catch { return false; }
  }

  function setAutoUploadEnabled(enabled) {
    try {
      if (enabled) localStorage.setItem(autoUploadStorageKey, "true");
      else localStorage.removeItem(autoUploadStorageKey);
    } catch {}
  }

  function isoDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function addDays(dateString, days) {
    const date = new Date(`${dateString}T12:00:00`);
    date.setDate(date.getDate() + days);
    return isoDate(date);
  }

  function nextMonday() {
    const date = new Date();
    const days = (8 - date.getDay()) % 7 || 7;
    date.setDate(date.getDate() + days);
    return isoDate(date);
  }

  function durationText(seconds) {
    const rounded = Math.max(1, Math.round(seconds));
    if (rounded % 60 === 0) return `${rounded / 60}m`;
    return `${rounded}s`;
  }

  function workoutDescription(workout) {
    const steps = [];
    for (let index = 0; index < workout.points.length - 1; index += 1) {
      const [startTime, startPower] = workout.points[index];
      const [endTime, endPower] = workout.points[index + 1];
      const duration = endTime - startTime;
      if (duration <= 0) continue;
      const target = Math.abs(startPower - endPower) < 0.01
        ? `${Math.round(startPower)}%`
        : `${Math.round(Math.min(startPower, endPower))}-${Math.round(Math.max(startPower, endPower))}%`;
      steps.push(`- ${durationText(duration)} ${target}`);
    }
    const intro = workout.description?.replace(/\s+/g, " ").trim().slice(0, 320) || `${workout.type} cycling workout.`;
    return `${intro}\n\n${steps.join("\n")}`;
  }

  function eventForWorkout(workout, date, externalId) {
    return {
      category: "WORKOUT",
      type: "Ride",
      name: workout.name,
      start_date_local: `${date}T00:00:00`,
      description: workoutDescription(workout),
      external_id: externalId,
    };
  }

  function blockEvents(block, startDate) {
    return block.weeks.flatMap((week) => week.sessions.filter((session) => session.workout).map((session) => {
      const date = addDays(startDate, week.weekIndex * 7 + session.dayIndex);
      return eventForWorkout(session.workout, date, `workout-finder-${block.id || "draft"}-${week.weekIndex}-${session.dayIndex}`);
    }));
  }

  async function upload(events, apiKey) {
    const credentials = btoa(`API_KEY:${apiKey}`);
    const response = await fetch("https://intervals.icu/api/v1/athlete/0/events/bulk?upsert=true", {
      method: "POST",
      headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" },
      body: JSON.stringify(events),
    });
    if (!response.ok) {
      let detail = "";
      try { detail = (await response.text()).slice(0, 240); } catch {}
      throw new Error(response.status === 401 ? "That API key was not accepted." : `Intervals.icu returned ${response.status}${detail ? `: ${detail}` : "."}`);
    }
    return response.json().catch(() => []);
  }

  function open(job) {
    pending = job;
    const dialog = $("#intervalsDialog");
    $("#intervalsTitle").textContent = job.kind === "block" ? "Send block to Intervals.icu" : "Send workout to Intervals.icu";
    $("#intervalsCopy").textContent = job.kind === "block"
      ? "Choose the Monday for week one. All scheduled rides will be added to your Intervals.icu calendar."
      : "Choose the day for this workout. It will be added directly to your Intervals.icu calendar.";
    $("#intervalsDateLabel").firstChild.textContent = job.kind === "block" ? "Week-one Monday " : "Workout date ";
    $("#intervalsDate").value = job.kind === "block" ? nextMonday() : isoDate(new Date());
    $("#intervalsApiKey").value = getApiKey();
    $("#rememberIntervalsKey").checked = Boolean(getApiKey());
    $("#autoUploadIntervals").checked = getAutoUploadEnabled();
    $("#intervalsStatus").textContent = "";
    $("#sendIntervalsButton").disabled = false;
    $("#sendIntervalsButton").textContent = job.kind === "block" ? "Send block" : "Send workout";
    dialog.showModal();
  }

  function openWorkout(workout) {
    open({ kind: "workout", workout });
  }

  function openBlock(block) {
    open({ kind: "block", block });
  }

  async function sendPending() {
    if (!pending) return;
    const apiKey = $("#intervalsApiKey").value.trim();
    const date = $("#intervalsDate").value;
    const status = $("#intervalsStatus");
    if (!apiKey || !date) {
      status.textContent = "Add your API key and choose a date.";
      status.dataset.state = "error";
      return;
    }
    if ($("#autoUploadIntervals").checked && !$("#rememberIntervalsKey").checked) {
      status.textContent = "Remember the API key to enable automatic ride uploads.";
      status.dataset.state = "error";
      return;
    }
    const button = $("#sendIntervalsButton");
    button.disabled = true; button.textContent = "Sending…";
    status.textContent = "Connecting to Intervals.icu…"; status.dataset.state = "working";
    try {
      const events = pending.kind === "block"
        ? blockEvents(pending.block, date)
        : [eventForWorkout(pending.workout, date, `workout-finder-${pending.workout.id}-${date}`)];
      await upload(events, apiKey);
      setApiKey(apiKey, $("#rememberIntervalsKey").checked);
      setAutoUploadEnabled($("#autoUploadIntervals").checked);
      status.textContent = `${events.length} ${events.length === 1 ? "workout" : "workouts"} sent. Garmin and Zwift will receive them if their planned-workout sync is enabled in Intervals.icu.`;
      status.dataset.state = "success";
      button.textContent = "Sent";
    } catch (error) {
      status.textContent = error.message || "The upload could not be completed.";
      status.dataset.state = "error";
      button.disabled = false; button.textContent = pending.kind === "block" ? "Try again" : "Try again";
    }
  }

  function init() {
    const dialog = $("#intervalsDialog");
    if (!dialog) return;
    $("#sendIntervalsButton").addEventListener("click", sendPending);
    $("#closeIntervalsDialog").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  }

  window.IntervalsIcu = { init, openWorkout, openBlock, workoutDescription, eventForWorkout, blockEvents, getAutoUploadEnabled, setAutoUploadEnabled };
})();
