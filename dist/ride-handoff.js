(function rideHandoff(global) {
  "use strict";

  const STORAGE_KEY = "workout-finder:ride-now:v1";

  function createPayload(workout, zwo, plan = null) {
    if (!workout || workout.id === undefined || !workout.name || typeof zwo !== "string" || !zwo.includes("<workout_file>")) {
      throw new Error("This workout could not be prepared for the trainer.");
    }
    const ftp = Number(global.WorkoutSettings?.getFtp?.());
    const payload = {
      version: 1,
      workoutId: String(workout.id),
      workoutName: String(workout.name),
      zwo,
      ftp: Number.isInteger(ftp) && ftp >= 50 && ftp <= 600 ? ftp : null,
      createdAt: new Date().toISOString(),
      returnUrl: "../index.html",
    };
    if (plan && plan.blockId && plan.sessionKey && /^\d{4}-\d{2}-\d{2}$/.test(plan.scheduledDate || "")) {
      payload.plan = {
        blockId: String(plan.blockId),
        sessionKey: String(plan.sessionKey),
        scheduledDate: plan.scheduledDate,
      };
      payload.returnUrl = "../index.html";
    }
    return payload;
  }

  function launch(workout, zwo, plan = null) {
    const payload = createPayload(workout, zwo, plan);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    global.location.assign(`ride/index.html?source=workout-finder&workout=${encodeURIComponent(payload.workoutId)}`);
  }

  global.WorkoutRide = { STORAGE_KEY, createPayload, launch };
}(window));
