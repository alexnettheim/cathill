(function workoutSources(global) {
  "use strict";

  const DATABASE = "workout-finder-libraries";
  const STORE = "libraries";
  const BUILTIN_KEY = "cathill:builtin-library-enabled:v1";

  function builtinEnabled() { return global.localStorage?.getItem(BUILTIN_KEY) !== "false"; }
  function setBuiltinEnabled(enabled) { global.localStorage?.setItem(BUILTIN_KEY, enabled ? "true" : "false"); }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!global.indexedDB) return reject(new Error("This browser cannot store custom workout libraries."));
      const request = global.indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath:"id" });
      request.onerror = () => reject(request.error || new Error("Could not open workout library storage."));
      request.onsuccess = () => resolve(request.result);
    });
  }

  async function withStore(mode, action) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, mode), store = transaction.objectStore(STORE);
      let result;
      try { result = action(store); } catch (error) { database.close(); reject(error); return; }
      transaction.oncomplete = () => { database.close(); resolve(result?.result); };
      transaction.onerror = () => { database.close(); reject(transaction.error || new Error("Could not update workout libraries.")); };
    });
  }

  async function list() { return (await withStore("readonly", (store) => store.getAll())) || []; }
  async function save(library) { await withStore("readwrite", (store) => store.put(library)); return library; }
  async function remove(id) { await withStore("readwrite", (store) => store.delete(id)); }
  async function replaceAll(libraries) {
    await withStore("readwrite", (store) => { store.clear(); (libraries || []).forEach((library) => store.put(library)); });
  }
  async function load() { return { builtinEnabled:builtinEnabled(), customLibraries:await list() }; }

  function pointsToPercent(points) {
    const cleaned = (points || []).filter((point) => Array.isArray(point) && point.length >= 2).map((point) => [Number(point[0]), Number(point[1])]).filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
    const fractional = cleaned.length && Math.max(...cleaned.map((point) => Math.abs(point[1]))) <= 3;
    return cleaned.map(([seconds, power]) => [Math.max(0, seconds), Math.max(0, fractional ? power * 100 : power)]).sort((a,b) => a[0] - b[0]);
  }

  function estimatedMetrics(points, duration) {
    if (!points.length || !duration) return { intensity:0, tss:0, average:0 };
    let weighted = 0;
    for (let index = 0; index < points.length - 1; index += 1) weighted += Math.max(0, points[index + 1][0] - points[index][0]) * points[index][1];
    const average = weighted / duration, intensity = average / 100;
    return { average, intensity, tss:duration / 3600 * intensity * intensity * 100 };
  }

  function cleanWorkout(raw, index) {
    if (!raw || !raw.name) return null;
    const points = pointsToPercent(raw.points);
    const duration = Math.max(0, Number(raw.duration) || points.at(-1)?.[0] || 0);
    if (!duration || points.length < 2) return null;
    const metrics = estimatedMetrics(points, duration);
    return {
      id:String(raw.id ?? index + 1), name:String(raw.name), type:String(raw.type || "Unclassified"), duration,
      tss:Math.max(0, Number(raw.tss) || metrics.tss), intensity:Math.max(0, Number(raw.intensity) || metrics.intensity),
      average:Math.max(0, Number(raw.average) || metrics.average), level:Math.max(0, Number(raw.level) || 0),
      structure:String(raw.structure || "Custom"), description:String(raw.description || ""), goals:String(raw.goals || ""),
      flags:Array.isArray(raw.flags) ? raw.flags.map(String) : [], points,
    };
  }

  function parseJson(text) {
    const parsed = JSON.parse(text), records = Array.isArray(parsed) ? parsed : parsed?.workouts;
    if (!Array.isArray(records)) throw new Error("JSON must be an array of workouts or an object with a workouts array.");
    const workouts = records.map(cleanWorkout).filter(Boolean);
    if (!workouts.length) throw new Error("No valid workouts were found. Each workout needs a name and at least two timed power points.");
    return { name:String(parsed?.name || "Imported JSON library"), workouts };
  }

  function addPoint(points, time, power) {
    const value = Math.max(0, Number(power) * 100);
    if (!points.length || points.at(-1)[0] !== time || points.at(-1)[1] !== value) points.push([time, value]);
  }
  function parseZwo(text, fallbackName = "Imported workout") {
    const xml = new global.DOMParser().parseFromString(text, "application/xml");
    if (xml.querySelector("parsererror")) throw new Error(`${fallbackName} is not a valid ZWO file.`);
    const root = xml.querySelector("workout_file"), workoutRoot = root?.querySelector("workout");
    if (!root || !workoutRoot) throw new Error(`${fallbackName} does not contain a ZWO workout.`);
    const points = []; let elapsed = 0;
    const steady = (duration, power) => { addPoint(points, elapsed, power); elapsed += duration; addPoint(points, elapsed, power); };
    const ramp = (duration, low, high) => { addPoint(points, elapsed, low); elapsed += duration; addPoint(points, elapsed, high); };
    [...workoutRoot.children].forEach((node) => {
      const value = (name, fallback = 0) => Number(node.getAttribute(name) ?? fallback);
      if (node.tagName === "IntervalsT") {
        const repeat=value("Repeat",1),on=value("OnDuration"),off=value("OffDuration"),onPower=value("OnPower"),offPower=value("OffPower");
        for(let index=0;index<repeat;index+=1){steady(on,onPower);steady(off,offPower);}
      } else if (node.tagName === "Warmup" || node.tagName === "Cooldown" || node.tagName === "Ramp") ramp(value("Duration"),value("PowerLow"),value("PowerHigh"));
      else if (node.tagName === "SteadyState") steady(value("Duration"),value("Power"));
      else if (node.tagName === "FreeRide") steady(value("Duration"),value("FlatRoad",.5));
    });
    if (!elapsed || points.length < 2) throw new Error(`${fallbackName} has no supported workout intervals.`);
    const name=root.querySelector("name")?.textContent?.trim() || fallbackName, description=root.querySelector("description")?.textContent?.trim() || "";
    const maximum=Math.max(...points.map((point)=>point[1])),type=maximum>=120?"Anaerobic":maximum>=106?"VO2 Max":maximum>=96?"Threshold":maximum>=88?"Sweet Spot":maximum>=76?"Tempo":"Endurance";
    return cleanWorkout({ name, type, duration:elapsed, structure:"ZWO import", description, points }, 0);
  }

  function createLibrary(name, workouts) {
    const id = global.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const provider = `user-library-${id}`;
    const cleaned = (workouts || []).map(cleanWorkout).filter(Boolean);
    if (!cleaned.length) throw new Error("No valid workouts were found in those files.");
    return { id, name:String(name || "Custom library").trim() || "Custom library", provider, createdAt:new Date().toISOString(), workouts:cleaned.map((workout,index)=>({ ...workout, provider, providerId:String(workout.id ?? index + 1) })) };
  }

  global.WorkoutSources = { builtinEnabled, setBuiltinEnabled, load, list, save, remove, replaceAll, parseJson, parseZwo, createLibrary };
}(window));
