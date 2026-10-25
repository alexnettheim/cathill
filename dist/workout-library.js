(function workoutLibrary(global) {
  "use strict";
  const BUILTIN_PROVIDER = "open-workouts";
  function clonePoints(points) {
    return Array.isArray(points) ? points.filter((point) => Array.isArray(point) && point.length >= 2).map((point) => [Number(point[0]) || 0, Number(point[1]) || 0]) : [];
  }
  function normalize(raw, provider = BUILTIN_PROVIDER) {
    if (!raw || raw.id == null || !raw.name) return null;
    const resolvedProvider = raw.provider || provider;
    const providerId = String(raw.providerId ?? raw.legacyId ?? raw.id);
    const uid = raw.uid || `${resolvedProvider}:${providerId}`;
    return {
      uid, id: uid, legacyId: raw.legacyId ?? raw.id, provider: resolvedProvider, providerId,
      name: String(raw.name), type: String(raw.type || "Unclassified"), duration: Math.max(0, Number(raw.duration) || 0),
      tss: Math.max(0, Number(raw.tss) || 0), intensity: Math.max(0, Number(raw.intensity) || 0), average: Math.max(0, Number(raw.average) || 0),
      level: Math.max(0, Number(raw.level) || 0), structure: String(raw.structure || "Unclassified"), description: String(raw.description || ""),
      goals: String(raw.goals || ""), flags: Array.isArray(raw.flags) ? raw.flags.map(String) : [], points: clonePoints(raw.points),
    };
  }
  function snapshot(workout) {
    const normalized = normalize(workout, workout?.provider || BUILTIN_PROVIDER);
    return normalized ? { ...normalized, points: clonePoints(normalized.points), flags: [...normalized.flags] } : null;
  }
  function reference(workout) {
    return workout ? { provider: workout.provider || BUILTIN_PROVIDER, id: String(workout.providerId ?? workout.legacyId ?? workout.id) } : null;
  }
  function create(rawWorkouts) {
    const workouts = (rawWorkouts || []).map((item) => normalize(item)).filter(Boolean);
    const byUid = new Map(), aliases = new Map();
    workouts.forEach((workout) => {
      byUid.set(workout.uid, workout); aliases.set(String(workout.legacyId), workout); aliases.set(workout.providerId, workout); aliases.set(workout.uid, workout);
    });
    return {
      workouts,
      resolve(ref, fallback = null) {
        if (typeof ref === "string" || typeof ref === "number") return aliases.get(String(ref)) || normalize(fallback, fallback?.provider) || null;
        if (ref?.provider && ref?.id != null) return byUid.get(`${ref.provider}:${ref.id}`) || normalize(fallback, fallback?.provider) || null;
        return normalize(fallback, fallback?.provider) || null;
      },
      reference, snapshot,
    };
  }
  global.WorkoutLibrary = { BUILTIN_PROVIDER, normalize, snapshot, reference, create };
}(window));
