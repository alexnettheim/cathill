(function () {
  const storageKey = "workout-finder-ftp-v1";

  function getFtp() {
    try {
      const value = Number(localStorage.getItem(storageKey));
      return Number.isFinite(value) && value >= 50 && value <= 600 ? Math.round(value) : null;
    } catch {
      return null;
    }
  }

  function setFtp(value) {
    const ftp = Math.round(Number(value));
    if (!Number.isFinite(ftp) || ftp < 50 || ftp > 600) return false;
    try { localStorage.setItem(storageKey, String(ftp)); } catch { return false; }
    return true;
  }

  function updateButton() {
    const button = document.querySelector("#ftpButton");
    if (!button) return;
    const ftp = getFtp();
    button.textContent = ftp ? `FTP ${ftp} W` : "Set FTP";
  }

  function formatElapsed(seconds) {
    const total = Math.max(0, Math.round(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const remainder = total % 60;
    return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}` : `${minutes}:${String(remainder).padStart(2, "0")}`;
  }

  function formatDuration(seconds) {
    const total = Math.max(0, Math.round(seconds));
    const minutes = Math.floor(total / 60);
    const remainder = total % 60;
    if (minutes && !remainder) return `${minutes} min`;
    if (minutes) return `${minutes} min ${remainder} sec`;
    return `${remainder} sec`;
  }

  function profileAt(workout, seconds) {
    const points = workout?.points || [];
    if (!points.length) return null;
    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index], end = points[index + 1];
      if (seconds <= end[0]) {
        const duration = Math.max(1, end[0] - start[0]);
        const ratio = Math.max(0, Math.min(1, (seconds - start[0]) / duration));
        return {
          percent: start[1] + (end[1] - start[1]) * ratio,
          startSeconds: start[0], endSeconds: end[0],
          startPercent: start[1], endPercent: end[1],
        };
      }
    }
    const last = points.at(-1);
    return { percent: last[1], startSeconds: last[0], endSeconds: last[0], startPercent: last[1], endPercent: last[1] };
  }

  function averageTargetPercent(workout) {
    const points = workout?.points || [];
    let area = 0, coveredSeconds = 0;
    for (let index = 0; index < points.length - 1; index += 1) {
      const [startTime, startPower] = points[index], [endTime, endPower] = points[index + 1];
      const duration = Math.max(0, Number(endTime) - Number(startTime));
      if (!duration) continue;
      area += duration * (Number(startPower) + Number(endPower)) / 2;
      coveredSeconds += duration;
    }
    return coveredSeconds ? area / coveredSeconds : Math.max(0, Number(workout?.intensity) || 0) * 100;
  }

  function practicalDescription(workout, typeOverride) {
    const type = typeOverride || workout.type;
    const structure = workout.structure && workout.structure !== "Unclassified" ? workout.structure : null;
    const lead = structure ? `${structure} format` : `${type} work`;
    let prescription = String(workout.description || "")
      .split(/\n\s*\n/)[0]
      .replace(/\s+/g, " ")
      .trim();

    const name = String(workout.name || "").trim();
    const removablePrefixes = [" is made up of ", " is comprised of ", " consists of ", " is "];
    for (const suffix of removablePrefixes) {
      const prefix = `${name}${suffix}`;
      if (name && prescription.toLowerCase().startsWith(prefix.toLowerCase())) {
        prescription = prescription.slice(prefix.length);
        break;
      }
    }

    if (prescription) {
      prescription = prescription.charAt(0).toUpperCase() + prescription.slice(1);
      if (!/[.!?]$/.test(prescription)) prescription += ".";
      return `${lead}. ${prescription}`;
    }

    const duration = Number(workout.duration) || 0;
    const average = Math.round(averageTargetPercent(workout));
    const durationText = duration ? formatDuration(duration) : "Structured riding";
    return `${lead}. ${durationText} with an average target of ${average}% FTP.`;
  }

  function initFtpControls(onChange) {
    const button = document.querySelector("#ftpButton");
    const dialog = document.querySelector("#ftpDialog");
    const input = document.querySelector("#ftpInput");
    const save = document.querySelector("#saveFtpButton");
    const close = document.querySelector("#closeFtpDialog");
    const error = document.querySelector("#ftpError");
    if (!button || !dialog || !input || !save) return;
    updateButton();
    button.addEventListener("click", () => {
      input.value = getFtp() || "";
      error.textContent = "";
      dialog.showModal();
      setTimeout(() => input.focus(), 0);
    });
    save.addEventListener("click", () => {
      if (!setFtp(input.value)) {
        error.textContent = "Enter an FTP between 50 and 600 watts.";
        return;
      }
      error.textContent = "";
      updateButton();
      dialog.close();
      if (typeof onChange === "function") onChange(getFtp());
    });
    input.addEventListener("keydown", (event) => { if (event.key === "Enter") save.click(); });
    close?.addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  }

  window.WorkoutSettings = { getFtp, setFtp, initFtpControls, updateButton, formatElapsed, formatDuration, profileAt, averageTargetPercent, practicalDescription };
})();
