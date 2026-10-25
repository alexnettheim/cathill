# Product decisions

## 2026-10-23 — One canonical local-first app

The existing `work/sites/workout-finder` remains canonical. Auuki is vendored
inside it rather than maintained as a sibling app or iframe. The trainer is
built to `/ride`, so Browse, Plan, Ride, and browser-local History share an
origin and storage boundary.

## 2026-10-23 — Versioned ZWO handoff

`Ride now` serializes the selected workout as ZWO into the versioned
`workout-finder:ride-now:v1` localStorage contract. Auuki parses this at startup
and selects it as the active workout. This reuses an established interchange
format and keeps the coupling to the provider-neutral workout schema small.

## 2026-10-24 — Public static distribution

The public build bundles only the independently authored `open-workouts` library.
Plans, FTP, imported libraries, API keys, and ride history remain browser-local.
Production uses HTTPS so the browser can expose Web Bluetooth where supported.

## 2026-10-23 — Reviewable Auuki fork

Auuki is pinned to a known commit with its AGPL license intact. Changes are
limited to the handoff, status/return UI, and build target. This preserves a
clear path for reviewing future upstream updates.

## 2026-10-23 — Workout Finder FTP wins at ride launch

The Ride-now payload includes the currently saved Workout Finder FTP. A valid
value is applied and persisted in Auuki before the selected workout is restored,
so its ERG targets and displayed watts use the same FTP as the workout preview.
Auuki can still edit FTP locally, but the next Ride-now launch deliberately
reconciles it back to Workout Finder's saved value.

## 2026-10-23 — Reskin through an isolated override

The trainer appearance lives in `src/css/workout-finder.css`, loaded after
Auuki's stylesheet. BLE, timing, storage, and workout behavior stay upstream;
the product skin can be revised or removed without editing those systems.

## 2026-10-23 — Local-first Intervals.icu activity sync

Automatic completed-ride upload is explicit opt-in and reuses the personal API
key already stored by Workout Finder's calendar export. Ride persists the FIT
record to IndexedDB before attempting the direct browser-to-Intervals.icu
request. Network or authentication failures mark the History item as failed but
never remove its local FIT, and the History action is the manual retry path.
The fork does not depend on Auuki's hosted account or proxy for this integration.

## 2026-10-23 — Dated events are the canonical plan

Calendar stores independent versioned event records rather than a reference to
one active block. Generated events retain plan identity, while moving or replacing
one marks it user-modified. Rebuilding replaces future generated events but keeps
completed, historical, manual, and user-modified entries. A one-time migration
converts the previous active block into event snapshots.

## 2026-10-23 — Workout providers are replaceable

Application features consume normalized workout records with a provider reference
and stable snapshot. The bundled records use `open-workouts`. Calendar, block
generation, export, and Ride do not depend on provider-specific numeric IDs, so
other open or user-imported libraries can be added without changing the product.

## 2026-10-24 — Workout libraries are local, separate sources

Custom JSON and ZWO libraries are stored as independent IndexedDB records, while
the bundled Open Workouts source has a reversible enabled flag. Search and
block building use only active sources. Removing a source never alters dated
calendar events because those events retain structural workout snapshots. Local
backups include the source configuration and custom library records.

## 2026-10-23 — Builder progresses TiZ, not the athlete

The builder is a deterministic planning aid, not adaptive coaching. Users select
purpose, weekly hours, riding days, quality days, long-ride day, and starting TiZ.
Loading-week volume stays approximately stable and quality sessions progress only
through target-zone time. No ride-history inference, automatic intensity increase,
or readiness adjustment is performed.

## 2026-10-23 — Calendar and Ride are the product navigation

Workout discovery and block building are actions inside the five-week Calendar.
The primary navigation contains only Calendar and Ride. Old Calendar and Block
Builder URLs redirect to the canonical Calendar so bookmarks continue to work
without maintaining parallel products. Palette 1 (Graphite/Electric Blue) and
palette 5 (Arctic/Cobalt) are the dark and light themes.

## 2026-10-24 — CATHILL is the product brand

Calendar and the vendored Ride experience share the CATHILL wordmark, app icon,
browser metadata, and semantic color system. Compatibility-sensitive storage
keys, backup formats, provider identifiers, and the generated `/ride` boundary
retain their existing names so the visual rebrand does not invalidate local data
or integrations. Ride remains an attributed Auuki fork under AGPL-3.0.
