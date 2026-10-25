/** @jest-environment jsdom */

import {
    API_KEY_STORAGE_KEY,
    AUTO_UPLOAD_STORAGE_KEY,
    getApiKey,
    isAutoUploadEnabled,
    setAutoUploadEnabled,
    uploadActivity,
    initIntervalsAutoUploadSettings,
} from '../../src/integration/intervals-auto-upload.js';

describe('Intervals.icu automatic activity upload', () => {
    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = '';
    });

    test('is opt-in and keeps its preference separate from the API key', () => {
        expect(isAutoUploadEnabled()).toBe(false);
        localStorage.setItem(API_KEY_STORAGE_KEY, 'secret-key');
        setAutoUploadEnabled(true);
        expect(getApiKey()).toBe('secret-key');
        expect(localStorage.getItem(AUTO_UPLOAD_STORAGE_KEY)).toBe('true');
    });

    test('uploads a saved FIT blob directly with personal API-key auth', async () => {
        const fetchImpl = jest.fn(async () => ({
            ok: true,
            status: 200,
            text: async () => '{"id":"i123"}',
        }));
        const record = {
            id: 'activity-123',
            blob: new Blob(['fit-data'], {type: 'application/octet-stream'}),
            summary: {name: 'Threshold / 60'},
        };

        await expect(uploadActivity(record, {apiKey: 'abc123', fetchImpl}))
            .resolves.toEqual({id: 'i123'});

        const [url, request] = fetchImpl.mock.calls[0];
        expect(url).toContain('/api/v1/athlete/0/activities?');
        expect(url).toContain('external_id=workout-finder-activity-123');
        expect(request.method).toBe('POST');
        expect(request.headers.Authorization).toBe(`Basic ${btoa('API_KEY:abc123')}`);
        expect(request.body.get('file')).toBeInstanceOf(Blob);
    });

    test('does not attempt a network request without a saved key', async () => {
        const fetchImpl = jest.fn();
        const record = {id: 'activity-123', blob: new Blob(['fit']), summary: {name: 'Ride'}};
        await expect(uploadActivity(record, {apiKey: '', fetchImpl}))
            .rejects.toThrow('Save an Intervals.icu API key');
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test('will not enable the setting until an API key is saved', () => {
        document.body.innerHTML = `
            <input id="intervals-auto-upload-enabled" type="checkbox">
            <p id="intervals-auto-upload-message"></p>`;
        initIntervalsAutoUploadSettings({promptForApiKey: () => null});
        const checkbox = document.querySelector('#intervals-auto-upload-enabled');
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change'));
        expect(checkbox.checked).toBe(false);
        expect(isAutoUploadEnabled()).toBe(false);
        expect(document.querySelector('#intervals-auto-upload-message').textContent)
            .toContain('Save an API key');
    });

    test('prompts for and saves an API key when automatic upload is enabled', () => {
        document.body.innerHTML = `
            <input id="intervals-auto-upload-enabled" type="checkbox">
            <p id="intervals-auto-upload-message"></p>`;
        const promptForApiKey = jest.fn(() => 'new-key');
        initIntervalsAutoUploadSettings({promptForApiKey});
        const checkbox = document.querySelector('#intervals-auto-upload-enabled');
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change'));
        expect(promptForApiKey).toHaveBeenCalledTimes(1);
        expect(getApiKey()).toBe('new-key');
        expect(isAutoUploadEnabled()).toBe(true);
        expect(document.querySelector('#intervals-auto-upload-message').textContent).toContain('On.');
    });
});
