const API_KEY_STORAGE_KEY = 'workout-finder-intervals-api-key-v1';
const AUTO_UPLOAD_STORAGE_KEY = 'workout-finder:intervals-auto-upload:v1';
const ACTIVITY_UPLOAD_URL = 'https://intervals.icu/api/v1/athlete/0/activities';

function readStorage(key) {
    try {
        return localStorage.getItem(key) ?? '';
    } catch(_) {
        return '';
    }
}

function writeStorage(key, value) {
    try {
        if(value) localStorage.setItem(key, value);
        else localStorage.removeItem(key);
        return true;
    } catch(_) {
        return false;
    }
}

function getApiKey() {
    return readStorage(API_KEY_STORAGE_KEY).trim();
}

function isAutoUploadEnabled() {
    return readStorage(AUTO_UPLOAD_STORAGE_KEY) === 'true';
}

function setAutoUploadEnabled(enabled) {
    return writeStorage(AUTO_UPLOAD_STORAGE_KEY, enabled ? 'true' : '');
}

function safeFileName(name = 'workout') {
    const clean = String(name)
        .normalize('NFKD')
        .replace(/[^a-zA-Z0-9 _-]/g, '')
        .trim()
        .replace(/\s+/g, '-');
    return `${clean || 'workout'}.fit`;
}

function basicAuthorization(apiKey) {
    return `Basic ${btoa(`API_KEY:${apiKey}`)}`;
}

function activityUrl(record) {
    const params = new URLSearchParams({
        name: record.summary?.name || 'CATHILL ride',
        description: 'Recorded locally in CATHILL Ride',
        external_id: `workout-finder-${record.id}`,
    });
    return `${ACTIVITY_UPLOAD_URL}?${params.toString()}`;
}

async function uploadActivity(record, {apiKey = getApiKey(), fetchImpl = fetch} = {}) {
    if(!apiKey) {
        const error = new Error('Save an Intervals.icu API key in CATHILL first.');
        error.code = 'missing_api_key';
        throw error;
    }
    if(!record?.blob || !record?.id) {
        throw new Error('The saved FIT activity could not be found.');
    }

    const body = new FormData();
    body.append('file', record.blob, safeFileName(record.summary?.name));
    const response = await fetchImpl(activityUrl(record), {
        method: 'POST',
        headers: {Authorization: basicAuthorization(apiKey)},
        body,
    });

    if(!response.ok) {
        let detail = '';
        try { detail = (await response.text()).trim().slice(0, 240); } catch(_) {}
        const message = response.status === 401
            ? 'The saved Intervals.icu API key was not accepted.'
            : `Intervals.icu upload failed (${response.status})${detail ? `: ${detail}` : '.'}`;
        throw new Error(message);
    }

    const text = await response.text().catch(() => '');
    try { return text ? JSON.parse(text) : {}; } catch(_) { return {response: text}; }
}

function showRideSyncStatus(message, state = 'working') {
    const status = document.querySelector('#ride-sync-status');
    if(!status) return;
    status.hidden = false;
    status.dataset.state = state;
    status.textContent = message;
    if(state !== 'working') {
        window.clearTimeout(showRideSyncStatus.timeout);
        showRideSyncStatus.timeout = window.setTimeout(() => { status.hidden = true; }, 8000);
    }
}

function updateSettingsMessage() {
    const message = document.querySelector('#intervals-auto-upload-message');
    if(!message) return;
    const enabled = isAutoUploadEnabled();
    const hasKey = Boolean(getApiKey());
    message.dataset.state = enabled && hasKey ? 'success' : 'idle';
    message.textContent = hasKey
        ? (enabled ? 'On. Completed rides save locally first, then upload as FIT.' : 'API key saved. Automatic upload is off.')
        : 'Save an API key from a CATHILL “Send to Intervals.icu” dialog first.';
}

function initIntervalsAutoUploadSettings({promptForApiKey = () => window.prompt('Enter your Intervals.icu personal API key:')} = {}) {
    const checkbox = document.querySelector('#intervals-auto-upload-enabled');
    if(!checkbox) return;
    checkbox.checked = isAutoUploadEnabled() && Boolean(getApiKey());
    if(isAutoUploadEnabled() && !getApiKey()) setAutoUploadEnabled(false);
    updateSettingsMessage();
    checkbox.addEventListener('change', () => {
        if(checkbox.checked && !getApiKey()) {
            const apiKey = String(promptForApiKey() || '').trim();
            if(apiKey) writeStorage(API_KEY_STORAGE_KEY, apiKey);
            else {
                checkbox.checked = false;
                setAutoUploadEnabled(false);
            }
        } else {
            setAutoUploadEnabled(checkbox.checked);
        }
        if(checkbox.checked && getApiKey()) setAutoUploadEnabled(true);
        updateSettingsMessage();
    });
    window.addEventListener('storage', () => {
        checkbox.checked = isAutoUploadEnabled() && Boolean(getApiKey());
        updateSettingsMessage();
    });
}

export {
    API_KEY_STORAGE_KEY,
    AUTO_UPLOAD_STORAGE_KEY,
    getApiKey,
    isAutoUploadEnabled,
    setAutoUploadEnabled,
    uploadActivity,
    showRideSyncStatus,
    initIntervalsAutoUploadSettings,
    safeFileName,
};
