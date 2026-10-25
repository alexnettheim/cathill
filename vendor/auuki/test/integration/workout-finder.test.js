/** @jest-environment jsdom */

import {
    applyWorkoutFinderHandoff,
    loadWorkoutFinderHandoff,
    STORAGE_KEY,
} from '../../src/integration/workout-finder.js';

describe('Workout Finder handoff', () => {
    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = `
            <aside id="workout-finder-handoff" hidden>
                <a id="workout-finder-return" href="#">return</a>
                <span id="workout-finder-handoff-status"></span>
            </aside>`;
    });

    test('parses and selects a valid ZWO payload', () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            version: 1,
            workoutId: '317960',
            workoutName: 'Starlight -1',
            ftp: 267,
            plan: {blockId: 'block-1', sessionKey: 'w0s0', scheduledDate: '2026-10-23'},
            zwo: '<workout_file><workout><SteadyState Duration="60" Power="0.5"/></workout></workout_file>',
        }));
        const parsed = { meta: { name: 'original' }, intervals: [{ duration: 60 }] };
        const parse = jest.fn(() => parsed);

        const handoff = loadWorkoutFinderHandoff({ workout: { parse } });

        expect(parse).toHaveBeenCalledTimes(1);
        expect(handoff.workout.id).toBe('workout-finder-317960');
        expect(handoff.workout.meta.name).toBe('Starlight -1');
        expect(handoff.workout.meta.source).toBe('CATHILL');
        expect(handoff.workout.meta.plan).toEqual({blockId: 'block-1', sessionKey: 'w0s0', scheduledDate: '2026-10-23'});
        expect(handoff.ftp).toBe(267);
        expect(document.querySelector('#workout-finder-handoff').hidden).toBe(false);
        expect(document.querySelector('#workout-finder-handoff-status').textContent).toContain('FTP 267 W');

        const db = { workout: null, ftp: 200 };
        const models = {
            workout: { set: jest.fn((value) => value) },
            ftp: { set: jest.fn((value) => value), backup: jest.fn() },
        };
        expect(applyWorkoutFinderHandoff(handoff, models, db)).toBe(true);
        expect(db.workout.meta.name).toBe('Starlight -1');
        expect(db.ftp).toBe(267);
        expect(models.ftp.backup).toHaveBeenCalledWith(267);
    });

    test('shows a recoverable error for a broken payload', () => {
        localStorage.setItem(STORAGE_KEY, '{"version":1}');
        expect(loadWorkoutFinderHandoff({ workout: { parse: jest.fn() } })).toBeNull();
        expect(document.querySelector('#workout-finder-handoff').dataset.status).toBe('error');
    });
});
