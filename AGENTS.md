# CATHILL project instructions

## Purpose

This is the canonical private, local-first cycling app. Its primary product flow
is `Calendar → Ride`; workout discovery and four-week plan building happen inside
Calendar rather than separate product areas.

## Architecture

- `dist/`: the directly served app and independently authored workout dataset.
- `dist/ride/`: generated Auuki trainer build; do not hand-edit generated files.
- `vendor/auuki/`: pinned AGPL-3.0 Auuki fork and CATHILL integration.
- `scripts/build-data.js`: validates and packages a provider-neutral workout library.
- `dist/workout-library.js`: provider-neutral normalization and reference boundary.
- `dist/workout-sources.js`: browser-local custom source import and IndexedDB persistence.
- `dist/block-engine.js`: pure four-week, TiZ-only plan generation.
- `dist/calendar-model.js`: versioned dated events and legacy migration.

CATHILL hands a selected workout to Auuki through the existing same-origin
`localStorage` key `workout-finder:ride-now:v1`. Keep that contract versioned and
covered by `test-ride-handoff.js`.

Canonical calendar state lives at `workout-calendar-v2`. Each dated event carries
a provider-neutral workout reference plus a structural snapshot, so it remains
rideable if the source library changes. The old `workout-blocks-v1` and
`workout-calendar-v1` records are migration inputs only. Planned Ride handoffs
use the event ID as the session identity so FIT activities can mark completion.

Custom workout libraries are separate IndexedDB records. The built-in private
source can be disabled without deleting its bundle. Removing any source must not
remove or invalidate dated event snapshots.

The builder is intentionally non-adaptive. Users choose hours and days. Loading
weeks progress quality work through TiZ only; do not infer readiness, increase
intensity, or introduce history-driven coaching.

## Commands

- Install trainer dependencies: `npm install --prefix vendor/auuki`
- Build trainer: `npm run build:ride`
- Test maintained paths: `npm test`
- Serve locally: `python3 -m http.server 4173 --bind 127.0.0.1 --directory dist`
- Open: `http://localhost:4173/index.html`

## Privacy and publishing

The bundled `open-workouts` provider is independently authored and approved for
public distribution. New sources must normalize through `WorkoutLibrary`; never
add proprietary workout exports or browser-local secrets to the repository.
Public releases deploy the exact tested `dist/` generated from the committed
source and workout library.

## Definition of done

A day can receive a manually selected workout; the builder can preview and apply
a complete block to real dates; events can be inspected, changed, moved, removed,
exported, and sent through `Ride now`; local state can be backed up and restored;
completed Ride activities map back to events. Builds and maintained-path tests
must pass. Physical BLE changes must be verified with real hardware before being
called complete.
