const STORAGE_KEY = 'workout-finder:ride-now:v1';

document.querySelector('#workout-finder-return')?.addEventListener('click', (event) => {
    event.preventDefault();
    let returnUrl = '../index.html';
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        if(saved.returnUrl === '../index.html') returnUrl = saved.returnUrl;
    } catch(_) {}
    window.location.assign(returnUrl);
});

function showHandoffStatus(kind, message) {
    const banner = document.querySelector('#workout-finder-handoff');
    const status = document.querySelector('#workout-finder-handoff-status');
    if(!banner || !status) return;
    banner.hidden = false;
    banner.dataset.status = kind;
    status.textContent = message;
}

function readHandoff() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return null;

    const payload = JSON.parse(raw);
    if(payload.version !== 1 || !payload.workoutId || !payload.workoutName ||
       typeof payload.zwo !== 'string' || !payload.zwo.includes('<workout_file>')) {
        throw new Error('The selected workout handoff is incomplete.');
    }
    return payload;
}

function loadWorkoutFinderHandoff(models) {
    let payload;
    try {
        payload = readHandoff();
        if(!payload) return null;

        const workout = models.workout.parse(payload.zwo);
        if(!workout?.intervals?.length) {
            throw new Error('The selected workout contains no rideable intervals.');
        }
        workout.id = `workout-finder-${payload.workoutId}`;
        workout.meta.name = payload.workoutName;
        workout.meta.source = 'CATHILL';
        workout.meta.plan = payload.plan ?? null;
        const ftp = Number(payload.ftp);
        const validFtp = Number.isInteger(ftp) && ftp >= 50 && ftp <= 500 ? ftp : null;
        showHandoffStatus(
            'ready',
            `${payload.workoutName} is loaded${validFtp ? ` at FTP ${validFtp} W` : ''} and ready to ride.`
        );
        return { workout, ftp: validFtp };
    } catch(error) {
        console.error('CATHILL handoff failed:', error);
        showHandoffStatus('error', `${error.message} Return to CATHILL and choose it again.`);
        return null;
    }
}

function applyWorkoutFinderHandoff(handoff, models, db) {
    if(!handoff) return false;
    db.workout = models.workout.set(handoff.workout);
    if(handoff.ftp) {
        db.ftp = models.ftp.set(handoff.ftp);
        models.ftp.backup(db.ftp);
    }
    return true;
}

export { STORAGE_KEY, readHandoff, loadWorkoutFinderHandoff, applyWorkoutFinderHandoff };
