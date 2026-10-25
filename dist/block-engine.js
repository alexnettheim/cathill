(function blockEngine(global) {
  "use strict";
  const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const ZONES = { Endurance: [55, 75.999], Tempo: [76, 87.999], "Sweet Spot": [88, 94.999], Threshold: [95, 105.999], "VO2 Max": [106, 120.999], Anaerobic: [121, 150] };
  const PURPOSES = {
    aerobic: { label: "Aerobic Base", qualityTypes: ["Tempo", "Sweet Spot", "Tempo"], baseTiz: [34, 28, 34] },
    sustained: { label: "Sustained Power", qualityTypes: ["Sweet Spot", "Tempo", "Sweet Spot"], baseTiz: [32, 38, 32] },
    threshold: { label: "Threshold Build", qualityTypes: ["Threshold", "VO2 Max", "Threshold"], baseTiz: [26, 16, 26] },
    vo2: { label: "VO2 / Race Build", qualityTypes: ["VO2 Max", "Threshold", "Anaerobic"], baseTiz: [16, 24, 10] },
  };
  const START_FACTORS = { conservative: 0.86, standard: 1, high: 1.14 };
  const TIZ_FACTORS = [1, 1.12, 1.25, 0.55];
  const VOLUME_FACTORS = [1, 1, 1, 0.6];
  const clamp = (min, value, max) => Math.max(min, Math.min(max, value));
  const minutes = (seconds) => Math.round((Number(seconds) || 0) / 60);
  function reconcileSchedule(rideDays, qualityDays, longRideDay) {
    const rides = [...new Set((rideDays || []).map(Number))].filter((day) => day >= 0 && day <= 6).sort((a, b) => a - b);
    let quality = [...new Set((qualityDays || []).map(Number))].filter((day) => rides.includes(day)).sort((a, b) => a - b);
    const qualityLimit = rides.length >= 5 ? 3 : 2;
    quality = quality.slice(0, qualityLimit);
    if (quality.length >= rides.length && quality.length) quality = quality.slice(0, Math.max(0, rides.length - 1));
    const eligibleLongDays = rides.filter((day) => !quality.includes(day));
    let long = Number(longRideDay);
    if (!eligibleLongDays.includes(long)) {
      long = eligibleLongDays.includes(6) ? 6 : eligibleLongDays.includes(5) ? 5 : eligibleLongDays.at(-1);
    }
    return { rideDays: rides, qualityDays: quality, longRideDay: long, qualityLimit, eligibleLongDays };
  }
  function secondsInsideBand(p0, p1, duration, low, high) {
    if (duration <= 0) return 0;
    if (Math.abs(p1 - p0) < 0.00001) return p0 >= low && p0 <= high ? duration : 0;
    const first = (low - p0) / (p1 - p0), second = (high - p0) / (p1 - p0);
    return Math.max(0, Math.min(1, Math.max(first, second)) - Math.max(0, Math.min(first, second))) * duration;
  }
  function workoutTiz(workout, type) {
    const bounds = ZONES[type]; if (!bounds || !workout?.points?.length) return 0;
    let seconds = 0;
    for (let index = 0; index < workout.points.length - 1; index += 1) {
      const [startTime, startPower] = workout.points[index], [endTime, endPower] = workout.points[index + 1];
      seconds += secondsInsideBand(startPower, endPower, endTime - startTime, bounds[0], bounds[1]);
    }
    return seconds / 60;
  }
  function validate(settings) {
    const schedule = reconcileSchedule(settings.rideDays, settings.qualityDays, settings.longRideDay);
    const { rideDays, qualityDays, longRideDay } = schedule;
    if (!PURPOSES[settings.purpose]) throw new Error("Choose a block purpose.");
    if (rideDays.length < 3) throw new Error("Choose at least three riding days.");
    if (!rideDays.includes(longRideDay)) throw new Error("Choose one non-quality riding day as the long ride.");
    if (!qualityDays.length || qualityDays.some((day) => !rideDays.includes(day))) throw new Error("Choose quality days from your riding days.");
    if (qualityDays.includes(longRideDay)) throw new Error("Keep the long ride separate from quality days in this release.");
    if (qualityDays.length > 2 && rideDays.length < 5) throw new Error("Three quality days require at least five riding days.");
    if (qualityDays.length > 3) throw new Error("Choose no more than three quality days.");
    const weeklyHours = Number(settings.weeklyHours);
    if (!Number.isFinite(weeklyHours) || weeklyHours < 3 || weeklyHours > 24) throw new Error("Weekly volume must be between 3 and 24 hours.");
    return { ...settings, rideDays, qualityDays, longRideDay, weeklyHours };
  }
  function score(workout, request, used) {
    const tiz = workoutTiz(workout, request.type), durationDifference = Math.abs(minutes(workout.duration) - request.durationMinutes);
    const tizDifference = request.tizMinutes == null ? 0 : Math.abs(tiz - request.tizMinutes);
    const belowTarget = request.minTiz != null && tiz + 0.5 < request.minTiz ? (request.minTiz - tiz) * 45 : 0;
    return durationDifference * 1.2 + tizDifference * 3 + belowTarget + (used.has(workout.uid || workout.id) ? 90 : 0);
  }
  function pick(workouts, request, used) {
    let candidates = workouts.filter((workout) => workout.type === request.type && workout.duration > 0);
    if (!candidates.length && request.type === "Tempo") candidates = workouts.filter((workout) => workout.type === "Sweet Spot");
    return candidates.map((workout) => ({ workout, score: score(workout, request, used) })).sort((a, b) => a.score - b.score || a.workout.name.localeCompare(b.workout.name))[0]?.workout || null;
  }
  function generate(rawSettings, workouts) {
    const settings = validate(rawSettings), purpose = PURPOSES[settings.purpose], used = new Set(), weeks = [];
    const startFactor = START_FACTORS[settings.startingTiz] || 1;
    for (let weekIndex = 0; weekIndex < 4; weekIndex += 1) {
      const targetTotalMinutes = settings.weeklyHours * 60 * VOLUME_FACTORS[weekIndex];
      const activeQualityDays = weekIndex === 3 ? settings.qualityDays.slice(0, 1) : settings.qualityDays;
      const priorQuality = weeks[weekIndex - 1]?.sessions.filter((session) => session.role === "Quality") || [];
      const average = targetTotalMinutes / settings.rideDays.length;
      const longMinutes = clamp(75, targetTotalMinutes * (settings.rideDays.length <= 3 ? 0.42 : 0.34), 240);
      const qualityMinutes = clamp(45, average, 120), qualityAllocated = qualityMinutes * activeQualityDays.length;
      const ordinaryCount = settings.rideDays.length - activeQualityDays.length - 1;
      const easyMinutes = ordinaryCount > 0 ? clamp(30, (targetTotalMinutes - longMinutes - qualityAllocated) / ordinaryCount, 180) : 0;
      let qualitySlot = 0;
      const sessions = settings.rideDays.map((dayIndex) => {
        const isQuality = activeQualityDays.includes(dayIndex), isLong = dayIndex === settings.longRideDay, slot = qualitySlot;
        const type = isQuality ? purpose.qualityTypes[slot % purpose.qualityTypes.length] : "Endurance";
        if (isQuality) qualitySlot += 1;
        const durationMinutes = isLong ? longMinutes : isQuality ? qualityMinutes : easyMinutes;
        const previous = isQuality ? priorQuality[slot] : null;
        const targetTiz = isQuality ? purpose.baseTiz[slot % purpose.baseTiz.length] * startFactor * TIZ_FACTORS[weekIndex] : null;
        const previousTiz = previous?.workout ? workoutTiz(previous.workout, type) : null;
        const request = { type, durationMinutes, tizMinutes: targetTiz, minTiz: weekIndex > 0 && weekIndex < 3 ? previousTiz + 0.5 : null };
        const workout = pick(workouts, request, used); if (workout) used.add(workout.uid || workout.id);
        return { dayIndex, day: WEEKDAYS[dayIndex], role: isQuality ? "Quality" : isLong ? "Long endurance" : "Endurance", type, request, workout };
      });
      weeks.push({ weekIndex, label: weekIndex === 3 ? "Recovery" : `Load ${weekIndex + 1}`, sessions });
    }
    return { id: `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, version: 2, createdAt: new Date().toISOString(), settings, purposeLabel: purpose.label, weeks };
  }
  function totals(week) {
    const sessions = week?.sessions || [];
    return { minutes: sessions.reduce((sum, session) => sum + (session.workout?.duration || 0) / 60, 0), tss: sessions.reduce((sum, session) => sum + (session.workout?.tss || 0), 0), tiz: sessions.reduce((sum, session) => sum + (session.role === "Quality" ? workoutTiz(session.workout, session.type) : 0), 0) };
  }
  global.WorkoutBlockEngine = { WEEKDAYS, PURPOSES, ZONES, reconcileSchedule, validate, workoutTiz, generate, totals };
}(window));
